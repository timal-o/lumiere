// Actions de l'application : fichiers, transformations, génération.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { api, isTauri } from "./backend";
import { ellipseBez, flattenBez, fromPolylines, roundedRectBez, transformBez, type BezNode, type BezPath } from "./bezier";
import {
  apply, bedToMachine, boxCenter, boxOfPoints, invert, matrixAngle, mul, pathsBox, polygonPath, rotateAbout, scaleAbout, shapeBox, translate, unionBoxes,
  worldPaths, type Box,
} from "./geometry";
import { barcodePaths, type BarcodeType } from "./barcode";
import { parseDxf } from "./import/dxf";
import { parseHpgl } from "./import/hpgl";
import { parseSvg, type ImportResult } from "./import/svg";
import { loadImage, readAsDataUrl } from "./images";
import { anchorPoint, buildJob, outputBox } from "./job";
import { getLaserState, jobCounter, jobLogCsv, laser, log, setJobName } from "./laser";
import {
  DEFAULT_ADJUST, emptyProject, hasPaths, PALETTE, TOOL_LAYERS, uid, type ArrayDef, type GridOptions, type ImageShape, type Mat, type Polyline, type Primitive, type Project, type Pt,
  type Shape, type TextShape, type VectorShape,
} from "./model";
import { booleanOp, offsetPaths, type BoolOp, type JoinKind } from "./pathops";
import { qrPaths, qrWithLogo, type QrLevel } from "./qr";
import { dataMatrixPaths } from "./datamatrix";
import { ditherRaw, renderGray } from "./raster";
import {
  addShapes, commit, getState, loadProject, pruneLayers, selectedShapes, setState, updateLayer, updateShapes, withGroups,
  withLayer,
} from "./store";
import { defaultFont, displayedText, hasVariables, listFonts, stepVariables, textPaths } from "./text";
import { gcodeFrom, parseToolpath } from "./toolpath";
import { edgeMap, traceBitmap, traceCenterline, type TraceOptions } from "./trace";
import { autoJoin, cornerNodes, filletNodes, parseKey } from "./nodeedit";
import { convexHull, exportSvg, nestBoxes, positionsAlong, sampler, shapePoints, simplifyPaths, trimAt } from "./tools";
import { language, t, translateMessage } from "./i18n";
import { addRecent } from "./recent";
import { pagesOf, projectForSave } from "./pages";

export function notify(msg: string) {
  window.dispatchEvent(new CustomEvent("lumiere:toast", { detail: translateMessage(msg) }));
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

async function saveText(defaultName: string, contents: string, ext: string, label: string): Promise<string | null> {
  if (!isTauri()) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(a.href);
    return defaultName;
  }
  const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
  if (!path) return null;
  await api.writeTextFile(path, contents);
  return path;
}

/**
 * Forme vectorielle à partir de tracés en coordonnées plateau (origine locale = coin
 * de la boîte). Les courbes, si fournies, restent éditables par nœuds.
 */
export function vectorFromWorld(paths: Polyline[], layerId: number, name: string, curves?: BezPath[]): Shape | null {
  const box = pathsBox(paths);
  if (!box) return null;
  return {
    id: uid(), kind: "vector", name, layerId, matrix: translate(box.x, box.y),
    paths: paths.map((p) => ({ closed: p.closed, pts: p.pts.map(([x, y]): Pt => [x - box.x, y - box.y]) })),
    curves: curves && transformBez(curves, translate(-box.x, -box.y)),
  };
}

// ---------------------------------------------------------------- Import

export function freeLayer(p: Project, from: number, taken: Set<number>): number {
  const used = new Set([...p.shapes.map((s) => s.layerId), ...taken]);
  for (let i = 0; i < PALETTE.length; i++) {
    const id = (from + i) % PALETTE.length;
    if (!used.has(id)) return id;
  }
  return from;
}

function centerOnBed(shapes: Shape[]): Shape[] {
  const box = unionBoxes(shapes.map(shapeBox));
  if (!box) return shapes;
  const { bedWidth, bedHeight } = getState().machine;
  const t = translate(bedWidth / 2 - (box.x + box.w / 2), bedHeight / 2 - (box.y + box.h / 2));
  return shapes.map((s) => ({ ...s, matrix: mul(t, s.matrix) }));
}

function vectorShapes(res: ImportResult, name: string): Shape[] {
  const st = getState();
  const taken = new Set<number>();
  const shapes: Shape[] = [];
  // Les couleurs d'un même fichier restent groupées (Paramètres → Import).
  const groupId = res.groups.length > 1 && st.toolOptions.importGroup ? uid() : undefined;
  res.groups.forEach((g, i) => {
    // Première couleur sur le calque courant, les suivantes sur des calques libres.
    const layerId = i === 0 ? st.currentLayer : freeLayer(st.project, st.currentLayer + 1, taken);
    taken.add(layerId);
    const s = vectorFromWorld(g.paths, layerId, res.groups.length > 1 ? `${name} (${g.color})` : name, g.curves);
    if (s) shapes.push({ ...s, groupId });
  });
  res.warnings.forEach(notify);
  return shapes;
}

/** Calque en mode Image pour accueillir une nouvelle image. */
function imageLayer(): number {
  const st = getState();
  const current = st.project.layers.find((l) => l.id === st.currentLayer);
  if (current?.mode === "image") return st.currentLayer;
  const existing = st.project.layers.find((l) => l.mode === "image");
  if (existing) return existing.id;
  const id = freeLayer(st.project, st.currentLayer, new Set());
  const p = withLayer(st.project, id);
  setState({ project: { ...p, layers: p.layers.map((l) => (l.id === id ? { ...l, mode: "image" as const } : l)) } });
  return id;
}

/** Ajoute une image (data URL) de `width` × `height` mm, centrée sur le plateau, sur un calque Image. */
export function addImage(src: string, width: number, height: number, name: string) {
  const { bedWidth, bedHeight } = getState().machine;
  const shape: ImageShape = {
    id: uid(), kind: "image", name, layerId: imageLayer(), matrix: translate((bedWidth - width) / 2, (bedHeight - height) / 2), src,
    width, height, adjust: { ...DEFAULT_ADJUST },
  };
  addShapes([shape]);
}

/** Modèle 3D en attente de conversion (Fichier → Importer un .stl). */
export let pendingModel: { name: string; triangles: Float32Array } | null = null;

async function imageShape(file: File): Promise<Shape> {
  const src = await readAsDataUrl(file);
  const img = await loadImage(src);
  const st = getState();
  // 0,1 mm par pixel (254 DPI), limité à 80 % du plateau.
  const k = Math.min(0.1, (st.machine.bedWidth * 0.8) / img.naturalWidth, (st.machine.bedHeight * 0.8) / img.naturalHeight);
  return {
    id: uid(), kind: "image", name: file.name, layerId: imageLayer(), matrix: [1, 0, 0, 1, 0, 0], src,
    width: img.naturalWidth * k, height: img.naturalHeight * k, adjust: { ...DEFAULT_ADJUST }, sourcePath: sourcePaths.get(file),
  };
}

/** Relit les images sélectionnées depuis leur fichier d'origine (taille et position gardées). */
export async function refreshImages() {
  const images = selectedShapes().filter((s): s is ImageShape => s.kind === "image");
  if (!images.length) return notify(t("Sélectionnez une image"));
  const updated = new Map<string, string>();
  for (const img of images) {
    if (!img.sourcePath) continue;
    try {
      updated.set(img.id, await readAsDataUrl(await fileFromPath(img.sourcePath)));
    } catch (e) {
      notify(translateMessage(message(e)));
    }
  }
  if (!updated.size) return notify(t("Fichier d'origine inconnu : importez l'image avec Fichier → Importer"));
  updateShapes([...updated.keys()], (s) => ({ ...s, src: updated.get(s.id)! }) as Shape);
  notify(t("{n} image(s) actualisée(s)", { n: updated.size }));
}

/** Vectorise plusieurs fichiers image d'un coup ; les résultats sont rangés côte à côte. */
export async function traceFiles(o: TraceOptions & { resolution: number }) {
  const files = (await chooseFiles(IMAGE_EXT, t("Images"))).filter((f) => IMAGE_EXT.includes(f.name.split(".").pop()?.toLowerCase() ?? ""));
  if (!files.length) return;
  const results: Shape[] = [];
  let x = 0;
  for (const file of files) {
    try {
      const img = (await imageShape(file)) as ImageShape;
      const s = await traceToShape(img, o);
      if (!s) continue;
      const b = shapeBox(s)!;
      results.push({ ...s, matrix: mul(translate(x - b.x, -b.y), s.matrix) });
      x += b.w + 5;
    } catch (e) {
      notify(`${file.name} : ${translateMessage(message(e))}`);
    }
  }
  if (!results.length) return notify(t("Aucun contour trouvé : ajustez le seuil"));
  addShapes(centerOnBed(results));
  notify(t("{n} fichier(s) vectorisé(s)", { n: results.length }));
}

/** Gerber (couches de circuit imprimé, noms usuels de KiCad, Eagle, Altium…) et perçages Excellon. */
const GERBER_EXT = ["gbr", "ger", "gtl", "gbl", "gto", "gbo", "gts", "gbs", "gtp", "gbp", "gko", "gm1", "gml", "art", "pho"];
const DRILL_EXT = ["drl", "xln", "exc"];
const IMPORT_EXT = ["svg", "pdf", "ai", "eps", "stl", "obj", "3mf", ...GERBER_EXT, ...DRILL_EXT, "dxf", "plt", "hpgl", "hpg", "png", "jpg", "jpeg", "bmp", "gif", "webp", "lum", "lbrn", "lbrn2"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "bmp", "gif", "webp"];

/** Chemin d'origine des fichiers choisis par le dialogue natif. */
const sourcePaths = new WeakMap<File, string>();

/** Lit un fichier du disque comme un File (le chemin est retenu). */
export async function fileFromPath(path: string): Promise<File> {
  const bytes = await invoke<ArrayBuffer>("read_binary_file", { path });
  const file = new File([bytes], path.split(/[\\/]/).pop() ?? path);
  sourcePaths.set(file, path);
  return file;
}

/** Choix de fichiers : dialogue natif dans l'application (chemins connus), sinon celui du navigateur. */
export async function chooseFiles(exts: string[], label: string): Promise<File[]> {
  if (!isTauri()) return pickFiles(exts.map((e) => `.${e}`).join(","), true);
  const picked = await open({ multiple: true, filters: [{ name: label, extensions: exts }] });
  const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
  return Promise.all(paths.map(fileFromPath));
}

/** Destination des formes importées (bibliothèque d'art…) à la place du projet, le temps d'un import. */
let importTarget: ((file: File, shapes: Shape[]) => void) | null = null;

/** Importe des fichiers vectoriels ou des images vers `target` au lieu du projet. */
export async function importFilesTo(target: (file: File, shapes: Shape[]) => void) {
  importTarget = target;
  try {
    await importFiles();
  } finally {
    importTarget = null;
  }
}

