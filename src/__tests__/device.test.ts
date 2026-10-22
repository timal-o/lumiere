import { describe, expect, it } from "vitest";
import { DEFAULT_MACHINE } from "../model";
import { machineFromProbe } from "../ui/NewDeviceWizard";

describe("assistant nouvel appareil", () => {
  it("reprend la zone, S max et l'accélération des réglages GRBL", () => {
    const m = machineFromProbe({ port: "/dev/cu.usb1", baud: 115200, firmware: "grbl", banner: "Grbl 1.1h", settings: [[30, "1000"], [130, "410"], [131, "380"], [120, "2500"], [121, "2000"]] });
    expect([m.bedWidth, m.bedHeight, m.sMax, m.acceleration, m.firmware, m.baud]).toEqual([410, 380, 1000, 2000, "grbl", 115200]);
    const marlin = machineFromProbe({ port: "x", baud: 250000, firmware: "marlin", banner: "Marlin", settings: [] });
    expect(marlin.bedWidth).toBe(DEFAULT_MACHINE.bedWidth);
    expect(marlin.acceleration).toBe(DEFAULT_MACHINE.acceleration);
  });
});

describe("codes d'erreur personnalisés", () => {
  it("lus, réécrits et prioritaires sur ceux de GRBL", async () => {
    const { parseCodes, codesText } = await import("../ui/MachineDialog");
    const { explain } = await import("../grblcodes");
    const c = parseCodes("error:12 = Porte ouverte\nALARM:9=Capot\nn'importe quoi");
    expect(c).toEqual({ errors: { "12": "Porte ouverte" }, alarms: { "9": "Capot" } });
    expect(parseCodes(codesText(c))).toEqual(c);
    expect(explain("error:12", c)).toBe("error:12 — Porte ouverte");
    expect(explain("ALARM:9", c)).toBe("ALARM:9 — Capot");
  });
});
