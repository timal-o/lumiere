// Opérations des menus Modifier, Outils et Disposer : tracés, sélections, rangement.

import { arcToCubics, flattenBez, type BezNode, type BezPath } from "./bezier";
import { apply, invert, mul, pointInPolygon, shapeBox, translate, unionBoxes, worldPaths, type Box } from "./geometry";
import { t, tk } from "./i18n";
import { loadImage, readAsDataUrl } from "./images";
import { hasPaths, uid, type ImageShape, type Mat, type Polyline, type Pt, type Shape, type VectorShape } from "./model";
import { booleanOp } from "./pathops";
import { commit, getState, selectedShapes, setState, updateShapes, withLayer } from "./store";
import { convexHull, shapePoints } from "./tools";
import {
  curvesOf, freeLayer, makePreview, notify, primitiveCurve, replaceWith, selectionBox, transformSelection, vectorFromWorld,
} from "./actions";

const vectors = () => selectedShapes().filter((s): s is VectorShape => s.kind === "vector");

/** Échelle moyenne d'une matrice (pour ramener une distance plateau dans le repère local). */
const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

/** Réécrit les courbes des formes vectorielles sélectionnées, en un seul point d'historique. */
function rewriteCurves(targets: VectorShape[], f: (c: BezPath[], s: VectorShape) => BezPath[] | null): number {
  const updated = new Map<string, Shape>();
  for (const s of targets) {
    const curves = f(curvesOf(s), s);
    if (curves) updated.set(s.id, { ...s, curves, paths: flattenBez(curves, 0.02), primitive: undefined });
  }
  if (updated.size) updateShapes([...updated.keys()], (s) => updated.get(s.id) ?? s);
  return updated.size;
}

// ------------------------------------------------------------------ Tracés

/** Ferme les tracés ouverts ; avec une tolérance (mm), seulement ceux dont les extrémités sont proches. */
export function closePaths(tol?: number) {
  const targets = vectors();
  if (!targets.length) return notify(t("Sélectionnez des formes vectorielles (les textes doivent être convertis)"));
  let count = 0;
  rewriteCurves(targets, (curves, s) => {
    let changed = false;
    const out = curves.map((c) => {
      if (c.closed || c.nodes.length < 2) return c;
      const a = c.nodes[0], b = c.nodes[c.nodes.length - 1];
      const gap = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
      if (tol !== undefined && gap * scaleOf(s.matrix) > tol) return c;
      changed = true;
      count++;
      // Extrémités confondues : le dernier nœud fusionne avec le premier.
      if (gap < 1e-6 && c.nodes.length > 2) {
        return { closed: true, nodes: [{ ...a, c1: b.c1 }, ...c.nodes.slice(1, -1)] };
      }
      return { ...c, closed: true };
    });
    return changed ? out : null;
  });
  notify(count ? t("{n} tracé(s) fermé(s)", { n: count }) : t("Aucun tracé ouvert à fermer"));
}

/** Inverse le sens de parcours des tracés (et donc le sens de découpe). */
export function reverseDirection() {
  const targets = vectors();
  if (!targets.length) return notify(t("Sélectionnez des formes vectorielles (les textes doivent être convertis)"));
  const flip = (n: BezNode): BezNode => ({ ...n, c1: n.c2, c2: n.c1 });
  rewriteCurves(targets, (curves) => curves.map((c) => ({ ...c, nodes: [...c.nodes].reverse().map(flip) })));
}

/** Crée des formes à partir de la trajectoire calculée (découpes de l'aperçu), sur un nouveau calque. */
export async function pathFromCut() {
  if (!selectedShapes().length) return notify(t("Sélectionnez les formes dont il faut générer le chemin"));
  await makePreview(true);
  const preview = getState().preview;
  if (!preview) return;
  const { segs, burn } = preview.toolpath;
  const paths: Polyline[] = [];
  let cur: Pt[] | null = null;
  for (let i = 0; i < burn.length; i++) {
    const a: Pt = [segs[i * 4], segs[i * 4 + 1]], b: Pt = [segs[i * 4 + 2], segs[i * 4 + 3]];
    if (!burn[i]) {
      cur = null;
      continue;
    }
    const last = cur?.[cur.length - 1];
    if (cur && last && Math.hypot(last[0] - a[0], last[1] - a[1]) < 1e-6) cur.push(b);
    else {
      cur = [a, b];
      paths.push({ closed: false, pts: cur });
    }
  }
  // Un tracé qui revient à son point de départ est fermé.
  for (const p of paths) {
    const [f, l] = [p.pts[0], p.pts[p.pts.length - 1]];
    if (p.pts.length > 3 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) {
      p.pts.pop();
      p.closed = true;
    }
  }
  if (!paths.length) return notify(t("Aucune découpe dans la sélection"));
  const st = getState();
  const layerId = freeLayer(st.project, st.currentLayer + 1, new Set());
  const shape = vectorFromWorld(paths, layerId, t("Chemin de coupe"));
  if (!shape) return;
  commit((p) => withLayer({ ...p, shapes: [...p.shapes, shape] }, layerId), { selection: [shape.id], preview: null });
}

