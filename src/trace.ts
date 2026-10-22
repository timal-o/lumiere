// Vectorisation d'une image binaire : suivi des contours de pixels puis simplification.

import type { Polyline, Pt } from "./model";

/**
 * Tracé « croquis » : les bords de l'image (gradient de Sobel) deviennent des traits sombres,
 * tracés ensuite en ligne centrale. `strength` : gradient (0–255) à partir duquel un bord compte.
 */
export function edgeMap(gray: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h).fill(255);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = (dx: number, dy: number) => gray[(y + dy) * w + x + dx];
      const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1);
      const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
      out[y * w + x] = 255 - Math.min(255, Math.round(Math.hypot(gx, gy) / 4));
    }
  }
  return out;
}

export interface TraceOptions {
  threshold: number; // 0–255 : en dessous = noir
  /** Luminosité minimale gardée (0–255) : les pixels plus sombres sont ignorés (tracer une plage de gris). */
  cutoff?: number;
  /** Tracé central : une ligne au milieu des traits plutôt que leur contour. */
  centerline?: boolean;
  /** Tracé croquis : les bords de l'image (et non ses zones sombres) sont tracés en lignes. */
  sketch?: boolean;
  minArea: number; // aire minimale d'un contour (px²)
  tolerance: number; // simplification (px)
  smooth: boolean;
}

function area(p: Pt[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  return a / 2;
}

function distToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Ramer-Douglas-Peucker sur un tracé ouvert. */
function rdp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, dmax = tol;
    for (let i = a + 1; i < b; i++) {
      const d = distToLine(pts[i], pts[a], pts[b]);
      if (d > dmax) {
        dmax = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Simplifie un contour fermé en le coupant au point le plus éloigné du départ. */
function simplifyClosed(pts: Pt[], tol: number): Pt[] {
  let far = 0, dmax = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > dmax) {
      dmax = d;
      far = i;
    }
  }
  const a = rdp(pts.slice(0, far + 1), tol);
  const b = rdp([...pts.slice(far), pts[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Lissage de Chaikin (deux itérations), pour un rendu moins « pixelisé ». */
function chaikin(pts: Pt[]): Pt[] {
  let p = pts;
  for (let it = 0; it < 2; it++) {
    const q: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    p = q;
  }
  return p;
}

/** Contours (en coordonnées pixel) des zones sombres d'une image en niveaux de gris. */
export function traceBitmap(gray: Uint8Array, w: number, h: number, o: TraceOptions): Polyline[] {
  const low = o.cutoff ?? 0;
  const black = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const g = gray[y * w + x];
    return g < o.threshold && g >= low;
  };
  const W = w + 1;
  // Arêtes orientées (le noir à droite, Y vers le bas) : sommet de départ → liste des arrivées.
  const out = new Map<number, number[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W + x0;
    const list = out.get(k);
    if (list) list.push(y1 * W + x1);
    else out.set(k, [y1 * W + x1]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!black(x, y)) continue;
      if (!black(x, y - 1)) add(x, y, x + 1, y);
      if (!black(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!black(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!black(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const loops: Polyline[] = [];
  const xy = (k: number): Pt => [k % W, Math.floor(k / W)];
  for (const [start, targets] of out) {
    while (targets.length) {
      const pts: Pt[] = [xy(start)];
      let prev = start;
      let cur = targets.pop()!;
      while (cur !== start) {
        pts.push(xy(cur));
        const next = out.get(cur);
        if (!next || !next.length) break;
        // Aux points selle (deux sorties), on tourne à droite pour séparer les zones.
        let pick = next.length - 1;
        if (next.length > 1) {
          const [px, py] = xy(prev), [cx, cy] = xy(cur);
          const din = [cx - px, cy - py];
          pick = next.findIndex((n) => {
            const [nx, ny] = xy(n);
            return din[0] * (ny - cy) - din[1] * (nx - cx) > 0;
          });
          if (pick < 0) pick = next.length - 1;
        }
        prev = cur;
        cur = next.splice(pick, 1)[0];
      }
      if (pts.length < 4 || Math.abs(area(pts)) < o.minArea) continue;
      let p = simplifyClosed(pts, Math.max(0.01, o.tolerance));
      if (o.smooth && p.length >= 4) p = chaikin(p);
      if (p.length >= 3) loops.push({ pts: p, closed: true });
    }
  }
  return loops;
}

// ------------------------------------------------------------ Tracé central

/**
 * Tracé central (lignes fines, écriture) : squelette des zones sombres par amincissement de
 * Zhang-Suen, puis chaque branche devient une polyligne ouverte (une boucle, fermée).
 */
export function traceCenterline(gray: Uint8Array, w: number, h: number, o: TraceOptions): Polyline[] {
  const low = o.cutoff ?? 0;
  const img = new Uint8Array(w * h);
  for (let i = 0; i < img.length; i++) img[i] = gray[i] < o.threshold && gray[i] >= low ? 1 : 0;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? img[y * w + x] : 0);
  // Voisins P2…P9, dans le sens horaire depuis le haut.
  const ring = (x: number, y: number) => [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      const kill: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          const p = ring(x, y);
          const b = p.reduce((n, v) => n + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          const [p2, , p4, , p6, , p8] = p;
          if (step === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) kill.push(y * w + x);
        }
      }
      for (const i of kill) img[i] = 0;
      if (kill.length) changed = true;
    }
  }
  // Parcours du squelette : on part des extrémités (1 voisin), puis des boucles restantes.
  const N8: Pt[] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const seen = new Uint8Array(w * h);
  const neighbours = (x: number, y: number) => N8.map(([dx, dy]): Pt => [x + dx, y + dy]).filter(([nx, ny]) => at(nx, ny));
  const walk = (sx: number, sy: number): Pt[] => {
    const pts: Pt[] = [[sx, sy]];
    seen[sy * w + sx] = 1;
    let [x, y] = [sx, sy];
    for (;;) {
      const next = neighbours(x, y).find(([nx, ny]) => !seen[ny * w + nx]);
      if (!next) break;
      [x, y] = next;
      seen[y * w + x] = 1;
      pts.push([x, y]);
    }
    return pts;
  };
  const out: Polyline[] = [];
  const minLength = Math.max(2, Math.sqrt(o.minArea));
  const keep = (pts: Pt[], closed: boolean) => {
    if (pts.length < minLength) return;
    const c = pts.map(([x, y]): Pt => [x + 0.5, y + 0.5]);
    out.push({ closed, pts: closed ? simplifyClosed(c, Math.max(0.01, o.tolerance)) : rdp(c, Math.max(0.01, o.tolerance)) });
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (img[y * w + x] && !seen[y * w + x] && neighbours(x, y).length === 1) keep(walk(x, y), false);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (img[y * w + x] && !seen[y * w + x]) {
      const pts = walk(x, y);
      const [a, b] = [pts[0], pts[pts.length - 1]];
      keep(pts, pts.length > 3 && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1);
    }
  }
  return out;
}
