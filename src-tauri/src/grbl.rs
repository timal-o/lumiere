//! Connexion à un contrôleur G-code : GRBL 1.1 (et dérivés : FluidNC, grblHAL),
//! Smoothieware ou Marlin, par port série USB ou par le réseau (TCP).
//!
//! Un thread unique possède la liaison : il envoie les lignes en respectant le
//! tampon du contrôleur (« character counting » pour GRBL, une ligne à la fois
//! sinon), interroge l'état et publie les réponses sous forme d'événements Tauri.

use std::collections::VecDeque;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Taille du tampon RX de GRBL (128 octets), moins une marge.
const RX_BUFFER: usize = 127;
const MARLIN_POLL: Duration = Duration::from_millis(1000);

/// Liaison bidirectionnelle : port série ou socket TCP.
pub trait Port: Read + Write + Send {}
impl<T: Read + Write + Send> Port for T {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Firmware {
    Grbl,
    Smoothie,
    Marlin,
}

impl Firmware {
    /// GRBL accepte plusieurs lignes d'avance ; les autres, une ligne par « ok ».
    fn char_counting(self) -> bool {
        self == Firmware::Grbl
    }
    /// Rapports d'état temps réel avec `?`.
    fn realtime_status(self) -> bool {
        self != Firmware::Marlin
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Target {
    Serial {
        port: String,
        baud: u32,
        /// Signal DTR à l'ouverture (certaines cartes redémarrent quand il change).
        #[serde(default)]
        dtr: Option<bool>,
    },
    Tcp { host: String, port: u16 },
}

/// Position Marlin (réponse à M114) : « X:10.00 Y:20.00 Z:0.00 E:0.00 … ».
pub fn parse_marlin_position(line: &str) -> Option<[f64; 3]> {
    let mut v = [None; 3];
    for word in line.split_whitespace() {
        let Some((k, n)) = word.split_once(':') else { continue };
        let i = match k {
            "X" => 0,
            "Y" => 1,
            "Z" => 2,
            _ => continue,
        };
        if v[i].is_none() {
            v[i] = n.parse().ok();
        }
    }
    Some([v[0]?, v[1]?, v[2].unwrap_or(0.0)])
}
const STATUS_PERIOD: Duration = Duration::from_millis(200);

pub const RT_STATUS: u8 = b'?';
pub const RT_HOLD: u8 = b'!';
pub const RT_RESUME: u8 = b'~';
pub const RT_RESET: u8 = 0x18;
pub const RT_JOG_CANCEL: u8 = 0x85;

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: String,
    pub mpos: [f64; 3],
    pub wpos: [f64; 3],
    pub feed: f64,
    pub spindle: f64,
    /// Surcharges GRBL en % : vitesse, déplacements rapides, puissance (champ `Ov`).
    pub overrides: [f64; 3],
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub total: usize,
    pub acked: usize,
    pub running: bool,
    pub errors: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub name: String,
    pub description: String,
    /// Port USB : les contrôleurs laser sont presque toujours de ce type.
    pub usb: bool,
}

/// Contrôleur trouvé par la recherche USB : port, vitesse, firmware et réglages lus ($$).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub port: String,
    pub baud: u32,
    pub firmware: String,
    pub banner: String,
    pub settings: Vec<(u32, String)>,
}

/// Firmware reconnu dans la réponse d'un contrôleur (bannière, $I, M115).
pub fn identify(text: &str) -> Option<&'static str> {
    let t = text.to_ascii_lowercase();
    if t.contains("grbl") || t.contains("fluidnc") {
        Some("grbl")
    } else if t.contains("marlin") {
        Some("marlin")
    } else if t.contains("smoothie") {
        Some("smoothie")
    } else {
        None
    }
}

/// Réglages « $n=valeur » d'une réponse GRBL.
pub fn parse_settings(text: &str) -> Vec<(u32, String)> {
    text.lines()
        .filter_map(|l| {
            let l = l.trim().strip_prefix('$')?;
            let (k, v) = l.split_once('=')?;
            Some((k.parse().ok()?, v.split_whitespace().next()?.to_string()))
        })
        .collect()
}