// ---------------------------------------------------------------- Sélection

const visibleShapes = () => {
  const st = getState();
  const hidden = new Set(st.project.layers.filter((l) => !l.visible).map((l) => l.id));
  return st.project.shapes.filter((s) => !hidden.has(s.layerId));
};

function selectIds(ids: string[], none: string) {
  setState({ selection: ids });
  notify(ids.length ? t("{n} forme(s) sélectionnée(s)", { n: ids.length }) : none);
}

/** Formes ouvertes placées sur un calque Remplissage (elles ne seront pas remplies). */
export function selectOpenFill() {
  const fill = new Set(getState().project.layers.filter((l) => l.mode === "fill" || l.mode === "offsetFill").map((l) => l.id));
  const ids = visibleShapes().filter((s) => fill.has(s.layerId) && hasPaths(s) && worldPaths(s).some((p) => !p.closed)).map((s) => s.id);
  selectIds(ids, t("Aucune forme ouverte à remplir"));
}

/** Formes entièrement à l'intérieur des formes fermées sélectionnées. */
export function selectContained() {
  const containers = selectedShapes().filter(hasPaths).flatMap((s) => worldPaths(s).filter((p) => p.closed).map((p) => p.pts));
  if (!containers.length) return notify(t("Sélectionnez une forme fermée"));
  const selected = new Set(getState().selection);
  const inside = (pts: Pt[]) => pts.length > 0 && containers.some((c) => pts.every((p) => pointInPolygon(p, c)));
  selectIds(visibleShapes().filter((s) => !selected.has(s.id) && inside(shapePoints(s))).map((s) => s.id), t("Aucune forme contenue"));
}

/** Formes dont la boîte tient dans celle de la plus grande forme sélectionnée. */
export function selectSmaller() {
  const boxes = selectedShapes().map(shapeBox).filter((b): b is Box => !!b);
  if (!boxes.length) return notify(t("Sélectionnez une forme de référence"));
  const w = Math.max(...boxes.map((b) => b.w)), h = Math.max(...boxes.map((b) => b.h));
  const selected = new Set(getState().selection);
  const ids = visibleShapes().filter((s) => {
    const b = shapeBox(s);
    return !selected.has(s.id) && b && b.w < w + 1e-6 && b.h < h + 1e-6;
  }).map((s) => s.id);
  selectIds(ids, t("Aucune forme plus petite"));
}

/** Un seul tracé fermé dont tous les points sont à égale distance du centre (à 2 % près). */
export function isCircle(s: Shape): boolean {
  if (!hasPaths(s)) return false;
  const paths = worldPaths(s);
  if (paths.length !== 1 || !paths[0].closed || paths[0].pts.length < 8) return false;
  const pts = paths[0].pts;
  const c: Pt = [pts.reduce((n, p) => n + p[0], 0) / pts.length, pts.reduce((n, p) => n + p[1], 0) / pts.length];
  const r = pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return mean > 0 && r.every((d) => Math.abs(d - mean) <= mean * 0.02);
}

/** Cercles, éventuellement limités à une plage de diamètres (mm, 0 = sans limite). */
export function selectCircles(minDiameter = 0, maxDiameter = 0) {
  const ok = (s: Shape) => {
    const b = isCircle(s) ? shapeBox(s) : null;
    const d = b ? (b.w + b.h) / 2 : 0;
    return !!b && (!minDiameter || d >= minDiameter - 1e-6) && (!maxDiameter || d <= maxDiameter + 1e-6);
  };
  selectIds(visibleShapes().filter(ok).map((s) => s.id), t("Aucun cercle"));
}

/** Fait clignoter les formes du calque courant pour les repérer. */
export function flashCurrentLayer() {
  const st = getState();
  const ids = st.project.shapes.filter((s) => s.layerId === st.currentLayer).map((s) => s.id);
  if (!ids.length) return notify(t("Le calque actuel est vide"));
  window.dispatchEvent(new CustomEvent("lumiere:flash", { detail: ids }));
}

export function setLocked(locked: boolean) {
  const ids = getState().selection;
  if (!ids.length) return;
  updateShapes(ids, (s) => ({ ...s, locked: locked || undefined }));
  notify(locked ? t("{n} forme(s) verrouillée(s)", { n: ids.length }) : t("{n} forme(s) déverrouillée(s)", { n: ids.length }));
}

// ---------------------------------------------------------------- Rangement

