// Polices système et mise en forme du texte en tracés.

import { invoke } from "@tauri-apps/api/core";
import opentype from "opentype.js";
import { isTauri } from "./backend";
import { flattenPath } from "./import/svgpath";
import type { FontRef, Polyline, TextAlignY, TextShape } from "./model";
import { weld } from "./pathops";
import { parseShx, shxAsFont } from "./shx";
import { sampler } from "./tools";

let fontList: Promise<FontRef[]> | null = null;
const fonts = new Map<string, Promise<opentype.Font>>();
let shxDir = "";

/** Dossier des polices SHX (Paramètres) : ses polices s'ajoutent à la liste. */
export function setShxDir(dir: string) {
  if (dir === shxDir) return;
  shxDir = dir;
  fontList = null;
}

export const isShx = (f: FontRef) => /\.shx$/i.test(f.path);

export function listFonts(): Promise<FontRef[]> {
  if (!isTauri()) return Promise.resolve([]);
  fontList ??= Promise.all([
    invoke<FontRef[]>("list_fonts"),
    shxDir ? invoke<FontRef[]>("list_shx_fonts", { dir: shxDir }).catch(() => []) : Promise.resolve([]),
  ]).then(([system, shx]) => [...system, ...shx]);
  return fontList;
}

const fontKey = (f: FontRef) => `${f.path}#${f.index}`;

export function loadFont(ref: FontRef): Promise<opentype.Font> {
  const key = fontKey(ref);
  let p = fonts.get(key);
  if (!p) {
    p = invoke<ArrayBuffer>("read_font", { path: ref.path, index: ref.index }).then((buf) =>
      isShx(ref) ? (shxAsFont(parseShx(buf)) as unknown as opentype.Font) : opentype.parse(buf));
    p.catch(() => fonts.delete(key));
    fonts.set(key, p);
  }
  return p;
}

const PREFERRED = ["Arial", "Helvetica Neue", "Helvetica", "Roboto", "DejaVu Sans", "Liberation Sans"];

/** Police des nouveaux textes : celle choisie dans les Paramètres, sinon une police courante. */
export async function defaultFont(preferred = ""): Promise<FontRef | null> {
  const list = await listFonts();
  for (const family of [preferred, ...PREFERRED].filter(Boolean)) {
    const f = list.find((x) => x.family === family && /^(Regular|Normal|Book|Roman)$/i.test(x.style)) ?? list.find((x) => x.family === family);
    if (f) return f;
  }
  return list[0] ?? null;
}

// ------------------------------------------------------------ Texte variable

export interface TextVariables {
  /** Numéro de série courant, pas d'avance après chaque travail et nombre de chiffres. */
  serial: number;
  step: number;
  digits: number;
  /** Fusion CSV : chaque colonne devient {Nom de colonne} ; `row` avance avec le numéro. */
  csv?: { headers: string[]; rows: string[][]; row: number };
  /** Séquence : début, fin (le numéro revient au début après la fin ; 0 = sans fin), avance automatique après chaque travail. */
  start?: number;
  end?: number;
  autoAdvance?: boolean;
}

/** Variables après `k` pas en avant (ou en arrière si négatif) dans la séquence. */
export function stepVariables(v: TextVariables, k: number): TextVariables {
  let serial = v.serial + v.step * k;
  const start = v.start ?? 0;
  if (v.end && v.step > 0 && serial > v.end) serial = start + ((serial - start) % (v.end - start + v.step));
  if (v.end && v.step < 0 && serial < v.end) serial = start;
  const csv = v.csv && { ...v.csv, row: (((v.csv.row + k) % Math.max(1, v.csv.rows.length)) + v.csv.rows.length) % Math.max(1, v.csv.rows.length) };
  return { ...v, serial, csv };
}

/** Lecture CSV (séparateur virgule ou point-virgule, guillemets doubles). */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) rows.push(row);
      (row = []), (cell = "");
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  const [headers = [], ...data] = rows;
  return { headers: headers.map((h) => h.trim()), rows: data };
}

let variables: TextVariables = { serial: 1, step: 1, digits: 3 };

export function setTextVariables(v: TextVariables) {
  variables = v;
}

