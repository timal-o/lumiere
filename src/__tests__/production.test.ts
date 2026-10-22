import { describe, expect, it, vi } from "vitest";
import { similarity } from "../actions";
import { apply } from "../geometry";
import { axisValues, buildMaterialTest, DEFAULT_TEST } from "../materialTest";
import { DEFAULT_MACHINE } from "../model";

describe("grille de test", () => {
  it("valeurs des axes arrondies selon le paramètre", () => {
    expect(axisValues({ param: "power", min: 10, max: 100, steps: 4 })).toEqual([10, 40, 70, 100]);
    expect(axisValues({ param: "passes", min: 1, max: 2, steps: 3 })).toEqual([1, 2, 2]);
    expect(axisValues({ param: "interval", min: 0.05, max: 0.2, steps: 4 })).toEqual([0.05, 0.1, 0.15, 0.2]);
  });

  it("une passe par case, avec les deux paramètres appliqués", async () => {
    const o = { ...DEFAULT_TEST, labels: false, cols: { param: "interval" as const, min: 0.1, max: 0.2, steps: 2 }, rows: { param: "zOffset" as const, min: -1, max: 1, steps: 3 } };
    const job = await buildMaterialTest(o, DEFAULT_MACHINE);
    expect(job.layers).toHaveLength(6);
    expect(job.layers.map((l) => [l.interval, l.zOffset])).toEqual([[0.1, -1], [0.2, -1], [0.1, 0], [0.2, 0], [0.1, 1], [0.2, 1]]);
    expect(job.layers.every((l) => l.power === DEFAULT_TEST.base.power)).toBe(true);
  });
});

describe("imprimer et découper", () => {
  it("la similitude envoie les repères sur les mesures", () => {
    const m = similarity([10, 10], [110, 10], [20, 5], [20, 105]); // 90°, échelle 1
    const a = apply(m, [10, 10]), b = apply(m, [110, 10]), c = apply(m, [60, 10]);
    expect(a[0]).toBeCloseTo(20, 9);
    expect(a[1]).toBeCloseTo(5, 9);
    expect(b[0]).toBeCloseTo(20, 9);
    expect(b[1]).toBeCloseTo(105, 9);
    expect(c[1]).toBeCloseTo(55, 9);
  });
});

describe("étalonnage d'axe", () => {
  it("corrige les pas par mm", async () => {
    const { calibratedSteps } = await import("../ui/ProductionDialogs");
    expect(calibratedSteps(80, 100, 98)).toBeCloseTo(81.633, 3);
    expect(calibratedSteps(80, 100, 0)).toBe(80);
  });
});

describe("test de matériau : titre, bordure, préréglages", () => {
  it("ajoute une bordure découpée en dernier et réserve la place du titre", async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    const { buildMaterialTest, DEFAULT_TEST, testSize, saveTestPreset, userTestPresets, exportTestPresets, importTestPresets, deleteTestPreset } = await import("../materialTest");
    const { DEFAULT_MACHINE } = await import("../model");
    const o = { ...DEFAULT_TEST, labels: false, border: true, title: "Bouleau 3 mm" };
    const job = await buildMaterialTest(o, DEFAULT_MACHINE);
    expect(job.layers[job.layers.length - 1].name).toBe("Bordure");
    expect(testSize(o).h).toBeCloseTo(testSize({ ...o, title: undefined }).h + 6);
    saveTestPreset("mien", o);
    expect(userTestPresets().mien.title).toBe("Bouleau 3 mm");
    const json = exportTestPresets();
    deleteTestPreset("mien");
    expect(importTestPresets(json)).toBe(1);
    expect(userTestPresets().mien).toBeDefined();
  });
});

describe("bibliothèques d'art", () => {
  it("nouvelle bibliothèque, puis déchargement : retour à la précédente", async () => {
    const { newArtLibrary, unloadArtLibrary, addArt, exportArt } = await import("../artlib");
    const shape = { id: "s", kind: "vector" as const, name: "c", layerId: 0, matrix: [1, 0, 0, 1, 5, 5] as [number, number, number, number, number, number], paths: [{ closed: true, pts: [[0, 0], [2, 0], [2, 2]] as [number, number][] }] };
    const current = () => JSON.parse(exportArt()) as { name: string; items: unknown[] };
    addArt("un", [shape]);
    const first = current().items.length;
    newArtLibrary("Autre");
    expect(current().items).toHaveLength(0);
    addArt("deux", [shape]);
    expect(current().name).toBe("Autre");
    unloadArtLibrary(JSON.parse(localStorage.getItem("lumiere.artLibs")!).current);
    expect(current().items).toHaveLength(first);
  });
});

describe("profils", () => {
  it("enregistre, change et supprime des profils de préférences", async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
    });
    vi.stubGlobal("location", { reload: () => {} });
    const { saveProfile, switchProfile, profiles, currentProfile, deleteProfile } = await import("../files");
    mem.set("lumiere.devices", "A");
    saveProfile("Atelier");
    mem.set("lumiere.devices", "B");
    saveProfile("Maison");
    switchProfile("Atelier");
    expect(currentProfile()).toBe("Atelier");
    expect(mem.get("lumiere.devices")).toBe("A");
    expect(profiles().Maison["lumiere.devices"]).toBe("B");
    deleteProfile("Maison");
    expect(Object.keys(profiles())).toEqual(["Atelier"]);
  });
});
