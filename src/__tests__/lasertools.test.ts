import { describe, expect, it, vi } from "vitest";
import { rectPath, worldPaths } from "../geometry";
import { emptyProject, type Shape } from "../model";
import { taperWarp } from "../lasertools";
import { getState, loadProject, setState } from "../store";

vi.stubGlobal("window", new EventTarget());

describe("déformation conique", () => {
  it("rétrécit le haut d'un rectangle selon le rapport des diamètres", () => {
    const s = { id: "r", kind: "vector", name: "", layerId: 0, matrix: [1, 0, 0, 1, 0, 0], paths: [rectPath(0, 0, 100, 50)] } as Shape;
    loadProject({ ...emptyProject(), shapes: [s] }, null);
    setState({ selection: ["r"] });
    taperWarp(50, 100); // haut moitié moins large que le bas
    const pts = worldPaths(getState().project.shapes[0])[0].pts;
    const width = (y: number) => {
      const xs = pts.filter((p) => Math.abs(p[1] - y) < 1e-6).map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(0)).toBeCloseTo(50);
    expect(width(50)).toBeCloseTo(100);
  });
});

describe("centre d'un cercle", () => {
  it("retrouve le centre et le rayon par trois points", async () => {
    const { circleThrough } = await import("../lasertools");
    const c = circleThrough([10, 0], [0, 10], [-10, 0])!;
    expect(c.c[0]).toBeCloseTo(0);
    expect(c.c[1]).toBeCloseTo(0);
    expect(c.r).toBeCloseTo(10);
    expect(circleThrough([0, 0], [1, 1], [2, 2])).toBeNull();
  });
});

describe("journal des travaux", () => {
  it("CSV avec guillemets échappés et travail terminé ou non", async () => {
    const { jobLogCsv } = await import("../laser");
    const csv = jobLogCsv([
      { start: "2026-10-22T10:00:00.000Z", seconds: 61.4, acked: 10, total: 10, errors: 0, name: "boîte \"A\".lum" },
      { start: "2026-10-22T11:00:00.000Z", seconds: 5, acked: 3, total: 10, errors: 1, name: "x" },
    ]).trim().split("\n");
    expect(csv[1]).toBe('2026-10-22T10:00:00.000Z,"boîte ""A"".lum",61,10,10,0,1');
    expect(csv[2].endsWith(",0")).toBe(true);
  });
});
