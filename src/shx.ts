// Polices SHX (AutoCAD) : polices à trait simple, idéales pour la gravure au laser.
//
// Formats lus : « shapes 1.0 / 1.1 » (une forme par code de caractère) et « unifont 1.0 »
// (codes Unicode). Les grandes polices (« bigfont », asiatiques) ne sont pas prises en charge.
// Chaque forme est une suite d'octets de tracé : vecteurs longueur/direction, déplacements,
// arcs, plume levée/baissée, pile de positions et sous-formes.

import { t } from "./i18n";

type P = [number, number];

export interface ShxFont {
  name: string;
  /** Hauteur des capitales (unités de la police) et descente. */
  above: number;
  below: number;
  shapes: Map<number, Uint8Array>;
  unicode: boolean;
}

const DIRS: P[] = [
  [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [-0.5, 1], [-1, 1], [-1, 0.5],
  [-1, 0], [-1, -0.5], [-1, -1], [-0.5, -1], [0, -1], [0.5, -1], [1, -1], [1, -0.5],
];

function header(bytes: Uint8Array): { sig: string; at: number } {
  const end = bytes.indexOf(0x1a);
  if (end < 0 || end > 40) throw new Error(t("Police SHX illisible"));
  return { sig: new TextDecoder("latin1").decode(bytes.subarray(0, end)).trim(), at: end + 1 };
}

/** Nom (terminé par 0) puis octets de tracé. */
function splitDef(def: Uint8Array): { name: string; spec: Uint8Array } {
  const z = def.indexOf(0);
  return { name: new TextDecoder("latin1").decode(def.subarray(0, Math.max(0, z))), spec: def.subarray(z + 1) };
}

export function parseShx(data: ArrayBuffer): ShxFont {
  const bytes = new Uint8Array(data);
  const dv = new DataView(data);
  const { sig, at } = header(bytes);
  const shapes = new Map<number, Uint8Array>();
  let info: Uint8Array | null = null;
  let unicode = false;
  if (/shapes 1\.[01]/i.test(sig)) {
    let o = at + 4; // premier et dernier numéros
    const count = dv.getUint16(o, true);
    o += 2;
    const index: [number, number][] = [];
    for (let i = 0; i < count; i++, o += 4) index.push([dv.getUint16(o, true), dv.getUint16(o + 2, true)]);
    for (const [num, len] of index) {
      const def = bytes.subarray(o, o + len);
      o += len;
      if (num === 0) info = def;
      else shapes.set(num, splitDef(def).spec);
    }
  } else if (/unifont 1\.0/i.test(sig)) {
    unicode = true;
    let o = at;
    const count = dv.getUint32(o, true);
    const infoLen = dv.getUint16(o + 4, true);
    o += 6;
    info = bytes.subarray(o, o + infoLen);
    o += infoLen;
    for (let i = 1; i < count && o + 4 <= bytes.length; i++) {
      const num = dv.getUint16(o, true), len = dv.getUint16(o + 2, true);
      o += 4;
      shapes.set(num, splitDef(bytes.subarray(o, o + len)).spec);
      o += len;
    }
  } else if (/bigfont/i.test(sig)) {
    throw new Error(t("Les grandes polices SHX (bigfont) ne sont pas prises en charge"));
  } else throw new Error(t("Police SHX illisible"));
  // Forme 0 : nom, hauteur au-dessus et au-dessous de la ligne de base.
  let name = "", above = 0, below = 0;
  if (info) {
    const z = info.indexOf(0);
    name = new TextDecoder("latin1").decode(info.subarray(0, Math.max(0, z)));
    above = info[z + 1] ?? 0;
    below = info[z + 2] ?? 0;
  }
  if (!above) above = 9;
  return { name, above, below, shapes, unicode };
}

const s8 = (b: number) => (b > 127 ? b - 256 : b);

/** Points d'un arc (repère Y vers le haut) de `a0` à `a0 + sweep` radians. */
function arcPoints(c: P, r: number, a0: number, sweep: number): P[] {
  const n = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * 48));
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (sweep * (i + 1)) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
}

export interface ShxGlyph {
  /** Traits (repère de la police, Y vers le haut). */
  strokes: P[][];
  advance: number;
}

