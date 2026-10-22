// Bibliothèque de matériaux : réglages de calque enregistrés par matériau et épaisseur.

import { useSyncExternalStore } from "react";
import { uid, type Layer } from "./model";
import { t } from "./i18n";
import { parseClb, withIds } from "./clb";

export type LayerSettings = Omit<Layer, "id" | "name" | "output" | "visible" | "libraryLink">;

export interface Preset {
  id: string;
  material: string;
  thickness: number | null; // mm
  description: string;
  settings: LayerSettings;
}

/** Plusieurs bibliothèques peuvent être chargées ; une seule est affichée et modifiée. */
export interface Library {
  id: string;
  name: string;
  presets: Preset[];
}

const KEY = "lumiere.materials"; // ancienne bibliothèque unique
const LIBS = "lumiere.materialLibs";
const listeners = new Set<() => void>();

function readLibs(): { libs: Library[]; current: string } {
  try {
    const raw = localStorage.getItem(LIBS);
    if (raw) {
      const v = JSON.parse(raw) as { libs: Library[]; current: string };
      if (v.libs?.length) return v;
    }
    const old = localStorage.getItem(KEY);
    const lib: Library = { id: uid(), name: t("Ma bibliothèque"), presets: old ? (JSON.parse(old) as Preset[]) : [] };
    return { libs: [lib], current: lib.id };
  } catch {
    const lib: Library = { id: uid(), name: t("Ma bibliothèque"), presets: [] };
    return { libs: [lib], current: lib.id };
  }
}

let libState = readLibs();
const currentLib = () => libState.libs.find((l) => l.id === libState.current) ?? libState.libs[0];
let presets = currentLib().presets;

function saveLibs(next: { libs: Library[]; current: string }) {
  libState = next;
  presets = currentLib().presets;
  try {
    localStorage.setItem(LIBS, JSON.stringify(next));
  } catch {
    // stockage indisponible : les bibliothèques restent en mémoire pour la session
  }
  listeners.forEach((l) => l());
}

function write(next: Preset[]) {
  const cur = currentLib().id;
  saveLibs({ ...libState, libs: libState.libs.map((l) => (l.id === cur ? { ...l, presets: next } : l)) });
}

export function useLibraries(): { libs: Library[]; current: string } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => libState,
  );
}

export const switchLibrary = (id: string) => saveLibs({ ...libState, current: id });

export function newLibrary(name: string, list: Preset[] = []) {
  const lib: Library = { id: uid(), name, presets: list };
  saveLibs({ libs: [...libState.libs, lib], current: lib.id });
}

export const renameLibrary = (id: string, name: string) => saveLibs({ ...libState, libs: libState.libs.map((l) => (l.id === id ? { ...l, name } : l)) });

/** Décharge une bibliothèque (il en reste toujours une). */
export function unloadLibrary(id: string) {
  if (libState.libs.length < 2) return;
  const libs = libState.libs.filter((l) => l.id !== id);
  saveLibs({ libs, current: libState.current === id ? libs[0].id : libState.current });
}

/** Réglages de toutes les bibliothèques chargées (pour les calques liés). */
export const allPresets = () => libState.libs.flatMap((l) => l.presets);

/** Entrées d'un fichier de bibliothèque (Lumière JSON ou LightBurn .clb). */
export function parseLibraryFile(text: string): Preset[] {
  if (text.trimStart().startsWith("<")) return withIds(parseClb(text));
  const data = JSON.parse(text) as { format?: string; presets?: Preset[] };
  if (data.format !== "lumiere-materials" || !Array.isArray(data.presets)) throw new Error(t("Fichier de bibliothèque invalide"));
  return data.presets;
}

export type MergeRule = "keep" | "replace" | "renameNew" | "renameOld";

/**
 * Fusionne des entrées dans une liste. Deux entrées sont « identiques » si matériau, épaisseur
 * et description sont les mêmes ; la règle choisit laquelle garder (ou renomme l'une des deux).
 */
export function mergePresets(mine: Preset[], incoming: Preset[], rule: MergeRule): Preset[] {
  const key = (p: Preset) => `${p.material}\u0000${p.thickness ?? ""}\u0000${p.description}`;
  const out = [...mine];
  for (const p of incoming) {
    const i = out.findIndex((q) => key(q) === key(p));
    if (i < 0) out.push({ ...p, id: out.some((q) => q.id === p.id) ? uid() : p.id });
    else if (rule === "replace") out[i] = { ...p, id: out[i].id };
    else if (rule === "renameNew") out.push({ ...p, id: uid(), description: `${p.description} (${t("nouveau")})` });
    else if (rule === "renameOld") {
      out[i] = { ...out[i], description: `${out[i].description} (${t("ancien")})` };
      out.push({ ...p, id: uid() });
    }
  }
  return out;
}

export const mergeIntoCurrent = (incoming: Preset[], rule: MergeRule) => write(mergePresets(presets, incoming, rule));

export function usePresets(): Preset[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => presets,
  );
}

export function settingsOf(layer: Layer): LayerSettings {
  const { id: _i, name: _n, output: _o, visible: _v, libraryLink: _l, ...settings } = layer;
  return settings;
}

export const presetLabel = (p: Preset) => `${p.material}${p.thickness != null ? ` ${p.thickness} mm` : ""} — ${p.description}`;

export const currentPresets = () => presets;

/** Calques liés : leurs réglages repris de la bibliothèque (un lien vers un réglage disparu est gardé tel quel). */
export function syncLinks(layers: Layer[], library: Preset[] = allPresets()): Layer[] {
  return layers.map((l) => {
    const p = l.libraryLink && library.find((x) => x.id === l.libraryLink!.id);
    return p ? { ...l, ...p.settings, id: l.id, name: l.name, output: l.output, visible: l.visible, libraryLink: { id: p.id, label: presetLabel(p) } } : l;
  });
}

/** Remplace les réglages d'une entrée (par ceux d'un calque). */
export function updatePreset(id: string, settings: LayerSettings) {
  write(presets.map((p) => (p.id === id ? { ...p, settings } : p)));
}

export function savePreset(p: Omit<Preset, "id">) {
  write([...presets, { ...p, id: uid() }].sort((a, b) => a.material.localeCompare(b.material) || (a.thickness ?? 0) - (b.thickness ?? 0)));
}

export function deletePreset(id: string) {
  write(presets.filter((p) => p.id !== id));
}

export const exportPresets = () => JSON.stringify({ format: "lumiere-materials", version: 1, name: currentLib().name, presets }, null, 2);

export function importPresets(json: string): number {
  // Bibliothèque LightBurn (.clb, XML).
  if (json.trimStart().startsWith("<")) {
    const added = withIds(parseClb(json));
    write([...presets, ...added]);
    return added.length;
  }
  const data = JSON.parse(json) as { format?: string; presets?: Preset[] };
  if (data.format !== "lumiere-materials" || !Array.isArray(data.presets)) throw new Error(t("Fichier de bibliothèque invalide"));
  const known = new Set(presets.map((p) => p.id));
  const added = data.presets.filter((p) => !known.has(p.id));
  write([...presets, ...added]);
  return added.length;
}
