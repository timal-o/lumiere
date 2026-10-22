// Relit le G-code généré pour l'aperçu et la simulation.

import { bedToMachine } from "./geometry";
import type { MachineSettings } from "./model";

export interface Toolpath {
  /** Segments [x0, y0, x1, y1] en coordonnées plateau, dans l'ordre d'exécution. */
  segs: Float32Array;
  /** 1 = laser allumé, 0 = déplacement. */
  burn: Uint8Array;
  /** Index (dans `layers`) du calque de chaque segment. */
  layer: Uint16Array;
  /** Noms des calques, d'après les commentaires « ; Calque … » du générateur. */
  layers: string[];
  /** Ligne du G-code (indice à partir de 0) qui produit chaque segment. */
  line: Uint32Array;
  /** Puissance (S) de chaque segment, et la plus forte du travail. */
  power: Float32Array;
  maxPower: number;
  count: number;
}

export function parseToolpath(gcode: string, m: MachineSettings): Toolpath {
  const segs: number[] = [];
  const burn: number[] = [];
  const layerOf: number[] = [];
  const layers: string[] = [];
  const lineOf: number[] = [];
  const powerOf: number[] = [];
  const toBed = (x: number, y: number) => bedToMachine([x, y], m.origin, m.bedWidth, m.bedHeight);
  let [mx, my] = [0, 0];
  let motion = 0;
  let s = 0;
  let laserOn = false;
  const all = gcode.split("\n");
  for (let index = 0; index < all.length; index++) {
    const raw = all[index];
    const comment = /^;\s*Calque\s+(.+)$/.exec(raw.trim());
    if (comment) layers.push(comment[1]);
    const line = raw.split(";")[0].trim().toUpperCase();
    if (!line) continue;
    let nx = mx, ny = my, moved = false;
    for (const [, letter, value] of line.matchAll(/([A-Z])([-+]?[\d.]+)/g)) {
      const v = parseFloat(value);
      if (letter === "G" && (v === 0 || v === 1)) motion = v;
      else if (letter === "M" && (v === 3 || v === 4)) laserOn = true;
      else if (letter === "M" && v === 5) laserOn = false;
      else if (letter === "S") s = v;
      else if (letter === "X") { nx = v; moved = true; }
      else if (letter === "Y") { ny = v; moved = true; }
    }
    if (moved && (nx !== mx || ny !== my)) {
      const [ax, ay] = toBed(mx, my);
      const [bx, by] = toBed(nx, ny);
      segs.push(ax, ay, bx, by);
      burn.push(motion === 1 && laserOn && s > 0 ? 1 : 0);
      layerOf.push(Math.max(0, layers.length - 1));
      lineOf.push(index);
      powerOf.push(s);
      mx = nx;
      my = ny;
    }
  }
  return {
    segs: Float32Array.from(segs), burn: Uint8Array.from(burn), layer: Uint16Array.from(layerOf), layers,
    line: Uint32Array.from(lineOf), power: Float32Array.from(powerOf), maxPower: powerOf.reduce((a, b) => Math.max(a, b), 0), count: burn.length,
  };
}

/**
 * G-code pour reprendre un travail à la ligne `from` (Aperçu → Démarrer ici) : l'état de la
 * machine à cet endroit (mode, unités, laser, puissance, vitesse, air, Z, position) est
 * rétabli avant les lignes restantes.
 */
export function gcodeFrom(gcode: string, from: number): string {
  const lines = gcode.split("\n");
  let laser = "M4", motion = "G0", feed: string | null = null, s = "0", air: string | null = null;
  let x: string | null = null, y: string | null = null, z: string | null = null;
  for (const raw of lines.slice(0, from)) {
    const line = raw.split(";")[0].trim().toUpperCase();
    for (const [, letter, value] of line.matchAll(/([A-Z])([-+]?[\d.]+)/g)) {
      const v = parseFloat(value);
      if (letter === "M" && (v === 3 || v === 4)) laser = `M${v}`;
      else if (letter === "M" && (v === 7 || v === 8)) air = `M${v}`;
      else if (letter === "M" && v === 9) air = null;
      else if (letter === "G" && (v === 0 || v === 1)) motion = `G${v}`;
      else if (letter === "F") feed = value;
      else if (letter === "S") s = value;
      else if (letter === "X") x = value;
      else if (letter === "Y") y = value;
      else if (letter === "Z") z = value;
    }
  }
  const head = ["; Reprise du travail", "G90", "G21", `${laser} S0`];
  if (air) head.push(air);
  if (z !== null) head.push(`G0 Z${z}`);
  if (x !== null && y !== null) head.push(`G0 X${x} Y${y}`);
  // Vitesse et puissance modales pour la première ligne reprise (qui peut ne pas les répéter).
  if (feed !== null) head.push(`${motion === "G1" ? "G1" : "G0"} F${feed} S${s}`);
  else head.push(`S${s}`);
  return [...head, ...lines.slice(from)].join("\n");
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}
