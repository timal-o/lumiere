// Import PDF : les tracés vectoriels de la première page, un groupe par couleur.
//
// PDF.js lit le fichier et donne la liste des opérateurs de dessin ; on suit la matrice
// courante (save/restore, transform, formulaires) et on garde les tracés peints (contour
// ou remplissage). Les textes et les images du PDF ne sont pas importés.

import { flattenBez, type BezNode, type BezPath } from "../bezier";
import { apply, mul } from "../geometry";
import { t } from "../i18n";
import type { Mat, Pt } from "../model";
import type { ImportedGroup, ImportResult } from "./svg";

/** Codes des opérateurs PDF.js utilisés ici (stables : `OPS` de pdfjs-dist). */
export const PDF_OPS = {
  save: 10, restore: 11, transform: 12,
  stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28,
  showText: 44, showSpacedText: 45, nextLineShowText: 46, nextLineSetSpacingShowText: 47,
  setStrokeGray: 56, setFillGray: 57, setStrokeRGBColor: 58, setFillRGBColor: 59, setStrokeCMYKColor: 60, setFillCMYKColor: 61,
  paintFormXObjectBegin: 74, paintFormXObjectEnd: 75,
  paintImageMaskXObject: 83, paintImageXObject: 85, paintInlineImageXObject: 86,
  constructPath: 91,
} as const;

/** Commandes des tracés de PDF.js (`DrawOPS`). */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

const MM_PER_PT = 25.4 / 72;
const TEXT_OPS = new Set<number>([PDF_OPS.showText, PDF_OPS.showSpacedText, PDF_OPS.nextLineShowText, PDF_OPS.nextLineSetSpacingShowText]);
const IMAGE_OPS = new Set<number>([PDF_OPS.paintImageMaskXObject, PDF_OPS.paintImageXObject, PDF_OPS.paintInlineImageXObject]);
const STROKES = new Set<number>([PDF_OPS.stroke, PDF_OPS.closeStroke, PDF_OPS.fillStroke, PDF_OPS.eoFillStroke, PDF_OPS.closeFillStroke, PDF_OPS.closeEOFillStroke]);
const FILLS = new Set<number>([PDF_OPS.fill, PDF_OPS.eoFill]);

const gray = (g: number) => {
  const v = Math.round(Math.max(0, Math.min(1, g)) * 255).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
};
const color = (args: unknown[]): string => (typeof args[0] === "string" ? args[0] : "#000000");

/** Tracés d'une commande `constructPath`, dans le repère de la matrice `m`. */
function drawOps(data: ArrayLike<number>, m: Mat): BezPath[] {
  const out: BezPath[] = [];
  let cur: BezNode[] = [];
  let last: Pt = [0, 0];
  const flush = (closed: boolean) => {
    if (cur.length > 1) out.push({ nodes: cur, closed });
    cur = [];
  };
  for (let i = 0; i < data.length;) {
    switch (data[i++]) {
      case DRAW.moveTo:
        flush(false);
        last = apply(m, [data[i++], data[i++]]);
        cur.push({ p: last });
        break;
      case DRAW.lineTo:
        last = apply(m, [data[i++], data[i++]]);
        cur.push({ p: last });
        break;
      case DRAW.curveTo: {
        const c1 = apply(m, [data[i++], data[i++]]), c2 = apply(m, [data[i++], data[i++]]);
        last = apply(m, [data[i++], data[i++]]);
        if (cur.length) cur[cur.length - 1].c2 = c1;
        cur.push({ p: last, c1: c2 });
        break;
      }
      case DRAW.quadraticCurveTo: {
        // Quadratique → cubique : poignées aux 2/3 vers le point de contrôle.
        const q = apply(m, [data[i++], data[i++]]), end = apply(m, [data[i++], data[i++]]);
        const k = 2 / 3;
        if (cur.length) cur[cur.length - 1].c2 = [last[0] + k * (q[0] - last[0]), last[1] + k * (q[1] - last[1])];
        cur.push({ p: end, c1: [end[0] + k * (q[0] - end[0]), end[1] + k * (q[1] - end[1])] });
        last = end;
        break;
      }
      case DRAW.closePath: {
        // Un dernier point confondu avec le premier est fusionné.
        if (cur.length > 2) {
          const [a, b] = [cur[0].p, cur[cur.length - 1].p];
          if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) {
            cur[0] = { ...cur[0], c1: cur[cur.length - 1].c1 };
            cur.pop();
          }
        }
        const start = cur[0]?.p;
        flush(true);
        if (start) last = start;
        break;
      }
      default:
        return out; // commande inconnue : on garde ce qui précède
    }
  }
  flush(false);
  return out;
}