export async function importFiles(files?: File[]) {
  files ??= await chooseFiles(IMPORT_EXT, t("Fichiers pris en charge"));
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      let shapes: Shape[];
      const o = getState().toolOptions;
      if (ext === "svg") shapes = vectorShapes(parseSvg(await file.text(), o.svgDpi), file.name);
      else if (ext === "dxf") shapes = vectorShapes(parseDxf(await file.text()), file.name);
      else if (ext === "pdf") shapes = vectorShapes(await (await import("./import/pdf")).parsePdf(await file.arrayBuffer()), file.name);
      else if (ext === "ai" || ext === "eps") {
        // Illustrator récent : un PDF ; ancien Illustrator et EPS : du PostScript.
        const data = await file.arrayBuffer();
        const head = new TextDecoder("latin1").decode(new Uint8Array(data, 0, Math.min(1024, data.byteLength)));
        if (head.includes("%PDF")) shapes = vectorShapes(await (await import("./import/pdf")).parsePdf(data), file.name);
        else {
          const eps = await import("./import/eps");
          shapes = vectorShapes(eps.parseEps(eps.postscriptOf(data)), file.name);
        }
      }
      else if (GERBER_EXT.includes(ext) || DRILL_EXT.includes(ext)) {
        const g = await import("./import/gerber");
        shapes = vectorShapes(GERBER_EXT.includes(ext) ? g.parseGerber(await file.text()) : g.parseExcellon(await file.text()), file.name);
        if (GERBER_EXT.includes(ext)) notify(t("Circuit imprimé : placez ces contours sur un calque Remplissage"));
      } else if (ext === "stl" || ext === "obj" || ext === "3mf") {
        // Conversion en carte de profondeur : réglages dans une fenêtre.
        const m3 = await import("./import/model3d");
        const triangles = ext === "stl" ? (await import("./import/stl")).parseStl(await file.arrayBuffer())
          : ext === "obj" ? m3.parseObj(await file.text()) : await m3.parse3mf(await file.arrayBuffer());
        pendingModel = { name: file.name, triangles };
        window.dispatchEvent(new CustomEvent("lumiere:dialog", { detail: "depthMap" }));
        continue;
      }
      else if (["plt", "hpgl", "hpg"].includes(ext)) shapes = vectorShapes(parseHpgl(await file.text(), o.hpglPerInch), file.name);
      else if (IMAGE_EXT.includes(ext)) shapes = [await imageShape(file)];
      else if (ext === "lum" || ext === "lbrn" || ext === "lbrn2") {
        await openProject(file);
        continue;
      } else throw new Error(t("Format non pris en charge"));
      if (!shapes.length) throw new Error(t("Aucun tracé trouvé"));
      if (importTarget) {
        importTarget(file, shapes);
        continue;
      }
      addShapes(o.importCenter ? centerOnBed(shapes) : shapes);
    } catch (e) {
      notify(`${file.name} : ${translateMessage(message(e))}`);
    }
  }
}

// --------------------------------------------------------------- Projet

/** Confirmation native (les boîtes window.confirm ne sont pas fiables dans la webview). */
async function ask(message: string): Promise<boolean> {
  if (!isTauri()) return window.confirm(message);
  return confirm(message, { title: "Lumière", kind: "warning", okLabel: t("Abandonner"), cancelLabel: t("Annuler") });
}

export const discardChanges = async () => !getState().dirty || (await ask(t("Abandonner les modifications non enregistrées ?")));

export async function newProject() {
  if (!(await discardChanges())) return;
  loadProject(emptyProject(), null);
}

export async function openProject(file?: File) {
  if (!(await discardChanges())) return;
  // Dans l'application, le dialogue natif donne le chemin (projets récents, enregistrement sur place).
  if (!file && isTauri()) {
    const path = await open({ multiple: false, filters: [{ name: t("Projets (Lumière, LightBurn)"), extensions: ["lum", "lbrn", "lbrn2"] }] });
    if (typeof path === "string") await openPath(path);
    return;
  }
  file ??= (await pickFiles(".lum,.lbrn,.lbrn2,application/json", false))[0];
  if (!file) return;
  try {
    if (/\.lbrn2?$/i.test(file.name)) {
      loadLightBurn(await file.text());
      return;
    }
    const p = JSON.parse(await file.text()) as Project;
    if (p.format !== "lumiere" || !Array.isArray(p.shapes) || !Array.isArray(p.layers)) throw new Error(t("Ce n'est pas un projet Lumière"));
    loadProject(p, null);
    setState({ filePath: file.name });
  } catch (e) {
    notify(t("Ouverture impossible : {error}", { error: message(e) }));
  }
}

function parseProject(json: string): Project {
  const p = JSON.parse(json) as Project;
  if (p.format !== "lumiere" || !Array.isArray(p.shapes) || !Array.isArray(p.layers)) throw new Error(t("Ce n'est pas un projet Lumière"));
  return p;
}

/** Projet LightBurn : converti en nouveau projet sans nom (l'enregistrer le met au format Lumière). */
async function loadLightBurn(xml: string) {
  const { parseLbrn } = await import("./import/lbrn");
  const { project, warnings, texts } = parseLbrn(xml, getState().machine.bedHeight, primitiveCurve);
  // Textes : recréés en texte modifiable si la police est installée, sinon gardés en courbes.
  const fonts = await listFonts().catch(() => []);
  const missing = new Set<string>();
  let lost = 0;
  let shapes = project.shapes;
  for (const tx of texts) {
    const family = fonts.filter((f) => f.family.toLowerCase() === tx.family.toLowerCase());
    const want = tx.bold ? (tx.italic ? /bold.*(italic|oblique)/i : /^bold$/i) : tx.italic ? /^(italic|oblique)$/i : /^(regular|normal|book|roman)$/i;
    const font = family.find((f) => want.test(f.style)) ?? family[0];
    if (!font) {
      if (tx.family) missing.add(tx.family);
      if (!tx.shapeId) lost++;
      continue;
    }
    const shape: Omit<TextShape, "paths"> = {
      id: tx.shapeId ?? uid(), kind: "text", name: tx.text.split("\n")[0] || t("Texte"), layerId: tx.layerId, groupId: tx.groupId, matrix: tx.matrix,
      text: tx.text, font, height: tx.height, align: tx.align, alignY: tx.alignY, letterSpacing: tx.letterSpacing, lineSpacing: tx.lineSpacing,
      weld: tx.weld, upperCase: tx.upperCase, rtl: tx.rtl,
    };
    try {
      const full: TextShape = { ...shape, paths: await textPaths(shape) };
      shapes = tx.shapeId ? shapes.map((s) => (s.id === tx.shapeId ? full : s)) : [...shapes, full];
    } catch {
      missing.add(tx.family);
      if (!tx.shapeId) lost++;
    }
  }
  if (lost) warnings.push(`texts:${lost}`);
  loadProject({ ...project, shapes }, null);
  setState({ dirty: true });
  if (missing.size) notify(t("Police(s) introuvable(s), textes gardés en courbes : {fonts}", { fonts: [...missing].join(", ") }));
  for (const w of warnings) {
    const [kind, n] = w.split(":");
    notify(kind === "texts" ? t("{n} texte(s) LightBurn sans tracé ignoré(s)", { n }) : t("{n} forme(s) LightBurn non prise(s) en charge", { n }));
  }
  notify(t("Projet LightBurn ouvert : {n} forme(s)", { n: project.shapes.length }));
}

/** Ouvre un projet par son chemin ; un modèle s'ouvre comme un nouveau projet sans nom. */
export async function openPath(path: string, template = false) {
  if (/\.lbrn2?$/i.test(path)) {
    try {
      await loadLightBurn(await invoke<string>("read_text_file", { path }));
    } catch (e) {
      notify(t("Ouverture impossible : {error}", { error: message(e) }));
    }
    return;
  }
  try {
    const p = parseProject(await invoke<string>("read_text_file", { path }));
    loadProject(p, template ? null : path);
    addRecent(template ? "template" : "project", path);
  } catch (e) {
    notify(t("Ouverture impossible : {error}", { error: message(e) }));
  }
}

/** Enregistre dans le fichier ouvert ; demande un emplacement s'il n'y en a pas (ou « sous… »). */
export async function saveProject(saveAs = false) {
  const st = getState();
  const known = st.filePath && /^(\/|[A-Za-z]:\\)/.test(st.filePath) ? st.filePath : null;
  const name = st.filePath?.split(/[\\/]/).pop() ?? "projet.lum";
  try {
    let path: string | null;
    if (known && !saveAs && isTauri()) {
      await api.writeTextFile(known, JSON.stringify(projectForSave(st.project)));
      path = known;
    } else path = await saveText(name, JSON.stringify(projectForSave(st.project)), "lum", t("Projet Lumière"));
    if (path) {
      setState({ filePath: path, dirty: false });
      if (isTauri()) addRecent("project", path);
      notify(t("Projet enregistré"));
    }
  } catch (e) {
    notify(t("Enregistrement impossible : {error}", { error: message(e) }));
  }
}

// ------------------------------------------------------------ Génération

/** Décalage à appliquer selon l'origine de travail choisie (« Départ depuis »). */
function jobOffset(box: Box | null, strict: boolean): Pt {
  const { jobOrigin, machine: m } = getState();
  if (jobOrigin.startFrom === "absolute" || !box) return [0, 0];
  const a = anchorPoint(box, jobOrigin.anchor);
  let target: Pt;
  if (jobOrigin.startFrom === "current") {
    const status = getLaserState().status;
    if (!status) {
      if (strict) throw new Error(t("Position du laser inconnue : connectez-vous pour partir de la position actuelle"));
      return [0, 0];
    }
    target = bedToMachine([status.wpos[0], status.wpos[1]], m.origin, m.bedWidth, m.bedHeight);
  } else {
    // Origine utilisateur : l'ancre est placée sur le zéro de travail.
    target = bedToMachine([0, 0], m.origin, m.bedWidth, m.bedHeight);
  }
  return [target[0] - a[0], target[1] - a[1]];
}

function onlySelection(selectionOnly: boolean) {
  const st = getState();
  return selectionOnly && st.selection.length ? new Set(st.selection) : undefined;
}

/** Projet tel qu'il sera gravé : avec l'alignement « imprimer et découper » s'il est actif. */
function jobProject(): Project {
  const { project, alignment } = getState();
  if (!alignment) return project;
  return { ...project, shapes: project.shapes.map((s) => ({ ...s, matrix: mul(alignment, s.matrix) })) };
}

async function generate(selectionOnly: boolean, strict: boolean, repeat = 1) {
  const st = getState();
  const only = onlySelection(selectionOnly);
  const project = jobProject();
  // Avec un alignement mesuré, les positions sont déjà absolues.
  const offset: Pt = st.alignment ? [0, 0] : jobOffset(outputBox(project, only), strict);
  const { job, warnings } = await buildJob(project, st.machine, { only, offset, ignoreOutOfBounds: st.toolOptions.ignoreOutOfBounds });
  if (st.alignment) warnings.push(t("Imprimer et découper : alignement mesuré appliqué"));
  if (!job.layers.length) throw new Error(t("Rien à graver : aucune forme sur un calque actif"));
  const result = await api.generateGcode({ ...job, repeat });
  if (repeat > 1) warnings.push(t("Travail répété {n} fois", { n: repeat }));
  return { result, warnings: [...warnings, ...result.stats.warnings] };
}

/** Aperçu → Démarrer ici : le travail reprend au segment affiché par le curseur de simulation. */
export async function startFromPreview(save: boolean) {
  const p = getState().preview;
  if (!p || p.shown >= p.toolpath.count) return notify(t("Placez le curseur de l'aperçu à l'endroit de la reprise"));
  const gcode = gcodeFrom(p.result.gcode, p.toolpath.line[p.shown]);
  try {
    if (save) await exportText(gcode, "reprise.gcode");
    else await laser.start(gcode);
  } catch (e) {
    notify(message(e));
  }
}