export const hasVariables = (text: string, v: TextVariables = variables) =>
  /\{(n|date|time)\}/.test(text) || !!v.csv?.headers.some((h) => text.includes(`{${h}}`));

/** Remplace {n} (numéro de série), {date} et {time} dans le texte. */
export function expandVariables(text: string, v: TextVariables = variables, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (v.csv?.rows.length) {
    const row = v.csv.rows[((v.csv.row % v.csv.rows.length) + v.csv.rows.length) % v.csv.rows.length];
    v.csv.headers.forEach((h, i) => {
      if (h) text = text.split(`{${h}}`).join(row[i] ?? "");
    });
  }
  return text
    .replace(/\{n\}/g, String(v.serial).padStart(v.digits, "0"))
    .replace(/\{date\}/g, `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`)
    .replace(/\{time\}/g, `${pad(now.getHours())}:${pad(now.getMinutes())}`);
}

export interface TextLayout {
  text: string;
  height: number;
  align: TextShape["align"];
  letterSpacing: number;
  lineSpacing: number;
  /**
   * Fusionne les glyphes (règle non nulle des polices) : les jonctions des lettres
   * cursives qui se chevauchent restent pleines au lieu de devenir des trous.
   */
  weld?: boolean;
  /** Texte sur un chemin (repère du texte) : chaque lettre suit la courbe, à partir de `offset` mm. */
  onPath?: { pts: [number, number][]; closed: boolean; offset: number; distort?: boolean };
  upperCase?: boolean;
  alignY?: TextAlignY;
  rtl?: boolean;
  maxWidth?: number;
  squeeze?: boolean;
  ignoreEmptyVars?: boolean;
  varOffset?: number;
  bend?: number;
}

/** Texte courbé en arc : l'abscisse devient un angle, l'ordonnée un rayon (centre sous ou au-dessus du texte). */
export function bendPaths(paths: Polyline[], bend: number): Polyline[] {
  const pts = paths.flatMap((p) => p.pts);
  if (!bend || !pts.length) return paths;
  const xs = pts.map((p) => p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), cx = (x0 + x1) / 2;
  const theta = (Math.max(-100, Math.min(100, bend)) / 100) * 2 * Math.PI;
  const r = (x1 - x0) / Math.abs(theta);
  if (!Number.isFinite(r) || r <= 0) return paths;
  return paths.map((p) => ({
    closed: p.closed,
    pts: densify(p.pts, p.closed, 0.25).map(([x, y]): [number, number] => {
      const a = (x - cx) / r;
      // Arc vers le haut : centre sous la ligne de base (Y vers le bas) ; vers le bas : au-dessus.
      return bend > 0 ? [cx + (r - y) * Math.sin(a), r - (r - y) * Math.cos(a)] : [cx + (r + y) * Math.sin(a), -r + (r + y) * Math.cos(a)];
    }),
  }));
}

/** Points intermédiaires : les segments longs se courbent avec le chemin. */
function densify(pts: [number, number][], closed: boolean, step: number): [number, number][] {
  const out: [number, number][] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed && pts.length) out.push(pts[pts.length - 1]);
  return out;
}

/** (x, y) du texte → point à l'abscisse `offset + x` du chemin, décalé de y sur la normale (tangente lissée). */
function bendAlong(pts: [number, number][], along: ReturnType<typeof sampler>, offset: number): [number, number][] {
  const h = 0.5;
  return pts.map(([x, y]) => {
    const s = offset + x;
    const p = along.at(s), a = along.at(s - h).p, b = along.at(s + h).p;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [tx, ty] = len > 1e-9 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [Math.cos((p.angle * Math.PI) / 180), Math.sin((p.angle * Math.PI) / 180)];
    return [p.p[0] - y * ty, p.p[1] + y * tx];
  });
}