/** Regroupe chaque forme avec celles qu'elle contient (lettres et leurs trous…). */
export function autoGroup() {
  const shapes = selectedShapes().length > 1 ? selectedShapes() : visibleShapes();
  const parent = new Map<string, string>();
  const root = (id: string): string => (parent.get(id) === undefined || parent.get(id) === id ? id : root(parent.get(id)!));
  const outlines = shapes.map((s) => ({ s, box: shapeBox(s), closed: hasPaths(s) ? worldPaths(s).filter((p) => p.closed).map((p) => p.pts) : [] }));
  for (const a of outlines) {
    for (const b of outlines) {
      if (a === b || !a.box || !b.box || !a.closed.length) continue;
      const within = b.box.x >= a.box.x && b.box.y >= a.box.y && b.box.x + b.box.w <= a.box.x + a.box.w && b.box.y + b.box.h <= a.box.y + a.box.h;
      const pts = shapePoints(b.s);
      if (within && pts.length && a.closed.some((c) => pointInPolygon(pts[0], c))) parent.set(root(b.s.id), root(a.s.id));
    }
  }
  const groups = new Map<string, string[]>();
  for (const s of shapes) groups.set(root(s.id), [...(groups.get(root(s.id)) ?? []), s.id]);
  const assign = new Map<string, string>();
  for (const ids of groups.values()) if (ids.length > 1) {
    const g = uid();
    ids.forEach((id) => assign.set(id, g));
  }
  if (!assign.size) return notify(t("Aucune forme imbriquée dans une autre"));
  updateShapes([...assign.keys()], (s) => ({ ...s, groupId: assign.get(s.id) }));
  notify(t("{n} groupe(s) créé(s)", { n: new Set(assign.values()).size }));
}

/** Symétrie des formes sélectionnées par rapport à la dernière sélectionnée, une ligne droite. */
export function mirrorAcrossLine() {
  const st = getState();
  const line = st.project.shapes.find((s) => s.id === st.selection[st.selection.length - 1]);
  const path = line && hasPaths(line) ? worldPaths(line) : [];
  if (st.selection.length < 2 || path.length !== 1 || path[0].closed || path[0].pts.length !== 2) {
    return notify(t("Sélectionnez les formes, puis en dernier une ligne droite (deux points)"));
  }
  const [p, q] = path[0].pts;
  const a = 2 * Math.atan2(q[1] - p[1], q[0] - p[0]);
  const m: Mat = mul(translate(p[0], p[1]), mul([Math.cos(a), Math.sin(a), Math.sin(a), -Math.cos(a), 0, 0], translate(-p[0], -p[1])));
  const ids = st.selection.slice(0, -1).filter((id) => !st.project.shapes.find((s) => s.id === id)?.locked);
  updateShapes(ids, (s) => ({ ...s, matrix: mul(m, s.matrix) }));
}

/** Unités de rangement : un groupe compte comme un bloc. */
function units(): { ids: string[]; box: Box }[] {
  const map = new Map<string, Shape[]>();
  for (const s of selectedShapes()) map.set(s.groupId ?? s.id, [...(map.get(s.groupId ?? s.id) ?? []), s]);
  return [...map.values()].map((ss) => ({ ids: ss.map((s) => s.id), box: unionBoxes(ss.map(shapeBox))! })).filter((u) => u.box);
}

/** Rapproche les formes jusqu'à ce qu'elles se touchent, sans espace, le long d'un axe. */
export function moveTogether(axis: "x" | "y") {
  const us = units().sort((a, b) => (axis === "x" ? a.box.x - b.box.x : a.box.y - b.box.y));
  if (us.length < 2) return notify(t("Sélectionnez au moins deux formes"));
  const moves = new Map<string, Mat>();
  let cursor = axis === "x" ? us[0].box.x : us[0].box.y;
  for (const u of us) {
    const d = cursor - (axis === "x" ? u.box.x : u.box.y);
    u.ids.forEach((id) => moves.set(id, axis === "x" ? translate(d, 0) : translate(0, d)));
    cursor += axis === "x" ? u.box.w : u.box.h;
  }
  updateShapes([...moves.keys()], (s) => (s.locked ? s : { ...s, matrix: mul(moves.get(s.id)!, s.matrix) }));
}

/** Pousse la sélection dans une direction jusqu'à la forme la plus proche ou au bord du plateau. */
export function dock(dir: "left" | "right" | "up" | "down") {
  const b = selectionBox();
  if (!b) return;
  const { bedWidth, bedHeight } = getState().machine;
  const selected = new Set(getState().selection);
  const others = visibleShapes().filter((s) => !selected.has(s.id)).map(shapeBox).filter((o): o is Box => !!o);
  const overlapY = (o: Box) => o.y < b.y + b.h && o.y + o.h > b.y;
  const overlapX = (o: Box) => o.x < b.x + b.w && o.x + o.w > b.x;
  const eps = 1e-6;
  let d = 0;
  if (dir === "left") d = Math.max(0, ...others.filter((o) => overlapY(o) && o.x + o.w <= b.x + eps).map((o) => o.x + o.w)) - b.x;
  if (dir === "right") d = Math.min(bedWidth, ...others.filter((o) => overlapY(o) && o.x >= b.x + b.w - eps).map((o) => o.x)) - (b.x + b.w);
  if (dir === "up") d = Math.max(0, ...others.filter((o) => overlapX(o) && o.y + o.h <= b.y + eps).map((o) => o.y + o.h)) - b.y;
  if (dir === "down") d = Math.min(bedHeight, ...others.filter((o) => overlapX(o) && o.y >= b.y + b.h - eps).map((o) => o.y)) - (b.y + b.h);
  if (Math.abs(d) < eps) return;
  transformSelection(() => (dir === "left" || dir === "right" ? translate(d, 0) : translate(0, d)));
}

