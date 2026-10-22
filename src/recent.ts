// Fichier → Projets récents et Modèles récents (chemins gardés dans le stockage local).

export type RecentKind = "project" | "template";

const KEYS: Record<RecentKind, string> = { project: "lumiere.recent", template: "lumiere.recentTemplates" };
const MAX = 10;

export function recentList(kind: RecentKind): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEYS[kind]) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function store(kind: RecentKind, list: string[]) {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify(list));
  } catch {
    // stockage indisponible : la liste n'est pas gardée
  }
  // Le menu natif affiche ces listes : il est reconstruit.
  window.dispatchEvent(new Event("lumiere:menu-refresh"));
}

export function addRecent(kind: RecentKind, path: string) {
  store(kind, [path, ...recentList(kind).filter((p) => p !== path)].slice(0, MAX));
}

export function removeRecent(kind: RecentKind, path: string) {
  store(kind, recentList(kind).filter((p) => p !== path));
}

export const clearRecent = (kind: RecentKind) => store(kind, []);
