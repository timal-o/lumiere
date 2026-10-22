import { describe, expect, it } from "vitest";
import { primitiveCurve } from "../actions";
import { flattenBez } from "../bezier";
import { pathsBox, rectPath, translate } from "../geometry";
import { buildJob, offsetFillPaths, removeOverlaps } from "../job";
import { DEFAULT_CUT, DEFAULT_MACHINE, newLayer, type Project } from "../model";

const project = (): Project => {
  const layer = {
    ...newLayer(0),
    mode: "fill" as const,
    subLayers: [
      { ...DEFAULT_CUT, mode: "line" as const, kerf: 0.5, enabled: true },
      { ...DEFAULT_CUT, mode: "line" as const, enabled: false },
    ],
  };
  return {
    format: "lumiere",
    version: 1,
    layers: [layer],
    shapes: [{ id: "a", kind: "vector", name: "carré", layerId: 0, matrix: translate(10, 10), paths: [rectPath(0, 0, 20, 20)] }],
  };
};

describe("buildJob", () => {
  it("un calque et son sous-calque actif deviennent deux passes sur les mêmes formes", async () => {
    const { job } = await buildJob(project(), DEFAULT_MACHINE);
    expect(job.layers.map((l) => [l.name, l.mode])).toEqual([["C00", "fill"], ["C00 · 2", "line"]]);
    // Kerf de 0,5 mm sur le contour seulement.
    const xs = job.layers[1].paths[0].points.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(9.5, 6);
    expect(Math.min(...job.layers[0].paths[0].points.map((p) => p[0]))).toBeCloseTo(10, 6);
  });

  it("décalage d'origine de travail appliqué à tous les tracés", async () => {
    const { job } = await buildJob(project(), DEFAULT_MACHINE, { offset: [5, -5] });
    expect(Math.min(...job.layers[0].paths[0].points.map((p) => p[1]))).toBeCloseTo(5, 6);
  });
});

