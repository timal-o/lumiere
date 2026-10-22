// Bibliothèques de matériaux LightBurn (.clb, XML) : import et export, pour reprendre ses
// réglages. Les vitesses y sont en mm/s ; une épaisseur négative signifie « sans épaisseur ».

import { DEFAULT_CUT, uid, type CutSettings, type DitherMode, type LayerMode, type SubLayer } from "./model";
import type { LayerSettings, Preset } from "./materials";

const MODES: Record<string, LayerMode> = { Cut: "line", Scan: "fill", Image: "image", "Offset Fill": "offsetFill" };
const MODE_NAMES: Record<LayerMode, string> = { line: "Cut", fill: "Scan", image: "Image", offsetFill: "Offset Fill" };

const DITHERS: Record<string, DitherMode> = {
  threshold: "threshold", ordered: "ordered", floyd: "floydSteinberg", jarvis: "jarvis", stucki: "stucki", atkinson: "atkinson",
  halftone: "halftone", grayscale: "grayscale", newsprint: "newsprint", sketch: "sketch", dither: "floydSteinberg",
};
const DITHER_NAMES: Record<DitherMode, string> = {
  threshold: "threshold", ordered: "ordered", floydSteinberg: "floyd", jarvis: "jarvis", stucki: "stucki", atkinson: "atkinson",
  halftone: "halftone", grayscale: "grayscale", newsprint: "newsprint", sketch: "sketch",
};

/** Champs numériques : nom LightBurn → champ Lumière (et facteur d'unité). */
const NUMBERS: [string, keyof CutSettings, number][] = [
  ["maxPower", "power", 1], ["minPower", "minPower", 1], ["speed", "speed", 60], ["numPasses", "passes", 1],
  ["interval", "interval", 1], ["angle", "fillAngle", 1], ["overscanning", "overscan", 1], ["kerf", "kerf", 1],
  ["tabCount", "tabCount", 1], ["tabSize", "tabSize", 1], ["zOffset", "zOffset", 1], ["zPerPass", "zStep", 1],
  ["rampLength", "rampLength", 1], ["perfLen", "perfOn", 1], ["perfSkip", "perfOff", 1], ["dotTime", "dotTime", 1],
  ["dotSpacing", "dotSpacing", 1], ["overcut", "overcut", 1], ["halftoneCellSize", "halftoneLpi", 1], ["halftoneAngle", "halftoneAngle", 1],
  ["leadInLength", "leadIn", 1], ["leadOutLength", "leadOut", 1], ["angleIncrement", "angleIncrement", 1], ["dotWidth", "dotWidth", 1],
];
const BOOLS: [string, keyof CutSettings][] = [
  ["crossHatch", "crossHatch"], ["bidir", "bidirectional"], ["airAssist", "airAssist"], ["perforate", "perforate"],
  ["dotMode", "dotMode"], ["negativeImage", "negative"], ["constantPower", "constantPower"], ["rampOuter", "rampOuter"],
  ["fillGroups", "fillGroups"], ["floodFill", "floodFill"], ["cleanWholeImage", "cleanupWhole"], ["scanOpt", "fillIndividually"],
];

const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attrs = (tag: string): Record<string, string> =>
  Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g), (m) => [m[1], unesc(m[2])]));

/** Réglage d'un élément <CutSetting type="…"> … </CutSetting>. */
export function cutFrom(type: string, body: string): CutSettings {
  const values = new Map<string, string>();
  for (const m of body.matchAll(/<(\w+)\s+Value\s*=\s*"([^"]*)"\s*\/>/g)) values.set(m[1], unesc(m[2]));
  const cut: CutSettings = { ...DEFAULT_CUT, mode: MODES[type] ?? "line" };
  const rec = cut as unknown as Record<string, number | boolean | string>;
  for (const [name, key, k] of NUMBERS) {
    const raw = values.get(name);
    if (raw != null && raw !== "" && Number.isFinite(Number(raw))) rec[key] = Number(raw) * k;
  }
  for (const [name, key] of BOOLS) {
    const raw = values.get(name);
    if (raw != null) rec[key] = raw === "1" || raw.toLowerCase() === "true";
  }
  const dither = values.get("ditherMode");
  if (dither && DITHERS[dither]) cut.dither = DITHERS[dither];
  return cut;
}

/** Entrées d'une bibliothèque .clb. Plusieurs CutSetting dans une entrée deviennent des sous-calques. */
export function parseClb(xml: string): Omit<Preset, "id">[] {
  if (!/<LightBurnLibrary\b/.test(xml)) throw new Error("Not a LightBurn library");
  const out: Omit<Preset, "id">[] = [];
  for (const mat of xml.matchAll(/<Material\b([^>]*)>([\s\S]*?)<\/Material>/g)) {
    const material = attrs(mat[1]).name ?? "";
    for (const entry of mat[2].matchAll(/<Entry\b([^>]*)>([\s\S]*?)<\/Entry>/g)) {
      const a = attrs(entry[1]);
      const cuts = Array.from(entry[2].matchAll(/<CutSetting(?:_Img)?\b([^>]*)>([\s\S]*?)<\/CutSetting(?:_Img)?>/g), (c) => cutFrom(attrs(c[1]).type ?? "Cut", c[2]));
      if (!cuts.length) continue;
      const th = Number(a.Thickness ?? "-1");
      const [main, ...rest] = cuts;
      const settings: LayerSettings = { ...main, subLayers: rest.map((c): SubLayer => ({ ...c, enabled: true })) };
      out.push({ material, thickness: th >= 0 ? th : null, description: a.Desc || a.NoThickTitle || "", settings });
    }
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

function cutXml(c: CutSettings, indent: string): string {
  const lines = [`${indent}<CutSetting type="${MODE_NAMES[c.mode]}">`];
  const rec = c as unknown as Record<string, number | boolean | string>;
  for (const [name, key, k] of NUMBERS) lines.push(`${indent}    <${name} Value="${fmt(Number(rec[key]) / k)}"/>`);
  for (const [name, key] of BOOLS) lines.push(`${indent}    <${name} Value="${rec[key] ? 1 : 0}"/>`);
  lines.push(`${indent}    <ditherMode Value="${DITHER_NAMES[c.dither]}"/>`);
  lines.push(`${indent}</CutSetting>`);
  return lines.join("\n");
}

export function exportClb(presets: Preset[]): string {
  const byMat = new Map<string, Preset[]>();
  for (const p of presets) byMat.set(p.material, [...(byMat.get(p.material) ?? []), p]);
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', "<LightBurnLibrary>"];
  for (const [mat, list] of byMat) {
    out.push(`    <Material name="${esc(mat)}">`);
    for (const p of list) {
      out.push(`        <Entry Thickness="${p.thickness ?? -1}" Desc="${esc(p.description)}" NoThickTitle="">`);
      out.push(cutXml(p.settings, "            "));
      for (const s of p.settings.subLayers ?? []) if (s.enabled) out.push(cutXml(s, "            "));
      out.push("        </Entry>");
    }
    out.push("    </Material>");
  }
  out.push("</LightBurnLibrary>", "");
  return out.join("\n");
}

export const withIds = (list: Omit<Preset, "id">[]): Preset[] => list.map((p) => ({ ...p, id: uid() }));
