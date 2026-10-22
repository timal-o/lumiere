import { describe, expect, it, vi } from "vitest";
import { rectPath } from "../geometry";
import { emptyProject, type Shape } from "../model";
import { addPage, deletePage, duplicatePage, pagesOf, projectForSave, renamePage, switchPage } from "../pages";
import { getState, loadProject, pruneLayers, undo } from "../store";

vi.stubGlobal("window", new EventTarget());

const shape = (id: string, layerId = 0) => ({ id, kind: "vector", name: id, layerId, matrix: [1, 0, 0, 1, 0, 0], paths: [rectPath(0, 0, 1, 1)] }) as Shape;

describe("pages", () => {
  it("ajoute, change, duplique et supprime des pages", () => {
    loadProject({ ...emptyProject(), shapes: [shape("a")] }, null);
    addPage();
    expect(getState().project.page).toBe(1);
    expect(getState().project.shapes).toEqual([]);
    switchPage(0);
    expect(getState().project.shapes.map((s) => s.id)).toEqual(["a"]);
    duplicatePage();
    expect(pagesOf(getState().project)).toHaveLength(3);
    expect(getState().project.page).toBe(1);
    expect(getState().project.shapes[0].id).not.toBe("a");
    renamePage(1, "Dos");
    expect(pagesOf(getState().project)[1].name).toBe("Dos");
    deletePage(1);
    expect(pagesOf(getState().project)).toHaveLength(2);
    undo();
    expect(pagesOf(getState().project)).toHaveLength(3);
  });

  it("enregistre les formes de la page affichée, et rien de plus pour une seule page", () => {
    loadProject({ ...emptyProject(), shapes: [shape("a")] }, null);
    expect(projectForSave(getState().project).pages).toBeUndefined();
    addPage();
    const saved = projectForSave({ ...getState().project, shapes: [shape("b")] });
    expect(saved.pages!.map((p) => p.shapes.map((s) => s.id))).toEqual([["a"], ["b"]]);
  });

  it("garde les calques utilisés par une autre page", () => {
    const p = { ...emptyProject(), layers: [...emptyProject().layers, { ...emptyProject().layers[0], id: 3 }], shapes: [], pages: [{ name: "1", shapes: [shape("x", 3)] }, { name: "2", shapes: [] }], page: 1 };
    expect(pruneLayers(p, 0).layers.map((l) => l.id)).toContain(3);
  });
});

describe("pages : insérer, importer", () => {
  it("insère après la page courante et ajoute les pages d'un autre projet", async () => {
    const { insertPage, importPages, pagesOf, addPage, switchPage } = await import("../pages");
    const { loadProject, getState } = await import("../store");
    const { emptyProject, newLayer } = await import("../model");
    loadProject(emptyProject(), null);
    addPage();
    switchPage(0);
    insertPage();
    expect(getState().project.page).toBe(1);
    expect(pagesOf(getState().project)).toHaveLength(3);
    importPages({ ...emptyProject(), layers: [newLayer(0), newLayer(5)], shapes: [{ id: "x", kind: "vector", name: "", layerId: 5, matrix: [1, 0, 0, 1, 0, 0], paths: [] }] });
    expect(pagesOf(getState().project)).toHaveLength(4);
    expect(getState().project.shapes[0].layerId).toBe(5);
    expect(getState().project.layers.some((l) => l.id === 5)).toBe(true);
  });
});

describe("mise en page", () => {
  it("rectangle de la pièce selon son coin de référence", async () => {
    const { workpieceRect } = await import("../model");
    expect(workpieceRect({ w: 100, h: 50, anchor: "frontLeft" }, 400, 300)).toEqual({ x: 0, y: 250, w: 100, h: 50 });
    expect(workpieceRect({ w: 100, h: 50, anchor: "rearRight" }, 400, 300)).toEqual({ x: 300, y: 0, w: 100, h: 50 });
    expect(workpieceRect({ w: 100, h: 50, anchor: "center" }, 400, 300)).toEqual({ x: 150, y: 125, w: 100, h: 50 });
  });
});
