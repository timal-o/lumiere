// Import de circuits imprimés : Gerber RS-274X (cuivre, sérigraphie, vernis, contour) et
// perçages Excellon. Le Gerber devient des contours pleins (à graver en Remplissage) ;
// les perçages, des cercles.

import { ellipseBez, flattenBez, type BezPath } from "../bezier";
import { t } from "../i18n";
import type { Polyline, Pt } from "../model";
import { booleanOp, offsetPaths } from "../pathops";
import type { ImportResult } from "./svg";

const CIRCLE_SEGMENTS = 32;

function circle(c: Pt, d: number, n = CIRCLE_SEGMENTS): Polyline {
  return { closed: true, pts: Array.from({ length: n }, (_, i): Pt => [c[0] + (d / 2) * Math.cos((2 * Math.PI * i) / n), c[1] + (d / 2) * Math.sin((2 * Math.PI * i) / n)]) };
}

function rect(c: Pt, w: number, h: number): Polyline {
  return { closed: true, pts: [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]] };
}

function obround(c: Pt, w: number, h: number): Polyline {
  // Rectangle aux extrémités arrondies sur le petit côté.
  const r = Math.min(w, h) / 2;
  const pts: Pt[] = [];
  const half = 16;
  const arc = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= half; i++) {
      const a = from + (Math.PI * i) / half;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  if (w >= h) {
    arc(c[0] + w / 2 - r, c[1], -Math.PI / 2);
    arc(c[0] - w / 2 + r, c[1], Math.PI / 2);
  } else {
    arc(c[0], c[1] + h / 2 - r, 0);
    arc(c[0], c[1] - h / 2 + r, Math.PI);
  }
  return { closed: true, pts };
}

function regularPolygon(c: Pt, d: number, n: number, rotDeg: number): Polyline {
  const a0 = (rotDeg * Math.PI) / 180;
  return { closed: true, pts: Array.from({ length: Math.max(3, Math.round(n)) }, (_, i): Pt => [c[0] + (d / 2) * Math.cos(a0 + (2 * Math.PI * i) / n), c[1] + (d / 2) * Math.sin(a0 + (2 * Math.PI * i) / n)]) };
}

const rotate = ([x, y]: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};

