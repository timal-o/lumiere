import { flattenBez, transformBez } from "./bezier";
import { hasPaths, type Mat, type Origin, type Polyline, type Pt, type Shape } from "./model";

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** m1 ∘ m2 : applique m2 puis m1. */
export function mul(m1: Mat, m2: Mat): Mat {
  const [a, b, c, d, e, f] = m1;
  const [A, B, C, D, E, F] = m2;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}

export function apply(m: Mat, [x, y]: Pt): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m: Mat): Mat {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c || 1e-12;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

export const translate = (tx: number, ty: number): Mat => [1, 0, 0, 1, tx, ty];

export function scaleAbout(sx: number, sy: number, [cx, cy]: Pt): Mat {
  return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
}

export function rotateAbout(deg: number, [cx, cy]: Pt): Mat {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boxOfPoints(points: Iterable<Pt>): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBoxes(boxes: (Box | null)[]): Box | null {
  const pts: Pt[] = [];
  for (const b of boxes) if (b) pts.push([b.x, b.y], [b.x + b.w, b.y + b.h]);
  return boxOfPoints(pts);
}

export const boxCenter = (b: Box): Pt => [b.x + b.w / 2, b.y + b.h / 2];

/** Tolérance d'aplatissement des courbes dans le repère plateau (mm). */
export const CURVE_TOLERANCE = 0.01;

const worldCache = new WeakMap<Shape, Polyline[]>();

/**
 * Tracés d'une forme, transformés dans le repère plateau. Les courbes sont
 * aplaties après transformation : la précision ne dépend pas de l'échelle.
 */
export function worldPaths(shape: Shape): Polyline[] {
  if (!hasPaths(shape)) return [];
  let out = worldCache.get(shape);
  if (!out) {
    out =
      shape.kind === "vector" && shape.curves
        ? flattenBez(transformBez(shape.curves, shape.matrix), CURVE_TOLERANCE)
        : shape.paths.map((p) => ({ closed: p.closed, pts: p.pts.map((q) => apply(shape.matrix, q)) }));
    worldCache.set(shape, out);
  }
  return out;
}

export function imageCorners(shape: Shape & { kind: "image" }): Pt[] {
  const { width: w, height: h, matrix: m } = shape;
  return [apply(m, [0, 0]), apply(m, [w, 0]), apply(m, [w, h]), apply(m, [0, h])];
}

const boxCache = new WeakMap<Shape, Box | null>();

export function shapeBox(shape: Shape): Box | null {
  if (boxCache.has(shape)) return boxCache.get(shape)!;
  const box =
    shape.kind === "image"
      ? boxOfPoints(imageCorners(shape))
      : boxOfPoints(worldPaths(shape).flatMap((p) => p.pts));
  boxCache.set(shape, box);
  return box;
}

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Teste si un point (plateau, mm) touche la forme, avec une tolérance en mm. */
export function hitShape(shape: Shape, p: Pt, tol: number): boolean {
  const box = shapeBox(shape);
  if (!box || p[0] < box.x - tol || p[0] > box.x + box.w + tol || p[1] < box.y - tol || p[1] > box.y + box.h + tol)
    return false;
  if (shape.kind === "image") return pointInPolygon(p, imageCorners(shape));
  let inside = false;
  for (const path of worldPaths(shape)) {
    const pts = path.pts;
    for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= tol) return true;
    if (path.closed && pts.length > 2) {
      if (distToSegment(p, pts[pts.length - 1], pts[0]) <= tol) return true;
      if (pointInPolygon(p, pts)) inside = !inside;
    }
  }
  return inside;
}

/** Plateau ↔ machine ; la transformation est sa propre inverse. */
export function bedToMachine([x, y]: Pt, origin: Origin, w: number, h: number): Pt {
  switch (origin) {
    case "frontLeft": return [x, h - y];
    case "rearLeft": return [x, y];
    case "frontRight": return [w - x, h - y];
    case "rearRight": return [w - x, y];
  }
}

export function rectPath(x: number, y: number, w: number, h: number): Polyline {
  return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true };
}

/** Relie les tracés ouverts dont les extrémités coïncident. */
export function joinPaths(paths: Polyline[], tol = 0.01): Polyline[] {
  const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  const closed = paths.filter((p) => p.closed);
  const open = paths.filter((p) => !p.closed && p.pts.length >= 2).map((p) => [...p.pts]);
  const out: Polyline[] = [...closed];
  while (open.length) {
    const cur = open.pop()!;
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const o = open[i];
        const head = cur[0], tail = cur[cur.length - 1];
        if (same(tail, o[0])) cur.push(...o.slice(1));
        else if (same(tail, o[o.length - 1])) cur.push(...o.slice(0, -1).reverse());
        else if (same(head, o[o.length - 1])) cur.unshift(...o.slice(0, -1));
        else if (same(head, o[0])) cur.unshift(...o.slice(1).reverse());
        else continue;
        open.splice(i, 1);
        grown = true;
        break;
      }
    }
    const isClosed = cur.length > 2 && same(cur[0], cur[cur.length - 1]);
    if (isClosed) cur.pop();
    out.push({ pts: cur, closed: isClosed });
  }
  return out;
}

export function pathsBox(paths: Polyline[]): Box | null {
  return boxOfPoints(paths.flatMap((p) => p.pts));
}

/** Polygone régulier inscrit dans la boîte (w × h), premier sommet en haut. */
export function polygonPath(w: number, h: number, sides: number): Polyline {
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) {
    const t = -Math.PI / 2 + (i / sides) * Math.PI * 2;
    pts.push([w / 2 + (w / 2) * Math.cos(t), h / 2 + (h / 2) * Math.sin(t)]);
  }
  return { pts, closed: true };
}

export function starPath(w: number, h: number, points: number, ratio: number): Polyline {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const t = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const k = i % 2 ? ratio : 1;
    pts.push([w / 2 + (w / 2) * k * Math.cos(t), h / 2 + (h / 2) * k * Math.sin(t)]);
  }
  return { pts, closed: true };
}

/** Rotation (°) d'une matrice, d'après l'image du vecteur X. */
export const matrixAngle = (m: Mat) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;
