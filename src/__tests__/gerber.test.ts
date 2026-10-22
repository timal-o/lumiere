import { describe, expect, it } from "vitest";
import { pathsBox } from "../geometry";
import { parseExcellon, parseGerber } from "../import/gerber";

const area = (pts: [number, number][]) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
};

describe("Gerber", () => {
  it("piste, pastille et région, en mm", () => {
    const g = [
      "G04 Exemple G36 dans un commentaire*",
      "%FSLAX26Y26*%", "%MOMM*%",
      "%ADD10C,1.000000*%", "%ADD11R,2.000000X2.000000*%",
      "D10*", "X0Y0D02*", "X10000000Y0D01*", // piste de 10 mm, largeur 1 mm
      "D11*", "X20000000Y0D03*", // pastille carrée de 2 mm
      "G36*", "X0Y5000000D02*", "X5000000Y5000000D01*", "X5000000Y10000000D01*", "X0Y10000000D01*", "X0Y5000000D01*", "G37*",
      "M02*",
    ].join("\n");
    const r = parseGerber(g);
    const paths = r.groups[0].paths;
    expect(paths).toHaveLength(3);
    const box = pathsBox(paths)!;
    expect(box.x).toBeCloseTo(-0.5, 1);
    expect(box.w).toBeCloseTo(21.5, 1);
    // Y inversé : la région (Y 5–10 dans le fichier) est au-dessus de la piste.
    expect(box.y).toBeCloseTo(-10, 1);
    const areas = paths.map((p) => area(p.pts)).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(4, 1); // pastille 2 × 2
    expect(areas[2]).toBeCloseTo(25, 1); // région 5 × 5
  });

  it("polarité claire et macro d'ouverture", () => {
    const g = [
      "%FSLAX24Y24*%", "%MOMM*%",
      "%AMBOX*21,1,$1,$2,0,0,0*%", "%ADD12BOX,4X4*%", "%ADD13C,2*%",
      "D12*", "X0Y0D03*", "%LPC*%", "D13*", "X0Y0D03*", "M02*",
    ].join("\n");
    const p = parseGerber(g).groups[0].paths;
    const total = p.reduce((n, q) => n + area(q.pts), 0);
    // Carré 4 × 4 percé d'un trou de 2 mm : 16 − π (contours extérieur et trou comptés séparément).
    expect(p).toHaveLength(2);
    expect(area(p.sort((a, b) => area(b.pts) - area(a.pts))[0].pts) - area(p[1].pts)).toBeCloseTo(16 - Math.PI, 0);
    expect(total).toBeGreaterThan(16);
  });
});

describe("Excellon", () => {
  it("un cercle par trou, au diamètre de l'outil", () => {
    const r = parseExcellon(["M48", "METRIC", "T1C0.800", "%", "T1", "X1.000Y2.000", "X3.000Y2.000", "M30"].join("\n"));
    expect(r.groups[0].paths).toHaveLength(2);
    expect(pathsBox([r.groups[0].paths[0]])!.w).toBeCloseTo(0.8, 2);
  });
});
