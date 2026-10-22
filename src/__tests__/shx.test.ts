import { describe, expect, it } from "vitest";
import { parseShx, shxAsFont, shxGlyph } from "../shx";
import { layoutText } from "../text";
import type opentype from "opentype.js";

/** Petite police « shapes 1.0 » : forme 0 (infos), « L » et « O » (cercle par octants). */
function makeFont(): ArrayBuffer {
  const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  const defs: [number, number[]][] = [
    [0, [...enc("TEST"), 0, 10, 2, 0, 0]],
    [76, [...enc("L"), 0, 0xa4, 0x02, 0xac, 0x01, 0x60, 0x02, 0x20, 0]],
    [79, [...enc("O"), 0, 0x02, 0x8, 10, 5, 0x01, 0x0a, 5, 0x00, 0x02, 0x8, 0, -5 & 0xff, 0]],
  ];
  const bytes = [...enc("AutoCAD-86 shapes 1.0\r\n"), 0x1a];
  const u16 = (v: number) => [v & 0xff, v >> 8];
  bytes.push(...u16(0), ...u16(79), ...u16(defs.length));
  for (const [n, d] of defs) bytes.push(...u16(n), ...u16(d.length));
  for (const [, d] of defs) bytes.push(...d);
  return new Uint8Array(bytes).buffer;
}

describe("polices SHX", () => {
  const font = parseShx(makeFont());
  it("lit l'en-tête et les formes", () => {
    expect(font.name).toBe("TEST");
    expect(font.above).toBe(10);
    expect(font.shapes.size).toBe(2);
  });
  it("interprète vecteurs, plume et arcs", () => {
    const l = shxGlyph(font, 76)!;
    expect(l.strokes).toEqual([[[0, 0], [0, 10]], [[0, 0], [6, 0]]]);
    expect(l.advance).toBe(8);
    const o = shxGlyph(font, 79)!;
    expect(o.strokes.length).toBe(1);
    for (const [x, y] of o.strokes[0]) expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(5, 6);
    expect(o.advance).toBeCloseTo(10);
  });
  it("met en page un texte en traits ouverts, à la hauteur voulue", () => {
    const paths = layoutText(shxAsFont(font) as unknown as opentype.Font, { text: "L", height: 20, align: "left", letterSpacing: 0, lineSpacing: 1, weld: false });
    expect(paths.length).toBe(2);
    expect(paths.every((p) => !p.closed)).toBe(true);
    const ys = paths.flatMap((p) => p.pts.map((q) => q[1]));
    expect(Math.min(...ys)).toBeCloseTo(-20);
  });
});
