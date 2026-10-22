import { describe, expect, it } from "vitest";
import { rectPath, translate } from "../geometry";
import type { Project } from "../model";
import { distort, undistort } from "../camera";
import { convexHull, exportSvg, nestBoxes, positionsAlong, simplifyPaths, trimAt } from "../tools";

describe("outils", () => {
  it("simplification", () => {
    const pts: [number, number][] = Array.from({ length: 101 }, (_, i) => [i / 10, Math.sin(i / 1000)]);
    const [s] = simplifyPaths([{ pts, closed: false }], 0.01);
    expect(s.pts.length).toBeLessThan(5);
  });

  it("imbrication sans recouvrement, dans la zone", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), w: 10 + (i % 4) * 7, h: 8 + (i % 3) * 5 }));
    const area = { x: 0, y: 0, w: 80, h: 200 };
    const places = nestBoxes(items, area, 2, true);
    const rects = places.map((p, i) => {
      expect(p).not.toBeNull();
      const [w, h] = p!.rotated ? [items[i].h, items[i].w] : [items[i].w, items[i].h];
      expect(p!.x + w).toBeLessThanOrEqual(80 + 1e-9);
      return { x: p!.x, y: p!.y, w, h };
    });
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });

  it("une pièce trop grande n'est pas placée", () => {
    expect(nestBoxes([{ id: "a", w: 50, h: 50 }], { x: 0, y: 0, w: 40, h: 40 }, 0, true)).toEqual([null]);
  });

  it("positions le long d'un cercle fermé : réparties sur tout le tour", () => {
    const pos = positionsAlong(rectPath(0, 0, 10, 10), 4);
    expect(pos.map((p) => p.p)).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(pos[1].angle).toBeCloseTo(90, 6);
  });

  it("enveloppe convexe", () => {
    const h = convexHull([[0, 0], [10, 0], [5, 5], [10, 10], [0, 10], [5, 2]]);
    expect(h).toHaveLength(4);
  });

  it("export SVG relisible, courbes comprises", () => {
    const project: Project = {
      format: "lumiere", version: 1, layers: [],
      shapes: [{
        id: "a", kind: "vector", name: "c", layerId: 1, matrix: translate(10, 20), paths: [],
        curves: [{ closed: true, nodes: [{ p: [0, 0], c2: [0, 5] }, { p: [10, 0], c1: [10, 5] }] }],
      }],
    };
    project.layers = [{ id: 1 } as Project["layers"][number]];
    const svg = exportSvg(project, 100, 100);
    expect(svg).toContain('width="100mm"');
    expect(svg).toContain("C10 25 20 25 20 20");
  });
});



describe("ajuster (trim)", () => {
  const cross = { pts: [[0, 5], [10, 5]] as [number, number][], closed: false };
  it("supprime le tronçon entre deux intersections d'une ligne ouverte", () => {
    const line = { pts: [[0, 0], [30, 0]] as [number, number][], closed: false };
    const cutters = [{ pts: [[10, -5], [10, 5]] as [number, number][], closed: false }, { pts: [[20, -5], [20, 5]] as [number, number][], closed: false }];
    const r = trimAt([line], cutters, [15, 0.1]);
    expect(r).toHaveLength(2);
    expect(r[0].pts).toEqual([[0, 0], [10, 0]]);
    expect(r[1].pts).toEqual([[20, 0], [30, 0]]);
  });

  it("ouvre un carré entre ses deux intersections avec une ligne", () => {
    const r = trimAt([rectPath(0, 0, 10, 10)], [cross], [0, 8]);
    expect(r).toHaveLength(1);
    expect(r[0].closed).toBe(false);
    // Le clic est sur la moitié haute : on retire 15 → 35 mm, il reste 5 + 10 + 5 = 20 mm.
    const len = r[0].pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - r[0].pts[i][0], p[1] - r[0].pts[i][1]), 0);
    expect(len).toBeCloseTo(20, 6);
  });

  it("sans intersection, le tracé disparaît", () => {
    expect(trimAt([{ pts: [[0, 0], [1, 0]], closed: false }], [], [0.5, 0])).toHaveLength(0);
  });
});

describe("correction d'objectif", () => {
  it("undistort inverse distort", () => {
    const p = undistort(distort([100, 80], -0.3, 1280, 720), -0.3, 1280, 720);
    expect(p[0]).toBeCloseTo(100, 4);
    expect(p[1]).toBeCloseTo(80, 4);
  });
});

describe("tracé croquis", () => {
  it("les bords deviennent des traits sombres", async () => {
    const { edgeMap } = await import("../trace");
    const w = 20, h = 10;
    const gray = new Uint8Array(w * h).map((_, i) => (i % w < 10 ? 0 : 255));
    const e = edgeMap(gray, w, h);
    expect(e[5 * w + 9]).toBeLessThan(50); // bord
    expect(e[5 * w + 3]).toBe(255); // aplat noir : pas de bord
    expect(e[5 * w + 16]).toBe(255);
  });
});
