import { useSyncExternalStore } from "react";
import type { GcodeResult } from "./backend";
import { setShxDir, setTextVariables, type TextVariables } from "./text";
import {
  DEFAULT_MACHINE, emptyProject, migrateProject, newLayer, setDefaultCut, type CutSettings, type Layer, type MachineSettings, type Mat, type Project,
  type Shape,
} from "./model";

import type { Toolpath } from "./toolpath";
import { t } from "./i18n";
import { syncLinks } from "./materials";

export type Tool = "select" | "node" | "measure" | "trim" | "tab" | "position" | "line" | "rect" | "ellipse" | "polygon" | "star" | "text"
  | "twoPoint" | "warp" | "deform" | "dualStar" | "roundCorners";

export interface ToolOptions {
  polygonSides: number;
  starPoints: number;
  /** Rayon intérieur / rayon extérieur. */
  starRatio: number;
  cornerRadius: number;
  /** Magnétisme : grille (pas en mm) et points des objets (nœuds, coins, centres). */
  snapGrid: boolean;
  gridSize: number;
  snapObjects: boolean;
  /** Unité d'affichage des vitesses (par minute ou par seconde). */
  speedUnit: "mm/min" | "mm/s";
  /** Unité d'affichage des longueurs ; le projet reste toujours en millimètres. */
  units: "mm" | "in";
  /** Fenêtre → Style de vue : calques Remplissage remplis, tracés lissés. */
  viewFilled: boolean;
  viewSmooth: boolean;
  /** Barres d'outils masquées (Fenêtre). */
  hiddenBars: Bar[];
  /** Paramètres → Édition : sauvegarde automatique (s après une modification, 0 = jamais). */
  autosaveDelay: number;
  /** Déplacement aux flèches (mm) : normal, avec Maj, avec ⌥. */
  arrowStep: number;
  arrowStepLarge: number;
  arrowStepSmall: number;
  /** Tolérances en pixels : clic de sélection, magnétisme des objets. */
  clickTolerance: number;
  snapDistance: number;
  invertWheel: boolean;
  /** Revenir à l'outil Sélection après avoir dessiné une forme. */
  selectAfterDraw: boolean;
  /** Affichage : croix au centre du plateau, curseur en lignes plein écran, pas de la grille (mm). */
  centerCross: boolean;
  fullCursor: boolean;
  gridSpacing: number;
  /** Texte : police (famille) et hauteur par défaut. */
  defaultFontFamily: string;
  defaultTextHeight: number;
  /** Dossier des polices SHX (vide : aucune). */
  shxDir: string;
  /** Aperçu : teinte selon la puissance, blanc sur noir, déplacements à vide affichés. */
  previewShade: boolean;
  previewInvert: boolean;
  previewTravel: boolean;
  /** Manipulations à la souris autorisées : déplacer, tourner, redimensionner, cisailler. */
  dragMove: boolean;
  dragRotate: boolean;
  dragScale: boolean;
  dragShear: boolean;
  /** Mode débutant : interface simplifiée (réglages courants seulement). */
  beginner: boolean;
  /** Apparence : thème, taille des icônes, numéros sur la palette. */
  theme: "system" | "light" | "dark";
  iconSize: "small" | "normal" | "large";
  paletteLabels: boolean;
  /** Afficher la dernière position connue de la tête quand le laser est déconnecté. */
  showLastPos: boolean;
  /** Panneaux latéraux : côté de la fenêtre et ordre. */
  panelSide?: "left" | "right";
  panelOrder?: ("properties" | "layers" | "laser")[];
  /** Les formes entièrement hors du plateau ne sont pas envoyées. */
  ignoreOutOfBounds?: boolean;
  /** Import : centrer sur le plateau, grouper les formes d'un fichier, résolution des SVG, précision HPGL. */
  importCenter: boolean;
  importGroup: boolean;
  svgDpi: 72 | 96;
  hpglPerInch: 1016 | 1000;
}

export type Bar = "main" | "numeric" | "creation" | "arrange" | "palette" | "pages";

