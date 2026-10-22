// Projets LightBurn (.lbrn, .lbrn2) : calques et leurs réglages, rectangles, ellipses,
// polygones, tracés (lignes et Bézier), groupes, textes (par leur tracé de secours) et images.
//
// LightBurn a l'axe Y vers le haut ; on le retourne avec la hauteur du plateau.

import { cutFrom } from "../clb";
import { flattenBez, transformBez, type BezNode, type BezPath } from "../bezier";
import { mul } from "../geometry";
import { DEFAULT_ADJUST, emptyProject, newLayer, uid, type Layer, type Mat, type Primitive, type Project, type Pt, type Shape } from "../model";

interface Node {
  name: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
  /** Source XML brute du contenu (pour les réglages de découpe). */
  inner: string;
}

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** Petit lecteur XML (éléments, attributs, texte), suffisant pour les fichiers LightBurn. */
export function parseXml(xml: string): Node {
  const root: Node = { name: "#root", attrs: {}, children: [], text: "", inner: "" };
  const stack: { node: Node; start: number }[] = [{ node: root, start: 0 }];
  const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let last = 0;
  for (const m of xml.matchAll(re)) {
    const top = stack[stack.length - 1].node;
    const between = xml.slice(last, m.index);
    if (between.trim()) top.text += unesc(between);
    last = m.index! + m[0].length;
    if (m[5] != null) { top.text += m[5]; continue; }
    if (!m[2]) continue;
    if (m[1]) {
      const done = stack.pop()!;
      done.node.inner = xml.slice(done.start, m.index);
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unesc(a[2] ?? a[3]);
    const node: Node = { name: m[2], attrs, children: [], text: "", inner: "" };
    top.children.push(node);
    if (!m[4]) stack.push({ node, start: last });
  }
  return root;
}

const child = (n: Node, name: string) => n.children.find((c) => c.name === name);
const num = (v: string | undefined, d = 0) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

function xform(n: Node): Mat {
  const x = child(n, "XForm")?.text.trim().split(/\s+/).map(Number);
  return x && x.length === 6 && x.every(Number.isFinite) ? (x as Mat) : [1, 0, 0, 1, 0, 0];
}

interface Vert { p: Pt; c0?: Pt; c1?: Pt }

/** Sommets : format 2 (« V x y c0x… ») ou ancien format (éléments <Vert>). */
/** Listes partagées : une copie de tracé renvoie à la liste d'un tracé précédent par VertID / PrimID. */
const shared = { verts: new Map<string, Node>(), prims: new Map<string, Node>() };

function listOf(n: Node, tag: "VertList" | "PrimList"): Node | undefined {
  const id = n.attrs[tag === "VertList" ? "VertID" : "PrimID"];
  const map = tag === "VertList" ? shared.verts : shared.prims;
  const own = child(n, tag);
  if (own && id != null) map.set(id, own);
  return own ?? (id != null ? map.get(id) : undefined);
}

function verts(n: Node): Vert[] {
  const list = listOf(n, "VertList");
  if (!list) return [];
  if (list.children.length) {
    return list.children.map((v) => {
      const a = v.attrs;
      const p: Pt = [num(a.x ?? a.vx), num(a.y ?? a.vy)];
      return { p, c0: a.c0x != null ? [num(a.c0x), num(a.c0y)] : undefined, c1: a.c1x != null ? [num(a.c1x), num(a.c1y)] : undefined };
    });
  }
  const out: Vert[] = [];
  for (const m of list.text.matchAll(/V\s*([-\d.eE+]+)\s+([-\d.eE+]+)((?:c[01][xy][-\d.eE+]+)*)/g)) {
    const v: Vert = { p: [Number(m[1]), Number(m[2])] };
    const c: Record<string, number> = {};
    for (const k of m[3].matchAll(/c([01])([xy])([-\d.eE+]+)/g)) c[`${k[1]}${k[2]}`] = Number(k[3]);
    if (c["0x"] != null && c["0y"] != null) v.c0 = [c["0x"], c["0y"]];
    if (c["1x"] != null && c["1y"] != null) v.c1 = [c["1x"], c["1y"]];
    out.push(v);
  }
  return out;
}

/** Primitives : « L a b » (ligne), « B a b » (Bézier : poignée c0 de a, c1 de b), ou « Line » / « LineClosed ». */
function prims(n: Node, count: number): { kind: "L" | "B"; a: number; b: number }[] {
  const list = listOf(n, "PrimList");
  if (!list) return [];
  if (list.children.length) {
    return list.children.map((p) => ({ kind: p.attrs.type === "1" || p.attrs.T === "B" ? "B" as const : "L" as const, a: num(p.attrs.p0), b: num(p.attrs.p1) }));
  }
  const s = list.text.trim();
  if (s === "Line" || s === "LineOpen" || s === "LineClosed") {
    const out = Array.from({ length: count - 1 }, (_, i) => ({ kind: "L" as const, a: i, b: i + 1 }));
    if (s === "LineClosed" && count > 2) out.push({ kind: "L", a: count - 1, b: 0 });
    return out;
  }
  return Array.from(s.matchAll(/([LB])\s*(\d+)\s+(\d+)/g), (m) => ({ kind: m[1] as "L" | "B", a: Number(m[2]), b: Number(m[3]) }));
}

/** Tracés d'une forme Path : les primitives qui se suivent forment un même tracé. */
export function pathCurves(n: Node): BezPath[] {
  const vs = verts(n);
  const out: BezPath[] = [];
  let cur: { nodes: BezNode[]; first: number; last: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const closed = cur.last === cur.first && cur.nodes.length > 2;
    if (closed) {
      const end = cur.nodes.pop()!;
      cur.nodes[0] = { ...cur.nodes[0], c1: end.c1 };
    }
    if (cur.nodes.length > 1) out.push({ nodes: cur.nodes, closed });
    cur = null;
  };
  for (const pr of prims(n, vs.length)) {
    const a = vs[pr.a], b = vs[pr.b];
    if (!a || !b) continue;
    if (!cur || cur.last !== pr.a) {
      flush();
      cur = { nodes: [{ p: a.p }], first: pr.a, last: pr.a };
    }
    if (pr.kind === "B") {
      cur.nodes[cur.nodes.length - 1].c2 = a.c0 ?? a.p;
      cur.nodes.push({ p: b.p, c1: b.c1 ?? b.p });
    } else cur.nodes.push({ p: b.p });
    cur.last = pr.b;
  }
  flush();
  return out;
}

function imageMime(b64: string): string {
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("Qk")) return "image/bmp";
  if (b64.startsWith("R0lG")) return "image/gif";
  return "image/png";
}

