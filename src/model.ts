import type { BezPath } from "./bezier";
import { tk } from "./i18n";

// Modèle de données du projet. Unités : millimètres, repère plateau
// (origine en haut à gauche, Y vers le bas).

export type Pt = [number, number];
/** Matrice affine [a, b, c, d, e, f] : x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Mat = [number, number, number, number, number, number];

export interface Polyline {
  pts: Pt[];
  closed: boolean;
}

export type LayerMode = "line" | "fill" | "offsetFill" | "image";
export type DitherMode =
  | "threshold" | "ordered" | "floydSteinberg" | "jarvis" | "stucki" | "atkinson" | "halftone" | "grayscale" | "newsprint" | "sketch";
export type CutDirection = "any" | "cw" | "ccw";

/** Réglages de découpe d'un calque ou d'un sous-calque. */
export interface CutSettings {
  mode: LayerMode;
  speed: number; // mm/min
  power: number; // %
  minPower: number; // %
  passes: number;
  interval: number; // mm
  bidirectional: boolean;
  overscan: number; // mm
  dither: DitherMode;
  airAssist: boolean;
  /** Remplissage : angle de balayage (°), passe croisée, formes remplies une à une. */
  fillAngle: number;
  crossHatch: boolean;
  fillIndividually: boolean;
  /** Ligne : décalage de compensation du faisceau (mm, positif = vers l'extérieur). */
  kerf: number;
  tabCount: number;
  tabSize: number;
  perforate: boolean;
  perfOn: number;
  perfOff: number;
  zOffset: number;
  zStep: number;
  /** Ligne : dépassement du point de départ, rampe de puissance, mode points. */
  overcut: number;
  rampLength: number;
  rampMin: number;
  dotMode: boolean;
  dotTime: number; // ms
  dotSpacing: number; // mm
  /** Ordre et sens de découpe. */
  direction: CutDirection;
  keepStart: boolean;
  innerFirst: boolean;
  /** Demi-teinte : cellules par pouce et angle de trame. */
  halftoneLpi: number;
  halftoneAngle: number;
  /** Image 3D tranchée : nombre de passes à seuils croissants (1 = désactivé). */
  imageSlices: number;
  /** Ligne : les segments en double (bords communs) ne sont découpés qu'une fois. */
  removeOverlaps: boolean;
  /** Ligne : amorces d'entrée / de sortie (mm, 0 = aucune), en arc, vers l'intérieur. */
  leadIn: number;
  leadOut: number;
  leadArc: boolean;
  leadInward: boolean;
  /** Ligne : pauses laser allumé au début / à la fin de chaque tracé (ms), à `pausePower` % (0 = puissance du calque). */
  startPause: number;
  endPause: number;
  pausePower: number;
  /** Puissance constante (M3) pour ce calque. */
  constantPower: boolean;
  /** Remplissage : angle ajouté à chaque passe (°) ; groupes remplis ensemble. */
  angleIncrement: number;
  fillGroups: boolean;
  /** Remplissage avec rampe : rampe aussi le contour extérieur (désactivé pour les tampons). */
  rampOuter: boolean;
  /** Remplissage par zones : chaque zone est balayée entièrement avant la suivante (moins de trajets). */
  floodFill: boolean;
  /** Relief 3D : passe de nettoyage toutes les N tranches (0 = jamais), sur toute l'image ou la zone creusée. */
  cleanupEvery: number;
  cleanupWhole: boolean;
  /** Assistance d'air seulement pendant la découpe. */
  airCutOnly: boolean;
  /** Attaches d'après l'espacement (mm, 0 = nombre fixe), bornées par min / max (0 = sans). */
  tabSpacing: number;
  tabMin: number;
  tabMax: number;
  /** Attaches : pas sur les formes intérieures ; puissance des attaches (%, 0 = éteint). */
  tabSkipInner: boolean;
  tabPower: number;
  /** Image : négatif (pour l'acrylique, les miroirs, les surfaces sombres). */
  negative: boolean;
  /** Image : largeur du point laser (mm), retirée des passages allumés. */
  dotWidth: number;
}

/** Réglage supplémentaire appliqué aux mêmes formes (ex. remplissage puis contour). */
export interface SubLayer extends CutSettings {
  enabled: boolean;
  /** Nom affiché sur l'onglet (sinon le mode). */
  name?: string;
}

