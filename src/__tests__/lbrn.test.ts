import { describe, expect, it } from "vitest";
import { ellipseBez, flattenBez, roundedRectBez, type BezPath } from "../bezier";
import { shapeBox, worldPaths } from "../geometry";
import { parseLbrn } from "../import/lbrn";
import type { Primitive } from "../model";

const prim = (p: Primitive): BezPath => (p.type === "ellipse" ? ellipseBez(p.w / 2, p.h / 2, p.w / 2, p.h / 2) : roundedRectBez(0, 0, p.w, p.h, 0));

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="1.4.03" FormatVersion="1">
    <Thumbnail Source="xyz"/>
    <CutSetting type="Cut">
        <index Value="0"/>
        <name Value="Découpe"/>
        <maxPower Value="70"/>
        <speed Value="15"/>
    </CutSetting>
    <CutSetting type="Scan">
        <index Value="1"/>
        <name Value="C01"/>
        <maxPower Value="20"/>
        <speed Value="250"/>
    </CutSetting>
    <Shape Type="Rect" CutIndex="0" W="20" H="10" Cr="0">
        <XForm>1 0 0 1 50 40</XForm>
    </Shape>
    <Shape Type="Group">
        <XForm>1 0 0 1 100 100</XForm>
        <Children>
            <Shape Type="Ellipse" CutIndex="1" Rx="5" Ry="5"><XForm>1 0 0 1 0 0</XForm></Shape>
            <Shape Type="Path" CutIndex="1">
                <XForm>1 0 0 1 0 0</XForm>
                <VertList>V0 0V10 0V10 10c0x10c0y10c1x15c1y5</VertList>
                <PrimList>L0 1L1 2</PrimList>
            </Shape>
        </Children>
    </Shape>
    <Shape Type="Path" CutIndex="0">
        <XForm>1 0 0 1 0 0</XForm>
        <VertList>V0 0V10 0V10 10V0 10</VertList>
        <PrimList>LineClosed</PrimList>
    </Shape>
    <Shape Type="Text" CutIndex="0" Str="Hi" H="10" Font="Arial,-1,100,5,75,1,0,0,0,0" Ah="1" LS="0.5"><XForm>1 0 0 1 30 50</XForm></Shape>
</LightBurnProject>`;

describe("projets LightBurn", () => {
  const { project, texts } = parseLbrn(SAMPLE, 300, prim);
  it("reprend les calques et leurs réglages", () => {
    const [cut, scan] = project.layers;
    expect(cut.name).toBe("Découpe");
    expect(cut.mode).toBe("line");
    expect(cut.speed).toBe(900);
    expect(cut.power).toBe(70);
    expect(scan.mode).toBe("fill");
  });
  it("place les formes avec l'axe Y retourné", () => {
    const rect = project.shapes[0];
    const b = shapeBox(rect)!;
    expect(b.x).toBeCloseTo(40);
    expect(b.w).toBeCloseTo(20);
    expect(b.y).toBeCloseTo(300 - 40 - 5);
    expect(rect.matrix[0] * rect.matrix[3] - rect.matrix[1] * rect.matrix[2]).toBeGreaterThan(0);
    const [ellipse, path] = project.shapes.slice(1, 3);
    expect(ellipse.groupId).toBeDefined();
    expect(ellipse.groupId).toBe(path.groupId);
    const pts = worldPaths(path)[0].pts;
    expect(pts[0]).toEqual([100, 200]);
    expect(pts[1]).toEqual([110, 200]);
  });
  it("tracés fermés et textes repris avec leurs options", () => {
    const square = project.shapes[3];
    expect(square.kind === "vector" && square.curves?.[0].closed).toBe(true);
    expect(flattenBez((square as { curves: BezPath[] }).curves, 0.1)[0].pts.length).toBe(4);
    expect(texts).toHaveLength(1);
    const tx = texts[0];
    expect([tx.text, tx.family, tx.bold, tx.italic, tx.align, tx.letterSpacing, tx.shapeId]).toEqual(["Hi", "Arial", true, true, "center", 0.5, undefined]);
    // Origine du texte retournée sur le plateau, sans miroir.
    expect([tx.matrix[4], tx.matrix[5]]).toEqual([30, 250]);
    expect(tx.matrix[0] * tx.matrix[3] - tx.matrix[1] * tx.matrix[2]).toBeGreaterThan(0);
  });
});

describe("projets LightBurn : listes partagées", () => {
  it("une copie de tracé reprend les sommets par VertID / PrimID", () => {
    const xml = `<LightBurnProject>
      <Shape Type="Path" CutIndex="0" VertID="3" PrimID="3"><XForm>1 0 0 1 0 0</XForm><VertList>V0 0V5 0V5 5</VertList><PrimList>LineOpen</PrimList></Shape>
      <Shape Type="Path" CutIndex="0" VertID="3" PrimID="3"><XForm>1 0 0 1 20 0</XForm></Shape>
    </LightBurnProject>`;
    const { project } = parseLbrn(xml, 100, prim);
    expect(project.shapes).toHaveLength(2);
    expect(worldPaths(project.shapes[1])[0].pts[0]).toEqual([20, 100]);
  });
});
