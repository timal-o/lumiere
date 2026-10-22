// Actions de la barre de menus native (événement « menu » émis par le cœur Rust).

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  align, booleanSelection, breakApart, centerOnBedSelection, combine, convertToPath, deleteDuplicates, deleteSelection,
  distribute, duplicateSelection, exportGcode, exportSvgFile, frameHull, frameJob, group, importFiles, invertSelection,
  makePreview, mirrorH, mirrorV, newProject, openProject, pasteInPlace, reorderSelection, rotate, saveProject, selectAll,
  selectOpenShapes, startJob, ungroup, type Align, applyPathToText, maskImage, pushToEdge, saveProcessedBitmap, runGcodeFile, exportRuida,
  pushToCorner, selectCurrentLayer, moveLaserToSelection, refreshImages, exportJobLog, editArray, flattenArray, addToArray, removeFromArray, duplicateArray,
  openPath, fileFromPath,
} from "./actions";
import { isTauri } from "./backend";
import { currentDictionary, language, languageLabel, LOCALES, onLanguageChange, setLanguage } from "./i18n";
import { getLaserState, isDebugLog, laser, setDebugLog } from "./laser";
import { getState, labelNext, redo, setState, subscribe, undo, type Bar, type Tool } from "./store";
import { openDialog, type DialogName } from "./ui/Dialogs";
import {
  backupPrefs, clearRecent, exportBundle, exportPrefs, importBundle, importPrefs, newWindow, openRecent, printDesign,
  saveAsTemplate, saveBackgroundCapture,
} from "./files";
import { recentList } from "./recent";
import { menuParams } from "./hotkeys";
import { checkUpdates, openDiscussions, openDocs, reportBug, requestFeature, saveSupportData } from "./help";
import { alignToTargets, jogScreen, recordTarget, resetPrintCut } from "./lasertools";
import {
  autoGroup, closePaths, cropImage, cutShapes, dock, flashCurrentLayer, mirrorAcrossLine, moveTogether, pathFromCut, pushStep,
  recoverArcsSelection, replaceImage, reverseDirection, rubberBand, selectContained, selectOpenFill, selectSmaller, setLocked,
  tangentCircles, makeSameSize,
} from "./shapeops";

const editing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
};

const event = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

/** Dans un champ texte, Annuler/Rétablir/Tout sélectionner agissent sur le texte. */
function textOr(action: () => void, native: "undo" | "redo" | "selectAll") {
  const el = editing();
  if (!el) return action();
  if (native === "selectAll") el.select();
  else document.execCommand(native);
}

const DIALOGS: DialogName[] = [
  "machine", "offset", "array", "qr", "trace", "materialTest", "library", "fillet", "join", "simplify", "nest", "alongPath", "outline",
  "bitmap", "barcode", "notes", "macros", "grbl", "printCut", "art", "camera", "guide", "about", "settings", "closeTol", "boolean", "adjustImage", "history", "prefsBackups", "taper", "license", "usageData", "slots", "multiTrace", "hotkeys", "optimization", "centerFinder", "pcb", "newDevice", "console", "profiles",
];

function setView(viewFilled: boolean, viewSmooth: boolean) {
  setState({ toolOptions: { ...getState().toolOptions, viewFilled, viewSmooth } });
}

function toggleBar(bar: Bar) {
  const o = getState().toolOptions;
  const hiddenBars = o.hiddenBars.includes(bar) ? o.hiddenBars.filter((b) => b !== bar) : [...o.hiddenBars, bar];
  setState({ toolOptions: { ...o, hiddenBars } });
}

const BARS: Bar[] = ["main", "numeric", "creation", "arrange", "palette", "pages"];

/** Coches du menu Fenêtre (style de vue, barres) d'après les préférences. */
function syncViewChecks() {
  const o = getState().toolOptions;
  const style = `${o.viewFilled ? "filled" : "wire"}${o.viewSmooth ? "Smooth" : "Coarse"}`;
  for (const s of ["wireCoarse", "wireSmooth", "filledCoarse", "filledSmooth"]) syncMenuCheck(`view:${s}`, s === style);
  for (const b of BARS) syncMenuCheck(`bar:${b}`, !o.hiddenBars.includes(b));
  syncMenuCheck("beginner", !!o.beginner);
}

/** Outil Polygone avec un nombre de côtés prédéfini (triangle, pentagone, octogone). */
function polygonTool(sides: number) {
  setState({ tool: "polygon", toolOptions: { ...getState().toolOptions, polygonSides: sides } });
}

