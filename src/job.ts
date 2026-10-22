// Transforme le projet en travail pour le cœur Rust.

import type { Job, JobImage, JobLayer } from "./backend";
import { apply, boxCenter, shapeBox, unionBoxes, worldPaths, type Box } from "./geometry";
import type { JobPolyline } from "./backend";
import { DEFAULT_OPTIMIZATION, isToolLayer, type CutSettings, type Optimization, type ImageShape, type MachineSettings, type Polyline, type Project, type Pt, type Shape } from "./model";
import { offsetPaths } from "./pathops";
import { renderForJob } from "./raster";
import { t } from "./i18n";

const MAX_PIXELS = 25_000_000;

async function rasterize(shape: ImageShape, interval: number, negative = false): Promise<JobImage | null> {
  const box = shapeBox(shape);
  if (!box || box.w <= 0 || box.h <= 0) return null;
  const pw = Math.max(1, Math.round(box.w / interval));
  const ph = Math.max(1, Math.round(box.h / interval));
  if (pw * ph > MAX_PIXELS) throw new Error(t("Image « {name} » trop grande à ce pas de balayage ({w}×{h} px)", { name: shape.name, w: pw, h: ph }));
  const gray = await renderForJob(shape, box, pw, ph, negative);
  return { x: box.x, y: box.y, width: box.w, height: box.h, pxWidth: pw, pxHeight: ph, gray: Array.from(gray) };
}

/**
 * Paramètres de découpe pour le cœur Rust. Le remplissage concentrique est calculé ici
 * (décalages successifs) et envoyé comme des contours : mode Ligne côté moteur.
 */
export function layerParams(l: CutSettings & { name: string }): Omit<JobLayer, "paths" | "images"> {
  return {
    name: l.name, mode: l.mode === "offsetFill" ? "line" : l.mode, speed: l.speed, power: l.power, minPower: l.minPower, passes: l.passes,
    interval: l.interval, bidirectional: l.bidirectional, overscan: l.overscan, dither: l.dither,
    airAssist: l.airAssist, fillAngle: l.fillAngle, crossHatch: l.crossHatch, fillIndividually: l.fillIndividually, tabCount: l.tabCount,
    tabSize: l.tabSize, perforate: l.perforate, perfOn: l.perfOn, perfOff: l.perfOff,
    zOffset: l.zOffset, zStep: l.zStep, overcut: l.overcut, rampLength: l.rampLength, rampMin: l.rampMin,
    dotMode: l.dotMode, dotTime: l.dotTime, dotSpacing: l.dotSpacing, direction: l.direction,
    keepStart: l.keepStart, innerFirst: l.mode === "offsetFill" ? false : l.innerFirst,
    // Cellule de demi-teinte en pixels de la grille de balayage.
    halftoneCell: 25.4 / Math.max(1, l.halftoneLpi) / Math.max(0.001, l.interval),
    halftoneAngle: l.halftoneAngle,
    imageSlices: l.imageSlices,
    leadIn: l.leadIn, leadOut: l.leadOut, leadArc: l.leadArc, leadInward: l.leadInward,
    startPause: l.startPause, endPause: l.endPause, pausePower: l.pausePower, constantPower: l.constantPower,
    angleIncrement: l.angleIncrement, fillGroups: l.fillGroups, rampOuter: l.rampOuter, floodFill: l.floodFill, cleanupEvery: l.cleanupEvery, cleanupWhole: l.cleanupWhole, airCutOnly: l.airCutOnly, tabSpacing: l.tabSpacing, tabMin: l.tabMin, tabMax: l.tabMax, tabSkipInner: l.tabSkipInner, tabPower: l.tabPower,
    dotWidth: l.mode === "image" ? l.dotWidth : 0,
  };
}

