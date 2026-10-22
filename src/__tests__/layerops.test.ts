import { describe, expect, it, vi } from "vitest";
import { rectPath } from "../geometry";
import { emptyProject, newLayer, type Shape } from "../model";
import { deleteLayer, invert, only, setAll } from "../layerops";
import { getState, loadProject, undo } from "../store";

vi.stubGlobal("window", new EventTarget());

describe("calques", () => {
  it("active, isole, inverse et supprime", () => {
    const shape = { id: "s", kind: "vector", name: "", layerId: 2, matrix: [1, 0, 0, 1, 0, 0], paths: [rectPath(0, 0, 1, 1)] } as Shape;
    loadProject({ ...emptyProject(), layers: [newLayer(0), newLayer(2), newLayer(5)], shapes: [shape] }, null);
    only("output", 2);
    expect(getState().project.layers.map((l) => l.output)).toEqual([false, true, false]);
    invert("output");
    expect(getState().project.layers.map((l) => l.output)).toEqual([true, false, true]);
    setAll("visible", false);
    expect(getState().project.layers.every((l) => !l.visible)).toBe(true);
    deleteLayer(2);
    expect(getState().project.layers.map((l) => l.id)).not.toContain(2);
    expect(getState().project.shapes).toHaveLength(0);
    undo();
    expect(getState().project.shapes).toHaveLength(1);
  });
});
