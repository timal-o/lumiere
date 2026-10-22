// Menu Fichier : modèles, préférences, lots, impression, capture de la caméra, fenêtres.

import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api, isTauri } from "./backend";
import { discardChanges, notify, openPath } from "./actions";
import { getCamera } from "./camera";
import { t } from "./i18n";
import { PALETTE } from "./model";
import { addRecent, clearRecent, recentList, removeRecent, type RecentKind } from "./recent";
import { getState } from "./store";
import { projectForSave } from "./pages";
import { exportSvg } from "./tools";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function pickPath(ext: string, label: string): Promise<string | null> {
  const path = await open({ multiple: false, filters: [{ name: label, extensions: [ext] }] });
  return typeof path === "string" ? path : null;
}

async function readJson(ext: string, label: string): Promise<unknown | null> {
  const path = await pickPath(ext, label);
  if (!path) return null;
  return JSON.parse(await invoke<string>("read_text_file", { path }));
}

async function writeJson(defaultName: string, ext: string, label: string, data: unknown): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: label, extensions: [ext] }] });
  if (!path) return false;
  await api.writeTextFile(path, JSON.stringify(data, null, 2));
  return true;
}

/** Les commandes de fichiers natives n'existent que dans l'application. */
function needsApp(): boolean {
  if (isTauri()) return true;
  notify(t("Disponible dans l'application de bureau uniquement"));
  return false;
}

// ------------------------------------------------------- Récents et modèles

export async function openRecent(kind: RecentKind, index: number) {
  const path = recentList(kind)[index];
  if (!path || !(await discardChanges())) return;
  const before = getState().project;
  await openPath(path, kind === "template");
  // Fichier introuvable : il sort de la liste.
  if (getState().project === before) removeRecent(kind, path);
}

export { clearRecent };

export async function saveAsTemplate() {
  if (!needsApp()) return;
  const path = await save({ defaultPath: t("modele.lum"), filters: [{ name: t("Modèle Lumière"), extensions: ["lum"] }] });
  if (!path) return;
  try {
    await api.writeTextFile(path, JSON.stringify(projectForSave(getState().project)));
    addRecent("template", path);
    notify(t("Modèle enregistré"));
  } catch (e) {
    notify(t("Enregistrement impossible : {error}", { error: message(e) }));
  }
}

export async function newWindow() {
  if (!needsApp()) return;
  const w = new WebviewWindow(`win-${Date.now()}`, { url: "index.html", title: "Lumière", width: 1280, height: 820 });
  w.once("tauri://error", (e) => notify(t("Ouverture de la fenêtre impossible : {error}", { error: String(e.payload) })));
}

// --------------------------------------------------------------- Préférences

/** Clés du stockage local qui ne sont pas des préférences (copies de travail, sauvegardes). */
const NOT_PREFS = /^lumiere\.(autosave|prefsBackups|profiles|profile$)/;

function prefs(): Record<string, string> {
  const items: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith("lumiere.") && !NOT_PREFS.test(k)) items[k] = localStorage.getItem(k)!;
  }
  return items;
}

/** Remplace les préférences puis relance l'interface pour les appliquer. */
function restorePrefs(items: Record<string, string>) {
  for (const k of Object.keys(prefs())) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(items)) if (k.startsWith("lumiere.") && !NOT_PREFS.test(k)) localStorage.setItem(k, v);
  location.reload();
}

export async function exportPrefs() {
  if (!needsApp()) return;
  if (await writeJson(t("preferences-lumiere.json"), "json", t("Préférences Lumière"), { format: "lumiere-prefs", version: 1, items: prefs() })) {
    notify(t("Préférences exportées"));
  }
}

export async function importPrefs() {
  if (!needsApp()) return;
  try {
    const data = (await readJson("json", t("Préférences Lumière"))) as { format?: string; items?: Record<string, string> } | null;
    if (!data) return;
    if (data.format !== "lumiere-prefs" || !data.items) throw new Error(t("Ce n'est pas un fichier de préférences Lumière"));
    backupPrefs(true);
    restorePrefs(data.items);
  } catch (e) {
    notify(t("Import impossible : {error}", { error: message(e) }));
  }
}

export interface PrefsBackup {
  time: number;
  items: Record<string, string>;
}

const BACKUPS = "lumiere.prefsBackups";

export function prefsBackups(): PrefsBackup[] {
  try {
    return JSON.parse(localStorage.getItem(BACKUPS) ?? "[]");
  } catch {
    return [];
  }
}

/** Sauvegarde des préférences : une par jour au démarrage, et avant chaque import. */
export function backupPrefs(force = false) {
  const list = prefsBackups();
  if (!force && list[0] && Date.now() - list[0].time < 24 * 3600e3) return;
  try {
    localStorage.setItem(BACKUPS, JSON.stringify([{ time: Date.now(), items: prefs() }, ...list].slice(0, 5)));
  } catch {
    // stockage plein : pas de sauvegarde
  }
}

export const restoreBackup = (b: PrefsBackup) => restorePrefs(b.items);

// ------------------------------------------------------------------ Profils

/** Profils : jeux complets de préférences (appareils, bibliothèques, raccourcis…), comme dans LightBurn. */
const PROFILES = "lumiere.profiles";
const PROFILE = "lumiere.profile";

export function profiles(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(PROFILES) ?? "{}");
  } catch {
    return {};
  }
}

