// Pages du projet (onglets au-dessus du plan de travail), calques partagés.

import { t } from "./i18n";
import { uid, type Page, type Project, type Workpiece } from "./model";
import { commit, getState } from "./store";

/** Pages complètes, la page affichée reprenant les formes en cours. */
export function pagesOf(p: Project): Page[] {
  if (!p.pages?.length) return [{ name: t("Page {n}", { n: 1 }), shapes: p.shapes }];
  return p.pages.map((pg, i) => (i === (p.page ?? 0) ? { ...pg, shapes: p.shapes } : pg));
}

/** Projet à enregistrer : pages à jour (sans champ de pages s'il n'y en a qu'une). */
export function projectForSave(p: Project): Project {
  if (!p.pages || p.pages.length < 2) {
    const { pages: _pages, page: _page, ...rest } = p;
    return rest;
  }
  return { ...p, pages: pagesOf(p) };
}

function show(p: Project, pages: Page[], index: number): Project {
  const i = Math.max(0, Math.min(pages.length - 1, index));
  return { ...p, pages, page: i, shapes: pages[i].shapes };
}

export function switchPage(index: number) {
  const p = getState().project;
  if (index === (p.page ?? 0)) return;
  commit((q) => show(q, pagesOf(q), index), { selection: [], preview: null });
}

export function addPage() {
  commit((q) => {
    const pages = pagesOf(q);
    return show(q, [...pages, { name: t("Page {n}", { n: pages.length + 1 }), shapes: [] }], pages.length);
  }, { selection: [], preview: null });
}

/** Insère une page vide après la page affichée. */
export function insertPage() {
  commit((q) => {
    const pages = pagesOf(q);
    const i = q.page ?? 0;
    return show(q, [...pages.slice(0, i + 1), { name: t("Page {n}", { n: pages.length + 1 }), shapes: [] }, ...pages.slice(i + 1)], i + 1);
  }, { selection: [], preview: null });
}

/** Ajoute les pages d'un autre projet (les calques manquants sont ajoutés). */
export function importPages(other: Project) {
  commit((q) => {
    const pages = pagesOf(q);
    const extra = pagesOf(other).map((pg) => ({ ...pg, shapes: pg.shapes.map((s) => ({ ...s, id: uid() })) }));
    const known = new Set(q.layers.map((l) => l.id));
    const layers = [...q.layers, ...other.layers.filter((l) => !known.has(l.id))];
    return show({ ...q, layers }, [...pages, ...extra], pages.length);
  }, { selection: [], preview: null });
}

export function duplicatePage() {
  commit((q) => {
    const pages = pagesOf(q);
    const i = q.page ?? 0;
    const copy = { name: t("{name} (copie)", { name: pages[i].name }), shapes: pages[i].shapes.map((s) => ({ ...s, id: uid() })) };
    return show(q, [...pages.slice(0, i + 1), copy, ...pages.slice(i + 1)], i + 1);
  }, { selection: [], preview: null });
}

/** Taille de la pièce de la page (null : aucune). */
export function setWorkpiece(index: number, wp: Workpiece | null) {
  commit((q) => {
    const list = [...(q.workpieces ?? [])];
    while (list.length <= index) list.push(null);
    list[index] = wp;
    return { ...q, workpieces: list };
  });
}

export function deletePage(index = getState().project.page ?? 0) {
  const pages = pagesOf(getState().project);
  if (pages.length < 2) return;
  commit((q) => {
    const rest = pagesOf(q).filter((_, j) => j !== index);
    const workpieces = q.workpieces?.filter((_, j) => j !== index);
    q = { ...q, workpieces };
    return show(q, rest, Math.min(index, rest.length - 1));
  }, { selection: [], preview: null });
}

export function renamePage(index: number, name: string) {
  commit((q) => {
    const pages = pagesOf(q).map((pg, j) => (j === index ? { ...pg, name } : pg));
    return { ...q, pages, page: q.page ?? 0 };
  });
}
