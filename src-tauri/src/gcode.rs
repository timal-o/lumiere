//! Génération de G-code GRBL à partir d'un [`Job`].

use serde::Serialize;

use crate::dither::{dither_with, DitherMode, Screen};
use crate::job::{Direction, Job, JobImage, JobLayer, LaserMode, LayerMode, MachineSettings, Optimize, Polyline, Side};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerStat {
    pub name: String,
    pub seconds: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub lines: usize,
    pub estimated_seconds: f64,
    /// Durée estimée de chaque calque (sous-calques compris), dans l'ordre de gravure.
    pub layers: Vec<LayerStat>,
    pub cut_length: f64,
    pub travel_length: f64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GcodeResult {
    pub gcode: String,
    pub stats: Stats,
}

type Pt = [f64; 2];

fn dist(a: Pt, b: Pt) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt()
}

fn num(v: f64) -> String {
    let s = format!("{v:.3}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" || s.is_empty() { "0".into() } else { s.into() }
}

/// Mouvement retenu pour l'estimation de durée : direction unitaire, longueur, vitesse (mm/s).
struct Move {
    dir: Pt,
    len: f64,
    speed: f64,
}

/// Déviation de jonction de GRBL (mm), qui fixe la vitesse de passage des angles.
const JUNCTION_DEVIATION: f64 = 0.01;

/**
 * Durée d'une suite de mouvements avec accélération, à la manière du planificateur de
 * GRBL : vitesses de jonction, passes arrière et avant, profils trapézoïdaux.
 */
fn planned_seconds(moves: &[Move], accel: f64) -> f64 {
    let n = moves.len();
    if n == 0 {
        return 0.0;
    }
    // Vitesse maximale à l'entrée de chaque mouvement (arrêt au départ).
    let mut entry = vec![0.0; n + 1];
    for i in 1..n {
        let (a, b) = (moves[i - 1].dir, moves[i].dir);
        let cos = -(a[0] * b[0] + a[1] * b[1]); // angle entre la direction entrante inversée et la sortante
        let v = if cos <= -0.999999 {
            f64::INFINITY // ligne droite
        } else if cos >= 0.999999 {
            0.0 // demi-tour
        } else {
            let sin_half = ((1.0 - cos) / 2.0).sqrt();
            (accel * JUNCTION_DEVIATION * sin_half / (1.0 - sin_half)).sqrt()
        };
        entry[i] = v.min(moves[i - 1].speed).min(moves[i].speed);
    }
    entry[n] = 0.0; // arrêt à la fin
    // Passe arrière : on doit pouvoir freiner avant chaque jonction.
    for i in (0..n).rev() {
        entry[i] = entry[i].min((entry[i + 1] * entry[i + 1] + 2.0 * accel * moves[i].len).sqrt());
    }
    // Passe avant : on ne peut pas accélérer plus vite que permis.
    for i in 0..n {
        entry[i + 1] = entry[i + 1].min((entry[i] * entry[i] + 2.0 * accel * moves[i].len).sqrt());
    }
    let mut t = 0.0;
    for i in 0..n {
        let (v0, v1, v, d) = (entry[i], entry[i + 1], moves[i].speed, moves[i].len);
        let peak = v.min(((2.0 * accel * d + v0 * v0 + v1 * v1) / 2.0).sqrt()).max(v0.max(v1));
        let d_acc = (peak * peak - v0 * v0) / (2.0 * accel);
        let d_dec = (peak * peak - v1 * v1) / (2.0 * accel);
        let cruise = (d - d_acc - d_dec).max(0.0);
        t += (peak - v0) / accel + (peak - v1) / accel + if peak > 0.0 { cruise / peak } else { 0.0 };
    }
    t
}

struct Writer<'a> {
    m: &'a MachineSettings,
    moves: Vec<Move>,
    out: String,
    lines: usize,
    pos: Pt,
    feed: Option<f64>,
    s: Option<f64>,
    seconds: f64,
    dwells: f64,
    cut: f64,
    travel: f64,
    /// Assistance d'air seulement pendant la découpe : allumée avant chaque trait, coupée aux déplacements.
    air_switch: bool,
    air_now: bool,
    /// Dernier sens de déplacement par axe (jeu mécanique).
    dir: [std::cell::Cell<f64>; 2],
}

impl<'a> Writer<'a> {
    fn new(m: &'a MachineSettings) -> Self {
        // La tête démarre à l'origine machine ; to_machine étant une
        // involution, elle sert aussi à repasser du repère machine au plateau.
        let pos = m.to_machine([0.0, 0.0]);
        Writer { m, moves: Vec::new(), out: String::new(), lines: 0, pos, feed: None, s: None, seconds: 0.0, dwells: 0.0, cut: 0.0, travel: 0.0, air_switch: false, air_now: false, dir: [std::cell::Cell::new(0.0), std::cell::Cell::new(0.0)] }
    }

    fn raw(&mut self, line: &str) {
        self.out.push_str(line);
        self.out.push('\n');
        if !line.starts_with(';') {
            self.lines += 1;
        }
    }

    fn xy(&self, p: Pt) -> String {
        let [mut x, mut y] = self.m.to_machine(p);
        // Jeu mécanique : la consigne dépasse d'un demi-jeu dans le sens du mouvement.
        let [px, py] = self.m.to_machine(self.pos);
        for (v, prev, b, dir) in [(&mut x, px, self.m.backlash_x, &self.dir[0]), (&mut y, py, self.m.backlash_y, &self.dir[1])] {
            if b > 0.0 {
                let d = *v - prev;
                if d.abs() > 1e-9 {
                    dir.set(d.signum());
                }
                *v += dir.get() * b / 2.0;
            }
        }
        if self.m.swap_xy {
            std::mem::swap(&mut x, &mut y);
        }
        format!("X{} {}{}", num(x), self.m.y_letter, num(y))
    }

    fn travel_to(&mut self, p: Pt) {
        let d = dist(self.pos, p);
        if d < 1e-4 {
            return;
        }
        if self.air_switch && self.air_now {
            let off = self.m.air_off.clone();
            self.raw(&off);
            self.air_now = false;
        }
        let line = format!("G0 {}", self.xy(p));
        self.raw(&line);
        self.travel += d;
        self.seconds += d / self.m.travel_speed.max(1.0) * 60.0;
        self.record(p, d, self.m.travel_speed);
        self.pos = p;
    }

    /// Déplacement en G1 ; `s = 0` déplace laser éteint à vitesse de travail.
    fn cut_to(&mut self, p: Pt, feed: f64, s: f64) {
        let d = dist(self.pos, p);
        if d < 1e-4 {
            return;
        }
        if self.air_switch && !self.air_now && s > 0.0 {
            let on = self.m.air_on.clone();
            self.raw(&on);
            self.air_now = true;
        }
        let mut line = format!("G1 {}", self.xy(p));
        if self.feed != Some(feed) {
            line += &format!(" F{}", num(feed));
            self.feed = Some(feed);
        }
        let s = s.round();
        if self.s != Some(s) || self.m.emit_s_always {
            line += &format!(" S{}", num(s));
            self.s = Some(s);
        }
        self.raw(&line);
        if s > 0.0 {
            self.cut += d;
        }
        self.seconds += d / feed.max(1.0) * 60.0;
        self.record(p, d, feed);
        self.pos = p;
    }

    fn record(&mut self, p: Pt, d: f64, feed: f64) {
        self.moves.push(Move { dir: [(p[0] - self.pos[0]) / d, (p[1] - self.pos[1]) / d], len: d, speed: feed.max(1.0) / 60.0 });
    }

    /// Temps passé en dehors des mouvements (temporisations du mode points).
    fn dwell(&mut self, seconds: f64) {
        self.seconds += seconds;
        self.dwells += seconds;
    }
}

/// Déplacement Z vers `z` (mm), dans le sens et le mode (absolu ou relatif) de la machine.
fn z_move(w: &mut Writer, z_now: &mut f64, z: f64) {
    let k = if w.m.z_reverse { -1.0 } else { 1.0 };
    if w.m.z_relative {
        let dz = (z - *z_now) * k;
        if dz.abs() > 1e-9 {
            w.raw(&format!("G91 G0 Z{}", num(dz)));
            w.raw("G90");
        }
    } else {
        w.raw(&format!("G0 Z{}", num((z + w.m.z_focus_offset) * k)));
    }
    *z_now = z;
}

fn laser_on(m: &MachineSettings) -> &'static str {
    match m.laser_mode {
        LaserMode::Constant => "M3 S0",
        LaserMode::Dynamic => "M4 S0",
    }
}

/// Allumage du calque : M3 si la puissance constante est demandée, sinon celui de la machine.
fn layer_laser_on(m: &MachineSettings, layer: &JobLayer) -> &'static str {
    if layer.constant_power {
        "M3 S0"
    } else {
        laser_on(m)
    }
}

