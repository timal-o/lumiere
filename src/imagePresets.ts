// Préréglages d'image : réglages de l'image et du calque Image, réutilisables (Ajuster l'image).

import { useSyncExternalStore } from "react";
import { tk } from "./i18n";
import { DEFAULT_ADJUST, type CutSettings, type ImageAdjust, type ImageShape } from "./model";
import { commit, getState } from "./store";

type LayerPart = Pick<CutSettings, "dither" | "interval" | "negative" | "dotWidth" | "halftoneLpi" | "halftoneAngle" | "imageSlices">;

export interface ImagePreset {
  name: string;
  adjust: ImageAdjust;
  layer: Partial<LayerPart>;
  builtIn?: boolean;
}

/** Préréglages fournis : points de départ courants. */
export const BUILT_IN: ImagePreset[] = [
  { name: tk("Photo (diffusion Jarvis)"), builtIn: true, adjust: { ...DEFAULT_ADJUST, contrast: 10, enhanceAmount: 60, enhanceRadius: 0.5 }, layer: { dither: "jarvis" } },
  { name: tk("Dessin au trait (seuil)"), builtIn: true, adjust: { ...DEFAULT_ADJUST, contrast: 40 }, layer: { dither: "threshold" } },
  { name: tk("Demi-teinte journal"), builtIn: true, adjust: { ...DEFAULT_ADJUST }, layer: { dither: "halftone", halftoneLpi: 60, halftoneAngle: 45 } },
  { name: tk("Relief 3D en niveaux de gris"), builtIn: true, adjust: { ...DEFAULT_ADJUST }, layer: { dither: "grayscale" } },
  { name: tk("Surface sombre (négatif)"), builtIn: true, adjust: { ...DEFAULT_ADJUST }, layer: { dither: "jarvis", negative: true } },
];

const KEY = "lumiere.imagePresets";
const listeners = new Set<() => void>();

function read(): ImagePreset[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

let user = read();

function write(next: ImagePreset[]) {
  user = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // stockage indisponible
  }
  listeners.forEach((l) => l());
}

export const useImagePresets = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => user,
  );

/** Enregistre les réglages de l'image et de son calque sous un nom (remplace un préréglage du même nom). */
export function saveImagePreset(name: string, image: ImageShape) {
  const l = getState().project.layers.find((x) => x.id === image.layerId);
  const layer: Partial<LayerPart> = l
    ? { dither: l.dither, interval: l.interval, negative: l.negative, dotWidth: l.dotWidth, halftoneLpi: l.halftoneLpi, halftoneAngle: l.halftoneAngle, imageSlices: l.imageSlices }
    : {};
  write([...user.filter((p) => p.name !== name), { name, adjust: { ...image.adjust }, layer }].sort((a, b) => a.name.localeCompare(b.name)));
}

export const deleteImagePreset = (name: string) => write(user.filter((p) => p.name !== name));

/** Applique un préréglage à l'image et à son calque, en une seule étape annulable. */
export function applyImagePreset(p: ImagePreset, image: ImageShape) {
  commit((proj) => ({
    ...proj,
    shapes: proj.shapes.map((s) => (s.id === image.id && s.kind === "image" ? { ...s, adjust: { ...DEFAULT_ADJUST, ...p.adjust } } : s)),
    layers: proj.layers.map((l) => (l.id === image.layerId ? { ...l, ...p.layer } : l)),
  }));
}