export async function makePreview(selectionOnly = false) {
  try {
    const { result, warnings } = await generate(selectionOnly, false);
    const toolpath = parseToolpath(result.gcode, getState().machine);
    setState({ preview: { result, toolpath, warnings, shown: toolpath.count } });
  } catch (e) {
    notify(message(e));
  }
}

export async function exportGcode(selectionOnly = false) {
  try {
    const { result, warnings } = await generate(selectionOnly, true);
    warnings.forEach(notify);
    const path = await saveText("travail.gcode", result.gcode, "gcode", "G-code");
    if (path) notify(t("G-code exporté ({n} lignes)", { n: result.stats.lines }));
  } catch (e) {
    notify(message(e));
  }
}

/** Sélection en attente de la liste de vérification avant travail. */
export let pendingStart: boolean | null = null;

/** Le travail (décalé selon l'origine de travail) sort-il du plateau ? */
function outsideBed(selectionOnly: boolean): boolean {
  const st = getState();
  const box = outputBox(jobProject(), onlySelection(selectionOnly));
  if (!box) return false;
  const [dx, dy] = st.alignment ? [0, 0] : jobOffset(box, false);
  const e = 0.01, m = st.machine;
  return box.x + dx < -e || box.y + dy < -e || box.x + dx + box.w > m.bedWidth + e || box.y + dy + box.h > m.bedHeight + e;
}

async function boundsOk(selectionOnly: boolean): Promise<boolean> {
  if (getState().machine.boundsWarning === false || !outsideBed(selectionOnly)) return true;
  return ask(t("Le travail sort de la zone de travail de la machine. Continuer quand même ?"));
}

export async function startJob(selectionOnly = false, checked = false) {
  // Liste de vérification (Paramètres de l'appareil) : à cocher avant de démarrer.
  if (!checked && getState().machine.checklist?.some((l) => l.trim())) {
    pendingStart = selectionOnly;
    window.dispatchEvent(new CustomEvent("lumiere:dialog", { detail: "checklist" }));
    return;
  }
  const counter = jobCounter();
  if (counter.stopAt > 0 && counter.count >= counter.stopAt) {
    return notify(t("Compteur atteint ({n} travaux) : remettez-le à zéro pour continuer", { n: counter.count }));
  }
  if (!(await boundsOk(selectionOnly))) return;
  try {
    const { result, warnings } = await generate(selectionOnly, true, getState().jobRepeat);
    warnings.forEach((w) => log(`⚠ ${w}`));
    const m = getState().machine;
    if (m.firmware === "ruida") {
      log(t("Ruida (expérimental) : envoi à {host}…", { host: m.host }));
      const bytes = await api.ruidaSend(m.host, result.gcode, m.sMax);
      log(t("Ruida : {n} octets envoyés et acquittés", { n: bytes }));
    } else {
      setJobName(getState().filePath?.split(/[\\/]/).pop() ?? t("Sans titre"));
      await laser.start(result.gcode);
    }
    await advanceSerial();
  } catch (e) {
    notify(message(e));
  }
}

/** Après un envoi : numéro de série suivant, et textes variables recalculés. */
export async function advanceSerial() {
  const st = getState();
  if (!st.project.shapes.some((s) => s.kind === "text" && hasVariables(s.text))) return;
  if (st.textVars.autoAdvance === false) return;
  const next = stepVariables(st.textVars, 1);
  setState({ textVars: next });
  if (next.csv && next.csv.row === 0 && st.textVars.csv && st.textVars.csv.rows.length > 1) notify(t("Fin du fichier CSV : retour à la première ligne"));
  await refreshVariableTexts();
}

export async function refreshVariableTexts() {
  const texts = getState().project.shapes.filter((s): s is TextShape => s.kind === "text" && hasVariables(s.text));
  const updated = new Map<string, Polyline[]>();
  for (const t of texts) updated.set(t.id, await textPaths(t));
  if (updated.size) updateShapes([...updated.keys()], (s) => ({ ...(s as TextShape), paths: updated.get(s.id)! }), false);
}

/** Outils laser → Exporter le journal des travaux (CSV). */
export async function exportJobLog() {
  await exportText(jobLogCsv(), t("journal-travaux.csv"));
}

/** Envoie directement un G-code déjà généré (test de matériau…). */
export async function sendGcode(gcode: string) {
  if (!getLaserState().connected) return notify(t("Laser non connecté"));
  await laser.start(gcode);
}

export async function exportText(contents: string, name: string) {
  const ext = name.split(".").pop() ?? "txt";
  const label = ext === "gcode" ? "G-code" : ext.toUpperCase();
  const path = await saveText(name, contents, ext, label).catch((e) => (notify(message(e)), null));
  if (path) notify(t("{name} exporté", { name: name.split(".")[0] }));
}

export interface FrameOptions {
  /** Cadrer chaque forme (ou groupe) séparément plutôt que le travail entier. */
  individually?: boolean;
  /** Recommencer jusqu'à « Arrêter ». */
  continuous?: boolean;
  /** Seulement les formes des calques outils (T1, T2). */
  toolLayersOnly?: boolean;
  /** Images : cadrer leur partie non blanche plutôt que leur rectangle. */
  imageInk?: boolean;
}

/** Boîte des pixels non blancs d'une image (plateau), ou null si l'image est blanche. */
async function imageInkBox(s: ImageShape): Promise<Box | null> {
  const k = Math.min(4, 1000 / Math.max(s.width, s.height));
  const pw = Math.max(1, Math.round(s.width * k)), ph = Math.max(1, Math.round(s.height * k));
  const gray = await renderGray(s, pw, ph, [pw / s.width, 0, 0, ph / s.height, 0, 0]);
  let x0 = pw, y0 = ph, x1 = -1, y1 = -1;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    if (gray[y * pw + x] < 245) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const corners: Pt[] = [[x0, y0], [x1 + 1, y0], [x1 + 1, y1 + 1], [x0, y1 + 1]].map(([x, y]) => apply(s.matrix, [(x / pw) * s.width, (y / ph) * s.height]));
  return boxOfPoints(corners);
}

const rectOf = (b: Box): Pt[] => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];

/** Formes à graver, regroupées par groupe (cadrage forme par forme). */
function frameUnits(selectionOnly: boolean, toolLayersOnly = false): Shape[][] {
  const st = getState();
  const only = onlySelection(selectionOnly);
  const out = new Set(toolLayersOnly ? TOOL_LAYERS : st.project.layers.filter((l) => l.output).map((l) => l.id));
  const units = new Map<string, Shape[]>();
  for (const s of jobProject().shapes) {
    if (!out.has(s.layerId) || (only && !only.has(s.id))) continue;
    units.set(s.groupId ?? s.id, [...(units.get(s.groupId ?? s.id) ?? []), s]);
  }
  return [...units.values()];
}

async function frame(selectionOnly: boolean, power: number, o: FrameOptions, outline: (shapes: Shape[], boxOf: (s: Shape) => Box | null) => Pt[] | Pt[][] | null) {
  const st = getState();
  const units0 = frameUnits(selectionOnly, o.toolLayersOnly);
  const box = o.toolLayersOnly ? unionBoxes(units0.flat().map(shapeBox)) : outputBox(jobProject(), onlySelection(selectionOnly));
  if (!box) return notify(o.toolLayersOnly ? t("Aucune forme sur les calques outils (T1, T2)") : t("Rien à cadrer"));
  // Boîtes des images réduites à leur partie non blanche, si demandé.
  const ink = new Map<string, Box | null>();
  if (o.imageInk) for (const s of units0.flat()) if (s.kind === "image") ink.set(s.id, await imageInkBox(s));
  const boxOf = (s: Shape) => (ink.has(s.id) ? ink.get(s.id)! : shapeBox(s));
  if (!(await boundsOk(selectionOnly))) return;
  try {
    let [dx, dy] = st.alignment ? [0, 0] : jobOffset(box, true);
    // Laser éteint, c'est le pointeur rouge qui doit suivre le cadre : la tête est décalée d'autant.
    const pointer = st.machine.pointerOffset;
    if (power <= 0 && pointer) [dx, dy] = [dx - pointer[0], dy - pointer[1]];
    const groups = o.individually ? units0 : [units0.flat()];
    const outlines = groups
      .flatMap((g) => {
        const r = outline(g, boxOf);
        return !r ? [] : Array.isArray(r[0]?.[0]) ? (r as Pt[][]) : [r as Pt[]];
      })
      .filter((p) => p.length >= 2)
      .map((p) => p.map(([x, y]): Pt => [x + dx, y + dy]));
    if (!outlines.length) return notify(t("Rien à cadrer"));
    laser.frameOutlines(outlines, st.machine, power, o.continuous ? 100 : 1);
  } catch (e) {
    notify(message(e));
  }
}

export function frameJob(selectionOnly = false, power = 0, o: FrameOptions = {}) {
  frame(selectionOnly, power, o, (shapes, boxOf) => {
    const b = unionBoxes(shapes.map(boxOf).filter((x): x is Box => !!x));
    return b && rectOf(b);
  });
}

/** Cadrage par contour : la tête suit le contour extérieur de chaque forme (trous et formes intérieures ignorés). */
export function frameContour(selectionOnly = false, power = 0, o: FrameOptions = {}) {
  frame(selectionOnly, power, o, (shapes, boxOf) => {
    const contours = outerContours(shapes.flatMap((s) => (s.kind === "image" ? [] : worldPaths(s))));
    const images = shapes.filter((s) => s.kind === "image").map(boxOf).filter((b): b is Box => !!b).map(rectOf);
    const all = [...contours.map((p) => [...p.pts, p.pts[0]]), ...images.map((r) => [...r, r[0]])];
    return all.length ? all : null;
  });
}

// ------------------------------------------------------- Transformations

const sel = () => getState().selection;

export function selectionBox(): Box | null {
  return unionBoxes(selectedShapes().map(shapeBox));
}

export function transformSelection(m: (box: Box) => Mat) {
  const box = selectionBox();
  if (!box) return;
  const t = m(box);
  // Les formes verrouillées ne bougent pas.
  updateShapes(selectedShapes().filter((s) => !s.locked).map((s) => s.id), (s) => ({ ...s, matrix: mul(t, s.matrix) }));
}

export const mirrorH = () => transformSelection((b) => scaleAbout(-1, 1, boxCenter(b)));
export const mirrorV = () => transformSelection((b) => scaleAbout(1, -1, boxCenter(b)));
export const rotate = (deg: number) => transformSelection((b) => rotateAbout(deg, boxCenter(b)));
export const nudge = (dx: number, dy: number) => transformSelection(() => translate(dx, dy));
export const centerOnBedSelection = () =>
  transformSelection((b) => {
    const { bedWidth, bedHeight } = getState().machine;
    return translate(bedWidth / 2 - (b.x + b.w / 2), bedHeight / 2 - (b.y + b.h / 2));
  });

/** Rotation affichée : celle de la forme si elle est seule, 0 sinon. */
export function selectionRotation(): number {
  const s = selectedShapes();
  return s.length === 1 ? matrixAngle(s[0].matrix) : 0;
}

export function setRotation(deg: number) {
  rotate(deg - selectionRotation());
}