describe("remplissage concentrique et rotatif", () => {
  it("anneaux tous les « pas » jusqu'au centre", () => {
    const rings = offsetFillPaths([rectPath(0, 0, 10, 10)], 1);
    expect(rings).toHaveLength(5); // demi-pas puis 4 pas : 0,5 / 1,5 / 2,5 / 3,5 / 4,5 mm
    expect(rings.every((r) => r.closed)).toBe(true);
  });

  it("le mode concentrique part en contours, sans contrainte intérieur d'abord", async () => {
    const p = project();
    p.layers[0] = { ...p.layers[0], mode: "offsetFill", subLayers: [] };
    const { job } = await buildJob(p, DEFAULT_MACHINE);
    expect(job.layers[0].mode).toBe("line");
    expect(job.layers[0].innerFirst).toBe(false);
    expect(job.layers[0].paths.length).toBeGreaterThan(50);
  });

  it("le rotatif met l'axe Y à l'échelle autour du centre du travail", async () => {
    const machine = { ...DEFAULT_MACHINE, rotary: true, rotaryMmPerRotation: Math.PI * 40, rotaryDiameter: 80 };
    const p = project();
    p.layers[0] = { ...p.layers[0], subLayers: [] };
    const { job, warnings } = await buildJob(p, machine);
    const ys = job.layers[0].paths[0].points.map((q) => q[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10, 6); // 20 mm × 0,5
    expect(warnings.some((w) => w.includes("Rotatif"))).toBe(true);
  });
});


describe("attaches manuelles et formes paramétriques", () => {
  it("les attaches vont au contour le plus proche, décalage compris", async () => {
    const p = project();
    p.layers[0] = { ...p.layers[0], mode: "line", subLayers: [] };
    p.shapes = [{ ...p.shapes[0], kind: "vector", tabs: [[10, 0]] } as (typeof p.shapes)[number]];
    const { job } = await buildJob(p, DEFAULT_MACHINE, { offset: [1, 2] });
    // Attache au milieu du bord haut : (10, 0) local → (20, 10) plateau → (21, 12) avec le décalage.
    expect(job.layers[0].paths[0].tabs).toEqual([[21, 12]]);
  });

  it("rectangle arrondi et polygone paramétriques", () => {
    const r = flattenBez([primitiveCurve({ type: "rect", w: 30, h: 20, radius: 5 })], 0.01);
    expect(pathsBox(r)).toMatchObject({ x: 0, y: 0, w: 30, h: 20 });
    const hex = primitiveCurve({ type: "polygon", w: 10, h: 10, sides: 6 });
    expect(hex.nodes).toHaveLength(6);
  });
});


describe("lignes superposées", () => {
  it("deux carrés côte à côte : le bord commun n'est gardé qu'une fois", () => {
    const out = removeOverlaps([rectPath(0, 0, 10, 10), rectPath(10, 0, 10, 10)]);
    const len = out.reduce((acc, p) => {
      const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
      return acc + pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
    }, 0);
    expect(len).toBeCloseTo(70, 9); // 80 − 10
    expect(out[0].closed).toBe(true);
    expect(out[1].closed).toBe(false);
    expect(out).toHaveLength(2); // le second carré reste une seule chaîne en U
  });
});

describe("optimisation", () => {
  const shape = (id: string, layerId: number, groupId?: string, priority?: number) =>
    ({ id, kind: "vector", name: id, layerId, groupId, priority, matrix: [1, 0, 0, 1, 0, 0], paths: [rectPath(0, 0, 5, 5)] }) as Project["shapes"][number];
  const base = (): Project => ({
    format: "lumiere", version: 1, layers: [newLayer(0), newLayer(1)],
    shapes: [shape("a", 0, "g1", 2), shape("b", 1, "g1", 2), shape("c", 0, "g2", 1), shape("d", 1, "g2", 1)],
  });

  it("calque par calque par défaut, groupe par groupe ou par priorité sur demande", async () => {
    const names = async (p: Project) => (await buildJob(p, DEFAULT_MACHINE)).job.layers.map((l) => l.paths.length);
    expect(await names(base())).toEqual([2, 2]);
    const byGroup = await buildJob({ ...base(), optimization: { order: "group" } as Project["optimization"] }, DEFAULT_MACHINE);
    expect(byGroup.job.layers.map((l) => l.name)).toEqual([newLayer(0).name, newLayer(1).name, newLayer(0).name, newLayer(1).name]);
    const byPriority = await buildJob({ ...base(), optimization: { order: "priority" } as Project["optimization"] }, DEFAULT_MACHINE);
    // Priorité 1 (c, d) avant 2 (a, b) ; les options transmises au moteur.
    expect(byPriority.job.layers).toHaveLength(4);
    expect(byPriority.job.layers[0].optimize?.reorder).toBe(true);
  });
});

describe("reprise depuis l'aperçu", () => {
  it("rétablit l'état de la machine avant les lignes restantes", async () => {
    const { gcodeFrom, parseToolpath } = await import("../toolpath");
    const g = ["G90", "G21", "M4 S0", "M8", "G0 X10 Y10", "G1 X20 Y10 F1200 S500", "G1 X20 Y20", "G1 X10 Y20", "M5"].join("\n");
    const tp = parseToolpath(g, DEFAULT_MACHINE);
    expect(Array.from(tp.line)).toEqual([4, 5, 6, 7]);
    expect(Array.from(tp.power)).toEqual([0, 500, 500, 500]);
    expect(tp.maxPower).toBe(500);
    const out = gcodeFrom(g, tp.line[2]).split("\n");
    expect(out).toContain("M4 S0");
    expect(out).toContain("M8");
    expect(out).toContain("G0 X20 Y10");
    expect(out).toContain("G1 F1200 S500");
    expect(out.slice(-3)).toEqual(["G1 X20 Y20", "G1 X10 Y20", "M5"]);
  });
});

describe("passes globales", () => {
  it("répètent le calque et ses sous-calques ensemble", async () => {
    const { buildJob } = await import("../job");
    const { emptyProject, newLayer, DEFAULT_CUT } = await import("../model");
    const layer = { ...newLayer(0), globalPasses: 3, subLayers: [{ ...DEFAULT_CUT, mode: "fill" as const, enabled: true }] };
    const p = { ...emptyProject(), layers: [layer], shapes: [{ id: "a", kind: "vector" as const, name: "c", layerId: 0, matrix: [1, 0, 0, 1, 10, 10] as [number, number, number, number, number, number], paths: [{ closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] }] }] };
    const { job } = await buildJob(p, DEFAULT_MACHINE);
    expect(job.layers.map((l) => l.mode)).toEqual(["line", "fill", "line", "fill", "line", "fill"]);
  });
});

