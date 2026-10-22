// EPS et anciens fichiers Illustrator (PostScript) : tracés vectoriels, un groupe par couleur.
//
// Petit interpréteur PostScript : nombres, opérateurs de tracé (PostScript et abréviations
// d'Illustrator), matrices (gsave, translate, scale, rotate, concat, cm), couleurs, et
// procédures simples définies par « /nom { … } def ». Textes et images sont ignorés.

import { flattenBez, type BezNode, type BezPath } from "../bezier";
import { apply, mul } from "../geometry";
import { t } from "../i18n";
import type { Mat, Pt } from "../model";
import type { ImportResult } from "./svg";

type Tok = { k: "num"; v: number } | { k: "name"; v: string } | { k: "lit"; v: string } | { k: "proc"; v: Tok[] } | { k: "other" };

function tokenize(src: string): Tok[] {
  const out: Tok[][] = [[]];
  const re = /%[^\n\r]*|\((?:\\.|[^\\)])*\)|<[0-9a-fA-F\s]*>|[{}[\]]|\/?[^\s()<>{}[\]/%]+/g;
  for (const m of src.matchAll(re)) {
    const s = m[0];
    const top = out[out.length - 1];
    if (s[0] === "%") continue;
    if (s === "{") out.push([]);
    else if (s === "}") {
      const body = out.pop()!;
      (out[out.length - 1] ?? out[0]).push({ k: "proc", v: body });
      if (!out.length) out.push([]);
    } else if (s[0] === "(" || s[0] === "<" || s === "[" || s === "]") top.push({ k: "other" });
    else if (s[0] === "/") top.push({ k: "lit", v: s.slice(1) });
    else if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) top.push({ k: "num", v: Number(s) });
    else top.push({ k: "name", v: s });
  }
  return out[0];
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
const cmyk = (c: number, m: number, y: number, k: number) => hex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));

/** Partie PostScript d'un EPS (les EPS « DOS » ont un en-tête binaire avec un aperçu). */
export function postscriptOf(data: ArrayBuffer): string {
  const dv = new DataView(data);
  if (data.byteLength > 30 && dv.getUint32(0, false) === 0xc5d0d3c6) {
    const start = dv.getUint32(4, true), len = dv.getUint32(8, true);
    return new TextDecoder("latin1").decode(new Uint8Array(data, start, len));
  }
  return new TextDecoder("latin1").decode(data);
}