/** Une barre d'outils est-elle affichée (Fenêtre → barres) ? */
export const useBar = (bar: Bar) => useStore((s) => !s.toolOptions.hiddenBars.includes(bar));

export interface Device {
  id: string;
  name: string;
  machine: MachineSettings;
}

export interface Macro {
  name: string;
  gcode: string;
}

export type StartFrom = "absolute" | "current" | "user";

export interface JobOrigin {
  startFrom: StartFrom;
  /** Point d'ancrage 0–8 (de gauche à droite, de haut en bas). */
  anchor: number;
}

export interface Preview {
  result: GcodeResult;
  toolpath: Toolpath;
  warnings: string[];
  /** Nombre de segments affichés par la simulation. */
  shown: number;
}

export interface AppState {
  project: Project;
  selection: string[];
  currentLayer: number;
  tool: Tool;
  machine: MachineSettings;
  /** Chemin du fichier projet ouvert, pour « Enregistrer ». */
  filePath: string | null;
  dirty: boolean;
  preview: Preview | null;
  toolOptions: ToolOptions;
  jobOrigin: JobOrigin;
  /** Nœuds sélectionnés (« tracé:nœud ») de la forme en cours d'édition. */
  nodeSel: string[];
  /** Profils de machines ; `machine` est une copie de celui en cours. */
  devices: Device[];
  deviceId: string;
  textVars: TextVariables;
  macros: Macro[];
  /** Imprimer et découper : transformation plateau → position réelle mesurée au laser. */
  alignment: Mat | null;
  /** Nombre de répétitions du prochain travail (non enregistré). */
  jobRepeat: number;
}

const PERSISTED = {
  machine: "lumiere.machine",
  toolOptions: "lumiere.toolOptions",
  jobOrigin: "lumiere.jobOrigin",
  devices: "lumiere.devices",
  deviceId: "lumiere.deviceId",
  textVars: "lumiere.textVars",
  macros: "lumiere.macros",
} as const;

function load<T>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw && Array.isArray(defaults)) return JSON.parse(raw);
    if (raw && typeof defaults !== "object") return JSON.parse(raw);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // stockage indisponible : valeurs par défaut
  }
  return defaults;
}

// Réglages de calque par défaut de l'utilisateur.
setDefaultCut(load<Partial<CutSettings>>("lumiere.layerDefault", {}));

const initialMachine = load(PERSISTED.machine, DEFAULT_MACHINE);
const initialDevices = load<Device[]>(PERSISTED.devices, []).map((d) => ({ ...d, machine: { ...DEFAULT_MACHINE, ...d.machine } }));
if (!initialDevices.length) initialDevices.push({ id: "default", name: t("Ma machine"), machine: initialMachine });

const DEFAULT_MACROS: Macro[] = [
  { name: t("Laser 1 % (repérage)"), gcode: "M3 S10\nG1 F100\n" },
  { name: t("Laser éteint"), gcode: "M5" },
  { name: t("Réglages GRBL"), gcode: "$$" },
];

let state: AppState = {
  project: emptyProject(),
  selection: [],
  currentLayer: 0,
  tool: "select",
  machine: initialMachine,
  filePath: null,
  dirty: false,
  preview: null,
  toolOptions: load(PERSISTED.toolOptions, {
    polygonSides: 6, starPoints: 5, starRatio: 0.5, cornerRadius: 0, snapGrid: false, gridSize: 1, snapObjects: true, speedUnit: "mm/min",
    viewFilled: true, viewSmooth: true, hiddenBars: [], units: "mm",
    autosaveDelay: 3, arrowStep: 1, arrowStepLarge: 10, arrowStepSmall: 0.1, clickTolerance: 5, snapDistance: 8, invertWheel: false,
    selectAfterDraw: true, centerCross: false, fullCursor: false, gridSpacing: 10, defaultFontFamily: "", defaultTextHeight: 10, shxDir: "", previewShade: false, previewInvert: false, previewTravel: true, dragMove: true, dragRotate: true, dragScale: true, dragShear: true, beginner: false, theme: "system", iconSize: "normal", paletteLabels: false, showLastPos: true,
    importCenter: true, importGroup: true, svgDpi: 96, hpglPerInch: 1016,
  }),
  jobOrigin: load(PERSISTED.jobOrigin, { startFrom: "absolute", anchor: 6 }),
  nodeSel: [],
  devices: initialDevices,
  deviceId: load(PERSISTED.deviceId, initialDevices[0].id),
  textVars: load(PERSISTED.textVars, { serial: 1, step: 1, digits: 3 }),
  macros: load(PERSISTED.macros, DEFAULT_MACROS),
  alignment: null,
  jobRepeat: 1,
};
setTextVariables(state.textVars);