fn probe_one(port: &str, baud: u32) -> Option<Probe> {
    use std::io::{Read, Write};
    let mut p = serialport::new(port, baud).timeout(Duration::from_millis(50)).open().ok()?;
    let _ = p.write_data_terminal_ready(true);
    let mut text = String::new();
    let read_for = |p: &mut Box<dyn serialport::SerialPort>, ms: u64, text: &mut String| {
        let end = std::time::Instant::now() + Duration::from_millis(ms);
        let mut buf = [0u8; 512];
        while std::time::Instant::now() < end {
            if let Ok(n) = p.read(&mut buf) {
                text.push_str(&String::from_utf8_lossy(&buf[..n]));
            }
        }
    };
    // Beaucoup de cartes redémarrent à l'ouverture du port : on attend leur bannière.
    read_for(&mut p, 1800, &mut text);
    let _ = p.write_all(b"\r\n$I\r\n");
    read_for(&mut p, 600, &mut text);
    if identify(&text).is_none() {
        let _ = p.write_all(b"M115\r\n");
        read_for(&mut p, 800, &mut text);
    }
    let firmware = identify(&text)?;
    if firmware == "grbl" {
        let _ = p.write_all(b"$$\r\n");
        read_for(&mut p, 900, &mut text);
    }
    let banner = text.lines().map(str::trim).find(|l| identify(l).is_some()).unwrap_or("").to_string();
    Some(Probe { port: port.to_string(), baud, firmware: firmware.to_string(), banner, settings: parse_settings(&text) })
}

/// Cherche un contrôleur laser sur chaque port USB, aux vitesses usuelles.
pub fn probe_ports() -> Vec<Probe> {
    let mut out = Vec::new();
    for port in list_ports().into_iter().filter(|p| p.usb) {
        for baud in [115200, 250000, 230400, 57600] {
            if let Some(found) = probe_one(&port.name, baud) {
                out.push(found);
                break;
            }
        }
    }
    out
}

pub fn list_ports() -> Vec<PortInfo> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        // Sous macOS, chaque port existe en /dev/tty.* et /dev/cu.* ; seul cu.* convient.
        // On écarte aussi les ports internes du système.
        .filter(|p| {
            !p.port_name.starts_with("/dev/tty.")
                && !["debug-console", "Bluetooth-Incoming-Port", "wlan-debug"].iter().any(|n| p.port_name.contains(n))
        })
        .map(|p| {
            let (description, usb) = match p.port_type {
                serialport::SerialPortType::UsbPort(u) => {
                    let name = u.product.or(u.manufacturer).unwrap_or_else(|| "USB".into());
                    (format!("{name} ({:04x}:{:04x})", u.vid, u.pid), true)
                }
                serialport::SerialPortType::BluetoothPort => ("Bluetooth".into(), false),
                _ => {
                    let n = p.port_name.to_ascii_lowercase();
                    (String::new(), ["usb", "wch", "slab", "acm"].iter().any(|k| n.contains(k)))
                }
            };
            PortInfo { name: p.port_name, description, usb }
        })
        .collect()
}

/// Retire commentaires et espaces superflus ; `None` si la ligne est vide.
pub fn clean_line(line: &str) -> Option<String> {
    let mut out = String::with_capacity(line.len());
    let mut in_paren = false;
    for c in line.chars() {
        match c {
            ';' if !in_paren => break,
            '(' => in_paren = true,
            ')' => in_paren = false,
            _ if !in_paren => out.push(c),
            _ => {}
        }
    }
    let out = out.trim().to_string();
    (!out.is_empty()).then_some(out)
}

fn parse_xyz(s: &str) -> Option<[f64; 3]> {
    let v: Vec<f64> = s.split(',').filter_map(|x| x.parse().ok()).collect();
    (v.len() >= 2).then(|| [v[0], v[1], v.get(2).copied().unwrap_or(0.0)])
}

