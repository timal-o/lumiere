// Calibration de l'objectif : une grille de points (mire imprimée ou gravée) est filmée,
// les points sont détectés et numérotés, puis la distorsion radiale k1 est celle pour
// laquelle les points redressés s'alignent le mieux sur une grille parfaite (homographie).

import { applyH, homography, solve, undistort, type Homography } from "./camera";
import type { Pt } from "./model";

/** Seuil d'Otsu d'une image en niveaux de gris. */
export function otsu(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) [best, threshold] = [between, i];
  }
  return threshold;
}

/** Centres des taches sombres à peu près rondes (composantes connexes). */
export function detectDots(gray: Uint8Array, w: number, h: number): Pt[] {
  const th = otsu(gray);
  const seen = new Uint8Array(w * h);
  const out: Pt[] = [];
  const stack: number[] = [];
  const maxArea = (w * h) / 100;
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || gray[start] > th) continue;
    seen[start] = 1;
    stack.push(start);
    let n = 0, sx = 0, sy = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, edge = false;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      n++, sx += x, sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !seen[j] && gray[j] <= th) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // Une tache ronde remplit ~π/4 de sa boîte ; on écarte le bruit, les bords et les grandes zones.
    if (edge || n < 12 || n > maxArea || bw / bh > 2 || bh / bw > 2 || n / (bw * bh) < 0.55) continue;
    out.push([sx / n, sy / n]);
  }
  return out;
}

/** Homographie aux moindres carrés (points normalisés pour la stabilité). */
export function fitHomography(src: Pt[], dst: Pt[]): Homography {
  if (src.length === 4) return homography(src, dst);
  const norm = (pts: Pt[]) => {
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const s = Math.SQRT2 / (pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1);
    return { t: [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1], pts: pts.map(([x, y]): Pt => [s * (x - cx), s * (y - cy)]) };
  };
  const a = norm(src), b = norm(dst);
  const ata = Array.from({ length: 8 }, () => new Array(8).fill(0)), atb = new Array(8).fill(0);
  a.pts.forEach(([x, y], i) => {
    const [u, v] = b.pts[i];
    for (const [row, r] of [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -v * x, -v * y], v]] as [number[], number][]) {
      for (let p = 0; p < 8; p++) {
        atb[p] += row[p] * r;
        for (let q = 0; q < 8; q++) ata[p][q] += row[p] * row[q];
      }
    }
  });
  const hn = [...solve(ata, atb), 1];
  // H = Tb⁻¹ · Hn · Ta
  const mul = (m: number[], n: number[]) => Array.from({ length: 9 }, (_, k) => {
    const r = Math.floor(k / 3), c = k % 3;
    return m[r * 3] * n[c] + m[r * 3 + 1] * n[3 + c] + m[r * 3 + 2] * n[6 + c];
  });
  const sb = b.t[0];
  const tbInv = [1 / sb, 0, -b.t[2] / sb, 0, 1 / sb, -b.t[5] / sb, 0, 0, 1];
  const h = mul(tbInv, mul(hn, a.t));
  return h.map((v) => v / h[8]);
}

/**
 * Numérote les points détectés sur une grille `cols` × `rows` : homographie depuis les
 * quatre coins, puis affinage avec tous les points reconnus. Renvoie les paires (grille, image).
 */
export function indexGrid(pts: Pt[], cols: number, rows: number): { grid: Pt[]; image: Pt[] } | null {
  if (pts.length < 4) return null;
  const by = (f: (p: Pt) => number) => pts.reduce((best, p) => (f(p) < f(best) ? p : best));
  const corners = [by((p) => p[0] + p[1]), by((p) => p[1] - p[0]), by((p) => -p[0] - p[1]), by((p) => p[0] - p[1])];
  const gridCorners: Pt[] = [[0, 0], [cols - 1, 0], [cols - 1, rows - 1], [0, rows - 1]];
  let toGrid: Homography;
  try {
    toGrid = homography(corners, gridCorners);
  } catch {
    return null;
  }
  for (let pass = 0; pass < 2; pass++) {
    const used = new Map<string, number>();
    const grid: Pt[] = [], image: Pt[] = [];
    for (const p of pts) {
      const [gx, gy] = applyH(toGrid, p);
      const [ix, iy] = [Math.round(gx), Math.round(gy)];
      if (ix < 0 || iy < 0 || ix >= cols || iy >= rows || Math.hypot(gx - ix, gy - iy) > 0.3) continue;
      const key = `${ix},${iy}`;
      if (used.has(key)) continue;
      used.set(key, grid.length);
      grid.push([ix, iy]);
      image.push(p);
    }
    if (grid.length < Math.max(6, cols * rows * 0.6)) return null;
    if (pass === 1 || grid.length === cols * rows) return { grid, image };
    toGrid = fitHomography(image, grid);
  }
  return null;
}

/** Écart (relatif à la taille de la grille) des points redressés à une grille parfaite. */
export function gridResidual(sets: { grid: Pt[]; image: Pt[] }[], k1: number, w: number, h: number): number {
  let acc = 0, n = 0;
  for (const s of sets) {
    const pts = s.image.map((p) => undistort(p, k1, w, h));
    const hm = fitHomography(s.grid, pts);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const spread = Math.sqrt(pts.reduce((a, p) => a + (p[0] - cx) ** 2 + (p[1] - cy) ** 2, 0) / pts.length) || 1;
    s.grid.forEach((g, i) => {
      const q = applyH(hm, g);
      acc += ((q[0] - pts[i][0]) ** 2 + (q[1] - pts[i][1]) ** 2) / spread ** 2;
      n++;
    });
  }
  return Math.sqrt(acc / Math.max(1, n));
}

/** k1 qui minimise l'écart à la grille (recherche par section dorée sur [−0,6 ; 0,3]). */
export function fitK1(sets: { grid: Pt[]; image: Pt[] }[], w: number, h: number): { k1: number; before: number; after: number } {
  const f = (k: number) => gridResidual(sets, k, w, h);
  let lo = -0.6, hi = 0.3;
  const g = (Math.sqrt(5) - 1) / 2;
  let a = hi - g * (hi - lo), b = lo + g * (hi - lo), fa = f(a), fb = f(b);
  for (let i = 0; i < 60; i++) {
    if (fa < fb) {
      hi = b;
      b = a;
      fb = fa;
      a = hi - g * (hi - lo);
      fa = f(a);
    } else {
      lo = a;
      a = b;
      fa = fb;
      b = lo + g * (hi - lo);
      fb = f(b);
    }
  }
  const k1 = (lo + hi) / 2;
  return { k1, before: f(0), after: f(k1) };
}