/**
 * Interprète une liste d'opérateurs PDF.js. `base` convertit le repère de la page
 * (points, origine en bas à gauche) en millimètres, Y vers le bas.
 */
export function opsToImport(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, base: Mat): ImportResult {
  type State = { m: Mat; stroke: string; fill: string };
  let st: State = { m: base, stroke: "#000000", fill: "#000000" };
  const stack: State[] = [];
  const byColor = new Map<string, BezPath[]>();
  let pending: BezPath[] = [];
  let texts = 0, images = 0;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as unknown[];
    if (fn === PDF_OPS.save) stack.push({ ...st });
    else if (fn === PDF_OPS.restore) st = stack.pop() ?? st;
    else if (fn === PDF_OPS.transform) st = { ...st, m: mul(st.m, args as unknown as Mat) };
    else if (fn === PDF_OPS.paintFormXObjectBegin) {
      stack.push({ ...st });
      if (Array.isArray(args[0])) st = { ...st, m: mul(st.m, args[0] as Mat) };
    } else if (fn === PDF_OPS.paintFormXObjectEnd) st = stack.pop() ?? st;
    else if (fn === PDF_OPS.setStrokeRGBColor || fn === PDF_OPS.setStrokeCMYKColor) st = { ...st, stroke: color(args) };
    else if (fn === PDF_OPS.setFillRGBColor || fn === PDF_OPS.setFillCMYKColor) st = { ...st, fill: color(args) };
    else if (fn === PDF_OPS.setStrokeGray) st = { ...st, stroke: typeof args[0] === "number" ? gray(args[0]) : color(args) };
    else if (fn === PDF_OPS.setFillGray) st = { ...st, fill: typeof args[0] === "number" ? gray(args[0]) : color(args) };
    else if (TEXT_OPS.has(fn)) texts++;
    else if (IMAGE_OPS.has(fn)) images++;
    else if (fn === PDF_OPS.constructPath) {
      // [opérateur de peinture, [commandes], boîte]
      const [paint, data] = args as [number, ArrayLike<number>[] | ArrayLike<number>];
      const cmds = (Array.isArray(data) || ArrayBuffer.isView(data)) && typeof (data as ArrayLike<number>)[0] !== "number" ? (data as ArrayLike<number>[])[0] : (data as ArrayLike<number>);
      pending.push(...drawOps(cmds ?? [], st.m));
      if (typeof paint === "number" && paint !== PDF_OPS.endPath && pending.length) {
        const c = STROKES.has(paint) ? st.stroke : FILLS.has(paint) ? st.fill : st.stroke;
        byColor.set(c, [...(byColor.get(c) ?? []), ...pending]);
      }
      if (typeof paint === "number") pending = [];
    } else if (STROKES.has(fn) || FILLS.has(fn)) {
      // Anciennes versions : la peinture est un opérateur séparé.
      const c = STROKES.has(fn) ? st.stroke : st.fill;
      if (pending.length) byColor.set(c, [...(byColor.get(c) ?? []), ...pending]);
      pending = [];
    } else if (fn === PDF_OPS.endPath) pending = [];
  }
  const groups: ImportedGroup[] = [...byColor].map(([c, curves]) => ({ color: c, curves, paths: flattenBez(curves, 0.02) }));
  const warnings: string[] = [];
  if (texts) warnings.push(t("PDF : {n} texte(s) ignoré(s) — convertissez-les en courbes avant l'export", { n: texts }));
  if (images) warnings.push(t("PDF : {n} image(s) ignorée(s)", { n: images }));
  return { groups, warnings };
}

/** Lit la première page d'un PDF (PDF.js est chargé à la demande). */
export async function parsePdf(data: ArrayBuffer): Promise<ImportResult> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    // Repère de la page (points, Y vers le haut) → mm, Y vers le bas.
    const k = MM_PER_PT;
    const base = mul([k, 0, 0, k, 0, 0], viewport.transform as Mat);
    const ops = await page.getOperatorList();
    const result = opsToImport(ops.fnArray, ops.argsArray, base);
    if (doc.numPages > 1) result.warnings.push(t("PDF : seule la première page est importée ({n} pages)", { n: doc.numPages }));
    return result;
  } finally {
    await task.destroy();
  }
}
