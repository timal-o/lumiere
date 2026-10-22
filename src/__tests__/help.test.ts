import { describe, expect, it } from "vitest";
import { newerThan } from "../help";

describe("mises à jour", () => {
  it("compare les numéros de version", () => {
    expect(newerThan("v0.6.0", "0.5.0")).toBe(true);
    expect(newerThan("0.5.10", "0.5.9")).toBe(true);
    expect(newerThan("v0.5.0", "0.5.0")).toBe(false);
    expect(newerThan("0.4.9", "0.5.0")).toBe(false);
  });
});
