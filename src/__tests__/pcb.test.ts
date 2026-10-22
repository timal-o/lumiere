import { describe, expect, it } from "vitest";
import { boardShape, detectRole } from "../ui/PcbImportDialog";

describe("detectRole", () => {
  it("reconnaît les noms KiCad et Protel", () => {
    expect(detectRole("board-F_Cu.gbr")).toEqual({ role: "copper", bottom: false });
    expect(detectRole("board-B_Cu.gbr")).toEqual({ role: "copper", bottom: true });
    expect(detectRole("board-Edge_Cuts.gm1").role).toBe("outline");
    expect(detectRole("board.GBO")).toEqual({ role: "silk", bottom: true });
    expect(detectRole("board.gts")).toEqual({ role: "mask", bottom: false });
    expect(detectRole("board-PTH.drl").role).toBe("drill");
    expect(detectRole("x.gtp").role).toBe("paste");
  });
});

describe("boardShape", () => {
  it("garde le bord extérieur de l'anneau du contour", () => {
    const sq = (k: number) => ({ closed: true, pts: [[-k, -k], [k, -k], [k, k], [-k, k]] as [number, number][] });
    expect(boardShape([sq(9), sq(10)])).toEqual([sq(10)]);
    expect(boardShape([{ closed: false, pts: [[0, 0], [1, 1]] }])).toEqual([]);
  });
});
