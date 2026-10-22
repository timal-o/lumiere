//! Barre de menus native, organisée comme celle de LightBurn.
//!
//! Chaque élément a un identifiant transmis à l'interface (événement `menu`), qui
//! exécute l'action correspondante. Les raccourcis à une seule touche (outils) ne sont
//! pas des accélérateurs : ils casseraient la saisie dans les champs texte. Ils sont
//! affichés dans le libellé et gérés par l'interface.

use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuItemBuilder, MenuItemKind, PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Runtime};

type R<T> = tauri::Result<T>;

/// Traductions des libellés (texte français → langue choisie), envoyées par l'interface.
static LABELS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

/// Langues disponibles (code, libellé) et langue courante, pour le menu « Langue ».
static LANGUAGES: Mutex<(Vec<(String, String)>, String)> = Mutex::new((Vec::new(), String::new()));
/// Chemins des projets et des modèles récents (Fichier → Projets récents, Modèles récents).
static RECENT: Mutex<(Vec<String>, Vec<String>)> = Mutex::new((Vec::new(), Vec::new()));
/// Raccourcis personnalisés (identifiant → accélérateur, vide = aucun).
static SHORTCUTS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
/// Raccourcis gérés par l'interface (touche ⌥ seule…), affichés dans le libellé.
static HINTS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

/// Commande du menu, pour l'éditeur de raccourcis.
#[derive(Clone, serde::Serialize)]
pub struct Command {
    section: String,
    id: String,
    label: String,
    /// Raccourci par défaut (syntaxe des accélérateurs Tauri), vide s'il n'y en a pas.
    accel: String,
}

static CATALOG: Mutex<Vec<Command>> = Mutex::new(Vec::new());
/// Raccourcis du menu suspendus (pendant l'enregistrement d'un nouveau raccourci).
static SUSPENDED: Mutex<bool> = Mutex::new(false);

pub fn suspend_shortcuts(on: bool) {
    *SUSPENDED.lock().unwrap() = on;
}
static SECTION: Mutex<String> = Mutex::new(String::new());

pub fn catalog() -> Vec<Command> {
    CATALOG.lock().unwrap().clone()
}

/// Menu en cours de construction (classement de l'éditeur de raccourcis).
fn section(title: &str) {
    *SECTION.lock().unwrap() = tr(title);
}

pub struct Settings {
    pub labels: HashMap<String, String>,
    pub languages: Vec<(String, String)>,
    pub current: String,
    pub recent: Vec<String>,
    pub templates: Vec<String>,
    pub shortcuts: HashMap<String, String>,
    pub hints: HashMap<String, String>,
}

pub fn set_labels(s: Settings) {
    *LABELS.lock().unwrap() = Some(s.labels);
    *LANGUAGES.lock().unwrap() = (s.languages, s.current);
    *RECENT.lock().unwrap() = (s.recent, s.templates);
    *SHORTCUTS.lock().unwrap() = Some(s.shortcuts);
    *HINTS.lock().unwrap() = Some(s.hints);
}

/// Sous-menu de fichiers récents : nom du fichier, identifiant `<prefix>:<index>`.
fn recent_menu<Rt: Runtime>(app: &AppHandle<Rt>, title: &str, prefix: &str, paths: &[String]) -> R<Submenu<Rt>> {
    let mut b = SubmenuBuilder::new(app, tr(title));
    if paths.is_empty() {
        b = b.item(&MenuItemBuilder::with_id(format!("{prefix}:none"), tr("Aucun fichier récent")).enabled(false).build(app)?);
    }
    for (i, path) in paths.iter().enumerate() {
        let name = std::path::Path::new(path).file_name().map_or(path.clone(), |n| n.to_string_lossy().into_owned());
        b = b.item(&MenuItemBuilder::with_id(format!("{prefix}:{i}"), name).build(app)?);
    }
    if !paths.is_empty() {
        b = b.separator().item(&item(app, &format!("{prefix}:clear"), "Effacer la liste", None)?);
    }
    b.build()
}

