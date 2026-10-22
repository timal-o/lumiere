import { describe, expect, it } from "vitest";
import { applyH, homography, invertH } from "../camera";
import type { Pt } from "../model";

describe("homographie", () => {
  const cam: Pt[] = [[102, 87], [1180, 120], [1150, 690], [80, 650]];
  const bed: Pt[] = [[20, 20], [380, 20], [380, 280], [20, 280]];

  it("envoie les 4 repères sur leurs positions", () => {
    const h = homography(cam, bed);
    cam.forEach((p, i) => {
      const q = applyH(h, p);
      expect(q[0]).toBeCloseTo(bed[i][0], 6);
      expect(q[1]).toBeCloseTo(bed[i][1], 6);
    });
  });

  it("l'inverse ramène au point de départ", () => {
    const h = homography(cam, bed);
    const back = applyH(invertH(h), applyH(h, [600, 400]));
    expect(back[0]).toBeCloseTo(600, 6);
    expect(back[1]).toBeCloseTo(400, 6);
  });

  it("refuse des repères alignés", () => {
    expect(() => homography([[0, 0], [1, 1], [2, 2], [3, 3]], bed)).toThrow();
  });
});

describe("alignement à 9 repères", () => {
  it("grille 3 × 3, ligne par ligne", async () => {
    const { defaultTargets } = await import("../ui/CameraDialog");
    const t9 = defaultTargets(9, 200, 100);
    expect(t9).toHaveLength(9);
    expect(t9[0]).toEqual([30, 15]);
    expect(t9[4]).toEqual([100, 50]);
    expect(t9[8]).toEqual([170, 85]);
  });
});