/** Texte LightBurn, pour le recréer en texte modifiable si sa police est installée. */
export interface LbrnText {
  /** Forme provisoire (courbes de secours) à remplacer, absente si le texte n'avait pas de tracé. */
  shapeId?: string;
  layerId: number;
  groupId?: string;
  /** Repère local du texte (origine sur la ligne de base, Y vers le bas). */
  matrix: Mat;
  text: string;
  family: string;
  bold: boolean;
  italic: boolean;
  height: number;
  letterSpacing: number;
  lineSpacing: number;
  align: "left" | "center" | "right";
  alignY: "baseline" | "top" | "middle" | "bottom";
  weld: boolean;
  upperCase: boolean;
  rtl: boolean;
}

export interface LbrnResult {
  project: Project;
  warnings: string[];
  texts: LbrnText[];
}

/** Police au format QFont::toString : « famille,taille,pixels,indice,graisse,italique,… ». */
export function parseQtFont(s: string): { family: string; bold: boolean; italic: boolean } {
  const p = s.split(",");
  const weight = Number(p[4] ?? 50);
  // Qt 5 : 50 normal, 75 gras ; Qt 6 : 400 normal, 700 gras.
  return { family: p[0] ?? "", bold: weight > 100 ? weight >= 600 : weight >= 63, italic: p[5] === "1" };
}

