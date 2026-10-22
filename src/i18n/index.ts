// Traductions de l'interface.
//
// Le texte français sert de clé (à la manière de gettext) : `t("Enregistrer")`. Chaque
// langue est un fichier `src/locales/<code>.json` qui associe le texte français à sa
// traduction ; il est détecté automatiquement, il suffit donc d'ajouter un fichier pour
// ajouter une langue. Une traduction absente retombe sur le français.

import { useSyncExternalStore } from "react";

type Dict = Record<string, string>;

export interface Locale {
  /** Code BCP 47 (« en », « es », « zh-CN »…). */
  code: string;
  /** Nom de la langue dans cette langue (« English », « 简体中文 »…). */
  name: string;
  /** Nom anglais (« Simplified Chinese »), affiché à côté dans le menu Langue. */
  english: string;
  dict: Dict;
}

type Meta = { code: string; name: string; english?: string };

interface LocaleFile {
  _meta: Meta;
  [key: string]: string | Meta;
}

const files = import.meta.glob<{ default: LocaleFile }>("../locales/*.json", { eager: true });

export const LOCALES: Locale[] = [
  { code: "fr", name: "Français", english: "French", dict: {} },
  ...Object.entries(files)
    .filter(([path]) => !path.endsWith("_template.json"))
    .map(([, mod]) => {
      const { _meta, ...entries } = mod.default;
      const dict: Dict = {};
      for (const [k, v] of Object.entries(entries)) if (typeof v === "string" && v) dict[k] = v;
      return { code: _meta.code, name: _meta.name, english: _meta.english ?? _meta.name, dict };
    })
    .sort((a, b) => a.name.localeCompare(b.name)),
];

/** Libellé du menu Langue : « Français (French) », « English ». */
export const languageLabel = (l: Locale) => (l.english === l.name ? l.name : `${l.name} (${l.english})`);

const KEY = "lumiere.lang";

/** Langue enregistrée, sinon celle du système si elle est disponible, sinon le français. */
function detect(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LOCALES.some((l) => l.code === saved)) return saved;
  } catch {
    // stockage indisponible
  }
  const wanted = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  for (const w of wanted) {
    const exact = LOCALES.find((l) => l.code.toLowerCase() === w.toLowerCase());
    const base = LOCALES.find((l) => l.code.split("-")[0] === w.split("-")[0]);
    if (exact ?? base) return (exact ?? base)!.code;
  }
  return "fr";
}

let current: Locale = LOCALES.find((l) => l.code === detect()) ?? LOCALES[0];
const listeners = new Set<() => void>();

export const language = () => current.code;

export function setLanguage(code: string) {
  const next = LOCALES.find((l) => l.code === code);
  if (!next || next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // ignoré
  }
  if (typeof document !== "undefined") document.documentElement.lang = code;
  listeners.forEach((l) => l());
}

export function useLanguage(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current.code,
  );
}

export function onLanguageChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Traduction du texte français `key`, avec remplacement des paramètres `{nom}`. */
export function t(key: string, params?: Record<string, string | number>): string {
  // « contexte::Texte » distingue deux sens d'un même mot (Annuler = Undo ou Cancel) ;
  // en français, seul le texte après « :: » s'affiche.
  const s = current.dict[key] ?? key.split("::").pop()!;
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/** Dictionnaire de la langue courante (pour le menu natif). */
export const currentDictionary = (): Dict => current.dict;

// ------------------------------------------------- Messages du cœur Rust

/**
 * Messages produits par le cœur Rust, en français, avec des parties variables. Chaque
 * modèle utilise {0}, {1}… et se traduit comme une clé ordinaire.
 */
export const RUST_MESSAGES = [
  "Calque « {0} » : puissance nulle, ignoré.",
  "Calque « {0} » : les tracés ouverts ne sont pas remplis.",
  "Laser non connecté",
  "Connexion fermée",
  "Impossible d'ouvrir {0} : {1}",
  "Adresse {0} introuvable : {1}",
  "Adresse {0} introuvable",
  "Connexion à {0} impossible : {1}",
  "Port fermé : {0}",
  "Écriture impossible",
  "Commande temps réel inconnue : {0}",
  "Écriture de {0} impossible : {1}",
  "Lecture de {0} impossible : {1}",
  "Police illisible : {0}",
  "Port local {0} indisponible : {1}",
  "Contrôleur {0} injoignable : {1}",
  "Envoi impossible : {0}",
  "Pas d'acquittement du contrôleur pour le paquet {0}",
  "{0} (ligne {1} du travail)",
];

const patterns = RUST_MESSAGES.map((tpl) => {
  const parts = tpl.split(/\{\d+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return { tpl, re: new RegExp(`^${parts.join("(.+?)")}$`, "s") };
});

/** Traduit un message dynamique (erreur ou avertissement venu du cœur Rust). */
export function translateMessage(msg: string): string {
  if (current.dict[msg]) return current.dict[msg];
  for (const { tpl, re } of patterns) {
    const m = re.exec(msg);
    if (!m) continue;
    const target = current.dict[tpl];
    if (!target) return msg;
    return target.replace(/\{(\d+)\}/g, (_, i: string) => m[Number(i) + 1] ?? "");
  }
  return msg;
}

/**
 * Marque une clé à traduire sans la traduire tout de suite : pour les tables définies au
 * chargement du module, traduites ensuite à l'affichage avec `t(valeur)`.
 */
export const tk = (key: string): string => key;
