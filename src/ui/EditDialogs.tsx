// Fenêtres des menus Modifier et Outils : tolérance de fermeture, assistant booléen,
// réglage d'image, historique des annulations.

import { useMemo, useState } from "react";
import { pathsBox } from "../geometry";
import { language, t } from "../i18n";
import type { ImageShape, Polyline } from "../model";
import { currentProfile, deleteProfile, prefsBackups, profiles, restoreBackup, saveProfile, switchProfile } from "../files";
import { pendingStart, startJob, traceFiles } from "../actions";
import { taperWarp } from "../lasertools";
import { applyBoolean, booleanCandidates, closePaths, resizeSlots, selectCircles } from "../shapeops";
import { history, jumpHistory, useStore } from "../store";
import { ParamDialog } from "./Dialogs";
import { Modal } from "./Menu";
import { ImageProps } from "./PropertiesPanel";

export function CloseToleranceDialog({ onClose }: { onClose: () => void }) {
  return (
    <ParamDialog title={t("Fermer les chemins sélectionnés avec tolérance")} onClose={onClose} ok={t("Fermer")} initial={{ tol: 0.5 }}
      fields={[{ key: "tol", label: t("Tolérance"), kind: "number", unit: "mm", min: 0.001, max: 100, step: 0.1, digits: 3 }]}
      hint={t("Ferme les tracés ouverts dont les deux extrémités sont plus proches que la tolérance.")}
      onOk={(v) => closePaths(v.tol as number)} />
  );
}

