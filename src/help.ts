// Menu Aide : documentation, entraide, signalement de bugs, données de support, mises à jour.

import { openUrl } from "@tauri-apps/plugin-opener";
import { version } from "../package.json";
import { api, isTauri } from "./backend";
import { notify } from "./actions";
import { language, t } from "./i18n";
import { getLaserState } from "./laser";
import { getState } from "./store";

export const REPO = "https://github.com/timal-o/lumiere";

export async function openLink(url: string) {
  try {
    if (isTauri()) await openUrl(url);
    else window.open(url, "_blank", "noopener");
  } catch (e) {
    notify(t("Ouverture du lien impossible : {error}", { error: String(e) }));
  }
}

/** Guide d'utilisation dans la langue de l'interface (anglais par défaut). */
export function openDocs() {
  const lang = language();
  const file = lang === "en" || !["fr", "es", "zh-CN"].includes(lang) ? "user-guide.md" : `user-guide.${lang}.md`;
  return openLink(`${REPO}/blob/main/docs/${file}`);
}

export const openDiscussions = () => openLink(`${REPO}/discussions`);

/** Informations utiles à un rapport, sans données personnelles (ni projet, ni adresse de la machine). */
function environment(): string {
  const m = getState().machine;
  return [
    `- Lumière ${version}`,
    `- ${navigator.userAgent}`,
    `- ${t("Langue")} : ${language()}`,
    `- ${t("Contrôleur")} : ${m.firmware}, ${m.bedWidth} × ${m.bedHeight} mm`,
  ].join("\n");
}

export function reportBug() {
  const body = `### ${t("Ce qui s'est passé")}\n\n\n### ${t("Ce qui était attendu")}\n\n\n### ${t("Étapes pour reproduire")}\n\n1. \n\n### ${t("Environnement")}\n${environment()}\n`;
  return openLink(`${REPO}/issues/new?labels=bug&body=${encodeURIComponent(body)}`);
}

export function requestFeature() {
  const body = `### ${t("Fonctionnalité souhaitée")}\n\n\n### ${t("Pourquoi")}\n\n`;
  return openLink(`${REPO}/issues/new?labels=enhancement&body=${encodeURIComponent(body)}`);
}

/** Fichier de diagnostic à joindre à un rapport : versions, réglages machine, fin du journal. */
export async function saveSupportData() {
  const st = getState();
  // L'adresse réseau de la machine reste sur le poste.
  const { host: _host, ...machine } = st.machine;
  const data = {
    app: "Lumière",
    version,
    date: new Date().toISOString(),
    platform: navigator.userAgent,
    language: language(),
    machine,
    project: { shapes: st.project.shapes.length, layers: st.project.layers.map((l) => ({ name: l.name, mode: l.mode })) },
    log: getLaserState().log.slice(-200),
  };
  const contents = JSON.stringify(data, null, 2);
  if (!isTauri()) {
    console.log(contents);
    return notify(t("Disponible dans l'application de bureau uniquement"));
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({ defaultPath: "lumiere-support.json", filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path) return;
  await api.writeTextFile(path, contents);
  notify(t("Données de support enregistrées : joignez ce fichier à votre rapport"));
}

/** Compare des versions « 1.2.3 » (le préfixe « v » est ignoré). */
export function newerThan(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(/[.-]/).map(Number), pb = b.replace(/^v/, "").split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

export async function checkUpdates() {
  try {
    const res = await fetch("https://api.github.com/repos/timal-o/lumiere/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 404) return notify(t("Aucune version publiée pour l'instant (version actuelle : {version})", { version }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const release = (await res.json()) as { tag_name: string; html_url: string };
    if (newerThan(release.tag_name, version)) {
      notify(t("Nouvelle version disponible : {latest}", { latest: release.tag_name }));
      await openLink(release.html_url);
    } else notify(t("Lumière est à jour (version {version})", { version }));
  } catch (e) {
    notify(t("Vérification impossible : {error}", { error: String(e) }));
  }
}