const listeners = new Set<() => void>();
const undoStack: Project[] = [];
const redoStack: Project[] = [];

export function getState(): AppState {
  return state;
}

setShxDir(state.toolOptions.shxDir ?? "");

export function setState(patch: Partial<AppState>) {
  // L'aperçu ne correspond plus au projet dès que celui-ci change.
  const stale = patch.project && patch.project !== state.project && !("preview" in patch);
  // Les réglages machine modifiés sont recopiés dans le profil courant.
  if (patch.machine && !patch.devices) {
    patch = { ...patch, devices: state.devices.map((d) => (d.id === (patch.deviceId ?? state.deviceId) ? { ...d, machine: patch.machine! } : d)) };
  }
  if (patch.textVars) setTextVariables(patch.textVars);
  if (patch.toolOptions) setShxDir(patch.toolOptions.shxDir ?? "");
  state = { ...state, ...patch, ...(stale ? { preview: null } : {}) };
  for (const [field, key] of Object.entries(PERSISTED)) {
    if (field in patch) {
      try {
        localStorage.setItem(key, JSON.stringify(patch[field as keyof AppState]));
      } catch {
        // ignoré
      }
    }
  }
  listeners.forEach((l) => l());
}

/** Abonnement hors React (renvoie la fonction de désabonnement). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

/** Heure et nom de chaque état de l'historique (même indice que la pile d'annulation). */
const undoTimes: number[] = [];
const redoTimes: number[] = [];
const undoLabels: (string | null)[] = [];
const redoLabels: (string | null)[] = [];
/** Nom de la prochaine modification (commande du menu en cours, glisser…). */
let nextLabel: string | null = null;

export function labelNext(label: string | null) {
  nextLabel = label;
}

function pushUndo(label: string | null = nextLabel) {
  undoStack.push(state.project);
  undoTimes.push(Date.now());
  undoLabels.push(label);
  if (undoStack.length > 200) {
    undoStack.shift();
    undoTimes.shift();
    undoLabels.shift();
  }
  redoStack.length = 0;
  redoTimes.length = 0;
  redoLabels.length = 0;
}

/** Modifie le projet en enregistrant l'état précédent dans l'historique. */
export function commit(update: (p: Project) => Project, extra: Partial<AppState> = {}) {
  pushUndo();
  setState({ ...extra, project: update(state.project), dirty: true });
}

/** Début d'une interaction continue (glisser) : un seul point d'historique. */
export function checkpoint(label: string | null = null) {
  pushUndo(label);
}

/** Modification sans historique (pendant un glisser, après checkpoint). */
export function mutate(update: (p: Project) => Project) {
  setState({ project: update(state.project), dirty: true });
}

function existingIds(p: Project, sel: string[]) {
  const ids = new Set(p.shapes.map((s) => s.id));
  return sel.filter((id) => ids.has(id));
}

export function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(state.project);
  redoTimes.push(undoTimes.pop() ?? Date.now());
  redoLabels.push(undoLabels.pop() ?? null);
  setState({ project: prev, selection: existingIds(prev, state.selection), dirty: true });
}

export function redo() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(state.project);
  undoTimes.push(redoTimes.pop() ?? Date.now());
  undoLabels.push(redoLabels.pop() ?? null);
  setState({ project: next, selection: existingIds(next, state.selection), dirty: true });
}

