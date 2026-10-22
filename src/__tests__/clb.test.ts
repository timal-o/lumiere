import { describe, expect, it } from "vitest";
import { exportClb, parseClb, withIds } from "../clb";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnLibrary>
    <Material name="Contreplaqué &amp; bouleau">
        <Entry Thickness="3" Desc="Découpe" NoThickTitle="">
            <CutSetting type="Cut">
                <index Value="0"/>
                <maxPower Value="65"/>
                <speed Value="10"/>
                <numPasses Value="2"/>
                <airAssist Value="1"/>
            </CutSetting>
        </Entry>
        <Entry Thickness="-1" Desc="Gravure" NoThickTitle="">
            <CutSetting type="Scan">
                <maxPower Value="20"/>
                <speed Value="200"/>
                <interval Value="0.08"/>
                <crossHatch Value="1"/>
            </CutSetting>
            <CutSetting type="Cut">
                <maxPower Value="40"/>
            </CutSetting>
        </Entry>
    </Material>
</LightBurnLibrary>`;

describe("bibliothèques LightBurn (.clb)", () => {
  it("lit matériaux, épaisseurs, réglages et sous-calques", () => {
    const [cut, scan] = parseClb(SAMPLE);
    expect(cut.material).toBe("Contreplaqué & bouleau");
    expect(cut.thickness).toBe(3);
    expect(cut.settings.mode).toBe("line");
    expect(cut.settings.speed).toBe(600); // mm/s → mm/min
    expect(cut.settings.power).toBe(65);
    expect(cut.settings.passes).toBe(2);
    expect(cut.settings.airAssist).toBe(true);
    expect(scan.thickness).toBeNull();
    expect(scan.settings.mode).toBe("fill");
    expect(scan.settings.crossHatch).toBe(true);
    expect(scan.settings.subLayers).toHaveLength(1);
    expect(scan.settings.subLayers[0].power).toBe(40);
  });
  it("relit ce qu'il exporte", () => {
    const presets = withIds(parseClb(SAMPLE));
    const again = parseClb(exportClb(presets));
    expect(again.map((p) => [p.material, p.thickness, p.description, p.settings.speed, p.settings.interval, p.settings.subLayers.length]))
      .toEqual(presets.map((p) => [p.material, p.thickness, p.description, p.settings.speed, p.settings.interval, p.settings.subLayers.length]));
  });
  it("refuse un autre fichier", () => {
    expect(() => parseClb("<html/>")).toThrow();
  });
});
