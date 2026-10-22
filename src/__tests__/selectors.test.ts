import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Un sélecteur de useSyncExternalStore doit renvoyer une valeur stable : un tableau ou un
 * objet recréé à chaque appel fait boucler React à l'infini (écran vide au démarrage).
 */
describe("sélecteurs des stores", () => {
  it("ne créent pas de nouveaux tableaux ni objets", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) {
          if (f !== "__tests__") walk(p);
        } else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(join(__dirname, ".."));
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        const m = /use(Store|Laser|Camera)\(\(s\) =>(.*)\)/.exec(line);
        if (m && /\.filter\(|\.map\(|\?\? *[[({]|\(\{|\[\.\.\./.test(m[2])) bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