/** Projet LightBurn → projet Lumière. `primitiveCurve` construit le tracé d'une forme de base. */
export function parseLbrn(xml: string, bedHeight: number, primitiveCurve: (p: Primitive) => BezPath): LbrnResult {
  shared.verts.clear();
  shared.prims.clear();
  const doc = parseXml(xml);
  const root = doc.children.find((c) => c.name === "LightBurnProject");
  if (!root) throw new Error("Not a LightBurn project");
  const warnings: string[] = [];
  const texts: LbrnText[] = [];
  let skipped = 0;
  // Calques : index LightBurn = identifiant du calque.
  const layers: Layer[] = [];
  for (const c of root.children.filter((x) => x.name === "CutSetting" || x.name === "CutSetting_Img")) {
    const v = (k: string) => c.children.find((x) => x.name === k)?.attrs.Value;
    const id = num(v("index"));
    if (layers.some((l) => l.id === id)) continue;
    layers.push({ ...newLayer(id), ...cutFrom(c.attrs.type ?? "Cut", c.inner), name: v("name") ?? newLayer(id).name });
  }
  // Repère LightBurn (Y vers le haut) → plateau (Y vers le bas).
  const flip: Mat = [1, 0, 0, -1, 0, bedHeight];
  const shapes: Shape[] = [];
  const used = new Set<number>();
  const walk = (n: Node, parent: Mat, groupId?: string) => {
    const m = mul(parent, xform(n));
    const type = n.attrs.Type;
    const layerId = num(n.attrs.CutIndex);
    const base = { id: uid(), layerId, groupId, name: type };
    // Repère local Lumière (0…w × 0…h, Y vers le bas) → repère LightBurn centré, Y vers le haut.
    const centered = (w: number, h: number): Mat => mul(m, [1, 0, 0, -1, -w / 2, h / 2]);
    const vector = (primitive: Primitive, w: number, h: number) => {
      const curves = [primitiveCurve(primitive)];
      shapes.push({ ...base, kind: "vector", matrix: centered(w, h), curves, paths: flattenBez(curves, 0.02), primitive });
      used.add(layerId);
    };
    switch (type) {
      case "Group": {
        const g = uid();
        for (const c of child(n, "Children")?.children ?? []) if (c.name === "Shape") walk(c, m, groupId ?? g);
        return;
      }
      case "Rect": {
        const w = num(n.attrs.W), h = num(n.attrs.H);
        return vector({ type: "rect", w, h, radius: num(n.attrs.Cr) }, w, h);
      }
      case "Ellipse": {
        const w = 2 * num(n.attrs.Rx), h = 2 * num(n.attrs.Ry);
        return vector({ type: "ellipse", w, h }, w, h);
      }
      case "Star":
      case "DualStar": {
        const w = 2 * num(n.attrs.Rx), h = 2 * num(n.attrs.Ry);
        const points = Math.max(3, num(n.attrs.N, 5)), ratio = num(n.attrs.Ra, 0.5), bulge = num(n.attrs.Bu);
        return vector(type === "Star" ? { type: "star", w, h, points, ratio, bulge } : { type: "dualStar", w, h, points, ratio, ratio2: num(n.attrs.Ra2, ratio / 2), bulge }, w, h);
      }
      case "Polygon": {
        const w = 2 * num(n.attrs.Rx, num(n.attrs.R)), h = 2 * num(n.attrs.Ry, num(n.attrs.R));
        return vector({ type: "polygon", w, h, sides: Math.max(3, num(n.attrs.N, 6)) }, w, h);
      }
      case "Text": {
        const a = n.attrs;
        const font = parseQtFont(a.Font ?? "");
        const h = num(a.H, 10);
        const entry: LbrnText = {
          layerId, groupId, matrix: mul(m, [1, 0, 0, -1, 0, 0]), text: a.Str ?? "", family: font.family, bold: font.bold, italic: font.italic,
          height: h, letterSpacing: num(a.LS), lineSpacing: 1.4 + num(a.LnS) / (h || 1),
          align: (["left", "center", "right"] as const)[num(a.Ah)] ?? "left",
          alignY: (["baseline", "bottom", "middle", "top"] as const)[num(a.Av)] ?? "baseline",
          weld: a.Weld === "1", upperCase: a.ForceCase === "1", rtl: a.RTL === "1",
        };
        const before = shapes.length;
        const src = child(n, "BackupPath");
        if (src) {
          const local = pathCurves(src);
          if (local.length) {
            const curves = transformBez(local, mul(m, xform(src)));
            shapes.push({ ...base, name: a.Str ?? type, kind: "vector", matrix: [1, 0, 0, 1, 0, 0], curves, paths: flattenBez(curves, 0.02) });
            used.add(layerId);
          }
        }
        texts.push({ ...entry, shapeId: shapes.length > before ? shapes[shapes.length - 1].id : undefined });
        if (shapes.length === before) used.add(layerId);
        return;
      }
      case "Path": {
        const local = pathCurves(n);
        if (!local.length) return void skipped++;
        // Coordonnées du plateau directement (le retournement de Y donnerait une matrice miroir).
        const curves = transformBez(local, m);
        shapes.push({ ...base, kind: "vector", matrix: [1, 0, 0, 1, 0, 0], curves, paths: flattenBez(curves, 0.02) });
        used.add(layerId);
        return;
      }
      case "Bitmap": {
        const data = n.attrs.Data;
        if (!data) return void skipped++;
        const w = num(n.attrs.W), h = num(n.attrs.H);
        const adjust = { ...DEFAULT_ADJUST, gamma: num(n.attrs.Gamma, 1) || 1, contrast: num(n.attrs.Contrast), brightness: num(n.attrs.Brightness) };
        shapes.push({ ...base, name: n.attrs.File?.split(/[\\/]/).pop() ?? "Image", kind: "image", matrix: centered(w, h), src: `data:${imageMime(data)};base64,${data}`, width: w, height: h, adjust });
        used.add(layerId);
        return;
      }
      default:
        skipped++;
    }
  };
  for (const s of root.children.filter((c) => c.name === "Shape")) walk(s, flip);
  for (const id of used) if (!layers.some((l) => l.id === id)) layers.push(newLayer(id));
  const project: Project = { ...emptyProject(), layers: layers.length ? layers.filter((l) => used.has(l.id) || !used.size) : [newLayer(0)], shapes };
  if (skipped) warnings.push(`shapes:${skipped}`);
  return { project, warnings, texts };
}
