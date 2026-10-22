import { beforeEach, describe, expect, it, vi } from "vitest";
import { ellipseBez, flattenBez } from "../bezier";
import { rectPath, shapeBox, worldPaths } from "../geometry";
import { emptyProject, type Polyline, type Shape } from "../model";
import {
  autoGroup, closePaths, cutShapes, dock, isCircle, mirrorAcrossLine, moveTogether, pushStep, reverseDirection,
  selectContained, selectSmaller, setLocked,
} from "../shapeops";
import { getState, history, jumpHistory, loadProject, setState } from "../store";
import { nudge } from "../actions";

vi.stubGlobal("window", new EventTarget());

let n = 0;
function shape(paths: Polyline[], extra: Partial<Shape> = {}): Shape {
  return { id: `s${++n}`, kind: "vector", name: "", layerId: 0, matrix: [1, 0, 0, 1, 0, 0], paths, ...extra } as Shape;
}

function load(shapes: Shape[], selection: string[] = shapes.map((s) => s.id)) {
  loadProject({ ...emptyProject(), shapes }, null);
  setState({ selection, machine: { ...getState().machine, bedWidth: 100, bedHeight: 100 } });
}

const find = (id: string) => getState().project.shapes.find((s) => s.id === id)!;

beforeEach(() => {
  n = 0;
});

describe("tracés", () => {
  it("ferme un tracé ouvert, avec ou sans tolérance", () => {
    const open = shape([{ closed: false, pts: [[0, 0], [10, 0], [10, 10], [0.3, 0]] }]);
    load([open]);
    closePaths(0.1); // écart de 0,3 mm > tolérance
    expect(worldPaths(find(open.id))[0].closed).toBe(false);
    closePaths(0.5);
    expect(worldPaths(find(open.id))[0].closed).toBe(true);
  });

  it("inverse le sens de parcours", () => {
    const s = shape([{ closed: false, pts: [[0, 0], [10, 0], [10, 10]] }]);
    load([s]);
    reverseDirection();
    expect(worldPaths(find(s.id))[0].pts[0]).toEqual([10, 10]);
  });
});

describe("sélections", () => {
  it("sélectionne les formes contenues et les plus petites", () => {
    const outer = shape([rectPath(0, 0, 50, 50)]);
    const inner = shape([rectPath(10, 10, 5, 5)]);
    const outside = shape([rectPath(60, 60, 5, 5)]);
    const big = shape([rectPath(0, 60, 80, 30)]);
    load([outer, inner, outside, big], [outer.id]);
    selectContained();
    expect(getState().selection).toEqual([inner.id]);
    setState({ selection: [outer.id] });
    selectSmaller();
    expect(getState().selection.sort()).toEqual([inner.id, outside.id].sort());
  });

  it("reconnaît un cercle, pas un carré", () => {
    expect(isCircle(shape([flattenBez([ellipseBez(5, 5, 5, 5)], 0.02)[0]]))).toBe(true);
    expect(isCircle(shape([rectPath(0, 0, 10, 10)]))).toBe(false);
  });
});

