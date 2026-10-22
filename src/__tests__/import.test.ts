import { describe, expect, it } from "vitest";
import { joinPaths, mul, apply, invert, rotateAbout, bedToMachine } from "../geometry";
import { parseDxf } from "../import/dxf";
import { parseHpgl } from "../import/hpgl";
import { expandVariables } from "../text";
import { flattenPath } from "../import/svgpath";
import { parseToolpath } from "../toolpath";
import { DEFAULT_MACHINE } from "../model";

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("flattenPath", () => {
  it("lit les commandes relatives et les sous-chemins", () => {
    const p = flattenPath("M10 10 h20 v20 h-20 z m40 0 l5 5", 1);
    expect(p).toHaveLength(2);
    expect(p[0].closed).toBe(true);
    expect(p[0].pts).toEqual([[10, 10], [30, 10], [30, 30], [10, 30]]);
    // Après « z », le point courant revient au début du sous-chemin.
    expect(p[1].pts).toEqual([[50, 10], [55, 15]]);
    expect(p[1].closed).toBe(false);
  });

  it("aplatit un arc avec drapeaux collés", () => {
    const [p] = flattenPath("M0 0 a10 10 0 0120 0", 0.5);
    const last = p.pts[p.pts.length - 1];
    close(last[0], 20);
    close(last[1], 0);
    // Demi-cercle de rayon 10 centré en (10, 0) : approximation cubique à 0,03 % près.
    for (const [x, y] of p.pts) close(Math.hypot(x - 10, y), 10, 0.003);
  });

  it("courbe cubique : extrémités exactes, erreur de corde bornée", () => {
    const [coarse] = flattenPath("M0,0 C0,10 10,10 10,0", 0.1);
    const [fine] = flattenPath("M0,0 C0,10 10,10 10,0", 0.001);
    expect(fine.pts[0]).toEqual([0, 0]);
    expect(fine.pts[fine.pts.length - 1]).toEqual([10, 0]);
    expect(fine.pts.length).toBeGreaterThan(coarse.pts.length * 5);
    // Sommet de la courbe : y(0,5) = 7,5.
    expect(Math.max(...fine.pts.map((q) => q[1]))).toBeCloseTo(7.5, 2);
  });

  it("M suivi de plusieurs coordonnées vaut M puis L", () => {
    const [p] = flattenPath("M0 0 10 0 10 10", 1);
    expect(p.pts).toEqual([[0, 0], [10, 0], [10, 10]]);
  });
});

function dxf(entities: string[][]): string {
  const body = entities.flat().join("\n");
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${body}\n0\nENDSEC\n0\nEOF\n`;
}

describe("parseDxf", () => {
  it("relie des LINE en un contour fermé et retourne l'axe Y", () => {
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      ["0", "LINE", "8", "0", "10", `${x1}`, "20", `${y1}`, "11", `${x2}`, "21", `${y2}`];
    const r = parseDxf(dxf([line(0, 0, 10, 0), line(10, 10, 10, 0), line(10, 10, 0, 10), line(0, 10, 0, 0)]));
    expect(r.groups[0].paths).toHaveLength(1);
    const p = r.groups[0].paths[0];
    expect(p.closed).toBe(true);
    expect(p.pts).toHaveLength(4);
    expect(p.pts.every(([, y]) => y <= 0)).toBe(true);
  });

  it("cercle et LWPOLYLINE avec bulge", () => {
    const r = parseDxf(dxf([
      ["0", "CIRCLE", "10", "5", "20", "5", "40", "2"],
      // Demi-cercle : bulge 1 entre (0,0) et (10,0).
      ["0", "LWPOLYLINE", "90", "2", "70", "0", "10", "0", "20", "0", "42", "1", "10", "10", "20", "0"],
    ]));
    const [circle, half] = r.groups[0].paths;
    expect(circle.closed).toBe(true);
    for (const [x, y] of circle.pts) close(Math.hypot(x - 5, y + 5), 2, 1e-9);
    for (const [x, y] of half.pts) close(Math.hypot(x - 5, y), 5, 1e-9);
  });

  it("rejette un fichier qui n'est pas un DXF", () => {
    expect(() => parseDxf("bonjour")).toThrow();
  });
});

describe("géométrie", () => {
  it("inverse et compose les matrices", () => {
    const m = mul(rotateAbout(30, [5, 5]), [2, 0, 0, 3, 1, 1]);
    const p = apply(invert(m), apply(m, [7, -2]));
    close(p[0], 7);
    close(p[1], -2);
  });

  it("joinPaths inverse les segments si besoin", () => {
    const r = joinPaths([
      { pts: [[0, 0], [1, 0]], closed: false },
      { pts: [[2, 0], [1, 0]], closed: false },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].pts).toHaveLength(3);
  });

  it("plateau ↔ machine est une involution", () => {
    for (const o of ["frontLeft", "rearLeft", "frontRight", "rearRight"] as const) {
      const p = bedToMachine(bedToMachine([12, 34], o, 400, 300), o, 400, 300);
      expect(p).toEqual([12, 34]);
    }
  });
});

describe("parseToolpath", () => {
  it("distingue découpes et déplacements", () => {
    const tp = parseToolpath("G90\nM4 S0\nG0 X10 Y390\nG1 X20 Y390 F1000 S500\nG1 X30 S0\nG0 X0 Y0\nM5", DEFAULT_MACHINE);
    expect(tp.count).toBe(4);
    expect(Array.from(tp.burn)).toEqual([0, 1, 0, 0]);
    // Y machine 390 → Y plateau 10 (origine avant gauche, plateau de 400).
    expect(Array.from(tp.segs.slice(4, 8))).toEqual([10, 10, 20, 10]);
  });
});


describe("HPGL", () => {
  it("lit PU/PD absolus et relatifs, 40 unités par mm, Y retourné", () => {
    const r = parseHpgl("IN;SP1;PU0,0;PD400,0,400,400;PR-400,0;PU;SP2;PA;PU0,0;PD40,40;");
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0].paths[0].pts).toEqual([[0, -0], [10, -0], [10, -10], [0, -10]]);
    expect(r.groups[1].paths[0].pts[1]).toEqual([1, -1]);
  });
});

describe("texte variable", () => {
  it("numéro de série, date et heure", () => {
    const d = new Date(2026, 9, 20, 9, 5);
    expect(expandVariables("Lot {n} – {date} {time}", { serial: 7, step: 1, digits: 4 }, d)).toBe("Lot 0007 – 20/10/2026 09:05");
  });
});

describe("fusion CSV", () => {
  it("lit point-virgule et guillemets, remplace les colonnes", async () => {
    const { parseCsv } = await import("../text");
    const csv = parseCsv('Prénom;Ville\n"Malo";"Nantes"\nAda;"Lon""don"\n');
    expect(csv.headers).toEqual(["Prénom", "Ville"]);
    expect(csv.rows[1]).toEqual(["Ada", 'Lon"don']);
    const vars = { serial: 1, step: 1, digits: 2, csv: { ...csv, row: 1 } };
    expect(expandVariables("{Prénom} de {Ville} n°{n}", vars)).toBe('Ada de Lon"don n°01');
  });
});
