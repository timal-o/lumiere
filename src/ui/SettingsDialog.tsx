// Réglages de l'application (préférences de l'utilisateur, indépendantes de la machine).

import { useEffect, useState } from "react";
import { language, LOCALES, setLanguage, t, tk } from "../i18n";
import { listFonts } from "../text";
import { getState, setState, useStore, type ToolOptions } from "../store";
import { Modal } from "./Menu";
import { NumField } from "./NumField";
import { reopenAfterRemount } from "./Dialogs";

const PANEL_LABEL: Record<"properties" | "layers" | "laser", string> = { properties: tk("Propriétés"), layers: tk("Coupes / Calques"), laser: tk("Laser") };

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const o = useStore((s) => s.toolOptions);
  const set = (patch: Partial<ToolOptions>) => setState({ toolOptions: { ...getState().toolOptions, ...patch } });
  const [families, setFamilies] = useState<string[]>([]);
  useEffect(() => {
    listFonts().then((fonts) => setFamilies([...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b)))).catch(() => {});
  }, []);
  const check = (label: string, key: "ignoreOutOfBounds" | "beginner" | "selectAfterDraw" | "invertWheel" | "centerCross" | "fullCursor" | "importCenter" | "importGroup") => (
    <label className="check">
      <input type="checkbox" checked={o[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <Modal title={t("Paramètres")} onClose={onClose} width={480}>
      <h3 className="settings-title">{t("Général")}</h3>
      <label className="field">
        {/* Toujours bilingue : chacun doit pouvoir retrouver ce réglage. */}
        <span>{language() === "en" ? "Language" : `${t("Langue")} / Language`}</span>
        <select
          value={language()}
          onChange={(e) => {
            // L'interface est reconstruite dans la nouvelle langue : la fenêtre doit y rester ouverte.
            reopenAfterRemount("settings");
            setLanguage(e.target.value);
          }}
        >
          {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t("Unités")}</span>
        <select value={o.units} onChange={(e) => set({ units: e.target.value as ToolOptions["units"] })}>
          <option value="mm">{t("Millimètres")}</option>
          <option value="in">{t("Pouces")}</option>
        </select>
      </label>
      <label className="field">
        <span>{t("Unité des vitesses")}</span>
        <select value={o.speedUnit} onChange={(e) => set({ speedUnit: e.target.value as ToolOptions["speedUnit"] })}>
          <option value="mm/min">{o.units === "in" ? "in/min" : "mm/min"}</option>
          <option value="mm/s">{o.units === "in" ? "in/s" : "mm/s"}</option>
        </select>
      </label>

      <h3 className="settings-title">{t("Magnétisme")}</h3>
      <label className="check">
        <input type="checkbox" checked={o.snapObjects} onChange={(e) => set({ snapObjects: e.target.checked })} />
        {t("Magnétisme : objets")}
      </label>
      <label className="check">
        <input type="checkbox" checked={o.snapGrid} onChange={(e) => set({ snapGrid: e.target.checked })} />
        {t("Magnétisme : grille")}
      </label>
      <NumField label={t("Pas de la grille")} unit="mm" value={o.gridSize} min={0.01} max={100} disabled={!o.snapGrid} onChange={(gridSize) => set({ gridSize })} />
      <div className="grid2">
        <NumField label={t("Distance du magnétisme")} unit="px" value={o.snapDistance} min={1} max={50} digits={0} onChange={(snapDistance) => set({ snapDistance })} />
        <NumField label={t("Tolérance du clic")} unit="px" value={o.clickTolerance} min={1} max={30} digits={0} onChange={(clickTolerance) => set({ clickTolerance })} />
      </div>

      <h3 className="settings-title">{t("Édition")}</h3>
      <div className="grid2">
        <NumField label={t("Déplacement aux flèches")} unit="mm" value={o.arrowStep} min={0.001} max={100} digits={3} onChange={(arrowStep) => set({ arrowStep })} />
        <NumField label={t("Avec Maj")} unit="mm" value={o.arrowStepLarge} min={0.001} max={1000} digits={3} onChange={(arrowStepLarge) => set({ arrowStepLarge })} />
        <NumField label={t("Avec ⌥")} unit="mm" value={o.arrowStepSmall} min={0.001} max={100} digits={3} onChange={(arrowStepSmall) => set({ arrowStepSmall })} />
        <NumField label={t("Sauvegarde automatique après (0 = jamais)")} unit="s" value={o.autosaveDelay} min={0} max={3600} digits={0} onChange={(autosaveDelay) => set({ autosaveDelay })} />
      </div>
      {check(t("Mode débutant (interface simplifiée)"), "beginner")}
      {check(t("Ignorer les formes hors de la zone de travail"), "ignoreOutOfBounds")}
      {check(t("Revenir à l'outil Sélection après avoir dessiné une forme"), "selectAfterDraw")}
      {check(t("Inverser le sens du zoom à la molette"), "invertWheel")}
      <div className="grid2">
        <label className="field">
          <span>{t("Police par défaut")}</span>
          <select value={o.defaultFontFamily} onChange={(e) => set({ defaultFontFamily: e.target.value })}>
            <option value="">{t("Automatique")}</option>
            {families.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <NumField label={t("Hauteur de texte par défaut")} unit="mm" value={o.defaultTextHeight} min={0.5} max={500} step={0.5} onChange={(defaultTextHeight) => set({ defaultTextHeight })} />
      </div>
      <div className="row" title={t("Polices AutoCAD à trait simple, ajoutées à la liste des polices")}>
        <span className="grow">{t("Dossier des polices SHX")} : <span className="muted">{o.shxDir || t("Aucun dossier défini")}</span></span>
        <button onClick={async () => {
          const { open } = await import("@tauri-apps/plugin-dialog");
          const dir = await open({ directory: true, title: t("Choisir le dossier des polices SHX") });
          if (typeof dir === "string") set({ shxDir: dir });
        }}>{t("Choisir…")}</button>
        {o.shxDir && <button onClick={() => set({ shxDir: "" })} title={t("Retirer le dossier des polices SHX")}>{t("Effacer")}</button>}
      </div>

      <h3 className="settings-title">{t("Affichage")}</h3>
      <div className="grid2">
        <label className="field">
          <span>{t("Thème de l'application")}</span>
          <select value={o.theme ?? "system"} onChange={(e) => set({ theme: e.target.value as typeof o.theme })}>
            <option value="system">{t("Celui du système")}</option>
            <option value="light">{t("Clair")}</option>
            <option value="dark">{t("Sombre")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("Taille des icônes")}</span>
          <select value={o.iconSize ?? "normal"} onChange={(e) => set({ iconSize: e.target.value as typeof o.iconSize })}>
            <option value="small">{t("Petite")}</option>
            <option value="normal">{t("Normale")}</option>
            <option value="large">{t("Grande")}</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>{t("Panneaux latéraux")}</span>
          <select value={o.panelSide ?? "right"} onChange={(e) => set({ panelSide: e.target.value as "left" | "right" })}>
            <option value="right">{t("À droite")}</option>
            <option value="left">{t("À gauche")}</option>
          </select>
        </label>
        {(o.panelOrder ?? ["properties", "layers", "laser"]).map((p, i, list) => (
          <span key={p} className="panel-chip">
            {t(PANEL_LABEL[p])}
            <button className="small" disabled={i === 0} aria-label={t("Monter")}
              onClick={() => set({ panelOrder: list.map((x, j) => (j === i - 1 ? p : j === i ? list[i - 1] : x)) })}>▲</button>
          </span>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={o.showLastPos !== false} onChange={(e) => set({ showLastPos: e.target.checked })} />
        {t("Afficher la dernière position de la tête après déconnexion")}
      </label>
      <label className="check">
        <input type="checkbox" checked={!!o.paletteLabels} onChange={(e) => set({ paletteLabels: e.target.checked })} />
        {t("Numéros sur les boutons de la palette")}
      </label>
      <NumField label={t("Pas de la grille visuelle")} unit="mm" value={o.gridSpacing} min={0.1} max={500} digits={1} onChange={(gridSpacing) => set({ gridSpacing })} />
      {check(t("Afficher une croix au centre du plateau"), "centerCross")}
      {check(t("Curseur en lignes plein écran"), "fullCursor")}

      <h3 className="settings-title">{t("Import")}</h3>
      {check(t("Centrer les formes importées sur le plateau"), "importCenter")}
      {check(t("Grouper les formes d'un même fichier"), "importGroup")}
      <div className="grid2">
        <label className="field">
          <span>{t("Résolution des SVG (px)")}</span>
          <select value={o.svgDpi} onChange={(e) => set({ svgDpi: Number(e.target.value) as ToolOptions["svgDpi"] })}>
            <option value={96}>{t("96 DPI – Inkscape (par défaut)")}</option>
            <option value={72}>{t("72 DPI – Illustrator")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("Précision HPGL / PLT")}</span>
          <select value={o.hpglPerInch} onChange={(e) => set({ hpglPerInch: Number(e.target.value) as ToolOptions["hpglPerInch"] })}>
            <option value={1016}>1" / 1016</option>
            <option value={1000}>1" / 1000</option>
          </select>
        </label>
      </div>

      <div className="row end">
        <button className="primary" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}
