mod dither;
mod fonts;
mod gcode;
mod grbl;
mod job;
mod menu;
mod ruida;

use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager, State};

#[derive(Default)]
struct AppState {
    conn: Mutex<Option<grbl::Connection>>,
    /// Fichiers à ouvrir reçus avant que l'interface soit prête (ligne de commande, Finder).
    pending_open: Mutex<Vec<String>>,
}

/// Fichiers passés au lancement ou par le système, pas encore pris par l'interface.
#[tauri::command]
fn take_pending_opens(state: State<AppState>) -> Vec<String> {
    state.pending_open.lock().map(|mut v| std::mem::take(&mut *v)).unwrap_or_default()
}

fn with_conn<T>(state: &State<AppState>, f: impl FnOnce(&grbl::Connection) -> Result<T, String>) -> Result<T, String> {
    let guard = state.conn.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(c) if c.is_alive() => f(c),
        _ => Err("Laser non connecté".into()),
    }
}

#[tauri::command]
fn list_ports() -> Vec<grbl::PortInfo> {
    grbl::list_ports()
}

/// Recherche des contrôleurs USB (le port de la connexion en cours n'est pas sondé).
#[tauri::command]
async fn probe_ports(state: State<'_, AppState>) -> Result<Vec<grbl::Probe>, String> {
    if state.conn.lock().map_err(|e| e.to_string())?.is_some() {
        return Err("Déconnectez le laser avant de lancer la recherche".into());
    }
    tauri::async_runtime::spawn_blocking(grbl::probe_ports).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn connect(app: tauri::AppHandle, state: State<'_, AppState>, target: grbl::Target, firmware: grbl::Firmware) -> Result<(), String> {
    // Asynchrone : une connexion réseau peut prendre quelques secondes.
    let conn = grbl::Connection::open(app, target, firmware)?;
    let mut guard = state.conn.lock().map_err(|e| e.to_string())?;
    *guard = Some(conn); // remplace (et ferme) l'éventuelle connexion précédente
    Ok(())
}

#[tauri::command]
fn disconnect(state: State<AppState>) -> Result<(), String> {
    state.conn.lock().map_err(|e| e.to_string())?.take();
    Ok(())
}

#[tauri::command]
fn send_line(state: State<AppState>, line: String) -> Result<(), String> {
    with_conn(&state, |c| c.send_line(&line))
}

#[tauri::command]
fn realtime(state: State<AppState>, command: String) -> Result<(), String> {
    let byte = match command.as_str() {
        "status" => grbl::RT_STATUS,
        "hold" => grbl::RT_HOLD,
        "resume" => grbl::RT_RESUME,
        "reset" => grbl::RT_RESET,
        "jogCancel" => grbl::RT_JOG_CANCEL,
        // Surcharges temps réel de GRBL 1.1.
        "feedReset" => 0x90,
        "feedPlus10" => 0x91,
        "feedMinus10" => 0x92,
        "feedPlus1" => 0x93,
        "feedMinus1" => 0x94,
        "powerReset" => 0x99,
        "powerPlus10" => 0x9A,
        "powerMinus10" => 0x9B,
        "powerPlus1" => 0x9C,
        "powerMinus1" => 0x9D,
        other => return Err(format!("Commande temps réel inconnue : {other}")),
    };
    with_conn(&state, |c| c.realtime(byte))
}

#[tauri::command]
fn start_job(state: State<AppState>, gcode: String) -> Result<usize, String> {
    with_conn(&state, |c| c.start_job(&gcode))
}

#[tauri::command]
fn generate_gcode(job: job::Job) -> gcode::GcodeResult {
    gcode::generate(&job)
}

/// Tramage pour l'aperçu : niveaux de gris bruts en entrée et en sortie (sans JSON).
/// En-têtes : `x-width`, `x-height`, `x-mode` (nom du mode en camelCase), et pour la
/// demi-teinte `x-cell` (pixels) et `x-angle` (degrés).
#[tauri::command]
fn dither_raw(request: Request) -> Result<Response, String> {
    let InvokeBody::Raw(gray) = request.body() else {
        return Err("Corps binaire attendu".into());
    };
    let header = |name: &str| request.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or_default().to_string();
    let width: usize = header("x-width").parse().map_err(|_| "x-width invalide")?;
    let height: usize = header("x-height").parse().map_err(|_| "x-height invalide")?;
    let mode: dither::DitherMode = serde_json::from_value(serde_json::Value::String(header("x-mode"))).map_err(|e| e.to_string())?;
    if gray.len() != width * height {
        return Err("Taille d'image incohérente".into());
    }
    let mut screen = dither::Screen::default();
    if let Ok(v) = header("x-cell").parse::<f64>() {
        screen.cell = v;
    }
    if let Ok(v) = header("x-angle").parse::<f64>() {
        screen.angle = v;
    }
    Ok(Response::new(dither::dither_with(gray, width, height, mode, 128, screen)))
}

#[tauri::command]
async fn list_fonts() -> Vec<fonts::FontInfo> {
    fonts::list_fonts()
}

#[tauri::command]
async fn list_shx_fonts(dir: String) -> Vec<fonts::FontInfo> {
    fonts::list_shx_fonts(&dir)
}

#[tauri::command]
async fn read_font(path: String, index: u32) -> Result<Response, String> {
    fonts::read_font(&path, index).map(Response::new)
}

/// Change la langue du menu : nouvelles traductions, puis reconstruction de la barre.
#[tauri::command]
fn set_menu_labels(
    app: tauri::AppHandle,
    labels: std::collections::HashMap<String, String>,
    languages: Vec<(String, String)>,
    current: String,
    recent: Vec<String>,
    templates: Vec<String>,
    shortcuts: std::collections::HashMap<String, String>,
    hints: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    menu::set_labels(menu::Settings { labels, languages, current, recent, templates, shortcuts, hints });
    let m = menu::build(&app).map_err(|e| e.to_string())?;
    app.set_menu(m).map_err(|e| e.to_string())?;
    Ok(())
}

/// Suspend (ou rétablit) les raccourcis du menu, le temps d'enregistrer un nouveau raccourci ;
/// l'interface reconstruit ensuite le menu (set_menu_labels), ce qui remet aussi les coches.
#[tauri::command]
fn suspend_shortcuts(on: bool) {
    menu::suspend_shortcuts(on);
}

/// Commandes du menu et leurs raccourcis par défaut (éditeur de raccourcis).
#[tauri::command]
fn menu_catalog() -> Vec<menu::Command> {
    menu::catalog()
}

/// Synchronise une case à cocher du menu avec l'état de l'interface.
#[tauri::command]
fn set_menu_checked(app: tauri::AppHandle, id: String, checked: bool) {
    if let Some(m) = app.menu() {
        menu::set_checked(&m, &id, checked);
    }
}

/// Écrit un fichier binaire (corps brut) ; chemin dans l'en-tête `x-path` (encodé URI).
#[tauri::command]
fn write_binary_file(request: Request) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Corps binaire attendu".into());
    };
    let raw = request.headers().get("x-path").and_then(|v| v.to_str().ok()).ok_or("x-path manquant")?;
    let path = percent_decode(raw);
    std::fs::write(&path, bytes).map_err(|e| format!("Écriture de {path} impossible : {e}"))
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Ruida (expérimental) : fichier .rd brouillé, renvoyé en octets bruts.
#[tauri::command]
fn ruida_file(gcode: String, s_max: f64) -> Response {
    Response::new(ruida::rd_file(&gcode, s_max))
}