/** Place et dimensionne la sélection (champs X/Y/L/H de la barre d'outils). */
export function setSelectionBox(target: Partial<Box>) {
  transformSelection((b) => {
    const w = target.w ?? b.w, h = target.h ?? b.h;
    const sx = b.w > 1e-9 ? w / b.w : 1, sy = b.h > 1e-9 ? h / b.h : 1;
    const x = target.x ?? b.x, y = target.y ?? b.y;
    return mul(translate(x - b.x, y - b.y), scaleAbout(sx, sy, [b.x, b.y]));
  });
}

export function deleteSelection() {
  const ids = new Set(sel());
  if (!ids.size) return;
  commit((p) => pruneLayers({ ...p, shapes: p.shapes.filter((s) => !ids.has(s.id)) }, getState().currentLayer), { selection: [] });
}

/** Copie des formes avec de nouveaux identifiants (groupes compris). */
function cloneShapes(shapes: Shape[], m: Mat): Shape[] {
  const groups = new Map<string, string>();
  return shapes.map((s) => {
    let groupId = s.groupId;
    if (groupId) {
      if (!groups.has(groupId)) groups.set(groupId, uid());
      groupId = groups.get(groupId);
    }
    return { ...s, id: uid(), groupId, matrix: mul(m, s.matrix) };
  });
}

export function duplicateSelection() {
  addShapes(cloneShapes(selectedShapes(), translate(5, 5)));
}

let clipboard: Shape[] = [];
let pasteCount = 0;

export function copySelection() {
  clipboard = selectedShapes();
  pasteCount = 0;
}

export function cutSelection() {
  copySelection();
  deleteSelection();
}

export function paste() {
  if (!clipboard.length) return;
  pasteCount += 1;
  addShapes(cloneShapes(clipboard, translate(5 * pasteCount, 5 * pasteCount)));
}

export function pasteInPlace() {
  if (clipboard.length) addShapes(cloneShapes(clipboard, translate(0, 0)));
}

export function invertSelection() {
  const st = getState();
  setState({ selection: st.project.shapes.filter((s) => !st.selection.includes(s.id)).map((s) => s.id) });
}

/** Sélectionne les formes qui ont au moins un tracé ouvert (à fermer avant un remplissage). */
export function selectOpenShapes() {
  const ids = getState().project.shapes.filter((s) => hasPaths(s) && worldPaths(s).some((p) => !p.closed)).map((s) => s.id);
  setState({ selection: ids });
  notify(ids.length ? t("{n} forme(s) ouverte(s)", { n: ids.length }) : t("Aucune forme ouverte"));
}

/** Sélectionne toutes les formes du calque courant. */
export function selectCurrentLayer() {
  const { project, currentLayer } = getState();
  setState({ selection: project.shapes.filter((s) => s.layerId === currentLayer).map((s) => s.id) });
}

/** Supprime les formes strictement superposées à une autre (même géométrie, même calque). */
export function deleteDuplicates() {
  const st = getState();
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const s of st.project.shapes) {
    const key = `${s.layerId}|${s.kind === "image" ? s.src.length + ":" + s.matrix.join() : worldPaths(s).map((p) => p.pts.map((q) => q.map((v) => v.toFixed(3)).join(",")).join(";")).join("|")}`;
    if (seen.has(key)) dup.add(s.id);
    else seen.add(key);
  }
  if (!dup.size) return notify(t("Aucun doublon"));
  commit((p) => ({ ...p, shapes: p.shapes.filter((s) => !dup.has(s.id)) }), { selection: st.selection.filter((id) => !dup.has(id)) });
  notify(t("{n} doublon(s) supprimé(s)", { n: dup.size }));
}

/** Ordre d'empilement (et d'affichage) : premier plan ou arrière-plan. */
export function reorderSelection(front: boolean) {
  const ids = new Set(sel());
  if (!ids.size) return;
  commit((p) => {
    const picked = p.shapes.filter((s) => ids.has(s.id));
    const rest = p.shapes.filter((s) => !ids.has(s.id));
    return { ...p, shapes: front ? [...rest, ...picked] : [...picked, ...rest] };
  });
}

export const selectAll = () => setState({ selection: getState().project.shapes.map((s) => s.id) });

/** Clic sur une couleur de la palette : affecte la sélection à ce calque. */
export function assignLayer(id: number) {
  const ids = new Set(sel());
  commit(
    (p) => pruneLayers(withLayer({ ...p, shapes: p.shapes.map((s) => (ids.has(s.id) ? { ...s, layerId: id } : s)) }, id), id),
    { currentLayer: id },
  );
}

// ------------------------------------------------- Groupes et alignement

export function group() {
  const ids = sel();
  if (ids.length < 2) return;
  const groupId = uid();
  updateShapes(ids, (s) => ({ ...s, groupId }));
}

export function ungroup() {
  updateShapes(sel(), (s) => ({ ...s, groupId: undefined }));
}

/** Sépare chaque tracé fermé (avec ses trous) et chaque tracé ouvert en forme indépendante. */
export function breakApart() {
  const st = getState();
  const targets = selectedShapes().filter(hasPaths);
  if (!targets.length) return;
  const created: Shape[] = [];
  const removed = new Set<string>();
  for (const s of targets) {
    const paths = worldPaths(s);
    if (paths.length < 2) continue;
    // Un tracé contenu dans un autre reste attaché à son contour extérieur.
    const outer = paths.filter((p) => !p.closed || !paths.some((q) => q !== p && q.closed && contains(q, p)));
    for (const o of outer) {
      const holes = o.closed ? paths.filter((p) => p !== o && p.closed && contains(o, p) && !outer.includes(p)) : [];
      const shape = vectorFromWorld([o, ...holes], s.layerId, s.name);
      if (shape) created.push(shape);
    }
    removed.add(s.id);
  }
  if (!removed.size) return notify(t("Rien à séparer"));
  commit((p) => ({ ...p, shapes: [...p.shapes.filter((s) => !removed.has(s.id)), ...created] }), {
    selection: [...st.selection.filter((id) => !removed.has(id)), ...created.map((s) => s.id)],
  });
}

