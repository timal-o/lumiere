import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
vi.stubGlobal("window", new EventTarget());

const { eventAccel, interfaceMap, isNative, menuParams, setOverrides, symbols } = await import("../hotkeys");

const key = (code: string, key: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ code, key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

beforeEach(() => store.clear());

describe("raccourcis", () => {
  it("lit la touche à sa position avec un modificateur, le caractère sinon", () => {
    expect(eventAccel(key("KeyX", "≈", { altKey: true }))).toBe("Alt+X");
    expect(eventAccel(key("Digit1", "&", { altKey: true }))).toBe("Alt+1"); // AZERTY
    expect(eventAccel(key("KeyN", "N", { metaKey: true, shiftKey: true }))).toBe("CmdOrCtrl+Shift+N");
    expect(eventAccel(key("Comma", ";"))).toBe(";"); // « ; » d'un clavier AZERTY
    expect(eventAccel(key("ShiftLeft", "Shift", { shiftKey: true }))).toBeNull();
  });

  it("affiche à la manière de macOS", () => {
    expect(symbols("Alt+Shift+O")).toBe("⌥⇧O");
    expect(symbols("CmdOrCtrl+Shift+Up")).toBe("⇧⌘↑");
    expect(symbols("Alt+-")).toBe("⌥-");
    expect(symbols(";")).toBe(";");
  });

  it("répartit entre le menu natif et l'interface", () => {
    expect(isNative("CmdOrCtrl+K")).toBe(true);
    expect(isNative("F12")).toBe(true);
    expect(isNative("Alt+K")).toBe(false);
    expect(interfaceMap().get("Alt+X")).toBe("exportSvg");
    setOverrides({ exportSvg: "Alt+E", save: "Alt+S", open: "" });
    expect(interfaceMap().get("Alt+X")).toBeUndefined();
    expect(interfaceMap().get("Alt+E")).toBe("exportSvg");
    const p = menuParams();
    expect(p.shortcuts).toMatchObject({ save: "", open: "" }); // ⌥S passe à l'interface
    expect(p.hints.save).toBe("⌥S");
  });
});
