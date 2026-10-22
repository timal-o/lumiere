// Import SVG : un groupe de tracés par couleur de contour.

import { flattenBez, transformBez, type BezPath } from "../bezier";
import { IDENTITY, mul, rotateAbout } from "../geometry";
import type { Mat, Polyline } from "../model";
import { parsePathData } from "./svgpath";
import { t } from "../i18n";

export interface ImportedGroup {
  color: string;
  paths: Polyline[];
  /** Courbes d'origine (absentes pour les formats sans courbes). */
  curves?: BezPath[];
}

export interface ImportResult {
  groups: ImportedGroup[];
  warnings: string[];
}

const MM_PER: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };

/** Longueur SVG en mm ; `null` si absente ou en pourcentage. */
function lengthMm(v: string | null): number | null {
  if (!v) return null;
  const m = /^\s*([-+]?[\d.]+(?:e[-+]?\d+)?)\s*([a-z%]*)\s*$/i.exec(v);
  if (!m || m[2] === "%" || !(m[2].toLowerCase() in MM_PER)) return null;
  return parseFloat(m[1]) * MM_PER[m[2].toLowerCase()];
}

function nums(s: string): number[] {
  return (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
}

export function parseTransform(s: string | null): Mat {
  let m: Mat = IDENTITY;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (let r = re.exec(s); r; r = re.exec(s)) {
    const a = nums(r[2]);
    let t: Mat = IDENTITY;
    switch (r[1]) {
      case "matrix": if (a.length === 6) t = a as Mat; break;
      case "translate": t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; break;
      case "scale": t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
      case "rotate": t = rotateAbout(a[0] ?? 0, [a[1] ?? 0, a[2] ?? 0]); break;
      case "skewX": t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case "skewY": t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
  }
  return m;
}

/** Propriété de présentation, depuis `style` puis l'attribut, en remontant les parents. */
function inherited(el: Element, prop: string): string | null {
  for (let e: Element | null = el; e && e.nodeType === 1; e = e.parentElement) {
    const style = e.getAttribute("style");
    if (style) {
      const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(style);
      if (m) return m[1].trim();
    }
    const attr = e.getAttribute(prop);
    if (attr) return attr.trim();
  }
  return null;
}

function normalizeColor(c: string | null): string | null {
  if (!c || c === "none" || c === "transparent" || c.startsWith("url(")) return null;
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillStyle = c;
  return ctx.fillStyle; // le navigateur normalise en #rrggbb
}

function ellipseD(cx: number, cy: number, rx: number, ry: number) {
  return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
}

function rectD(x: number, y: number, w: number, h: number, rx: number, ry: number) {
  if (rx <= 0 && ry <= 0) return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  rx = Math.min(rx || ry, w / 2);
  ry = Math.min(ry || rx, h / 2);
  return `M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x},${y + h - ry} V${y + ry} A${rx},${ry} 0 0 1 ${x + rx},${y} Z`;
}

function pathData(el: Element): string | null {
  const n = (a: string) => parseFloat(el.getAttribute(a) ?? "0") || 0;
  switch (el.localName) {
    case "path": return el.getAttribute("d");
    case "rect": return n("width") > 0 && n("height") > 0 ? rectD(n("x"), n("y"), n("width"), n("height"), n("rx"), n("ry")) : null;
    case "circle": return n("r") > 0 ? ellipseD(n("cx"), n("cy"), n("r"), n("r")) : null;
    case "ellipse": return n("rx") > 0 && n("ry") > 0 ? ellipseD(n("cx"), n("cy"), n("rx"), n("ry")) : null;
    case "line": return `M${n("x1")},${n("y1")} L${n("x2")},${n("y2")}`;
    case "polyline":
    case "polygon": {
      const p = nums(el.getAttribute("points") ?? "");
      if (p.length < 4) return null;
      let d = `M${p[0]},${p[1]}`;
      for (let i = 2; i + 1 < p.length; i += 2) d += ` L${p[i]},${p[i + 1]}`;
      return el.localName === "polygon" ? d + " Z" : d;
    }
  }
  return null;
}

const SKIP = new Set(["defs", "clipPath", "mask", "symbol", "marker", "pattern", "metadata", "title", "desc", "style", "script"]);

/**
 * `dpi` : résolution des unités sans dimension et des px (96 pour Inkscape, 72 pour
 * Illustrator), choisie dans Paramètres → Import.
 */
export function parseSvg(text: string, dpi = 96): ImportResult {
  MM_PER.px = MM_PER[""] = 25.4 / dpi;
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error(t("Fichier SVG illisible"));
  const root = doc.documentElement;
  if (root.localName !== "svg") throw new Error(t("Ce fichier n'est pas un SVG"));

  // Unités utilisateur → mm, d'après width/height et viewBox.
  const vb = nums(root.getAttribute("viewBox") ?? "");
  const wMm = lengthMm(root.getAttribute("width"));
  const hMm = lengthMm(root.getAttribute("height"));
  let rootM: Mat = [MM_PER.px, 0, 0, MM_PER.px, 0, 0];
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    const sx = wMm != null ? wMm / vb[2] : hMm != null ? hMm / vb[3] : MM_PER.px;
    const sy = hMm != null ? hMm / vb[3] : sx;
    rootM = [sx, 0, 0, sy, -vb[0] * sx, -vb[1] * sy];
  }

  const groups = new Map<string, BezPath[]>();
  const warnings = new Set<string>();

  const walk = (el: Element, m: Mat) => {
    if (SKIP.has(el.localName)) return;
    if (inherited(el, "display") === "none") return;
    const local = mul(m, parseTransform(el.getAttribute("transform")));
    if (el.localName === "text") warnings.add(t("Texte ignoré : convertissez-le en tracés dans votre éditeur."));
    if (el.localName === "use") warnings.add(t("Éléments <use> ignorés : dissociez les clones avant l'export."));
    if (el.localName === "image") warnings.add(t("Images intégrées au SVG ignorées : importez-les séparément."));
    const d = pathData(el);
    if (d) {
      // Les transformations affines conservent les courbes de Bézier : on transforme les points de contrôle.
      const curves = transformBez(parsePathData(d), local);
      const color = normalizeColor(inherited(el, "stroke")) ?? normalizeColor(inherited(el, "fill")) ?? "#000000";
      if (curves.length) groups.set(color, [...(groups.get(color) ?? []), ...curves]);
    }
    for (const child of Array.from(el.children)) walk(child, local);
  };
  walk(root, rootM);

  return {
    groups: [...groups].map(([color, curves]) => ({ color, curves, paths: flattenBez(curves, 0.01) })),
    warnings: [...warnings],
  };
}
