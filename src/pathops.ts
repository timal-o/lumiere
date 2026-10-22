// Décalage et opérations booléennes sur les tracés (Clipper 6).

import ClipperLib from "clipper-lib";
import type { Polyline } from "./model";

const SCALE = 1000; // Clipper travaille en entiers : 1 unité = 1 µm
const ARC_TOLERANCE = 0.02 * SCALE;

type IntPath = { X: number; Y: number }[];

const toInt = (paths: Polyline[]): IntPath[] =>
  paths.filter((p) => p.closed && p.pts.length >= 3).map((p) => p.pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })));

const toOpenInt = (paths: Polyline[]): IntPath[] =>
  paths.filter((p) => !p.closed && p.pts.length >= 2).map((p) => p.pts.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) })));

const fromInt = (paths: IntPath[]): Polyline[] =>
  paths.filter((p) => p.length >= 3).map((p) => ({ closed: true, pts: p.map(({ X, Y }) => [X / SCALE, Y / SCALE] as [number, number]) }));

function execute(type: number, subject: IntPath[], clip: IntPath[], subjFill: number, clipFill: number): IntPath[] {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  if (clip.length) c.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const out: IntPath[] = new ClipperLib.Paths();
  c.Execute(type, out, subjFill, clipFill);
  return out;
}

/** Région d'une forme (pair-impair : les contours intérieurs sont des trous), orientée proprement. */
function region(paths: Polyline[]): IntPath[] {
  const { pftEvenOdd } = ClipperLib.PolyFillType;
  return execute(ClipperLib.ClipType.ctUnion, toInt(paths), [], pftEvenOdd, pftEvenOdd);
}

export type JoinKind = "round" | "miter" | "square";

const JOIN: Record<JoinKind, () => number> = {
  round: () => ClipperLib.JoinType.jtRound,
  miter: () => ClipperLib.JoinType.jtMiter,
  square: () => ClipperLib.JoinType.jtSquare,
};

/**
 * Décale les tracés fermés de `delta` mm (positif = vers l'extérieur). Les tracés
 * ouverts sont transformés en contour de largeur 2·|delta|.
 */
export function offsetPaths(paths: Polyline[], delta: number, join: JoinKind = "round"): Polyline[] {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE);
  co.AddPaths(region(paths), JOIN[join](), ClipperLib.EndType.etClosedPolygon);
  const open = toOpenInt(paths);
  if (open.length) co.AddPaths(open, JOIN[join](), ClipperLib.EndType.etOpenRound);
  const out: IntPath[] = new ClipperLib.Paths();
  co.Execute(out, open.length ? Math.abs(delta) * SCALE : delta * SCALE);
  return fromInt(out);
}

export type BoolOp = "union" | "difference" | "intersection" | "xor";

/**
 * Opération booléenne entre groupes de formes. Chaque élément de `shapes` est
 * la liste des tracés d'une forme ; le premier est le sujet, les autres l'outil.
 * Pour l'union, toutes les formes sont fusionnées.
 */
export function booleanOp(op: BoolOp, shapes: Polyline[][]): Polyline[] {
  const { pftNonZero } = ClipperLib.PolyFillType;
  const regions = shapes.map(region);
  const types = {
    union: ClipperLib.ClipType.ctUnion,
    difference: ClipperLib.ClipType.ctDifference,
    intersection: ClipperLib.ClipType.ctIntersection,
    xor: ClipperLib.ClipType.ctXor,
  };
  if (op === "union") return fromInt(execute(types.union, regions.flat(), [], pftNonZero, pftNonZero));
  const [subject, ...rest] = regions;
  const clip = execute(types.union, rest.flat(), [], pftNonZero, pftNonZero);
  return fromInt(execute(types[op], subject, clip, pftNonZero, pftNonZero));
}

/** Nettoie un ensemble de tracés fermés (fusionne les recouvrements). */
export function weld(paths: Polyline[]): Polyline[] {
  const { pftNonZero } = ClipperLib.PolyFillType;
  return fromInt(execute(ClipperLib.ClipType.ctUnion, toInt(paths), [], pftNonZero, pftNonZero));
}
