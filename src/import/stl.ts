// Modèle 3D (STL) → carte de profondeur : image en niveaux de gris, blanc en haut du
// modèle et noir au fond, à graver en mode Image (« Relief 3D : tranches »).

import { t } from "../i18n";

export type View = "top" | "bottom" | "front" | "back" | "left" | "right";

/** Triangles à plat : 9 nombres (3 sommets x, y, z) par triangle. */
export function parseStl(data: ArrayBuffer): Float32Array {
  const bytes = new Uint8Array(data);
  const dv = new DataView(data);
  // Binaire : en-tête de 80 octets, nombre de triangles, 50 octets par triangle.
  if (bytes.length >= 84) {
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === bytes.length) {
      const out = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(84 + i * 50 + 12 + k * 4, true);
      }
      return out;
    }
  }
  // ASCII : « vertex x y z », trois par facette.
  const text = new TextDecoder().decode(bytes);
  const nums: number[] = [];
  for (const m of text.matchAll(/vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g)) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9) throw new Error(t("Fichier STL illisible"));
  return Float32Array.from(nums);
}

/** Point vu depuis une direction : (x, y) dans l'image (y vers le bas), z vers l'observateur. */
function project(view: View, x: number, y: number, z: number): [number, number, number] {
  switch (view) {
    case "top": return [x, -y, z];
    case "bottom": return [x, y, -z];
    case "front": return [x, -z, -y];
    case "back": return [-x, -z, y];
    case "left": return [-y, -z, -x];
    case "right": return [y, -z, x];
  }
}

export interface DepthOptions {
  view: View;
  /** Pixels par millimètre de modèle. */
  resolution: number;
  invert: boolean;
  equalize: boolean;
  /** Coupe automatique : le fond est placé au point visible le plus bas (sinon au bas du modèle). */
  autoDepth: boolean;
  /** Fond (pixels sans modèle) : blanc (non gravé) ou noir. */
  blackBackground: boolean;
}

export interface DepthMap {
  width: number;
  height: number;
  gray: Uint8Array;
  /** Taille du modèle vu (mm) et profondeur (mm). */
  mmWidth: number;
  mmHeight: number;
  depth: number;
}

const MAX_SIDE = 4000;

export function depthMap(tris: Float32Array, o: DepthOptions): DepthMap {
  const n = tris.length / 9;
  const pts = new Float32Array(tris.length);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n * 3; i++) {
    const [x, y, z] = project(o.view, tris[i * 3], tris[i * 3 + 1], tris[i * 3 + 2]);
    pts[i * 3] = x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = z;
    minX = Math.min(minX, x), maxX = Math.max(maxX, x);
    minY = Math.min(minY, y), maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z), maxZ = Math.max(maxZ, z);
  }
  if (!n || !(maxX > minX) || !(maxY > minY)) throw new Error(t("Modèle 3D vide"));
  const k = Math.min(o.resolution, MAX_SIDE / (maxX - minX), MAX_SIDE / (maxY - minY));
  const width = Math.max(1, Math.ceil((maxX - minX) * k)), height = Math.max(1, Math.ceil((maxY - minY) * k));
  const zbuf = new Float32Array(width * height).fill(-Infinity);
  // Rendu des triangles, en gardant le point le plus proche de l'observateur (z max).
  for (let t = 0; t < n; t++) {
    const v = [0, 1, 2].map((j) => [(pts[(t * 3 + j) * 3] - minX) * k, (pts[(t * 3 + j) * 3 + 1] - minY) * k, pts[(t * 3 + j) * 3 + 2]]);
    const [a, b, c] = v;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const i = y * width + x;
        if (z > zbuf[i]) zbuf[i] = z;
      }
    }
  }
  // Fond de la carte : point visible le plus bas, ou bas du modèle.
  let low = minZ;
  if (o.autoDepth) {
    low = Infinity;
    for (const z of zbuf) if (z > -Infinity) low = Math.min(low, z);
    if (!Number.isFinite(low)) low = minZ;
  }
  const range = Math.max(1e-9, maxZ - low);
  const levels = new Float32Array(width * height).fill(-1);
  for (let i = 0; i < zbuf.length; i++) if (zbuf[i] > -Infinity) levels[i] = Math.max(0, Math.min(1, (zbuf[i] - low) / range));
  if (o.equalize) equalizeLevels(levels);
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] < 0) gray[i] = o.blackBackground ? 0 : 255;
    else {
      const v = Math.round(levels[i] * 255);
      gray[i] = o.invert ? 255 - v : v;
    }
  }
  return { width, height, gray, mmWidth: (maxX - minX), mmHeight: (maxY - minY), depth: maxZ - low };
}

/** Égalisation d'histogramme des pixels du modèle (fait ressortir les reliefs faibles). */
function equalizeLevels(levels: Float32Array) {
  const hist = new Uint32Array(256);
  let count = 0;
  for (const v of levels) if (v >= 0) hist[Math.round(v * 255)]++, count++;
  if (!count) return;
  const cdf = new Float32Array(256);
  let acc = 0;
  for (let i = 0; i < 256; i++) cdf[i] = (acc += hist[i]) / count;
  for (let i = 0; i < levels.length; i++) if (levels[i] >= 0) levels[i] = cdf[Math.round(levels[i] * 255)];
}

/** Carte de profondeur → image PNG (data URL). */
export function depthToPng(map: DepthMap): string {
  const canvas = document.createElement("canvas");
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(map.width, map.height);
  for (let i = 0; i < map.gray.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = map.gray[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
