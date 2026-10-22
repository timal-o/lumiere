// Grilles de test : deux paramètres variables (colonnes × lignes), les autres fixes.
// Couvre le test de matériau (puissance × vitesse), d'intervalle et de focus (Z).

import type { Job, JobLayer } from "./backend";
import { rectPath } from "./geometry";
import { layerParams, machineParams } from "./job";
import { DEFAULT_CUT, type CutSettings, type LayerMode, type MachineSettings, type Polyline } from "./model";
import { defaultFont, textPaths } from "./text";
import { t, tk } from "./i18n";

export type TestParam = "power" | "speed" | "interval" | "passes" | "zOffset";

export const PARAM_LABEL: Record<TestParam, string> = {
  power: tk("Puissance (%)"),
  speed: tk("Vitesse (mm/min)"),
  interval: tk("Pas (mm)"),
  passes: tk("Passes"),
  zOffset: tk("Décalage Z (mm)"),
};

export interface TestAxis {
  param: TestParam;
  min: number;
  max: number;
  steps: number;
}

export interface MaterialTestOptions {
  mode: Exclude<LayerMode, "image" | "offsetFill">;
  cols: TestAxis;
  rows: TestAxis;
  /** Réglages des paramètres qui ne varient pas. */
  base: { power: number; speed: number; interval: number; passes: number; zOffset: number };
  cellSize: number;
  gap: number;
  /** Coin haut gauche de la grille sur le plateau (mm). */
  x: number;
  y: number;
  labels: boolean;
  labelPower: number;
  labelSpeed: number;
  /** Titre gravé au-dessus de la grille (réglages des légendes). */
  title?: string;
  /** Bordure découpée autour du test, en dernier. */
  border?: boolean;
  borderPower?: number;
  borderSpeed?: number;
}

const TITLE_H = 6; // hauteur réservée au titre (mm)
const BORDER_MARGIN = 3; // marge entre la grille et la bordure (mm)

export const DEFAULT_TEST: MaterialTestOptions = {
  mode: "fill",
  cols: { param: "power", min: 10, max: 100, steps: 10 },
  rows: { param: "speed", min: 500, max: 5000, steps: 10 },
  base: { power: 50, speed: 2000, interval: 0.1, passes: 1, zOffset: 0 },
  cellSize: 5,
  gap: 2,
  x: 20,
  y: 20,
  labels: true,
  labelPower: 20,
  labelSpeed: 3000,
};

/** Préréglages équivalents aux tests de LightBurn. */
export const TEST_PRESETS: Record<string, Pick<MaterialTestOptions, "mode" | "cols" | "rows">> = {
  [tk("Puissance × vitesse")]: { mode: "fill", cols: { param: "power", min: 10, max: 100, steps: 10 }, rows: { param: "speed", min: 500, max: 5000, steps: 10 } },
  [tk("Intervalle")]: { mode: "fill", cols: { param: "interval", min: 0.05, max: 0.3, steps: 6 }, rows: { param: "power", min: 20, max: 80, steps: 4 } },
  [tk("Focus (Z)")]: { mode: "line", cols: { param: "zOffset", min: -3, max: 3, steps: 7 }, rows: { param: "speed", min: 1000, max: 1000, steps: 1 } },
  [tk("Passes × puissance")]: { mode: "line", cols: { param: "passes", min: 1, max: 6, steps: 6 }, rows: { param: "power", min: 40, max: 100, steps: 4 } },
};

const lerp = (a: TestAxis, i: number) => (a.steps <= 1 ? a.min : a.min + ((a.max - a.min) * i) / (a.steps - 1));

const roundFor = (p: TestParam, v: number) =>
  p === "passes" ? Math.max(1, Math.round(v)) : p === "speed" ? Math.round(v) : p === "interval" ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;

export function axisValues(a: TestAxis): number[] {
  return Array.from({ length: Math.max(1, a.steps) }, (_, i) => roundFor(a.param, lerp(a, i)));
}

