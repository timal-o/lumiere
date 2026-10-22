// Tracés en courbes de Bézier cubiques : source des formes éditables par nœuds.
//
// Un segment relie le nœud i au nœud i+1 : c'est une cubique de points de contrôle
// (p_i, c2_i, c1_i+1, p_i+1). Si les deux poignées sont absentes, c'est une droite.

import type { Mat, Polyline, Pt } from "./model";

export interface BezNode {
  p: Pt;
  /** Poignée entrante (vers le nœud précédent). */
  c1?: Pt;
  /** Poignée sortante (vers le nœud suivant). */
  c2?: Pt;
  /** Nœud lisse : poignées alignées. */
  smooth?: boolean;
}

export interface BezPath {
  nodes: BezNode[];
  closed: boolean;
}

export const segmentCount = (p: BezPath) => (p.closed ? p.nodes.length : Math.max(0, p.nodes.length - 1));

export function segmentAt(p: BezPath, i: number): [Pt, Pt, Pt, Pt] | [Pt, Pt] {
  const a = p.nodes[i], b = p.nodes[(i + 1) % p.nodes.length];
  if (!a.c2 && !b.c1) return [a.p, b.p];
  return [a.p, a.c2 ?? a.p, b.c1 ?? b.p, b.p];
}

export function cubicAt([p0, p1, p2, p3]: [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

export function segmentPoint(seg: [Pt, Pt, Pt, Pt] | [Pt, Pt], t: number): Pt {
  if (seg.length === 2) return [seg[0][0] + (seg[1][0] - seg[0][0]) * t, seg[0][1] + (seg[1][1] - seg[0][1]) * t];
  return cubicAt(seg, t);
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Nombre de subdivisions d'une cubique pour une erreur de corde ≈ `tol`. */
function subdivisions(c: [Pt, Pt, Pt, Pt], tol: number): number {
  // Borne de l'écart à la corde par la dérivée seconde (Wang).
  const ddx = Math.max(Math.abs(c[0][0] - 2 * c[1][0] + c[2][0]), Math.abs(c[1][0] - 2 * c[2][0] + c[3][0]));
  const ddy = Math.max(Math.abs(c[0][1] - 2 * c[1][1] + c[2][1]), Math.abs(c[1][1] - 2 * c[2][1] + c[3][1]));
  const n = Math.ceil(Math.sqrt((0.75 * Math.hypot(ddx, ddy)) / Math.max(tol, 1e-6)));
  return Math.min(512, Math.max(1, n));
}

export function flattenBez(paths: BezPath[], tol = 0.01): Polyline[] {
  const out: Polyline[] = [];
  for (const path of paths) {
    if (path.nodes.length < 2) continue;
    const pts: Pt[] = [path.nodes[0].p];
    const n = segmentCount(path);
    for (let i = 0; i < n; i++) {
      const seg = segmentAt(path, i);
      if (seg.length === 2) pts.push(seg[1]);
      else {
        const k = subdivisions(seg, tol);
        for (let j = 1; j <= k; j++) pts.push(j === k ? seg[3] : cubicAt(seg, j / k));
      }
    }
    if (path.closed) pts.pop(); // le dernier point est le premier
    if (pts.length >= 2) out.push({ pts, closed: path.closed && pts.length > 2 });
  }
  return out;
}

const tr = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function transformBez(paths: BezPath[], m: Mat): BezPath[] {
  return paths.map((p) => ({
    closed: p.closed,
    nodes: p.nodes.map((n) => ({ ...n, p: tr(m, n.p), c1: n.c1 && tr(m, n.c1), c2: n.c2 && tr(m, n.c2) })),
  }));
}

export function fromPolylines(paths: Polyline[]): BezPath[] {
  return paths.map((p) => ({ closed: p.closed, nodes: p.pts.map((q) => ({ p: q })) }));
}

/** Coupe le segment `i` au paramètre t (De Casteljau) et insère le nouveau nœud. */
export function splitSegment(path: BezPath, i: number, t: number): BezPath {
  const n = path.nodes.length;
  const j = (i + 1) % n;
  const nodes = path.nodes.map((x) => ({ ...x }));
  const seg = segmentAt(path, i);
  let mid: BezNode;
  if (seg.length === 2) mid = { p: segmentPoint(seg, t) };
  else {
    const [p0, p1, p2, p3] = seg;
    const lerp = (a: Pt, b: Pt): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const a = lerp(p0, p1), b = lerp(p1, p2), c = lerp(p2, p3);
    const d = lerp(a, b), e = lerp(b, c), f = lerp(d, e);
    nodes[i].c2 = a;
    nodes[j].c1 = c;
    mid = { p: f, c1: d, c2: e, smooth: true };
  }
  nodes.splice(i + 1, 0, mid);
  return { ...path, nodes };
}

/** Point du tracé le plus proche de `q` : segment, paramètre et distance. */
export function nearestOnPath(path: BezPath, q: Pt): { seg: number; t: number; d: number; p: Pt } | null {
  let best: { seg: number; t: number; d: number; p: Pt } | null = null;
  const n = segmentCount(path);
  for (let i = 0; i < n; i++) {
    const seg = segmentAt(path, i);
    const steps = seg.length === 2 ? 1 : 32;
    // Échantillonnage grossier puis affinage par dichotomie autour du meilleur échantillon.
    let bt = 0, bd = Infinity;
    if (seg.length === 2) {
      const [a, b] = seg;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = dx * dx + dy * dy;
      bt = len ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len)) : 0;
      bd = dist(segmentPoint(seg, bt), q);
    } else {
      for (let k = 0; k <= steps; k++) {
        const d = dist(segmentPoint(seg, k / steps), q);
        if (d < bd) [bd, bt] = [d, k / steps];
      }
      let lo = Math.max(0, bt - 1 / steps), hi = Math.min(1, bt + 1 / steps);
      for (let it = 0; it < 36; it++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        if (dist(segmentPoint(seg, m1), q) < dist(segmentPoint(seg, m2), q)) hi = m2;
        else lo = m1;
      }
      bt = (lo + hi) / 2;
      bd = dist(segmentPoint(seg, bt), q);
    }
    if (!best || bd < best.d) best = { seg: i, t: bt, d: bd, p: segmentPoint(seg, bt) };
  }
  return best;
}

/** Arc elliptique SVG → cubiques (morceaux de 90° au plus) ; vide si l'arc dégénère en droite. */
export function arcToCubics(p0: Pt, rx: number, ry: number, phiDeg: number, large: number, sweep: number, p1: Pt): [Pt, Pt, Pt][] {
  if (rx === 0 || ry === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cx1 = (coef * rx * y1) / ry, cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;

  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number): Pt => {
    const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
  };
  const deriv = (t: number): Pt => {
    const ex = -rx * Math.sin(t), ey = ry * Math.cos(t);
    return [cos * ex - sin * ey, sin * ex + cos * ey];
  };
  const out: [Pt, Pt, Pt][] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + step * i, b = a + step;
    const pa = pt(a), pb = i === n - 1 ? p1 : pt(b);
    const da = deriv(a), db = deriv(b);
    out.push([[pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], pb]);
  }
  return out;
}

