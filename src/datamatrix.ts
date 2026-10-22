// DataMatrix ECC200 (codes carrés jusqu'à 64 × 64) : encodage ASCII, correction d'erreurs
// Reed-Solomon, placement des modules et motifs de repérage, d'après la norme ISO/IEC 16022.

import type { Polyline } from "./model";
import { weld } from "./pathops";

/** Tailles carrées : côté, octets de données, octets de correction, côté des régions, blocs. */
const SIZES: [number, number, number, number, number][] = [
  [10, 3, 5, 8, 1], [12, 5, 7, 10, 1], [14, 8, 10, 12, 1], [16, 12, 12, 14, 1], [18, 18, 14, 16, 1], [20, 22, 18, 18, 1],
  [22, 30, 20, 20, 1], [24, 36, 24, 22, 1], [26, 44, 28, 24, 1], [32, 62, 36, 14, 1], [36, 86, 42, 16, 1], [40, 114, 48, 18, 1],
  [44, 144, 56, 20, 1], [48, 174, 68, 22, 1], [52, 204, 84, 24, 2], [64, 280, 112, 14, 2],
];

/** Encodage ASCII : paires de chiffres compactées, caractères étendus précédés de 235. */
export function encodeAscii(text: string): number[] {
  // Latin-1 par défaut (norme) ; au-delà, UTF-8 annoncé par l'ECI 26.
  const codes = Array.from(text, (ch) => ch.codePointAt(0)!);
  const latin1 = codes.every((c) => c <= 255);
  const bytes = latin1 ? codes : Array.from(new TextEncoder().encode(text));
  const out: number[] = latin1 ? [] : [241, 27];
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i], d = bytes[i + 1];
    if (c >= 48 && c <= 57 && d >= 48 && d <= 57) {
      out.push(130 + (c - 48) * 10 + (d - 48));
      i++;
    } else if (c < 128) out.push(c + 1);
    else out.push(235, c - 127);
  }
  return out;
}

// Corps de Galois GF(256), polynôme 0x12D.
const EXP = new Array<number>(512), LOG = new Array<number>(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x12d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gmul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Octets de correction Reed-Solomon (générateur de racines α¹…αⁿ). */
export function reedSolomon(data: number[], n: number): number[] {
  let g = [1];
  for (let i = 1; i <= n; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gmul(g[j], EXP[i]);
    }
    g = next;
  }
  const rem = new Array<number>(n).fill(0);
  for (const d of data) {
    const k = d ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let j = 0; j < n; j++) rem[j] ^= gmul(k, g[j + 1]);
  }
  return rem;
}

/** Matrice des modules (true = sombre), ligne par ligne depuis le haut. */
export function dataMatrix(text: string): boolean[][] {
  const data = encodeAscii(text);
  const size = SIZES.find((s) => s[1] >= data.length);
  if (!size) throw new Error("DataMatrix: text too long");
  const [side, nData, nEcc, region, blocks] = size;
  // Remplissage : 129, puis valeurs pseudo-aléatoires (« 253-state »).
  const cw = [...data];
  if (cw.length < nData) cw.push(129);
  while (cw.length < nData) {
    const pos = cw.length + 1;
    let v = 129 + ((149 * pos) % 253) + 1;
    if (v > 254) v -= 254;
    cw.push(v);
  }
  // Correction d'erreurs par blocs entrelacés.
  const ecc = new Array<number>(nEcc);
  for (let b = 0; b < blocks; b++) {
    const part = cw.filter((_, i) => i % blocks === b);
    reedSolomon(part, nEcc / blocks).forEach((v, i) => (ecc[i * blocks + b] = v));
  }
  const all = [...cw, ...ecc];
  // Placement dans la matrice de données (sans les motifs de repérage).
  const regions = side / (region + 2);
  const nr = regions * region, nc = nr;
  const bits: (number | null)[][] = Array.from({ length: nr }, () => new Array<number | null>(nc).fill(null));
  const module = (r: number, c: number, p: number, bit: number) => {
    if (r < 0) {
      r += nr;
      c += 4 - ((nr + 4) % 8);
    }
    if (c < 0) {
      c += nc;
      r += 4 - ((nc + 4) % 8);
    }
    bits[r][c] = (all[p] >> (8 - bit)) & 1;
  };
  const utah = (r: number, c: number, p: number) => {
    module(r - 2, c - 2, p, 1); module(r - 2, c - 1, p, 2); module(r - 1, c - 2, p, 3); module(r - 1, c - 1, p, 4);
    module(r - 1, c, p, 5); module(r, c - 2, p, 6); module(r, c - 1, p, 7); module(r, c, p, 8);
  };
  const corner = (p: number, cells: [number, number][]) => cells.forEach(([r, c], i) => module(r, c, p, i + 1));
  let p = 0, r = 4, c = 0;
  do {
    if (r === nr && c === 0) corner(p++, [[nr - 1, 0], [nr - 1, 1], [nr - 1, 2], [0, nc - 2], [0, nc - 1], [1, nc - 1], [2, nc - 1], [3, nc - 1]]);
    if (r === nr - 2 && c === 0 && nc % 4 !== 0) corner(p++, [[nr - 3, 0], [nr - 2, 0], [nr - 1, 0], [0, nc - 4], [0, nc - 3], [0, nc - 2], [0, nc - 1], [1, nc - 1]]);
    if (r === nr - 2 && c === 0 && nc % 8 === 4) corner(p++, [[nr - 3, 0], [nr - 2, 0], [nr - 1, 0], [0, nc - 2], [0, nc - 1], [1, nc - 1], [2, nc - 1], [3, nc - 1]]);
    if (r === nr + 4 && c === 2 && nc % 8 === 0) corner(p++, [[nr - 1, 0], [nr - 1, nc - 1], [0, nc - 3], [0, nc - 2], [0, nc - 1], [1, nc - 3], [1, nc - 2], [1, nc - 1]]);
    do {
      if (r < nr && c >= 0 && bits[r][c] === null) utah(r, c, p++);
      r -= 2;
      c += 2;
    } while (r >= 0 && c < nc);
    r += 1;
    c += 3;
    do {
      if (r >= 0 && c < nc && bits[r][c] === null) utah(r, c, p++);
      r += 2;
      c -= 2;
    } while (r < nr && c >= 0);
    r += 3;
    c += 1;
  } while (r < nr || c < nc);
  if (bits[nr - 1][nc - 1] === null) {
    bits[nr - 1][nc - 1] = 1;
    bits[nr - 2][nc - 2] = 1;
  }
  // Symbole complet : chaque région entourée de ses motifs de repérage.
  const rs = region + 2;
  return Array.from({ length: side }, (_, y) => Array.from({ length: side }, (_, x) => {
    const ry = y % rs, rx = x % rs;
    if (rx === 0 || ry === rs - 1) return true; // bord gauche et bas pleins
    if (ry === 0) return x % 2 === 0; // haut alterné
    if (rx === rs - 1) return ry % 2 === 1; // droite alternée
    const dy = Math.floor(y / rs) * region + ry - 1, dx = Math.floor(x / rs) * region + rx - 1;
    return bits[dy][dx] === 1;
  }));
}

/** DataMatrix vectoriel de `size` mm de côté, modules fusionnés. */
export function dataMatrixPaths(text: string, size: number): Polyline[] {
  const m = dataMatrix(text);
  const k = size / m.length;
  const rects: Polyline[] = [];
  m.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      rects.push({ closed: true, pts: [[start * k, y * k], [x * k, y * k], [x * k, (y + 1) * k], [start * k, (y + 1) * k]] });
    }
  });
  return weld(rects);
}
