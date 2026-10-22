import { describe, expect, it } from "vitest";
import { pathsBox } from "../geometry";
import { opsToImport, PDF_OPS } from "../import/pdf";

describe("import PDF", () => {
  it("suit la matrice, les couleurs et les tracés peints", () => {
    // Page de 100 pt de haut : (x, y) PDF → (x, 100 − y), puis une translation de 10 pt.
    const base: [number, number, number, number, number, number] = [1, 0, 0, -1, 0, 100];
    const square = Float32Array.from([0, 0, 0, 1, 20, 0, 1, 20, 20, 1, 0, 20, 4]);
    const fn = [PDF_OPS.save, PDF_OPS.transform, PDF_OPS.setStrokeRGBColor, PDF_OPS.constructPath, PDF_OPS.restore,
      PDF_OPS.constructPath, PDF_OPS.showText];
    const args = [[], [1, 0, 0, 1, 10, 10], ["#ff0000"], [PDF_OPS.stroke, [square], null], [], [PDF_OPS.endPath, [square], null], []];
    const r = opsToImport(fn, args, base);
    expect(r.groups).toHaveLength(1); // le tracé de découpe (endPath) n'est pas importé
    expect(r.groups[0].color).toBe("#ff0000");
    expect(r.groups[0].paths[0].closed).toBe(true);
    expect(pathsBox(r.groups[0].paths)).toMatchObject({ x: 10, y: 70, w: 20, h: 20 });
    expect(r.warnings).toHaveLength(1);
  });

  it("lit un vrai fichier PDF avec PDF.js", async () => {
    // PDF minimal : un carré tracé de 72 × 72 pt (25,4 mm).
    const content = "0 0 1 RG 10 10 72 72 re S";
    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new TextEncoder().encode(pdf) }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    const k = 25.4 / 72;
    const t = vp.transform;
    const r = opsToImport(ops.fnArray, ops.argsArray, [k * t[0], k * t[1], k * t[2], k * t[3], k * t[4], k * t[5]]);
    const box = pathsBox(r.groups.flatMap((g) => g.paths))!;
    expect(box.w).toBeCloseTo(25.4, 1);
    expect(box.h).toBeCloseTo(25.4, 1);
    expect(r.groups[0].color.toLowerCase()).toBe("#0000ff");
  });
});
