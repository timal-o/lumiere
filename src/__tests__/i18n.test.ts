import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — module JavaScript de l'outil de traduction, sans types
import { extractKeys } from "../../scripts/i18n.mjs";
import { LOCALES, setLanguage, t, translateMessage } from "../i18n";

const dir = join(__dirname, "../locales");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
const keys: Map<string, string> = extractKeys();

afterEach(() => setLanguage("fr"));

describe("traductions", () => {
  it("chaque langue est découverte automatiquement", () => {
    expect(LOCALES.map((l) => l.code).sort()).toEqual(["fr", ...files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))._meta.code)].sort());
  });

  it.each(files)("%s traduit toutes les clés, en gardant les paramètres", (file) => {
    const loc = JSON.parse(readFileSync(join(dir, file), "utf8"));
    const missing = [...keys.keys()].filter((k) => !loc[k]);
    expect(missing).toEqual([]);
    for (const k of keys.keys()) {
      const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(params(loc[k]), `${file} : ${k}`).toEqual(params(k));
    }
  });

  it("paramètres et repli sur le français", () => {
    setLanguage("en");
    expect(t("{n} lignes", { n: 12 })).toBe("12 lines");
    expect(t("Texte qui n'existe pas")).toBe("Texte qui n'existe pas");
    setLanguage("fr");
    expect(t("{n} lignes", { n: 3 })).toBe("3 lignes");
  });

  it("messages du cœur Rust traduits par modèle", () => {
    setLanguage("es");
    expect(translateMessage("Calque « C01 » : puissance nulle, ignoré.")).toBe("Capa «C01»: potencia nula, omitida.");
    expect(translateMessage("Impossible d'ouvrir /dev/cu.usb : Permission denied")).toBe("No se puede abrir /dev/cu.usb: Permission denied");
    expect(translateMessage("message inconnu")).toBe("message inconnu");
  });

  it("un contexte distingue deux sens d'un même mot", () => {
    expect(t("undo::Annuler")).toBe("Annuler");
    expect(t("Annuler")).toBe("Annuler");
    setLanguage("en");
    expect(t("undo::Annuler")).toBe("Undo");
    expect(t("Annuler")).toBe("Cancel");
    setLanguage("fr");
  });

  it("le menu natif a ses libellés", () => {
    expect(keys.has("Fichier")).toBe(true);
    expect(keys.has("Déplacer les objets sélectionnés")).toBe(true); // sous-menu
    expect(keys.has("Coupes/Calques")).toBe(true); // case à cocher
    expect(keys.has("Quitter Lumière")).toBe(true);
  });
});