const ACTIONS: Record<string, () => unknown> = {
  new: newProject,
  open: () => openProject(),
  save: () => saveProject(),
  saveAs: () => saveProject(true),
  import: () => importFiles(),
  exportSvg: () => exportSvgFile(false),
  exportGcode: () => exportGcode(),
  undo: () => textOr(undo, "undo"),
  redo: () => textOr(redo, "redo"),
  selectAll: () => textOr(selectAll, "selectAll"),
  pasteInPlace,
  duplicate: duplicateSelection,
  delete: deleteSelection,
  invertSelection,
  selectOpen: selectOpenShapes,
  convertToPath,
  deleteDuplicates,
  pathToText: applyPathToText,
  maskImage,
  saveBitmap: saveProcessedBitmap,
  selectLayer: selectCurrentLayer,
  newWindow,
  "help:forum": openDiscussions,
  "help:feature": requestFeature,
  "help:docs": openDocs,
  "help:bug": reportBug,
  "help:support": saveSupportData,
  "help:updates": checkUpdates,
  "help:debug": () => {
    setDebugLog(!isDebugLog());
    syncMenuCheck("help:debug", isDebugLog());
  },
  beginner: () => {
    setState({ toolOptions: { ...getState().toolOptions, beginner: !getState().toolOptions.beginner } });

  },
  "view:wireCoarse": () => setView(false, false),
  "view:wireSmooth": () => setView(false, true),
  "view:filledCoarse": () => setView(true, false),
  "view:filledSmooth": () => setView(true, true),
  "view:toggle": () => setView(!getState().toolOptions.viewFilled, getState().toolOptions.viewSmooth),
  "pc:first": () => recordTarget(0),
  "pc:second": () => recordTarget(1),
  "pc:align": () => alignToTargets(false),
  "pc:alignNoScale": () => alignToTargets(true),
  "pc:reset": resetPrintCut,
  "laser:goSelection": () => moveLaserToSelection(4),
  "laser:goUL": () => moveLaserToSelection(0),
  "laser:goUR": () => moveLaserToSelection(2),
  "laser:goLL": () => moveLaserToSelection(6),
  "laser:goLR": () => moveLaserToSelection(8),
  "laser:goL": () => moveLaserToSelection(3),
  "laser:goR": () => moveLaserToSelection(5),
  "laser:goT": () => moveLaserToSelection(1),
  "laser:goB": () => moveLaserToSelection(7),
  sameWidth: () => makeSameSize("w"),
  sameHeight: () => makeSameSize("h"),
  "jog:left": () => jogScreen(-1, 0),
  "jog:right": () => jogScreen(1, 0),
  "jog:up": () => jogScreen(0, 1),
  "jog:down": () => jogScreen(0, -1),
  saveTemplate: saveAsTemplate,
  "prefs:import": importPrefs,
  "prefs:export": exportPrefs,
  "prefs:backups": () => openDialog("prefsBackups"),
  "bundle:import": importBundle,
  "bundle:export": exportBundle,
  printBlack: () => printDesign(false),
  printColor: () => printDesign(true),
  saveCapture: saveBackgroundCapture,
  closePath: () => closePaths(),
  reverseDirection,
  recoverArcs: () => recoverArcsSelection(),
  pathFromCut,
  selectOpenFill,
  selectContained,
  selectSmaller,
  selectCircles: () => openDialog("circleSelect"),
  flashLayer: flashCurrentLayer,
  refreshImage: refreshImages,
  replaceImage: () => replaceImage(false),
  replaceImageFit: () => replaceImage(true),
  cropImage,
  cutShapes,
  "shape:triangle": () => polygonTool(3),
  "shape:pentagon": () => polygonTool(5),
  "shape:octagon": () => polygonTool(8),
  autoGroup,
  mirrorLine: mirrorAcrossLine,
  "together:x": () => moveTogether("x"),
  "together:y": () => moveTogether("y"),
  "dock:left": () => dock("left"),
  "dock:right": () => dock("right"),
  "dock:up": () => dock("up"),
  "dock:down": () => dock("down"),
  rubberBand,
  tangentCircle: tangentCircles,
  pushForward: () => pushStep(true),
  pushBackward: () => pushStep(false),
  lock: () => setLocked(true),
  unlock: () => setLocked(false),
  "move:center": centerOnBedSelection,
  "move:topLeft": () => pushToCorner(["top", "left"]),
  "move:topRight": () => pushToCorner(["top", "right"]),
  "move:bottomLeft": () => pushToCorner(["bottom", "left"]),
  "move:bottomRight": () => pushToCorner(["bottom", "right"]),
  "move:left": () => pushToEdge("left"),
  "move:right": () => pushToEdge("right"),
  "move:top": () => pushToEdge("top"),
  "move:bottom": () => pushToEdge("bottom"),
  arrayGrid: () => openDialog("array"),
  editArray,
  jobLog: exportJobLog,
  flattenArray,
  addToArray,
  removeFromArray,
  duplicateArray,
  arrayCircular: () => openDialog("array", "radial"),
  intervalTest: () => openDialog("materialTest", "Intervalle"),
  focusTest: () => openDialog("materialTest", "Focus (Z)"),
  rotary: () => openDialog("machine"),
  "panels:toggle": () => event("lumiere:panels", "toggle"),
  "panels:reset": () => event("lumiere:panels", "reset"),
  weld: () => booleanSelection("union"),
  union: () => booleanSelection("union"),
  difference: () => booleanSelection("difference"),
  intersection: () => booleanSelection("intersection"),
  xor: () => booleanSelection("xor"),
  group,
  ungroup,
  breakApart,
  combine,
  mirrorH,
  mirrorV,
  rotateCw: () => rotate(90),
  rotateCcw: () => rotate(-90),
  toFront: () => reorderSelection(true),
  toBack: () => reorderSelection(false),
  preview: () => makePreview(),
  zoomIn: () => event("lumiere:zoom", "in"),
  zoomOut: () => event("lumiere:zoom", "out"),
  zoomFit: () => event("lumiere:fit"),
  zoomSelection: () => event("lumiere:zoom", "selection"),
  shortcuts: () => event("lumiere:shortcuts"),
  "laser:connect": () => (getLaserState().connected ? laser.disconnect() : laser.connect(getState().machine)),
  "laser:home": laser.home,
  "laser:unlock": laser.unlock,
  "laser:goOrigin": laser.goOrigin,
  "laser:setOrigin": laser.setUserOrigin,
  "laser:frame": () => frameJob(),
  "laser:frameHull": () => frameHull(),
  "laser:start": () => startJob(),
  "laser:runFile": runGcodeFile,
  exportRuida,
  "laser:pause": () => (getLaserState().status?.state === "Hold" ? laser.resume() : laser.pause()),
  "laser:stop": laser.stop,
};