/** Texte → polylignes. Origine : début de la ligne de base de la première ligne, Y vers le bas. */
export function layoutText(font: opentype.Font, o: TextLayout): Polyline[] {
  const upm = font.unitsPerEm;
  const os2 = font.tables.os2 as { sCapHeight?: number } | undefined;
  const cap = os2?.sCapHeight && os2.sCapHeight > 0 ? os2.sCapHeight : 0.7 * upm;
  const size = (o.height * upm) / cap;
  const k = size / upm;
  const out: Polyline[] = [];
  let text = o.upperCase ? o.text.toUpperCase() : o.text;
  // Droite à gauche (hébreu…) : chaque ligne est posée dans l'ordre inverse des caractères.
  if (o.rtl) text = text.split("\n").map((l) => Array.from(l).reverse().join("")).join("\n");
  const lines = text.split("\n");
  // Alignement vertical : décalage de toutes les lignes par rapport à l'origine.
  const last = (lines.length - 1) * o.height * o.lineSpacing;
  const dy = o.alignY === "top" ? o.height : o.alignY === "middle" ? (o.height - last) / 2 : o.alignY === "bottom" ? -last : 0;
  let widest = 0;

  lines.forEach((line, row) => {
    const glyphs = font.stringToGlyphs(line);
    const xs: number[] = [];
    let x = 0;
    glyphs.forEach((g, i) => {
      xs.push(x);
      x += (g.advanceWidth ?? 0) * k + o.letterSpacing;
      if (i + 1 < glyphs.length) x += font.getKerningValue(g, glyphs[i + 1]) * k;
    });
    const width = Math.max(0, x - o.letterSpacing);
    widest = Math.max(widest, width);
    const dx = o.align === "center" ? -width / 2 : o.align === "right" ? -width : 0;
    const y = row * o.height * o.lineSpacing + dy;
    const along = o.onPath && o.onPath.pts.length >= 2 ? sampler({ pts: o.onPath.pts, closed: o.onPath.closed }) : null;
    glyphs.forEach((g, i) => {
      const d = g.getPath(xs[i] + dx, y, size).toPathData(4);
      if (!d) return;
      const paths = flattenPath(d, 0.05);
      if (!along) return void out.push(...paths);
      if (o.onPath!.distort) {
        // Lettres déformées : chaque point suit la courbe (abscisse le long du chemin, ordonnée sur sa normale).
        out.push(...paths.map((p) => ({ closed: p.closed, pts: bendAlong(densify(p.pts, p.closed, 0.25), along, o.onPath!.offset) })));
        return;
      }
      // Sur un chemin : la lettre pivote autour du milieu de sa base, posée sur la courbe.
      const cx = xs[i] + (g.advanceWidth ?? 0) * k * 0.5;
      const at = along.at(o.onPath!.offset + cx + dx);
      const t = (at.angle * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
      out.push(...paths.map((p) => ({
        closed: p.closed,
        pts: p.pts.map(([px, py]): [number, number] => {
          const lx = px - (cx + dx), ly = py;
          return [at.p[0] + lx * cos - ly * sin, at.p[1] + lx * sin + ly * cos];
        }),
      })));
    });
  });
  // Largeur maximale : resserré horizontalement, ou réduit en entier, autour de l'origine.
  let result = out;
  if (o.maxWidth && o.maxWidth > 0 && widest > o.maxWidth && !o.onPath) {
    const s = o.maxWidth / widest, sy = o.squeeze === false ? s : 1;
    result = out.map((p) => ({ ...p, pts: p.pts.map(([px, py]): [number, number] => [px * s, py * sy]) }));
  }
  if (o.bend && !o.onPath) result = bendPaths(result, o.bend);
  return o.weld === false ? result : weld(result);
}

/** Texte affiché : variables remplacées (décalage propre au texte), lignes vides retirées si demandé. */
export function displayedText(shape: Pick<TextLayout, "text" | "ignoreEmptyVars" | "varOffset">, v: TextVariables = variables): string {
  const off = shape.varOffset ?? 0;
  const vars = off ? { ...v, serial: v.serial + off * v.step, csv: v.csv && { ...v.csv, row: v.csv.row + off } } : v;
  const lines = shape.text.split("\n").map((l) => ({ l, out: expandVariables(l, vars), vars: hasVariables(l, vars) }));
  return lines.filter((x) => !(shape.ignoreEmptyVars && x.vars && !x.out.trim())).map((x) => x.out).join("\n");
}

export async function textPaths(shape: TextLayout & { font: FontRef }): Promise<Polyline[]> {
  // Les polices SHX sont à trait simple : traits ouverts, rien à souder.
  return layoutText(await loadFont(shape.font), { ...shape, text: displayedText(shape), weld: isShx(shape.font) ? false : shape.weld });
}