function contains(outer: Polyline, inner: Polyline): boolean {
  const [x, y] = inner.pts[0];
  let inside = false;
  const poly = outer.pts;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Réunit les formes vectorielles sélectionnées en une seule (sans fusion géométrique). */
export function combine() {
  const targets = selectedShapes().filter(hasPaths);
  if (targets.length < 2) return;
  // Les courbes sont conservées si aucune forme n'est un texte (dont les tracés sont déjà aplatis).
  const curves = targets.every((s) => s.kind === "vector")
    ? targets.flatMap((s) => transformBez(curvesOf(s as Shape & { kind: "vector" }), s.matrix))
    : undefined;
  replaceWith(targets, targets.flatMap(worldPaths), t("Combinaison"), curves);
}

export function replaceWith(targets: Shape[], paths: Polyline[], name: string, curves?: BezPath[]) {
  const shape = vectorFromWorld(paths, targets[0].layerId, name, curves);
  const ids = new Set(targets.map((s) => s.id));
  commit((p) => {
    // La nouvelle forme prend la place de la première, pour garder l'ordre d'empilement.
    const at = p.shapes.findIndex((s) => ids.has(s.id));
    const rest = p.shapes.filter((s) => !ids.has(s.id));
    if (shape) rest.splice(Math.max(0, at), 0, shape);
    return { ...p, shapes: rest };
  }, { selection: shape ? [shape.id] : [] });
}

export type Align = "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "center";

export function align(kind: Align) {
  const shapes = selectedShapes();
  const all = unionBoxes(shapes.map(shapeBox));
  if (!all || shapes.length < 2) return;
  // Les groupes s'alignent comme un bloc.
  const units = new Map<string, Shape[]>();
  for (const s of shapes) units.set(s.groupId ?? s.id, [...(units.get(s.groupId ?? s.id) ?? []), s]);
  const moves = new Map<string, Mat>();
  for (const members of units.values()) {
    const b = unionBoxes(members.map(shapeBox))!;
    const cx = all.x + all.w / 2 - (b.x + b.w / 2), cy = all.y + all.h / 2 - (b.y + b.h / 2);
    const dx = { left: all.x - b.x, right: all.x + all.w - (b.x + b.w), centerX: cx, center: cx }[kind as "left"] ?? 0;
    const dy = { top: all.y - b.y, bottom: all.y + all.h - (b.y + b.h), centerY: cy, center: cy }[kind as "top"] ?? 0;
    for (const m of members) moves.set(m.id, translate(dx, dy));
  }
  updateShapes([...moves.keys()], (s) => ({ ...s, matrix: mul(moves.get(s.id)!, s.matrix) }));
}

/** Répartit les centres à intervalles réguliers entre les deux extrêmes. */
/** Répartit les centres à intervalles égaux, ou (`spaced`) laisse des espaces égaux entre les formes. */
export function distribute(axis: "x" | "y", spaced = false) {
  const shapes = selectedShapes();
  if (shapes.length < 3) return notify(t("Sélectionnez au moins trois formes"));
  const k = axis === "x" ? 0 : 1;
  const items = shapes.map((s) => {
    const b = shapeBox(s)!;
    return { s, c: boxCenter(b)[k], lo: k === 0 ? b.x : b.y, size: k === 0 ? b.w : b.h };
  }).sort((a, b) => a.c - b.c);
  const first = items[0], last = items[items.length - 1];
  const total = items.reduce((n, it) => n + it.size, 0);
  const gap = (last.lo + last.size - first.lo - total) / (items.length - 1);
  let cursor = first.lo;
  const moves = new Map(items.map(({ s, c, lo, size }, i) => {
    const d = spaced ? cursor - lo : first.c + ((last.c - first.c) * i) / (items.length - 1) - c;
    cursor += size + gap;
    return [s.id, translate(k === 0 ? d : 0, k === 1 ? d : 0)] as const;
  }));
  updateShapes([...moves.keys()], (s) => ({ ...s, matrix: mul(moves.get(s.id)!, s.matrix) }));
}

// ------------------------------------------------ Géométrie (Clipper)

/** Contours extérieurs : tracés fermés contenus dans aucun autre (les trous et les formes intérieures sont écartés). */
export function outerContours(paths: Polyline[]): Polyline[] {
  const closed = paths.filter((p) => p.closed && p.pts.length >= 3);
  const inside = (q: Pt, poly: Pt[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [a, b] = [poly[i], poly[j]];
      if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  return closed.filter((p, i) => !closed.some((o, j) => j !== i && inside(p.pts[0], o.pts)));
}

/**
 * Décalage de la sélection. `delta` négatif : vers l'intérieur ; `both` : les deux côtés ;
 * `outerOnly` : seulement les contours extérieurs (les trous et formes intérieures sont ignorés).
 */
export function offsetSelection(delta: number, join: JoinKind, keepOriginal: boolean, both = false, outerOnly = false) {
  const targets = selectedShapes().filter(hasPaths);
  if (!targets.length) return notify(t("Sélectionnez des formes vectorielles"));
  const source = targets.flatMap(worldPaths);
  const input = outerOnly ? outerContours(source) : source;
  const results = (both ? [Math.abs(delta), -Math.abs(delta)] : [delta])
    .map((d) => ({ d, paths: offsetPaths(input, d, join) }))
    .filter((r) => r.paths.length);
  if (!results.length) return notify(t("Le décalage ne laisse aucune forme"));
  const shapes = results.map((r) => vectorFromWorld(r.paths, getState().currentLayer, t("Décalage {d} mm", { d: r.d }))).filter((s): s is Shape => !!s);
  if (!shapes.length) return;
  const ids = new Set(targets.map((s) => s.id));
  commit((p) => withLayer({ ...p, shapes: [...p.shapes.filter((s) => keepOriginal || !ids.has(s.id)), ...shapes] }, shapes[0].layerId), {
    selection: shapes.map((s) => s.id),
  });
}

export function booleanSelection(op: BoolOp) {
  // L'ordre de sélection compte pour la soustraction : la première forme est la pièce.
  const st = getState();
  const targets = st.selection.map((id) => st.project.shapes.find((s) => s.id === id)!).filter((s) => s && hasPaths(s));
  if (targets.length < 2) return notify(t("Sélectionnez au moins deux formes vectorielles"));
  const paths = booleanOp(op, targets.map(worldPaths));
  const names: Record<BoolOp, string> = { union: t("Soudure"), difference: t("Soustraction"), intersection: t("Intersection"), xor: t("Exclusion") };
  replaceWith(targets, paths, names[op]);
}

// ------------------------------------------------------------ Tableaux

/** Matrices des copies d'une grille (la case 0, 0 est l'original), dans l'ordre des copies. */
export function gridTransforms(def: ArrayDef & { kind: "grid" }, b: Box): Mat[] {
  const sx = def.pitch ? def.gapX : b.w + def.gapX, sy = def.pitch ? def.gapY : b.h + def.gapY;
  const dir = def.reverse ? -1 : 1;
  const center = boxCenter(b);
  let seed = (def.seed ?? 1) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const out: Mat[] = [];
  for (let r = 0; r < def.rows; r++) {
    for (let c = 0; c < def.cols; c++) {
      if (r === 0 && c === 0) continue;
      const fx = ((def.mirrorColsX && c % 2) ? -1 : 1) * ((def.mirrorRowsX && r % 2) ? -1 : 1);
      const fy = ((def.mirrorColsY && c % 2) ? -1 : 1) * ((def.mirrorRowsY && r % 2) ? -1 : 1);
      let m: Mat = fx < 0 || fy < 0 ? scaleAbout(fx, fy, center) : [1, 0, 0, 1, 0, 0];
      if (def.randomRotate) m = mul(rotateAbout(rand() * 360, center), m);
      const x = dir * (c * sx + r * (def.rowShift ?? 0) + (def.halfShift && r % 2 ? sx / 2 : 0));
      const y = dir * (r * sy + c * (def.colShift ?? 0));
      out.push(mul(translate(x, y), m));
    }
  }
  return out;
}

/** Copies d'une répétition, à partir de ses formes d'origine. */
function arrayCopies(def: ArrayDef, shapes: Shape[]): Shape[] {
  const b = unionBoxes(shapes.map(shapeBox));
  if (!b) return [];
  const copies: Shape[] = [];
  if (def.kind === "grid") {
    gridTransforms(def, b).forEach((m, k) => {
      const step = (def.textStep ?? 0) * (k + 1);
      copies.push(...cloneShapes(shapes, m).map((s) => (step && s.kind === "text" ? { ...s, varOffset: (s.varOffset ?? 0) + step } : s)));
    });
  } else if (def.count >= 2) {
    const full = Math.abs(Math.abs(def.angle) - 360) < 1e-6;
    const step = def.angle / (full ? def.count : def.count - 1);
    for (let i = 1; i < def.count; i++) {
      const r = rotateAbout((def.start ?? 0) + step * i, def.center);
      let made: Shape[];
      if (def.rotate) made = cloneShapes(shapes, r);
      else {
        // Translation seule : le centre de la sélection suit le cercle.
        const c = boxCenter(b);
        const [x, y] = apply(r, c);
        made = cloneShapes(shapes, translate(x - c[0], y - c[1]));
      }
      const tstep = (def.textStep ?? 0) * i;
      copies.push(...made.map((s) => (tstep && s.kind === "text" ? { ...s, varOffset: (s.varOffset ?? 0) + tstep } : s)));
    }
  }
  return copies;
}

/**
 * Crée (ou recalcule, si `id` désigne une répétition existante) une répétition modifiable :
 * les copies restent liées à leurs formes d'origine jusqu'à « Aplatir la répétition ».
 */
function makeArray(def: ArrayDef, id = uid(), virtual = true) {
  const st = getState();
  const sources = st.project.shapes.filter((s) => def.source.includes(s.id));
  const groupId = def.group ? `array-${id}` : undefined;
  const copies = arrayCopies(def, sources).map((s) => ({ ...s, arrayCopy: virtual ? id : undefined, ...(groupId ? { groupId } : {}) }));
  if (!copies.length) return;
  const src = new Set(def.source);
  commit((p) => ({
    ...p,
    shapes: [...p.shapes.filter((s) => !virtual || s.arrayCopy !== id).map((s) => (groupId && src.has(s.id) ? { ...s, groupId } : s)), ...copies],
    arrays: virtual ? { ...p.arrays, [id]: def } : p.arrays,
  }), { selection: [...def.source, ...copies.map((s) => s.id)] });
  if (copies.some((s) => s.kind === "text" && hasVariables(s.text))) void refreshVariableTexts();
}

export function gridArray(cols: number, rows: number, gapX: number, gapY: number, editId?: string, options: GridOptions = {}, virtual = true) {
  const source = getState().selection;
  if (!source.length) return;
  makeArray({ kind: "grid", cols, rows, gapX, gapY, source, ...options }, editId, virtual || !!editId);
}

export function radialArray(count: number, center: Pt, totalAngle: number, rotateCopies: boolean, editId?: string, extra: { start?: number; group?: boolean; textStep?: number } = {}) {
  const source = getState().selection;
  if (!source.length || count < 2) return;
  makeArray({ kind: "radial", count, center, angle: totalAngle, rotate: rotateCopies, source, ...extra }, editId);
}

/** Répétition modifiable de la sélection (formes d'origine ou copies). */
export function selectedArray(): string | null {
  const st = getState();
  for (const id of st.selection) {
    const s = st.project.shapes.find((x) => x.id === id);
    if (s?.arrayCopy && st.project.arrays?.[s.arrayCopy]) return s.arrayCopy;
    const owner = Object.entries(st.project.arrays ?? {}).find(([, d]) => d.source.includes(id));
    if (owner) return owner[0];
  }
  return null;
}

/** Disposer → Modifier la répétition : rouvre la fenêtre avec ses réglages. */
export function editArray() {
  const id = selectedArray();
  if (!id) return notify(t("Sélectionnez une répétition"));
  setState({ selection: getState().project.arrays![id].source });
  window.dispatchEvent(new CustomEvent("lumiere:dialog-option", { detail: `edit:${id}` }));
  window.dispatchEvent(new CustomEvent("lumiere:dialog", { detail: "array" }));
}

/** Recalcule les copies d'une répétition après un changement de ses formes d'origine. */
function rebuildArray(id: string, source: string[]) {
  const def = getState().project.arrays?.[id];
  if (!def) return;
  if (!source.length) {
    // Plus d'original : la répétition et ses copies disparaissent.
    commit((p) => {
      const { [id]: _gone, ...arrays } = p.arrays ?? {};
      return { ...p, arrays, shapes: p.shapes.filter((s) => s.arrayCopy !== id) };
    });
    return;
  }
  makeArray({ ...def, source }, id);
}

/** Disposer → Ajouter à la répétition : les formes sélectionnées hors répétition rejoignent ses originaux. */
export function addToArray() {
  const id = selectedArray();
  if (!id) return notify(t("Sélectionnez une répétition et les formes à y ajouter"));
  const st = getState();
  const def = st.project.arrays![id];
  const extra = st.selection.filter((sid) => {
    const s = st.project.shapes.find((x) => x.id === sid);
    return s && !s.arrayCopy && !def.source.includes(sid);
  });
  if (!extra.length) return notify(t("Sélectionnez aussi les formes à ajouter"));
  rebuildArray(id, [...def.source, ...extra]);
}

/** Disposer → Retirer de la répétition : les formes d'origine sélectionnées redeviennent indépendantes. */
export function removeFromArray() {
  const id = selectedArray();
  if (!id) return notify(t("Sélectionnez une répétition"));
  const st = getState();
  const def = st.project.arrays![id];
  const out = new Set(st.selection.filter((sid) => def.source.includes(sid)));
  if (!out.size) return notify(t("Sélectionnez les formes d'origine à retirer"));
  rebuildArray(id, def.source.filter((sid) => !out.has(sid)));
}

/** Disposer → Dupliquer la répétition : une nouvelle répétition, décalée, avec les mêmes réglages. */
export function duplicateArray() {
  const id = selectedArray();
  if (!id) return notify(t("Sélectionnez une répétition"));
  const st = getState();
  const def = st.project.arrays![id];
  const originals = st.project.shapes.filter((s) => def.source.includes(s.id));
  const clones = cloneShapes(originals, translate(10, 10));
  const nid = uid();
  const copyDef = { ...def, source: clones.map((s) => s.id), ...(def.kind === "radial" ? { center: [def.center[0] + 10, def.center[1] + 10] as Pt } : {}) };
  const copies = arrayCopies(copyDef, clones).map((s) => ({ ...s, arrayCopy: nid }));
  commit((p) => ({ ...p, shapes: [...p.shapes, ...clones, ...copies], arrays: { ...p.arrays, [nid]: copyDef } }), { selection: [...clones.map((s) => s.id), ...copies.map((s) => s.id)] });
}

/** Disposer → Aplatir la répétition : les copies deviennent des formes ordinaires. */
export function flattenArray() {
  const id = selectedArray();
  if (!id) return notify(t("Sélectionnez une répétition"));
  commit((p) => {
    const { [id]: _gone, ...arrays } = p.arrays ?? {};
    return { ...p, arrays, shapes: p.shapes.map((s) => (s.arrayCopy === id ? { ...s, arrayCopy: undefined } : s)) };
  });
}

// ------------------------------------------------------- Texte et QR

const textRequests = new Map<string, number>();

/** Recalcule les tracés d'un texte après modification de ses propriétés. */
export async function updateText(id: string, patch: Partial<TextShape>) {
  const st = getState();
  const shape = st.project.shapes.find((s) => s.id === id);
  if (!shape || shape.kind !== "text") return;
  const next = { ...shape, ...patch };
  const req = (textRequests.get(id) ?? 0) + 1;
  textRequests.set(id, req);
  try {
    const paths = await textPaths(next);
    if (textRequests.get(id) !== req) return; // une saisie plus récente l'emporte
    updateShapes([id], (s) => ({ ...(s as TextShape), ...patch, paths }));
  } catch (e) {
    notify(t("Police inutilisable : {error}", { error: message(e) }));
  }
}

/** Fige le texte variable : les textes sélectionnés (ou tous) deviennent du texte ordinaire. */
export function bakeVariableTexts() {
  const st = getState();
  const selected = new Set(st.selection);
  const targets = st.project.shapes.filter((s): s is TextShape => s.kind === "text" && hasVariables(s.text) && (!selected.size || selected.has(s.id)));
  if (!targets.length) return notify(t("Aucun texte variable"));
  const baked = new Map(targets.map((s) => [s.id, displayedText(s)]));
  updateShapes([...baked.keys()], (s) => ({ ...(s as TextShape), text: baked.get(s.id)!, varOffset: undefined }));
  notify(t("{n} texte(s) figé(s)", { n: baked.size }));
}

export async function addText(at: Pt) {
  const o = getState().toolOptions;
  const font = await defaultFont(o.defaultFontFamily);
  if (!font) return notify(t("Aucune police disponible (le texte nécessite l'application Lumière)"));
  const base: Omit<TextShape, "paths"> = {
    id: uid(), kind: "text", name: t("Texte"), layerId: getState().currentLayer, matrix: translate(at[0], at[1]),
    text: t("Texte"), font, height: o.defaultTextHeight || 10, align: "left", letterSpacing: 0, lineSpacing: 1.4, weld: true,
  };
  try {
    addShapes([{ ...base, paths: await textPaths(base) }]);
    window.dispatchEvent(new Event("lumiere:edit-text"));
  } catch (e) {
    notify(t("Police inutilisable : {error}", { error: message(e) }));
  }
}

export function convertToPath() {
  const targets = selectedShapes().filter((s): s is TextShape => s.kind === "text");
  if (!targets.length) return;
  const ids = new Set(targets.map((s) => s.id));
  updateShapes([...ids], (s) => {
    const { text: _t, font: _f, height: _h, align: _a, letterSpacing: _l, lineSpacing: _s, weld: _w, ...rest } = s as TextShape;
    return { ...rest, kind: "vector" };
  });
}

export function addQr(text: string, size: number, level: QrLevel, logo?: Polyline[], format: "qr" | "datamatrix" = "qr") {
  if (!text) return;
  const paths = format === "datamatrix" ? dataMatrixPaths(text, size) : logo?.length ? qrWithLogo(text, size, logo) : qrPaths(text, size, level);
  const shape = vectorFromWorld(paths, getState().currentLayer, `QR « ${text.slice(0, 24)} »`);
  if (shape) addShapes(centerOnBed([shape]));
}

// --------------------------------------------------------- Images

export function updateImage(id: string, patch: Partial<ImageShape>) {
  updateShapes([id], (s) => (s.kind === "image" ? { ...s, ...patch, adjust: { ...s.adjust, ...patch.adjust } } : s));
}

/** Vectorise une image : les contours sont placés exactement sur l'image. */
/** Contours d'une image sous forme vectorielle (sans l'ajouter au projet). */
/** Tracés de l'image en pixels (aperçu et vectorisation) et l'image en gris utilisée. */
export async function traceLoops(shape: ImageShape, o: TraceOptions, pw: number, ph: number): Promise<{ loops: Polyline[]; gray: Uint8Array }> {
  let gray = await renderGray(shape, pw, ph, [pw / shape.width, 0, 0, ph / shape.height, 0, 0]);
  if (o.sketch) gray = edgeMap(gray, pw, ph);
  const loops = o.centerline || o.sketch ? traceCenterline(gray, pw, ph, o) : traceBitmap(gray, pw, ph, o);
  return { loops, gray };
}

async function traceToShape(shape: ImageShape, o: TraceOptions & { resolution: number }): Promise<Shape | null> {
  const pw = Math.max(1, Math.round(shape.width / o.resolution));
  const ph = Math.max(1, Math.round(shape.height / o.resolution));
  if (pw * ph > 16_000_000) throw new Error(t("Résolution trop fine pour cette image"));
  const { loops } = await traceLoops(shape, o, pw, ph);
  if (!loops.length) return null;
  const toWorld = mul(shape.matrix, [shape.width / pw, 0, 0, shape.height / ph, 0, 0]);
  const world = loops.map((p) => ({ closed: p.closed, pts: p.pts.map((q) => apply(toWorld, q)) }));
  const st = getState();
  const layerId = st.project.layers.find((l) => l.id === st.currentLayer)?.mode === "image" ? freeLayer(st.project, 0, new Set()) : st.currentLayer;
  return vectorFromWorld(world, layerId, t("Vectorisation de {name}", { name: shape.name }));
}

/**
 * Outils → Générer un contour : silhouette de la sélection (images comprises, d'après leurs
 * pixels non blancs), sans trous, éloignée de `distance` mm — pour découper autour d'un sticker.
 */
export async function generateOutline(distance: number, join: JoinKind = "round") {
  const shapes = selectedShapes();
  if (!shapes.length) return notify(t("Sélectionnez des formes ou des images"));
  const paths: Polyline[] = [];
  for (const s of shapes) {
    if (s.kind === "image") {
      const traced = await traceToShape(s, { threshold: 250, minArea: 4, tolerance: 0.5, smooth: true, resolution: Math.max(0.1, Math.min(s.width, s.height) / 800) });
      if (traced && hasPaths(traced)) paths.push(...worldPaths(traced));
    } else paths.push(...worldPaths(s).filter((p) => p.closed));
  }
  if (!paths.length) return notify(t("Aucun contour fermé dans la sélection"));
  const merged = outerContours(booleanOp("union", [paths]));
  const result = distance ? offsetPaths(merged, distance, join) : merged;
  const outline = outerContours(result);
  const shape = vectorFromWorld(outline, getState().currentLayer, t("Contour"));
  if (shape) addShapes([shape]);
}

export async function traceImage(shape: ImageShape, o: TraceOptions & { resolution: number }, deleteImage = false) {
  try {
    const s = await traceToShape(shape, o);
    if (!s) return notify(t("Aucun contour trouvé : ajustez le seuil"));
    if (deleteImage) {
      commit((p) => withLayer({ ...p, shapes: [...p.shapes.filter((x) => x.id !== shape.id), s] }, s.layerId), { selection: [s.id] });
    } else addShapes([s]);
    notify(t("{n} contours créés", { n: (s as VectorShape).paths.length }));
  } catch (e) {
    notify(message(e));
  }
}

// ------------------------------------------------------- Édition de nœuds

/** Forme en cours d'édition de nœuds : la seule forme vectorielle sélectionnée. */
export function nodeTarget(): (Shape & { kind: "vector" }) | null {
  const s = selectedShapes();
  return s.length === 1 && s[0].kind === "vector" ? s[0] : null;
}

/** Courbes éditables d'une forme ; une polyligne devient une suite de nœuds anguleux. */
export const curvesOf = (s: Shape & { kind: "vector" }): BezPath[] => s.curves ?? fromPolylines(s.paths);

/** Applique une modification de courbes à la forme (avec ou sans point d'historique). */
export function editCurves(id: string, f: (c: BezPath[]) => BezPath[] | null, history = true) {
  const shape = getState().project.shapes.find((s) => s.id === id);
  if (!shape || shape.kind !== "vector") return;
  const curves = f(curvesOf(shape));
  if (!curves) return;
  if (!curves.length) return deleteSelection();
  // Une forme éditée à la main n'est plus une forme paramétrique.
  updateShapes([id], (s) => ({ ...s, curves, paths: flattenBez(curves, 0.02), primitive: undefined }), history);
}

/** Courbe d'une forme paramétrique, dans son repère local. */
export function primitiveCurve(p: Primitive): BezPath {
  switch (p.type) {
    case "rect": return roundedRectBez(0, 0, p.w, p.h, p.radius);
    case "ellipse": return ellipseBez(p.w / 2, p.h / 2, p.w / 2, p.h / 2);
    case "polygon": return fromPolylines([polygonPath(p.w, p.h, p.sides)])[0];
    case "star": return radialStar(p.w, p.h, p.points, [1, p.ratio], p.bulge ?? 0);
    case "dualStar": return radialStar(p.w, p.h, p.points, [1, p.ratio, p.ratio2, p.ratio], p.bulge ?? 0);
  }
}

/**
 * Étoile inscrite dans w × h : `count` motifs de rayons relatifs `radii`. Le bombé (−1…1)
 * courbe chaque côté vers l'extérieur (positif) ou l'intérieur.
 */
export function radialStar(w: number, h: number, count: number, radii: number[], bulge: number): BezPath {
  const n = count * radii.length;
  const pts: Pt[] = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const k = radii[i % radii.length];
    return [w / 2 + (w / 2) * k * Math.cos(a), h / 2 + (h / 2) * k * Math.sin(a)];
  });
  if (!bulge) return fromPolylines([{ closed: true, pts }])[0];
  const c: Pt = [w / 2, h / 2];
  const nodes: BezNode[] = pts.map((p) => ({ p }));
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    // Normale du côté, tournée vers l'extérieur (à l'opposé du centre).
    let nx = -dy, ny = dx;
    const mx = (a[0] + b[0]) / 2 - c[0], my = (a[1] + b[1]) / 2 - c[1];
    if (nx * mx + ny * my < 0) [nx, ny] = [-nx, -ny];
    // Points de contrôle décalés de bombé × longueur / 3 : le milieu du côté bouge de bombé × longueur / 4.
    const k = bulge / 3;
    nodes[i].c2 = [a[0] + dx / 3 + nx * k, a[1] + dy / 3 + ny * k];
    nodes[(i + 1) % n].c1 = [a[0] + (2 * dx) / 3 + nx * k, a[1] + (2 * dy) / 3 + ny * k];
  }
  return { closed: true, nodes };
}

