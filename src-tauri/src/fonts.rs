//! Recensement des polices système et extraction des polices d'une collection (.ttc).
//!
//! Seuls l'en-tête et la table `name` sont lus pour le recensement, afin de ne pas
//! charger des centaines de mégaoctets au démarrage.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    pub family: String,
    pub style: String,
    pub path: String,
    pub index: u32,
}

fn font_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let home = std::env::var_os("HOME").map(PathBuf::from);
    if cfg!(target_os = "macos") {
        dirs.extend(["/System/Library/Fonts", "/Library/Fonts"].map(PathBuf::from));
        if let Some(h) = &home {
            dirs.push(h.join("Library/Fonts"));
        }
    } else if cfg!(target_os = "windows") {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        dirs.push(PathBuf::from(windir).join("Fonts"));
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join("Microsoft\\Windows\\Fonts"));
        }
    } else {
        dirs.extend(["/usr/share/fonts", "/usr/local/share/fonts"].map(PathBuf::from));
        if let Some(h) = &home {
            dirs.push(h.join(".local/share/fonts"));
            dirs.push(h.join(".fonts"));
        }
    }
    dirs
}

fn walk(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth < 4 {
                walk(&p, depth + 1, out);
            }
        } else if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            if matches!(ext.to_ascii_lowercase().as_str(), "ttf" | "otf" | "ttc" | "otc") {
                out.push(p);
            }
        }
    }
}

struct Reader {
    f: File,
}

impl Reader {
    fn bytes(&mut self, at: u64, n: usize) -> Option<Vec<u8>> {
        self.f.seek(SeekFrom::Start(at)).ok()?;
        let mut buf = vec![0; n];
        self.f.read_exact(&mut buf).ok()?;
        Some(buf)
    }
}

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_be_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// Décalages des polices contenues dans le fichier (un seul pour .ttf/.otf).
fn face_offsets(r: &mut Reader) -> Option<Vec<u32>> {
    let head = r.bytes(0, 12)?;
    if &head[0..4] == b"ttcf" {
        let n = u32_at(&head, 8).min(256) as usize;
        let offs = r.bytes(12, n * 4)?;
        Some((0..n).map(|i| u32_at(&offs, i * 4)).collect())
    } else {
        Some(vec![0])
    }
}

fn decode(platform: u16, raw: &[u8]) -> String {
    if platform == 0 || platform == 3 {
        let units: Vec<u16> = raw.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units)
    } else {
        raw.iter().map(|&b| b as char).collect()
    }
}

/// (famille, style) d'après la table `name`.
fn face_names(r: &mut Reader, offset: u32) -> Option<(String, String)> {
    let dir = r.bytes(offset as u64, 12)?;
    let num_tables = u16_at(&dir, 4) as usize;
    let records = r.bytes(offset as u64 + 12, num_tables * 16)?;
    let (name_off, name_len) = (0..num_tables)
        .map(|i| &records[i * 16..i * 16 + 16])
        .find(|rec| &rec[0..4] == b"name")
        .map(|rec| (u32_at(rec, 8), u32_at(rec, 12)))?;
    let name = r.bytes(name_off as u64, name_len.min(1 << 20) as usize)?;
    let count = u16_at(&name, 2) as usize;
    let storage = u16_at(&name, 4) as usize;

    // Score : préfère Windows/anglais, puis Unicode, puis Macintosh.
    let mut best: [(i32, String); 4] = Default::default(); // nameID 1, 2, 16, 17
    for i in 0..count {
        let at = 6 + i * 12;
        if at + 12 > name.len() {
            break;
        }
        let (platform, lang, id) = (u16_at(&name, at), u16_at(&name, at + 4), u16_at(&name, at + 6));
        let slot = match id {
            1 => 0,
            2 => 1,
            16 => 2,
            17 => 3,
            _ => continue,
        };
        let score = match (platform, lang) {
            (3, 0x409) => 4,
            (3, _) => 3,
            (0, _) => 2,
            (1, 0) => 1,
            _ => continue,
        };
        let (len, off) = (u16_at(&name, at + 8) as usize, u16_at(&name, at + 10) as usize);
        let Some(raw) = name.get(storage + off..storage + off + len) else { continue };
        if score > best[slot].0 {
            best[slot] = (score, decode(platform, raw));
        }
    }
    let pick = |a: usize, b: usize| if best[a].0 > 0 { best[a].1.clone() } else { best[b].1.clone() };
    let family = pick(2, 0);
    let style = pick(3, 1);
    (!family.is_empty()).then(|| (family, if style.is_empty() { "Regular".into() } else { style }))
}