describe("découpes en dernier et échelle de vitesse", () => {
  it("met les calques Ligne après les gravures et applique l'échelle", async () => {
    const { buildJob } = await import("../job");
    const { emptyProject, newLayer } = await import("../model");
    const sqShape = (id: string, layerId: number) => ({ id, kind: "vector" as const, name: "", layerId, matrix: [1, 0, 0, 1, 10, 10] as [number, number, number, number, number, number], paths: [{ closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] }] });
    const p = { ...emptyProject(), layers: [{ ...newLayer(0), speed: 1000 }, { ...newLayer(1), mode: "fill" as const }], shapes: [sqShape("a", 0), sqShape("b", 1)], optimization: { cutsLast: true } as never };
    const { job } = await buildJob(p, { ...DEFAULT_MACHINE, speedScale: 50 });
    expect(job.layers.map((l) => l.mode)).toEqual(["fill", "line"]);
    expect(job.layers[1].speed).toBe(500);
  });
});

describe("calques outils", () => {
  it("ne sont jamais gravés", async () => {
    const { buildJob } = await import("../job");
    const { emptyProject, newLayer, isToolLayer, layerColor } = await import("../model");
    const t1 = newLayer(100);
    expect([t1.name, t1.output, isToolLayer(100), isToolLayer(3)]).toEqual(["T1", false, true, false]);
    expect(layerColor(101)).not.toBe(layerColor(100));
    const sq = { id: "a", kind: "vector" as const, name: "", layerId: 100, matrix: [1, 0, 0, 1, 10, 10] as [number, number, number, number, number, number], paths: [{ closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] }] };
    const { job } = await buildJob({ ...emptyProject(), layers: [newLayer(0), { ...t1, output: true }], shapes: [sq] }, DEFAULT_MACHINE);
    expect(job.layers).toHaveLength(0);
  });
});

describe("rotatif", () => {
  it("rouleaux, mandrin, axe A et miroir", async () => {
    const { rotaryScale, machineParams } = await import("../job");
    const base = { ...DEFAULT_MACHINE, rotary: true, rotaryMmPerRotation: 100, rotaryDiameter: 50 };
    expect(rotaryScale(base)).toBeCloseTo(100 / (Math.PI * 50));
    expect(rotaryScale({ ...base, rotaryType: "roller", rollerDiameter: 20 })).toBeCloseTo(100 / (Math.PI * 20));
    expect(rotaryScale({ ...base, rotaryAxis: "A" })).toBeCloseTo(360 / (Math.PI * 50));
    expect(rotaryScale({ ...base, rotaryMirror: true })).toBeLessThan(0);
    expect(machineParams({ ...base, rotaryAxis: "A" }).yLetter).toBe("A");
    expect(machineParams({ ...base, rotary: false, rotaryAxis: "A" }).yLetter).toBe("Y");
  });
});

describe("formes hors du plateau", () => {
  it("sont ignorées si demandé", async () => {
    const { buildJob } = await import("../job");
    const { emptyProject, newLayer } = await import("../model");
    const sq = (id: string, x: number) => ({ id, kind: "vector" as const, name: "", layerId: 0, matrix: [1, 0, 0, 1, x, 10] as [number, number, number, number, number, number], paths: [{ closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] }] });
    const p = { ...emptyProject(), layers: [newLayer(0)], shapes: [sq("in", 10), sq("out", 5000)] };
    const all = await buildJob(p, DEFAULT_MACHINE);
    const kept = await buildJob(p, DEFAULT_MACHINE, { ignoreOutOfBounds: true });
    expect(all.job.layers[0].paths).toHaveLength(2);
    expect(kept.job.layers[0].paths).toHaveLength(1);
    expect(kept.warnings.some((w) => w.includes("1"))).toBe(true);
  });
});