describe("rangement", () => {
  it("groupe une forme avec celles qu'elle contient", () => {
    const o = shape([rectPath(0, 0, 50, 50)]), i = shape([rectPath(10, 10, 5, 5)]), x = shape([rectPath(60, 0, 5, 5)]);
    load([o, i, x]);
    autoGroup();
    expect(find(o.id).groupId).toBeDefined();
    expect(find(i.id).groupId).toBe(find(o.id).groupId);
    expect(find(x.id).groupId).toBeUndefined();
  });

  it("rapproche les formes sans espace", () => {
    const a = shape([rectPath(0, 0, 10, 10)]), b = shape([rectPath(30, 0, 10, 10)]), c = shape([rectPath(60, 0, 5, 10)]);
    load([a, b, c]);
    moveTogether("x");
    expect(shapeBox(find(b.id))!.x).toBeCloseTo(10);
    expect(shapeBox(find(c.id))!.x).toBeCloseTo(20);
  });

  it("ancre contre la forme voisine puis contre le bord", () => {
    const wall = shape([rectPath(0, 0, 20, 20)]), s = shape([rectPath(50, 5, 10, 10)]);
    load([wall, s], [s.id]);
    dock("left");
    expect(shapeBox(find(s.id))!.x).toBeCloseTo(20);
    dock("down");
    expect(shapeBox(find(s.id))!.y).toBeCloseTo(90);
  });

  it("symétrise par rapport à une ligne verticale", () => {
    const s = shape([rectPath(0, 0, 10, 10)]), line = shape([{ closed: false, pts: [[20, 0], [20, 50]] }]);
    load([s, line], [s.id, line.id]);
    mirrorAcrossLine();
    expect(shapeBox(find(s.id))).toMatchObject({ x: 30, w: 10 });
  });

  it("avance d'un cran dans l'ordre de dessin", () => {
    const a = shape([rectPath(0, 0, 1, 1)]), b = shape([rectPath(0, 0, 1, 1)]), c = shape([rectPath(0, 0, 1, 1)]);
    load([a, b, c], [a.id]);
    pushStep(true);
    expect(getState().project.shapes.map((s) => s.id)).toEqual([b.id, a.id, c.id]);
  });

  it("une forme verrouillée ne bouge pas", () => {
    const s = shape([rectPath(0, 0, 10, 10)]);
    load([s]);
    setLocked(true);
    nudge(5, 0);
    expect(shapeBox(find(s.id))!.x).toBe(0);
  });
});

describe("découpe et historique", () => {
  it("découpe une forme en partie intérieure et extérieure", () => {
    const piece = shape([rectPath(0, 0, 20, 10)]), knife = shape([rectPath(10, -5, 20, 20)]);
    load([piece, knife]);
    cutShapes();
    expect(getState().project.shapes).toHaveLength(3);
  });

  it("revient à un état de l'historique", () => {
    const s = shape([rectPath(0, 0, 10, 10)]);
    load([s]);
    nudge(1, 0);
    nudge(1, 0);
    expect(history().map((e) => e.offset)).toEqual([-2, -1, 0]);
    jumpHistory(-2);
    expect(shapeBox(find(s.id))!.x).toBe(0);
    expect(history().map((e) => e.offset)).toEqual([0, 1, 2]);
  });
});

describe("déformations", () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  it("une grille régulière ne déforme pas (4 et 16 points)", async () => {
    const { warpGrid, warpPoint } = await import("../shapeops");
    for (const n of [2, 4]) {
      const [x, y] = warpPoint([3, 7], box, warpGrid(box, n), n);
      expect(x).toBeCloseTo(3);
      expect(y).toBeCloseTo(7);
    }
  });

  it("déplacer un coin entraîne les points voisins", async () => {
    const { warpGrid, warpPoint } = await import("../shapeops");
    const grid = warpGrid(box, 2);
    grid[3] = [20, 20]; // coin bas droit
    expect(warpPoint([10, 10], box, grid, 2)).toEqual([20, 20]);
    expect(warpPoint([0, 0], box, grid, 2)).toEqual([0, 0]);
  });

  it("rotation à deux points, avec ou sans échelle", async () => {
    const { twoPointMatrix } = await import("../shapeops");
    const { apply } = await import("../geometry");
    const m = twoPointMatrix([0, 0], [10, 0], [0, 20], false);
    const q = apply(m, [10, 0]);
    expect(q[0]).toBeCloseTo(0);
    expect(q[1]).toBeCloseTo(10);
    const k = apply(twoPointMatrix([0, 0], [10, 0], [0, 20], true), [10, 0]);
    expect(k[1]).toBeCloseTo(20);
  });
});