/** Nom traduit de chaque commande du menu (historique des annulations). */
let commandNames = new Map<string, string>();

export function handleMenu(id: string) {
  // La modification qui suit porte le nom de la commande.
  labelNext(commandNames.get(id) ?? null);
  setTimeout(() => labelNext(null), 0);
  if (id.startsWith("lang:")) return setLanguage(id.slice(5));
  const recent = /^(recent|template):(\w+)$/.exec(id);
  if (recent) {
    const kind = recent[1] === "recent" ? "project" : "template";
    return recent[2] === "clear" ? clearRecent(kind) : openRecent(kind, Number(recent[2]));
  }
  if (id.startsWith("tool:")) return setState({ tool: id.slice(5) as Tool });
  if (id.startsWith("align:")) return align(id.slice(6) as Align);
  if (id.startsWith("distribute:")) return distribute(id[11] as "x" | "y", id.endsWith("Space"));
  if (id.startsWith("panel:")) return event("lumiere:panel", id.slice(6));
  if (id.startsWith("bar:")) return toggleBar(id.slice(4) as Bar);
  if ((DIALOGS as string[]).includes(id)) return openDialog(id as DialogName);
  ACTIONS[id]?.();
}

/** Coche les cases du menu selon l'état (magnétisme, panneaux). */
export function syncMenuCheck(id: string, checked: boolean) {
  if (isTauri()) invoke("set_menu_checked", { id, checked }).catch(() => {});
}

/** Envoie les libellés traduits au menu natif, qui se reconstruit, puis remet les coches. */
async function applyMenuLanguage() {
  await invoke("set_menu_labels", {
    labels: currentDictionary(),
    // Menu Langue, comme celui de LightBurn : trié par code de langue.
    languages: [...LOCALES].sort((a, b) => a.code.localeCompare(b.code)).map((l) => [l.code, languageLabel(l)]),
    current: language(),
    recent: recentList("project"),
    templates: recentList("template"),
    ...menuParams(),
  }).catch(() => {});
  syncViewChecks();
  syncMenuCheck("help:debug", isDebugLog());
  invoke<{ id: string; label: string }[]>("menu_catalog")
    .then((list) => (commandNames = new Map(list.map((c) => [c.id, c.label]))))
    .catch(() => {});
  window.dispatchEvent(new Event("lumiere:menu-rebuilt"));
}

let installed = false;

export function installMenu() {
  // L'interface est remontée à chaque changement de langue : une seule installation.
  if (!isTauri() || installed) return;
  installed = true;
  // Le cœur Rust envoie chaque action du menu à la fenêtre active seulement.
  const win = getCurrentWebviewWindow();
  win.listen<string>("menu", (e) => handleMenu(e.payload));
  applyMenuLanguage();
  onLanguageChange(applyMenuLanguage);
  window.addEventListener("lumiere:menu-refresh", () => applyMenuLanguage());
  if (win.label === "main") {
    backupPrefs();
    // Fichiers ouverts depuis le Finder ou passés en argument : projets ouverts, le reste importé.
    const openPending = async () => {
      const paths = await invoke<string[]>("take_pending_opens").catch(() => [] as string[]);
      for (const p of paths) {
        if (/\.(lum|lbrn2?)$/i.test(p)) await openPath(p);
        else await importFiles([await fileFromPath(p)]);
      }
    };
    // D'abord écouter, puis récupérer ce qui est déjà arrivé : aucun fichier ne peut se perdre entre les deux.
    void win.listen("open-files", () => void openPending()).then(openPending);
  }
  let last = getState().toolOptions;
  subscribe(() => {
    if (getState().toolOptions !== last) {
      last = getState().toolOptions;
      syncViewChecks();
    }
  });
}