/// Menu « Langue » : une case par langue disponible (identifiant `lang:<code>`).
fn language_menu<Rt: Runtime>(app: &AppHandle<Rt>) -> R<Submenu<Rt>> {
    let (langs, current) = LANGUAGES.lock().unwrap().clone();
    let mut b = SubmenuBuilder::new(app, tr("Langue"));
    if langs.is_empty() {
        b = b.item(&CheckMenuItemBuilder::with_id("lang:fr", "Français (French)").checked(true).build(app)?);
    }
    for (code, label) in &langs {
        b = b.item(&CheckMenuItemBuilder::with_id(format!("lang:{code}"), label).checked(*code == current).build(app)?);
    }
    b.build()
}

/// Libellé traduit ; le français sert de clé et de repli. Une clé « contexte::Texte »
/// distingue deux sens d'un même mot (Annuler = Undo ou Cancel) : seul « Texte » s'affiche.
fn tr(label: &str) -> String {
    LABELS.lock().unwrap().as_ref().and_then(|m| m.get(label).cloned()).unwrap_or_else(|| {
        label.split_once("::").map_or(label, |(_, text)| text).to_string()
    })
}

/// Enregistre la commande dans le catalogue des raccourcis.
fn record(id: &str, label: &str, accel: Option<&str>) {
    if id.starts_with("recent:") || id.starts_with("template:") {
        return;
    }
    let section = SECTION.lock().unwrap().clone();
    CATALOG.lock().unwrap().push(Command { section, id: id.into(), label: tr(label), accel: accel.unwrap_or("").into() });
}

/// Libellé traduit, suivi du raccourci géré par l'interface s'il y en a un.
fn label_with_hint(id: &str, label: &str) -> String {
    match HINTS.lock().unwrap().as_ref().and_then(|h| h.get(id).cloned()) {
        Some(hint) => format!("{}  ({hint})", tr(label)),
        None => tr(label),
    }
}

/// Raccourci effectif : personnalisé (vide = aucun), sinon celui par défaut ; aucun s'ils sont suspendus.
fn effective_accel(id: &str, default: Option<&str>) -> Option<String> {
    if *SUSPENDED.lock().unwrap() {
        return None;
    }
    match SHORTCUTS.lock().unwrap().as_ref().and_then(|s| s.get(id).cloned()) {
        Some(a) if a.is_empty() => None,
        Some(a) => Some(a),
        None => default.map(String::from),
    }
}

fn item<Rt: Runtime>(app: &AppHandle<Rt>, id: &str, label: &str, accel: Option<&str>) -> R<tauri::menu::MenuItem<Rt>> {
    record(id, label, accel);
    let text = label_with_hint(id, label);
    if let Some(a) = effective_accel(id, accel) {
        // Un raccourci personnalisé invalide ne doit pas empêcher de construire le menu.
        if let Ok(built) = MenuItemBuilder::with_id(id, &text).accelerator(a).build(app) {
            return Ok(built);
        }
    }
    MenuItemBuilder::with_id(id, text).build(app)
}

/// Sous-menu à partir d'une liste (identifiant, libellé, accélérateur) ; `""` = séparateur.
fn submenu<Rt: Runtime>(app: &AppHandle<Rt>, title: &str, entries: &[(&str, &str, Option<&str>)]) -> R<Submenu<Rt>> {
    let mut b = SubmenuBuilder::new(app, tr(title));
    for &(id, label, accel) in entries {
        b = if id.is_empty() { b.separator() } else { b.item(&item(app, id, label, accel)?) };
    }
    b.build()
}

/// Case à cocher (cochée au départ ; l'interface remet ensuite l'état réel).
fn check<Rt: Runtime>(app: &AppHandle<Rt>, id: &str, label: &str) -> R<tauri::menu::CheckMenuItem<Rt>> {
    record(id, label, None);
    let text = label_with_hint(id, label);
    if let Some(a) = effective_accel(id, None) {
        if let Ok(built) = CheckMenuItemBuilder::with_id(id, &text).checked(true).accelerator(a).build(app) {
            return Ok(built);
        }
    }
    CheckMenuItemBuilder::with_id(id, text).checked(true).build(app)
}


