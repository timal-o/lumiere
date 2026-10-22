// Outils géométriques sans état : simplification, imbrication, copie le long d'un chemin,
// enveloppe convexe, export SVG.

import { segmentAt, segmentCount, transformBez, type BezPath } from "./bezier";
import { imageCorners, shapeBox, worldPaths, type Box } from "./geometry";
import { layerColor, type Polyline, type Project, type Pt, type Shape } from "./model";

// ------------------------------------------------------------ Simplification

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, dmax = tol;
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(pts[i], pts[a], pts[b]);
      if (d > dmax) [dmax, best] = [d, i];
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Réduit le nombre de points (Ramer-Douglas-Peucker), écart maximal `tol` mm. */
export function simplifyPaths(paths: Polyline[], tol: number): Polyline[] {
  return paths
    .map((p) => {
      if (!p.closed) return { closed: false, pts: rdp(p.pts, tol) };
      // Fermé : on coupe au point le plus éloigné du premier pour garder deux ancres.
      let far = 0, dmax = -1;
      p.pts.forEach((q, i) => {
        const d = Math.hypot(q[0] - p.pts[0][0], q[1] - p.pts[0][1]);
        if (d > dmax) [dmax, far] = [d, i];
      });
      const a = rdp(p.pts.slice(0, far + 1), tol);
      const b = rdp([...p.pts.slice(far), p.pts[0]], tol);
      return { closed: true, pts: [...a.slice(0, -1), ...b.slice(0, -1)] };
    })
    .filter((p) => p.pts.length >= (p.closed ? 3 : 2));
}

// ---------------------------------------------------------------- Imbrication

export interface NestItem {
  id: string;
  w: number;
  h: number;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  rotated: boolean;
}

/**
 * Imbrication « skyline » par boîtes englobantes : chaque pièce (de la plus grande à la
 * plus petite) est posée le plus haut possible, puis le plus à gauche, en essayant la
 * rotation de 90° si elle est permise. Renvoie `null` pour une pièce qui ne rentre pas.
 */
export function nestBoxes(items: NestItem[], area: Box, gap: number, allowRotate: boolean): (Placement | null)[] {
  // Segments de la ligne d'horizon : [x, largeur, hauteur occupée].
  let sky: [number, number, number][] = [[0, area.w, 0]];
  const order = items.map((it, i) => ({ it, i })).sort((a, b) => b.it.w * b.it.h - a.it.w * a.it.h);
  const result: (Placement | null)[] = items.map(() => null);

  const fit = (w: number): { x: number; y: number; k: number } | null => {
    let best: { x: number; y: number; k: number } | null = null;
    for (let k = 0; k < sky.length; k++) {
      const x = sky[k][0];
      if (x + w > area.w + 1e-9) break;
      let y = 0, covered = 0, j = k;
      while (covered < w - 1e-9 && j < sky.length) {
        y = Math.max(y, sky[j][2]);
        covered += sky[j][1];
        j++;
      }
      if (covered < w - 1e-9) continue;
      if (!best || y < best.y - 1e-9 || (Math.abs(y - best.y) < 1e-9 && x < best.x)) best = { x, y, k };
    }
    return best;
  };

  const place = (x: number, w: number, top: number) => {
    const next: [number, number, number][] = [];
    for (const seg of sky) {
      const [sx, sw, sh] = seg;
      const ex = sx + sw;
      if (ex <= x + 1e-9 || sx >= x + w - 1e-9) {
        next.push(seg);
        continue;
      }
      if (sx < x) next.push([sx, x - sx, sh]);
      if (ex > x + w) next.push([x + w, ex - (x + w), sh]);
    }
    next.push([x, w, top]);
    next.sort((a, b) => a[0] - b[0]);
    // Fusionne les segments voisins de même hauteur.
    sky = next.reduce<[number, number, number][]>((acc, s) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last[2] - s[2]) < 1e-9 && Math.abs(last[0] + last[1] - s[0]) < 1e-9) last[1] += s[1];
      else acc.push([...s]);
      return acc;
    }, []);
  };

  for (const { it, i } of order) {
    const options = [{ w: it.w + gap, h: it.h + gap, rotated: false }];
    if (allowRotate && Math.abs(it.w - it.h) > 1e-9) options.push({ w: it.h + gap, h: it.w + gap, rotated: true });
    let chosen: { x: number; y: number; w: number; h: number; rotated: boolean } | null = null;
    for (const o of options) {
      const f = fit(o.w);
      if (!f || f.y + o.h - gap > area.h + 1e-9) continue;
      if (!chosen || f.y + o.h < chosen.y + chosen.h - 1e-9) chosen = { x: f.x, y: f.y, w: o.w, h: o.h, rotated: o.rotated };
    }
    if (!chosen) continue;
    place(chosen.x, chosen.w, chosen.y + chosen.h);
    result[i] = { id: it.id, x: area.x + chosen.x, y: area.y + chosen.y, rotated: chosen.rotated };
  }
  return result;
}