export async function buildMaterialTest(o: MaterialTestOptions, machine: MachineSettings): Promise<Job> {
  const cols = axisValues(o.cols), rows = axisValues(o.rows);
  const pitch = o.cellSize + o.gap;
  const label = 4; // hauteur de la zone de légende (mm)
  const top = o.title ? TITLE_H : 0;
  const ox = o.x + (o.labels ? label * 4 : 0);
  const oy = o.y + top + (o.labels ? label * 2.5 : 0);
  const layers: JobLayer[] = [];
  const base: CutSettings = { ...DEFAULT_CUT, ...o.base, mode: o.mode, overscan: 1 };

  for (const [j, rv] of rows.entries()) {
    for (const [i, cv] of cols.entries()) {
      const cut: CutSettings = { ...base, [o.cols.param]: cv, [o.rows.param]: rv };
      const cell = rectPath(ox + i * pitch, oy + j * pitch, o.cellSize, o.cellSize);
      layers.push({ ...layerParams({ ...cut, name: `${t(PARAM_LABEL[o.cols.param])} ${cv} · ${t(PARAM_LABEL[o.rows.param])} ${rv}` }), paths: [{ points: cell.pts, closed: true }], images: [] });
    }
  }

  if (o.labels || o.title) {
    const font = await defaultFont();
    if (font) {
      const text = async (s: string, x: number, y: number, align: "left" | "center" | "right"): Promise<Polyline[]> => {
        const paths = await textPaths({ font, text: s, height: label * 0.6, align, letterSpacing: 0, lineSpacing: 1 });
        return paths.map((p) => ({ closed: p.closed, pts: p.pts.map(([px, py]) => [px + x, py + y] as [number, number]) }));
      };
      const paths: Polyline[] = [];
      if (o.title) {
        const tp = await textPaths({ font, text: o.title, height: TITLE_H * 0.6, align: "left", letterSpacing: 0, lineSpacing: 1 });
        paths.push(...tp.map((p) => ({ closed: p.closed, pts: p.pts.map(([px, py]) => [px + o.x, py + o.y + TITLE_H * 0.7] as [number, number]) })));
      }
      if (o.labels) for (const [i, v] of cols.entries()) paths.push(...(await text(`${v}`, ox + i * pitch + o.cellSize / 2, oy - label * 0.6, "center")));
      if (o.labels) for (const [j, v] of rows.entries()) paths.push(...(await text(`${v}`, ox - label * 0.5, oy + j * pitch + o.cellSize / 2 + label * 0.3, "right")));
      if (o.labels) paths.push(...(await text(t(PARAM_LABEL[o.cols.param]), ox, o.y + top + label * 0.6, "left")));
      if (o.labels && rows.length > 1) paths.push(...(await text(t(PARAM_LABEL[o.rows.param]), o.x, oy - label * 0.6, "left")));
      // Les légendes sont gravées en premier, à faible puissance.
      layers.unshift({
        ...layerParams({ ...DEFAULT_CUT, name: t("Légendes"), mode: "line", speed: o.labelSpeed, power: o.labelPower }),
        paths: paths.map((p) => ({ points: p.pts, closed: p.closed })),
        images: [],
      });
    }
  }
  if (o.border) {
    const s = testSize(o);
    const r = rectPath(o.x - BORDER_MARGIN, o.y - BORDER_MARGIN, s.w + 2 * BORDER_MARGIN, s.h + 2 * BORDER_MARGIN);
    layers.push({
      ...layerParams({ ...DEFAULT_CUT, name: t("Bordure"), mode: "line", speed: o.borderSpeed ?? 600, power: o.borderPower ?? 80 }),
      paths: [{ points: r.pts, closed: true }],
      images: [],
    });
  }
  return { machine: machineParams(machine), layers };
}

// ------------------------------------------------- Préréglages de l'utilisateur

const PRESETS_KEY = "lumiere.testPresets";

export function userTestPresets(): Record<string, MaterialTestOptions> {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "{}") as Record<string, MaterialTestOptions>;
  } catch {
    return {};
  }
}

function writePresets(p: Record<string, MaterialTestOptions>) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(p));
  } catch {
    // stockage indisponible
  }
}

export const saveTestPreset = (name: string, o: MaterialTestOptions) => writePresets({ ...userTestPresets(), [name]: o });
export function deleteTestPreset(name: string) {
  const { [name]: _gone, ...rest } = userTestPresets();
  writePresets(rest);
}
export const exportTestPresets = () => JSON.stringify({ format: "lumiere-test-presets", version: 1, presets: userTestPresets() }, null, 2);
export function importTestPresets(json: string): number {
  const data = JSON.parse(json) as { format?: string; presets?: Record<string, MaterialTestOptions> };
  if (data.format !== "lumiere-test-presets" || !data.presets) throw new Error(t("Fichier de préréglages invalide"));
  writePresets({ ...userTestPresets(), ...data.presets });
  return Object.keys(data.presets).length;
}

/** Taille totale de la grille (mm), légendes comprises. */
export function testSize(o: MaterialTestOptions) {
  const label = o.labels ? 4 : 0;
  return {
    w: label * 4 + o.cols.steps * (o.cellSize + o.gap) - o.gap,
    h: (o.title ? TITLE_H : 0) + label * 2.5 + o.rows.steps * (o.cellSize + o.gap) - o.gap,
  };
}
