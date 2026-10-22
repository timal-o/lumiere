// Rendu des images en niveaux de gris (réglages appliqués) et aperçu tramé.

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./backend";
import { mul } from "./geometry";
import { loadImage } from "./images";
import type { DitherMode, ImageAdjust, ImageShape, Layer, Mat } from "./model";

/** Restreint le dessin à l'intérieur du masque (repère local de l'image, règle pair-impair). */
export function clipToMask(ctx: CanvasRenderingContext2D, mask: { pts: [number, number][] }[]) {
  ctx.beginPath();
  for (const p of mask) p.pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
  ctx.clip("evenodd");
}

/** Applique luminosité, contraste, gamma et inversion à une valeur 0–255. */
export function adjustLut(a: ImageAdjust): Uint8Array {
  const lut = new Uint8Array(256);
  const c = Math.max(-0.99, Math.min(0.99, a.contrast / 100));
  const factor = (1 + c) / (1 - c);
  for (let i = 0; i < 256; i++) {
    let v = i / 255 + a.brightness / 100;
    v = (v - 0.5) * factor + 0.5;
    v = Math.max(0, Math.min(1, v));
    v = Math.pow(v, 1 / Math.max(0.05, a.gamma));
    if (a.invert) v = 1 - v;
    lut[i] = Math.round(v * 255);
  }
  return lut;
}

/**
 * Rend l'image sur une grille `pw`×`ph`. `toPixel` convertit le repère local de
 * l'image (mm) en pixels de la grille. Fond blanc pour les zones transparentes.
 */
/** Flou par boîtes (deux passes séparables, proche d'un flou gaussien) de rayon `r` pixels. */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const pass = (a: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(a.length);
    const [n, m] = horizontal ? [w, h] : [h, w];
    for (let j = 0; j < m; j++) {
      let sum = 0;
      const idx = (i: number) => (horizontal ? j * w + i : i * w + j);
      for (let i = -r; i <= r; i++) sum += a[idx(Math.min(n - 1, Math.max(0, i)))];
      for (let i = 0; i < n; i++) {
        out[idx(i)] = sum / (2 * r + 1);
        sum += a[idx(Math.min(n - 1, i + r + 1))] - a[idx(Math.max(0, i - r))];
      }
    }
    return out;
  };
  return pass(pass(pass(pass(src, true), false), true), false);
}

/**
 * Accentuation (masque flou) et réduction du bruit, sur la luminance. Le rayon est en
 * pixels de la grille de rendu.
 */
export function enhance(lum: Float32Array, w: number, h: number, amount: number, radiusPx: number, denoise: number): Float32Array {
  if (amount <= 0 && denoise <= 0) return lum;
  const r = Math.max(1, Math.round(radiusPx / 2));
  const soft = blur(lum, w, h, r);
  const out = new Float32Array(lum.length);
  const k = amount / 100, quiet = (denoise / 100) * 40;
  for (let i = 0; i < lum.length; i++) {
    const detail = lum[i] - soft[i];
    // Les petites variations (bruit des aplats) sont lissées ; les vrais détails accentués.
    out[i] = Math.abs(detail) < quiet ? soft[i] : lum[i] + k * detail;
  }
  return out;
}

export async function renderGray(shape: ImageShape, pw: number, ph: number, toPixel: Mat, negative = false): Promise<Uint8Array> {
  const img = await loadImage(shape.src);
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, pw, ph);
  ctx.setTransform(...toPixel);
  ctx.imageSmoothingQuality = "high";
  if (shape.mask?.length) clipToMask(ctx, shape.mask);
  ctx.drawImage(img, 0, 0, shape.width, shape.height);
  const data = ctx.getImageData(0, 0, pw, ph).data;
  let lum: Float32Array = new Float32Array(pw * ph);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  const a = shape.adjust;
  // Rayon d'accentuation : mm → pixels de la grille.
  const pxPerMm = Math.sqrt(Math.abs(toPixel[0] * toPixel[3] - toPixel[1] * toPixel[2]));
  lum = enhance(lum, pw, ph, a.enhanceAmount ?? 0, (a.enhanceRadius ?? 0.5) * pxPerMm, a.denoise ?? 0);
  const lut = adjustLut(a);
  const gray = new Uint8Array(pw * ph);
  for (let i = 0; i < gray.length; i++) {
    const v = lut[Math.max(0, Math.min(255, Math.round(lum[i])))];
    gray[i] = negative ? 255 - v : v;
  }
  return gray;
}