/** Même largeur (ou hauteur) que la première forme sélectionnée, chaque forme gardant son centre. */
export function makeSameSize(axis: "w" | "h") {
  const st = getState();
  const shapes = st.selection.map((id) => st.project.shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s);
  const ref = shapes[0] && shapeBox(shapes[0]);
  if (shapes.length < 2 || !ref) return notify(t("Sélectionnez au moins deux formes : la première sert de référence"));
  const target = axis === "w" ? ref.w : ref.h;
  const moves = new Map<string, Mat>();
  for (const s of shapes.slice(1)) {
    const b = shapeBox(s);
    const size = b && (axis === "w" ? b.w : b.h);
    if (!b || !size || s.locked) continue;
    const k = target / size;
    const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
    moves.set(s.id, axis === "w" ? [k, 0, 0, 1, cx - k * cx, 0] : [1, 0, 0, k, 0, cy - k * cy]);
  }
  updateShapes([...moves.keys()], (s) => ({ ...s, matrix: mul(moves.get(s.id)!, s.matrix) }));
}

/** Contour « élastique » (enveloppe convexe) autour de la sélection. */
export function rubberBand() {
  const pts = selectedShapes().flatMap(shapePoints);
  if (pts.length < 3) return notify(t("Sélectionnez des formes"));
  const hull = convexHull(pts);
  const shape = vectorFromWorld([{ closed: true, pts: hull }], getState().currentLayer, t("Contour élastique"));
  if (!shape) return;
  commit((p) => withLayer({ ...p, shapes: [...p.shapes, shape] }, shape.layerId), { selection: [shape.id] });
}

/** Avance (ou recule) la sélection d'un cran dans l'ordre de dessin. */
export function pushStep(forward: boolean) {
  const selected = new Set(getState().selection);
  if (!selected.size) return;
  commit((p) => {
    const shapes = [...p.shapes];
    const order = forward ? [...shapes.keys()].reverse() : [...shapes.keys()];
    for (const i of order) {
      const j = forward ? i + 1 : i - 1;
      if (!selected.has(shapes[i].id) || j < 0 || j >= shapes.length || selected.has(shapes[j].id)) continue;
      [shapes[i], shapes[j]] = [shapes[j], shapes[i]];
    }
    return { ...p, shapes };
  });
}

// ------------------------------------------------------------- Découpe

/**
 * Découpe les formes sélectionnées avec la dernière sélectionnée : chacune est remplacée
 * par sa partie intérieure et sa partie extérieure (formes fermées uniquement).
 */
export function cutShapes() {
  const st = getState();
  const shapes = st.selection.map((id) => st.project.shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s && hasPaths(s));
  if (shapes.length < 2) return notify(t("Sélectionnez les formes à découper, puis en dernier la forme qui découpe"));
  const cutter = shapes[shapes.length - 1];
  const cut = worldPaths(cutter);
  const replaced = new Map<string, Shape[]>();
  for (const s of shapes.slice(0, -1)) {
    if (s.locked) continue;
    const own = worldPaths(s).filter((p) => p.closed);
    if (!own.length) continue;
    const parts = [booleanOp("intersection", [own, cut]), booleanOp("difference", [own, cut])]
      .filter((paths) => paths.length)
      .map((paths) => vectorFromWorld(paths, s.layerId, s.name))
      .filter((v): v is Shape => !!v);
    if (parts.length > 1) replaced.set(s.id, parts);
  }
  if (!replaced.size) return notify(t("La forme qui découpe ne recoupe aucune forme fermée"));
  commit((p) => ({ ...p, shapes: p.shapes.flatMap((s) => replaced.get(s.id) ?? [s]) }), {
    selection: [...replaced.values()].flat().map((s) => s.id),
  });
}

/** Résultats possibles d'une opération booléenne entre deux formes (assistant). */
export function booleanCandidates(): { key: string; label: string; paths: Polyline[] }[] | null {
  const st = getState();
  const shapes = st.selection.map((id) => st.project.shapes.find((s) => s.id === id)).filter((s): s is Shape => !!s && hasPaths(s));
  if (shapes.length !== 2) return null;
  const [a, b] = shapes.map(worldPaths);
  return [
    { key: "union", label: tk("Union"), paths: booleanOp("union", [a, b]) },
    { key: "aMinusB", label: "A − B", paths: booleanOp("difference", [a, b]) },
    { key: "bMinusA", label: "B − A", paths: booleanOp("difference", [b, a]) },
    { key: "intersection", label: tk("Intersection"), paths: booleanOp("intersection", [a, b]) },
    { key: "xor", label: tk("Exclusion"), paths: booleanOp("xor", [a, b]) },
  ];
}