/// Même organisation que LightBurn (Fichier, Modifier, Outils, Disposer, Outils laser,
/// Fenêtre, Langue, Aide), pour que ses utilisateurs retrouvent leurs repères. Les raccourcis
/// avec ⌥ seul sont gérés par l'interface et rappelés dans le libellé.
pub fn build<Rt: Runtime>(app: &AppHandle<Rt>) -> R<Menu<Rt>> {
    CATALOG.lock().unwrap().clear();
    section("Lumière");
    let app_menu = SubmenuBuilder::new(app, tr("Lumière"))
        .item(&item(app, "about", "À propos de Lumière", None)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some(tr("Services").as_str()))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(tr("Masquer Lumière").as_str()))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(tr("Masquer les autres").as_str()))?)
        .item(&PredefinedMenuItem::show_all(app, Some(tr("Tout afficher").as_str()))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(tr("Quitter Lumière").as_str()))?)
        .build()?;

    let (recent, templates) = RECENT.lock().unwrap().clone();
    section("Fichier");
    let prefs = submenu(app, "Préférences", &[
        ("prefs:import", "Importer les préférences…", None),
        ("prefs:export", "Exporter les préférences…", None),
        ("", "", None),
        ("prefs:backups", "Charger une sauvegarde des préférences…", None),
        ("profiles", "Gestion des profils…", None),
        ("", "", None),
        ("hotkeys", "Modifier les raccourcis clavier…", None),
    ])?;
    let bundles = submenu(app, "Lots", &[
        ("bundle:import", "Importer un lot…", None),
        ("bundle:export", "Exporter un lot…", None),
    ])?;
    let file = SubmenuBuilder::new(app, tr("Fichier"))
        .item(&item(app, "new", "Nouveau", Some("CmdOrCtrl+N"))?)
        .separator()
        .item(&item(app, "newWindow", "Nouvelle fenêtre", None)?)
        .item(&recent_menu(app, "Projets récents", "recent", &recent)?)
        .item(&recent_menu(app, "Modèles récents", "template", &templates)?)
        .item(&item(app, "open", "Ouvrir…", Some("CmdOrCtrl+O"))?)
        .item(&item(app, "import", "Importer…", Some("CmdOrCtrl+I"))?)
        .item(&item(app, "pcb", "Importer un circuit imprimé…", None)?)
        .item(&item(app, "notes", "Afficher les notes", Some("CmdOrCtrl+Alt+N"))?)
        .separator()
        .item(&item(app, "save", "Enregistrer", Some("CmdOrCtrl+S"))?)
        .item(&item(app, "saveAs", "Enregistrer sous…", Some("CmdOrCtrl+Shift+S"))?)
        .item(&item(app, "saveTemplate", "Enregistrer en tant que modèle…", None)?)
        .item(&item(app, "exportSvg", "Exporter…", None)?)
        .item(&item(app, "exportGcode", "Enregistrer le G-code…", Some("CmdOrCtrl+Shift+E"))?)
        .item(&item(app, "exportRuida", "Exporter pour Ruida (.rd, expérimental)…", None)?)
        .separator()
        .item(&prefs)
        .item(&bundles)
        .separator()
        .item(&item(app, "printBlack", "Imprimer (noir uniquement)…", Some("CmdOrCtrl+P"))?)
        .item(&item(app, "printColor", "Imprimer (conserver les couleurs)…", Some("CmdOrCtrl+Shift+P"))?)
        .separator()
        .item(&item(app, "saveBitmap", "Enregistrer l'image bitmap traitée…", None)?)
        .item(&item(app, "saveCapture", "Enregistrer la capture d'arrière-plan…", None)?)
        .build()?;

    // Couper/Copier/Coller natifs : ils fonctionnent dans les champs texte, et laissent
    // passer la touche à l'interface (formes) quand aucun texte n'est sélectionné.
    section("Modifier");
    let image_options = submenu(app, "Options d'image", &[
        ("refreshImage", "Actualiser l'image", None),
        ("replaceImage", "Remplacer l'image…", None),
        ("replaceImageFit", "Remplacer l'image (ajuster)…", None),
    ])?;
    let edit = SubmenuBuilder::new(app, tr("Modifier"))
        .item(&item(app, "undo", "undo::Annuler", Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", "Rétablir", Some("CmdOrCtrl+Shift+Z"))?)
        .item(&item(app, "history", "Historique des annulations…", None)?)
        .separator()
        .item(&item(app, "selectAll", "Tout sélectionner", Some("CmdOrCtrl+A"))?)
        .item(&item(app, "invertSelection", "Inverser la sélection", Some("CmdOrCtrl+Shift+I"))?)
        .item(&PredefinedMenuItem::cut(app, Some(tr("Couper").as_str()))?)
        .item(&PredefinedMenuItem::copy(app, Some(tr("Copier").as_str()))?)
        .item(&item(app, "duplicate", "Dupliquer", Some("CmdOrCtrl+D"))?)
        .item(&PredefinedMenuItem::paste(app, Some(tr("Coller").as_str()))?)
        .item(&item(app, "pasteInPlace", "Coller sur place", None)?)
        .item(&item(app, "delete", "Supprimer (⌫)", None)?)
        .separator()
        .item(&item(app, "convertToPath", "Convertir en chemin", Some("CmdOrCtrl+Shift+C"))?)
        .item(&item(app, "bitmap", "Convertir en bitmap…", Some("CmdOrCtrl+Shift+B"))?)
        .item(&item(app, "pathFromCut", "Générer un chemin à partir de la coupe", None)?)
        .item(&item(app, "closePath", "Fermer le chemin", None)?)
        .item(&item(app, "closeTol", "Fermer les chemins sélectionnés avec tolérance…", None)?)
        .item(&item(app, "join", "Joindre automatiquement les formes sélectionnées…", None)?)
        .item(&item(app, "simplify", "Optimiser les formes sélectionnées…", None)?)
        .item(&item(app, "recoverArcs", "Récupérer arcs et lignes", None)?)
        .item(&item(app, "deleteDuplicates", "Supprimer les doublons", None)?)
        .item(&item(app, "reverseDirection", "Inverser le sens de la forme", None)?)
        .separator()
        .item(&item(app, "selectOpen", "Sélectionner les formes ouvertes", None)?)
        .item(&item(app, "selectOpenFill", "Sélectionner les formes ouvertes à remplir", None)?)
        .item(&item(app, "selectLayer", "Sélectionner toutes les formes dans le calque actuel", None)?)
        .item(&item(app, "flashLayer", "Faire clignoter les formes du calque actuel", None)?)
        .item(&item(app, "selectContained", "Sélectionner les formes contenues", None)?)
        .item(&item(app, "selectSmaller", "Sélectionner les formes plus petites que la sélection", None)?)
        .item(&item(app, "selectCircles", "Sélectionner les cercles…", None)?)
        .separator()
        .item(&image_options)
        .separator()
        .item(&item(app, "settings", "Paramètres…", Some("CmdOrCtrl+,"))?)
        .build()?;

    section("Outils");
    let shapes = submenu(app, "Dessiner la forme", &[
        ("tool:rect", "Rectangle", Some("CmdOrCtrl+R")),
        ("tool:ellipse", "Ellipse", Some("CmdOrCtrl+E")),
        ("shape:triangle", "Triangle", None),
        ("shape:pentagon", "Pentagone", None),
        ("tool:polygon", "Polygone (P)", None),
        ("shape:octagon", "Octogone", None),
        ("tool:star", "Étoile (S)", None),
        ("tool:dualStar", "Double étoile", None),
    ])?;
    let tools = SubmenuBuilder::new(app, tr("Outils"))
        .item(&item(app, "tool:select", "Sélectionner (V)", None)?)
        .item(&item(app, "tool:line", "Dessiner des lignes", Some("CmdOrCtrl+L"))?)
        .item(&shapes)
        .item(&item(app, "tool:node", "Modifier les nœuds (N)", None)?)
        .item(&item(app, "tool:trim", "Rogner les formes", Some("CmdOrCtrl+K"))?)
        .item(&item(app, "tool:tab", "Ajouter des points de maintien", None)?)
        .item(&item(app, "tool:text", "Modifier du texte", Some("CmdOrCtrl+T"))?)
        .item(&item(app, "tool:measure", "Mesure", None)?)
        .item(&item(app, "tool:position", "Positionner le laser", None)?)
        .item(&item(app, "barcode", "Créer un code-barres…", None)?)
        .item(&item(app, "qr", "Créer un code QR…", None)?)
        .item(&item(app, "offset", "Décaler les formes…", None)?)
        .item(&item(app, "outline", "Générer un contour…", None)?)
        .item(&item(app, "weld", "Souder les formes", Some("CmdOrCtrl+W"))?)
        .item(&item(app, "union", "Union booléenne", None)?)
        .item(&item(app, "difference", "Soustraction booléenne", None)?)
        .item(&item(app, "intersection", "Intersection booléenne", None)?)
        .item(&item(app, "xor", "Exclusion booléenne", None)?)
        .item(&item(app, "boolean", "Assistant booléen…", Some("CmdOrCtrl+B"))?)
        .item(&item(app, "fillet", "Congés et chanfreins…", None)?)
        .item(&item(app, "tool:roundCorners", "Arrondir les angles (clic)", None)?)
        .separator()
        .item(&item(app, "cutShapes", "Découper les formes", None)?)
        .item(&item(app, "adjustImage", "Ajuster l'image…", None)?)
        .item(&item(app, "trace", "Tracer l'image…", None)?)
        .item(&item(app, "multiTrace", "Vectoriser plusieurs fichiers…", None)?)
        .item(&item(app, "pathToText", "Appliquer le chemin au texte", None)?)
        .item(&item(app, "maskImage", "Appliquer un masque à l'image", None)?)
        .item(&item(app, "cropImage", "Rogner l'image", None)?)
        .item(&item(app, "tool:warp", "Distordre la sélection (4 points)", None)?)
        .item(&item(app, "tool:deform", "Déformer la sélection (16 points)", None)?)
        .item(&item(app, "slots", "Redimensionner les encoches de la sélection…", None)?)
        .item(&item(app, "tangentCircle", "Générer les cercles tangents", None)?)
        .build()?;

    section("Disposer");
    let align = submenu(app, "Aligner", &[
        ("align:center", "Aligner les centres", None),
        ("align:left", "Aligner à gauche", None),
        ("align:right", "Aligner à droite", None),
        ("align:top", "Aligner en haut", None),
        ("align:bottom", "Aligner en bas", None),
        ("align:centerX", "Aligner au centre (H)", None),
        ("align:centerY", "Aligner au centre (V)", None),
    ])?;
    let distribute = submenu(app, "Répartir", &[
        ("distribute:xSpace", "Répartir en espaçant H", None),
        ("distribute:x", "Répartir en centrant H", None),
        ("distribute:ySpace", "Répartir en espaçant V", None),
        ("distribute:y", "Répartir en centrant V", None),
        ("", "", None),
        ("together:x", "Déplacer H ensemble", None),
        ("together:y", "Déplacer V ensemble", None),
        ("", "", None),
        ("sameWidth", "Rendre la largeur uniforme", None),
        ("sameHeight", "Rendre la hauteur uniforme", None),
    ])?;
    let dock = submenu(app, "Ancrer", &[
        ("dock:left", "Ancrer à gauche", None),
        ("dock:right", "Ancrer à droite", None),
        ("dock:up", "Ancrer en haut", None),
        ("dock:down", "Ancrer en bas", None),
    ])?;
    let moves = submenu(app, "Déplacer les objets sélectionnés", &[
        ("move:center", "Déplacer au centre de la page", None),
        ("move:topLeft", "Déplacer en haut à gauche", None),
        ("move:topRight", "Déplacer en haut à droite", None),
        ("move:bottomLeft", "Déplacer en bas à gauche", None),
        ("move:bottomRight", "Déplacer en bas à droite", None),
        ("move:left", "Déplacer à gauche", None),
        ("move:right", "Déplacer à droite", None),
        ("move:top", "Déplacer en haut", None),
        ("move:bottom", "Déplacer en bas", None),
    ])?;
    let move_laser = submenu(app, "Déplacer le laser vers la sélection", &[
        ("laser:goSelection", "Déplacer le laser au centre de la sélection", None),
        ("laser:goUL", "Déplacer le laser en haut à gauche de la sélection", None),
        ("laser:goUR", "Déplacer le laser en haut à droite de la sélection", None),
        ("laser:goLL", "Déplacer le laser en bas à gauche de la sélection", None),
        ("laser:goLR", "Déplacer le laser en bas à droite de la sélection", None),
        ("laser:goL", "Déplacer le laser à gauche de la sélection", None),
        ("laser:goR", "Déplacer le laser à droite de la sélection", None),
        ("laser:goT", "Déplacer le laser en haut de la sélection", None),
        ("laser:goB", "Déplacer le laser en bas de la sélection", None),
        ("", "", None),
        ("jog:left", "Déplacer le laser vers la gauche", Some("CmdOrCtrl+Alt+Left")),
        ("jog:right", "Déplacer le laser vers la droite", Some("CmdOrCtrl+Alt+Right")),
        ("jog:up", "Déplacer le laser vers le haut", Some("CmdOrCtrl+Alt+Up")),
        ("jog:down", "Déplacer le laser vers le bas", Some("CmdOrCtrl+Alt+Down")),
    ])?;
    let arrange = SubmenuBuilder::new(app, tr("Disposer"))
        .item(&item(app, "group", "Grouper", Some("CmdOrCtrl+G"))?)
        .item(&item(app, "ungroup", "Dissocier", Some("CmdOrCtrl+U"))?)
        .item(&item(app, "autoGroup", "Groupage automatique", None)?)
        .separator()
        .item(&item(app, "mirrorH", "Retourner horizontalement", Some("CmdOrCtrl+Shift+H"))?)
        .item(&item(app, "mirrorV", "Retourner verticalement", Some("CmdOrCtrl+Shift+V"))?)
        .item(&item(app, "mirrorLine", "Miroir selon une ligne", Some("CmdOrCtrl+Shift+M"))?)
        .item(&item(app, "rotateCw", "Rotation de 90° horaire", None)?)
        .item(&item(app, "rotateCcw", "Rotation de 90° antihoraire", None)?)
        .item(&item(app, "tool:twoPoint", "Rotation/échelle à deux points", Some("CmdOrCtrl+2"))?)
        .separator()
        .item(&align)
        .item(&distribute)
        .separator()
        .item(&item(app, "nest", "Imbrication…", Some("CmdOrCtrl+Shift+N"))?)
        .item(&dock)
        .item(&moves)
        .item(&move_laser)
        .separator()
        .item(&item(app, "arrayGrid", "Grille/Répétition…", None)?)
        .item(&item(app, "arrayCircular", "Répétition circulaire…", None)?)
        .item(&item(app, "editArray", "Modifier la répétition…", None)?)
        .item(&item(app, "flattenArray", "Aplatir la répétition", None)?)
        .item(&item(app, "addToArray", "Ajouter à la répétition", None)?)
        .item(&item(app, "removeFromArray", "Retirer de la répétition", None)?)
        .item(&item(app, "duplicateArray", "Dupliquer la répétition", None)?)
        .item(&item(app, "alongPath", "Copier suivant le chemin…", None)?)
        .separator()
        .item(&item(app, "rubberBand", "Créer un contour élastique à partir de la sélection", None)?)
        .item(&item(app, "breakApart", "Rompre", None)?)
        .item(&item(app, "combine", "Combiner", None)?)
        .separator()
        .item(&item(app, "pushForward", "Avancer d'un niveau", Some("CmdOrCtrl+Up"))?)
        .item(&item(app, "pushBackward", "Reculer d'un niveau", Some("CmdOrCtrl+Down"))?)
        .item(&item(app, "toFront", "Pousser vers l'avant", Some("CmdOrCtrl+Shift+Up"))?)
        .item(&item(app, "toBack", "Pousser vers l'arrière", Some("CmdOrCtrl+Shift+Down"))?)
        .item(&item(app, "lock", "Verrouiller les formes sélectionnées", None)?)
        .item(&item(app, "unlock", "Déverrouiller les formes sélectionnées", None)?)
        .build()?;

    section("Outils laser");
    let print_cut = submenu(app, "Imprimer et couper", &[
        ("printCut", "Démarrer l'assistant…", None),
        ("pc:first", "Définir la première position cible", None),
        ("pc:second", "Définir la deuxième position cible", None),
        ("pc:align", "Aligner la sortie sur les cibles", None),
        ("pc:alignNoScale", "Aligner la sortie sur les cibles, sans mise à l'échelle", None),
        ("", "", None),
        ("pc:reset", "Réinitialiser Imprimer et couper", None),
    ])?;
    let laser_tools = SubmenuBuilder::new(app, tr("Outils laser"))
        .item(&print_cut)
        .separator()
        .item(&item(app, "camera", "Gérer les caméras…", Some("CmdOrCtrl+Shift+K"))?)
        .item(&item(app, "centerFinder", "Centre d'un cercle…", None)?)
        .separator()
        .item(&item(app, "rotary", "Configuration de l'unité rotative…", Some("CmdOrCtrl+Shift+R"))?)
        .separator()
        .item(&item(app, "intervalTest", "Test d'intervalle…", None)?)
        .item(&item(app, "materialTest", "Test de matériau…", None)?)
        .item(&item(app, "focusTest", "Test de focus…", None)?)
        .item(&item(app, "taper", "Déformation conique…", None)?)
        .separator()
        .item(&item(app, "optimization", "Paramètres d'optimisation…", None)?)
        .separator()
        .item(&item(app, "machine", "Gérer les appareils…", None)?)
        .item(&item(app, "newDevice", "Trouver mon laser…", None)?)
        .item(&item(app, "jobLog", "Exporter le journal des travaux…", None)?)
        .item(&item(app, "machine", "Paramètres de l'appareil…", None)?)
        .item(&item(app, "grbl", "Réglages GRBL ($$)…", None)?)
        .separator()
        .item(&item(app, "laser:connect", "Connecter / déconnecter", None)?)
        .item(&item(app, "laser:home", "Origine machine ($H)", None)?)
        .item(&item(app, "laser:unlock", "Déverrouiller ($X)", None)?)
        .item(&item(app, "laser:goOrigin", "Aller à l'origine", None)?)
        .item(&item(app, "laser:setOrigin", "Définir l'origine utilisateur ici", None)?)
        .separator()
        .item(&item(app, "laser:frame", "Cadrer", None)?)
        .item(&item(app, "laser:frameHull", "Cadrage serré", None)?)
        .item(&item(app, "laser:start", "Démarrer", None)?)
        .item(&item(app, "laser:pause", "Pause / reprise", None)?)
        .item(&item(app, "laser:stop", "Arrêter", Some("CmdOrCtrl+."))?)
        .item(&item(app, "laser:runFile", "Exécuter un fichier G-code…", None)?)
        .build()?;

    section("Fenêtre");
    let window = SubmenuBuilder::new(app, tr("Fenêtre"))
        .item(&item(app, "panels:reset", "Rétablir la mise en page par défaut", None)?)
        .separator()
        .item(&item(app, "preview", "Aperçu", None)?)
        .item(&item(app, "zoomFit", "Zoomer sur la page", Some("CmdOrCtrl+0"))?)
        .item(&item(app, "zoomIn", "Zoom avant", Some("CmdOrCtrl+="))?)
        .item(&item(app, "zoomOut", "Zoom arrière", Some("CmdOrCtrl+-"))?)
        .item(&item(app, "zoomSelection", "Zoom sur la sélection", Some("CmdOrCtrl+Shift+A"))?)
        .separator()
        .item(&MenuItemBuilder::with_id("viewStyle", tr("Style de vue :")).enabled(false).build(app)?)
        .item(&check(app, "view:wireCoarse", "Filaire / grossier")?)
        .item(&check(app, "view:wireSmooth", "Filaire / lisse")?)
        .item(&check(app, "view:filledCoarse", "Rempli / grossier")?)
        .item(&check(app, "view:filledSmooth", "Rempli / lisse")?)
        .item(&item(app, "view:toggle", "Basculer filaire / rempli", None)?)
        .item(&item(app, "panels:toggle", "Afficher/masquer les panneaux latéraux", Some("F12"))?)
        .item(&check(app, "beginner", "Mode débutant")?)
        .separator()
        .item(&check(app, "bar:main", "Principal")?)
        .item(&check(app, "bar:numeric", "Éditions numériques")?)
        .item(&check(app, "bar:creation", "Outils de création")?)
        .item(&check(app, "bar:arrange", "Disposer")?)
        .item(&check(app, "bar:palette", "Palette de couleurs")?)
        .item(&check(app, "bar:pages", "Pages")?)
        .separator()
        .item(&item(app, "art", "Bibliothèque de dessins…", None)?)
        .item(&item(app, "camera", "Caméras / Incrustations…", None)?)
        .item(&check(app, "panel:layers", "Coupes/Calques")?)
        .item(&check(app, "panel:laser", "Laser")?)
        .item(&item(app, "macros", "Macros…", None)?)
        .item(&item(app, "console", "Console…", None)?)
        .item(&item(app, "library", "Bibliothèque de matériaux…", None)?)
        .item(&check(app, "panel:properties", "Propriétés de la forme")?)
        .separator()
        .item(&PredefinedMenuItem::minimize(app, Some(tr("Placer dans le Dock").as_str()))?)
        .item(&PredefinedMenuItem::maximize(app, Some(tr("Réduire/agrandir").as_str()))?)
        .item(&PredefinedMenuItem::fullscreen(app, Some(tr("Plein écran").as_str()))?)
        .build()?;

    section("Aide");
    let help = SubmenuBuilder::new(app, tr("Aide"))
        .item(&item(app, "license", "Licence (GNU GPL v3)…", None)?)
        .item(&item(app, "help:forum", "Forum d'entraide (GitHub)", None)?)
        .item(&item(app, "help:feature", "Proposer une fonctionnalité…", None)?)
        .item(&item(app, "guide", "Guide de démarrage", None)?)
        .item(&item(app, "help:docs", "Documentation en ligne", None)?)
        .item(&item(app, "shortcuts", "Raccourcis clavier", Some("CmdOrCtrl+/"))?)
        .separator()
        .item(&item(app, "usageData", "Afficher les données d'utilisation", None)?)
        .item(&item(app, "help:bug", "Signaler un bug…", None)?)
        .separator()
        .item(&item(app, "help:support", "Générer des données de support…", None)?)
        .separator()
        .item(&item(app, "help:updates", "Rechercher les mises à jour", None)?)
        .separator()
        .item(&CheckMenuItemBuilder::with_id("help:debug", tr("Activer le journal de débogage")).checked(false).build(app)?)
        .build()?;

    let languages = language_menu(app)?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &tools, &arrange, &laser_tools, &window, &languages, &help])
}

/// Coche ou décoche un élément, où qu'il soit dans l'arborescence.
pub fn set_checked<Rt: Runtime>(menu: &Menu<Rt>, id: &str, checked: bool) {
    fn walk<Rt: Runtime>(items: Vec<MenuItemKind<Rt>>, id: &str, checked: bool) {
        for it in items {
            match &it {
                MenuItemKind::Check(c) if c.id().0 == id => {
                    let _ = c.set_checked(checked);
                }
                MenuItemKind::Submenu(s) => walk(s.items().unwrap_or_default(), id, checked),
                _ => {}
            }
        }
    }
    walk(menu.items().unwrap_or_default(), id, checked);
}
