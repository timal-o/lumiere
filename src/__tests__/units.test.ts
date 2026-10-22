import { describe, expect, it } from "vitest";
import { displayUnit } from "../units";

describe("unités", () => {
  it("convertit les unités en millimètres vers les pouces", () => {
    expect(displayUnit("mm", true)).toEqual({ k: 25.4, unit: "in" });
    expect(displayUnit("mm/min", true)).toEqual({ k: 25.4, unit: "in/min" });
    expect(displayUnit("%", true)).toEqual({ k: 1, unit: "%" });
    expect(displayUnit("mm", false)).toEqual({ k: 1, unit: "mm" });
  });
});