pub fn generate(job: &Job) -> GcodeResult {
    let m = &job.machine;
    let mut w = Writer::new(m);
    let mut warnings = Vec::new();

    w.raw("; Généré par Lumière");
    w.raw("G90");
    w.raw("G21");
    w.raw(laser_on(m));
    w.s = Some(0.0);
    for line in m.start_gcode.lines().map(str::trim).filter(|l| !l.is_empty()) {
        w.raw(line);
    }
    if m.start_delay > 0.0 {
        w.raw(&format!("G4 P{}", num(m.start_delay)));
        w.dwell(m.start_delay);
    }
    // Position Z courante (pour les déplacements relatifs).
    let mut z_now = 0.0;

    let mut layer_stats: Vec<(String, usize, usize, f64)> = Vec::new(); // nom, mouvements [début, fin), temps simple
    let repeat = job.repeat.max(1);
    for (cycle, layer) in (0..repeat).flat_map(|c| job.layers.iter().map(move |l| (c, l))) {
        if repeat > 1 && std::ptr::eq(layer, &job.layers[0]) {
            w.raw(&format!("; Répétition {}/{}", cycle + 1, repeat));
        }
        let (first_move, start_seconds) = (w.moves.len(), w.seconds);
        let s_max = layer.power.clamp(0.0, 100.0) / 100.0 * m.s_max;
        if s_max <= 0.0 {
            warnings.push(format!("Calque « {} » : puissance nulle, ignoré.", layer.name));
            continue;
        }
        w.raw(&format!("; Calque {}", layer.name));
        if layer.air_assist && layer.air_cut_only {
            w.air_switch = true;
        } else if layer.air_assist {
            w.raw(&m.air_on);
        }
        let switch_mode = layer.constant_power && m.laser_mode == LaserMode::Dynamic;
        if switch_mode {
            w.raw("M3 S0");
            w.s = Some(0.0);
        }
        let use_z = m.z_axis && (layer.z_offset != 0.0 || layer.z_step != 0.0);
        for pass in 0..layer.passes.max(1) {
            if layer.passes > 1 {
                w.raw(&format!("; Passe {}/{}", pass + 1, layer.passes));
            }
            if use_z {
                z_move(&mut w, &mut z_now, layer.z_offset - pass as f64 * layer.z_step);
            }
            match layer.mode {
                LayerMode::Line => emit_lines(&mut w, layer, s_max),
                LayerMode::Fill => emit_fill(&mut w, layer, s_max, &mut warnings, pass),
                LayerMode::Image => {
                    for img in &layer.images {
                        if layer.image_slices > 1 {
                            emit_sliced(&mut w, layer, img, s_max);
                        } else {
                            emit_image(&mut w, layer, img, s_max);
                        }
                    }
                }
            }
        }
        if use_z {
            z_move(&mut w, &mut z_now, 0.0);
        }
        if switch_mode {
            w.raw(laser_on(m));
            w.s = Some(0.0);
        }
        if layer.air_assist && (!w.air_switch || w.air_now) {
            w.raw(&m.air_off);
        }
        w.air_switch = false;
        w.air_now = false;
        layer_stats.push((layer.name.clone(), first_move, w.moves.len(), w.seconds - start_seconds));
    }

    for line in m.end_gcode.lines().map(str::trim).filter(|l| !l.is_empty()) {
        w.raw(line);
    }
    w.raw("M5");
    if let Some(p) = m.finish {
        // Coordonnées machine (G53) : indépendant de l'origine utilisateur.
        w.raw(&format!("G53 G0 X{} Y{}", num(p[0]), num(p[1])));
        let target = m.to_machine(p);
        let d = dist(w.pos, target);
        w.seconds += d / m.travel_speed.max(1.0) * 60.0;
        if d > 1e-4 {
            w.record(target, d, m.travel_speed);
        }
    } else if m.return_to_origin {
        w.raw("G0 X0 Y0");
        let home = m.to_machine([0.0, 0.0]);
        let d = dist(w.pos, home);
        w.seconds += d / m.travel_speed.max(1.0) * 60.0;
        if d > 1e-4 {
            w.record(home, d, m.travel_speed);
        }
    }
    if m.acceleration > 0.0 {
        w.seconds = planned_seconds(&w.moves, m.acceleration) + w.dwells;
    }
    let layers = layer_stats
        .into_iter()
        .map(|(name, a, b, naive)| LayerStat {
            name,
            seconds: if m.acceleration > 0.0 { planned_seconds(&w.moves[a..b], m.acceleration) } else { naive },
        })
        .collect();

    GcodeResult {
        stats: Stats {
            lines: w.lines,
            estimated_seconds: w.seconds,
            layers,
            cut_length: w.cut,
            travel_length: w.travel,
            warnings,
        },
        gcode: w.out,
    }
}

// ---------------------------------------------------------------- Lignes

fn point_in_polygon(p: Pt, poly: &[Pt]) -> bool {
    let mut inside = false;
    let n = poly.len();
    for i in 0..n {
        let (a, b) = (poly[i], poly[(i + n - 1) % n]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0] {
            inside = !inside;
        }
    }
    inside
}

/// Sommets d'angle (changement de direction de plus de 30°) d'un contour fermé.
fn corner_vertices(pts: &[Pt]) -> Vec<usize> {
    let n = pts.len();
    (0..n)
        .filter(|&k| {
            let (a, b, c) = (pts[(k + n - 1) % n], pts[k], pts[(k + 1) % n]);
            let (u, v) = ([b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]);
            let (lu, lv) = ((u[0] * u[0] + u[1] * u[1]).sqrt(), (v[0] * v[0] + v[1] * v[1]).sqrt());
            lu > 1e-9 && lv > 1e-9 && (u[0] * v[0] + u[1] * v[1]) / (lu * lv) < 30f64.to_radians().cos()
        })
        .collect()
}

/// Ordonne les tracés : les formes intérieures d'abord (pour que la pièce ne bouge pas
/// avant que ses trous soient découpés), puis selon l'optimisation : direction, plus
/// proche voisin ou ordre du dessin ; point de départ et sens choisis au plus près.
/// Tracé ordonné : points, fermé, attaches manuelles, forme intérieure.
type Ordered = (Vec<Pt>, bool, Vec<Pt>, bool);

fn order_paths(paths: &[Polyline], start: Pt, inner_first: bool, keep_start: bool, opt: &Optimize, need_inner: bool) -> Vec<Ordered> {
    let paths: Vec<&Polyline> = paths.iter().filter(|p| p.points.len() >= 2).collect();
    // Profondeur d'imbrication : nombre de contours fermés qui contiennent le tracé.
    let nesting: Vec<usize> = if !inner_first && !need_inner {
        vec![0; paths.len()]
    } else {
        paths
            .iter()
            .enumerate()
            .map(|(i, p)| {
                paths
                    .iter()
                    .enumerate()
                    .filter(|(j, q)| *j != i && q.closed && q.points.len() >= 3 && point_in_polygon(p.points[0], &q.points))
                    .count()
            })
            .collect()
    };
    let emit = |p: &Polyline, k: usize, rev: bool, depth: usize| {
        let mut pts: Vec<Pt> = if p.closed {
            let mut v: Vec<Pt> = p.points[k..].iter().chain(p.points[..k].iter()).copied().collect();
            v.push(v[0]);
            v
        } else {
            p.points.clone()
        };
        if rev {
            pts.reverse();
        }
        (pts, p.closed, p.tabs.clone(), depth > 0)
    };
    // Sans optimisation : l'ordre et les points de départ du dessin.
    if !opt.reorder {
        return paths.iter().zip(&nesting).map(|(p, &d)| emit(p, 0, false, d)).collect();
    }
    let depth: Vec<usize> = if inner_first { nesting.clone() } else { vec![0; paths.len()] };
    // Points de départ possibles de chaque tracé : (sommet, inversé).
    let starts = |p: &Polyline| -> Vec<(usize, bool)> {
        if p.closed {
            if keep_start || !opt.best_start {
                return vec![(0, false)];
            }
            let corners = if opt.corners { corner_vertices(&p.points) } else { Vec::new() };
            if !corners.is_empty() {
                return corners.into_iter().map(|k| (k, false)).collect();
            }
            (0..p.points.len()).map(|k| (k, false)).collect()
        } else if opt.best_direction {
            vec![(0, false), (p.points.len() - 1, true)]
        } else {
            vec![(0, false)]
        }
    };
    // Rang dans la direction choisie (plus petit = découpé d'abord).
    let rank = |p: &Polyline, side: Side| -> f64 {
        let xs = p.points.iter().map(|q| q[0]);
        let ys = p.points.iter().map(|q| q[1]);
        match side {
            Side::Left => xs.fold(f64::INFINITY, f64::min),
            Side::Right => -xs.fold(f64::NEG_INFINITY, f64::max),
            Side::Top => ys.fold(f64::INFINITY, f64::min),
            Side::Bottom => -ys.fold(f64::NEG_INFINITY, f64::max),
        }
    };

    let mut remaining: Vec<usize> = (0..paths.len()).collect();
    remaining.sort_by_key(|&i| std::cmp::Reverse(depth[i]));
    let mut pos = start;
    let mut out = Vec::with_capacity(paths.len());
    while !remaining.is_empty() {
        let level = depth[remaining[0]];
        let level_items: Vec<usize> = (0..remaining.len()).filter(|&ri| depth[remaining[ri]] == level).collect();
        // Choix du tracé suivant.
        let chosen: Vec<usize> = match opt.direction_order {
            Some(side) => {
                let best = level_items.iter().copied().min_by(|&a, &b| rank(paths[remaining[a]], side).total_cmp(&rank(paths[remaining[b]], side)));
                best.into_iter().collect()
            }
            None if opt.reduce_travel => level_items,
            None => level_items.iter().copied().min_by_key(|&ri| remaining[ri]).into_iter().collect(),
        };
        // Meilleur point de départ parmi les tracés retenus.
        let mut best: Option<(usize, usize, bool, f64)> = None;
        for ri in chosen {
            for (k, rev) in starts(paths[remaining[ri]]) {
                let d = dist(pos, paths[remaining[ri]].points[k]);
                if best.map_or(true, |b| d < b.3) {
                    best = Some((ri, k, rev, d));
                }
            }
        }
        let (ri, k, rev, _) = best.expect("au moins un candidat");
        let pi = remaining.remove(ri);
        let item = emit(paths[pi], k, rev, nesting[pi]);
        pos = *item.0.last().unwrap();
        out.push(item);
    }
    out
}