/// Analyse un rapport d'état `<Idle|MPos:...|FS:...|WCO:...>`.
/// `wco` conserve le dernier décalage connu, GRBL ne l'envoyant pas à chaque fois.
pub fn parse_status(line: &str, wco: &mut [f64; 3]) -> Option<Status> {
    let body = line.strip_prefix('<')?.strip_suffix('>')?;
    let mut parts = body.split('|');
    let mut st = Status { state: parts.next()?.split(':').next()?.to_string(), overrides: [100.0; 3], ..Default::default() };
    let (mut mpos, mut wpos) = (None, None);
    for part in parts {
        let Some((key, val)) = part.split_once(':') else { continue };
        match key {
            "MPos" => mpos = parse_xyz(val),
            "WPos" => wpos = parse_xyz(val),
            "WCO" => {
                if let Some(v) = parse_xyz(val) {
                    *wco = v;
                }
            }
            "Ov" => {
                let v: Vec<f64> = val.split(',').filter_map(|x| x.parse().ok()).collect();
                if v.len() == 3 {
                    st.overrides = [v[0], v[1], v[2]];
                }
            }
            "FS" | "F" => {
                let v: Vec<f64> = val.split(',').filter_map(|x| x.parse().ok()).collect();
                st.feed = v.first().copied().unwrap_or(0.0);
                st.spindle = v.get(1).copied().unwrap_or(0.0);
            }
            _ => {}
        }
    }
    let sub = |a: [f64; 3], b: [f64; 3]| [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    let add = |a: [f64; 3], b: [f64; 3]| [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    match (mpos, wpos) {
        (Some(m), _) => {
            st.mpos = m;
            st.wpos = sub(m, *wco);
        }
        (None, Some(w)) => {
            st.wpos = w;
            st.mpos = add(w, *wco);
        }
        _ => {}
    }
    Some(st)
}

enum Cmd {
    Line(String),
    Realtime(u8),
    Job(Vec<String>),
}

pub struct Connection {
    tx: Sender<Cmd>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Connection {
    pub fn open(app: AppHandle, target: Target, firmware: Firmware) -> Result<Self, String> {
        let port: Box<dyn Port> = match target {
            Target::Serial { port, baud, dtr } => Box::new({
                let mut b = serialport::new(&port, baud).timeout(Duration::from_millis(20));
                if let Some(on) = dtr {
                    b = b.dtr_on_open(on);
                }
                b
            }
                    .open()
                    .map_err(|e| format!("Impossible d'ouvrir {port} : {e}"))?,
            ),
            Target::Tcp { host, port } => {
                let addr = (host.as_str(), port)
                    .to_socket_addrs()
                    .map_err(|e| format!("Adresse {host}:{port} introuvable : {e}"))?
                    .next()
                    .ok_or_else(|| format!("Adresse {host}:{port} introuvable"))?;
                let stream = TcpStream::connect_timeout(&addr, Duration::from_secs(3))
                    .map_err(|e| format!("Connexion à {host}:{port} impossible : {e}"))?;
                stream.set_read_timeout(Some(Duration::from_millis(20))).map_err(|e| e.to_string())?;
                stream.set_nodelay(true).map_err(|e| e.to_string())?;
                Box::new(stream)
            }
        };
        let (tx, rx) = channel();
        let stop = Arc::new(AtomicBool::new(false));
        let stop2 = stop.clone();
        let thread = std::thread::spawn(move || io_loop(port, firmware, rx, app, stop2));
        Ok(Connection { tx, stop, thread: Some(thread) })
    }

    pub fn send_line(&self, line: &str) -> Result<(), String> {
        if let Some(l) = clean_line(line) {
            self.tx.send(Cmd::Line(l)).map_err(|_| "Connexion fermée".to_string())?;
        }
        Ok(())
    }

    pub fn realtime(&self, byte: u8) -> Result<(), String> {
        self.tx.send(Cmd::Realtime(byte)).map_err(|_| "Connexion fermée".to_string())
    }

    pub fn start_job(&self, gcode: &str) -> Result<usize, String> {
        let lines: Vec<String> = gcode.lines().filter_map(clean_line).collect();
        let n = lines.len();
        self.tx.send(Cmd::Job(lines)).map_err(|_| "Connexion fermée".to_string())?;
        Ok(n)
    }

    pub fn is_alive(&self) -> bool {
        self.thread.as_ref().is_some_and(|t| !t.is_finished())
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    /// Ligne du travail (compte dans la progression).
    Job,
    /// Commande saisie ou bouton (affichée dans la console).
    Manual,
    /// Interrogation automatique (réponse masquée).
    Silent,
}

struct Streamer {
    pending: VecDeque<(String, Kind)>,
    /// Lignes envoyées en attente de `ok` : (octets, nature).
    inflight: VecDeque<(usize, Kind)>,
    /// Pause locale (Marlin, qui n'a pas de commande temps réel).
    held: bool,
    used: usize,
    total: usize,
    acked: usize,
    errors: usize,
    running: bool,
}

impl Streamer {
    fn progress(&self) -> Progress {
        Progress { total: self.total, acked: self.acked, running: self.running, errors: self.errors }
    }

    fn reset(&mut self) {
        self.pending.clear();
        self.inflight.clear();
        self.used = 0;
        self.running = false;
        self.held = false;
    }
}

fn io_loop(mut port: Box<dyn Port>, fw: Firmware, rx: Receiver<Cmd>, app: AppHandle, stop: Arc<AtomicBool>) {
    let mut s = Streamer {
        pending: VecDeque::new(),
        inflight: VecDeque::new(),
        held: false,
        used: 0,
        total: 0,
        acked: 0,
        errors: 0,
        running: false,
    };
    let mut wco = [0.0; 3];
    let mut rxbuf: Vec<u8> = Vec::new();
    let mut last_status = Instant::now() - STATUS_PERIOD;
    let mut last_progress_emit = Instant::now();

    // Réveille le contrôleur et force l'affichage de sa bannière.
    let _ = port.write_all(b"\r\n\r\n");

    macro_rules! fail {
        ($msg:expr) => {{
            let _ = app.emit("grbl-disconnected", $msg);
            return;
        }};
    }

    while !stop.load(Ordering::SeqCst) {
        while let Ok(cmd) = rx.try_recv() {
            match cmd {
                Cmd::Line(l) => s.pending.push_back((l, Kind::Manual)),
                Cmd::Job(lines) => {
                    s.total = lines.len();
                    s.acked = 0;
                    s.errors = 0;
                    s.running = true;
                    s.pending.extend(lines.into_iter().map(|l| (l, Kind::Job)));
                    let _ = app.emit("grbl-progress", s.progress());
                }
                Cmd::Realtime(b) if fw == Firmware::Marlin => match b {
                    // Marlin n'a pas de commandes temps réel : pause locale, arrêt rapide M410.
                    RT_HOLD => s.held = true,
                    RT_RESUME => s.held = false,
                    RT_RESET => {
                        s.reset();
                        if port.write_all(b"M410\nM5\n").is_err() {
                            fail!("Écriture impossible");
                        }
                        let _ = app.emit("grbl-progress", s.progress());
                    }
                    _ => {}
                },
                Cmd::Realtime(b) => {
                    if port.write_all(&[b]).is_err() {
                        fail!("Écriture impossible");
                    }
                    if b == RT_RESET {
                        s.reset();
                        let _ = app.emit("grbl-progress", s.progress());
                    }
                }
            }
        }

        while let Some((line, kind)) = s.pending.front() {
            let n = line.len() + 1;
            let full = if fw.char_counting() { s.used + n > RX_BUFFER } else { true };
            if (full && !s.inflight.is_empty()) || (s.held && *kind == Kind::Job) {
                break;
            }
            let (line, kind) = s.pending.pop_front().unwrap();
            if port.write_all(format!("{line}\n").as_bytes()).is_err() {
                fail!("Écriture impossible");
            }
            if kind == Kind::Manual {
                let _ = app.emit("grbl-line", format!("> {line}"));
            }
            s.used += n;
            s.inflight.push_back((n, kind));
        }

        if fw.realtime_status() && last_status.elapsed() >= STATUS_PERIOD {
            if port.write_all(&[RT_STATUS]).is_err() {
                fail!("Écriture impossible");
            }
            last_status = Instant::now();
        } else if !fw.realtime_status() && last_status.elapsed() >= MARLIN_POLL && s.pending.is_empty() && s.inflight.is_empty() {
            // Marlin : position demandée par M114, uniquement quand rien n'est en cours d'envoi.
            s.pending.push_back(("M114".into(), Kind::Silent));
            last_status = Instant::now();
        }

        let mut tmp = [0u8; 1024];
        match port.read(&mut tmp) {
            Ok(0) => {}
            Ok(n) => rxbuf.extend_from_slice(&tmp[..n]),
            Err(e) if e.kind() == ErrorKind::TimedOut || e.kind() == ErrorKind::WouldBlock => {}
            Err(e) => fail!(format!("Port fermé : {e}")),
        }

        while let Some(i) = rxbuf.iter().position(|&b| b == b'\n') {
            let raw: Vec<u8> = rxbuf.drain(..=i).collect();
            let line = String::from_utf8_lossy(&raw).trim().to_string();
            if line.is_empty() {
                continue;
            }
            if line == "ok" || line.starts_with("error") {
                let is_error = line.starts_with("error");
                if let Some((n, kind)) = s.inflight.pop_front() {
                    s.used = s.used.saturating_sub(n);
                    if kind == Kind::Silent {
                        continue;
                    }
                    if kind == Kind::Job {
                        s.acked += 1;
                        if is_error {
                            s.errors += 1;
                        }
                        if s.acked >= s.total {
                            s.running = false;
                        }
                        if !s.running || last_progress_emit.elapsed() > Duration::from_millis(100) {
                            let _ = app.emit("grbl-progress", s.progress());
                            last_progress_emit = Instant::now();
                        }
                        if is_error {
                            let _ = app.emit("grbl-line", format!("{line} (ligne {} du travail)", s.acked));
                        }
                        continue;
                    }
                }
                let _ = app.emit("grbl-line", line);
            } else if line.starts_with('<') {
                if let Some(st) = parse_status(&line, &mut wco) {
                    let _ = app.emit("grbl-status", st);
                }
            } else if fw == Firmware::Marlin && line.starts_with("X:") {
                if let Some(p) = parse_marlin_position(&line) {
                    let state = if s.held { "Hold" } else if s.running { "Run" } else { "Idle" };
                    let st = Status { state: state.into(), mpos: p, wpos: p, feed: 0.0, spindle: 0.0, overrides: [100.0; 3] };
                    let _ = app.emit("grbl-status", st);
                }
            } else {
                if line.starts_with("Grbl") {
                    // Redémarrage du contrôleur : tout ce qui était en vol est perdu.
                    s.reset();
                    let _ = app.emit("grbl-progress", s.progress());
                }
                let _ = app.emit("grbl-line", line);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_controllers_and_reads_settings() {
        assert_eq!(identify("Grbl 1.1h ['$' for help]"), Some("grbl"));
        assert_eq!(identify("FIRMWARE_NAME:Marlin 2.1.2"), Some("marlin"));
        assert_eq!(identify("Smoothie command shell"), Some("smoothie"));
        assert_eq!(identify("ok"), None);
        let s = parse_settings("$30=1000\r\n$130=400.000 (x max)\r\nok\r\n");
        assert_eq!(s, vec![(30, "1000".to_string()), (130, "400.000".to_string())]);
    }

    #[test]
    fn cleans_comments() {
        assert_eq!(clean_line("G1 X1 ; fin"), Some("G1 X1".into()));
        assert_eq!(clean_line("(entête) G0 X0"), Some("G0 X0".into()));
        assert_eq!(clean_line("; seulement un commentaire"), None);
        assert_eq!(clean_line("   "), None);
    }

    #[test]
    fn parses_marlin_position() {
        assert_eq!(parse_marlin_position("X:10.00 Y:20.50 Z:0.00 E:0.00 Count X:800 Y:1640 Z:0"), Some([10.0, 20.5, 0.0]));
        assert_eq!(parse_marlin_position("ok"), None);
    }

    #[test]
    fn parses_status_with_wco() {
        let mut wco = [0.0; 3];
        let st = parse_status("<Idle|MPos:10.000,20.000,0.000|FS:0,0|WCO:5.000,5.000,0.000>", &mut wco).unwrap();
        assert_eq!(st.state, "Idle");
        assert_eq!(st.mpos, [10.0, 20.0, 0.0]);
        assert_eq!(st.wpos, [5.0, 15.0, 0.0]);
        let st = parse_status("<Hold:0|MPos:11.000,20.000,0.000|FS:500,300>", &mut wco).unwrap();
        assert_eq!(st.state, "Hold");
        assert_eq!(st.wpos, [6.0, 15.0, 0.0]);
        assert_eq!(st.feed, 500.0);
        assert_eq!(st.spindle, 300.0);
        assert_eq!(st.overrides, [100.0; 3]);
        let st = parse_status("<Run|MPos:1,2,0|FS:100,50|Ov:120,100,80>", &mut wco).unwrap();
        assert_eq!(st.overrides, [120.0, 100.0, 80.0]);
    }
}