export function parseEps(src: string): ImportResult {
  const bb = /%%(?:HiRes)?BoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/.exec(src);
  const [llx, , , ury] = bb ? bb.slice(1).map(Number) : [0, 0, 0, 842];
  const k = 25.4 / 72;
  // Points PostScript (Y vers le haut) → mm, Y vers le bas.
  const base: Mat = [k, 0, 0, -k, -llx * k, ury * k];
  type G = { m: Mat; stroke: string; fill: string };
  let g: G = { m: base, stroke: "#000000", fill: "#000000" };
  const gstack: G[] = [];
  const stack: number[] = [];
  const dict = new Map<string, Tok[] | number>();
  const byColor = new Map<string, BezPath[]>();
  let path: BezPath[] = [];
  let cur: BezNode[] = [];
  let pos: Pt = [0, 0];
  let start: Pt = [0, 0];
  let texts = 0, images = 0;
  const P = (x: number, y: number): Pt => apply(g.m, [x, y]);
  const flush = (closed: boolean) => {
    if (cur.length > 1) path.push({ nodes: cur, closed });
    cur = [];
  };
  const moveTo = (x: number, y: number) => {
    flush(false);
    pos = start = [x, y];
    cur = [{ p: P(x, y) }];
  };
  const lineTo = (x: number, y: number) => {
    if (!cur.length) cur = [{ p: P(...pos) }];
    pos = [x, y];
    cur.push({ p: P(x, y) });
  };
  const curveTo = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    if (!cur.length) cur = [{ p: P(...pos) }];
    cur[cur.length - 1].c2 = P(x1, y1);
    cur.push({ p: P(x3, y3), c1: P(x2, y2) });
    pos = [x3, y3];
  };
  const close = () => {
    if (cur.length > 2) {
      const a = cur[0].p, b = cur[cur.length - 1].p;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) {
        cur[0] = { ...cur[0], c1: cur[cur.length - 1].c1 };
        cur.pop();
      }
    }
    flush(true);
    pos = start;
  };
  const paint = (color: string | null) => {
    flush(false);
    if (color && path.length) byColor.set(color, [...(byColor.get(color) ?? []), ...path]);
    path = [];
  };
  const pop = (n: number) => (stack.length >= n ? stack.splice(stack.length - n, n) : null);
  const exec = (op: string, depth: number): void => {
    const def = dict.get(op);
    if (def !== undefined) {
      if (typeof def === "number") stack.push(def);
      else if (depth < 20) run(def, depth + 1);
      return;
    }
    let a: number[] | null;
    switch (op) {
      case "moveto": case "m": if ((a = pop(2))) moveTo(a[0], a[1]); return;
      case "lineto": case "l": case "L": if ((a = pop(2))) lineTo(a[0], a[1]); return;
      case "rmoveto": if ((a = pop(2))) moveTo(pos[0] + a[0], pos[1] + a[1]); return;
      case "rlineto": if ((a = pop(2))) lineTo(pos[0] + a[0], pos[1] + a[1]); return;
      case "curveto": case "c": case "C": if ((a = pop(6))) curveTo(a[0], a[1], a[2], a[3], a[4], a[5]); return;
      case "rcurveto": if ((a = pop(6))) curveTo(pos[0] + a[0], pos[1] + a[1], pos[0] + a[2], pos[1] + a[3], pos[0] + a[4], pos[1] + a[5]); return;
      case "v": case "V": if ((a = pop(4))) curveTo(pos[0], pos[1], a[0], a[1], a[2], a[3]); return;
      case "y": case "Y": if ((a = pop(4))) curveTo(a[0], a[1], a[2], a[3], a[2], a[3]); return;
      case "re": if ((a = pop(4))) { moveTo(a[0], a[1]); lineTo(a[0] + a[2], a[1]); lineTo(a[0] + a[2], a[1] + a[3]); lineTo(a[0], a[1] + a[3]); close(); } return;
      case "closepath": case "h": case "H": close(); return;
      case "newpath": case "n": case "N": flush(false); path = []; return;
      case "stroke": case "S": paint(g.stroke); return;
      case "s": close(); paint(g.stroke); return;
      case "fill": case "eofill": case "f": case "F": case "f*": paint(g.fill); return;
      case "b": case "b*": close(); paint(g.stroke); return;
      case "B": case "B*": paint(g.stroke); return;
      case "gsave": case "q": gstack.push({ ...g }); return;
      case "grestore": case "Q": g = gstack.pop() ?? g; return;
      case "translate": if ((a = pop(2))) g = { ...g, m: mul(g.m, [1, 0, 0, 1, a[0], a[1]]) }; return;
      case "scale": if ((a = pop(2))) g = { ...g, m: mul(g.m, [a[0], 0, 0, a[1], 0, 0]) }; return;
      case "rotate": if ((a = pop(1))) { const r = (a[0] * Math.PI) / 180; g = { ...g, m: mul(g.m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]) }; } return;
      case "concat": case "cm": if ((a = pop(6))) g = { ...g, m: mul(g.m, a as Mat) }; return;
      case "setrgbcolor": if ((a = pop(3))) g = { ...g, stroke: hex(a[0], a[1], a[2]), fill: hex(a[0], a[1], a[2]) }; return;
      case "RG": case "XA": if ((a = pop(3))) g = { ...g, stroke: hex(a[0], a[1], a[2]) }; return;
      case "rg": case "Xa": if ((a = pop(3))) g = { ...g, fill: hex(a[0], a[1], a[2]) }; return;
      case "setgray": if ((a = pop(1))) g = { ...g, stroke: hex(a[0], a[0], a[0]), fill: hex(a[0], a[0], a[0]) }; return;
      case "G": if ((a = pop(1))) g = { ...g, stroke: hex(a[0], a[0], a[0]) }; return;
      case "g": if ((a = pop(1))) g = { ...g, fill: hex(a[0], a[0], a[0]) }; return;
      case "setcmykcolor": if ((a = pop(4))) g = { ...g, stroke: cmyk(a[0], a[1], a[2], a[3]), fill: cmyk(a[0], a[1], a[2], a[3]) }; return;
      case "K": if ((a = pop(4))) g = { ...g, stroke: cmyk(a[0], a[1], a[2], a[3]) }; return;
      case "k": if ((a = pop(4))) g = { ...g, fill: cmyk(a[0], a[1], a[2], a[3]) }; return;
      case "show": case "ashow": case "widthshow": case "TJ": case "Tj": case "Tx": texts++; stack.length = 0; return;
      case "image": case "colorimage": case "imagemask": images++; stack.length = 0; return;
      case "pop": stack.pop(); return;
      case "exch": if (stack.length >= 2) stack.push(...(pop(2) as number[]).reverse()); return;
      case "dup": if (stack.length) stack.push(stack[stack.length - 1]); return;
      default: stack.length = 0; // opérateur inconnu : ses opérandes sont abandonnés
    }
  };
  const run = (toks: Tok[], depth: number) => {
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.k === "num") stack.push(tk.v);
      else if (tk.k === "name") exec(tk.v, depth);
      else if (tk.k === "lit") {
        // « /nom { … } def » ou « /nom 12 def » (éventuellement « bind def »).
        const next = toks[i + 1];
        const after = (j: number) => toks[j]?.k === "name" && ((toks[j] as { v: string }).v === "def" || ((toks[j] as { v: string }).v === "bind" && toks[j + 1]?.k === "name" && (toks[j + 1] as { v: string }).v === "def"));
        if (next?.k === "proc" && after(i + 2)) {
          dict.set(tk.v, next.v);
          i += (toks[i + 2] as { v: string }).v === "bind" ? 3 : 2;
        } else if (next?.k === "num" && after(i + 2)) {
          dict.set(tk.v, next.v);
          i += 2;
        }
      }
    }
  };
  run(tokenize(src), 0);
  paint(null);
  const groups = [...byColor].map(([color, curves]) => ({ color, curves, paths: flattenBez(curves, 0.02) }));
  const warnings: string[] = [];
  if (texts) warnings.push(t("EPS : {n} texte(s) ignoré(s) — convertissez-les en courbes avant l'export", { n: texts }));
  if (images) warnings.push(t("EPS : {n} image(s) ignorée(s)", { n: images }));
  return { groups, warnings };
}
