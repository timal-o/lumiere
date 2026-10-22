import { describe, expect, it } from "vitest";
import { parseDxf } from "../import/dxf";
import { emptyProject, newLayer, type Project } from "../model";
import { exportDxf, exportPdf } from "../export/vectors";

const project: Project = {
  ...emptyProject(),
  layers: [newLayer(0), newLayer(2)],
  shapes: [
    { id: "a", kind: "vector", name: "carré", layerId: 0, matrix: [1, 0, 0, 1, 10, 20], paths: [{ closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]] }] },
    { id: "b", kind: "vector", name: "ligne", layerId: 2, matrix: [1, 0, 0, 1, 0, 0], paths: [{ closed: false, pts: [[0, 0], [5, 5]] }] },
  ],
};

describe("export vectoriel", () => {
  it("DXF relu par notre import, Y retourné", () => {
    const dxf = exportDxf(project, 100);
    expect(dxf).toContain("AC1009");
    const back = parseDxf(dxf);
    const all = back.groups.flatMap((g) => g.paths);
    expect(all).toHaveLength(2);
    const sq = all.find((p) => p.closed)!;
    const ys = sq.pts.map((p) => p[1]);
    // L'import DXF retourne Y : on retrouve la position d'origine (à une translation près selon l'import).
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10);
  });
  it("PDF valide avec une table xref", () => {
    const pdf = exportPdf(project, 100, 100, new Set(["a"]));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    expect((pdf.match(/ l /g) ?? []).length).toBe(3);
  });
});