/** Rendu dans le repère plateau (rotation comprise), un pixel par pas de balayage. */
export function renderForJob(shape: ImageShape, box: { x: number; y: number; w: number; h: number }, pw: number, ph: number, negative = false) {
  const kx = pw / box.w, ky = ph / box.h;
  return renderGray(shape, pw, ph, mul([kx, 0, 0, ky, -box.x * kx, -box.y * ky], shape.matrix), negative);
}

export async function ditherRaw(
  gray: Uint8Array, width: number, height: number, mode: DitherMode, screen?: { cell: number; angle: number },
): Promise<Uint8Array> {
  const headers: Record<string, string> = { "x-width": String(width), "x-height": String(height), "x-mode": mode };
  if (screen) Object.assign(headers, { "x-cell": String(screen.cell), "x-angle": String(screen.angle) });
  const out = await invoke<ArrayBuffer>("dither_raw", gray, { headers });
  return new Uint8Array(out);
}

// ---------------------------------------------------------- Aperçu tramé

const MAX_PREVIEW_PIXELS = 2_000_000;
const previews = new Map<string, { key: string; canvas: HTMLCanvasElement | null }>();
const listeners = new Set<() => void>();

export function onPreviewReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Aperçu tramé d'une image dans son repère local ; `null` tant qu'il est en calcul. */
export function ditherPreview(shape: ImageShape, layer: Layer): HTMLCanvasElement | null {
  if (!isTauri()) return null;
  let pw = Math.max(1, Math.round(shape.width / layer.interval));
  let ph = Math.max(1, Math.round(shape.height / layer.interval));
  const k = Math.min(1, Math.sqrt(MAX_PREVIEW_PIXELS / (pw * ph)));
  pw = Math.max(1, Math.round(pw * k));
  ph = Math.max(1, Math.round(ph * k));
  // Cellule de demi-teinte en pixels de l'aperçu (qui peut être sous-échantillonné).
  const screen = { cell: (25.4 / Math.max(1, layer.halftoneLpi) / layer.interval) * k, angle: layer.halftoneAngle };
  const maskKey = shape.mask ? shape.mask.reduce((n, p) => n + p.pts.length + p.pts[0][0], 0) : 0;
  const key = `${shape.src.length}:${shape.src.slice(-40)}|${JSON.stringify(shape.adjust)}|${layer.dither}|${layer.negative}|${pw}x${ph}|${screen.cell}|${screen.angle}|${maskKey}`;
  const entry = previews.get(shape.id);
  if (entry?.key === key) return entry.canvas;
  previews.set(shape.id, { key, canvas: entry?.canvas ?? null });

  (async () => {
    const gray = await renderGray(shape, pw, ph, [pw / shape.width, 0, 0, ph / shape.height, 0, 0], layer.negative);
    const out = layer.dither === "grayscale" ? gray : await ditherRaw(gray, pw, ph, layer.dither, screen);
    if (previews.get(shape.id)?.key !== key) return; // réglages changés entre-temps
    const canvas = document.createElement("canvas");
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(pw, ph);
    for (let i = 0; i < out.length; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = out[i];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    previews.set(shape.id, { key, canvas });
    listeners.forEach((l) => l());
  })().catch(() => {});
  return entry?.canvas ?? null;
}
