//! Description d'un travail laser envoyé par l'interface.
//!
//! Toutes les coordonnées sont en millimètres, dans le repère du plateau
//! (origine en haut à gauche, Y vers le bas, comme à l'écran). La conversion
//! vers le repère machine est faite par [`MachineSettings::to_machine`].

use serde::{Deserialize, Serialize};

use crate::dither::DitherMode;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Origin {
    FrontLeft,
    RearLeft,
    FrontRight,
    RearRight,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LaserMode {
    /// M3 : puissance constante.
    Constant,
    /// M4 : puissance ajustée à la vitesse réelle (recommandé en GRBL).
    Dynamic,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineSettings {
    pub bed_width: f64,
    pub bed_height: f64,
    pub origin: Origin,
    /// Valeur S correspondant à 100 % (paramètre GRBL `$30`).
    pub s_max: f64,
    pub laser_mode: LaserMode,
    /// Vitesse de déplacement laser éteint (mm/min), utilisée pour l'estimation.
    pub travel_speed: f64,
    /// Revenir à l'origine en fin de travail.
    pub return_to_origin: bool,
    /// Position de fin de travail (coordonnées machine), prioritaire sur le retour à l'origine.
    #[serde(default)]
    pub finish: Option<[f64; 2]>,
    /// Répéter la valeur S sur chaque G1 (certains contrôleurs l'exigent).
    #[serde(default)]
    pub emit_s_always: bool,
    /// Dépassements de balayage en G0 plutôt qu'en G1 S0.
    #[serde(default)]
    pub g0_overscan: bool,
    /// Axe Z : sens inversé ; déplacements relatifs uniquement (G91).
    #[serde(default)]
    pub z_reverse: bool,
    /// Lettre de l'axe des Y en sortie (« A » pour un rotatif sur l'axe A).
    #[serde(default = "default_y_letter")]
    pub y_letter: String,
    #[serde(default)]
    pub z_relative: bool,
    /// Décalage de mise au point ajouté à toutes les positions Z (mm).
    #[serde(default)]
    pub z_focus_offset: f64,
    /// Compensation du jeu mécanique (mm) en X et en Y, appliquée aux changements de sens.
    #[serde(default)]
    pub backlash_x: f64,
    #[serde(default)]
    pub backlash_y: f64,
    /// Échange les axes X et Y en sortie (machines câblées à l'envers).
    #[serde(default, rename = "swapXY")]
    pub swap_xy: bool,
    /// Attente (s) avant le début du travail (extraction, assistance d'air…).
    #[serde(default)]
    pub start_delay: f64,
    /// La machine possède un axe Z pilotable (décalage et descente par passe).
    #[serde(default)]
    pub z_axis: bool,
    /// Décalage (mm) appliqué aux lignes de balayage parcourues de droite à gauche, pour
    /// compenser le retard du laser en balayage bidirectionnel.
    #[serde(default)]
    pub scan_offset: f64,
    /// Décalages selon la vitesse : [vitesse (mm/min), décalage (mm)], interpolés ;
    /// prioritaires sur `scan_offset` s'il y en a.
    #[serde(default)]
    pub scan_offsets: Vec<[f64; 2]>,
    /// G-code personnalisé inséré en début et en fin de travail.
    #[serde(default)]
    pub start_gcode: String,
    #[serde(default)]
    pub end_gcode: String,
    /// Accélération (mm/s²) pour l'estimation de durée ; 0 : estimation à vitesse constante.
    #[serde(default)]
    pub acceleration: f64,
    /// Commandes d'assistance d'air (M8/M9 par défaut, M7 sur certaines machines).
    #[serde(default = "default_air_on")]
    pub air_on: String,
    #[serde(default = "default_air_off")]
    pub air_off: String,
}

fn default_y_letter() -> String {
    "Y".into()
}

fn default_air_on() -> String {
    "M8".into()
}

fn default_air_off() -> String {
    "M9".into()
}

fn one() -> u32 {
    1
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum Direction {
    #[default]
    Any,
    /// Sens horaire, vu à l'écran.
    Cw,
    Ccw,
}

impl MachineSettings {
    pub fn to_machine(&self, p: [f64; 2]) -> [f64; 2] {
        let [x, y] = p;
        match self.origin {
            Origin::FrontLeft => [x, self.bed_height - y],
            Origin::RearLeft => [x, y],
            Origin::FrontRight => [self.bed_width - x, self.bed_height - y],
            Origin::RearRight => [self.bed_width - x, y],
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LayerMode {
    Line,
    Fill,
    Image,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Polyline {
    pub points: Vec<[f64; 2]>,
    pub closed: bool,
    /// Attaches placées à la main : points (plateau) projetés sur le tracé.
    #[serde(default)]
    pub tabs: Vec<[f64; 2]>,
    /// Groupe de la forme d'origine (remplissage « groupes ensemble »).
    #[serde(default)]
    pub group: Option<String>,
}

/// Image déjà rééchantillonnée par l'interface : un pixel par pas de balayage.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobImage {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub px_width: usize,
    pub px_height: usize,
    /// Niveaux de gris, 0 = noir (brûlé), 255 = blanc.
    pub gray: Vec<u8>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobLayer {
    pub name: String,
    pub mode: LayerMode,
    /// mm/min
    pub speed: f64,
    /// Puissance max en %.
    pub power: f64,
    /// Puissance min en % (utilisée par le mode niveaux de gris).
    pub min_power: f64,
    pub passes: u32,
    /// Pas de balayage en mm (remplissage et image).
    pub interval: f64,
    pub bidirectional: bool,
    /// Dépassement laser éteint en bout de ligne de balayage (mm).
    pub overscan: f64,
    pub dither: DitherMode,
    pub air_assist: bool,
    /// Angle de balayage du remplissage (degrés).
    #[serde(default)]
    pub fill_angle: f64,
    /// Remplissage croisé : un second balayage à 90°.
    #[serde(default)]
    pub cross_hatch: bool,
    /// Remplir chaque forme (contour + trous) séparément plutôt que tout le calque d'un coup.
    #[serde(default)]
    pub fill_individually: bool,
    /// Attaches : nombre par forme fermée et longueur (mm), laser éteint.
    #[serde(default)]
    pub tab_count: u32,
    #[serde(default)]
    pub tab_size: f64,
    /// Perforation : alternance allumé/éteint (mm).
    #[serde(default)]
    pub perforate: bool,
    #[serde(default)]
    pub perf_on: f64,
    #[serde(default)]
    pub perf_off: f64,
    /// Décalage Z du calque et descente à chaque passe (mm), si la machine a un axe Z.
    #[serde(default)]
    pub z_offset: f64,
    #[serde(default)]
    pub z_step: f64,
    /// Ligne : prolonge les contours fermés au-delà du point de départ (mm).
    #[serde(default)]
    pub overcut: f64,
    /// Ligne : montée et descente progressives de la puissance (mm) depuis `ramp_min` (%).
    #[serde(default)]
    pub ramp_length: f64,
    #[serde(default)]
    pub ramp_min: f64,
    /// Ligne : mode points, un tir de `dot_time` ms tous les `dot_spacing` mm.
    #[serde(default)]
    pub dot_mode: bool,
    #[serde(default)]
    pub dot_time: f64,
    #[serde(default)]
    pub dot_spacing: f64,
    /// Sens de parcours des contours fermés.
    #[serde(default)]
    pub direction: Direction,
    /// Conserver le point de départ de chaque contour (sinon : sommet le plus proche).
    #[serde(default)]
    pub keep_start: bool,
    /// Découper les formes intérieures avant les extérieures.
    #[serde(default = "yes")]
    pub inner_first: bool,
    /// Demi-teinte : taille de cellule (pixels) et angle de trame (degrés).
    #[serde(default)]
    pub halftone_cell: f64,
    #[serde(default)]
    pub halftone_angle: f64,
    /// Image « 3D tranchée » : nombre de passes à seuils croissants (les zones sombres
    /// sont gravées plus de fois, donc plus profond). 0 ou 1 : désactivé.
    #[serde(default)]
    pub image_slices: u32,
    /// Optimisation du parcours (Outils laser → Paramètres d'optimisation).
    #[serde(default)]
    pub optimize: Optimize,
    /// Amorces d'entrée et de sortie des contours fermés (mm, 0 = aucune) : en arc ou
    /// droites, vers l'extérieur (ou l'intérieur) de la forme.
    #[serde(default)]
    pub lead_in: f64,
    #[serde(default)]
    pub lead_out: f64,
    #[serde(default)]
    pub lead_arc: bool,
    #[serde(default)]
    pub lead_inward: bool,
    /// Pauses au début et à la fin de chaque tracé (ms), laser allumé à `pause_power` %
    /// (0 : puissance du calque) — mode « traverser » pour les matériaux épais.
    #[serde(default)]
    pub start_pause: f64,
    #[serde(default)]
    pub end_pause: f64,
    #[serde(default)]
    pub pause_power: f64,
    /// Puissance constante (M3) pour ce calque, même si la machine travaille en M4.
    #[serde(default)]
    pub constant_power: bool,
    /// Remplissage : angle ajouté à chaque passe (°).
    #[serde(default)]
    pub angle_increment: f64,
    /// Remplissage : chaque groupe rempli d'un bloc (sinon tout le calque, ou forme par forme).
    #[serde(default)]
    pub fill_groups: bool,
    /// Remplissage avec rampe (`ramp_length`) : rampe aussi le contour extérieur
    /// (à désactiver pour les tampons, dont le cadre reste net).
    #[serde(default)]
    pub ramp_outer: bool,
    /// Remplissage par zones : chaque zone est balayée entièrement avant la suivante.
    #[serde(default)]
    pub flood_fill: bool,
    /// Relief 3D en tranches : passe de nettoyage toutes les N tranches (0 = jamais), sur toute l'image ou la zone creusée.
    #[serde(default)]
    pub cleanup_every: u32,
    #[serde(default)]
    pub cleanup_whole: bool,
    /// Assistance d'air seulement pendant la découpe (coupée pendant les déplacements).
    #[serde(default)]
    pub air_cut_only: bool,
    /// Attaches automatiques d'après l'espacement (mm, 0 = nombre fixe), bornées par min / max (0 = sans).
    #[serde(default)]
    pub tab_spacing: f64,
    #[serde(default)]
    pub tab_min: u32,
    #[serde(default)]
    pub tab_max: u32,
    /// Attaches automatiques : pas sur les formes intérieures ; puissance des attaches
    /// (%, 0 = laser éteint) pour les découper en partie.
    #[serde(default)]
    pub tab_skip_inner: bool,
    #[serde(default)]
    pub tab_power: f64,
    /// Image : largeur du point laser (mm) ; chaque passage allumé est raccourci d'autant
    /// pour que les zones gravées ne débordent pas.
    #[serde(default)]
    pub dot_width: f64,
    pub paths: Vec<Polyline>,
    pub images: Vec<JobImage>,
}

/// Côté du plateau par lequel commencer (découpe dans l'ordre d'une direction).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Optimize {
    /// Réordonner les tracés ; sinon, ordre du dessin et points de départ d'origine.
    pub reorder: bool,
    /// Aller au tracé le plus proche (réduit les déplacements à vide).
    pub reduce_travel: bool,
    /// Découper dans l'ordre d'une direction (prioritaire sur le plus proche).
    pub direction_order: Option<Side>,
    /// Commencer chaque contour fermé au sommet le plus proche.
    pub best_start: bool,
    /// Préférer un angle comme point de départ.
    pub corners: bool,
    /// Autoriser l'inversion des tracés ouverts.
    pub best_direction: bool,
    /// Masquer le jeu mécanique : approche sur cette distance (mm) dans le sens de la découpe.
    pub backlash: f64,
}

impl Default for Optimize {
    fn default() -> Self {
        Self { reorder: true, reduce_travel: true, direction_order: None, best_start: true, corners: false, best_direction: true, backlash: 0.0 }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub machine: MachineSettings,
    pub layers: Vec<JobLayer>,
    /// Nombre d'exécutions successives du travail (1 = une fois).
    #[serde(default = "one")]
    pub repeat: u32,
}
