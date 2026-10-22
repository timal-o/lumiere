import { describe, expect, it } from "vitest";
import { ellipseBez, fromPolylines } from "../bezier";
import { circleThrough3, segmentInfo, shapeStats } from "../measure";

const square = (x: number, y: number, s: number) => ({ closed: true, pts: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]] as [number, number][] });

describe("mesure", () => {
  it("donne taille, nœuds, périmètre et surface (trous déduits)", () => {
    const s = shapeStats(fromPolylines([square(0, 0, 10), square(2, 2, 4)]));
    expect(s.width).toBeCloseTo(10);
    expect(s.nodes).toBe(8);
    expect(s.lines).toBe(8);
    expect(s.curves).toBe(0);
    expect(s.closed).toBe("closed");
    expect(s.perimeter).toBeCloseTo(56);
    expect(s.area).toBeCloseTo(84);
  });
  it("mesure un segment et l'arc d'une courbe", () => {
    const seg = segmentInfo(fromPolylines([square(0, 0, 10)]), [5, 0.1], 0.5)!;
    expect(seg.length).toBeCloseTo(10);
    expect(Math.abs(seg.angle)).toBeCloseTo(0);
    const arc = segmentInfo([ellipseBez(0, 0, 5, 5)], [5, 0.2], 0.5)!.arc!;
    expect(arc.radius).toBeCloseTo(5, 1);
    expect(Math.hypot(...arc.center)).toBeLessThan(0.05);
    expect(circleThrough3([0, 0], [1, 1], [2, 2])).toBeNull();
  });
});