/** Petit aperçu SVG d'un ensemble de tracés. */
function Thumb({ paths, size = 96 }: { paths: Polyline[]; size?: number }) {
  const box = pathsBox(paths);
  if (!box) return <div className="bool-thumb empty" style={{ width: size, height: size }}>∅</div>;
  const pad = Math.max(box.w, box.h) * 0.06;
  const d = paths.map((p) => "M" + p.pts.map(([x, y]) => `${x},${y}`).join("L") + (p.closed ? "Z" : "")).join("");
  return (
    <svg className="bool-thumb" width={size} height={size} viewBox={`${box.x - pad} ${box.y - pad} ${box.w + 2 * pad} ${box.h + 2 * pad}`}>
      <path d={d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BooleanAssistantDialog({ onClose }: { onClose: () => void }) {
  const candidates = useMemo(booleanCandidates, []);
  if (!candidates) {
    return (
      <Modal title={t("Assistant booléen")} onClose={onClose}>
        <p>{t("Sélectionnez exactement deux formes vectorielles : A (la première) et B (la seconde).")}</p>
        <div className="row end"><button onClick={onClose}>{t("Fermer")}</button></div>
      </Modal>
    );
  }
  return (
    <Modal title={t("Assistant booléen")} onClose={onClose} width={620}>
      <p className="hint">{t("Cliquez le résultat voulu. A est la première forme sélectionnée, B la seconde.")}</p>
      <div className="bool-grid">
        {candidates.map((c) => (
          <button key={c.key} className="bool-choice" disabled={!c.paths.length}
            onClick={() => {
              applyBoolean(c.paths, t(c.label));
              onClose();
            }}>
            <Thumb paths={c.paths} />
            <span>{t(c.label)}</span>
          </button>
        ))}
      </div>
      <div className="row end"><button onClick={onClose}>{t("Annuler")}</button></div>
    </Modal>
  );
}

export function AdjustImageDialog({ onClose }: { onClose: () => void }) {
  const image = useStore((s) => {
    const ids = new Set(s.selection);
    return s.project.shapes.find((sh): sh is ImageShape => ids.has(sh.id) && sh.kind === "image");
  });
  return (
    <Modal title={t("Ajuster l'image")} onClose={onClose} width={420}>
      {image ? <ImageProps shape={image} /> : <p>{t("Sélectionnez une image")}</p>}
      <div className="row end"><button className="primary" onClick={onClose}>{t("Fermer")}</button></div>
    </Modal>
  );
}

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  // Relu à chaque modification du projet.
  useStore((s) => s.project);
  const entries = history();
  const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString() : "");
  return (
    <Modal title={t("Historique des annulations")} onClose={onClose} width={420}>
      <ol className="history-list">
        {entries.map((e, i) => (
          <li key={i}>
            <button className={e.offset === 0 ? "current" : e.offset > 0 ? "future" : ""} onClick={() => jumpHistory(e.offset)}>
              <span>{e.offset === 0 ? t("État actuel") : e.label ?? (i === 0 ? t("État initial") : t("Étape {n}", { n: i }))}</span>
              <span className="muted">{t("{n} forme(s)", { n: e.shapes })} {time(e.time)}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="hint">{t("Cliquez un état pour y revenir ; les états en gris peuvent être rétablis.")}</p>
      <div className="row end"><button className="primary" onClick={onClose}>{t("Fermer")}</button></div>
    </Modal>
  );
}

export function PrefsBackupsDialog({ onClose }: { onClose: () => void }) {
  const backups = prefsBackups();
  return (
    <Modal title={t("Charger une sauvegarde des préférences")} onClose={onClose} width={420}>
      {backups.length ? (
        <ol className="history-list">
          {backups.map((b) => (
            <li key={b.time}>
              <button onClick={() => restoreBackup(b)}>
                <span>{new Date(b.time).toLocaleString(language())}</span>
                <span className="muted">{t("{n} réglage(s)", { n: Object.keys(b.items).length })}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : <p>{t("Aucune sauvegarde pour l'instant.")}</p>}
      <p className="hint">{t("Une sauvegarde est faite chaque jour au démarrage et avant chaque import. L'interface redémarre après la restauration.")}</p>
      <div className="row end"><button onClick={onClose}>{t("Fermer")}</button></div>
    </Modal>
  );
}

export function TaperWarpDialog({ onClose }: { onClose: () => void }) {
  return (
    <ParamDialog title={t("Déformation conique")} onClose={onClose} ok={t("Déformer")} initial={{ top: 90, bottom: 70 }}
      fields={[
        { key: "top", label: t("Diamètre en haut"), kind: "number", unit: "mm", min: 1, max: 1000, step: 1 },
        { key: "bottom", label: t("Diamètre en bas"), kind: "number", unit: "mm", min: 1, max: 1000, step: 1 },
      ]}
      hint={t("Pour graver un objet conique (gobelet) au rotatif : la largeur du dessin suit le diamètre, du haut au bas de la sélection.")}
      onOk={(v) => taperWarp(v.top as number, v.bottom as number)} />
  );
}

export function SlotResizerDialog({ onClose }: { onClose: () => void }) {
  return (
    <ParamDialog title={t("Redimensionner les encoches")} onClose={onClose} ok={t("Appliquer")}
      initial={{ mode: "slots", old: 3, next: 3.2, depth: 0, tol: 0.1 }}
      fields={[
        { key: "mode", label: t("Ajuster"), kind: "choice", options: [["slots", t("Encoches (vers l'intérieur)")], ["tabs", t("Tenons (en saillie)")]] },
        { key: "old", label: t("Épaisseur actuelle du matériau"), kind: "number", unit: "mm", min: 0.1, max: 100, step: 0.1, digits: 2 },
        { key: "next", label: t("Nouvelle épaisseur du matériau"), kind: "number", unit: "mm", min: 0.1, max: 100, step: 0.1, digits: 2 },
        { key: "depth", label: t("Profondeur des encoches (0 : toutes)"), kind: "number", unit: "mm", min: 0, max: 1000, step: 0.5, digits: 2 },
        { key: "tol", label: t("Tolérance"), kind: "number", unit: "mm", min: 0.001, max: 5, step: 0.05, digits: 3 },
      ]}
      hint={t("Les encoches de la largeur actuelle (ou les tenons de cette hauteur) prennent la nouvelle épaisseur, sur les contours fermés sélectionnés.")}
      onOk={(v) => resizeSlots({ mode: v.mode as "slots" | "tabs", old: v.old as number, next: v.next as number, depth: v.depth as number, tol: v.tol as number })} />
  );
}

export function MultiTraceDialog({ onClose }: { onClose: () => void }) {
  return (
    <ParamDialog title={t("Vectoriser plusieurs fichiers")} onClose={onClose} ok={t("Choisir les images…")}
      initial={{ threshold: 128, resolution: 0.1, minArea: 8, tolerance: 0.6, smooth: true }}
      fields={[
        { key: "threshold", label: t("Seuil (les pixels plus sombres sont tracés)"), kind: "number", min: 1, max: 254, digits: 0 },
        { key: "resolution", label: t("Résolution"), kind: "number", unit: "mm", min: 0.02, max: 2, step: 0.01, digits: 3 },
        { key: "minArea", label: t("Ignorer < "), kind: "number", unit: "px²", min: 0, max: 10000, digits: 0 },
        { key: "tolerance", label: t("Simplification"), kind: "number", unit: "px", min: 0, max: 10, step: 0.1, digits: 2 },
        { key: "smooth", label: t("Lisser les contours"), kind: "check" },
      ]}
      hint={t("Chaque image choisie est vectorisée avec ces réglages ; les résultats sont placés côte à côte.")}
      onOk={(v) => traceFiles({
        threshold: v.threshold as number, resolution: v.resolution as number, minArea: v.minArea as number,
        tolerance: v.tolerance as number, smooth: v.smooth as boolean,
      })} />
  );
}

/** Liste de vérification avant travail : tout doit être coché pour démarrer. */
export function ChecklistDialog({ onClose }: { onClose: () => void }) {
  const checklist = useStore((s) => s.machine.checklist);
  const items = useMemo(() => (checklist ?? []).filter((l) => l.trim()), [checklist]);
  const [done, setDone] = useState<boolean[]>(() => items.map(() => false));
  return (
    <Modal title={t("Avant de démarrer")} onClose={onClose} width={420}>
      {items.map((item, i) => (
        <label key={i} className="check">
          <input type="checkbox" checked={done[i] ?? false} onChange={(e) => setDone(done.map((d, j) => (j === i ? e.target.checked : d)))} />
          {item}
        </label>
      ))}
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        <button className="primary" disabled={!items.every((_, i) => done[i])} onClick={() => {
          onClose();
          startJob(pendingStart ?? false, true);
        }}>{t("Démarrer")}</button>
      </div>
    </Modal>
  );
}

export function CircleSelectDialog({ onClose }: { onClose: () => void }) {
  return (
    <ParamDialog title={t("Sélectionner les cercles")} onClose={onClose} ok={t("Sélectionner")} initial={{ min: 0, max: 0 }}
      fields={[
        { key: "min", label: t("Diamètre minimal (0 = sans limite)"), kind: "number", unit: "mm", min: 0, max: 10000, step: 0.1, digits: 2 },
        { key: "max", label: t("Diamètre maximal (0 = sans limite)"), kind: "number", unit: "mm", min: 0, max: 10000, step: 0.1, digits: 2 },
      ]}
      onOk={(v) => selectCircles(v.min as number, v.max as number)} />
  );
}

/** Fichier → Préférences → Gestion des profils : jeux de préférences complets, comme dans LightBurn. */
export function ProfilesDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState(() => Object.keys(profiles()));
  const [name, setName] = useState("");
  const cur = currentProfile();
  const names = [...new Set([cur, ...list])].sort((a, b) => a.localeCompare(b));
  return (
    <Modal title={t("Gestion des profils")} onClose={onClose} width={460}>
      <p className="hint">{t("Un profil garde toutes les préférences : appareils, bibliothèques, raccourcis, réglages. Changer de profil redémarre l'interface.")}</p>
      <div className="library">
        {names.map((n) => (
          <div key={n} className="library-row">
            <span className="grow">{n === cur ? <strong>{n} · {t("profil actuel")}</strong> : n}</span>
            <button disabled={n === cur} onClick={() => switchProfile(n)}>{t("Utiliser")}</button>
            <button disabled={n === cur} onClick={() => { deleteProfile(n); setList(Object.keys(profiles())); }} title={t("Supprimer")}>✕</button>
          </div>
        ))}
      </div>
      <div className="row">
        <input type="text" className="grow" placeholder={t("Nom du nouveau profil")} value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim() || names.includes(name.trim())} onClick={() => { saveProfile(cur); saveProfile(name.trim()); setList(Object.keys(profiles())); setName(""); }}
          title={t("Crée un profil à partir des préférences actuelles et l'utilise")}>{t("Dupliquer le profil actuel")}</button>
      </div>
      <div className="row end"><button className="primary" onClick={onClose}>{t("Fermer")}</button></div>
    </Modal>
  );
}