export interface Layer extends CutSettings {
  /** Index dans la palette, qui sert aussi d'identifiant. */
  id: number;
  name: string;
  output: boolean;
  visible: boolean;
  subLayers: SubLayer[];
  /** Passes globales : le calque et ses sous-calques sont répétés ensemble ce nombre de fois. */
  globalPasses?: number;
  /** Lien vers un réglage de la bibliothèque de matériaux : ses réglages suivent la bibliothèque. */
  libraryLink?: { id: string; label: string };
}

interface ShapeBase {
  id: string;
  layerId: number;
  /** Repère local → plateau. */
  matrix: Mat;
  name: string;
  /** Formes groupées : sélectionnées et déplacées ensemble. */
  groupId?: string;
  /** Attaches placées à la main (repère local), en mode Ligne. */
  tabs?: Pt[];
  /** Forme verrouillée : sélectionnable, mais ni déplacée ni transformée. */
  locked?: boolean;
  /** Priorité de découpe (Optimisation → Ordre par priorité) : les plus petites d'abord. */
  priority?: number;
  /** Copie générée par une répétition modifiable (identifiant dans `Project.arrays`). */
  arrayCopy?: string;
}

/** Répétition modifiable : réglages et formes d'origine, pour la recalculer ou l'aplatir. */
/** Options des grilles (comme LightBurn) ; toutes facultatives. */
export interface GridOptions {
  /** `gapX` / `gapY` sont des distances de centre à centre (sinon l'écart entre les bords). */
  pitch?: boolean;
  /** Une rangée sur deux décalée d'un demi-pas. */
  halfShift?: boolean;
  /** Décalage en X de chaque rangée, en Y de chaque colonne (mm). */
  rowShift?: number;
  colShift?: number;
  /** Miroir des colonnes / rangées impaires, horizontal (X) ou vertical (Y). */
  mirrorColsX?: boolean;
  mirrorColsY?: boolean;
  mirrorRowsX?: boolean;
  mirrorRowsY?: boolean;
  /** Vers la gauche et le haut au lieu de la droite et du bas. */
  reverse?: boolean;
  /** Orientation aléatoire de chaque copie (graine `seed`). */
  randomRotate?: boolean;
  seed?: number;
  /** Texte variable : décalage ajouté à chaque copie. */
  textStep?: number;
  /** Copies et formes d'origine groupées. */
  group?: boolean;
}

export type ArrayDef =
  | ({ kind: "grid"; cols: number; rows: number; gapX: number; gapY: number; source: string[] } & GridOptions)
  | { kind: "radial"; count: number; center: Pt; angle: number; rotate: boolean; source: string[];
      /** Angle ajouté à toutes les copies (°), copies groupées, incrément du texte variable. */
      start?: number; group?: boolean; textStep?: number };

/** Forme de base restée paramétrique (modifiable dans les propriétés), repère local 0…w × 0…h. */
export type Primitive =
  | { type: "rect"; w: number; h: number; radius: number }
  | { type: "ellipse"; w: number; h: number }
  | { type: "polygon"; w: number; h: number; sides: number }
  | { type: "star"; w: number; h: number; points: number; ratio: number; bulge?: number }
  /** Étoile double : pointes longues et courtes (rapport `ratio2`) alternées. */
  | { type: "dualStar"; w: number; h: number; points: number; ratio: number; ratio2: number; bulge?: number };

export interface VectorShape extends ShapeBase {
  kind: "vector";
  /** Polylignes dans le repère local (dérivées de `curves` si présentes). */
  paths: Polyline[];
  /** Courbes d'origine, éditables par nœuds. */
  curves?: BezPath[];
  primitive?: Primitive;
}

export interface ImageAdjust {
  brightness: number; // −100 … 100
  contrast: number; // −100 … 100
  gamma: number; // 0,2 … 5
  invert: boolean;
  /** Accentuation (masque flou) : intensité (%) et rayon (mm) ; réduction du bruit (%). */
  enhanceAmount?: number;
  enhanceRadius?: number;
  denoise?: number;
}

export const DEFAULT_ADJUST: ImageAdjust = { brightness: 0, contrast: 0, gamma: 1, invert: false, enhanceAmount: 0, enhanceRadius: 0.5, denoise: 0 };

export interface ImageShape extends ShapeBase {
  kind: "image";
  /** Data URL de l'image d'origine. */
  src: string;
  /** Taille en mm dans le repère local. */
  width: number;
  height: number;
  adjust: ImageAdjust;
  /** Masque : seule la zone intérieure (pair-impair) est gravée ; repère local de l'image. */
  mask?: Polyline[];
  /** Fichier d'origine, pour Modifier → Options d'image → Actualiser l'image. */
  sourcePath?: string;
}

