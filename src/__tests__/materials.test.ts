import { describe, expect, it } from "vitest";
import { syncLinks, type Preset } from "../materials";
import { newLayer } from "../model";

describe("syncLinks", () => {
  it("reprend les réglages des calques liés depuis la bibliothèque", () => {
    const base = newLayer(1);
    const preset: Preset = { id: "p1", material: "Bois", thickness: 3, description: "Découpe", settings: { ...base, speed: 321, power: 77 } as Preset["settings"] };
    const linked = { ...newLayer(2), libraryLink: { id: "p1", label: "ancien" } };
    const orphan = { ...newLayer(3), libraryLink: { id: "absent", label: "x" } };
    const [a, b, c] = syncLinks([base, linked, orphan], [preset]);
    expect(a).toEqual(base);
    expect(b.speed).toBe(321);
    expect(b.power).toBe(77);
    expect(b.id).toBe(2);
    expect(b.libraryLink).toEqual({ id: "p1", label: "Bois 3 mm — Découpe" });
    expect(c).toEqual(orphan);
  });
});

describe("fusion de bibliothèques", () => {
  it("règles en cas de doublon", async () => {
    const { mergePresets } = await import("../materials");
    const p = (id: string, description: string, power: number): Preset => ({ id, material: "Bois", thickness: 3, description, settings: { power } as Preset["settings"] });
    const mine = [p("a", "Découpe", 60)];
    const incoming = [p("b", "Découpe", 80), p("c", "Gravure", 20)];
    expect(mergePresets(mine, incoming, "keep").map((x) => x.settings.power)).toEqual([60, 20]);
    expect(mergePresets(mine, incoming, "replace").map((x) => [x.id, x.settings.power])).toEqual([["a", 80], ["c", 20]]);
    expect(mergePresets(mine, incoming, "renameNew").map((x) => x.description)).toEqual(["Découpe", "Découpe (nouveau)", "Gravure"]);
    expect(mergePresets(mine, incoming, "renameOld").map((x) => x.description)).toEqual(["Découpe (ancien)", "Découpe", "Gravure"]);
  });
});
