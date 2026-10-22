// Import HPGL (.plt / .hpgl) : PU/PD/PA/PR, un groupe par plume (SP).

import { joinPaths } from "../geometry";
import type { Polyline, Pt } from "../model";
import type { ImportResult } from "./svg";
import { t } from "../i18n";

let UNITS_PER_MM = 40;
const PEN_COLORS = ["#000000", "#ff0000", "#00a000", "#0000ff", "#ff8000", "#a000a0", "#00a0a0", "#808080"];

/** `perInch` : unités HPGL par pouce (1016 en standard, 1000 pour certaines découpeuses). */
export function parseHpgl(text: string, perInch = 1016): ImportResult {
  UNITS_PER_MM = perInch / 25.4;
  const groups = new Map<number, Polyline[]>();
  let pen = 1;
  let down = false;
  let relative = false;
  let pos: Pt = [0, 0];
  let cur: Pt[] = [];
  const flush = () => {
    if (cur.length >= 2) groups.set(pen, [...(groups.get(pen) ?? []), { pts: cur, closed: false }]);
    cur = [];
  };
  const commands = text.replace(/\s+/g, " ").split(/;|(?=[A-Z]{2}[^A-Z])/).map((c) => c.trim()).filter(Boolean);
  let known = 0;
  for (const c of commands) {
    const op = c.slice(0, 2).toUpperCase();
    const nums = (c.slice(2).match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    const moveTo = () => {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pos = relative ? [pos[0] + nums[i], pos[1] + nums[i + 1]] : [nums[i], nums[i + 1]];
        if (down) cur.push(pos);
      }
    };
    switch (op) {
      case "IN":
        known++;
        break;
      case "SP":
        known++;
        flush();
        pen = nums[0] ?? 1;
        break;
      case "PU":
        known++;
        flush();
        down = false;
        moveTo();
        break;
      case "PD":
        known++;
        if (!down) cur = [pos];
        down = true;
        moveTo();
        break;
      case "PA":
        known++;
        relative = false;
        moveTo();
        break;
      case "PR":
        known++;
        relative = true;
        moveTo();
        break;
    }
  }
  flush();
  if (!known) throw new Error(t("Fichier HPGL illisible"));
  const toMm = (p: Polyline): Polyline => ({ closed: p.closed, pts: p.pts.map(([x, y]): Pt => [x / UNITS_PER_MM, -y / UNITS_PER_MM]) });
  return {
    groups: [...groups].sort((a, b) => a[0] - b[0]).map(([p, paths]) => ({ color: PEN_COLORS[(p - 1 + 8) % 8], paths: joinPaths(paths.map(toMm)) })),
    warnings: [],
  };
}