describe("cercles tangents et encoches", () => {
  it("trouve les cercles tangents à trois cercles", async () => {
    const { apollonius } = await import("../shapeops");
    const given = [{ c: [0, 0] as [number, number], r: 1 }, { c: [10, 0] as [number, number], r: 1 }, { c: [5, 8] as [number, number], r: 1 }];
    const sols = apollonius(given);
    expect(sols.length).toBe(8);
    // Chaque solution est tangente aux trois cercles (extérieurement ou intérieurement).
    for (const s of sols) {
      for (const g of given) {
        const d = Math.hypot(s.c[0] - g.c[0], s.c[1] - g.c[1]);
        expect(Math.min(Math.abs(d - (s.r + g.r)), Math.abs(d - Math.abs(s.r - g.r)))).toBeLessThan(1e-6);
      }
    }
  });

  it("élargit une encoche de 3 à 4 mm et allonge un tenon", async () => {
    const { resizeSlotsInPath } = await import("../shapeops");
    // Rectangle 40 × 20 avec une encoche de 3 mm de large, 10 de profondeur, sur le bord haut.
    const notch: [number, number][] = [[0, 0], [18.5, 0], [18.5, 10], [21.5, 10], [21.5, 0], [40, 0], [40, 20], [0, 20]];
    const r = resizeSlotsInPath(notch, { mode: "slots", old: 3, next: 4, depth: 0, tol: 0.1 });
    expect(r.count).toBe(1);
    expect(r.pts[1][0]).toBeCloseTo(18);
    expect(r.pts[4][0]).toBeCloseTo(22);
    // Tenon de 3 mm de haut sur le bord haut.
    const tab: [number, number][] = [[0, 0], [15, 0], [15, -3], [25, -3], [25, 0], [40, 0], [40, 20], [0, 20]];
    const t2 = resizeSlotsInPath(tab, { mode: "tabs", old: 3, next: 5, depth: 0, tol: 0.1 });
    expect(t2.count).toBe(1);
    expect(t2.pts[2][1]).toBeCloseTo(-5);
    expect(t2.pts[3][1]).toBeCloseTo(-5);
  });
});

describe("même taille", () => {
  it("donne la largeur de la première forme aux autres, autour de leur centre", async () => {
    const { makeSameSize } = await import("../shapeops");
    const a = shape([rectPath(0, 0, 20, 10)]), b = shape([rectPath(50, 0, 10, 10)]);
    load([a, b], [a.id, b.id]);
    makeSameSize("w");
    expect(shapeBox(find(b.id))).toMatchObject({ x: 45, w: 20, h: 10 });
  });
});

describe("historique nommé", () => {
  it("garde le nom de chaque modification", async () => {
    const { labelNext, checkpoint } = await import("../store");
    const s = shape([rectPath(0, 0, 10, 10)]);
    load([s]);
    labelNext("Souder");
    nudge(1, 0);
    labelNext(null);
    checkpoint("Déplacer");
    expect(history().map((e) => e.label)).toEqual(["Souder", "Déplacer", null]);
  });
});

describe("répétitions modifiables", () => {
  it("recalcule puis aplatit une grille", async () => {
    const { gridArray, flattenArray, selectedArray } = await import("../actions");
    const s = shape([rectPath(0, 0, 10, 10)]);
    load([s], [s.id]);
    gridArray(3, 1, 5, 0);
    expect(getState().project.shapes).toHaveLength(3);
    const id = selectedArray()!;
    expect(getState().project.arrays?.[id]).toMatchObject({ kind: "grid", cols: 3 });
    // Modification : 2 × 2 avec la même répétition (les anciennes copies disparaissent).
    setState({ selection: [s.id] });
    gridArray(2, 2, 5, 5, id);
    expect(getState().project.shapes).toHaveLength(4);
    flattenArray();
    expect(getState().project.arrays?.[id]).toBeUndefined();
    expect(getState().project.shapes.every((x) => !x.arrayCopy)).toBe(true);
  });
});