export interface FontRef {
  family: string;
  style: string;
  path: string;
  index: number;
}

export interface TextShape extends ShapeBase {
  kind: "text";
  text: string;
  font: FontRef;
  /** Hauteur des capitales (mm). */
  height: number;
  align: "left" | "center" | "right";
  letterSpacing: number; // mm
  lineSpacing: number; // multiple de la hauteur
  /** Souder les lettres qui se chevauchent (activé par défaut). */
  weld: boolean;
  /** Chemin suivi par le texte, dans le repère local du texte. */
  onPath?: { pts: Pt[]; closed: boolean; offset: number; distort?: boolean };
  /** Options de texte (comme LightBurn) : majuscules, alignement vertical, droite à gauche. */
  upperCase?: boolean;
  alignY?: TextAlignY;
  rtl?: boolean;
  /** Largeur maximale (mm, 0 = sans) : au-delà, le texte est resserré (ou réduit en entier). */
  maxWidth?: number;
  squeeze?: boolean;
  /** Texte variable : lignes vides retirées ; décalage du numéro de série / de la ligne CSV. */
  ignoreEmptyVars?: boolean;
  varOffset?: number;
  /** Courbure en arc (−100…100 % ; 100 % = cercle complet), lettres déformées le long de l'arc. */
  bend?: number;
  /** Tracés générés, repère local (origine = début de la ligne de base). */
  paths: Polyline[];
}

/** Position verticale du texte par rapport à son origine : ligne de base, haut, milieu, bas. */
export type TextAlignY = "baseline" | "top" | "middle" | "bottom";

export type Shape = VectorShape | ImageShape | TextShape;
export type PathShape = VectorShape | TextShape;

export const hasPaths = (s: Shape): s is PathShape => s.kind !== "image";

export interface Project {
  format: "lumiere";
  version: 1;
  layers: Layer[];
  shapes: Shape[];
  /** Notes libres enregistrées avec le projet (réglages, matériau…). */
  notes?: string;
  /**
   * Pages du projet (calques partagés). Les formes de la page affichée sont dans `shapes` ;
   * `pages[page].shapes` n'est à jour qu'à l'enregistrement et au changement de page.
   */
  pages?: Page[];
  page?: number;
  optimization?: Optimization;
  arrays?: Record<string, ArrayDef>;
  /** Mise en page : taille de la pièce de chaque page (index de page), affichée sur le plateau. */
  workpieces?: (Workpiece | null)[];
}

/** Pièce posée sur le plateau (mm) et son coin de référence. */
export interface Workpiece {
  w: number;
  h: number;
  anchor: "frontLeft" | "frontRight" | "rearLeft" | "rearRight" | "center";
}

/** Rectangle de la pièce sur le plateau (Y vers le bas, l'avant du plateau en bas de l'écran). */
export function workpieceRect(wp: Workpiece, bedWidth: number, bedHeight: number): { x: number; y: number; w: number; h: number } {
  const x = wp.anchor === "frontRight" || wp.anchor === "rearRight" ? bedWidth - wp.w : wp.anchor === "center" ? (bedWidth - wp.w) / 2 : 0;
  const y = wp.anchor === "rearLeft" || wp.anchor === "rearRight" ? 0 : wp.anchor === "center" ? (bedHeight - wp.h) / 2 : bedHeight - wp.h;
  return { x, y, w: wp.w, h: wp.h };
}

/** Paramètres d'optimisation du parcours, enregistrés avec le projet. */
export interface Optimization {
  /** Ordre de découpe : calque par calque, groupe par groupe, ou par priorité de forme. */
  order: "layer" | "group" | "priority";
  reorder: boolean;
  reduceTravel: boolean;
  directionOrder: "left" | "right" | "top" | "bottom" | null;
  bestStart: boolean;
  corners: boolean;
  bestDirection: boolean;
  /** Masquer le jeu mécanique : distance d'approche (mm), 0 = désactivé. */
  backlash: number;
  /** Les calques Ligne (découpes) passent après les gravures, pour que la pièce ne bouge pas avant. */
  cutsLast?: boolean;
}

export const DEFAULT_OPTIMIZATION: Optimization = {
  order: "layer", reorder: true, reduceTravel: true, directionOrder: null, bestStart: true, corners: false, bestDirection: true, backlash: 0,
};

export interface Page {
  name: string;
  shapes: Shape[];
}