/** Expression d'une macro d'ouverture ($1, +, -, x, /, parenthèses). */
function evaluate(expr: string, vars: Map<number, number>): number {
  const src = expr.replace(/\$(\d+)/g, (_, n) => String(vars.get(Number(n)) ?? 0)).replace(/x/gi, "*");
  if (!/^[\d.+\-*/() eE]*$/.test(src)) return 0;
  // Analyse descendante simple (pas d'eval).
  let i = 0;
  const peek = () => src[i];
  const skip = () => { while (src[i] === " ") i++; };
  const num = (): number => {
    skip();
    if (peek() === "(") {
      i++;
      const v = sum();
      skip();
      i++;
      return v;
    }
    if (peek() === "-") return i++, -num();
    if (peek() === "+") return i++, num();
    const m = /^[\d.]+(?:[eE][-+]?\d+)?/.exec(src.slice(i));
    if (!m) return 0;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const prod = (): number => {
    let v = num();
    for (skip(); peek() === "*" || peek() === "/"; skip()) v = src[i++] === "*" ? v * num() : v / (num() || 1);
    return v;
  };
  const sum = (): number => {
    let v = prod();
    for (skip(); peek() === "+" || peek() === "-"; skip()) v = src[i++] === "+" ? v + prod() : v - prod();
    return v;
  };
  return sum();
}

type Aperture = (at: Pt) => Polyline[];

/** Forme d'une macro d'ouverture (primitives cercle, contour, polygone, lignes). */
function macroAperture(body: string[], params: number[]): Aperture {
  return (at) => {
    const vars = new Map(params.map((v, i) => [i + 1, v]));
    const dark: Polyline[] = [];
    const clear: Polyline[] = [];
    for (const raw of body) {
      const line = raw.trim();
      if (!line || line.startsWith("0")) continue; // commentaire
      const assign = /^\$(\d+)=(.+)$/.exec(line);
      if (assign) {
        vars.set(Number(assign[1]), evaluate(assign[2], vars));
        continue;
      }
      const v = line.split(",").map((x) => evaluate(x, vars));
      const [code, exposure] = v;
      const out = exposure === 0 ? clear : dark;
      const place = (p: Polyline, rot = 0): Polyline => ({ closed: true, pts: p.pts.map((q) => { const r = rotate(q, rot); return [at[0] + r[0], at[1] + r[1]]; }) });
      if (code === 1) out.push(place(circle([v[3], v[4]], v[2]), v[5] ?? 0));
      else if (code === 21) out.push(place(rect([v[4], v[5]], v[2], v[3]), v[6] ?? 0));
      else if (code === 22) out.push(place(rect([v[4] + v[2] / 2, v[5] + v[3] / 2], v[2], v[3]), v[6] ?? 0));
      else if (code === 20) {
        // Ligne épaisse entre deux points.
        const [w, x1, y1, x2, y2, rot] = [v[2], v[3], v[4], v[5], v[6], v[7] ?? 0];
        const d = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (-(y2 - y1) / d) * (w / 2), ny = ((x2 - x1) / d) * (w / 2);
        out.push(place({ closed: true, pts: [[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]] }, rot));
      } else if (code === 4) {
        const n = v[2];
        const pts: Pt[] = [];
        for (let k = 0; k <= n; k++) pts.push([v[3 + 2 * k], v[4 + 2 * k]]);
        out.push(place({ closed: true, pts }, v[5 + 2 * n] ?? 0));
      } else if (code === 5) out.push(place(regularPolygon([v[3], v[4]], v[5], v[2], 0), v[6] ?? 0));
      else if (code === 7) {
        // Thermique : anneau (sans les entretoises, approximation).
        const [cx, cy, outer, inner] = [v[2], v[3], v[4], v[5]];
        dark.push(place(circle([cx, cy], outer), 0));
        clear.push(place(circle([cx, cy], inner), 0));
      }
    }
    if (!clear.length) return dark;
    return booleanOp("difference", [booleanOp("union", dark.map((p) => [p])), ...clear.map((p) => [p])]);
  };
}

/** Lit un fichier Gerber RS-274X : contours pleins (Y vers le bas, en mm). */
export function parseGerber(text: string): ImportResult {
  const warnings: string[] = [];
  let unit = 1; // mm par unité du fichier
  let intX = 2, decX = 4, intY = 2, decY = 4;
  let trailingZeros = false;
  const apertures = new Map<number, { shape: Aperture; width: number }>();
  const macros = new Map<string, string[]>();
  let current: { shape: Aperture; width: number } | null = null;
  let pos: Pt = [0, 0];
  let interp = 1; // 1 linéaire, 2 horaire, 3 antihoraire
  let inRegion = false;
  let region: Pt[] = [];
  const regions: Polyline[] = [];
  // Calques successifs de polarité (sombre / clair).
  const layers: { dark: boolean; shapes: Polyline[]; strokes: { path: Pt[]; width: number }[] }[] = [{ dark: true, shapes: [], strokes: [] }];
  const layer = () => layers[layers.length - 1];
  let negative = false;

  const coord = (v: string | undefined, int: number, dec: number): number | undefined => {
    if (v === undefined) return undefined;
    if (v.includes(".")) return parseFloat(v) * unit;
    const neg = v.startsWith("-");
    let d = v.replace(/^[-+]/, "");
    if (trailingZeros) d = d.padEnd(int + dec, "0");
    const n = parseInt(d, 10) / 10 ** dec;
    return (neg ? -n : n) * unit;
  };

  // Blocs « %…% » (paramètres) et commandes « …* ».
  const tokens = text.replace(/\r/g, "").match(/%[^%]*%|[^*%]+\*/g) ?? [];
  for (const raw of tokens) {
    const tok = raw.trim();
    if (tok.startsWith("%")) {
      const body = tok.slice(1, -1).trim();
      const fs = /^FS([LTD])?A?X(\d)(\d)Y(\d)(\d)/.exec(body);
      if (fs) {
        trailingZeros = fs[1] === "T";
        [intX, decX, intY, decY] = [+fs[2], +fs[3], +fs[4], +fs[5]];
      } else if (body.startsWith("MOIN")) unit = 25.4;
      else if (body.startsWith("MOMM")) unit = 1;
      else if (body.startsWith("IPNEG")) negative = true;
      else if (body.startsWith("LPC")) layers.push({ dark: false, shapes: [], strokes: [] });
      else if (body.startsWith("LPD")) layers.push({ dark: true, shapes: [], strokes: [] });
      else if (body.startsWith("AM")) {
        const [head, ...rest] = body.split("*");
        macros.set(head.slice(2).trim(), rest);
      } else if (body.startsWith("AD")) {
        const m = /^ADD(\d+)([A-Za-z_.$][\w.$-]*),?([^*]*)/.exec(body);
        if (!m) continue;
        const id = +m[1], kind = m[2], p = m[3] ? m[3].split("X").map((x) => parseFloat(x) * unit) : [];
        // Les paramètres des macros ne sont pas des longueurs en mm pour les rotations : on garde les valeurs brutes.
        const rawParams = m[3] ? m[3].split("X").map(parseFloat) : [];
        let shape: Aperture;
        if (kind === "C") shape = (at) => [circle(at, p[0] || 0.01)];
        else if (kind === "R") shape = (at) => [rect(at, p[0], p[1] ?? p[0])];
        else if (kind === "O") shape = (at) => [obround(at, p[0], p[1] ?? p[0])];
        else if (kind === "P") shape = (at) => [regularPolygon(at, p[0], rawParams[1] ?? 6, rawParams[2] ?? 0)];
        else if (macros.has(kind)) {
          const mac = macroAperture(macros.get(kind)!, rawParams);
          // Les macros s'expriment dans l'unité du fichier : mise à l'échelle autour du point.
          shape = (at) => mac([0, 0]).map((q) => ({ ...q, pts: q.pts.map(([x, y]): Pt => [at[0] + x * unit, at[1] + y * unit]) }));
        } else {
          warnings.push(t("Gerber : ouverture « {name} » inconnue", { name: kind }));
          shape = (at) => [circle(at, 0.1)];
        }
        apertures.set(id, { shape, width: kind === "C" ? p[0] || 0 : Math.min(p[0] ?? 0, p[1] ?? p[0] ?? 0) });
      }
      continue;
    }
    let cmd = tok.slice(0, -1).trim();
    if (!cmd || /^G0*4\b/.test(cmd) || cmd.startsWith("M02")) continue; // commentaire, fin
    for (const g of cmd.matchAll(/G0*(\d+)/g)) {
      const n = +g[1];
      if (n >= 1 && n <= 3) interp = n;
      else if (n === 36) (inRegion = true), (region = []);
      else if (n === 37) {
        if (region.length >= 3) regions.push({ closed: true, pts: region });
        layer().shapes.push(...regions.splice(0));
        inRegion = false;
        region = [];
      }
    }
    const sel = /^(?:G54)?D(\d+)$/.exec(cmd);
    if (sel && +sel[1] >= 10) {
      current = apertures.get(+sel[1]) ?? null;
      continue;
    }
    const xy = /X([-+]?[\d.]+)|Y([-+]?[\d.]+)|I([-+]?[\d.]+)|J([-+]?[\d.]+)|D0*([123])\b/g;
    let x: number | undefined, y: number | undefined, i = 0, j = 0, d: number | undefined;
    cmd = cmd.replace(/G0*\d+/g, "");
    for (const m of cmd.matchAll(xy)) {
      if (m[1] !== undefined) x = coord(m[1], intX, decX);
      if (m[2] !== undefined) y = coord(m[2], intY, decY);
      if (m[3] !== undefined) i = coord(m[3], intX, decX) ?? 0;
      if (m[4] !== undefined) j = coord(m[4], intY, decY) ?? 0;
      if (m[5] !== undefined) d = +m[5];
    }
    if (x === undefined && y === undefined && d === undefined) continue;
    const target: Pt = [x ?? pos[0], y ?? pos[1]];
    d ??= 1;
    if (d === 2) {
      if (inRegion && region.length >= 3) regions.push({ closed: true, pts: region });
      region = inRegion ? [target] : [];
    } else if (d === 1) {
      // Ligne ou arc (multi-quadrant).
      let pts: Pt[] = [target];
      if (interp !== 1) {
        const c: Pt = [pos[0] + i, pos[1] + j];
        const r = Math.hypot(pos[0] - c[0], pos[1] - c[1]);
        let a0 = Math.atan2(pos[1] - c[1], pos[0] - c[0]), a1 = Math.atan2(target[1] - c[1], target[0] - c[0]);
        if (interp === 3 && a1 <= a0) a1 += 2 * Math.PI;
        if (interp === 2 && a1 >= a0) a1 -= 2 * Math.PI;
        const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 32)));
        pts = Array.from({ length: n }, (_, k): Pt => [c[0] + r * Math.cos(a0 + ((a1 - a0) * (k + 1)) / n), c[1] + r * Math.sin(a0 + ((a1 - a0) * (k + 1)) / n)]);
      }
      if (inRegion) {
        if (!region.length) region.push(pos);
        region.push(...pts);
      } else if (current) layer().strokes.push({ path: [pos, ...pts], width: current.width });
    } else if (d === 3 && current) layer().shapes.push(...current.shape(target));
    pos = target;
  }

  // Assemblage : chaque calque sombre s'ajoute, chaque calque clair se retire.
  let acc: Polyline[] = [];
  for (const l of layers) {
    const widths = new Map<number, Pt[][]>();
    for (const s of l.strokes) widths.set(s.width, [...(widths.get(s.width) ?? []), s.path]);
    const parts = [...l.shapes];
    for (const [w, paths] of widths) parts.push(...offsetPaths(paths.map((pts) => ({ closed: false, pts })), Math.max(w, 0.01) / 2));
    if (!parts.length) continue;
    const merged = booleanOp("union", parts.map((p) => [p]));
    acc = l.dark ? booleanOp("union", [acc, merged].filter((x) => x.length)) : booleanOp("difference", [acc, merged]);
  }
  if (negative) warnings.push(t("Gerber : fichier en polarité négative (il décrit où le cuivre est absent)"));
  // Y vers le haut dans le Gerber, vers le bas dans Lumière.
  const paths = acc.map((p) => ({ ...p, pts: p.pts.map(([px, py]): Pt => [px, -py]) }));
  return { groups: paths.length ? [{ color: "#c87533", paths }] : [], warnings };
}