describe("grilles : options", () => {
  it("pas, demi-décalage, sens inverse, miroir", async () => {
    const { gridTransforms } = await import("../actions");
    const b = { x: 0, y: 0, w: 10, h: 4 };
    const base = { kind: "grid" as const, cols: 2, rows: 2, gapX: 5, gapY: 1, source: [] };
    // Écart entre bords : pas de 15 × 5.
    expect(gridTransforms(base, b).map((m) => [m[4], m[5]])).toEqual([[15, 0], [0, 5], [15, 5]]);
    expect(gridTransforms({ ...base, pitch: true, gapX: 20, gapY: 8 }, b).map((m) => [m[4], m[5]])).toEqual([[20, 0], [0, 8], [20, 8]]);
    expect(gridTransforms({ ...base, halfShift: true }, b)[1][4]).toBeCloseTo(7.5);
    expect(gridTransforms({ ...base, reverse: true }, b)[0][4]).toBe(-15);
    const mir = gridTransforms({ ...base, mirrorColsX: true }, b)[0];
    expect(mir[0]).toBe(-1); // la colonne 1 est retournée autour du centre de la sélection
    expect(mir[4]).toBe(15 + 10);
  });
});

describe("répétitions : ajouter, retirer, dupliquer", () => {
  it("met à jour les copies", async () => {
    const { gridArray, addToArray, removeFromArray, duplicateArray } = await import("../actions");
    const sq = (x: number) => shape([{ closed: true, pts: [[x, 0], [x + 5, 0], [x + 5, 5], [x, 5]] }]);
    const a = sq(0), b = sq(20);
    load([a, b], [a.id]);
    gridArray(3, 1, 1, 1);
    const copiesOf = () => getState().project.shapes.filter((s) => s.arrayCopy).length;
    expect(copiesOf()).toBe(2);
    setState({ selection: [a.id, b.id] });
    addToArray();
    expect(copiesOf()).toBe(4);
    setState({ selection: [b.id] });
    removeFromArray();
    expect(copiesOf()).toBe(2);
    setState({ selection: [a.id] });
    duplicateArray();
    expect(Object.keys(getState().project.arrays ?? {})).toHaveLength(2);
    expect(copiesOf()).toBe(4);
  });
});

describe("récupérer arcs et lignes", () => {
  it("un cercle aplati redevient quelques arcs, un carré quatre droites", async () => {
    const { recoverArcsAndLines } = await import("../shapeops");
    const { flattenBez } = await import("../bezier");
    const circle = { closed: true, pts: Array.from({ length: 128 }, (_, i): [number, number] => [10 * Math.cos((i / 128) * 2 * Math.PI), 10 * Math.sin((i / 128) * 2 * Math.PI)]) };
    const c = recoverArcsAndLines(circle, 0.01);
    expect(c.nodes.length).toBeLessThanOrEqual(6);
    for (const [x, y] of flattenBez([c], 0.005)[0].pts) expect(Math.hypot(x, y)).toBeCloseTo(10, 1);
    const square = { closed: true, pts: [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10], [0, 5]] as [number, number][] };
    const s = recoverArcsAndLines(square, 0.01);
    expect(s.nodes.length).toBe(4);
    expect(s.nodes.every((n) => !n.c1 && !n.c2)).toBe(true);
  });
});

describe("imbrication multi-pages", () => {
  it("place le surplus sur une nouvelle page, formes intérieures gardées avec leur plaque", async () => {
    const { nestSelection } = await import("../actions");
    const { pagesOf } = await import("../pages");
    const sqr = (x: number, s: number) => shape([{ closed: true, pts: [[x, 0], [x + s, 0], [x + s, s], [x, s]] }]);
    const plates = Array.from({ length: 6 }, (_, k) => sqr(k * 50, 45));
    const inner = sqr(5, 10); // dans la première plaque
    load([...plates, inner]);
    nestSelection(1, false, 0, true, true);
    const pages = pagesOf(getState().project);
    expect(pages).toHaveLength(2);
    expect(pages[0].shapes.length + pages[1].shapes.length).toBe(7);
    // La forme intérieure suit sa plaque.
    const plate0 = pages.flatMap((p) => p.shapes).find((s) => s.id === plates[0].id)!;
    const in0 = pages.flatMap((p) => p.shapes).find((s) => s.id === inner.id)!;
    expect(in0.matrix[4] - plate0.matrix[4]).toBeCloseTo(0);
    expect(pages[0].shapes.some((s) => s.id === inner.id)).toBe(pages[0].shapes.some((s) => s.id === plates[0].id));
  });
});