export function applyBoolean(paths: Polyline[], name: string) {
  const targets = selectedShapes().filter(hasPaths);
  if (paths.length && targets.length) replaceWith(targets, paths, name);
}

// ---------------------------------------------------------------- Images

const selectedImage = () => selectedShapes().find((s): s is ImageShape => s.kind === "image");

/** Rogne l'image sélectionnée à la boîte de l'autre forme sélectionnée. */
export async function cropImage() {
  const img = selectedImage();
  const frame = selectedShapes().find((s) => s.kind !== "image");
  const box = frame && shapeBox(frame);
  if (!img || !box) return notify(t("Sélectionnez une image et la forme qui délimite le rognage"));
  // Coins de la boîte dans le repère de l'image, bornés à l'image.
  const inv = invert(img.matrix);
  const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].map((p) => apply(inv, p as Pt));
  const x0 = Math.max(0, Math.min(...corners.map((p) => p[0]))), x1 = Math.min(img.width, Math.max(...corners.map((p) => p[0])));
  const y0 = Math.max(0, Math.min(...corners.map((p) => p[1]))), y1 = Math.min(img.height, Math.max(...corners.map((p) => p[1])));
  if (x1 - x0 < 0.1 || y1 - y0 < 0.1) return notify(t("La forme ne recouvre pas l'image"));
  const source = await loadImage(img.src);
  const kx = source.naturalWidth / img.width, ky = source.naturalHeight / img.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((x1 - x0) * kx));
  canvas.height = Math.max(1, Math.round((y1 - y0) * ky));
  canvas.getContext("2d")!.drawImage(source, x0 * kx, y0 * ky, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  const src = canvas.toDataURL("image/png");
  updateShapes([img.id], (s) => ({
    ...s, src, width: x1 - x0, height: y1 - y0, matrix: mul(s.matrix, translate(x0, y0)),
    mask: (s as ImageShape).mask?.map((p) => ({ ...p, pts: p.pts.map(([x, y]): Pt => [x - x0, y - y0]) })),
  }) as Shape);
}

/** Remplace l'image sélectionnée : même échelle (mm par pixel), ou ajustée à la place de l'ancienne. */
export async function replaceImage(fit: boolean) {
  const img = selectedImage();
  if (!img) return notify(t("Sélectionnez une image"));
  const file = await new Promise<File | undefined>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
  if (!file) return;
  const src = await readAsDataUrl(file);
  const next = await loadImage(src);
  const old = await loadImage(img.src);
  let width: number, height: number;
  if (fit) {
    const k = Math.min(img.width / next.naturalWidth, img.height / next.naturalHeight);
    width = next.naturalWidth * k;
    height = next.naturalHeight * k;
  } else {
    width = next.naturalWidth * (img.width / old.naturalWidth);
    height = next.naturalHeight * (img.height / old.naturalHeight);
  }
  // La nouvelle image garde le centre de l'ancienne.
  const shift = translate((img.width - width) / 2, (img.height - height) / 2);
  updateShapes([img.id], (s) => ({ ...s, src, width, height, name: file.name, mask: undefined, matrix: mul(s.matrix, shift) }) as Shape);
}

// ------------------------------------------------------ Déformations libres

