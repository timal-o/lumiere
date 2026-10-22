import { describe, expect, it } from "vitest";
import { dataMatrix, encodeAscii, reedSolomon } from "../datamatrix";

describe("DataMatrix ECC200", () => {
  it("exemple de la norme : « 123456 »", () => {
    const data = encodeAscii("123456");
    expect(data).toEqual([142, 164, 186]);
    expect(reedSolomon(data, 5)).toEqual([114, 25, 5, 88, 102]);
  });
  it("taille et motifs de repérage", () => {
    const m = dataMatrix("123456");
    expect(m).toHaveLength(10);
    expect(m.every((row) => row[0])).toBe(true); // bord gauche plein
    expect(m[9].every(Boolean)).toBe(true); // bord bas plein
    expect(m[0].map((v) => (v ? 1 : 0)).join("")).toBe("1010101010"); // haut alterné
    expect(m.map((row) => (row[9] ? 1 : 0)).join("")).toBe("0101010101"); // droite alternée
    expect(dataMatrix("x".repeat(40))).toHaveLength(26);
    expect(dataMatrix("https://lumiere.app/produit/12345?lot=A").length).toBeGreaterThanOrEqual(24);
  });
});
