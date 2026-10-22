#!/usr/bin/env node
// Outil de traduction de Lumière.
//
//   node scripts/i18n.mjs            liste les clés manquantes de chaque langue,
//                                    et régénère src/locales/_template.json
//   node scripts/i18n.mjs --suspects liste les textes français qui ne passent pas par t()
//   node scripts/i18n.mjs --check    échoue si une langue est incomplète (utilisé par les tests)
//
// Ajouter une langue : copier src/locales/_template.json en src/locales/<code>.json,
// renseigner "_meta" (code et nom de la langue) et traduire les valeurs.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const LOCALES = join(root, "src/locales");

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__" && name !== "locales") walk(p, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Contenu d'une chaîne littérale JavaScript ou Rust (échappements simples). */
const unquote = (s) => s.replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n");

export function extractKeys() {
  const keys = new Map(); // clé → premier fichier où elle apparaît
  const add = (k, file) => {
    if (k && !keys.has(k)) keys.set(k, relative(root, file));
  };
  for (const file of walk(join(root, "src"), [".ts", ".tsx"])) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bt[k]?\(\s*"((?:[^"\\]|\\.)*)"/g)) add(unquote(m[1]), file);
    for (const m of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) add(unquote(m[1]), file);
    // Messages du cœur Rust déclarés dans RUST_MESSAGES.
    const block = /RUST_MESSAGES = \[([\s\S]*?)\];/.exec(src);
    if (block) for (const m of block[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) add(unquote(m[1]), file);
  }
  // Libellés du menu natif (src-tauri/src/menu.rs).
  const menu = join(root, "src-tauri/src/menu.rs");
  const rs = readFileSync(menu, "utf8");
  const patterns = [
    /\("[^"]+",\s*"((?:[^"\\]|\\.)+)",\s*(?:None|Some)/g, // ("id", "Libellé", raccourci)
    /\b(?:item|check)\(app,\s*(?:"[^"]+"|&format!\([^)]*\)),\s*"((?:[^"\\]|\\.)+)"/g,
    /\btr\("((?:[^"\\]|\\.)+)"\)/g,
    /\b(?:submenu|recent_menu)\(app,\s*"((?:[^"\\]|\\.)+)"/g,
  ];
  for (const re of patterns) for (const m of rs.matchAll(re)) add(tr(unquote(m[1])), menu);
  return keys;
}

// Les libellés du menu passent par tr() côté Rust : la clé est le texte lui-même.
function tr(s) {
  return s;
}

function readLocale(file) {
  return JSON.parse(readFileSync(join(LOCALES, file), "utf8"));
}

function suspects() {
  const found = [];
  const ignore = /^(?:[a-z][\w-]*(?:\s[a-z][\w-]*)*|[#./@:\w-]+|.*\$\{.*|M\d.*|G\d.*)$/; // classes CSS, identifiants, chemins, G-code
  for (const file of walk(join(root, "src"), [".ts", ".tsx"])) {
    if (file.includes("/i18n/")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (/^\s*(\*|\/\/|import |export \* )/.test(line)) return;
      // Chaînes littérales qui ressemblent à du texte (au moins deux mots ou un accent).
      // Retire d'abord les chaînes déjà traduites, pour ne pas apparier leurs guillemets.
      const rest = code.replace(/\btk?\(\s*"(?:[^"\\]|\\.)*"/g, "t()");
      for (const m of rest.matchAll(/(["`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
        const s = m[2];
        // Mot isolé dans une branche de ternaire : {paused ? "Reprendre" : "Pause"}
        const before = rest.slice(0, m.index);
        if (/^[A-ZÀ-Ý][a-zà-ÿ]{2,}…?$/.test(s) && /[?:]\s*$/.test(before) && /\?/.test(rest)) {
          found.push(`${relative(root, file)}:${i + 1}: ${s}`);
          continue;
        }
        if (s.length < 3 || ignore.test(s) || /^[)\]},]|className=|=$/.test(s)) continue;
        if (!/[A-Za-zÀ-ÿ]{3,}/.test(s) || !(/[À-ÿ]/.test(s) || /\s/.test(s.trim()))) continue;
        if (/^[\w.-]+\.(json|ts|tsx|css|svg|png|lum|gcode)$/.test(s)) continue;
        found.push(`${relative(root, file)}:${i + 1}: ${s.slice(0, 90)}`);
      }
      // Texte JSX hors balise : ligne de texte français sans code.
      const trimmed = code.trim();
      const sentence = /^[A-ZÀ-Ýa-zà-ÿ«(][^<>{}=;]*[a-zà-ÿ.:)»!?…]$/.test(trimmed) && /\s/.test(trimmed);
      const word = /^[A-ZÀ-Ý][a-zà-ÿ'’]{2,}…?$/.test(trimmed); // mot isolé entre deux balises
      if ((sentence || word) && !/^(?:return|const|let|if|else|case|break|export|import|type|interface)\b/.test(trimmed)) {
        found.push(`${relative(root, file)}:${i + 1}: (JSX) ${trimmed.slice(0, 90)}`);
      }
    });
  }
  return found;
}

// Exécuté directement (et non importé par les tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--suspects")) {
    const list = suspects();
    console.log(list.join("\n"));
    console.log(`\n${list.length} texte(s) à vérifier`);
    process.exit(0);
  }

  const keys = extractKeys();
  const template = { _meta: { code: "xx", name: "Nom de la langue", english: "Language name in English" } };
  for (const k of [...keys.keys()].sort((a, b) => a.localeCompare(b, "fr"))) template[k] = "";
  writeFileSync(join(LOCALES, "_template.json"), JSON.stringify(template, null, 2) + "\n");

  let incomplete = false;
  for (const file of readdirSync(LOCALES).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    const loc = readLocale(file);
    const missing = [...keys.keys()].filter((k) => !loc[k]);
    const unused = Object.keys(loc).filter((k) => k !== "_meta" && !keys.has(k));
    const pct = Math.floor((100 * (keys.size - missing.length)) / keys.size);
    console.log(`${file.padEnd(12)} ${loc._meta?.name ?? "?"} : ${pct} % (${missing.length} manquante(s), ${unused.length} inutilisée(s))`);
    if (args.includes("--verbose")) for (const k of missing) console.log(`   - ${k}  [${keys.get(k)}]`);
    if (missing.length) incomplete = true;
  }
  console.log(`${keys.size} clés · modèle : src/locales/_template.json`);
  if (args.includes("--check") && incomplete) process.exit(1);
}
