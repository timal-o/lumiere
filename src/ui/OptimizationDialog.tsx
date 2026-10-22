// Outils laser → Paramètres d'optimisation (ordre et points de départ des découpes).

import { t } from "../i18n";
import { DEFAULT_OPTIMIZATION, type Optimization } from "../model";
import { commit, useStore } from "../store";
import { Modal } from "./Menu";
import { NumField } from "./NumField";

const KEY = "lumiere.optimization";

/** Réglages par défaut de l'utilisateur (« Définir comme valeurs par défaut »), sinon ceux de Lumière. */
export function defaultOptimization(): Optimization {
  try {
    return { ...DEFAULT_OPTIMIZATION, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_OPTIMIZATION;
  }
}

export function OptimizationDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const o = { ...defaultOptimization(), ...project.optimization };
  const set = (patch: Partial<Optimization>) => commit((p) => ({ ...p, optimization: { ...o, ...patch } }));
  const allLayers = (key: "innerFirst" | "removeOverlaps") => project.layers.length > 0 && project.layers.every((l) => l[key]);
  const setLayers = (key: "innerFirst" | "removeOverlaps", on: boolean) =>
    commit((p) => ({ ...p, layers: p.layers.map((l) => ({ ...l, [key]: on })) }));
  const check = (label: string, value: boolean, onChange: (v: boolean) => void, disabled = false) => (
    <label className="check">
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
  const off = !o.reorder;
  return (
    <Modal title={t("Paramètres d'optimisation de la coupe")} onClose={onClose} width={460}>
      {check(t("Activer l'optimisation et le réordonnement des sorties"), o.reorder, (reorder) => set({ reorder }))}
      <div className="grid2">
        <label className="field">
          <span>{t("Ordre")}</span>
          <select value={o.order} onChange={(e) => set({ order: e.target.value as Optimization["order"] })}>
            <option value="layer">{t("Trier par calque")}</option>
            <option value="group">{t("Trier par groupe")}</option>
            <option value="priority">{t("Trier par priorité")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("Couper dans l'ordre de la direction")}</span>
          <select value={o.directionOrder ?? ""} disabled={off} onChange={(e) => set({ directionOrder: (e.target.value || null) as Optimization["directionOrder"] })}>
            <option value="">{t("Non")}</option>
            <option value="left">{t("Depuis la gauche")}</option>
            <option value="right">{t("Depuis la droite")}</option>
            <option value="top">{t("Depuis le haut")}</option>
            <option value="bottom">{t("Depuis le bas")}</option>
          </select>
        </label>
      </div>
      {check(t("Réduire les déplacements"), o.reduceTravel, (reduceTravel) => set({ reduceTravel }), off || !!o.directionOrder)}
      {check(t("Choisir le meilleur point de départ"), o.bestStart, (bestStart) => set({ bestStart }), off)}
      {check(t("Choisir les coins, si possible"), o.corners, (corners) => set({ corners }), off || !o.bestStart)}
      {check(t("Choisir la meilleure direction"), o.bestDirection, (bestDirection) => set({ bestDirection }), off)}
      {check(t("Couper les formes intérieures en premier (tous les calques)"), allLayers("innerFirst"), (v) => setLayers("innerFirst", v), off)}
      {check(t("Retirer les lignes qui se chevauchent (tous les calques)"), allLayers("removeOverlaps"), (v) => setLayers("removeOverlaps", v))}
      {check(t("Découpes en dernier (calques Ligne après les gravures)"), !!o.cutsLast, (cutsLast) => set({ cutsLast }))}
      <NumField label={t("Masquer le jeu : distance d'approche (0 = non)")} unit="mm" value={o.backlash} min={0} max={20} step={0.1} digits={2} onChange={(backlash) => set({ backlash })} />
      <p className="hint">{t("Avec « Trier par priorité », la priorité de chaque forme se règle dans le panneau Propriétés (les plus petites d'abord).")}</p>
      <div className="row end">
        <button onClick={() => set(defaultOptimization())}>{t("Réinitialisation aux valeurs par défaut")}</button>
        <button onClick={() => {
          try {
            localStorage.setItem(KEY, JSON.stringify(o));
          } catch {
            // stockage indisponible
          }
        }}>{t("Définir comme valeurs par défaut")}</button>
        <span className="grow" />
        <button className="primary" onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}
