//! Algorithmes de tramage (dithering) pour la gravure d'images.
//!
//! Entrée : niveaux de gris (0 = noir). Sortie : 0 = brûler, 255 = ne rien
//! faire, sauf en mode `Grayscale` où la valeur est conservée et modulera la
//! puissance.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DitherMode {
    Threshold,
    Ordered,
    FloydSteinberg,
    Jarvis,
    Stucki,
    Atkinson,
    Halftone,
    Grayscale,
    /// Trame de lignes parallèles dont l'épaisseur suit la densité (journal).
    Newsprint,
    /// Contours : seuls les bords nets (et les zones très sombres) sont gravés.
    Sketch,
}

/// Paramètres de la demi-teinte : cellule en pixels, angle de trame en degrés.
#[derive(Debug, Clone, Copy)]
pub struct Screen {
    pub cell: f64,
    pub angle: f64,
}

impl Default for Screen {
    fn default() -> Self {
        Screen { cell: 6.0, angle: 45.0 }
    }
}

/// Noyau de diffusion d'erreur : (dx, dy, poids), plus le diviseur.
type Kernel = (&'static [(i32, i32, i32)], i32);

const FLOYD: Kernel = (&[(1, 0, 7), (-1, 1, 3), (0, 1, 5), (1, 1, 1)], 16);
const JARVIS: Kernel = (
    &[
        (1, 0, 7), (2, 0, 5),
        (-2, 1, 3), (-1, 1, 5), (0, 1, 7), (1, 1, 5), (2, 1, 3),
        (-2, 2, 1), (-1, 2, 3), (0, 2, 5), (1, 2, 3), (2, 2, 1),
    ],
    48,
);
const STUCKI: Kernel = (
    &[
        (1, 0, 8), (2, 0, 4),
        (-2, 1, 2), (-1, 1, 4), (0, 1, 8), (1, 1, 4), (2, 1, 2),
        (-2, 2, 1), (-1, 2, 2), (0, 2, 4), (1, 2, 2), (2, 2, 1),
    ],
    42,
);
// Atkinson ne diffuse que 6/8 de l'erreur, ce qui préserve le contraste.
const ATKINSON: Kernel = (
    &[(1, 0, 1), (2, 0, 1), (-1, 1, 1), (0, 1, 1), (1, 1, 1), (0, 2, 1)],
    8,
);

#[cfg(test)]
pub fn dither(gray: &[u8], width: usize, height: usize, mode: DitherMode, threshold: u8) -> Vec<u8> {
    dither_with(gray, width, height, mode, threshold, Screen::default())
}

pub fn dither_with(gray: &[u8], width: usize, height: usize, mode: DitherMode, threshold: u8, screen: Screen) -> Vec<u8> {
    assert_eq!(gray.len(), width * height, "taille d'image incohérente");
    match mode {
        DitherMode::Halftone => halftone(gray, width, screen),
        DitherMode::Grayscale => gray.to_vec(),
        DitherMode::Threshold => gray.iter().map(|&g| if g < threshold { 0 } else { 255 }).collect(),
        DitherMode::Ordered => ordered(gray, width),
        DitherMode::FloydSteinberg => diffuse(gray, width, height, FLOYD),
        DitherMode::Jarvis => diffuse(gray, width, height, JARVIS),
        DitherMode::Stucki => diffuse(gray, width, height, STUCKI),
        DitherMode::Atkinson => diffuse(gray, width, height, ATKINSON),
        DitherMode::Newsprint => newsprint(gray, width, screen),
        DitherMode::Sketch => sketch(gray, width, height, threshold),
    }
}

/// Trame de lignes : la largeur de chaque ligne (période `cell`, angle `angle`) suit la densité.
fn newsprint(gray: &[u8], width: usize, screen: Screen) -> Vec<u8> {
    let cell = screen.cell.max(2.0);
    let (sin, cos) = screen.angle.to_radians().sin_cos();
    gray.iter()
        .enumerate()
        .map(|(i, &g)| {
            let (x, y) = ((i % width) as f64 + 0.5, (i / width) as f64 + 0.5);
            let v = (-x * sin + y * cos) / cell;
            let d = (v - v.floor() - 0.5).abs(); // 0 au milieu de la ligne, 0,5 entre deux lignes
            let density = 1.0 - g as f64 / 255.0;
            if d < density / 2.0 { 0 } else { 255 }
        })
        .collect()
}

/// Croquis : gradient de Sobel ; un bord plus marqué que le seuil (ou un pixel presque noir) est gravé.
fn sketch(gray: &[u8], width: usize, height: usize, threshold: u8) -> Vec<u8> {
    let at = |x: i64, y: i64| gray[(y.clamp(0, height as i64 - 1) as usize) * width + x.clamp(0, width as i64 - 1) as usize] as f64;
    // Plus le seuil est haut, plus les bords faibles sont gardés.
    let edge = 255.0 - threshold as f64;
    (0..gray.len())
        .map(|i| {
            let (x, y) = ((i % width) as i64, (i / width) as i64);
            let gx = at(x + 1, y - 1) + 2.0 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2.0 * at(x - 1, y) - at(x - 1, y + 1);
            let gy = at(x - 1, y + 1) + 2.0 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2.0 * at(x, y - 1) - at(x + 1, y - 1);
            let magnitude = (gx * gx + gy * gy).sqrt() / 4.0;
            if magnitude > edge || gray[i] < 24 { 0 } else { 255 }
        })
        .collect()
}

fn ordered(gray: &[u8], width: usize) -> Vec<u8> {
    // Matrice de Bayer 8x8.
    const B: [[u8; 8]; 8] = [
        [0, 32, 8, 40, 2, 34, 10, 42],
        [48, 16, 56, 24, 50, 18, 58, 26],
        [12, 44, 4, 36, 14, 46, 6, 38],
        [60, 28, 52, 20, 62, 30, 54, 22],
        [3, 35, 11, 43, 1, 33, 9, 41],
        [51, 19, 59, 27, 49, 17, 57, 25],
        [15, 47, 7, 39, 13, 45, 5, 37],
        [63, 31, 55, 23, 61, 29, 53, 21],
    ];
    gray.iter()
        .enumerate()
        .map(|(i, &g)| {
            let (x, y) = (i % width, i / width);
            let t = (B[y % 8][x % 8] as u32 * 4 + 2) as u8;
            if g < t { 0 } else { 255 }
        })
        .collect()
}

/// Trame d'imprimerie : des points ronds dont l'aire suit la densité, sur une grille tournée.
fn halftone(gray: &[u8], width: usize, screen: Screen) -> Vec<u8> {
    let cell = screen.cell.max(2.0);
    let (sin, cos) = screen.angle.to_radians().sin_cos();
    gray.iter()
        .enumerate()
        .map(|(i, &g)| {
            let (x, y) = ((i % width) as f64 + 0.5, (i / width) as f64 + 0.5);
            // Coordonnées dans la trame, ramenées au centre de la cellule.
            let u = (x * cos + y * sin) / cell;
            let v = (-x * sin + y * cos) / cell;
            let (du, dv) = (u - u.floor() - 0.5, v - v.floor() - 0.5);
            let d = (du * du + dv * dv).sqrt(); // 0 au centre, ≈ 0,707 au coin
            // Aire du disque = densité : rayon = √(densité/π) en unités de cellule.
            let density = 1.0 - g as f64 / 255.0;
            if d < (density / std::f64::consts::PI).sqrt() { 0 } else { 255 }
        })
        .collect()
}

fn diffuse(gray: &[u8], width: usize, height: usize, (kernel, div): Kernel) -> Vec<u8> {
    let mut buf: Vec<i32> = gray.iter().map(|&g| g as i32).collect();
    let mut out = vec![255u8; gray.len()];
    for y in 0..height {
        for x in 0..width {
            let i = y * width + x;
            let old = buf[i];
            let new = if old < 128 { 0 } else { 255 };
            out[i] = new as u8;
            let err = old - new;
            for &(dx, dy, w) in kernel {
                let (nx, ny) = (x as i32 + dx, y as i32 + dy);
                if nx >= 0 && (nx as usize) < width && (ny as usize) < height {
                    buf[ny as usize * width + nx as usize] += err * w / div;
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mean(v: &[u8]) -> f64 {
        v.iter().map(|&x| x as f64).sum::<f64>() / v.len() as f64
    }

    #[test]
    fn diffusion_preserves_average_tone() {
        let gray = vec![128u8; 64 * 64];
        for mode in [DitherMode::FloydSteinberg, DitherMode::Jarvis, DitherMode::Stucki, DitherMode::Ordered] {
            let out = dither(&gray, 64, 64, mode, 128);
            assert!(out.iter().all(|&v| v == 0 || v == 255));
            let m = mean(&out);
            assert!((m - 128.0).abs() < 12.0, "{mode:?}: moyenne {m}");
        }
    }

    #[test]
    fn halftone_tone_follows_density() {
        for g in [64u8, 128, 192] {
            let gray = vec![g; 120 * 120];
            let out = dither_with(&gray, 120, 120, DitherMode::Halftone, 128, Screen { cell: 8.0, angle: 45.0 });
            let m = mean(&out);
            assert!((m - g as f64).abs() < 25.0, "gris {g} → {m}");
        }
    }

    #[test]
    fn threshold_and_extremes() {
        let gray = vec![0, 100, 200, 255];
        assert_eq!(dither(&gray, 4, 1, DitherMode::Threshold, 128), vec![0, 0, 255, 255]);
        let black = vec![0u8; 16];
        assert!(dither(&black, 4, 4, DitherMode::Atkinson, 128).iter().all(|&v| v == 0));
    }

    #[test]
    fn newsprint_and_sketch() {
        // Dégradé : plus de lignes gravées à gauche (sombre) qu'à droite.
        let (w, h) = (64, 64);
        let gray: Vec<u8> = (0..w * h).map(|i| ((i % w) * 255 / (w - 1)) as u8).collect();
        let n = dither_with(&gray, w, h, DitherMode::Newsprint, 128, Screen { cell: 6.0, angle: 0.0 });
        let burnt = |range: std::ops::Range<usize>| (0..h).flat_map(|y| range.clone().map(move |x| y * w + x)).filter(|&i| n[i] == 0).count();
        assert!(burnt(0..16) > burnt(48..64));
        // Croquis : un carré noir sur fond blanc ne garde que ses bords et son intérieur noir.
        let mut sq = vec![255u8; w * h];
        for y in 20..40 {
            for x in 20..40 {
                sq[y * w + x] = 120;
            }
        }
        let s = dither_with(&sq, w, h, DitherMode::Sketch, 128, Screen::default());
        assert_eq!(s[30 * w + 30], 255, "intérieur gris uniforme non gravé");
        assert_eq!(s[30 * w + 20], 0, "bord gravé");
        assert_eq!(s[5 * w + 5], 255, "fond non gravé");
    }
}