export const currentProfile = () => localStorage.getItem(PROFILE) ?? t("Par défaut");

function writeProfiles(p: Record<string, Record<string, string>>) {
  localStorage.setItem(PROFILES, JSON.stringify(p));
}

/** Enregistre les préférences actuelles sous ce nom (et en fait le profil courant). */
export function saveProfile(name: string) {
  writeProfiles({ ...profiles(), [name]: prefs() });
  localStorage.setItem(PROFILE, name);
}

/** Passe à un autre profil : le profil courant est mis à jour, puis l'interface redémarre. */
export function switchProfile(name: string) {
  const all = { ...profiles(), [currentProfile()]: prefs() };
  writeProfiles(all);
  localStorage.setItem(PROFILE, name);
  restorePrefs(all[name] ?? {});
}

export function deleteProfile(name: string) {
  if (name === currentProfile()) return;
  const { [name]: _gone, ...rest } = profiles();
  writeProfiles(rest);
}

// --------------------------------------------------------------------- Lots

/** Un lot réunit machines, macros et bibliothèque de matériaux, pour passer d'un poste à l'autre. */
const BUNDLE_KEYS = ["lumiere.devices", "lumiere.macros", "lumiere.materialLibs"] as const;

/** Contenu d'une clé de lot sous forme de liste (les bibliothèques sont rangées dans un objet). */
function bundleList(k: string): { id?: string; name?: string }[] {
  const v = JSON.parse(localStorage.getItem(k) ?? "null");
  if (k === "lumiere.materialLibs") return v?.libs ?? [];
  return Array.isArray(v) ? v : [];
}

export async function exportBundle() {
  if (!needsApp()) return;
  const items = Object.fromEntries(BUNDLE_KEYS.map((k) => [k, bundleList(k)]));
  if (await writeJson(t("lot-lumiere.json"), "json", t("Lot Lumière"), { format: "lumiere-bundle", version: 1, items })) {
    notify(t("Lot exporté"));
  }
}

/** Ajoute le contenu d'un lot (les éléments de même identifiant ou de même nom sont remplacés). */
export async function importBundle() {
  if (!needsApp()) return;
  try {
    const data = (await readJson("json", t("Lot Lumière"))) as { format?: string; items?: Record<string, unknown> } | null;
    if (!data) return;
    if (data.format !== "lumiere-bundle" || !data.items) throw new Error(t("Ce n'est pas un lot Lumière"));
    backupPrefs(true);
    // Anciens lots : une seule bibliothèque de matériaux (liste d'entrées).
    if (Array.isArray(data.items["lumiere.materials"])) {
      data.items["lumiere.materialLibs"] = [{ id: "bundle-materials", name: t("Bibliothèque du lot"), presets: data.items["lumiere.materials"] }];
    }
    for (const k of BUNDLE_KEYS) {
      const incoming = data.items[k];
      if (!Array.isArray(incoming)) continue;
      const current = bundleList(k);
      const key = (x: { id?: string; name?: string }) => x.id ?? x.name;
      const merged = [...current.filter((c) => !incoming.some((n) => key(n) === key(c))), ...incoming];
      if (k === "lumiere.materialLibs") {
        const cur = JSON.parse(localStorage.getItem(k) ?? "null")?.current ?? merged[0]?.id;
        localStorage.setItem(k, JSON.stringify({ libs: merged, current: merged.some((l) => l.id === cur) ? cur : merged[0]?.id }));
      } else localStorage.setItem(k, JSON.stringify(merged));
    }
    location.reload();
  } catch (e) {
    notify(t("Import impossible : {error}", { error: message(e) }));
  }
}

// ---------------------------------------------------------------- Impression

/**
 * Imprime le dessin à l'échelle 1:1 sur papier (repérage, Imprimer et découper…). La page
 * est préparée dans une zone visible seulement à l'impression.
 */
export async function printDesign(keepColors: boolean) {
  const st = getState();
  if (!st.project.shapes.length) return notify(t("Rien à imprimer"));
  let svg = exportSvg(st.project, st.machine.bedWidth, st.machine.bedHeight);
  if (!keepColors) {
    for (const c of PALETTE) svg = svg.split(`stroke="${c}"`).join(`stroke="#000"`);
  }
  let area = document.getElementById("print-area");
  if (!area) {
    area = document.createElement("div");
    area.id = "print-area";
    document.body.appendChild(area);
  }
  area.innerHTML = svg.replace(/^<\?xml[^>]*>\s*/, "");
  if (isTauri()) await invoke("print_page").catch((e) => notify(t("Impression impossible : {error}", { error: message(e) })));
  else window.print();
}

// ------------------------------------------------------------------ Caméra

export async function saveBackgroundCapture() {
  const overlay = getCamera().overlay;
  if (!overlay) return notify(t("Aucune capture : mettez d'abord à jour l'image de la caméra"));
  if (!needsApp()) return;
  const path = await save({ defaultPath: t("capture.png"), filters: [{ name: "PNG", extensions: ["png"] }] });
  if (!path) return;
  const blob = await new Promise<Blob | null>((resolve) => overlay.toBlob(resolve, "image/png"));
  if (!blob) return;
  await invoke("write_binary_file", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-path": encodeURIComponent(path) } });
  notify(t("Capture enregistrée"));
}