export function machineParams(m: MachineSettings): Job["machine"] {
  const {
    baud: _b, jogSpeed: _j, rotary: _r, rotaryMmPerRotation: _p, rotaryDiameter: _d, firmware: _f, connection: _c, host: _h,
    tcpPort: _t, speedScale: _ss, rotaryType: _rt, rollerDiameter: _rd, rotaryAxis, rotaryMirror: _rm, dtr: _dtr, fetchSettings: _fs, customCodes: _cc, autofocusGcode: _af, autoHome: _ah, jogWithJ: _jj, boundsWarning: _bw, pointerOffset: _po, checklist: _cl, fireButton: _fb, airOn, ...rest
  } = m;
  return { ...rest, airOn, airOff: "M9", yLetter: m.rotary && rotaryAxis === "A" ? "A" : "Y" };
}

/** Anneaux concentriques vers l'intérieur, tous les `interval` mm, forme par forme. */
export function offsetFillPaths(paths: Polyline[], interval: number): Polyline[] {
  const closed = paths.filter((p) => p.closed);
  const out: Polyline[] = [];
  const step = Math.max(0.01, interval);
  // Premier anneau à un demi-pas du bord, comme pour un remplissage.
  for (let k = 0; k < 20000; k++) {
    const ring = offsetPaths(closed, -(step / 2 + k * step), "round");
    if (!ring.length) break;
    out.push(...ring);
  }
  return out;
}

/**
 * Retire les segments identiques (dans les deux sens, à 0,01 mm près) déjà présents :
 * un bord commun à deux pièces n'est découpé qu'une fois. Les tracés touchés deviennent
 * des chaînes ouvertes. Les recouvrements partiels ne sont pas détectés.
 */