export type Origin = "frontLeft" | "rearLeft" | "frontRight" | "rearRight";

export interface MachineSettings {
  bedWidth: number;
  bedHeight: number;
  origin: Origin;
  sMax: number;
  laserMode: "constant" | "dynamic";
  travelSpeed: number;
  returnToOrigin: boolean;
  /** Position de fin de travail (coordonnées machine) ; prioritaire sur le retour à l'origine. */
  finish?: Pt | null;
  baud: number;
  jogSpeed: number;
  zAxis: boolean;
  /** Décalage (mm) des lignes de balayage retour, pour compenser le retard du laser. */
  scanOffset: number;
  /** Décalages de balayage selon la vitesse : [vitesse (mm/min), décalage (mm)] (prioritaires s'il y en a). */
  scanOffsets?: [number, number][];
  startGcode: string;
  endGcode: string;
  airOn: "M8" | "M7";
  /** Rotatif à rouleaux sur l'axe Y : mm envoyés pour un tour, diamètre de l'objet. */
  rotary: boolean;
  rotaryMmPerRotation: number;
  rotaryDiameter: number;
  /** Type : à rouleaux (diamètre des rouleaux) ou à mandrin (diamètre de l'objet) ; axe Y (mm) ou A (degrés) ; sortie en miroir. */
  rotaryType?: "roller" | "chuck";
  rollerDiameter?: number;
  rotaryAxis?: "Y" | "A";
  rotaryMirror?: boolean;
  /** Contrôleur et liaison : USB série ou réseau (FluidNC, grblHAL, ESP32…). */
  /** Accélération (mm/s², $120 de GRBL) : sert à estimer la durée ; 0 = ignorée. */
  acceleration: number;
  firmware: "grbl" | "smoothie" | "marlin" | "ruida";
  connection: "serial" | "tcp";
  host: string;
  tcpPort: number;
  /** Options du contrôleur (Paramètres de l'appareil). */
  autoHome?: boolean;
  /** Jog avec $J= (GRBL 1.1) ; sinon déplacements G91 G0. */
  jogWithJ?: boolean;
  emitSAlways?: boolean;
  g0Overscan?: boolean;
  zReverse?: boolean;
  zRelative?: boolean;
  /** Décalage de mise au point ajouté aux positions Z (mm). */
  zFocusOffset?: number;
  /** Compensation du jeu mécanique (mm) et échange des axes en sortie. */
  backlashX?: number;
  backlashY?: number;
  swapXY?: boolean;
  /** Signal DTR à l'ouverture du port (indéfini : défaut du système) ; lecture des réglages ($$) à la connexion. */
  dtr?: boolean;
  fetchSettings?: boolean;
  /** G-code du cycle de mise au point automatique (palpage Z), propre à la machine. */
  autofocusGcode?: string;
  /** Codes d'erreur et d'alarme propres à la machine : numéro → description. */
  customCodes?: { errors?: Record<string, string>; alarms?: Record<string, string> };
  startDelay?: number;
  /** Avertir si le travail ou le cadrage sort de la zone de travail. */
  boundsWarning?: boolean;
  /** Pointeur laser rouge décalé de la tête (mm) : utilisé pour cadrer laser éteint. */
  pointerOffset?: Pt | null;
  /** Liste de vérification avant chaque travail. */
  checklist?: string[] | null;
  /** Échelle globale de vitesse (%) appliquée à tous les calques (100 = sans effet). */
  speedScale?: number;
  /** Bouton de tir d'essai (désactivé par défaut, par sécurité). */
  fireButton?: boolean;
}

export const PALETTE: string[] = [
  "#3d7cff", "#ff4b3e", "#2fc56b", "#ffb020", "#c04bff", "#16c6d6", "#ff6fb5", "#9bd12a",
  "#ff8a3d", "#6d6dff", "#e6e14a", "#00a37a", "#b5651d", "#8f8f8f", "#5ad1ff", "#ff3d7f",
  "#7a4dff", "#46d99b", "#d94646", "#c9a227",
];

export const DEFAULT_MACHINE: MachineSettings = {
  bedWidth: 400,
  bedHeight: 400,
  origin: "frontLeft",
  sMax: 1000,
  laserMode: "dynamic",
  travelSpeed: 6000,
  returnToOrigin: true,
  baud: 115200,
  jogSpeed: 3000,
  zAxis: false,
  scanOffset: 0,
  startGcode: "",
  endGcode: "",
  airOn: "M8",
  rotary: false,
  rotaryMmPerRotation: 100,
  rotaryDiameter: 80,
  acceleration: 1500,
  firmware: "grbl",
  connection: "serial",
  host: "192.168.0.10",
  tcpPort: 23,
};

