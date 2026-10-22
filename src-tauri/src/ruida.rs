//! Contrôleurs Ruida (lasers CO2) — EXPÉRIMENTAL, non validé sur machine.
//!
//! Implémentation d'après la documentation publique du protocole (rétro-ingénierie
//! communautaire) : octets « brouillés » (swizzle, clé 0x88), coordonnées absolues en
//! µm sur 5 octets de 7 bits, puissance sur 14 bits, paquets UDP vers le port 50200
//! précédés d'une somme de contrôle, acquittés par 0xC6.
//!
//! Le travail est produit à partir du G-code de Lumière : G0 → déplacement (0x88),
//! G1 laser allumé → découpe (0xA8), changements de F et de S → vitesse et puissance.

use std::net::UdpSocket;
use std::time::Duration;

pub const MAGIC: u8 = 0x88;
const PORT_CONTROLLER: u16 = 50200;
const PORT_LOCAL: u16 = 40200;
const PACKET: usize = 1000;
const ACK: u8 = 0xC6;
const NACK: u8 = 0x46;

pub fn swizzle(b: u8, magic: u8) -> u8 {
    let mut b = b;
    b ^= (b >> 7) & 0xFF;
    b ^= (b << 7) & 0xFF;
    b ^= (b >> 7) & 0xFF;
    b ^= magic;
    b.wrapping_add(1)
}

pub fn unswizzle(b: u8, magic: u8) -> u8 {
    let mut b = b.wrapping_sub(1);
    b ^= magic;
    b ^= (b >> 7) & 0xFF;
    b ^= (b << 7) & 0xFF;
    b ^= (b >> 7) & 0xFF;
    b
}

/// Nombre sur `n` octets de 7 bits, poids fort en premier.
fn encode(mut v: u64, n: usize) -> Vec<u8> {
    let mut out = vec![0u8; n];
    for i in (0..n).rev() {
        out[i] = (v & 0x7F) as u8;
        v >>= 7;
    }
    out
}

/// Coordonnée absolue (mm → µm, 5 octets).
pub fn abs_coord(mm: f64) -> Vec<u8> {
    encode((mm * 1000.0).round().max(0.0) as u64, 5)
}

/// Puissance en % sur 14 bits (0x3FFF = 100 %).
pub fn power(percent: f64) -> Vec<u8> {
    encode((percent.clamp(0.0, 100.0) / 100.0 * 0x3FFF as f64).round() as u64, 2)
}

/// Vitesse (mm/s → µm/s, 5 octets).
pub fn speed(mm_s: f64) -> Vec<u8> {
    encode((mm_s * 1000.0).round().max(0.0) as u64, 5)
}

/// Traduit le G-code (repère machine, mm) en flux de commandes Ruida, non brouillé.
pub fn from_gcode(gcode: &str, s_max: f64) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    // En-tête minimal (documenté) : début de fichier, puis corps.
    out.extend([0xD8, 0x12]);
    out.extend([0xF0]);
    out.extend([0xF1, 0x02, 0x00]);
    out.extend([0xD8, 0x00]);
    out.extend([0xCA, 0x01, 0x00]);
    let (mut x, mut y, mut f, mut s) = (0.0f64, 0.0f64, 0.0f64, 0.0f64);
    let (mut sent_f, mut sent_s) = (-1.0f64, -1.0f64);
    let mut motion = 0;
    for raw in gcode.lines() {
        let line = raw.split(';').next().unwrap_or("").trim().to_ascii_uppercase();
        if line.is_empty() {
            continue;
        }
        let mut moved = false;
        for word in line.split_whitespace() {
            let Some(v) = word.get(1..).and_then(|n| n.parse::<f64>().ok()) else { continue };
            match &word[..1] {
                "G" if v == 0.0 || v == 1.0 => motion = v as i32,
                "X" => {
                    x = v;
                    moved = true;
                }
                "Y" => {
                    y = v;
                    moved = true;
                }
                "F" => f = v,
                "S" => s = v,
                _ => {}
            }
        }
        if !moved {
            continue;
        }
        let cutting = motion == 1 && s > 0.0;
        if cutting {
            if (f - sent_f).abs() > 1e-9 {
                out.extend([0xC9, 0x02]);
                out.extend(speed(f / 60.0));
                sent_f = f;
            }
            if (s - sent_s).abs() > 1e-9 {
                let p = s / s_max.max(1.0) * 100.0;
                out.extend([0xC6, 0x01]);
                out.extend(power(p));
                out.extend([0xC6, 0x02]);
                out.extend(power(p));
                sent_s = s;
            }
            out.push(0xA8);
        } else {
            out.push(0x88);
        }
        out.extend(abs_coord(x));
        out.extend(abs_coord(y));
    }
    out.extend([0xEB, 0xE7, 0x00, 0xD7]); // fin de travail, fin de bloc, fin de fichier
    out
}

