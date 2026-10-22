// Positions enregistrées (fenêtre Déplacer de LightBurn), en coordonnées de travail.

import { useSyncExternalStore } from "react";

export interface SavedPosition {
  name: string;
  x: number;
  y: number;
  /** Hauteur Z (si la machine a un axe Z). */
  z?: number;
}

const KEY = "lumiere.positions";
const listeners = new Set<() => void>();

function read(): SavedPosition[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

let positions = read();

function write(next: SavedPosition[]) {
  positions = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // stockage indisponible
  }
  listeners.forEach((l) => l());
}

export const usePositions = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => positions,
  );

/** Ajoute (ou remplace, à nom égal) une position. */
export const savePosition = (p: SavedPosition) => write([...positions.filter((q) => q.name !== p.name), p].sort((a, b) => a.name.localeCompare(b.name)));
export const deletePosition = (name: string) => write(positions.filter((q) => q.name !== name));
