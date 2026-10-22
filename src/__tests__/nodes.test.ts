import { describe, expect, it } from "vitest";
import { ellipseBez, flattenBez, fromPolylines, nearestOnPath, roundedRectBez, type BezPath } from "../bezier";
import { pathsBox, rectPath } from "../geometry";
import {
  autoJoin, breakAt, cornerNodes, deleteNodes, filletNodes, insertNode, joinEnds, moveHandle, moveNodes, segmentToCurve, segmentToLine, toggleSmooth,
} from "../nodeedit";
import { parsePathData } from "../import/svgpath";

const square = (): BezPath[] => fromPolylines([rectPath(0, 0, 10, 10)]);

describe("courbes", () => {
  it("ellipse et rectangle arrondi", () => {
    const e = flattenBez([ellipseBez(0, 0, 10, 5)], 0.001)[0];
    for (const [x, y] of e.pts) expect(Math.abs((x / 10) ** 2 + (y / 5) ** 2 - 1)).toBeLessThan(0.002);
    const r = flattenBez([roundedRectBez(0, 0, 20, 10, 3)], 0.01)[0];
    expect(pathsBox([r])).toMatchObject({ x: 0, y: 0, w: 20, h: 10 });
  });

  it("le SVG garde ses courbes : 1 nœud par commande", () => {
    const [p] = parsePathData("M0 0 C 0 10 10 10 10 0 Q 15 -5 20 0 Z");
    expect(p.nodes).toHaveLength(3);
    expect(p.closed).toBe(true);
    expect(p.nodes[0].c2).toEqual([0, 10]);
  });

  it("point le plus proche sur une courbe", () => {
    const [p] = parsePathData("M0 0 C 0 10 10 10 10 0");
    const hit = nearestOnPath(p, [5, 9])!;
    expect(hit.t).toBeCloseTo(0.5, 2);
    expect(hit.p[1]).toBeCloseTo(7.5, 3);
  });
});

describe("édition de nœuds", () => {
  it("déplacer et supprimer", () => {
    let c = moveNodes(square(), [{ path: 0, node: 2 }], [5, 5]);
    expect(c[0].nodes[2].p).toEqual([15, 15]);
    c = deleteNodes(c, [{ path: 0, node: 2 }]);
    expect(c[0].nodes).toHaveLength(3);
    expect(deleteNodes(c, [{ path: 0, node: 0 }, { path: 0, node: 1 }])).toHaveLength(0);
  });

  it("insérer sur une courbe ne change pas sa forme", () => {
    const c = parsePathData("M0 0 C 0 10 10 10 10 0");
    const after = insertNode(c, 0, 0, 0.3);
    expect(after[0].nodes).toHaveLength(3);
    // Chaque point des deux nouvelles courbes est sur la courbe d'origine.
    for (const q of flattenBez(after, 0.01)[0].pts) expect(nearestOnPath(c[0], q)!.d).toBeLessThan(1e-4);
  });

  it("couper un tracé fermé l'ouvre, un tracé ouvert se sépare", () => {
    const open = breakAt(square(), { path: 0, node: 2 });
    expect(open[0].closed).toBe(false);
    expect(open[0].nodes).toHaveLength(5);
    expect(open[0].nodes[0].p).toEqual([10, 10]);
    const two = breakAt(open, { path: 0, node: 2 });
    expect(two).toHaveLength(2);
  });

  it("droite ↔ courbe, nœud lisse, poignée symétrique", () => {
    let c = segmentToCurve(square(), 0, 0);
    expect(c[0].nodes[0].c2).toBeDefined();
    c = segmentToLine(c, 0, 0);
    expect(c[0].nodes[0].c2).toBeUndefined();
    c = toggleSmooth(square(), { path: 0, node: 1 });
    const n = c[0].nodes[1];
    expect(n.smooth).toBe(true);
    c = moveHandle(c, { path: 0, node: 1 }, "c1", [8, -2], false);
    const m = c[0].nodes[1];
    // Poignée opposée alignée : (p − c1) et (c2 − p) colinéaires.
    const v1 = [m.p[0] - m.c1![0], m.p[1] - m.c1![1]], v2 = [m.c2![0] - m.p[0], m.c2![1] - m.p[1]];
    expect(v1[0] * v2[1] - v1[1] * v2[0]).toBeCloseTo(0, 9);
  });

  it("joindre deux extrémités", () => {
    const lines: BezPath[] = fromPolylines([
      { pts: [[0, 0], [10, 0]], closed: false },
      { pts: [[10, 5], [20, 5]], closed: false },
    ]);
    const j = joinEnds(lines, { path: 0, node: 1 }, { path: 1, node: 0 })!;
    expect(j).toHaveLength(1);
    expect(j[0].nodes.map((n) => n.p)).toEqual([[0, 0], [10, 0], [10, 5], [20, 5]]);
    const closed = joinEnds(j, { path: 0, node: 0 }, { path: 0, node: 3 })!;
    expect(closed[0].closed).toBe(true);
    expect(joinEnds(square(), { path: 0, node: 0 }, { path: 0, node: 1 })).toBeNull();
  });
});


describe("congés et jonction", () => {
  it("congé de rayon 2 sur les 4 coins d'un carré", () => {
    const c = filletNodes(square(), cornerNodes(square()), 2);
    expect(c[0].nodes).toHaveLength(8);
    const [p] = flattenBez(c, 0.001);
    // Le coin (0,0) est remplacé par un arc centré en (2,2) de rayon 2.
    const near = p.pts.filter(([x, y]) => x < 2 && y < 2);
    // Approximation cubique du quart de cercle : 0,027 % du rayon.
    for (const [x, y] of near) expect(Math.abs(Math.hypot(x - 2, y - 2) - 2)).toBeLessThan(0.0006);
    expect(pathsBox([p])).toMatchObject({ x: 0, y: 0, w: 10, h: 10 });
  });

  it("chanfrein et recul limité par les segments", () => {
    const c = filletNodes(square(), [{ path: 0, node: 0 }], 100, true);
    expect(c[0].nodes[0].p).toEqual([0, 5]);
    expect(c[0].nodes[1].p).toEqual([5, 0]);
  });

  it("jonction automatique à tolérance", () => {
    const parts = fromPolylines([
      { pts: [[0, 0], [10, 0]], closed: false },
      { pts: [[10.05, 0], [10, 10]], closed: false },
      { pts: [[0, 0.02], [10, 10]], closed: false },
    ]);
    const j = autoJoin(parts, 0.1);
    expect(j).toHaveLength(1);
    expect(j[0].closed).toBe(true);
    expect(j[0].nodes).toHaveLength(3);
  });
});