/// Ruida (expérimental) : envoi direct par UDP au contrôleur.
#[tauri::command]
async fn ruida_send(host: String, gcode: String, s_max: f64) -> Result<usize, String> {
    ruida::send(&host, &gcode, s_max)
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Écriture de {path} impossible : {e}"))
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Response, String> {
    std::fs::read(&path).map(Response::new).map_err(|e| format!("Lecture de {path} impossible : {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Lecture de {path} impossible : {e}"))
}

/// Fichier → Imprimer : ouvre la fenêtre d'impression du système pour la page affichée.
#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(|app| menu::build(app))
        // Le menu est commun à toutes les fenêtres : l'action va à la fenêtre active.
        .on_menu_event(|app, event| {
            let id = event.id().0.clone();
            let focused = app.webview_windows().into_values().find(|w| w.is_focused().unwrap_or(false));
            let _ = match focused {
                Some(w) => app.emit_to(w.label(), "menu", id),
                None => app.emit_to("main", "menu", id),
            };
        })
        .manage(AppState {
            // Fichiers en argument (lancement depuis un terminal ou une association de fichiers).
            pending_open: Mutex::new(std::env::args().skip(1).filter(|a| !a.starts_with('-') && std::path::Path::new(a).is_file()).collect()),
            ..AppState::default()
        })
        .invoke_handler(tauri::generate_handler![
            list_ports,
            connect,
            disconnect,
            send_line,
            realtime,
            start_job,
            generate_gcode,
            dither_raw,
            list_fonts,
            list_shx_fonts,
            probe_ports,
            read_font,
            set_menu_checked,
            set_menu_labels,
            write_binary_file,
            ruida_file,
            ruida_send,
            write_text_file,
            read_text_file,
            read_binary_file,
            menu_catalog,
            suspend_shortcuts,
            print_page,
            take_pending_opens
        ])
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Lumière")
        .run(|app, event| {
            // macOS : fichiers ouverts depuis le Finder (double-clic, glisser sur l'icône).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().into_owned()).collect();
                if let Ok(mut pending) = app.state::<AppState>().pending_open.lock() {
                    pending.extend(paths);
                }
                let _ = app.emit_to("main", "open-files", ());
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