/** Lit un fichier de perçage Excellon : un cercle par trou. */
export function parseExcellon(text: string): ImportResult {
  let unit = 25.4, decimals = 4; // par défaut : pouces, format 2.4
  const tools = new Map<number, number>();
  let tool = 0;
  const holes: BezPath[] = [];
  let last: Pt = [0, 0];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim().toUpperCase();
    if (!line || line.startsWith(";")) continue;
    if (line.startsWith("METRIC")) (unit = 1), (decimals = 3);
    else if (line.startsWith("INCH")) (unit = 25.4), (decimals = 4);
    else if (line.startsWith("M71")) (unit = 1), (decimals = 3);
    else if (line.startsWith("M72")) (unit = 25.4), (decimals = 4);
    const def = /^T(\d+).*C([\d.]+)/.exec(line);
    if (def) {
      tools.set(+def[1], parseFloat(def[2]) * unit);
      continue;
    }
    const sel = /^T(\d+)$/.exec(line);
    if (sel) {
      tool = +sel[1];
      continue;
    }
    const m = /^(?:G\d+)?X([-+]?[\d.]+)?Y([-+]?[\d.]+)?|^Y([-+]?[\d.]+)/.exec(line);
    if (!m || !/[XY]/.test(line)) continue;
    const val = (v: string | undefined, prev: number) => (v === undefined ? prev : (v.includes(".") ? parseFloat(v) : parseInt(v, 10) / 10 ** decimals) * unit);
    last = [val(m[1], last[0]), val(m[2] ?? m[3], last[1])];
    const d = tools.get(tool) ?? 1;
    holes.push(ellipseBez(last[0], -last[1], d / 2, d / 2));
  }
  return { groups: holes.length ? [{ color: "#3a7bd5", curves: holes, paths: flattenBez(holes, 0.01) }] : [], warnings: [] };
}
