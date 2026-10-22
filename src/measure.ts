// Outil Mesure : informations sur la forme et le segment sous le curseur, et sur le trait
// de mesure tiré à la souris. Le plan de travail publie ces informations, le panneau
// de mesure les affiche.

import { useSyncExternalStore } from "react";
import { flattenBez, nearestOnPath, segmentAt, segmentCount, segmentPoint, type BezPath } from "./bezier";
import type { Pt } from "./model";

export interface ShapeStats {
  width: number;
  height: number;
  nodes: number;
  lines: number;
  curves: number;
  closed: "closed" | "open" | "mixed";
  perimeter: number;
  area: number;
}

export interface SegmentInfo {
  start: Pt;
  end: Pt;
  length: number;
  /** Angle de la corde, en degrés (Y vers le haut, comme à l'écran). */
  angle: number;
  /** Courbe : cercle passant par les extrémités et le milieu. */
  arc?: { center: Pt; radius: number };
}

const len = (pts: Pt[], closed: boolean) =>
  pts.reduce((acc, p, i) => (i === 0 && !closed ? acc : acc + Math.hypot(p[0] - pts[(i + pts.length - 1) % pts.length][0], p[1] - pts[(i + pts.length - 1) % pts.length][1])), 0);

const signedArea = (pts: Pt[]) => pts.reduce((acc, q, i) => { const r = pts[(i + 1) % pts.length]; return acc + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;

function inside(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export function shapeStats(curves: BezPath[]): ShapeStats {
  const flat = flattenBez(curves, 0.01);
  const pts = flat.flatMap((p) => p.pts);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let lines = 0, curvesN = 0;
  for (const c of curves) for (let i = 0; i < segmentCount(c); i++) segmentAt(c, i).length === 2 ? lines++ : curvesN++;
  const closedPolys = flat.filter((p) => p.closed && p.pts.length >= 3);
  // Pair-impair : un contour contenu dans un nombre impair d'autres est un trou.
  const area = closedPolys.reduce((acc, p, i) => {
    const depth = closedPolys.filter((q, j) => j !== i && inside(p.pts[0], q.pts)).length;
    return acc + (depth % 2 ? -1 : 1) * Math.abs(signedArea(p.pts));
  }, 0);
  const allClosed = curves.every((c) => c.closed), noneClosed = curves.every((c) => !c.closed);
  return {
    width: pts.length ? Math.max(...xs) - Math.min(...xs) : 0,
    height: pts.length ? Math.max(...ys) - Math.min(...ys) : 0,
    nodes: curves.reduce((n, c) => n + c.nodes.length, 0),
    lines,
    curves: curvesN,
    closed: allClosed ? "closed" : noneClosed ? "open" : "mixed",
    perimeter: flat.reduce((acc, p) => acc + len(p.pts, p.closed), 0),
    area: Math.max(0, area),
  };
}

/** Cercle passant par trois points (null s'ils sont alignés). */
export function circleThrough3(a: Pt, b: Pt, c: Pt): { center: Pt; radius: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const sq = (p: Pt) => p[0] * p[0] + p[1] * p[1];
  const center: Pt = [
    (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d,
    (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d,
  ];
  return { center, radius: Math.hypot(a[0] - center[0], a[1] - center[1]) };
}

/** Segment le plus proche de `p` (à moins de `tol`). */
export function segmentInfo(curves: BezPath[], p: Pt, tol: number): SegmentInfo | null {
  let best: { c: BezPath; seg: number; d: number } | null = null;
  for (const c of curves) {
    const n = nearestOnPath(c, p);
    if (n && n.d <= tol && (!best || n.d < best.d)) best = { c, seg: n.seg, d: n.d };
  }
  if (!best) return null;
  const seg = segmentAt(best.c, best.seg);
  const start = seg[0], end = seg[seg.length - 1];
  const steps = seg.length === 2 ? 1 : 64;
  const pts = Array.from({ length: steps + 1 }, (_, k) => segmentPoint(seg, k / steps));
  const info: SegmentInfo = {
    start, end,
    length: len(pts, false),
    angle: (Math.atan2(-(end[1] - start[1]), end[0] - start[0]) * 180) / Math.PI,
  };
  if (seg.length === 4) {
    const arc = circleThrough3(start, segmentPoint(seg, 0.5), end);
    if (arc) info.arc = arc;
  }
  return info;
}

export interface MeasureInfo {
  shape: ShapeStats | null;
  segment: SegmentInfo | null;
  line: { a: Pt; b: Pt } | null;
}

let info: MeasureInfo = { shape: null, segment: null, line: null };
const listeners = new Set<() => void>();

export function setMeasureInfo(next: MeasureInfo) {
  if (JSON.stringify(next) === JSON.stringify(info)) return;
  info = next;
  listeners.forEach((l) => l());
}

export const useMeasureInfo = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => info,
  );
