// Dessin de l'aperçu de trajectoire : sur le plan de travail et pour « Enregistrer l'image ».

import type { Toolpath } from "../toolpath";

export interface PreviewStyle {
  /** Couleur de chaque calque du G-code (indices de `toolpath.layers`), et par défaut. */
  layerColors: string[];
  burn: string;
  travel: string;
  /** Teinte selon la puissance ; blanc sur noir ; déplacements à vide. */
  shade: boolean;
  invert: boolean;
  showTravel: boolean;
  lineWidth: number;
}

const LEVELS = 8;

/** Trace les `shown` premiers segments ; `map` convertit les mm du plateau en pixels. */
export function drawToolpath(ctx: CanvasRenderingContext2D, tp: Toolpath, shown: number, map: (x: number, y: number) => [number, number], st: PreviewStyle) {
  const { segs, burn, layer, power, maxPower } = tp;
  const n = Math.min(shown, tp.count);
  const line = (i: number) => {
    const [ax, ay] = map(segs[i * 4], segs[i * 4 + 1]);
    const [bx, by] = map(segs[i * 4 + 2], segs[i * 4 + 3]);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  };
  if (st.showTravel) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) if (!burn[i]) line(i);
    ctx.strokeStyle = st.travel;
    ctx.lineWidth = st.lineWidth * 0.6;
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  // Un tracé par calque et par niveau de puissance.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!burn[i]) continue;
    const lv = st.shade && maxPower > 0 ? Math.max(1, Math.round((power[i] / maxPower) * (LEVELS - 1))) : LEVELS - 1;
    const key = layer[i] * LEVELS + lv;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  for (const [key, idx] of groups) {
    const li = Math.floor(key / LEVELS), lv = key % LEVELS;
    ctx.beginPath();
    for (const i of idx) line(i);
    ctx.strokeStyle = st.invert ? "#ffffff" : st.shade ? "#000000" : st.layerColors[li] ?? st.burn;
    ctx.globalAlpha = st.shade ? lv / (LEVELS - 1) : 1;
    ctx.lineWidth = st.lineWidth;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Image PNG de l'aperçu complet, `pxPerMm` pixels par mm (fond transparent ou opaque). */
export function renderToolpathPng(tp: Toolpath, bedWidth: number, bedHeight: number, st: PreviewStyle, transparent: boolean): Promise<Blob | null> {
  const k = Math.min(10, 6000 / Math.max(bedWidth, bedHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bedWidth * k);
  canvas.height = Math.round(bedHeight * k);
  const ctx = canvas.getContext("2d")!;
  if (!transparent || st.invert) {
    ctx.fillStyle = st.invert ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawToolpath(ctx, tp, tp.count, (x, y) => [x * k, y * k], { ...st, lineWidth: Math.max(1, k * 0.15) });
  return new Promise((res) => canvas.toBlob(res, "image/png"));
}