/** Ellipse en 4 cubiques (constante 0,5523). */
export function ellipseBez(cx: number, cy: number, rx: number, ry: number): BezPath {
  const k = 0.5522847498;
  return {
    closed: true,
    nodes: [
      { p: [cx + rx, cy], c1: [cx + rx, cy - k * ry], c2: [cx + rx, cy + k * ry], smooth: true },
      { p: [cx, cy + ry], c1: [cx + k * rx, cy + ry], c2: [cx - k * rx, cy + ry], smooth: true },
      { p: [cx - rx, cy], c1: [cx - rx, cy + k * ry], c2: [cx - rx, cy - k * ry], smooth: true },
      { p: [cx, cy - ry], c1: [cx - k * rx, cy - ry], c2: [cx + k * rx, cy - ry], smooth: true },
    ],
  };
}

/** Rectangle à angles arrondis (quarts de cercle en cubiques). */
export function roundedRectBez(x: number, y: number, w: number, h: number, r: number): BezPath {
  r = Math.min(Math.max(0, r), w / 2, h / 2);
  if (r <= 0) return { closed: true, nodes: [{ p: [x, y] }, { p: [x + w, y] }, { p: [x + w, y + h] }, { p: [x, y + h] }] };
  const k = 0.5522847498 * r;
  return {
    closed: true,
    nodes: [
      { p: [x + r, y], c1: [x + r - k, y] },
      { p: [x + w - r, y], c2: [x + w - r + k, y] },
      { p: [x + w, y + r], c1: [x + w, y + r - k] },
      { p: [x + w, y + h - r], c2: [x + w, y + h - r + k] },
      { p: [x + w - r, y + h], c1: [x + w - r + k, y + h] },
      { p: [x + r, y + h], c2: [x + r - k, y + h] },
      { p: [x, y + h - r], c1: [x, y + h - r + k] },
      { p: [x, y + r], c2: [x, y + r - k] },
    ],
  };
}

export const bezBounds = (paths: BezPath[]): Pt[] => paths.flatMap((p) => p.nodes.flatMap((n) => [n.p, ...(n.c1 ? [n.c1] : []), ...(n.c2 ? [n.c2] : [])]));