export const DEFAULT_CUT: CutSettings = {
  mode: "line",
  speed: 1000,
  power: 30,
  minPower: 0,
  passes: 1,
  interval: 0.1,
  bidirectional: true,
  overscan: 2,
  dither: "jarvis",
  airAssist: false,
  fillAngle: 0,
  crossHatch: false,
  fillIndividually: false,
  kerf: 0,
  tabCount: 0,
  tabSize: 0.5,
  perforate: false,
  perfOn: 1,
  perfOff: 1,
  zOffset: 0,
  zStep: 0,
  overcut: 0,
  rampLength: 0,
  rampMin: 0,
  dotMode: false,
  dotTime: 10,
  dotSpacing: 0.5,
  direction: "any",
  keepStart: false,
  innerFirst: true,
  leadIn: 0,
  leadOut: 0,
  leadArc: false,
  leadInward: false,
  startPause: 0,
  endPause: 0,
  pausePower: 0,
  constantPower: false,
  angleIncrement: 0,
  fillGroups: false,
  rampOuter: false,
  floodFill: false,
  cleanupEvery: 0,
  cleanupWhole: false,
  airCutOnly: false,
  tabSpacing: 0,
  tabMin: 0,
  tabMax: 0,
  tabSkipInner: false,
  tabPower: 0,
  negative: false,
  dotWidth: 0,
  halftoneLpi: 40,
  halftoneAngle: 45,
  imageSlices: 1,
  removeOverlaps: false,
};

/** Réglages par défaut choisis par l'utilisateur (Calques → Définir par défaut). */
let userCut: Partial<CutSettings> = {};
export const setDefaultCut = (c: Partial<CutSettings>) => void (userCut = c);
export const defaultCut = (): CutSettings => ({ ...DEFAULT_CUT, ...userCut });

/** Calques outils (T1, T2) : jamais gravés, pour le cadrage, l'alignement ou des repères. */
export const TOOL_LAYERS = [100, 101];
export const isToolLayer = (id: number) => TOOL_LAYERS.includes(id);
const TOOL_COLORS = ["#e040fb", "#00bcd4"];

/** Couleur d'un calque (palette, ou couleur des calques outils). */
export const layerColor = (id: number) => (isToolLayer(id) ? TOOL_COLORS[id - TOOL_LAYERS[0]] : PALETTE[id % PALETTE.length]);

export function newLayer(id: number): Layer {
  if (isToolLayer(id)) return { ...defaultCut(), id, name: `T${id - TOOL_LAYERS[0] + 1}`, output: false, visible: true, subLayers: [] };
  return { ...defaultCut(), id, name: `C${String(id).padStart(2, "0")}`, output: true, visible: true, subLayers: [] };
}

/** Complète un projet enregistré par une version antérieure. */
export function migrateProject(p: Project): Project {
  return {
    ...p,
    layers: p.layers.map((l) => ({
      ...newLayer(l.id),
      ...l,
      subLayers: (l.subLayers ?? []).map((sub) => ({ ...DEFAULT_CUT, ...sub, enabled: sub.enabled ?? true })),
    })),
    shapes: p.shapes.map((s) =>
      s.kind === "image" ? { ...s, adjust: { ...DEFAULT_ADJUST, ...s.adjust } } : s.kind === "text" ? { ...s, weld: s.weld ?? true } : s,
    ),
  };
}

export function emptyProject(): Project {
  return { format: "lumiere", version: 1, layers: [newLayer(0)], shapes: [] };
}

let counter = 0;
export function uid(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export const MODE_LABEL: Record<LayerMode, string> = {
  line: tk("Ligne"),
  fill: tk("Remplissage"),
  offsetFill: tk("Remplissage concentrique"),
  image: tk("Image"),
};

export const DITHER_LABEL: Record<DitherMode, string> = {
  threshold: tk("Seuil"),
  ordered: tk("Ordonné"),
  floydSteinberg: "Floyd-Steinberg",
  jarvis: "Jarvis",
  stucki: "Stucki",
  atkinson: "Atkinson",
  halftone: tk("Demi-teinte"),
  grayscale: tk("Niveaux de gris"),
  newsprint: tk("Journal"),
  sketch: tk("Croquis"),
};