export interface HistoryEntry {
  /** Position relative à l'état actuel : −2 = deux annulations, 0 = actuel, 1 = un rétablissement. */
  offset: number;
  shapes: number;
  time: number | null;
  /** Modification qui a mené à l'état suivant (« Souder », « Déplacer »…). */
  label: string | null;
}

/** Historique complet, du plus ancien au plus récent, pour la fenêtre « Historique des annulations ». */
export function history(): HistoryEntry[] {
  const past = undoStack.map((p, i) => ({ offset: i - undoStack.length, shapes: p.shapes.length, time: undoTimes[i] ?? null, label: undoLabels[i] ?? null }));
  const future = [...redoStack].reverse().map((p, i) => ({
    offset: i + 1, shapes: p.shapes.length, time: redoTimes[redoTimes.length - 1 - i] ?? null, label: redoLabels[redoLabels.length - 1 - i] ?? null,
  }));
  return [...past, { offset: 0, shapes: state.project.shapes.length, time: null, label: null }, ...future];
}

/** Revient (ou avance) de plusieurs pas dans l'historique. */
export function jumpHistory(offset: number) {
  for (let i = 0; i < -offset; i++) undo();
  for (let i = 0; i < offset; i++) redo();
}

export function loadProject(project: Project, filePath: string | null) {
  undoStack.length = 0;
  redoStack.length = 0;
  undoTimes.length = 0;
  redoTimes.length = 0;
  undoLabels.length = 0;
  redoLabels.length = 0;
  project = migrateProject(project);
  project = { ...project, layers: syncLinks(project.layers) };
  setState({ project, selection: [], filePath, dirty: false, currentLayer: project.layers[0]?.id ?? 0 });
  // Nouveau projet affiché : la vue montre tout le plateau.
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("lumiere:fit"));
}

/** Étend une sélection aux autres membres des groupes concernés. */
export function withGroups(ids: string[], shapes: Shape[]): string[] {
  const groups = new Set(shapes.filter((s) => ids.includes(s.id) && s.groupId).map((s) => s.groupId));
  if (!groups.size) return ids;
  return [...new Set([...ids, ...shapes.filter((s) => s.groupId && groups.has(s.groupId)).map((s) => s.id)])];
}

export function selectedShapes(): Shape[] {
  const ids = new Set(state.selection);
  return state.project.shapes.filter((s) => ids.has(s.id));
}

/** S'assure que le calque existe dans le projet (ajouté en fin d'ordre de sortie). */
export function withLayer(p: Project, id: number): Project {
  if (p.layers.some((l) => l.id === id)) return p;
  return { ...p, layers: [...p.layers, newLayer(id)] };
}

/** Change l'ordre de sortie d'un calque (l'ordre de la liste est l'ordre de gravure). */
export function moveLayer(id: number, dir: -1 | 1) {
  const layers = [...state.project.layers];
  const i = layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= layers.length) return;
  [layers[i], layers[j]] = [layers[j], layers[i]];
  commit((p) => ({ ...p, layers }));
}

export function addShapes(shapes: Shape[]) {
  if (!shapes.length) return;
  commit(
    (p) => shapes.reduce((acc, s) => withLayer(acc, s.layerId), { ...p, shapes: [...p.shapes, ...shapes] }),
    { selection: shapes.map((s) => s.id) },
  );
}

export function updateShapes(ids: string[], f: (s: Shape) => Shape, history = true) {
  const set = new Set(ids);
  const update = (p: Project) => ({ ...p, shapes: p.shapes.map((s) => (set.has(s.id) ? f(s) : s)) });
  if (history) commit(update);
  else mutate(update);
}

export function updateLayer(id: number, patch: Partial<Layer>) {
  commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
}

/** Retire les calques qui ne contiennent plus aucune forme (sauf le calque courant). */
export function pruneLayers(p: Project, keep: number): Project {
  // Les calques sont partagés entre les pages : ceux des autres pages sont gardés.
  const used = new Set([...p.shapes, ...(p.pages ?? []).flatMap((pg) => pg.shapes)].map((s) => s.layerId));
  used.add(keep);
  return { ...p, layers: p.layers.filter((l) => used.has(l.id)) };
}