// ------------------------------------------------- Copie le long d'un chemin

export interface PathSampler {
  length: number;
  /** Point et angle de la tangente (°) à l'abscisse curviligne `s`. */
  at(s: number): { p: Pt; angle: number };
}

export function sampler(path: Polyline): PathSampler {
  const pts = path.closed ? [...path.pts, path.pts[0]] : path.pts;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const length = cum[cum.length - 1];
  return {
    length,
    at(s) {
      s = Math.max(0, Math.min(length, s));
      let i = 1;
      while (i < cum.length - 1 && cum[i] <= s) i++; // dans un angle : tangente du segment sortant
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (s - cum[i - 1]) / seg;
      const a = pts[i - 1], b = pts[i];
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
    },
  };
}

/** Positions régulièrement espacées le long du chemin (aux extrémités s'il est ouvert). */
export function positionsAlong(path: Polyline, count: number): { p: Pt; angle: number }[] {
  const s = sampler(path);
  const n = Math.max(1, count);
  const div = path.closed ? n : Math.max(1, n - 1);
  return Array.from({ length: n }, (_, k) => s.at((s.length * k) / div));
}

// ------------------------------------------------------ Enveloppe convexe

export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function shapePoints(s: Shape): Pt[] {
  return s.kind === "image" ? imageCorners(s) : worldPaths(s).flatMap((p) => p.pts);
}

// -------------------------------------------------------------- Export SVG

const f = (v: number) => String(Number(v.toFixed(4)));

function bezToD(paths: BezPath[]): string {
  return paths
    .map((p) => {
      let d = `M${f(p.nodes[0].p[0])} ${f(p.nodes[0].p[1])}`;
      for (let i = 0; i < segmentCount(p); i++) {
        const s = segmentAt(p, i);
        d += s.length === 2 ? `L${f(s[1][0])} ${f(s[1][1])}` : `C${s.slice(1).map((q) => `${f(q[0])} ${f(q[1])}`).join(" ")}`;
      }
      return p.closed ? d + "Z" : d;
    })
    .join("");
}

function polyToD(paths: Polyline[]): string {
  return paths.map((p) => p.pts.map((q, i) => `${i ? "L" : "M"}${f(q[0])} ${f(q[1])}`).join("") + (p.closed ? "Z" : "")).join("");
}