/** Grille de contrôle n × n (n = 2 : 4 points, n = 4 : 16 points) posée sur une boîte, ligne par ligne. */
export function warpGrid(box: Box, n: number): Pt[] {
  const pts: Pt[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([box.x + (box.w * i) / (n - 1), box.y + (box.h * j) / (n - 1)]);
  return pts;
}

const bernstein = (n: number, i: number, t: number) => {
  const c = n === 1 ? 1 : [1, 3, 3, 1][i]; // n = 1 (linéaire) ou 3 (cubique)
  return c * t ** i * (1 - t) ** (n - i);
};

/**
 * Point déformé : carreau de Bézier (bilinéaire pour 4 points, bicubique pour 16) dont la
 * grille de contrôle régulière donne l'identité.
 */
export function warpPoint([x, y]: Pt, box: Box, grid: Pt[], n: number): Pt {
  const u = box.w > 0 ? (x - box.x) / box.w : 0, v = box.h > 0 ? (y - box.y) / box.h : 0;
  let px = 0, py = 0;
  for (let j = 0; j < n; j++) {
    const bv = bernstein(n - 1, j, v);
    for (let i = 0; i < n; i++) {
      const w = bernstein(n - 1, i, u) * bv;
      px += grid[j * n + i][0] * w;
      py += grid[j * n + i][1] * w;
    }
  }
  return [px, py];
}

/** Tracés plateau déformés (densifiés pour que les droites suivent la déformation). */
export function warpPaths(paths: Polyline[], box: Box, grid: Pt[], n: number): Polyline[] {
  const step = Math.max(box.w, box.h) / 150 || 1;
  return paths.map((p) => ({ ...p, pts: densify(p.pts, p.closed, step).map((q) => warpPoint(q, box, grid, n)) }));
}

export function densify(pts: Pt[], closed: boolean, max: number): Pt[] {
  const out: Pt[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
    for (let k = 0; k < steps; k++) out.push([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
  }
  if (!closed && pts.length) out.push(pts[pts.length - 1]);
  return out;
}

/** Remplace les formes par leur version déformée (les textes deviennent des tracés). */
export function applyWarp(ids: string[], box: Box, grid: Pt[], n: number) {
  const st = getState();
  const replaced = new Map<string, Shape>();
  for (const s of st.project.shapes) {
    if (!ids.includes(s.id) || !hasPaths(s) || s.locked) continue;
    const v = vectorFromWorld(warpPaths(worldPaths(s), box, grid, n), s.layerId, s.name);
    if (v) replaced.set(s.id, { ...v, id: s.id, groupId: s.groupId });
  }
  if (replaced.size) commit((p) => ({ ...p, shapes: p.shapes.map((s) => replaced.get(s.id) ?? s) }));
}

/** Rotation (et, si `scale`, mise à l'échelle) autour de `pivot` qui amène `from` sur `to`. */
export function twoPointMatrix(pivot: Pt, from: Pt, to: Pt, scale: boolean): Mat {
  const a = Math.atan2(to[1] - pivot[1], to[0] - pivot[0]) - Math.atan2(from[1] - pivot[1], from[0] - pivot[0]);
  const d0 = Math.hypot(from[0] - pivot[0], from[1] - pivot[1]);
  const k = scale && d0 > 1e-9 ? Math.hypot(to[0] - pivot[0], to[1] - pivot[1]) / d0 : 1;
  const c = Math.cos(a) * k, s = Math.sin(a) * k;
  return [c, s, -s, c, pivot[0] - (c * pivot[0] - s * pivot[1]), pivot[1] - (s * pivot[0] + c * pivot[1])];
}

// ------------------------------------------------------- Cercles tangents

export interface Circle {
  c: Pt;
  r: number;
}

/** Centre et rayon d'une forme reconnue comme cercle. */
export function circleOf(s: Shape): Circle | null {
  const b = shapeBox(s);
  return b && isCircle(s) ? { c: [b.x + b.w / 2, b.y + b.h / 2], r: (b.w + b.h) / 4 } : null;
}

/**
 * Problème d'Apollonius : cercles tangents aux trois cercles donnés (jusqu'à 8). Chaque
 * combinaison de signes choisit une tangence extérieure (+) ou intérieure (−).
 */
export function apollonius([c1, c2, c3]: Circle[]): Circle[] {
  const out: Circle[] = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) for (const s3 of [1, -1]) {
    const [x1, y1, r1] = [c1.c[0], c1.c[1], s1 * c1.r];
    const [x2, y2, r2] = [c2.c[0], c2.c[1], s2 * c2.r];
    const [x3, y3, r3] = [c3.c[0], c3.c[1], s3 * c3.r];
    // (x−xi)² + (y−yi)² = (r + ri)² ; les différences donnent a·x + b·y + c·r = k, linéaire.
    const a = 2 * (x2 - x1), b = 2 * (y2 - y1), c = 2 * (r2 - r1);
    const d = 2 * (x3 - x1), e = 2 * (y3 - y1), f = 2 * (r3 - r1);
    const k1 = x2 * x2 + y2 * y2 - r2 * r2 - (x1 * x1 + y1 * y1 - r1 * r1);
    const k2 = x3 * x3 + y3 * y3 - r3 * r3 - (x1 * x1 + y1 * y1 - r1 * r1);
    const det = a * e - b * d;
    if (Math.abs(det) < 1e-9) continue; // centres alignés
    // x = x0 + xr·r, y = y0 + yr·r
    const x0 = (k1 * e - b * k2) / det, xr = (-c * e + b * f) / det;
    const y0 = (a * k2 - k1 * d) / det, yr = (-a * f + c * d) / det;
    // (x0 + xr r − x1)² + (y0 + yr r − y1)² = (r + r1)²
    const px = x0 - x1, py = y0 - y1;
    const A = xr * xr + yr * yr - 1, B = 2 * (px * xr + py * yr - r1), C = px * px + py * py - r1 * r1;
    const roots = Math.abs(A) < 1e-12 ? [-C / B] : (() => {
      const disc = B * B - 4 * A * C;
      if (disc < -1e-9) return [];
      const sq = Math.sqrt(Math.max(0, disc));
      return [(-B + sq) / (2 * A), (-B - sq) / (2 * A)];
    })();
    for (const r of roots) {
      if (!(r > 1e-6) || !Number.isFinite(r)) continue;
      const cand: Circle = { c: [x0 + xr * r, y0 + yr * r], r };
      if (!out.some((o) => Math.hypot(o.c[0] - cand.c[0], o.c[1] - cand.c[1]) < 1e-6 && Math.abs(o.r - cand.r) < 1e-6)) out.push(cand);
    }
  }
  return out;
}

/** Outils → Générer un cercle tangent : cercles tangents aux 3 cercles sélectionnés. */
export function tangentCircles() {
  const circles = selectedShapes().map(circleOf);
  if (circles.length !== 3 || circles.some((c) => !c)) return notify(t("Sélectionnez exactement trois cercles"));
  const sols = apollonius(circles as Circle[]);
  if (!sols.length) return notify(t("Aucun cercle tangent à ces trois cercles"));
  const layerId = getState().currentLayer;
  const shapes: Shape[] = sols.map(({ c, r }) => {
    const primitive = { type: "ellipse" as const, w: 2 * r, h: 2 * r };
    const curves = [primitiveCurve(primitive)];
    return { id: uid(), kind: "vector", name: t("Cercle tangent"), layerId, matrix: translate(c[0] - r, c[1] - r), curves, paths: flattenBez(curves, 0.02), primitive };
  });
  commit((p) => withLayer({ ...p, shapes: [...p.shapes, ...shapes] }, layerId), { selection: shapes.map((s) => s.id) });
  notify(t("{n} cercle(s) tangent(s) créé(s)", { n: shapes.length }));
}

// ------------------------------------------------- Redimensionner les encoches

export interface SlotOptions {
  /** Encoches (vers l'intérieur) ou tenons (en saillie). */
  mode: "slots" | "tabs";
  /** Épaisseur actuelle du matériau : largeur des encoches, hauteur des tenons. */
  old: number;
  /** Nouvelle épaisseur. */
  next: number;
  /** Profondeur des encoches à retenir (0 : toutes). */
  depth: number;
  tol: number;
}

const sub2 = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt) => Math.hypot(v[0], v[1]);
const unit = (v: Pt): Pt => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l];
};

