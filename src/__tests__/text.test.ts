import { existsSync, readFileSync } from "node:fs";
import opentype from "opentype.js";
import { describe, expect, it } from "vitest";
import { pathsBox } from "../geometry";
import { layoutText } from "../text";

const ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf";

// Police système de macOS : la suite est ignorée ailleurs (CI Linux, Windows).
const HAS_ARIAL = existsSync(ARIAL);

function loadArial(): opentype.Font {
  const buf = readFileSync(ARIAL);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

describe.skipIf(!HAS_ARIAL)("layoutText", () => {
  // Lue seulement si la suite s'exécute : la collecte des tests a lieu même quand elle est ignorée.
  const font = HAS_ARIAL ? loadArial() : (null as unknown as opentype.Font);
  const base = { height: 10, align: "left" as const, letterSpacing: 0, lineSpacing: 1.5 };

  it("la hauteur des capitales vaut la hauteur demandée", () => {
    const b = pathsBox(layoutText(font, { ...base, text: "H" }))!;
    expect(b.h).toBeCloseTo(10, 1);
    expect(b.y + b.h).toBeCloseTo(0, 1); // posé sur la ligne de base
  });

  it("centrage, interlettre et lignes multiples", () => {
    const centered = pathsBox(layoutText(font, { ...base, text: "HHH", align: "center" }))!;
    expect(centered.x + centered.w / 2).toBeCloseTo(0, 0);
    const tight = pathsBox(layoutText(font, { ...base, text: "HH" }))!;
    const wide = pathsBox(layoutText(font, { ...base, text: "HH", letterSpacing: 5 }))!;
    expect(wide.w - tight.w).toBeCloseTo(5, 3);
    const two = pathsBox(layoutText(font, { ...base, text: "H\nH" }))!;
    expect(two.h).toBeCloseTo(25, 1);
  });

  it("les lettres qui se chevauchent sont soudées, sans trou à la jonction", () => {
    // Interlettre négatif : les deux H se recouvrent.
    const overlap = { ...base, text: "HH", letterSpacing: -4 };
    expect(layoutText(font, { ...overlap, weld: false }).length).toBe(2);
    const welded = layoutText(font, overlap);
    expect(welded.length).toBe(1);
  });

  it("la soudure garde les contre-formes (e, o, a)", () => {
    expect(layoutText(font, { ...base, text: "oe", letterSpacing: -2 }).length).toBe(3); // 1 contour + 2 trous
  });

  it("les contours intérieurs (O) sont conservés", () => {
    expect(layoutText(font, { ...base, text: "O" }).length).toBe(2);
  });

  it("texte sur un cercle : les lettres suivent le chemin", () => {
    const n = 64;
    const circle = Array.from({ length: n }, (_, i): [number, number] => [50 + 40 * Math.cos((i / n) * 2 * Math.PI), 50 + 40 * Math.sin((i / n) * 2 * Math.PI)]);
    const paths = layoutText(font, { ...base, text: "HHHH", onPath: { pts: circle, closed: true, offset: 0 } });
    // Les lettres sont posées sur le cercle, côté extérieur : rayon de 40 à 40 + hauteur.
    for (const p of paths) for (const [x, y] of p.pts) {
      const r = Math.hypot(x - 50, y - 50);
      expect(r).toBeGreaterThan(40 - 0.5);
      expect(r).toBeLessThan(40 + 10.5);
    }
  });

  it("texte déformé : la base des lettres épouse le cercle", () => {
    const n = 256;
    const circle = Array.from({ length: n }, (_, i): [number, number] => [50 + 40 * Math.cos((i / n) * 2 * Math.PI), 50 + 40 * Math.sin((i / n) * 2 * Math.PI)]);
    const radii = (distort: boolean) => layoutText(font, { ...base, text: "HHHH", weld: false, onPath: { pts: circle, closed: true, offset: 0, distort } })
      .flatMap((p) => p.pts.map(([x, y]) => Math.hypot(x - 50, y - 50)));
    const bent = radii(true);
    expect(Math.min(...bent)).toBeGreaterThan(39.9);
    expect(Math.max(...bent)).toBeLessThan(40 + 10.5);
  });
});

describe("options de texte", () => {
  it("décale les variables et retire les lignes vides", async () => {
    const { displayedText } = await import("../text");
    const v = { serial: 5, step: 2, digits: 2 };
    expect(displayedText({ text: "N° {n}", varOffset: 1 }, v)).toBe("N° 07");
    const csv = { ...v, csv: { headers: ["nom", "ville"], rows: [["Ana", ""]], row: 0 } };
    expect(displayedText({ text: "{nom}\n{ville}\nfin", ignoreEmptyVars: true }, csv)).toBe("Ana\nfin");
    expect(displayedText({ text: "{nom}\n{ville}\nfin" }, csv)).toBe("Ana\n\nfin");
  });
});

describe("séquence du texte variable", () => {
  it("avance, revient au début après la fin, recule", async () => {
    const { stepVariables } = await import("../text");
    const v = { serial: 9, step: 1, digits: 2, start: 1, end: 10 };
    expect(stepVariables(v, 1).serial).toBe(10);
    expect(stepVariables({ ...v, serial: 10 }, 1).serial).toBe(1);
    expect(stepVariables(v, -2).serial).toBe(7);
    const csv = { ...v, csv: { headers: ["a"], rows: [["1"], ["2"]], row: 1 } };
    expect(stepVariables(csv, 1).csv!.row).toBe(0);
    expect(stepVariables(csv, -3).csv!.row).toBe(0);
  });
});

describe("texte courbé", () => {
  it("50 % : demi-cercle en arche, longueur conservée", async () => {
    const { bendPaths } = await import("../text");
    const line = [{ closed: false, pts: [[0, 0], [10, 0]] as [number, number][] }];
    const up = bendPaths(line, 50)[0].pts;
    const r = 10 / Math.PI;
    expect(up[0][1]).toBeCloseTo(r, 3); // extrémités plus bas que le milieu (Y vers le bas)
    expect(Math.min(...up.map((p) => p[1]))).toBeCloseTo(0, 3);
    const down = bendPaths(line, -50)[0].pts;
    expect(down[0][1]).toBeCloseTo(-r, 3);
    expect(bendPaths(line, 0)).toBe(line);
  });
});