/** Modifie un paramètre (rayon, côtés, branches…) d'une forme paramétrique. */
export function setPrimitive(id: string, patch: Partial<Primitive>) {
  updateShapes([id], (s) => {
    if (s.kind !== "vector" || !s.primitive) return s;
    const primitive = { ...s.primitive, ...patch } as Primitive;
    const curves = [primitiveCurve(primitive)];
    return { ...s, primitive, curves, paths: flattenBez(curves, 0.02) };
  });
}

// ---------------------------------------------------------- Attaches manuelles

/** Ajoute une attache au point cliqué (repère plateau), ou retire la plus proche (`remove`). */
export function toggleTab(shape: Shape, p: Pt, remove: boolean, tol: number) {
  if (!hasPaths(shape)) return;
  const inv = invert(shape.matrix);
  const tabs = shape.tabs ?? [];
  if (remove) {
    const world = tabs.map((t) => apply(shape.matrix, t));
    const i = world.findIndex((t) => Math.hypot(t[0] - p[0], t[1] - p[1]) <= tol);
    if (i >= 0) updateShapes([shape.id], (s) => ({ ...s, tabs: tabs.filter((_, j) => j !== i) }));
    return;
  }
  updateShapes([shape.id], (s) => ({ ...s, tabs: [...tabs, apply(inv, p)] }));
}

export const clearTabs = () => updateShapes(sel(), (s) => ({ ...s, tabs: undefined }));

export function selectGroupAware(ids: string[]) {
  setState({ selection: withGroups(ids, getState().project.shapes) });
}

export { updateLayer };

// ------------------------------------------------------ Outils avancés

/**
 * Congés (ou chanfreins) : sur les nœuds sélectionnés en mode Nœuds, sinon sur tous
 * les angles des formes sélectionnées.
 */
export function filletSelection(radius: number, chamfer: boolean) {
  const st = getState();
  const targets = selectedShapes().filter((s): s is Shape & { kind: "vector" } => s.kind === "vector");
  if (!targets.length) return notify(t("Sélectionnez des formes vectorielles (les textes doivent être convertis)"));
  const nodeMode = st.tool === "node" && st.nodeSel.length > 0 && targets.length === 1;
  for (const s of targets) {
    // Le rayon est donné en mm plateau : on le ramène dans le repère local.
    const scale = Math.sqrt(Math.abs(s.matrix[0] * s.matrix[3] - s.matrix[1] * s.matrix[2])) || 1;
    editCurves(s.id, (c) => filletNodes(c, nodeMode ? st.nodeSel.map(parseKey) : cornerNodes(c), radius / scale, chamfer));
  }
  setState({ nodeSel: [] });
}