/**
 * Redimensionne les encoches rectangulaires (ou les tenons) d'un contour fermé : quatre
 * sommets A, B, C, D avec AB et CD parallèles, opposés et perpendiculaires à BC.
 * Renvoie le contour modifié et le nombre d'encoches traitées.
 */
export function resizeSlotsInPath(pts: Pt[], o: SlotOptions): { pts: Pt[]; count: number } {
  const n = pts.length;
  const out = pts.map((p): Pt => [p[0], p[1]]);
  if (n < 4) return { pts: out, count: 0 };
  let count = 0;
  const used = new Set<number>();
  const perp = (u: Pt, v: Pt) => Math.abs(u[0] * v[0] + u[1] * v[1]) / ((len(u) * len(v)) || 1) < 0.02;
  for (let i = 0; i < n; i++) {
    const ia = i, ib = (i + 1) % n, ic = (i + 2) % n, id = (i + 3) % n;
    if ([ia, ib, ic, id].some((k) => used.has(k))) continue;
    const A = pts[ia], B = pts[ib], C = pts[ic], D = pts[id];
    const ab = sub2(B, A), bc = sub2(C, B), cd = sub2(D, C);
    if (!perp(ab, bc) || !perp(cd, bc) || ab[0] * cd[0] + ab[1] * cd[1] >= 0) continue;
    // Milieu de l'ouverture : hors de la forme pour une encoche, dedans pour un tenon.
    const mid: Pt = [(A[0] + B[0] + C[0] + D[0]) / 4, (A[1] + B[1] + C[1] + D[1]) / 4];
    const inside = pointInPolygon(mid, pts);
    if (o.mode === "slots") {
      if (inside) continue;
      const width = len(bc), depth = Math.min(len(ab), len(cd));
      if (Math.abs(width - o.old) > o.tol || (o.depth > 0 && Math.abs(depth - o.depth) > o.tol)) continue;
      const u = unit(bc), dlt = (o.next - width) / 2;
      for (const [k, s] of [[ia, -1], [ib, -1], [ic, 1], [id, 1]] as const) out[k] = [out[k][0] + u[0] * dlt * s, out[k][1] + u[1] * dlt * s];
    } else {
      if (!inside) continue;
      const height = (len(ab) + len(cd)) / 2;
      if (Math.abs(height - o.old) > o.tol) continue;
      const w = unit(ab), dlt = o.next - height;
      for (const k of [ib, ic]) out[k] = [out[k][0] + w[0] * dlt, out[k][1] + w[1] * dlt];
    }
    [ia, ib, ic, id].forEach((k) => used.add(k));
    count++;
  }
  return { pts: out, count };
}

export function resizeSlots(o: SlotOptions) {
  const targets = selectedShapes().filter((s) => hasPaths(s) && !s.locked);
  if (!targets.length) return notify(t("Sélectionnez des formes vectorielles"));
  let total = 0;
  const replaced = new Map<string, Shape>();
  for (const s of targets) {
    let changed = 0;
    const paths = worldPaths(s).map((p) => {
      if (!p.closed) return p;
      const r = resizeSlotsInPath(p.pts, o);
      changed += r.count;
      return { ...p, pts: r.pts };
    });
    if (!changed) continue;
    total += changed;
    const v = vectorFromWorld(paths, s.layerId, s.name);
    if (v) replaced.set(s.id, { ...v, id: s.id, groupId: s.groupId });
  }
  if (!total) return notify(o.mode === "slots" ? t("Aucune encoche de cette largeur") : t("Aucun tenon de cette hauteur"));
  commit((p) => ({ ...p, shapes: p.shapes.map((s) => replaced.get(s.id) ?? s) }));
  notify(o.mode === "slots" ? t("{n} encoche(s) redimensionnée(s)", { n: total }) : t("{n} tenon(s) redimensionné(s)", { n: total }));
}

