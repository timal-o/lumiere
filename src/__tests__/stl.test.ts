import { describe, expect, it } from "vitest";
import { depthMap, parseStl } from "../import/stl";

// Pyramide à base carrée 10 × 10 mm, sommet à 5 mm au centre.
const tris = (): number[] => {
  const [a, b, c, d, top] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [5, 5, 5]];
  return [[a, b, top], [b, c, top], [c, d, top], [d, a, top], [a, c, b], [a, d, c]].flat(2);
};

describe("modèle 3D", () => {
  it("lit un STL ASCII et binaire", () => {
    const t = tris();
    const ascii = "solid p\n" + Array.from({ length: t.length / 9 }, (_, i) =>
      `facet normal 0 0 1\nouter loop\n${[0, 1, 2].map((j) => `vertex ${t.slice(i * 9 + j * 3, i * 9 + j * 3 + 3).join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n") + "\nendsolid p\n";
    expect(Array.from(parseStl(new TextEncoder().encode(ascii).buffer))).toEqual(t);
    const n = t.length / 9;
    const buf = new ArrayBuffer(84 + n * 50);
    const dv = new DataView(buf);
    dv.setUint32(80, n, true);
    t.forEach((v, i) => dv.setFloat32(84 + Math.floor(i / 9) * 50 + 12 + (i % 9) * 4, v, true));
    expect(Array.from(parseStl(buf))).toEqual(t);
  });

  it("donne une carte claire au sommet et sombre à la base", () => {
    const map = depthMap(Float32Array.from(tris()), { view: "top", resolution: 4, invert: false, equalize: false, autoDepth: false, blackBackground: false });
    expect(map.width).toBe(40);
    expect(map.depth).toBeCloseTo(5);
    const at = (x: number, y: number) => map.gray[y * map.width + x];
    expect(at(20, 20)).toBeGreaterThan(230); // sommet
    expect(at(1, 20)).toBeLessThan(30); // bord
    const side = depthMap(Float32Array.from(tris()), { view: "front", resolution: 4, invert: false, equalize: false, autoDepth: false, blackBackground: false });
    // Vue de face : triangle, coin supérieur gauche hors du modèle (fond blanc).
    expect(side.gray[0]).toBe(255);
  });
});
