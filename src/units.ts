// Unités d'affichage : le projet est toujours en millimètres ; l'interface peut afficher des pouces.

import { useStore } from "./store";

export const MM_PER_INCH = 25.4;

/** Unités exprimées en millimètres et leur équivalent en pouces. */
const INCH_UNITS: Record<string, string> = { mm: "in", "mm/min": "in/min", "mm/s": "in/s", "mm/s²": "in/s²" };

export const useInches = () => useStore((s) => s.toolOptions.units === "in");

/** Facteur d'affichage et unité affichée pour une unité en millimètres. */
export function displayUnit(unit: string | undefined, inches: boolean): { k: number; unit: string | undefined } {
  if (!inches || !unit || !(unit in INCH_UNITS)) return { k: 1, unit };
  return { k: MM_PER_INCH, unit: INCH_UNITS[unit] };
}

