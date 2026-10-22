import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { pathsBox } from "../geometry";
import { parseEps } from "../import/eps";
import { parse3mf, parseObj } from "../import/model3d";

describe("EPS / Illustrator ancien", () => {
  it("PostScript classique avec procédures et couleurs", () => {
    const ps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 144 144
/M { moveto } bind def /L { lineto } def
1 0 0 setrgbcolor
newpath 0 0 M 72 0 L 72 72 L 0 72 L closepath stroke
0 0 1 setrgbcolor 10 10 moveto 20 20 30 20 40 10 curveto stroke
(Hello) show`;
    const r = parseEps(ps);
    const red = r.groups.find((g) => g.color === "#ff0000")!;
    expect(red.paths[0].closed).toBe(true);
    const b = pathsBox(red.paths)!;
    expect(b.w).toBeCloseTo(25.4);
    expect(b.y).toBeCloseTo(25.4); // haut du carré à 72 pt sous le haut de la page (144 pt)
    expect(r.groups.find((g) => g.color === "#0000ff")!.curves![0].nodes[0].c2).toBeDefined();
    expect(r.warnings.length).toBe(1);
  });
  it("abréviations d'Illustrator (m, l, c, h, S, K)", () => {
    const ai = `%!PS-Adobe-3.0
%%BoundingBox: 0 0 100 100
0 0 0 1 K
10 10 m 90 10 l 90 90 l h S`;
    const r = parseEps(ai);
    expect(r.groups[0].color).toBe("#000000");
    expect(r.groups[0].paths[0].pts.length).toBe(3);
  });
});

describe("modèles 3D OBJ et 3MF", () => {
  it("OBJ : faces triangulées en éventail", () => {
    const tris = parseObj("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 1\nf 1 2 3 4\n");
    expect(tris.length).toBe(18); // un quadrilatère = 2 triangles
    expect(Array.from(tris.slice(15))).toEqual([0, 1, 1]);
  });
  it("3MF : archive ZIP (deflate) avec le modèle XML", async () => {
    const model = `<model><resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="2"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources></model>`;
    const name = new TextEncoder().encode("3D/3dmodel.model");
    const comp = deflateRawSync(Buffer.from(model));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(model.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(model.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
    const localPart = Buffer.concat([local, name, comp]);
    const centralPart = Buffer.concat([central, name]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(centralPart.length, 12); end.writeUInt32LE(localPart.length, 16);
    const zip = Buffer.concat([localPart, centralPart, end]);
    const tris = await parse3mf(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length));
    expect(Array.from(tris)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 2]);
  });
});