/** Relie les extrémités proches (tolérance en mm) et ferme les tracés qui bouclent. */
export function autoJoinSelection(tol: number) {
  const targets = selectedShapes().filter((s): s is Shape & { kind: "vector" } => s.kind === "vector");
  if (!targets.length) return notify(t("Sélectionnez des formes vectorielles"));
  // Les tracés de plusieurs formes sont d'abord réunis dans le repère plateau.
  const world = targets.flatMap((s) => transformBez(curvesOf(s), s.matrix));
  const joined = autoJoin(world, tol);
  const before = world.filter((p) => !p.closed).length;
  const after = joined.filter((p) => !p.closed).length;
  if (targets.length === 1 && joined.length === world.length && before === after) return notify(t("Aucune extrémité à relier"));
  replaceWith(targets, flattenBez(joined, 0.01), targets.length > 1 ? t("Jonction") : targets[0].name, joined);
  notify(t("{before} tracé(s) ouvert(s) → {after}", { before, after }));
}

export function simplifySelection(tol: number) {
  const targets = selectedShapes().filter(hasPaths);
  if (!targets.length) return;
  let before = 0, after = 0;
  const updated = new Map<string, Shape>();
  for (const s of targets) {
    const world = worldPaths(s);
    const simple = simplifyPaths(world, tol);
    before += world.reduce((n, p) => n + p.pts.length, 0);
    after += simple.reduce((n, p) => n + p.pts.length, 0);
    const shape = vectorFromWorld(simple, s.layerId, s.name);
    if (shape) updated.set(s.id, { ...shape, id: s.id, groupId: s.groupId });
  }
  updateShapes([...updated.keys()], (s) => updated.get(s.id) ?? s);
  notify(t("{before} → {after} points", { before, after }));
}

/** Imbrique la sélection (groupes gardés ensemble) dans le plateau, ou dans la zone donnée. */
/**
 * Imbrication : les pièces (groupes, ou formes et les formes qu'elles contiennent si
 * `lockInner`) sont rangées sur le plateau ; avec `multipage`, celles qui ne tiennent pas
 * partent sur de nouvelles pages, imbriquées à leur tour.
 */
export function nestSelection(gap: number, allowRotate: boolean, margin: number, lockInner = false, multipage = false) {
  const st = getState();
  const shapes = selectedShapes();
  if (!shapes.length) return;
  const units = new Map<string, Shape[]>();
  for (const s of shapes) units.set(s.groupId ?? s.id, [...(units.get(s.groupId ?? s.id) ?? []), s]);
  let pieces = [...units].map(([id, members]) => ({ id, members, box: unionBoxes(members.map(shapeBox))! }));
  if (lockInner) {
    // Une pièce dont la boîte est dans celle d'une autre la suit (inscription dans une plaque…).
    const inside = (a: Box, b: Box) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6 && a.w * a.h < b.w * b.h;
    const host = pieces.map((p) => pieces.filter((q) => q !== p && inside(p.box, q.box)).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0]);
    const root = (k: number): number => {
      const h = host[k];
      return h ? root(pieces.indexOf(h)) : k;
    };
    const merged = new Map<number, typeof pieces[number]>();
    pieces.forEach((p, k) => {
      const r = root(k);
      const m = merged.get(r) ?? { ...pieces[r], members: [] };
      m.members = [...m.members, ...p.members];
      merged.set(r, m);
    });
    pieces = [...merged.values()];
  }
  const area = { x: margin, y: margin, w: st.machine.bedWidth - 2 * margin, h: st.machine.bedHeight - 2 * margin };
  const moves = new Map<string, Mat>();
  const pageOf = new Map<string, number>(); // 0 : page courante, n : n-ième nouvelle page
  let left = pieces;
  for (let round = 0; left.length && (round === 0 || multipage) && round < 50; round++) {
    const places = nestBoxes(left.map((b) => ({ id: b.id, w: b.box.w, h: b.box.h })), area, gap, allowRotate);
    const rest: typeof left = [];
    places.forEach((p, i) => {
      const { members, box } = left[i];
      if (!p) return void rest.push(left[i]);
      // Rotation de 90° autour du coin, puis placement du coin haut gauche.
      let m: Mat = translate(-box.x, -box.y);
      if (p.rotated) m = mul([0, 1, -1, 0, box.h, 0], m);
      m = mul(translate(p.x, p.y), m);
      for (const s of members) {
        moves.set(s.id, m);
        pageOf.set(s.id, round);
      }
    });
    if (rest.length === left.length) break; // une pièce plus grande que le plateau
    left = rest;
  }
  const missing = left.reduce((n, p) => n + (p.members.some((s) => !moves.has(s.id)) ? 1 : 0), 0);
  const extraPages = Math.max(0, ...[...pageOf.values()]);
  commit((p) => {
    const moved = p.shapes.map((s) => (moves.has(s.id) ? { ...s, matrix: mul(moves.get(s.id)!, s.matrix) } : s));
    if (!extraPages) return { ...p, shapes: moved };
    const pages = pagesOf(p);
    const cur = p.page ?? 0;
    const stay = moved.filter((s) => (pageOf.get(s.id) ?? 0) === 0);
    const added = Array.from({ length: extraPages }, (_, k) => ({ name: t("Imbrication {n}", { n: k + 2 }), shapes: moved.filter((s) => pageOf.get(s.id) === k + 1) }));
    const all = [...pages.slice(0, cur), { ...pages[cur], shapes: stay }, ...pages.slice(cur + 1), ...added];
    return { ...p, pages: all, page: cur, shapes: stay };
  });
  if (extraPages) notify(t("{n} page(s) ajoutée(s) pour les pièces qui ne tenaient pas", { n: extraPages }));
  notify(missing ? t("{n} pièce(s) ne tiennent pas sur le plateau", { n: missing }) : t("{n} pièce(s) imbriquées", { n: pieces.length }));
}

/**
 * Copie le long d'un chemin : la dernière forme sélectionnée est le chemin, les autres
 * sont copiées à intervalles réguliers, éventuellement tournées selon la tangente.
 */
export function copyAlongPath(count: number, rotateCopies: boolean, spacing = 0, textStep = 0) {
  const st = getState();
  const ordered = st.selection.map((id) => st.project.shapes.find((s) => s.id === id)!).filter(Boolean);
  const guide = ordered[ordered.length - 1];
  const items = ordered.slice(0, -1);
  if (!guide || !hasPaths(guide) || !items.length) return notify(t("Sélectionnez les formes à copier, puis le chemin en dernier (Maj+clic)"));
  const path = worldPaths(guide)[0];
  const box = unionBoxes(items.map(shapeBox))!;
  const c = boxCenter(box);
  const copies: Shape[] = [];
  // Espacement fixe (mm) le long du chemin, sinon `count` copies réparties.
  const along = sampler(path);
  const spots = spacing > 0
    ? Array.from({ length: Math.min(10000, Math.floor(along.length / spacing) + (path.closed ? 0 : 1)) }, (_, k) => along.at(k * spacing))
    : positionsAlong(path, count);
  spots.forEach(({ p, angle }, k) => {
    let m: Mat = translate(p[0] - c[0], p[1] - c[1]);
    if (rotateCopies) m = mul(rotateAbout(angle, p), m);
    const step = textStep * k;
    copies.push(...cloneShapes(items, m).map((s) => (step && s.kind === "text" ? { ...s, varOffset: (s.varOffset ?? 0) + step } : s)));
  });
  addShapes(copies);
  if (textStep && copies.some((s) => s.kind === "text")) void refreshVariableTexts();
}

/** Convertit la sélection en image (à la résolution donnée), sur un calque Image. */
export async function convertToBitmap(dpi: number, keepOriginal: boolean) {
  const shapes = selectedShapes();
  const box = unionBoxes(shapes.map(shapeBox));
  if (!box) return;
  const k = dpi / 25.4;
  const pw = Math.max(1, Math.round(box.w * k)), ph = Math.max(1, Math.round(box.h * k));
  if (pw * ph > 40_000_000) return notify(t("Résolution trop élevée pour cette taille"));
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, pw, ph);
  const st = getState();
  for (const s of st.project.shapes.filter((x) => shapes.includes(x))) {
    ctx.setTransform(pw / box.w, 0, 0, ph / box.h, (-box.x * pw) / box.w, (-box.y * ph) / box.h);
    if (s.kind === "image") {
      ctx.transform(...s.matrix);
      ctx.drawImage(await loadImage(s.src), 0, 0, s.width, s.height);
      continue;
    }
    // Remplissage pour les calques remplis, contour fin pour les calques ligne.
    const filled = st.project.layers.find((l) => l.id === s.layerId)?.mode !== "line";
    ctx.beginPath();
    for (const p of worldPaths(s)) {
      p.pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
      if (p.closed) ctx.closePath();
    }
    ctx.fillStyle = ctx.strokeStyle = "#000";
    if (filled) ctx.fill("evenodd");
    else {
      ctx.lineWidth = 0.2;
      ctx.stroke();
    }
  }
  const src = canvas.toDataURL("image/png");
  await loadImage(src);
  const shape: Shape = {
    id: uid(), kind: "image", name: t("Image convertie"), layerId: imageLayer(), matrix: translate(box.x, box.y), src,
    width: box.w, height: box.h, adjust: { ...DEFAULT_ADJUST },
  };
  const ids = new Set(shapes.map((s) => s.id));
  commit((p) => withLayer({ ...p, shapes: [...p.shapes.filter((s) => keepOriginal || !ids.has(s.id)), shape] }, shape.layerId), {
    selection: [shape.id],
  });
}

/** Fichier → Exporter : SVG, DXF ou PDF / AI selon l'extension choisie. */
export async function exportSvgFile(selectionOnly: boolean) {
  const st = getState();
  const only = onlySelection(selectionOnly);
  const { exportDxf, exportPdf } = await import("./export/vectors");
  const write = (ext: string) =>
    ext === "dxf" ? exportDxf(st.project, st.machine.bedHeight, only)
      : ext === "pdf" || ext === "ai" ? exportPdf(st.project, st.machine.bedWidth, st.machine.bedHeight, only)
        : exportSvg(st.project, st.machine.bedWidth, st.machine.bedHeight, only);
  if (!isTauri()) return void (await exportText(write("svg"), "dessin.svg"));
  const path = await save({
    defaultPath: t("dessin.svg"),
    filters: [{ name: "SVG", extensions: ["svg"] }, { name: "DXF", extensions: ["dxf"] }, { name: "PDF", extensions: ["pdf"] }, { name: "Adobe Illustrator (PDF)", extensions: ["ai"] }],
  });
  if (!path) return;
  const ext = path.split(".").pop()?.toLowerCase() ?? "svg";
  try {
    await api.writeTextFile(path, write(ext));
    if (ext !== "svg" && st.project.shapes.some((s) => s.kind === "image" && (!only || only.has(s.id)))) notify(t("Les images ne sont pas exportées dans ce format"));
    notify(t("{name} exporté", { name: path.split(/[\\/]/).pop() ?? path }));
  } catch (e) {
    notify(message(e));
  }
}