pub fn list_fonts() -> Vec<FontInfo> {
    let mut files = Vec::new();
    for d in font_dirs() {
        walk(&d, 0, &mut files);
    }
    let mut out = Vec::new();
    for path in files {
        let Ok(f) = File::open(&path) else { continue };
        let mut r = Reader { f };
        let Some(offsets) = face_offsets(&mut r) else { continue };
        for (index, off) in offsets.into_iter().enumerate() {
            if let Some((family, style)) = face_names(&mut r, off) {
                // Les familles commençant par « . » sont des polices internes du système.
                if family.starts_with('.') || family.contains("Emoji") {
                    continue;
                }
                out.push(FontInfo { family, style, path: path.to_string_lossy().into_owned(), index: index as u32 });
            }
        }
    }
    out.sort();
    out.dedup_by(|a, b| a.family == b.family && a.style == b.style);
    out
}

/// Polices SHX (AutoCAD, à trait simple) d'un dossier choisi dans les Paramètres.
pub fn list_shx_fonts(dir: &str) -> Vec<FontInfo> {
    fn walk_shx(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                if depth < 3 {
                    walk_shx(&p, depth + 1, out);
                }
            } else if p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("shx")) {
                out.push(p);
            }
        }
    }
    let mut files = Vec::new();
    walk_shx(Path::new(dir), 0, &mut files);
    let mut out: Vec<FontInfo> = files
        .into_iter()
        .filter_map(|p| {
            let family = p.file_stem()?.to_string_lossy().into_owned();
            Some(FontInfo { family, style: "SHX".into(), path: p.to_string_lossy().into_owned(), index: 0 })
        })
        .collect();
    out.sort();
    out
}

/// Octets d'une police autonome ; pour une collection, en-tête réécrit pour la police `index`.
pub fn read_font(path: &str, index: u32) -> Result<Vec<u8>, String> {
    let data = std::fs::read(path).map_err(|e| format!("Police illisible : {e}"))?;
    if data.len() < 12 || &data[0..4] != b"ttcf" {
        return Ok(data);
    }
    let n = u32_at(&data, 8);
    if index >= n {
        return Err("Index de police invalide".into());
    }
    let off = u32_at(&data, 12 + index as usize * 4) as usize;
    let num_tables = data.get(off + 4..off + 6).map(|b| u16::from_be_bytes([b[0], b[1]])).ok_or("Collection corrompue")? as usize;
    let hdr_len = 12 + num_tables * 16;
    let mut out = data.get(off..off + hdr_len).ok_or("Collection corrompue")?.to_vec();
    // Les décalages des tables sont absolus dans le fichier : on recopie le fichier
    // entier après le nouvel en-tête et on décale chaque table d'autant.
    for i in 0..num_tables {
        let at = 12 + i * 16 + 8;
        let v = u32_at(&out, at) + hdr_len as u32;
        out[at..at + 4].copy_from_slice(&v.to_be_bytes());
    }
    out.extend_from_slice(&data);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_shx_fonts_of_a_folder() {
        let dir = std::env::temp_dir().join(format!("lumiere-shx-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("romans.shx"), b"x").unwrap();
        std::fs::write(dir.join("sub/TXT.SHX"), b"x").unwrap();
        std::fs::write(dir.join("notes.txt"), b"x").unwrap();
        let list = list_shx_fonts(&dir.to_string_lossy());
        let mut names: Vec<_> = list.iter().map(|f| f.family.as_str()).collect();
        names.sort();
        assert_eq!(names, ["TXT", "romans"]);
        assert!(list.iter().all(|f| f.style == "SHX"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn lists_and_reads_system_fonts() {
        let fonts = list_fonts();
        if fonts.is_empty() {
            return; // machine sans police (CI minimale)
        }
        assert!(fonts.iter().all(|f| !f.family.is_empty()));
        let ttc = fonts.iter().find(|f| f.path.ends_with(".ttc") && f.index > 0);
        if let Some(f) = ttc {
            let bytes = read_font(&f.path, f.index).unwrap();
            let v = u32_at(&bytes, 0);
            assert!(v == 0x0001_0000 || &bytes[0..4] == b"OTTO" || &bytes[0..4] == b"true");
        }
    }
}
