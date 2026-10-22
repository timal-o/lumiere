// Caméra : homographie image → plateau à partir de 4 repères, redressement de l'image,
// état partagé de l'incrustation sur le plan de travail.

import { useSyncExternalStore } from "react";
import type { Pt } from "./model";
import { t } from "./i18n";

/** Matrice 3×3 en ligne : [h11, h12, h13, h21, h22, h23, h31, h32, h33]. */
export type Homography = number[];

/** Résout A·x = b (élimination de Gauss avec pivot partiel). */
export function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) throw new Error(t("Repères alignés ou confondus : impossible de calibrer"));
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Homographie qui envoie les 4 points `src` sur les 4 points `dst`. */
export function homography(src: Pt[], dst: Pt[]): Homography {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(a, b), 1];
}

export function applyH(h: Homography, [x, y]: Pt): Pt {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

export function invertH(h: Homography): Homography {
  const [a, b, c, d, e, f, g, k, l] = h;
  const A = e * l - f * k, B = -(d * l - f * g), C = d * k - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) throw new Error(t("Calibration dégénérée"));
  return [A, -(b * l - c * k), b * f - c * e, B, a * l - c * g, -(a * f - c * d), C, -(a * k - b * g), a * e - b * d].map((v) => v / det);
}

/**
 * Redresse l'image de la caméra dans le repère plateau : `toCamera` (plateau → pixels
 * caméra) est échantillonnée pour chaque pixel de sortie (`pxPerMm` pixels par mm).
 */
export function warpToBed(
  src: ImageData, toCamera: Homography, bedWidth: number, bedHeight: number, pxPerMm: number, k1 = 0,
): ImageData {
  const w = Math.max(1, Math.round(bedWidth * pxPerMm)), h = Math.max(1, Math.round(bedHeight * pxPerMm));
  const out = new ImageData(w, h);
  const [a, b, c, d, e, f, g, k, l] = toCamera;
  for (let y = 0; y < h; y++) {
    const by = (y + 0.5) / pxPerMm;
    for (let x = 0; x < w; x++) {
      const bx = (x + 0.5) / pxPerMm;
      const iw = g * bx + k * by + l;
      let ux = (a * bx + b * by + c) / iw, uy = (d * bx + e * by + f) / iw;
      if (k1) [ux, uy] = distort([ux, uy], k1, src.width, src.height);
      const sx = Math.floor(ux), sy = Math.floor(uy);
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const si = (sy * src.width + sx) * 4, di = (y * w + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

// ------------------------------------------------------------- État partagé

export interface CameraCalibration {
  deviceId: string;
  /** Pixels caméra (corrigés de la distorsion) → mm plateau. */
  toBed: Homography;
  width: number;
  height: number;
  /** Distorsion radiale de l'objectif (négatif : « fisheye » / barillet). */
  k1: number;
}

/** Modèle radial simple : p_d = c + (p_u − c)(1 + k1·r²), r normalisé par la demi-diagonale. */
export function distort([x, y]: Pt, k1: number, w: number, h: number): Pt {
  const cx = w / 2, cy = h / 2, n = Math.hypot(cx, cy);
  const ux = (x - cx) / n, uy = (y - cy) / n;
  const f = 1 + k1 * (ux * ux + uy * uy);
  return [cx + ux * f * n, cy + uy * f * n];
}

/** Inverse de `distort` par itérations de point fixe. */
export function undistort(p: Pt, k1: number, w: number, h: number): Pt {
  const cx = w / 2, cy = h / 2, n = Math.hypot(cx, cy);
  const dx = (p[0] - cx) / n, dy = (p[1] - cy) / n;
  let ux = dx, uy = dy;
  for (let i = 0; i < 100; i++) {
    const f = 1 + k1 * (ux * ux + uy * uy);
    ux = dx / f;
    uy = dy / f;
  }
  return [cx + ux * n, cy + uy * n];
}

interface CameraState {
  calibration: CameraCalibration | null;
  overlay: HTMLCanvasElement | null;
  opacity: number;
  visible: boolean;
}

const KEY = "lumiere.camera";
const listeners = new Set<() => void>();

function loadCalibration(): CameraCalibration | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

let state: CameraState = { calibration: loadCalibration(), overlay: null, opacity: 0.8, visible: true };

export function setCamera(patch: Partial<CameraState>) {
  state = { ...state, ...patch };
  if ("calibration" in patch) {
    try {
      localStorage.setItem(KEY, JSON.stringify(patch.calibration));
    } catch {
      // ignoré : la calibration restera valable pour la session
    }
  }
  listeners.forEach((l) => l());
}

export const getCamera = () => state;

export function useCamera<T>(select: (s: CameraState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

/** Prend une image de la vidéo et met à jour l'incrustation redressée. */
export function captureOverlay(video: HTMLVideoElement, bedWidth: number, bedHeight: number) {
  const cal = state.calibration;
  if (!cal || !video.videoWidth) return;
  const grab = document.createElement("canvas");
  grab.width = video.videoWidth;
  grab.height = video.videoHeight;
  const g = grab.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(video, 0, 0);
  // La calibration a pu être faite à une autre résolution : on remet les pixels à l'échelle.
  const kx = video.videoWidth / cal.width, ky = video.videoHeight / cal.height;
  const toBed = [cal.toBed[0] / kx, cal.toBed[1] / ky, cal.toBed[2], cal.toBed[3] / kx, cal.toBed[4] / ky, cal.toBed[5], cal.toBed[6] / kx, cal.toBed[7] / ky, cal.toBed[8]];
  const pxPerMm = Math.min(4, 2000 / Math.max(bedWidth, bedHeight));
  const warped = warpToBed(g.getImageData(0, 0, grab.width, grab.height), invertH(toBed), bedWidth, bedHeight, pxPerMm, cal.k1 ?? 0);
  const canvas = document.createElement("canvas");
  canvas.width = warped.width;
  canvas.height = warped.height;
  canvas.getContext("2d")!.putImageData(warped, 0, 0);
  setCamera({ overlay: canvas });
}
