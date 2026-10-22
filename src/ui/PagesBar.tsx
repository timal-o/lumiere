// Onglets des pages du projet, au-dessus du plan de travail.

import { useState } from "react";
import { t } from "../i18n";
import { addPage, deletePage, duplicatePage, importPages, insertPage, pagesOf, renamePage, setWorkpiece, switchPage } from "../pages";
import { NumField } from "./NumField";
import { chooseFiles, notify } from "../actions";
import type { Project, Workpiece } from "../model";
import { useStore } from "../store";

export function PagesBar() {
  const project = useStore((s) => s.project);
  const pages = pagesOf(project);
  const current = project.page ?? 0;
  const [editing, setEditing] = useState<number | null>(null);
  const [setup, setSetup] = useState(false);
  return (
    <div className="pages-bar" role="tablist" aria-label={t("Pages")}>
      {pages.map((pg, i) =>
        editing === i ? (
          <input key={i} className="page-name" autoFocus defaultValue={pg.name}
            onBlur={(e) => (renamePage(i, e.target.value.trim() || pg.name), setEditing(null))}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(null);
            }} />
        ) : (
          <button key={i} role="tab" aria-selected={i === current} className={i === current ? "page active" : "page"}
            onClick={() => switchPage(i)} onDoubleClick={() => setEditing(i)} title={t("Double-clic pour renommer")}>
            {pg.name}
          </button>
        ),
      )}
      <button className="page-action" onClick={addPage} title={t("Ajouter une page")} aria-label={t("Ajouter une page")}>+</button>
      <button className="page-action" onClick={insertPage} title={t("Insérer une page après celle-ci")} aria-label={t("Insérer une page après celle-ci")}>↳</button>
      <button className="page-action" onClick={async () => {
        const [file] = await chooseFiles(["lum"], t("Projet Lumière"));
        if (!file) return;
        try {
          const p = JSON.parse(await file.text()) as Project;
          if (p.format !== "lumiere") throw new Error(t("Ce n'est pas un projet Lumière"));
          importPages(p);
        } catch (e) {
          notify(String(e instanceof Error ? e.message : e));
        }
      }} title={t("Importer les pages d'un autre projet")} aria-label={t("Importer les pages d'un autre projet")}>⇩</button>
      <button className="page-action" onClick={duplicatePage} title={t("Dupliquer la page")} aria-label={t("Dupliquer la page")}>⧉</button>
      <button className="page-action" onClick={() => setSetup(!setup)} title={t("Mise en page : taille de la pièce de cette page")} aria-label={t("Mise en page")}>⚙</button>
      {setup && (() => {
        const wp = project.workpieces?.[current] ?? null;
        const w: Workpiece = wp ?? { w: 100, h: 100, anchor: "frontLeft" };
        return (
          <span className="page-setup">
            <label className="check">
              <input type="checkbox" checked={!!wp} onChange={(e) => setWorkpiece(current, e.target.checked ? w : null)} />
              {t("Pièce")}
            </label>
            {wp && (
              <>
                <NumField value={wp.w} unit="mm" min={1} max={5000} width={52} onChange={(v) => setWorkpiece(current, { ...wp, w: v })} />
                ×
                <NumField value={wp.h} unit="mm" min={1} max={5000} width={52} onChange={(v) => setWorkpiece(current, { ...wp, h: v })} />
                <select value={wp.anchor} onChange={(e) => setWorkpiece(current, { ...wp, anchor: e.target.value as Workpiece["anchor"] })}>
                  <option value="frontLeft">{t("Avant gauche")}</option>
                  <option value="frontRight">{t("Avant droite")}</option>
                  <option value="rearLeft">{t("Arrière gauche")}</option>
                  <option value="rearRight">{t("Arrière droite")}</option>
                  <option value="center">{t("Centre")}</option>
                </select>
              </>
            )}
          </span>
        );
      })()}
      <button className="page-action" disabled={pages.length < 2} onClick={() => deletePage()} title={t("Supprimer la page")} aria-label={t("Supprimer la page")}>−</button>
    </div>
  );
}
