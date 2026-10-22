// Export des vecteurs : DXF (R12, ASCII) et PDF / AI (PDF compatible Illustrator).
// Les courbes sont aplaties en polylignes ; les images ne sont pas exportées.

import { flattenBez, transformBez } from "../bezier";
import { worldPaths } from "../geometry";
import { hasPaths, layerColor, type Polyline, type Project, type Shape } from "../model";

const f = (n: number) => String(Math.round(n * 10000) / 10000);

function exported(project: Project, only?: Set<string>): { shape: Shape; paths: Polyline[] }[] {
  const layers = new Set(project.layers.map((l) => l.id));
  return project.shapes
    .filter((s) => layers.has(s.layerId) && (!only || only.has(s.id)) && hasPaths(s))
    .map((s) => ({ shape: s, paths: s.kind === "vector" && s.curves ? flattenBez(transformBez(s.curves, s.matrix), 0.01) : worldPaths(s) }));
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Couleur AutoCAD (ACI) la plus proche parmi les 7 couleurs de base. */
function aci(hex: string): number {
  const [r, g, b] = rgb(hex);
  const base: [number, number[]][] = [[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [0, 0, 0]]];
  let best = 7, bestD = Infinity;
  for (const [c, v] of base) {
    const d = (v[0] - r) ** 2 + (v[1] - g) ** 2 + (v[2] - b) ** 2;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return best;
}

/** DXF R12 en millimètres (Y vers le haut), un calque DXF par calque du projet. */
export function exportDxf(project: Project, bedHeight: number, only?: Set<string>): string {
  const items = exported(project, only);
  const name = (id: number) => (project.layers.find((l) => l.id === id)?.name ?? `C${id}`).replace(/[<>/\\":;?*|=,]/g, "_");
  const used = [...new Set(items.map((i) => i.shape.layerId))];
  const out: (string | number)[] = [
    0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSUNITS", 70, 4, 0, "ENDSEC",
    0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "LAYER", 70, used.length,
  ];
  for (const id of used) out.push(0, "LAYER", 2, name(id), 70, 0, 62, aci(layerColor(id)), 6, "CONTINUOUS");
  out.push(0, "ENDTAB", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES");
  for (const { shape, paths } of items) {
    for (const p of paths) {
      if (p.pts.length < 2) continue;
      out.push(0, "POLYLINE", 8, name(shape.layerId), 66, 1, 10, 0, 20, 0, 30, 0, 70, p.closed ? 1 : 0);
      for (const [x, y] of p.pts) out.push(0, "VERTEX", 8, name(shape.layerId), 10, f(x), 20, f(bedHeight - y), 30, 0);
      out.push(0, "SEQEND", 8, name(shape.layerId));
    }
  }
  out.push(0, "ENDSEC", 0, "EOF");
  const lines: string[] = [];
  for (let i = 0; i < out.length; i += 2) lines.push(String(out[i]).padStart(3), String(out[i + 1]));
  return lines.join("\r\n") + "\r\n";
}

/** PDF d'une page à la taille du plateau, traits fins à la couleur des calques (s'ouvre aussi comme .ai). */
export function exportPdf(project: Project, bedWidth: number, bedHeight: number, only?: Set<string>): string {
  const k = 72 / 25.4;
  const ops: string[] = ["0.283 w", "1 J", "1 j"];
  for (const { shape, paths } of exported(project, only)) {
    const [r, g, b] = rgb(layerColor(shape.layerId)).map((v) => (v / 255).toFixed(3));
    ops.push(`${r} ${g} ${b} RG`);
    for (const p of paths) {
      if (p.pts.length < 2) continue;
      ops.push(p.pts.map(([x, y], i) => `${f(x * k)} ${f((bedHeight - y) * k)} ${i ? "l" : "m"}`).join(" ") + (p.closed ? " h S" : " S"));
    }
  }
  const content = ops.join("\n");
  const W = f(bedWidth * k), H = f(bedHeight * k);
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`,
    "<< /Producer (Lumiere) >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