/// Abscisse curviligne du point du tracé le plus proche de `q`.
fn arc_position(pts: &[Pt], q: Pt) -> f64 {
    let (mut best, mut best_d, mut walked) = (0.0, f64::INFINITY, 0.0);
    for seg in pts.windows(2) {
        let (a, b) = (seg[0], seg[1]);
        let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
        let l2 = dx * dx + dy * dy;
        let t = if l2 > 0.0 { (((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
        let d = dist(q, [a[0] + t * dx, a[1] + t * dy]);
        if d < best_d {
            best_d = d;
            best = walked + t * l2.sqrt();
        }
        walked += l2.sqrt();
    }
    best
}

/// Intervalles (abscisse curviligne) où le laser reste éteint : attaches et perforation.
/// Interruptions d'un tracé : (début, fin, attache). Les attaches peuvent être découpées
/// à puissance réduite ; les vides de perforation sont toujours laser éteint.
fn gaps(layer: &JobLayer, length: f64, closed: bool, pts: &[Pt], manual: &[Pt], inner: bool) -> Vec<(f64, f64, bool)> {
    let mut g = Vec::new();
    let size = if layer.tab_size > 0.0 { layer.tab_size } else { 0.5 };
    for &q in manual {
        let c = arc_position(pts, q);
        g.push((c - size / 2.0, c + size / 2.0, true));
        // Sur un contour fermé, une attache à cheval sur le point de départ déborde de l'autre côté.
        if closed && c - size / 2.0 < 0.0 {
            g.push((length + c - size / 2.0, length, true));
        }
        if closed && c + size / 2.0 > length {
            g.push((0.0, c + size / 2.0 - length, true));
        }
    }
    // Attaches automatiques, sauf sur les formes intérieures si demandé.
    let auto = !(inner && layer.tab_skip_inner);
    // Nombre d'attaches : fixe, ou d'après l'espacement, borné par le minimum et le maximum.
    let count = if layer.tab_spacing > 0.0 {
        let n = (length / layer.tab_spacing).round() as u32;
        let n = n.max(layer.tab_min);
        if layer.tab_max > 0 { n.min(layer.tab_max) } else { n }
    } else {
        layer.tab_count
    };
    if auto && closed && count > 0 && layer.tab_size > 0.0 && layer.tab_size * (count as f64) < length {
        for k in 0..count {
            let c = (k as f64 + 0.5) * length / count as f64;
            g.push((c - layer.tab_size / 2.0, c + layer.tab_size / 2.0, true));
        }
    }
    if layer.perforate && layer.perf_on > 0.0 && layer.perf_off > 0.0 {
        let period = layer.perf_on + layer.perf_off;
        let mut t = layer.perf_on;
        while t < length {
            g.push((t, t + layer.perf_off, false));
            t += period;
        }
    }
    g.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    g
}

/// Aire signée (repère écran, Y vers le bas) : positive pour un contour horaire.
fn signed_area(pts: &[Pt]) -> f64 {
    let n = pts.len();
    (0..n).map(|i| pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]).sum::<f64>() / 2.0
}

/// Prolonge un contour fermé (dont le dernier point répète le premier) de `extra` mm.
fn with_overcut(pts: &mut Vec<Pt>, extra: f64) {
    let loop_pts: Vec<Pt> = pts.clone();
    let mut left = extra;
    for seg in loop_pts.windows(2) {
        let len = dist(seg[0], seg[1]);
        if len >= left {
            let k = left / len;
            pts.push([seg[0][0] + (seg[1][0] - seg[0][0]) * k, seg[0][1] + (seg[1][1] - seg[0][1]) * k]);
            return;
        }
        pts.push(seg[1]);
        left -= len;
    }
}

const RAMP_STEP: f64 = 0.5; // mm

/// Amorce d'entrée (qui finit au départ du contour) ou de sortie (qui part de sa fin) :
/// droite perpendiculaire ou quart de cercle tangent, du côté extérieur (ou intérieur).
fn lead_path(pts: &[Pt], layer: &JobLayer, entry: bool) -> Vec<Pt> {
    let len = if entry { layer.lead_in } else { layer.lead_out };
    let n = pts.len();
    if len <= 0.0 || n < 3 {
        return Vec::new();
    }
    // Point d'attache et direction du contour à cet endroit.
    let (p, q) = if entry {
        (pts[0], pts.iter().skip(1).find(|q| dist(**q, pts[0]) > 1e-9).copied())
    } else {
        (pts[n - 1], pts.iter().rev().skip(1).find(|q| dist(**q, pts[n - 1]) > 1e-9).copied())
    };
    let Some(q) = q else { return Vec::new() };
    let d = dist(p, q);
    let u = if entry { [(q[0] - p[0]) / d, (q[1] - p[1]) / d] } else { [(p[0] - q[0]) / d, (p[1] - q[1]) / d] };
    // Normale tournée vers l'extérieur de la forme (ou l'intérieur si demandé).
    let mut nrm = [-u[1], u[0]];
    let probe = [p[0] + nrm[0] * 1e-3, p[1] + nrm[1] * 1e-3];
    if point_in_polygon(probe, pts) != layer.lead_inward {
        nrm = [-nrm[0], -nrm[1]];
    }
    let off = |a: Pt, v: Pt, k: f64| [a[0] + v[0] * k, a[1] + v[1] * k];
    if !layer.lead_arc {
        return if entry { vec![off(p, nrm, len), p] } else { vec![p, off(p, nrm, len)] };
    }
    // Quart de cercle de centre p + nrm·len, tangent au contour en p.
    let c = off(p, nrm, len);
    let toward_p = [-nrm[0] * len, -nrm[1] * len];
    let side = if entry { [-u[0] * len, -u[1] * len] } else { [u[0] * len, u[1] * len] };
    let mut arc: Vec<Pt> = (0..=8)
        .map(|i| {
            let a = i as f64 / 8.0 * std::f64::consts::FRAC_PI_2;
            // Entrée : de c + côté jusqu'à p ; sortie : de p jusqu'à c + côté.
            let (from, to) = if entry { (side, toward_p) } else { (toward_p, side) };
            [c[0] + from[0] * a.cos() + to[0] * a.sin(), c[1] + from[1] * a.cos() + to[1] * a.sin()]
        })
        .collect();
    // Extrémités exactes.
    if entry {
        *arc.last_mut().unwrap() = p;
    } else {
        arc[0] = p;
    }
    arc
}

/// Pause laser allumé (mode « traverser ») au début ou à la fin d'un tracé.
fn pause(w: &mut Writer, layer: &JobLayer, ms: f64, power: f64) {
    let seconds = ms / 1000.0;
    w.raw(&format!("M3 S{}", num(power.round())));
    w.raw(&format!("G4 P{}", num(seconds)));
    w.raw(layer_laser_on(w.m, layer));
    w.s = Some(0.0);
    w.dwell(seconds);
}

fn emit_lines(w: &mut Writer, layer: &JobLayer, s: f64) {
    let s_min = layer.ramp_min.clamp(0.0, layer.power) / layer.power.max(1e-9) * s;
    // Puissance des attaches (découpe partielle) et des pauses, en valeur S.
    let tab_s = layer.tab_power.clamp(0.0, 100.0) / 100.0 * w.m.s_max;
    let pause_s = if layer.pause_power > 0.0 { layer.pause_power.clamp(0.0, 100.0) / 100.0 * w.m.s_max } else { s };
    for (mut pts, closed, manual_tabs, inner) in order_paths(&layer.paths, w.pos, layer.inner_first, layer.keep_start, &layer.optimize, layer.tab_skip_inner) {
        if closed && layer.direction != Direction::Any && (signed_area(&pts) > 0.0) != (layer.direction == Direction::Cw) {
            pts.reverse();
        }
        let perimeter: f64 = pts.windows(2).map(|p| dist(p[0], p[1])).sum();
        if layer.dot_mode {
            emit_dots(w, layer, &pts, s);
            continue;
        }
        if closed && layer.overcut > 0.0 {
            with_overcut(&mut pts, layer.overcut);
        }
        let length: f64 = pts.windows(2).map(|p| dist(p[0], p[1])).sum();
        let gaps = gaps(layer, perimeter, closed, &pts, &manual_tabs, inner);
        // Rampe au début (et à la fin des tracés ouverts).
        let ramp = layer.ramp_length.max(0.0).min(length / 2.0);
        let power = |t: f64| -> f64 {
            if ramp <= 0.0 {
                s
            } else if t < ramp {
                s_min + (s - s_min) * t / ramp
            } else if !closed && t > length - ramp {
                s_min + (s - s_min) * (length - t) / ramp
            } else {
                s
            }
        };
        let mut marks: Vec<f64> = gaps.iter().flat_map(|&(a, b, _)| [a, b]).collect();
        if ramp > 0.0 {
            let n = (ramp / RAMP_STEP).ceil() as usize;
            for k in 1..=n {
                marks.push(ramp * k as f64 / n as f64);
                if !closed {
                    marks.push(length - ramp * k as f64 / n as f64);
                }
            }
        }
        // Interruption en cours : Some(true) attache, Some(false) vide de perforation.
        let gap_at = |t: f64| gaps.iter().find(|&&(a, b, _)| t > a && t < b).map(|g| g.2);
        let lead_in = if closed { lead_path(&pts, layer, true) } else { Vec::new() };
        let lead_out = if closed { lead_path(&pts, layer, false) } else { Vec::new() };
        let path = if lead_in.is_empty() { &pts } else { &lead_in };

        // Masquer le jeu : on arrive au départ dans le sens du premier segment.
        let first = path.iter().skip(1).find(|q| dist(**q, path[0]) > 1e-9).copied();
        if let (Some(b), true) = (first, layer.optimize.backlash > 0.0) {
            let l = dist(path[0], b);
            let u = [(b[0] - path[0][0]) / l, (b[1] - path[0][1]) / l];
            w.travel_to([path[0][0] - u[0] * layer.optimize.backlash, path[0][1] - u[1] * layer.optimize.backlash]);
        }
        w.travel_to(path[0]);
        for &p in lead_in.iter().skip(1) {
            w.cut_to(p, layer.speed, s);
        }
        if layer.start_pause > 0.0 {
            pause(w, layer, layer.start_pause, pause_s);
        }
        let mut walked = 0.0;
        for seg in pts.windows(2) {
            let (a, b) = (seg[0], seg[1]);
            let len = dist(a, b);
            if len < 1e-9 {
                continue;
            }
            let mut cuts: Vec<f64> = marks.iter().copied().filter(|&t| t > walked + 1e-9 && t < walked + len - 1e-9).collect();
            cuts.sort_by(|x, y| x.partial_cmp(y).unwrap());
            cuts.push(walked + len);
            let mut prev = walked;
            for t in cuts {
                let k = (t - walked) / len;
                let p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
                let mid = (prev + t) / 2.0;
                let power = match gap_at(mid) {
                    Some(true) => tab_s,
                    Some(false) => 0.0,
                    None => power(mid),
                };
                w.cut_to(p, layer.speed, power);
                prev = t;
            }
            walked += len;
        }
        if layer.end_pause > 0.0 {
            pause(w, layer, layer.end_pause, pause_s);
        }
        for &p in lead_out.iter().skip(1) {
            w.cut_to(p, layer.speed, s);
        }
    }
}

/// Mode points : un tir immobile (M3, temporisation G4) tous les `dot_spacing` mm.
fn emit_dots(w: &mut Writer, layer: &JobLayer, pts: &[Pt], s: f64) {
    let spacing = layer.dot_spacing.max(0.01);
    let seconds = layer.dot_time.max(0.0) / 1000.0;
    let mut next = 0.0;
    let mut walked = 0.0;
    let mut dots = Vec::new();
    for seg in pts.windows(2) {
        let len = dist(seg[0], seg[1]);
        while next <= walked + len + 1e-9 {
            let k = if len > 0.0 { (next - walked) / len } else { 0.0 };
            dots.push([seg[0][0] + (seg[1][0] - seg[0][0]) * k, seg[0][1] + (seg[1][1] - seg[0][1]) * k]);
            next += spacing;
        }
        walked += len;
    }
    // Contour fermé : le dernier point coïncide avec le premier.
    if dots.len() > 1 && dist(dots[0], *dots.last().unwrap()) < spacing * 0.5 {
        dots.pop();
    }
    for p in dots {
        w.travel_to(p);
        w.raw(&format!("M3 S{}", num(s.round())));
        w.raw(&format!("G4 P{}", num(seconds)));
        w.raw("M3 S0");
        w.dwell(seconds);
    }
    // Retour au mode laser du calque.
    w.raw(layer_laser_on(w.m, layer));
    w.s = Some(0.0);
}

// ---------------------------------------------------------- Remplissage

/// Intervalles [x0, x1] remplis sur la ligne horizontale `y` (règle pair-impair).
pub fn scanline(polys: &[&[Pt]], y: f64) -> Vec<(f64, f64)> {
    let mut xs = Vec::new();
    for poly in polys {
        let n = poly.len();
        for i in 0..n {
            let (a, b) = (poly[i], poly[(i + 1) % n]);
            if (a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y) {
                xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
            }
        }
    }
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs.chunks_exact(2).map(|c| (c[0], c[1])).filter(|(a, b)| b - a > 1e-6).collect()
}

fn rotate(p: Pt, deg: f64) -> Pt {
    let (sin, cos) = deg.to_radians().sin_cos();
    [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos]
}

fn emit_fill(w: &mut Writer, layer: &JobLayer, s: f64, warnings: &mut Vec<String>, pass: u32) {
    let closed: Vec<&Polyline> = layer.paths.iter().filter(|p| p.closed && p.points.len() >= 3).collect();
    if closed.len() < layer.paths.len() {
        warnings.push(format!("Calque « {} » : les tracés ouverts ne sont pas remplis.", layer.name));
    }
    if closed.is_empty() {
        return;
    }
    // L'angle peut tourner d'une passe à l'autre (incrément d'angle).
    let base = layer.fill_angle + layer.angle_increment * pass as f64;
    let mut angles = vec![base];
    if layer.cross_hatch {
        angles.push(base + 90.0);
    }
    for angle in angles {
        // On balaie horizontalement dans un repère tourné de −angle, puis on revient.
        let rotated: Vec<Vec<Pt>> = closed.iter().map(|p| p.points.iter().map(|&q| rotate(q, -angle)).collect()).collect();
        let back = |x: f64, y: f64| if angle == 0.0 { [x, y] } else { rotate([x, y], angle) };
        // Contours extérieurs (contenus dans aucun autre) : exclus de la rampe sauf « rampe du bord extérieur ».
        let outer: Vec<bool> = if layer.ramp_length > 0.0 {
            (0..rotated.len()).map(|i| !(0..rotated.len()).any(|j| j != i && point_in_polygon(rotated[i][0], &rotated[j]))).collect()
        } else {
            vec![false; rotated.len()]
        };
        if layer.fill_groups {
            // Un bloc par groupe (ou par forme hors groupe), dans l'ordre du dessin.
            let key = |i: usize| closed[i].group.clone().unwrap_or_else(|| format!("#{i}"));
            let mut keys: Vec<String> = Vec::new();
            for i in 0..closed.len() {
                if !keys.contains(&key(i)) {
                    keys.push(key(i));
                }
            }
            for k in keys {
                let ids: Vec<usize> = (0..closed.len()).filter(|&i| key(i) == k).collect();
                let polys: Vec<&[Pt]> = ids.iter().map(|&i| rotated[i].as_slice()).collect();
                let out: Vec<bool> = ids.iter().map(|&i| outer[i]).collect();
                scan_fill(w, layer, &polys, &out, &back, s);
            }
        } else if layer.fill_individually {
            for island in islands(&rotated, rotate(w.pos, -angle)) {
                let polys: Vec<&[Pt]> = island.iter().map(|&i| rotated[i].as_slice()).collect();
                let out: Vec<bool> = island.iter().map(|&i| outer[i]).collect();
                scan_fill(w, layer, &polys, &out, &back, s);
            }
        } else {
            let polys: Vec<&[Pt]> = rotated.iter().map(|p| p.as_slice()).collect();
            scan_fill(w, layer, &polys, &outer, &back, s);
        }
    }
}

/// Îlots de remplissage : chaque contour de profondeur paire avec ses trous directs,
/// ordonnés au plus proche voisin depuis `start` (dans le repère de balayage).
fn islands(polys: &[Vec<Pt>], start: Pt) -> Vec<Vec<usize>> {
    let n = polys.len();
    let contains = |a: usize, b: usize| a != b && point_in_polygon(polys[b][0], &polys[a]);
    let depth: Vec<usize> = (0..n).map(|i| (0..n).filter(|&j| contains(j, i)).count()).collect();
    let mut groups: Vec<Vec<usize>> = (0..n)
        .filter(|&i| depth[i] % 2 == 0)
        .map(|root| {
            let mut g = vec![root];
            g.extend((0..n).filter(|&h| depth[h] == depth[root] + 1 && contains(root, h)));
            g
        })
        .collect();
    let corner = |g: &Vec<usize>| -> Pt {
        let pts = g.iter().flat_map(|&i| polys[i].iter());
        let (mut x, mut y) = (f64::INFINITY, f64::INFINITY);
        for p in pts {
            x = x.min(p[0]);
            y = y.min(p[1]);
        }
        [x, y]
    };
    let mut ordered = Vec::with_capacity(groups.len());
    let mut pos = start;
    while !groups.is_empty() {
        let (k, _) = groups
            .iter()
            .enumerate()
            .map(|(k, g)| (k, dist(pos, corner(g))))
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .unwrap();
        let g = groups.swap_remove(k);
        pos = corner(&g);
        ordered.push(g);
    }
    ordered
}

/// Arêtes rangées dans une grille, pour la distance au bord le plus proche (rampe de remplissage).
struct EdgeGrid {
    cell: f64,
    cells: std::collections::HashMap<(i64, i64), Vec<(Pt, Pt)>>,
}

impl EdgeGrid {
    fn new(polys: &[&[Pt]], skip: &[bool], cell: f64) -> Self {
        let mut cells: std::collections::HashMap<(i64, i64), Vec<(Pt, Pt)>> = std::collections::HashMap::new();
        for (k, poly) in polys.iter().enumerate() {
            if skip.get(k).copied().unwrap_or(false) {
                continue;
            }
            for i in 0..poly.len() {
                let (a, b) = (poly[i], poly[(i + 1) % poly.len()]);
                let (x0, x1) = ((a[0].min(b[0]) / cell).floor() as i64, (a[0].max(b[0]) / cell).floor() as i64);
                let (y0, y1) = ((a[1].min(b[1]) / cell).floor() as i64, (a[1].max(b[1]) / cell).floor() as i64);
                for cx in x0..=x1 {
                    for cy in y0..=y1 {
                        cells.entry((cx, cy)).or_default().push((a, b));
                    }
                }
            }
        }
        EdgeGrid { cell, cells }
    }

    /// Distance au bord le plus proche, plafonnée à la taille d'une cellule.
    fn dist(&self, p: Pt) -> f64 {
        let (cx, cy) = ((p[0] / self.cell).floor() as i64, (p[1] / self.cell).floor() as i64);
        let mut best = self.cell;
        for dx in -1..=1 {
            for dy in -1..=1 {
                for &(a, b) in self.cells.get(&(cx + dx, cy + dy)).map(|v| v.as_slice()).unwrap_or(&[]) {
                    let (ux, uy) = (b[0] - a[0], b[1] - a[1]);
                    let len2 = ux * ux + uy * uy;
                    let t = if len2 > 0.0 { (((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / len2).clamp(0.0, 1.0) } else { 0.0 };
                    best = best.min(dist(p, [a[0] + t * ux, a[1] + t * uy]));
                }
            }
        }
        best
    }
}

const FILL_RAMP_STEP: f64 = 0.1; // mm

/// Puissance le long d'une ligne de balayage : de `s_min` au bord à `s` à `ramp` mm du bord.
fn ramp_runs(grid: &EdgeGrid, y: f64, x0: f64, x1: f64, ramp: f64, s_min: f64, s: f64) -> Vec<(f64, f64)> {
    let n = ((x1 - x0).abs() / FILL_RAMP_STEP).ceil().max(1.0) as usize;
    let mut runs: Vec<(f64, f64)> = Vec::new();
    for k in 0..n {
        let xm = x0 + (x1 - x0) * (k as f64 + 0.5) / n as f64;
        let d = grid.dist([xm, y]);
        let p = s_min + (s - s_min) * (d / ramp).min(1.0);
        let p = (p * 10.0).round() / 10.0;
        let x = x0 + (x1 - x0) * (k + 1) as f64 / n as f64;
        match runs.last_mut() {
            Some(last) if (last.1 - p).abs() < 1e-9 => last.0 = x,
            _ => runs.push((x, p)),
        }
    }
    runs
}

fn scan_fill(w: &mut Writer, layer: &JobLayer, polys: &[&[Pt]], outer: &[bool], back: &dyn Fn(f64, f64) -> Pt, s: f64) {
    let ramp = layer.ramp_length.max(0.0);
    let skip: Vec<bool> = outer.iter().map(|&o| o && !layer.ramp_outer).collect();
    let grid = (ramp > 0.0).then(|| EdgeGrid::new(polys, &skip, ramp));
    let s_min = layer.ramp_min.clamp(0.0, layer.power) / layer.power.max(1e-9) * s;
    let ymin = polys.iter().flat_map(|p| p.iter()).map(|p| p[1]).fold(f64::INFINITY, f64::min);
    let ymax = polys.iter().flat_map(|p| p.iter()).map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
    let step = layer.interval.max(0.01);
    let mut lines: Vec<(f64, Vec<(f64, f64)>)> = Vec::new();
    let mut y = ymin + step / 2.0;
    while y < ymax {
        let spans = scanline(polys, y);
        if !spans.is_empty() {
            lines.push((y, spans));
        }
        y += step;
    }
    let emit = |w: &mut Writer, y: f64, a: f64, b: f64, forward: bool| {
        let (x0, x1) = if forward { (a, b) } else { (b, a) };
        let dir = if forward { 1.0 } else { -1.0 };
        let runs = match &grid {
            Some(g) => ramp_runs(g, y, x0, x1, ramp, s_min, s),
            None => vec![(x1, s)],
        };
        sweep(w, layer, back, y, x0, x1, dir, &runs);
    };
    if layer.flood_fill {
        // Remplissage par zones : chaque zone (suite de segments qui se recouvrent d'une ligne
        // à l'autre, sans embranchement) est balayée entièrement avant de passer à la plus proche.
        let mut forward = true;
        for region in flood_regions(&lines) {
            for &(li, a, b) in &region {
                emit(w, lines[li].0, a, b, forward);
                if layer.bidirectional {
                    forward = !forward;
                }
            }
        }
        return;
    }
    let mut forward = true;
    for (y, spans) in &lines {
        let mut spans = spans.clone();
        if !forward {
            spans.reverse();
        }
        for (a, b) in spans {
            emit(w, *y, a, b, forward);
        }
        if layer.bidirectional {
            forward = !forward;
        }
    }
}

/// Zones de remplissage : un segment prolonge la zone du segment de la ligne précédente
/// s'ils sont les seuls à se recouvrir ; sinon une nouvelle zone commence.
/// Ordre : zones dans l'ordre où elles apparaissent, puis la plus proche de la fin de la précédente.
fn flood_regions(lines: &[(f64, Vec<(f64, f64)>)]) -> Vec<Vec<(usize, f64, f64)>> {
    let overlap = |p: (f64, f64), q: (f64, f64)| p.0 < q.1 && q.0 < p.1;
    let mut regions: Vec<Vec<(usize, f64, f64)>> = Vec::new();
    // Zone de chaque segment de la ligne précédente.
    let mut prev_region: Vec<usize> = Vec::new();
    for (li, (_, spans)) in lines.iter().enumerate() {
        let prev = if li > 0 { &lines[li - 1].1 } else { &lines[0].1 };
        let mut cur_region = Vec::with_capacity(spans.len());
        for &sp in spans {
            let mut joined = None;
            if li > 0 {
                let above: Vec<usize> = (0..prev.len()).filter(|&j| overlap(prev[j], sp)).collect();
                if above.len() == 1 {
                    let j = above[0];
                    let below = spans.iter().filter(|&&q| overlap(prev[j], q)).count();
                    let r = prev_region[j];
                    if below == 1 && regions[r].last().map(|e| e.0) == Some(li - 1) {
                        joined = Some(r);
                    }
                }
            }
            let r = joined.unwrap_or_else(|| {
                regions.push(Vec::new());
                regions.len() - 1
            });
            regions[r].push((li, sp.0, sp.1));
            cur_region.push(r);
        }
        prev_region = cur_region;
    }
    // Plus proche voisin : de la fin d'une zone au début de la suivante.
    let start = |r: &Vec<(usize, f64, f64)>| (r[0].0 as f64, r[0].1);
    let mut ordered = Vec::with_capacity(regions.len());
    let mut pos = (0.0, f64::NEG_INFINITY);
    let mut left: Vec<Vec<(usize, f64, f64)>> = regions;
    while !left.is_empty() {
        let k = (0..left.len())
            .min_by(|&a, &b| {
                let d = |r: &Vec<(usize, f64, f64)>| {
                    let (l, x) = start(r);
                    if pos.1 == f64::NEG_INFINITY { l * 1e6 + x } else { (l - pos.0).abs() * 1e3 + (x - pos.1).abs() }
                };
                d(&left[a]).partial_cmp(&d(&left[b])).unwrap()
            })
            .unwrap();
        let r = left.swap_remove(k);
        let last = r[r.len() - 1];
        pos = (last.0 as f64, last.2);
        ordered.push(r);
    }
    ordered
}

/// Décalage de balayage à cette vitesse : table interpolée (bornée aux extrémités), sinon valeur unique.
pub fn scan_offset_at(m: &MachineSettings, speed: f64) -> f64 {
    let mut t: Vec<[f64; 2]> = m.scan_offsets.iter().copied().filter(|p| p[0] > 0.0).collect();
    if t.is_empty() {
        return m.scan_offset;
    }
    t.sort_by(|a, b| a[0].partial_cmp(&b[0]).unwrap());
    if speed <= t[0][0] {
        return t[0][1];
    }
    for w in t.windows(2) {
        if speed <= w[1][0] {
            let k = (speed - w[0][0]) / (w[1][0] - w[0][0]).max(1e-9);
            return w[0][1] + k * (w[1][1] - w[0][1]);
        }
    }
    t[t.len() - 1][1]
}

/// `map` ramène les coordonnées du repère de balayage vers le plateau.
#[allow(clippy::too_many_arguments)]
fn sweep(w: &mut Writer, layer: &JobLayer, map: &dyn Fn(f64, f64) -> Pt, y: f64, x0: f64, x1: f64, dir: f64, runs: &[(f64, f64)]) {
    let ov = layer.overscan.max(0.0);
    // Compensation du retard en balayage retour : les lignes de droite à gauche sont décalées.
    let shift = if dir < 0.0 { -scan_offset_at(w.m, layer.speed) } else { 0.0 };
    let map = |x: f64, y: f64| map(x + shift, y);
    w.travel_to(map(x0 - dir * ov, y));
    if ov > 0.0 && !w.m.g0_overscan {
        w.cut_to(map(x0, y), layer.speed, 0.0);
    } else {
        w.travel_to(map(x0, y));
    }
    for &(x, s) in runs {
        w.cut_to(map(x, y), layer.speed, s);
    }
    if ov > 0.0 {
        if w.m.g0_overscan {
            w.travel_to(map(x1 + dir * ov, y));
        } else {
            w.cut_to(map(x1 + dir * ov, y), layer.speed, 0.0);
        }
    }
}

// ----------------------------------------------------------------- Image

/// Relief : une passe par tranche ; la tranche k grave les pixels plus sombres que son seuil.
fn emit_sliced(w: &mut Writer, layer: &JobLayer, img: &JobImage, s_max: f64) {
    let n = layer.image_slices;
    for k in 0..n {
        let threshold = 255.0 * (k as f64 + 1.0) / (n as f64 + 1.0);
        let gray: Vec<u8> = img.gray.iter().map(|&g| if (g as f64) < threshold { 0 } else { 255 }).collect();
        w.raw(&format!("; Tranche {}/{}", k + 1, n));
        let slice = JobImage { gray, ..img.clone() };
        let flat = JobLayer { dither: DitherMode::Threshold, image_slices: 0, ..layer.clone() };
        emit_image(w, &flat, &slice, s_max);
        // Passe de nettoyage toutes les `cleanup_every` tranches : la zone déjà creusée
        // (ou toute l'image) est repassée pour égaliser le fond.
        if layer.cleanup_every > 0 && (k + 1) % layer.cleanup_every == 0 && k + 1 < n {
            let limit = if layer.cleanup_whole { 255.0 } else { threshold };
            let gray: Vec<u8> = img.gray.iter().map(|&g| if (g as f64) < limit { 0 } else { 255 }).collect();
            w.raw(&format!("; Nettoyage après la tranche {}", k + 1));
            emit_image(w, &flat, &JobImage { gray, ..img.clone() }, s_max);
        }
    }
}

fn emit_image(w: &mut Writer, layer: &JobLayer, img: &JobImage, s_max: f64) {
    if img.px_width == 0 || img.px_height == 0 || img.gray.len() != img.px_width * img.px_height {
        return;
    }
    let screen = Screen {
        cell: if layer.halftone_cell > 0.0 { layer.halftone_cell } else { Screen::default().cell },
        angle: layer.halftone_angle,
    };
    let pix = dither_with(&img.gray, img.px_width, img.px_height, layer.dither, 128, screen);
    let s_min = layer.min_power.clamp(0.0, layer.power) / layer.power.max(1e-9) * s_max;
    let power = |v: u8| -> f64 {
        if layer.dither == DitherMode::Grayscale {
            if v == 255 { 0.0 } else { (s_min + (s_max - s_min) * (1.0 - v as f64 / 255.0)).round() }
        } else if v == 0 {
            s_max
        } else {
            0.0
        }
    };
    let sx = img.width / img.px_width as f64;
    let sy = img.height / img.px_height as f64;
    let mut forward = true;

    for r in 0..img.px_height {
        let row: Vec<f64> = pix[r * img.px_width..(r + 1) * img.px_width].iter().map(|&v| power(v)).collect();
        let Some(first) = row.iter().position(|&s| s > 0.0) else { continue };
        let last = row.iter().rposition(|&s| s > 0.0).unwrap();
        let y = img.y + (r as f64 + 0.5) * sy;
        let edge = |i: usize| img.x + i as f64 * sx;

        // Regroupe les pixels consécutifs de même puissance.
        let mut runs: Vec<(usize, usize, f64)> = Vec::new(); // [début, fin) en pixels
        for i in first..=last {
            match runs.last_mut() {
                Some(run) if run.2 == row[i] => run.1 = i + 1,
                _ => runs.push((i, i + 1, row[i])),
            }
        }
        // Correction de la largeur du point : chaque passage allumé est raccourci de la
        // moitié du point à chaque bout (trop court : il n'est pas gravé).
        let half = layer.dot_width.max(0.0) / 2.0;
        let spans: Vec<(f64, f64, f64)> = runs
            .iter()
            .map(|&(b, e, s)| {
                let (xb, xe) = (edge(b), edge(e));
                if s > 0.0 && half > 0.0 {
                    if xe - xb > 2.0 * half { (xb + half, xe - half, s) } else { (xb, xe, 0.0) }
                } else {
                    (xb, xe, s)
                }
            })
            .collect();
        let mut segs: Vec<(f64, f64)> = Vec::new();
        let (x0, x1, dir) = if forward { (edge(first), edge(last + 1), 1.0) } else { (edge(last + 1), edge(first), -1.0) };
        let mut at = x0;
        if forward {
            for &(xb, xe, s) in &spans {
                if xb > at + 1e-9 {
                    segs.push((xb, 0.0));
                }
                segs.push((xe, s));
                at = xe;
            }
        } else {
            for &(xb, xe, s) in spans.iter().rev() {
                if xe < at - 1e-9 {
                    segs.push((xe, 0.0));
                }
                segs.push((xb, s));
                at = xb;
            }
        }
        sweep(w, layer, &|x, y| [x, y], y, x0, x1, dir, &segs);
        if layer.bidirectional {
            forward = !forward;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::job::Origin;

    fn machine() -> MachineSettings {
        MachineSettings {
            bed_width: 400.0,
            bed_height: 400.0,
            origin: Origin::FrontLeft,
            s_max: 1000.0,
            laser_mode: LaserMode::Dynamic,
            travel_speed: 6000.0,
            return_to_origin: true,
            finish: None,
            emit_s_always: false,
            g0_overscan: false,
            z_reverse: false,
            z_relative: false,
            y_letter: "Y".into(),
            z_focus_offset: 0.0,
            backlash_x: 0.0,
            backlash_y: 0.0,
            swap_xy: false,
            start_delay: 0.0,
            z_axis: true,
            scan_offset: 0.0,
            scan_offsets: vec![],
            start_gcode: String::new(),
            end_gcode: String::new(),
            air_on: "M8".into(),
            air_off: "M9".into(),
            acceleration: 0.0,
        }
    }

    fn layer(mode: LayerMode) -> JobLayer {
        JobLayer {
            name: "test".into(),
            mode,
            speed: 1200.0,
            power: 50.0,
            min_power: 0.0,
            passes: 1,
            interval: 1.0,
            bidirectional: true,
            overscan: 0.0,
            dither: DitherMode::Threshold,
            air_assist: false,
            fill_angle: 0.0,
            cross_hatch: false,
            fill_individually: false,
            tab_count: 0,
            tab_size: 0.0,
            perforate: false,
            perf_on: 0.0,
            perf_off: 0.0,
            z_offset: 0.0,
            z_step: 0.0,
            overcut: 0.0,
            ramp_length: 0.0,
            ramp_min: 0.0,
            dot_mode: false,
            dot_time: 0.0,
            dot_spacing: 0.0,
            direction: Direction::Any,
            keep_start: false,
            inner_first: true,
            halftone_cell: 0.0,
            halftone_angle: 0.0,
            image_slices: 0,
            optimize: Optimize::default(),
            lead_in: 0.0,
            lead_out: 0.0,
            lead_arc: false,
            lead_inward: false,
            start_pause: 0.0,
            end_pause: 0.0,
            pause_power: 0.0,
            constant_power: false,
            angle_increment: 0.0,
            fill_groups: false,
            ramp_outer: false,
            flood_fill: false,
            cleanup_every: 0,
            cleanup_whole: false,
            air_cut_only: false,
            tab_spacing: 0.0,
            tab_min: 0,
            tab_max: 0,
            tab_skip_inner: false,
            tab_power: 0.0,
            dot_width: 0.0,
            paths: vec![],
            images: vec![],
        }
    }

    fn square(x: f64, y: f64, s: f64) -> Polyline {
        Polyline { points: vec![[x, y], [x + s, y], [x + s, y + s], [x, y + s]], closed: true, tabs: vec![], group: None }
    }

    #[test]
    fn number_formatting() {
        assert_eq!(num(1.0), "1");
        assert_eq!(num(1.25), "1.25");
        assert_eq!(num(-0.0001), "0");
        assert_eq!(num(12.3456), "12.346");
    }

    #[test]
    fn line_layer_closes_square_and_flips_y() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(10.0, 10.0, 20.0)];
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!(r.gcode.contains("M4 S0"));
        // Départ au sommet le plus proche de l'origine avant-gauche : (10, 30) plateau → Y = 370.
        assert!(r.gcode.contains("G0 X10 Y370"), "{}", r.gcode);
        assert!(r.gcode.contains("F1200 S500"));
        assert!((r.stats.cut_length - 80.0).abs() < 1e-6);
        assert!(r.gcode.trim_end().ends_with("G0 X0 Y0"));
    }

    #[test]
    fn inner_shapes_are_cut_first() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 100.0), square(40.0, 40.0, 10.0)];
        let ordered = order_paths(&l.paths, [0.0, 0.0], true, false, &Optimize::default(), false);
        assert_eq!(ordered[0].0[0][0], 40.0);
    }

    #[test]
    fn fill_handles_holes() {
        let outer = square(0.0, 0.0, 10.0);
        let hole = square(3.0, 3.0, 4.0);
        let spans = scanline(&[&outer.points, &hole.points], 5.0);
        assert_eq!(spans, vec![(0.0, 3.0), (7.0, 10.0)]);
    }

    #[test]
    fn fill_layer_emits_bidirectional_rows() {
        let mut l = layer(LayerMode::Fill);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        let cuts = r.gcode.lines().filter(|l| l.starts_with("G1")).count();
        assert_eq!(cuts, 10);
        assert!((r.stats.cut_length - 100.0).abs() < 1e-6);
    }

    #[test]
    fn image_runs_are_merged() {
        let mut l = layer(LayerMode::Image);
        l.images = vec![JobImage {
            x: 0.0,
            y: 0.0,
            width: 4.0,
            height: 1.0,
            px_width: 4,
            px_height: 1,
            gray: vec![0, 0, 255, 0],
        }];
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        let g1: Vec<&str> = r.gcode.lines().filter(|l| l.starts_with("G1")).collect();
        assert_eq!(g1, vec!["G1 X2 Y399.5 F1200 S500", "G1 X3 Y399.5 S0", "G1 X4 Y399.5 S500"]);
    }

    #[test]
    fn deserializes_frontend_job() {
        // Forme exacte de ce qu'envoie src/job.ts.
        let json = r#"{
            "machine": { "bedWidth": 400, "bedHeight": 300, "origin": "rearLeft", "sMax": 1000,
                         "laserMode": "constant", "travelSpeed": 6000, "returnToOrigin": false },
            "layers": [{
                "name": "C01", "mode": "image", "speed": 3000, "power": 40, "minPower": 0, "passes": 1,
                "interval": 0.5, "bidirectional": true, "overscan": 1, "dither": "floydSteinberg",
                "airAssist": true, "paths": [],
                "images": [{ "x": 0, "y": 0, "width": 1, "height": 1, "pxWidth": 2, "pxHeight": 2, "gray": [0, 255, 255, 0] }]
            }]
        }"#;
        let job: Job = serde_json::from_str(json).unwrap();
        let r = generate(&job);
        assert!(r.gcode.contains("M3 S0"));
        assert!(r.gcode.contains("M8") && r.gcode.contains("M9"));
        assert!(r.gcode.lines().any(|l| l.starts_with("G1") && l.contains("S400")));
        assert!(!r.gcode.contains("G0 X0 Y0"));
    }

    fn burned(gcode: &str) -> f64 {
        // Longueur allumée recalculée depuis le G-code (repère machine).
        let (mut x, mut y, mut s, mut total) = (0.0, 0.0, 0.0, 0.0);
        for l in gcode.lines() {
            let mut nx = x;
            let mut ny = y;
            for word in l.split_whitespace() {
                let v: f64 = word[1..].parse().unwrap_or(0.0);
                match &word[..1] {
                    "X" => nx = v,
                    "Y" => ny = v,
                    "S" => s = v,
                    _ => {}
                }
            }
            if l.starts_with("G1") && s > 0.0 {
                total += ((nx - x) as f64).hypot(ny - y);
            }
            x = nx;
            y = ny;
        }
        total
    }

    #[test]
    fn tabs_leave_gaps() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 100.0)];
        l.tab_count = 4;
        l.tab_size = 2.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!((burned(&r.gcode) - 392.0).abs() < 1e-6, "{}", burned(&r.gcode));
    }

    #[test]
    fn tab_spacing_is_bounded_by_min_and_max() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 100.0)];
        l.tab_size = 2.0;
        l.tab_spacing = 50.0; // 400 mm de périmètre → 8 attaches
        let cut = |l: &JobLayer| burned(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode);
        assert!((cut(&l) - 384.0).abs() < 1e-6);
        l.tab_max = 3;
        assert!((cut(&l) - 394.0).abs() < 1e-6);
        l.tab_max = 0;
        l.tab_spacing = 1000.0;
        l.tab_min = 2;
        assert!((cut(&l) - 396.0).abs() < 1e-6);
    }

    #[test]
    fn air_assist_only_while_cutting() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 10.0), square(50.0, 50.0, 10.0)];
        l.air_assist = true;
        l.air_cut_only = true;
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode;
        assert_eq!(g.lines().filter(|x| *x == "M8").count(), 2, "{g}");
        assert_eq!(g.lines().filter(|x| *x == "M9").count(), 2, "{g}");
        // Jamais de déplacement G0 avec l'air allumé.
        let mut on = false;
        for line in g.lines() {
            if line == "M8" { on = true; }
            if line == "M9" { on = false; }
            assert!(!(on && line.starts_with("G0")), "{g}");
        }
        l.air_cut_only = false;
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode;
        assert_eq!(g.lines().filter(|x| *x == "M8").count(), 1);
    }

    #[test]
    fn backlash_swap_and_focus_offset() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![Polyline { points: vec![[10.0, 10.0], [20.0, 10.0], [15.0, 10.0]], closed: false, tabs: vec![], group: None }];
        let mut m = machine();
        m.origin = Origin::RearLeft;
        m.backlash_x = 0.2;
        let g = generate(&Job { repeat: 1, machine: m.clone(), layers: vec![l.clone()] }).gcode;
        // Aller vers +X : consigne +0,1 ; retour vers −X : consigne −0,1.
        assert!(g.contains("X20.1 Y10"), "{g}");
        assert!(g.contains("X14.9 Y10"), "{g}");
        m.backlash_x = 0.0;
        m.swap_xy = true;
        let g = generate(&Job { repeat: 1, machine: m, layers: vec![l] }).gcode;
        assert!(g.contains("X10 Y20"), "{g}");
    }

    #[test]
    fn sliced_image_cleanup_passes() {
        let mut l = layer(LayerMode::Image);
        l.image_slices = 4;
        l.cleanup_every = 2;
        l.images = vec![JobImage { x: 0.0, y: 0.0, width: 4.0, height: 4.0, px_width: 4, px_height: 4, gray: vec![0, 60, 120, 200, 0, 60, 120, 200, 0, 60, 120, 200, 0, 60, 120, 255] }];
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode;
        assert_eq!(g.matches("; Nettoyage après la tranche").count(), 1, "{g}");
        assert!(g.contains("; Nettoyage après la tranche 2"));
    }

    #[test]
    fn perforation_alternates() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![Polyline { points: vec![[0.0, 0.0], [10.0, 0.0]], closed: false, tabs: vec![], group: None }];
        l.perforate = true;
        l.perf_on = 1.0;
        l.perf_off = 1.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!((burned(&r.gcode) - 5.0).abs() < 1e-6);
    }

    #[test]
    fn rotated_fill_and_crosshatch() {
        let mut l = layer(LayerMode::Fill);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.fill_angle = 90.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] });
        assert!((burned(&r.gcode) - 100.0).abs() < 1e-6);
        // À 90°, les lignes sont verticales : X constant sur chaque G1.
        assert!(r.gcode.lines().filter(|l| l.starts_with("G1")).count() == 10);
        l.cross_hatch = true;
        l.fill_angle = 0.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!((burned(&r.gcode) - 200.0).abs() < 1e-6);
    }

    #[test]
    fn z_step_per_pass() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.passes = 3;
        l.z_step = 0.5;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        let z: Vec<&str> = r.gcode.lines().filter(|l| l.starts_with("G0 Z")).collect();
        assert_eq!(z, vec!["G0 Z0", "G0 Z-0.5", "G0 Z-1", "G0 Z0"]);
    }

    #[test]
    fn individual_fill_avoids_long_crossings() {
        // Deux carrés éloignés : rempli d'un coup, chaque ligne traverse de l'un à l'autre.
        let mut l = layer(LayerMode::Fill);
        l.paths = vec![square(0.0, 0.0, 10.0), square(200.0, 0.0, 10.0)];
        let all = generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] });
        l.fill_individually = true;
        let each = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!((burned(&all.gcode) - burned(&each.gcode)).abs() < 1e-6);
        assert!(each.stats.travel_length < all.stats.travel_length / 3.0, "{} vs {}", each.stats.travel_length, all.stats.travel_length);
    }

    #[test]
    fn islands_keep_holes_with_their_outline() {
        let outer = square(0.0, 0.0, 10.0).points;
        let hole = square(3.0, 3.0, 4.0).points;
        let inner = square(4.0, 4.0, 2.0).points; // îlot dans le trou
        let far = square(50.0, 0.0, 5.0).points;
        let g = islands(&[outer, hole, inner, far], [0.0, 0.0]);
        assert_eq!(g.len(), 3);
        assert_eq!(g[0], vec![0, 1]);
    }

    #[test]
    fn overcut_extends_closed_paths() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.overcut = 3.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!((burned(&r.gcode) - 43.0).abs() < 1e-6);
    }

    #[test]
    fn ramp_increases_power_progressively() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![Polyline { points: vec![[0.0, 0.0], [20.0, 0.0]], closed: false, tabs: vec![], group: None }];
        l.ramp_length = 2.0;
        l.ramp_min = 10.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        let s: Vec<f64> = r.gcode.lines().filter_map(|l| l.split_whitespace().find(|w| w.starts_with('S')).map(|w| w[1..].parse().unwrap())).collect();
        // Montée de S100 (10 %) vers S500 (50 %), puis descente symétrique.
        let peak = s.iter().cloned().fold(0.0, f64::max);
        assert_eq!(peak, 500.0);
        assert!(s.windows(2).take_while(|w| w[1] >= w[0]).count() >= 3, "{s:?}");
        assert!((burned(&r.gcode) - 20.0).abs() < 1e-6);
    }

    #[test]
    fn dot_mode_fires_at_spacing() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.dot_mode = true;
        l.dot_spacing = 2.0;
        l.dot_time = 50.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert_eq!(r.gcode.matches("G4 P0.05").count(), 20);
        assert!(r.gcode.contains("M3 S500"));
        // Le mode du travail est rétabli après les points.
        assert_eq!(r.gcode.matches("M4 S0").count(), 2);
    }

    #[test]
    fn direction_forces_orientation() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.keep_start = true;
        l.direction = Direction::Ccw;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] });
        // Départ conservé en (0,0) plateau = (0,400) machine ; à l'écran, sens antihoraire = d'abord vers le bas.
        let g1: Vec<&str> = r.gcode.lines().filter(|l| l.starts_with("G1")).collect();
        assert!(g1[0].starts_with("G1 X0 Y390"), "{g1:?}");
        l.direction = Direction::Cw;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!(r.gcode.lines().find(|l| l.starts_with("G1")).unwrap().starts_with("G1 X10 Y400"));
    }

    #[test]
    fn scan_offset_table_is_interpolated() {
        let mut m = machine();
        m.scan_offset = 0.5;
        assert_eq!(scan_offset_at(&m, 3000.0), 0.5);
        m.scan_offsets = vec![[6000.0, 0.2], [1200.0, 0.05]];
        assert_eq!(scan_offset_at(&m, 600.0), 0.05);
        assert!((scan_offset_at(&m, 3600.0) - 0.125).abs() < 1e-9);
        assert_eq!(scan_offset_at(&m, 9000.0), 0.2);
    }

    #[test]
    fn scan_offset_and_custom_gcode() {
        let mut m = machine();
        m.scan_offset = 0.2;
        m.start_gcode = "G4 P1\n; commentaire".into();
        m.end_gcode = "M7".into();
        let mut l = layer(LayerMode::Fill);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        let r = generate(&Job { repeat: 1, machine: m, layers: vec![l] });
        assert!(r.gcode.contains("G4 P1\n; commentaire\n"));
        assert!(r.gcode.contains("M7\nM5"));
        // Deuxième ligne (retour) : de x = 10 − 0,2 à x = 0 − 0,2.
        assert!(r.gcode.contains("G1 X-0.2 Y398.5"), "{}", r.gcode);
    }

    #[test]
    fn sliced_image_burns_dark_pixels_more_often() {
        let mut l = layer(LayerMode::Image);
        l.image_slices = 3;
        // Noir, gris foncé, gris clair, blanc : gravés 3, 2, 1 et 0 fois.
        l.images = vec![JobImage { x: 0.0, y: 0.0, width: 4.0, height: 1.0, px_width: 4, px_height: 1, gray: vec![0, 100, 180, 255] }];
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!((burned(&r.gcode) - 6.0).abs() < 1e-6, "{}", burned(&r.gcode));
        assert_eq!(r.gcode.matches("; Tranche").count(), 3);
    }

    #[test]
    fn acceleration_planner() {
        // 100 mm à 6000 mm/min (100 mm/s), accélération 1000 mm/s² : 0,1 s de montée,
        // 0,1 s de freinage (5 mm chacun), 90 mm de croisière (0,9 s) → 1,1 s.
        let moves = [Move { dir: [1.0, 0.0], len: 100.0, speed: 100.0 }];
        assert!((planned_seconds(&moves, 1000.0) - 1.1).abs() < 1e-9);
        // Deux segments alignés : pas d'arrêt au milieu.
        let two = [Move { dir: [1.0, 0.0], len: 50.0, speed: 100.0 }, Move { dir: [1.0, 0.0], len: 50.0, speed: 100.0 }];
        assert!((planned_seconds(&two, 1000.0) - 1.1).abs() < 1e-9);
        // Demi-tour : arrêt complet, chaque moitié dure 0,6 s.
        let back = [Move { dir: [1.0, 0.0], len: 50.0, speed: 100.0 }, Move { dir: [-1.0, 0.0], len: 50.0, speed: 100.0 }];
        assert!((planned_seconds(&back, 1000.0) - 1.2).abs() < 1e-9);
    }

    #[test]
    fn acceleration_makes_fills_slower_than_naive() {
        let mut m = machine();
        let mut l = layer(LayerMode::Fill);
        l.paths = vec![square(0.0, 0.0, 20.0)];
        l.speed = 6000.0;
        let naive = generate(&Job { repeat: 1, machine: m.clone(), layers: vec![l.clone()] }).stats.estimated_seconds;
        m.acceleration = 500.0;
        let real = generate(&Job { repeat: 1, machine: m, layers: vec![l] }).stats.estimated_seconds;
        assert!(real > naive * 1.2, "{real} vs {naive}");
    }

    #[test]
    fn manual_tabs_are_projected_on_the_path() {
        let mut l = layer(LayerMode::Line);
        let mut sq = square(0.0, 0.0, 100.0);
        sq.tabs = vec![[50.0, -1.0], [101.0, 50.0]]; // milieu du haut, milieu de la droite
        l.paths = vec![sq];
        l.tab_size = 3.0;
        let r = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] });
        assert!((burned(&r.gcode) - 394.0).abs() < 1e-6, "{}", burned(&r.gcode));
    }

    #[test]
    fn direction_order_and_drawing_order() {
        let mut l = layer(LayerMode::Line);
        l.inner_first = false;
        l.paths = vec![square(50.0, 0.0, 5.0), square(0.0, 0.0, 5.0), square(100.0, 0.0, 5.0)];
        let xs = |o: &Optimize| order_paths(&l.paths, [200.0, 0.0], false, false, o, false).iter().map(|p| p.0.iter().map(|q| q[0]).fold(f64::INFINITY, f64::min)).collect::<Vec<_>>();
        // Plus proche voisin depuis la droite.
        assert_eq!(xs(&Optimize::default())[0], 100.0);
        // Depuis la gauche, quelle que soit la position de départ.
        let left = xs(&Optimize { direction_order: Some(Side::Left), ..Optimize::default() });
        assert!(left[0] < left[1] && left[1] < left[2]);
        // Sans optimisation : ordre du dessin.
        let drawn = xs(&Optimize { reorder: false, ..Optimize::default() });
        assert_eq!(drawn, vec![50.0, 0.0, 100.0]);
    }

    #[test]
    fn corners_are_preferred_as_start_points() {
        // Carré dont un sommet intermédiaire (aligné) est le plus proche du départ.
        let p = Polyline { points: vec![[0.0, 0.0], [5.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]], closed: true, tabs: vec![], group: None };
        let o = Optimize { corners: true, ..Optimize::default() };
        let out = order_paths(&[p], [5.0, -1.0], false, false, &o, false);
        assert_ne!(out[0].0[0], [5.0, 0.0]);
    }

    #[test]
    fn backlash_approaches_along_the_cut() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(10.0, 10.0, 10.0)];
        l.optimize.backlash = 2.0;
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode;
        let travels: Vec<&str> = g.lines().filter(|x| x.starts_with("G0 X")).collect();
        assert!(travels.len() >= 2, "{g}");
    }

    #[test]
    fn lead_in_and_out_and_pauses() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(10.0, 10.0, 10.0)];
        l.lead_in = 2.0;
        l.lead_out = 2.0;
        l.start_pause = 250.0;
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode;
        assert!(g.contains("G4 P0.25"), "{g}");
        // Plus de découpe qu'un simple carré : 40 mm + 2 × 2 mm d'amorces.
        let cut = burned(&g);
        assert!((cut - 44.0).abs() < 0.05, "{cut}");
        // En arc, l'amorce mesure un quart de cercle.
        l.lead_arc = true;
        l.start_pause = 0.0;
        let arc = burned(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode);
        assert!((arc - (40.0 + 2.0 * std::f64::consts::PI)).abs() < 0.1, "{arc}");
    }

    #[test]
    fn constant_power_layer_switches_to_m3() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 5.0)];
        l.constant_power = true;
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode;
        let m3 = g.find("M3 S0").expect("M3");
        assert!(g[m3..].contains("M4 S0"), "le mode de la machine est rétabli : {g}");
    }

    #[test]
    fn tabs_can_skip_inner_shapes_and_cut_at_low_power() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 40.0), square(10.0, 10.0, 10.0)];
        l.tab_count = 2;
        l.tab_size = 2.0;
        let full = burned(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode);
        l.tab_skip_inner = true;
        let skip = burned(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode);
        assert!((skip - full - 4.0).abs() < 0.05, "intérieur sans attaches : {full} → {skip}");
        l.tab_power = 10.0;
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode;
        assert!(g.contains(" S100"), "attaches à 10 % de 1000 : {g}");
    }

    #[test]
    fn fill_angle_turns_with_each_pass() {
        let mut l = layer(LayerMode::Fill);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.passes = 2;
        l.interval = 1.0;
        l.angle_increment = 90.0;
        let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode;
        let second = g.split("; Passe 2/2").nth(1).expect("2 passes");
        // Deuxième passe à 90° : les lignes de balayage sont verticales (X constant).
        let first_cut = second.lines().find(|x| x.starts_with("G1")).unwrap();
        assert!(first_cut.contains('X'), "{second}");
    }

    fn s_values(g: &str) -> Vec<f64> {
        g.lines().filter(|l| l.starts_with("G1")).filter_map(|l| l.split_whitespace().find(|w| w.starts_with('S'))).map(|w| w[1..].parse().unwrap()).collect()
    }

    #[test]
    fn fill_ramp_slopes_the_edges() {
        let mut l = layer(LayerMode::Fill);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.interval = 0.5;
        l.ramp_length = 2.0;
        l.ramp_min = 0.0;
        // Contour extérieur seul et rampe du bord extérieur désactivée : puissance constante.
        let flat = s_values(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode);
        let full = flat.iter().cloned().fold(0.0, f64::max);
        assert!(flat.iter().all(|&v| v == 0.0 || v == full), "{flat:?}");
        l.ramp_outer = true;
        let ramped = s_values(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode);
        assert!(ramped.iter().any(|&v| v > 0.0 && v < full * 0.2), "{ramped:?}");
        assert!(ramped.iter().any(|&v| v == full));
        // Tampon : cadre net, mais les flancs du trou (le motif) sont en rampe.
        l.ramp_outer = false;
        let mut hole = square(3.0, 3.0, 4.0);
        hole.points.reverse();
        l.paths = vec![square(0.0, 0.0, 10.0), hole];
        let stamp = s_values(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode);
        assert!(stamp.iter().any(|&v| v > 0.0 && v < full * 0.5), "{stamp:?}");
    }

    #[test]
    fn flood_fill_finishes_each_region_first() {
        let mut l = layer(LayerMode::Fill);
        let u = Polyline {
            points: vec![[0.0, 0.0], [30.0, 0.0], [30.0, 30.0], [20.0, 30.0], [20.0, 10.0], [10.0, 10.0], [10.0, 30.0], [0.0, 30.0]],
            closed: true, tabs: vec![], group: None,
        };
        l.paths = vec![u];
        l.interval = 1.0;
        let side_changes = |flood: bool| {
            let mut l = l.clone();
            l.flood_fill = flood;
            let g = generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode;
            // Côté (gauche / droite) de chaque découpe faite dans les branches du U.
            let mut sides = Vec::new();
            let (mut x, mut y) = (0.0, 0.0);
            for line in g.lines() {
                for w in line.split_whitespace() {
                    if let Some(v) = w.strip_prefix('X') { x = v.parse().unwrap(); }
                    if let Some(v) = w.strip_prefix('Y') { y = v.parse().unwrap(); }
                }
                // Origine avant gauche : Y machine = 400 − Y plateau ; les branches sont sous Y 389.
                if line.starts_with("G1") && y < 389.0 {
                    sides.push(x < 15.0);
                }
            }
            sides.windows(2).filter(|w| w[0] != w[1]).count()
        };
        assert!(side_changes(false) > 10);
        assert!(side_changes(true) <= 1);
    }

    #[test]
    fn finish_position_replaces_return_to_origin() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 5.0)];
        let mut m = machine();
        m.finish = Some([100.0, 50.0]);
        let g = generate(&Job { repeat: 1, machine: m, layers: vec![l] }).gcode;
        assert!(g.trim_end().ends_with("G53 G0 X100 Y50"), "{g}");
    }

    #[test]
    fn repeat_runs_the_job_several_times() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        let once = burned(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode);
        let g = generate(&Job { repeat: 3, machine: machine(), layers: vec![l] }).gcode;
        assert!((burned(&g) - 3.0 * once).abs() < 1e-6);
        assert!(g.contains("; Répétition 3/3"));
    }

    #[test]
    fn device_options() {
        let mut l = layer(LayerMode::Line);
        l.paths = vec![square(0.0, 0.0, 10.0)];
        l.z_offset = -2.0;
        let mut m = machine();
        m.z_axis = true;
        m.emit_s_always = true;
        m.z_reverse = true;
        m.z_relative = true;
        m.start_delay = 1.5;
        let g = generate(&Job { repeat: 1, machine: m, layers: vec![l] }).gcode;
        assert!(g.contains("G4 P1.5"));
        assert!(g.contains("G91 G0 Z2"), "Z inversé et relatif : {g}");
        assert!(g.contains("G91 G0 Z-2"), "retour : {g}");
        assert!(g.lines().filter(|x| x.starts_with("G1")).all(|x| x.contains(" S")), "S sur chaque G1 : {g}");
    }

    #[test]
    fn dot_width_shortens_burned_runs() {
        let mut l = layer(LayerMode::Image);
        l.interval = 1.0;
        l.bidirectional = false;
        l.overscan = 0.0;
        l.dither = DitherMode::Threshold;
        // Une ligne : 4 pixels noirs au milieu de 10.
        let mut gray = vec![255u8; 10];
        gray[3..7].fill(0);
        l.images = vec![JobImage { x: 0.0, y: 0.0, width: 10.0, height: 1.0, px_width: 10, px_height: 1, gray }];
        let full = burned(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l.clone()] }).gcode);
        l.dot_width = 0.4;
        let corrected = burned(&generate(&Job { repeat: 1, machine: machine(), layers: vec![l] }).gcode);
        assert!((full - 4.0).abs() < 1e-6 && (corrected - 3.6).abs() < 1e-6, "{full} → {corrected}");
    }
}