/** Projet → SVG en millimètres (courbes conservées, une couleur par calque). */
export function exportSvg(project: Project, bedWidth: number, bedHeight: number, only?: Set<string>): string {
  const visible = new Set(project.layers.map((l) => l.id));
  const body = project.shapes
    .filter((s) => visible.has(s.layerId) && (!only || only.has(s.id)))
    .map((s) => {
      const color = layerColor(s.layerId);
      if (s.kind === "image") {
        return `<image href="${s.src}" width="${f(s.width)}" height="${f(s.height)}" transform="matrix(${s.matrix.map(f).join(" ")})" preserveAspectRatio="none"/>`;
      }
      const d = s.kind === "vector" && s.curves ? bezToD(transformBez(s.curves, s.matrix)) : polyToD(worldPaths(s));
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="0.1"/>`;
    });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(bedWidth)}mm" height="${f(bedHeight)}mm" viewBox="0 0 ${f(bedWidth)} ${f(bedHeight)}">`,
    ...body.map((b) => `  ${b}`),
    `</svg>`,
    "",
  ].join("\n");
}

export const shapeBoxOrZero = (s: Shape): Box => shapeBox(s) ?? { x: 0, y: 0, w: 0, h: 0 };

// ------------------------------------------------------------------ Ajuster (trim)

function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): number | null {
  const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

const ptsOf = (p: Polyline): Pt[] => (p.closed ? [...p.pts, p.pts[0]] : p.pts);

/** Portion d'une polyligne entre deux abscisses curvilignes (s0 < s1). */
export function subPath(pts: Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const lerp = (s: number): Pt => {
      const k = len ? (s - walked) / len : 0;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    if (walked + len >= s0 && walked <= s1) {
      if (!out.length) out.push(lerp(Math.max(s0, walked)));
      if (walked + len <= s1) out.push(b);
      else {
        out.push(lerp(s1));
        break;
      }
    }
    walked += len;
  }
  return out;
}

/**
 * Supprime la portion du tracé cliqué comprise entre les deux intersections les plus
 * proches (avec lui-même ou les autres tracés). Sans intersection, le tracé entier
 * disparaît. Renvoie les tracés de la forme cliquée après coupe.
 */
export function trimAt(own: Polyline[], others: Polyline[], click: Pt): Polyline[] {
  // Tracé et position (abscisse curviligne) les plus proches du clic.
  let best = { path: -1, s: 0, d: Infinity };
  own.forEach((p, pi) => {
    const pts = ptsOf(p);
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, len = Math.sqrt(l2);
      const t = l2 ? Math.max(0, Math.min(1, ((click[0] - a[0]) * dx + (click[1] - a[1]) * dy) / l2)) : 0;
      const d = Math.hypot(click[0] - (a[0] + t * dx), click[1] - (a[1] + t * dy));
      if (d < best.d) best = { path: pi, s: walked + t * len, d };
      walked += len;
    }
  });
  if (best.path < 0) return own;
  const target = own[best.path];
  const pts = ptsOf(target);
  const total = pts.slice(1).reduce((acc, p, i) => acc + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

  // Abscisses des intersections du tracé cliqué avec tous les tracés.
  const cuts: number[] = [];
  const all = [...own.map((p, i) => ({ p, self: i === best.path })), ...others.map((p) => ({ p, self: false }))];
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const { p, self } of all) {
      const q = ptsOf(p);
      for (let j = 1; j < q.length; j++) {
        // Segments voisins d'un même tracé : leur sommet commun n'est pas une intersection.
        if (self && Math.abs(i - j) <= 1) continue;
        if (self && target.closed && ((i === 1 && j === q.length - 1) || (j === 1 && i === pts.length - 1))) continue;
        const t = segIntersect(a, b, q[j - 1], q[j]);
        if (t != null) cuts.push(walked + t * len);
      }
    }
    walked += len;
  }
  const sorted = [...new Set(cuts.map((c) => Math.round(c * 1e6) / 1e6))].sort((x, y) => x - y).filter((c) => c > 1e-6 && c < total - 1e-6);
  const rest = own.filter((_, i) => i !== best.path);
  if (!sorted.length) return rest;
  const before = sorted.filter((c) => c < best.s);
  const after = sorted.filter((c) => c > best.s);
  const pieces: Pt[][] = [];
  if (!target.closed) {
    if (before.length) pieces.push(subPath(pts, 0, before[before.length - 1]));
    if (after.length) pieces.push(subPath(pts, after[0], total));
  } else {
    // Fermé : on garde de l'intersection suivante jusqu'à la précédente, en passant par le départ.
    const a = before.length ? before[before.length - 1] : sorted[sorted.length - 1];
    const b = after.length ? after[0] : sorted[0];
    if (b > a) pieces.push(subPath(pts, b, total), subPath(pts, 0, a));
    else pieces.push(subPath(pts, b, a));
    if (pieces.length === 2) {
      const [x, y] = pieces;
      pieces.splice(0, 2, [...x, ...y.slice(1)]);
    }
  }
  return [...rest, ...pieces.filter((p) => p.length >= 2).map((p) => ({ pts: p, closed: false }))];
}