export function removeOverlaps(paths: Polyline[]): Polyline[] {
  const key = (a: Pt, b: Pt) => {
    const k = (p: Pt) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
    const [x, y] = [k(a), k(b)];
    return x < y ? `${x}|${y}` : `${y}|${x}`;
  };
  const seen = new Set<string>();
  const out: Polyline[] = [];
  for (const p of paths) {
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    const keep = pts.slice(1).map((b, i) => {
      const k = key(pts[i], b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (keep.every(Boolean)) {
      out.push(p);
      continue;
    }
    // Chaînes de segments conservés, consécutifs.
    const startOut = out.length;
    let chain: Pt[] = [];
    keep.forEach((k, i) => {
      if (k) {
        if (!chain.length) chain.push(pts[i]);
        chain.push(pts[i + 1]);
      } else if (chain.length) {
        out.push({ pts: chain, closed: false });
        chain = [];
      }
    });
    if (chain.length) {
      // Contour fermé : la dernière chaîne rejoint la première si le départ a été conservé.
      const first = p.closed && keep[0] && out.length > startOut ? startOut : -1;
      if (first >= 0) out[first] = { pts: [...chain, ...out[first].pts.slice(1)], closed: false };
      else out.push({ pts: chain, closed: false });
    }
  }
  return out;
}

/** Rotatif à rouleaux : les distances en Y sont mises à l'échelle autour de `yRef`. */
/**
 * Rotatif : facteur appliqué aux Y du dessin (mm sur la surface de l'objet). Axe A : degrés par
 * mm de surface ; axe Y : mm envoyés au contrôleur par mm de surface. Le diamètre utile est celui
 * des rouleaux (rotatif à rouleaux) ou de l'objet (mandrin, et ancien réglage sans type).
 */
export function rotaryScale(m: MachineSettings): number {
  if (!m.rotary) return 1;
  const d = Math.max(0.1, m.rotaryType === "roller" ? m.rollerDiameter ?? m.rotaryDiameter : m.rotaryDiameter);
  const perTurn = m.rotaryAxis === "A" ? 360 : m.rotaryMmPerRotation;
  return (perTurn / (Math.PI * d)) * (m.rotaryMirror ? -1 : 1);
}

export interface BuildOptions {
  /** Ne garder que ces formes (ex. « sélection seulement »). */
  only?: Set<string>;
  /** Décalage appliqué à tout le travail (origine de travail), en mm plateau. */
  offset?: Pt;
  /** Laisser de côté les formes entièrement hors du plateau. */
  ignoreOutOfBounds?: boolean;
}

/** Contour dont un segment passe le plus près de `q`. */
function nearestPath(paths: Polyline[], q: Pt): Polyline | null {
  let best: Polyline | null = null, bd = Infinity;
  for (const p of paths) {
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
      const d = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
      if (d < bd) [bd, best] = [d, p];
    }
  }
  return best;
}

export async function buildJob(
  project: Project,
  machine: MachineSettings,
  opts: BuildOptions = {},
): Promise<{ job: Job; warnings: string[] }> {
  const warnings: string[] = [];
  const offset = opts.offset ?? [0, 0];
  const outside = (s: Shape) => {
    const b = shapeBox(s);
    return !!b && (b.x + b.w < 0 || b.y + b.h < 0 || b.x > machine.bedWidth || b.y > machine.bedHeight);
  };
  const shapes = project.shapes.filter((s) => (!opts.only || opts.only.has(s.id)) && !(opts.ignoreOutOfBounds && outside(s)));
  const skipped = project.shapes.length - shapes.length - (opts.only ? project.shapes.filter((s) => !opts.only!.has(s.id)).length : 0);
  if (skipped > 0) warnings.push(t("{n} forme(s) hors du plateau ignorée(s)", { n: skipped }));
  const optimization = { ...DEFAULT_OPTIMIZATION, ...userOptimization(), ...project.optimization };
  const { order, cutsLast, ...optimize } = optimization;
  const speedK = Math.max(0.01, (machine.speedScale ?? 100) / 100);
  // Découpes en dernier : les calques Ligne après les autres, dans l'ordre de la liste sinon.
  const layerOrder = cutsLast ? [...project.layers.filter((l) => l.mode !== "line"), ...project.layers.filter((l) => l.mode === "line")] : project.layers;
  // Ordre par groupe (chaque groupe complet, tous ses calques) ou par priorité : le travail
  // est découpé en lots successifs, chacun calque par calque.
  const batches: Shape[][] =
    order === "group" ? [...groupBy(shapes, (s) => s.groupId ?? s.id).values()]
    : order === "priority" ? [...groupBy(shapes, (s) => s.priority ?? 0).entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
    : [shapes];
  const layers: JobLayer[] = [];
  for (const batch of batches) for (const layer of layerOrder) {
    if (!layer.output || isToolLayer(layer.id)) continue;
    const own = batch.filter((s) => s.layerId === layer.id);
    if (!own.length) continue;
    // Le calque puis ses sous-calques actifs, sur les mêmes formes.
    const settings = [layer, ...layer.subLayers.filter((sub) => sub.enabled)];
    const firstOfLayer = layers.length;
    for (const [k, cut] of settings.entries()) {
      const name = k === 0 ? layer.name : `${layer.name} · ${k + 1}`;
      const images: JobImage[] = [];
      let paths: Polyline[] = [];
      const tabsOf = new Map<Polyline, Pt[]>();
      const groupOf = new Map<Polyline, string>();
      if (cut.mode === "image") {
        if (own.some((s) => s.kind !== "image")) warnings.push(t("Calque « {name} » : les vecteurs sont ignorés en mode Image.", { name }));
        for (const s of own) {
          if (s.kind !== "image") continue;
          const img = await rasterize(s, cut.interval, cut.negative);
          if (img) images.push({ ...img, x: img.x + offset[0], y: img.y + offset[1] });
        }
      } else {
        if (own.some((s) => s.kind === "image")) warnings.push(t("Calque « {name} » : les images ne sont gravées qu'en mode Image.", { name }));
        for (const s of own) {
          let p = worldPaths(s);
          // Compensation de faisceau, forme par forme (les trous rétrécissent, les contours grandissent).
          if (cut.mode === "line" && cut.kerf !== 0 && p.some((x) => x.closed)) {
            p = [...offsetPaths(p.filter((x) => x.closed), cut.kerf), ...p.filter((x) => !x.closed)];
          }
          if (cut.mode === "offsetFill") p = offsetFillPaths(p, cut.interval);
          // Attaches manuelles : chacune va au contour fermé le plus proche.
          if (cut.mode === "line" && s.tabs?.length) {
            for (const t of s.tabs.map((q) => apply(s.matrix, q))) {
              const target = nearestPath(p.filter((x) => x.closed), t);
              if (target) tabsOf.set(target, [...(tabsOf.get(target) ?? []), t]);
            }
          }
          for (const x of p) groupOf.set(x, s.groupId ?? s.id);
          paths.push(...p);
        }
      }
      if (cut.mode === "line" && cut.removeOverlaps) paths = removeOverlaps(paths);
      const [ox, oy] = offset;
      const jobPaths: JobPolyline[] = paths.map((p) => ({
        points: p.pts.map(([x, y]): Pt => [x + ox, y + oy]),
        closed: p.closed,
        tabs: tabsOf.get(p)?.map(([x, y]): Pt => [x + ox, y + oy]),
        group: groupOf.get(p),
      }));
      const params = layerParams({ ...cut, name });
      layers.push({ ...params, speed: params.speed * speedK, optimize, paths: jobPaths, images });
    }
    // Passes globales : toute la séquence (calque puis sous-calques) recommence.
    const block = layers.slice(firstOfLayer);
    for (let g = 1; g < Math.max(1, layer.globalPasses ?? 1); g++) layers.push(...block.map((l) => ({ ...l, name: `${l.name} · ${t("passe globale {n}", { n: g + 1 })}` })));
  }
  const k = rotaryScale(machine);
  if (k !== 1) {
    // Mise à l'échelle autour du centre du travail : à utiliser avec « Position actuelle ».
    const ys = layers.flatMap((l) => [...l.paths.flatMap((p) => p.points.map((q) => q[1])), ...l.images.flatMap((i) => [i.y, i.y + i.height])]);
    const yRef = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    for (const l of layers) {
      l.paths = l.paths.map((p) => ({ ...p, points: p.points.map(([x, y]): Pt => [x, yRef + (y - yRef) * k]) }));
      // Images : mises à l'échelle sans miroir (leur contenu n'est pas retourné).
      l.images = l.images.map((i) => ({ ...i, y: Math.min(yRef + (i.y - yRef) * k, yRef + (i.y + i.height - yRef) * k), height: i.height * Math.abs(k) }));
    }
    warnings.push(machine.rotaryAxis === "A" ? t("Rotatif actif : axe A, {k} °/mm", { k: Math.abs(k).toFixed(3) }) : t("Rotatif actif : axe Y × {k}", { k: k.toFixed(3) }));
  }
  return { job: { machine: machineParams(machine), layers }, warnings };
}

/** Valeurs par défaut choisies par l'utilisateur (Paramètres d'optimisation). */
function userOptimization(): Partial<Optimization> {
  try {
    return JSON.parse(localStorage.getItem("lumiere.optimization") ?? "{}");
  } catch {
    return {};
  }
}

function groupBy<K, T>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const it of items) map.set(key(it), [...(map.get(key(it)) ?? []), it]);
  return map;
}

/** Boîte englobante des formes à graver. */
export function outputBox(project: Project, only?: Set<string>): Box | null {
  const out = new Set(project.layers.filter((l) => l.output).map((l) => l.id));
  return unionBoxes(
    project.shapes.filter((s: Shape) => out.has(s.layerId) && (!only || only.has(s.id))).map(shapeBox),
  );
}

/** Point d'ancrage (0–8, de gauche à droite puis de haut en bas) d'une boîte. */
export function anchorPoint(b: Box, anchor: number): Pt {
  const col = anchor % 3, row = Math.floor(anchor / 3);
  if (anchor === 4) return boxCenter(b);
  return [b.x + (b.w * col) / 2, b.y + (b.h * row) / 2];
}
