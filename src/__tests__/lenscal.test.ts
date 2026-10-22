import { describe, expect, it } from "vitest";
import { applyH, distort } from "../camera";
import { detectDots, fitHomography, fitK1, indexGrid } from "../lenscal";
import type { Pt } from "../model";

const W = 640, H = 480;

/** Grille 9 × 6 vue en légère perspective, puis déformée par l'objectif (k1). */
function view(k1: number): Pt[] {
  const h = [52, 4, 90, -3, 50, 70, 0.00002, 0.00004, 1];
  const pts: Pt[] = [];
  for (let j = 0; j < 6; j++) for (let i = 0; i < 9; i++) pts.push(distort(applyH(h, [i, j]), k1, W, H));
  return pts;
}

describe("calibration de l'objectif", () => {
  it("détecte des taches rondes", () => {
    const gray = new Uint8Array(W * H).fill(230);
    const centers: Pt[] = [[100, 100], [300, 220], [500, 400]];
    for (const [cx, cy] of centers) {
      for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) if (x * x + y * y <= 64) gray[(cy + y) * W + cx + x] = 20;
    }
    const dots = detectDots(gray, W, H);
    expect(dots.length).toBe(3);
    for (const c of centers) expect(dots.some((d) => Math.hypot(d[0] - c[0], d[1] - c[1]) < 0.5)).toBe(true);
  });

  it("homographie aux moindres carrés", () => {
    const h = [2, 0.1, 5, -0.2, 1.5, 7, 0.001, 0.002, 1];
    const src: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 8]];
    const fit = fitHomography(src, src.map((p) => applyH(h, p)));
    for (const p of src) {
      const [a, b] = [applyH(fit, p), applyH(h, p)];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-6);
    }
  });

  it("numérote la grille et retrouve la distorsion", () => {
    for (const k1 of [-0.15, 0.05]) {
      const pts = view(k1).reverse();
      const set = indexGrid(pts, 9, 6)!;
      expect(set.grid.length).toBe(54);
      const r = fitK1([set], W, H);
      expect(r.k1).toBeCloseTo(k1, 2);
      expect(r.after).toBeLessThan(r.before);
    }
  });
});