// ----------------------------------------------------- Récupérer arcs et lignes

/** Cercle par trois points (null s'ils sont alignés). */
function circle3(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const s = (p: Pt) => p[0] * p[0] + p[1] * p[1];
  const cx = (s(a) * (b[1] - c[1]) + s(b) * (c[1] - a[1]) + s(c) * (a[1] - b[1])) / d;
  const cy = (s(a) * (c[0] - b[0]) + s(b) * (a[0] - c[0]) + s(c) * (b[0] - a[0])) / d;
  return { c: [cx, cy], r: Math.hypot(a[0] - cx, a[1] - cy) };
}

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
};

/**
 * Remplace une polyligne (tracé aplati, import DXF, vectorisation…) par des droites et des
 * arcs de cercle (en Bézier), à `tol` mm près.
 */
export function recoverArcsAndLines(path: Polyline, tol = 0.02): BezPath {
  const P = path.closed ? [...path.pts, path.pts[0]] : path.pts;
  const nodes: BezNode[] = [{ p: P[0] }];
  let i = 0;
  while (i < P.length - 1) {
    // Plus longue droite depuis i.
    let line = i + 1;
    for (let k = i + 2; k < P.length; k++) {
      let ok = true;
      for (let m = i + 1; m < k && ok; m++) ok = segDist(P[m], P[i], P[k]) <= tol;
      if (!ok) break;
      line = k;
    }
    // Plus long arc depuis i (au moins 4 points, pour ne pas prendre deux segments pour un arc).
    let arc = -1, fit: { c: Pt; r: number } | null = null;
    for (let j = i + 3; j < P.length; j++) {
      const c = circle3(P[i], P[Math.floor((i + j) / 2)], P[j]);
      if (!c || c.r > 1e4) break;
      let ok = true;
      for (let m = i + 1; m < j && ok; m++) ok = Math.abs(Math.hypot(P[m][0] - c.c[0], P[m][1] - c.c[1]) - c.r) <= tol;
      if (!ok) break;
      arc = j;
      fit = c;
    }
    if (fit && arc > line) {
      const a0 = Math.atan2(P[i][1] - fit.c[1], P[i][0] - fit.c[0]);
      const ang = (p: Pt) => Math.atan2(p[1] - fit!.c[1], p[0] - fit!.c[0]);
      // Sens de parcours : celui des points intermédiaires.
      let dt = 0;
      let prev = a0;
      for (let m = i + 1; m <= arc; m++) {
        let d = ang(P[m]) - prev;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        dt += d;
        prev = ang(P[m]);
      }
      const cubics = arcToCubics(P[i], fit.r, fit.r, 0, Math.abs(dt) > Math.PI ? 1 : 0, dt > 0 ? 1 : 0, P[arc]);
      for (const [c1, c2, end] of cubics) {
        nodes[nodes.length - 1].c2 = c1;
        nodes.push({ p: end, c1: c2 });
      }
      i = arc;
    } else {
      nodes.push({ p: P[line] });
      i = line;
    }
  }
  if (path.closed && nodes.length > 2) {
    const end = nodes.pop()!;
    nodes[0] = { ...nodes[0], c1: end.c1 };
  }
  return { nodes, closed: path.closed };
}

/** Modifier → Récupérer arcs et lignes, sur les formes vectorielles sélectionnées. */
export function recoverArcsSelection(tol = 0.02) {
  const targets = selectedShapes().filter((s): s is VectorShape => s.kind === "vector" && !s.locked);
  if (!targets.length) return notify(t("Sélectionnez des formes vectorielles"));
  const before = targets.reduce((n, s) => n + s.paths.reduce((m, p) => m + p.pts.length, 0), 0);
  let after = 0;
  const next = new Map<string, BezPath[]>();
  for (const s of targets) {
    // Tolérance en mm du plateau, ramenée au repère local de la forme.
    const k = Math.sqrt(Math.abs(s.matrix[0] * s.matrix[3] - s.matrix[1] * s.matrix[2])) || 1;
    const curves = s.paths.map((p) => recoverArcsAndLines(p, tol / k));
    after += curves.reduce((n, c) => n + c.nodes.length, 0);
    next.set(s.id, curves);
  }
  updateShapes([...next.keys()], (s) => {
    const curves = next.get(s.id)!;
    return { ...(s as VectorShape), curves, paths: flattenBez(curves, 0.02), primitive: undefined };
  });
  notify(t("{before} points → {after} nœuds (droites et arcs)", { before, after }));
}
