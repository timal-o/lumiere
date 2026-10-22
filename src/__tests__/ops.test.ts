import { describe, expect, it, vi } from "vitest";
import { rectPath, pathsBox } from "../geometry";
import type { Polyline } from "../model";
import { booleanOp, offsetPaths, weld } from "../pathops";
import { qrPaths } from "../qr";
import { adjustLut } from "../raster";
import { traceBitmap } from "../trace";

function area(p: Polyline): number {
  let a = 0;
  for (let i = 0, j = p.pts.length - 1; i < p.pts.length; j = i++) a += (p.pts[j][0] + p.pts[i][0]) * (p.pts[j][1] - p.pts[i][1]);
  return Math.abs(a / 2);
}

describe("pathops", () => {
  it("décale un carré vers l'extérieur et l'intérieur", () => {
    const sq = [rectPath(0, 0, 10, 10)];
    const out = offsetPaths(sq, 1, "miter");
    expect(pathsBox(out)).toMatchObject({ x: -1, y: -1, w: 12, h: 12 });
    const inner = offsetPaths(sq, -2, "miter");
    expect(pathsBox(inner)).toMatchObject({ x: 2, y: 2, w: 6, h: 6 });
  });

  it("le décalage d'un cadre agrandit l'extérieur et rétrécit le trou", () => {
    const frame = [rectPath(0, 0, 20, 20), rectPath(5, 5, 10, 10)];
    const out = offsetPaths(frame, 1, "miter");
    const areas = out.map(area).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(64, 3); // trou 8 × 8
    expect(areas[1]).toBeCloseTo(484, 3); // contour 22 × 22
  });

  it("soude et soustrait", () => {
    const a = [rectPath(0, 0, 10, 10)];
    const b = [rectPath(5, 0, 10, 10)];
    const u = booleanOp("union", [a, b]);
    expect(u).toHaveLength(1);
    expect(area(u[0])).toBeCloseTo(150, 3);
    const d = booleanOp("difference", [a, b]);
    expect(area(d[0])).toBeCloseTo(50, 3);
    const i = booleanOp("intersection", [a, b]);
    expect(area(i[0])).toBeCloseTo(50, 3);
  });

  it("weld fusionne des carrés adjacents", () => {
    expect(weld([rectPath(0, 0, 1, 1), rectPath(1, 0, 1, 1)])).toHaveLength(1);
  });
});

describe("trace", () => {
  it("trouve un carré noir avec un trou", () => {
    const w = 20, h = 20;
    const g = new Uint8Array(w * h).fill(255);
    for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) g[y * w + x] = 0;
    for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) g[y * w + x] = 255;
    const loops = traceBitmap(g, w, h, { threshold: 128, minArea: 1, tolerance: 0.5, smooth: false });
    const areas = loops.map(area).sort((a, b) => a - b);
    expect(areas).toEqual([16, 144]);
  });

  it("ignore les petites taches", () => {
    const g = new Uint8Array(100).fill(255);
    g[55] = 0;
    expect(traceBitmap(g, 10, 10, { threshold: 128, minArea: 4, tolerance: 0.5, smooth: false })).toHaveLength(0);
  });
});

describe("qr", () => {
  it("génère un QR code carré à la bonne taille", () => {
    const paths = qrPaths("https://example.org", 25);
    const b = pathsBox(paths)!;
    expect(b.x).toBeCloseTo(0, 6);
    expect(b.w).toBeCloseTo(25, 6);
    expect(b.h).toBeCloseTo(25, 6);
    expect(paths.length).toBeGreaterThan(10);
  });
});

describe("réglages d'image", () => {
  it("neutre, inversion, luminosité", () => {
    const id = adjustLut({ brightness: 0, contrast: 0, gamma: 1, invert: false });
    expect(id[0]).toBe(0);
    expect(id[128]).toBe(128);
    expect(id[255]).toBe(255);
    const inv = adjustLut({ brightness: 0, contrast: 0, gamma: 1, invert: true });
    expect(inv[0]).toBe(255);
    const bright = adjustLut({ brightness: 50, contrast: 0, gamma: 1, invert: false });
    expect(bright[100]).toBeGreaterThan(200);
  });
});

describe("accentuation", () => {
  it("renforce un bord et lisse le bruit des aplats", async () => {
    const { enhance } = await import("../raster");
    const w = 20, h = 1;
    const step = new Float32Array(Array.from({ length: w }, (_, i) => (i < 10 ? 50 : 200)));
    const sharp = enhance(step, w, h, 100, 2, 0);
    expect(sharp[9]).toBeLessThan(50); // le côté sombre du bord s'assombrit
    expect(sharp[10]).toBeGreaterThan(200);
    const noisy = new Float32Array(Array.from({ length: w }, (_, i) => 128 + (i % 2 ? 3 : -3)));
    const smooth = enhance(noisy, w, h, 0, 2, 100);
    expect(Math.abs(smooth[5] - smooth[6])).toBeLessThan(2);
  });
});

describe("tracé central", () => {
  it("réduit un trait épais à une ligne en son milieu", async () => {
    const { traceCenterline } = await import("../trace");
    const w = 40, h = 20;
    const gray = new Uint8Array(w * h).fill(255);
    for (let y = 8; y < 13; y++) for (let x = 5; x < 35; x++) gray[y * w + x] = 0; // trait horizontal de 5 px
    const lines = traceCenterline(gray, w, h, { threshold: 128, minArea: 4, tolerance: 0.6, smooth: false });
    expect(lines).toHaveLength(1);
    expect(lines[0].closed).toBe(false);
    const ys = lines[0].pts.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1.5);
    expect(Math.abs(ys[0] - 10.5)).toBeLessThan(1.1);
    const xs = lines[0].pts.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20);
  });
});

describe("décalage : contours extérieurs", () => {
  it("écarte les trous et les formes intérieures", async () => {
    const { outerContours } = await import("../actions");
    const sq = (x: number, s: number) => ({ closed: true, pts: [[x, x], [x + s, x], [x + s, x + s], [x, x + s]] as [number, number][] });
    const res = outerContours([sq(0, 100), sq(10, 20), sq(200, 10), { closed: false, pts: [[0, 0], [1, 1]] }]);
    expect(res.map((p) => p.pts[0][0])).toEqual([0, 200]);
  });
});

describe("générer un contour", () => {
  it("silhouette sans trous, éloignée de la distance", async () => {
    vi.stubGlobal("window", new EventTarget());
    const { generateOutline } = await import("../actions");
    const { loadProject, getState, setState } = await import("../store");
    const { emptyProject } = await import("../model");
    const { shapeBox } = await import("../geometry");
    const ring = { id: "r", kind: "vector" as const, name: "", layerId: 0, matrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
      paths: [{ closed: true, pts: [[0, 0], [20, 0], [20, 20], [0, 20]] as [number, number][] }, { closed: true, pts: [[5, 5], [15, 5], [15, 15], [5, 15]] as [number, number][] }] };
    loadProject({ ...emptyProject(), shapes: [ring] }, null);
    setState({ selection: ["r"] });
    await generateOutline(2, "miter");
    const out = getState().project.shapes[1];
    expect(out.kind === "vector" && out.paths.length).toBe(1);
    const b = shapeBox(out)!;
    expect(b.w).toBeCloseTo(24, 1);
  });
});