/** Interprète la forme `code` ; les sous-formes sont dessinées depuis la position courante. */
export function shxGlyph(font: ShxFont, code: number): ShxGlyph | null {
  const spec = font.shapes.get(code);
  if (!spec) return null;
  const strokes: P[][] = [];
  let pos: P = [0, 0];
  let cur: P[] | null = null;
  const run = (spec: Uint8Array, depth: number) => {
    let pen = true, scale = 1;
    const stack: P[] = [];
    const lineTo = (q: P, draw: boolean) => {
      if (draw && pen) {
        if (!cur) strokes.push((cur = [pos]));
        cur.push(q);
      } else cur = null;
      pos = q;
    };
    const arcTo = (pts: P[], draw: boolean) => pts.forEach((q) => lineTo(q, draw));
    const bulge = (dx: number, dy: number, b: number, draw: boolean) => {
      const end: P = [pos[0] + dx * scale, pos[1] + dy * scale];
      if (b === 0) return lineTo(end, draw);
      const theta = 4 * Math.atan(b / 127);
      const chord = Math.hypot(end[0] - pos[0], end[1] - pos[1]);
      const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
      const mid: P = [(pos[0] + end[0]) / 2, (pos[1] + end[1]) / 2];
      const h = r * Math.cos(theta / 2) * Math.sign(theta);
      const n: P = [-(end[1] - pos[1]) / chord, (end[0] - pos[0]) / chord];
      const c: P = [mid[0] + n[0] * h, mid[1] + n[1] * h];
      arcTo(arcPoints(c, r, Math.atan2(pos[1] - c[1], pos[0] - c[0]), theta), draw);
      pos = end;
    };
    let i = 0;
    const step = (draw: boolean) => {
      const b = spec[i++];
      if (b > 0x0f) {
        const len = b >> 4, d = DIRS[b & 0x0f];
        return lineTo([pos[0] + d[0] * len * scale, pos[1] + d[1] * len * scale], draw);
      }
      switch (b) {
        case 0: i = spec.length; return;
        case 1: if (draw) pen = true; return;
        case 2: if (draw) { pen = false; cur = null; } return;
        case 3: { const v = spec[i++]; if (draw && v) scale /= v; return; }
        case 4: { const v = spec[i++]; if (draw) scale *= v; return; }
        case 5: if (draw) stack.push(pos); return;
        case 6: if (draw) { pos = stack.pop() ?? pos; cur = null; } return;
        case 7: {
          const sub = font.unicode ? (spec[i++] << 8) | spec[i++] : spec[i++];
          const inner = font.shapes.get(sub);
          if (draw && inner && depth < 8) {
            cur = null;
            run(inner, depth + 1);
            cur = null;
          }
          return;
        }
        case 8: { const dx = s8(spec[i++]), dy = s8(spec[i++]); return lineTo([pos[0] + dx * scale, pos[1] + dy * scale], draw); }
        case 9: {
          for (;;) {
            const dx = s8(spec[i++]), dy = s8(spec[i++]);
            if ((dx === 0 && dy === 0) || i > spec.length) return;
            lineTo([pos[0] + dx * scale, pos[1] + dy * scale], draw);
          }
        }
        case 10: {
          // Arc par octants : rayon, puis signe (sens), octant de départ et nombre d'octants.
          const r = spec[i++] * scale, o = s8(spec[i++]);
          const cw = o < 0, a = Math.abs(o), start = (a >> 4) & 7, count = (a & 7) || 8;
          const a0 = (start * Math.PI) / 4, sweep = ((cw ? -1 : 1) * count * Math.PI) / 4;
          const c: P = [pos[0] - r * Math.cos(a0), pos[1] - r * Math.sin(a0)];
          arcTo(arcPoints(c, r, a0, sweep), draw);
          return;
        }
        case 11: {
          // Arc fractionnaire : décalages de début et de fin (1/256 d'octant), rayon sur 2 octets.
          const so = spec[i++], eo = spec[i++], r = ((spec[i++] << 8) | spec[i++]) * scale, o = s8(spec[i++]);
          const cw = o < 0, a = Math.abs(o), start = (a >> 4) & 7, count = (a & 7) || 8;
          const oct = Math.PI / 4, dir = cw ? -1 : 1;
          const a0 = start * oct + dir * (so / 256) * oct;
          const sweep = dir * (count * oct - (so / 256) * oct - (eo ? (1 - eo / 256) * oct : 0));
          const c: P = [pos[0] - r * Math.cos(a0), pos[1] - r * Math.sin(a0)];
          arcTo(arcPoints(c, r, a0, sweep), draw);
          return;
        }
        case 12: { const dx = s8(spec[i++]), dy = s8(spec[i++]), bb = s8(spec[i++]); return bulge(dx, dy, bb, draw); }
        case 13: {
          for (;;) {
            const dx = s8(spec[i++]), dy = s8(spec[i++]);
            if ((dx === 0 && dy === 0) || i > spec.length) return;
            bulge(dx, dy, s8(spec[i++]), draw);
          }
        }
        case 14: step(false); return; // commande réservée au texte vertical
        default: return;
      }
    };
    while (i < spec.length) step(true);
  };
  run(spec, 0);
  return { strokes: strokes.filter((s) => s.length > 1), advance: pos[0] };
}

/**
 * Adaptateur au format des polices opentype.js utilisé par la mise en page du texte :
 * l'unité « em » est la hauteur des capitales, les traits sont ouverts.
 */
export function shxAsFont(font: ShxFont) {
  const cache = new Map<number, ShxGlyph | null>();
  const glyph = (code: number) => {
    if (!cache.has(code)) cache.set(code, shxGlyph(font, code));
    return cache.get(code)!;
  };
  return {
    isShx: true,
    unitsPerEm: font.above,
    tables: { os2: { sCapHeight: font.above } },
    getKerningValue: () => 0,
    stringToGlyphs(s: string) {
      return Array.from(s).map((ch) => {
        const code = ch.codePointAt(0)!;
        const g = glyph(code) ?? (code === 32 ? null : glyph(63)); // « ? » pour un caractère absent
        const advance = g?.advance ?? font.above * 0.6;
        return {
          advanceWidth: advance,
          getPath(x: number, y: number, size: number) {
            const k = size / font.above;
            const d = (g?.strokes ?? []).map((s) => s.map(([u, v], i) => `${i ? "L" : "M"}${(x + u * k).toFixed(4)} ${(y - v * k).toFixed(4)}`).join(" ")).join(" ");
            return { toPathData: () => d };
          },
        };
      });
    },
  };
}