/** Cadrage serré : parcourt l'enveloppe convexe des formes au lieu de leur boîte. */
export function frameHull(selectionOnly = false, power = 0, o: FrameOptions = {}) {
  frame(selectionOnly, power, o, (shapes, boxOf) => {
    const hull = convexHull(shapes.flatMap((s) => (s.kind === "image" ? rectOf(boxOf(s) ?? shapeBox(s)!) : shapePoints(s))));
    return hull.length >= 3 ? hull : null;
  });
}

// ------------------------------------------------------ Codes-barres, notes

export async function addBarcode(type: BarcodeType, text: string, module: number, height: number, showText = false) {
  try {
    const paths = barcodePaths(type, text, module, height);
    const shape = vectorFromWorld(paths, getState().currentLayer, t("Code-barres {text}", { text }));
    if (!shape) return;
    const [placed] = centerOnBed([shape]);
    const box = shapeBox(placed);
    const font = showText ? await defaultFont(getState().toolOptions.defaultFontFamily) : null;
    if (!font || !box) return addShapes([placed]);
    // Texte lisible centré sous les barres, groupé avec elles.
    const groupId = uid();
    const h = Math.max(1.5, Math.min(height * 0.2, box.w / Math.max(4, text.length)));
    const label: Omit<TextShape, "paths"> = {
      id: uid(), kind: "text", name: text, layerId: placed.layerId, groupId, matrix: translate(box.x + box.w / 2, box.y + box.h + h * 1.4),
      text, font, height: h, align: "center", letterSpacing: 0, lineSpacing: 1.2, weld: true,
    };
    addShapes([{ ...placed, groupId }, { ...label, paths: await textPaths(label) }]);
  } catch (e) {
    notify(message(e));
  }
}

export function setNotes(notes: string) {
  commit((p) => ({ ...p, notes }));
}

// ------------------------------------------------ Imprimer et découper

/**
 * Similitude (rotation, échelle uniforme, translation) qui envoie les deux repères
 * du dessin (a, b) sur leurs positions mesurées au laser (a2, b2).
 */
export function similarity(a: Pt, b: Pt, a2: Pt, b2: Pt): Mat {
  const d = [b[0] - a[0], b[1] - a[1]], l = [b2[0] - a2[0], b2[1] - a2[1]];
  const k = Math.hypot(l[0], l[1]) / (Math.hypot(d[0], d[1]) || 1);
  const t = Math.atan2(l[1], l[0]) - Math.atan2(d[1], d[0]);
  const c = Math.cos(t) * k, s = Math.sin(t) * k;
  return [c, s, -s, c, a2[0] - (c * a[0] - s * a[1]), a2[1] - (s * a[0] + c * a[1])];
}

/** Position actuelle de la tête, en coordonnées plateau. */
export function headPosition(): Pt | null {
  const status = getLaserState().status;
  const m = getState().machine;
  return status ? bedToMachine([status.wpos[0], status.wpos[1]], m.origin, m.bedWidth, m.bedHeight) : null;
}

// ---------------------------------------------------------- Texte sur chemin

/** Fait suivre au texte sélectionné le chemin sélectionné (le chemin est conservé). */
export async function applyPathToText() {
  const shapes = selectedShapes();
  const text = shapes.find((s): s is TextShape => s.kind === "text");
  const path = shapes.find((s) => s.kind === "vector");
  if (!text || !path) return notify(t("Sélectionnez un texte et un tracé"));
  const world = worldPaths(path)[0];
  if (!world) return;
  const inv = invert(text.matrix);
  const onPath = { pts: world.pts.map((p) => apply(inv, p)), closed: world.closed, offset: 0 };
  await updateText(text.id, { onPath });
  setState({ selection: [text.id] });
}

export const detachTextFromPath = (id: string) => updateText(id, { onPath: undefined });

// ----------------------------------------------------------------- Masque d'image

/** Masque l'image sélectionnée avec la forme vectorielle sélectionnée. */
export function maskImage() {
  const shapes = selectedShapes();
  const image = shapes.find((s): s is ImageShape => s.kind === "image");
  const masks = shapes.filter((s) => s.kind !== "image");
  if (!image || !masks.length) return notify(t("Sélectionnez une image et une forme fermée"));
  const inv = invert(image.matrix);
  const mask = masks.flatMap(worldPaths).filter((p) => p.closed).map((p) => ({ closed: true, pts: p.pts.map((q) => apply(inv, q)) }));
  if (!mask.length) return notify(t("La forme de masque doit être fermée"));
  updateShapes([image.id], (s) => ({ ...s, mask }));
  setState({ selection: [image.id] });
}

export const removeMask = (id: string) => updateShapes([id], (s) => ({ ...s, mask: undefined }));

// --------------------------------------------------------------- Outil Ajuster

/** Coupe la forme sous le clic entre ses intersections les plus proches. */
export function trimShapeAt(shape: Shape, click: Pt) {
  if (!hasPaths(shape)) return;
  const others = getState().project.shapes.filter((s) => s.id !== shape.id && hasPaths(s)).flatMap(worldPaths);
  const result = trimAt(worldPaths(shape), others, click);
  if (!result.length) return commit((p) => ({ ...p, shapes: p.shapes.filter((s) => s.id !== shape.id) }), { selection: [] });
  const next = vectorFromWorld(result, shape.layerId, shape.name);
  if (next) updateShapes([shape.id], () => ({ ...next, id: shape.id, groupId: shape.groupId }));
}

// --------------------------------------------------------- Déplacements du laser

/** Envoie la tête au point du plateau donné (laser éteint). */
export function moveLaserTo(p: Pt) {
  const m = getState().machine;
  const [x, y] = bedToMachine(p, m.origin, m.bedWidth, m.bedHeight);
  laser.send(`G90 G0 X${x.toFixed(3)} Y${y.toFixed(3)}`);
}

/** Envoie la tête sur le point d'ancrage choisi (9 points) de la sélection. */
/** Envoie la tête sur un des 9 points de la sélection (0 = haut gauche … 4 = centre … 8 = bas droit), par défaut le point d'ancrage du travail. */
export function moveLaserToSelection(anchor = getState().jobOrigin.anchor) {
  const box = selectionBox();
  if (!box) return notify(t("Rien de sélectionné"));
  moveLaserTo(anchorPoint(box, anchor));
}

/** Place la sélection dans un coin du plateau (ex. `["top", "left"]`). */
export function pushToCorner(edges: ("left" | "right" | "top" | "bottom")[]) {
  edges.forEach(pushToEdge);
}

/** Plaque la sélection contre un bord du plateau. */
export function pushToEdge(edge: "left" | "right" | "top" | "bottom") {
  const { bedWidth, bedHeight } = getState().machine;
  transformSelection((b) =>
    translate(edge === "left" ? -b.x : edge === "right" ? bedWidth - b.x - b.w : 0, edge === "top" ? -b.y : edge === "bottom" ? bedHeight - b.y - b.h : 0),
  );
}

// ------------------------------------------------------ Image traitée (PNG)

/** Enregistre l'image telle qu'elle sera gravée (tramage du calque, un pixel par pas). */
export async function saveProcessedBitmap() {
  const image = selectedShapes().find((s): s is ImageShape => s.kind === "image");
  if (!image) return notify(t("Sélectionnez une image"));
  const layer = getState().project.layers.find((l) => l.id === image.layerId);
  if (!layer) return;
  const pw = Math.max(1, Math.round(image.width / layer.interval)), ph = Math.max(1, Math.round(image.height / layer.interval));
  const gray = await renderGray(image, pw, ph, [pw / image.width, 0, 0, ph / image.height, 0, 0]);
  const screen = { cell: 25.4 / Math.max(1, layer.halftoneLpi) / layer.interval, angle: layer.halftoneAngle };
  const out = layer.dither === "grayscale" || !isTauri() ? gray : await ditherRaw(gray, pw, ph, layer.dither, screen);
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(pw, ph);
  for (let i = 0; i < out.length; i++) {
    data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = out[i];
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
  const name = `${image.name.replace(/\.[^.]+$/, "")}-traitee.png`;
  if (!isTauri()) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    return;
  }
  const path = await save({ defaultPath: name, filters: [{ name: t("Image PNG"), extensions: ["png"] }] });
  if (!path) return;
  await invoke("write_binary_file", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-path": encodeURIComponent(path) } });
  notify(t("Image traitée enregistrée ({w} × {h} px, {dpi} DPI)", { w: pw, h: ph, dpi: Math.round(25.4 / layer.interval) }));
}

// ------------------------------------------------------ Fichier G-code externe

/** Envoie au laser un fichier G-code existant (préparé ailleurs). */
/** Ruida (expérimental) : fichier .rd à charger sur clé USB ou dans RDWorks. */
export async function exportRuida() {
  try {
    const { result } = await generate(false, true);
    const bytes = new Uint8Array(await api.ruidaFile(result.gcode, getState().machine.sMax));
    if (!isTauri()) return;
    const path = await save({ defaultPath: "travail.rd", filters: [{ name: "Ruida", extensions: ["rd"] }] });
    if (!path) return;
    await invoke("write_binary_file", bytes, { headers: { "x-path": encodeURIComponent(path) } });
    notify(t("Fichier Ruida exporté ({n} octets) — expérimental, à vérifier dans RDWorks", { n: bytes.length }));
  } catch (e) {
    notify(message(e));
  }
}

export async function runGcodeFile() {
  if (!getLaserState().connected) return notify(t("Laser non connecté"));
  const [file] = await pickFiles(".gcode,.nc,.gc,.ngc,.txt", false);
  if (!file) return;
  const text = await file.text();
  const toolpath = parseToolpath(text, getState().machine);
  log(t("Fichier {name} : {n} mouvements", { name: file.name, n: toolpath.count }));
  await laser.start(text);
}

// ------------------------------------------------- Sauvegarde automatique

/** Une copie par fenêtre ; seule la fenêtre principale propose la récupération. */
const windowLabel = () => (isTauri() ? getCurrentWebviewWindow().label : "main");
const AUTOSAVE_KEY = windowLabel() === "main" ? "lumiere.autosave" : `lumiere.autosave.${windowLabel()}`;

/** Enregistre le projet modifié dans le stockage local (récupération après fermeture). */
export function autosave() {
  const st = getState();
  try {
    if (!st.dirty) localStorage.removeItem(AUTOSAVE_KEY);
    else localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ project: projectForSave(st.project), filePath: st.filePath, time: Date.now() }));
  } catch {
    // Projet trop gros (images) pour le stockage local : on n'en garde pas de copie.
  }
}

let recoveryOffered = false;

/** Au démarrage : propose de restaurer un projet non enregistré (une seule fois). */
export async function offerRecovery() {
  if (recoveryOffered || windowLabel() !== "main") return;
  recoveryOffered = true;
  let saved: { project: Project; filePath: string | null; time: number } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (!saved?.project?.shapes?.length) return;
  const when = new Date(saved.time).toLocaleString(language());
  const ok = isTauri()
    ? await confirm(t("Un projet non enregistré ({n} forme(s), {when}) peut être récupéré.", { n: saved.project.shapes.length, when }), {
        title: "Lumière", okLabel: t("Récupérer"), cancelLabel: t("Ignorer"),
      })
    : window.confirm(t("Récupérer le projet non enregistré du {when} ?", { when }));
  if (ok) {
    loadProject(saved.project, saved.filePath);
    setState({ dirty: true });
  } else localStorage.removeItem(AUTOSAVE_KEY);
}