/// Fichier .rd (tout le flux brouillé), à charger sur clé USB ou via RDWorks.
pub fn rd_file(gcode: &str, s_max: f64) -> Vec<u8> {
    from_gcode(gcode, s_max).into_iter().map(|b| swizzle(b, MAGIC)).collect()
}

/// Paquet UDP : somme de contrôle (16 bits, gros-boutiste) des octets brouillés, puis données.
pub fn packet(chunk: &[u8]) -> Vec<u8> {
    let data: Vec<u8> = chunk.iter().map(|&b| swizzle(b, MAGIC)).collect();
    let sum: u32 = data.iter().map(|&b| b as u32).sum();
    let mut out = vec![(sum >> 8) as u8, (sum & 0xFF) as u8];
    out.extend(data);
    out
}

/// Envoie le travail au contrôleur par UDP, paquet par paquet, avec acquittement.
pub fn send(host: &str, gcode: &str, s_max: f64) -> Result<usize, String> {
    let stream = from_gcode(gcode, s_max);
    let sock = UdpSocket::bind(("0.0.0.0", PORT_LOCAL)).map_err(|e| format!("Port local {PORT_LOCAL} indisponible : {e}"))?;
    sock.set_read_timeout(Some(Duration::from_millis(1500))).map_err(|e| e.to_string())?;
    sock.connect((host, PORT_CONTROLLER)).map_err(|e| format!("Contrôleur {host} injoignable : {e}"))?;
    for (i, chunk) in stream.chunks(PACKET).enumerate() {
        let pkt = packet(chunk);
        let mut acked = false;
        for _ in 0..3 {
            sock.send(&pkt).map_err(|e| format!("Envoi impossible : {e}"))?;
            let mut buf = [0u8; 64];
            match sock.recv(&mut buf) {
                Ok(n) if n > 0 && unswizzle(buf[0], MAGIC) == ACK => {
                    acked = true;
                    break;
                }
                Ok(n) if n > 0 && unswizzle(buf[0], MAGIC) == NACK => continue,
                _ => continue,
            }
        }
        if !acked {
            return Err(format!("Pas d'acquittement du contrôleur pour le paquet {}", i + 1));
        }
    }
    Ok(stream.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swizzle_round_trip() {
        for b in 0..=255u8 {
            assert_eq!(unswizzle(swizzle(b, MAGIC), MAGIC), b);
        }
        // Bijection : 256 valeurs distinctes.
        let mut seen = [false; 256];
        for b in 0..=255u8 {
            seen[swizzle(b, MAGIC) as usize] = true;
        }
        assert!(seen.iter().all(|&s| s));
    }

    #[test]
    fn number_encoding() {
        assert_eq!(abs_coord(0.001), vec![0, 0, 0, 0, 1]);
        assert_eq!(abs_coord(100.0), encode(100_000, 5));
        // 100 000 µm = 0b110_0001101_0100000
        assert_eq!(abs_coord(100.0), vec![0, 0, 0x06, 0x0D, 0x20]);
        assert_eq!(power(100.0), vec![0x7F, 0x7F]);
        assert_eq!(power(0.0), vec![0, 0]);
    }

    #[test]
    fn gcode_translation() {
        let g = "G90\nM4 S0\nG0 X10 Y20\nG1 X30 Y20 F600 S500\nG1 X30 Y40\nM5\n";
        let s = from_gcode(g, 1000.0);
        // Un déplacement, une vitesse, deux puissances, deux découpes, fin de fichier.
        assert_eq!(s.iter().filter(|&&b| b == 0x88).count(), 1);
        assert_eq!(s.iter().filter(|&&b| b == 0xA8).count(), 2);
        let i = s.iter().position(|&b| b == 0xC9).unwrap();
        assert_eq!(&s[i..i + 7], &[0xC9, 0x02, 0, 0, 0, 0x4E, 0x10]); // 10 mm/s = 10 000 µm/s
        assert_eq!(*s.last().unwrap(), 0xD7);
    }

    #[test]
    fn packet_checksum() {
        let p = packet(&[0x88, 0x00]);
        let sum = p[2] as u32 + p[3] as u32;
        assert_eq!(((p[0] as u32) << 8) | p[1] as u32, sum);
    }
}
