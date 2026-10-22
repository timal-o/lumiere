// Bibliothèque d'art : formes enregistrées pour être réutilisées d'un projet à l'autre.

import { useSyncExternalStore } from "react";
import { mul, shapeBox, translate, unionBoxes, worldPaths } from "./geometry";
import { uid, type Shape } from "./model";
import { t } from "./i18n";

export interface ArtItem {
  id: string;
  name: string;
  /** Formes ramenées à l'origine (coin haut gauche de leur boîte en 0, 0). */
  shapes: Shape[];
  /** Aperçu : données de chemin SVG dans un carré de 100 unités. */
  thumb: string;
}

/** Plusieurs bibliothèques d'art peuvent être chargées ; une seule est affichée. */
export interface ArtLibrary {
  id: string;
  name: string;
  items: ArtItem[];
}

const KEY = "lumiere.art"; // ancienne bibliothèque unique
const LIBS = "lumiere.artLibs";
const listeners = new Set<() => void>();

function readLibs(): { libs: ArtLibrary[]; current: string } {
  try {
    const raw = localStorage.getItem(LIBS);
    if (raw) {
      const v = JSON.parse(raw) as { libs: ArtLibrary[]; current: string };
      if (v.libs?.length) return v;
    }
    const lib: ArtLibrary = { id: uid(), name: t("Mes dessins"), items: JSON.parse(localStorage.getItem(KEY) ?? "[]") as ArtItem[] };
    return { libs: [lib], current: lib.id };
  } catch {
    const lib: ArtLibrary = { id: uid(), name: t("Mes dessins"), items: [] };
    return { libs: [lib], current: lib.id };
  }
}

let state = readLibs();
const current = () => state.libs.find((l) => l.id === state.current) ?? state.libs[0];
let items = current().items;

function save(next: { libs: ArtLibrary[]; current: string }) {
  state = next;
  items = current().items;
  try {
    localStorage.setItem(LIBS, JSON.stringify(next));
  } catch {
    throw new Error(t("Bibliothèque pleine : supprimez des éléments (les images prennent beaucoup de place)"));
  }
  listeners.forEach((l) => l());
}

function write(next: ArtItem[]) {
  const id = current().id;
  save({ ...state, libs: state.libs.map((l) => (l.id === id ? { ...l, items: next } : l)) });
}

export function useArtLibraries(): { libs: ArtLibrary[]; current: string } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const switchArtLibrary = (id: string) => save({ ...state, current: id });
export function newArtLibrary(name: string) {
  const lib: ArtLibrary = { id: uid(), name, items: [] };
  save({ libs: [...state.libs, lib], current: lib.id });
}
export const renameArtLibrary = (id: string, name: string) => save({ ...state, libs: state.libs.map((l) => (l.id === id ? { ...l, name } : l)) });
export function unloadArtLibrary(id: string) {
  if (state.libs.length < 2) return;
  const libs = state.libs.filter((l) => l.id !== id);
  save({ libs, current: state.current === id ? libs[0].id : state.current });
}

export function useArt(): ArtItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
}

function thumbnail(shapes: Shape[]): string {
  const box = unionBoxes(shapes.map(shapeBox));
  if (!box) return "";
  const k = 90 / Math.max(box.w, box.h, 1e-9);
  const ox = 5 + (90 - box.w * k) / 2, oy = 5 + (90 - box.h * k) / 2;
  return shapes
    .flatMap(worldPaths)
    .map((p) => p.pts.filter((_, i) => i % Math.max(1, Math.floor(p.pts.length / 200)) === 0)
      .map(([x, y], i) => `${i ? "L" : "M"}${(ox + (x - box.x) * k).toFixed(1)} ${(oy + (y - box.y) * k).toFixed(1)}`).join("") + (p.closed ? "Z" : ""))
    .join("");
}

export function addArt(name: string, shapes: Shape[]) {
  const box = unionBoxes(shapes.map(shapeBox));
  if (!box) return;
  const t = translate(-box.x, -box.y);
  write([...items, { id: uid(), name, shapes: shapes.map((s) => ({ ...s, matrix: mul(t, s.matrix) })), thumb: thumbnail(shapes) }]);
}

export function deleteArt(id: string) {
  write(items.filter((i) => i.id !== id));
}

export function renameArt(id: string, name: string) {
  write(items.map((i) => (i.id === id ? { ...i, name } : i)));
}

/** Copies prêtes à insérer en (x, y), avec de nouveaux identifiants et groupes. */
export function instantiate(item: ArtItem, x: number, y: number, layerId?: number): Shape[] {
  const groups = new Map<string, string>();
  const groupId = item.shapes.length > 1 ? uid() : undefined;
  return item.shapes.map((s) => {
    let g = s.groupId;
    if (g) {
      if (!groups.has(g)) groups.set(g, uid());
      g = groups.get(g);
    }
    return { ...s, id: uid(), groupId: g ?? groupId, layerId: layerId ?? s.layerId, matrix: mul(translate(x, y), s.matrix) };
  });
}

/** Fichier de bibliothèque d'art (partage entre postes). */
export const exportArt = () => JSON.stringify({ format: "lumiere-art", version: 1, name: current().name, items }, null, 2);

/** Ajoute les éléments d'un fichier (les noms déjà présents sont remplacés) ; renvoie leur nombre. */
export function importArt(json: string): number {
  const data = JSON.parse(json) as { format?: string; items?: ArtItem[] };
  if (data.format !== "lumiere-art" || !Array.isArray(data.items)) throw new Error(t("Ce n'est pas une bibliothèque d'art Lumière"));
  const names = new Set(data.items.map((i) => i.name));
  write([...items.filter((i) => !names.has(i.name)), ...data.items.map((i) => ({ ...i, id: uid() }))]);
  return data.items.length;
}
