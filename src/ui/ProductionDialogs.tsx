import { useEffect, useMemo, useState } from "react";
import { addBarcode, exportText, importFilesTo, notify, setNotes } from "../actions";
import { addArt, deleteArt, exportArt, importArt, instantiate, newArtLibrary, renameArt, renameArtLibrary, switchArtLibrary, unloadArtLibrary, useArt, useArtLibraries } from "../artlib";
import { BARCODE_TYPES, encodeBarcode, type BarcodeType } from "../barcode";
import { shapeBox } from "../geometry";
import { laser, useLaser } from "../laser";
import type { Pt } from "../model";
import { addShapes, getState, selectedShapes, setState, useStore, type Macro } from "../store";
import { Modal } from "./Menu";
import { NumField } from "./NumField";
import { t, tk } from "../i18n";
import { printCutMatrix, recordTarget, resetPrintCut, takeTargets, usePrintCut } from "../lasertools";

export function BarcodeDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<BarcodeType>("CODE128");
  const [text, setText] = useState("LUMIERE-001");
  const [module, setModule] = useState(0.3);
  const [height, setHeight] = useState(12);
  const [showText, setShowText] = useState(true);
  const error = useMemo(() => {
    try {
      encodeBarcode(type, text);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [type, text]);
  return (
    <Modal title={t("Code-barres")} onClose={onClose} width={440}>
      <div className="grid2">
        <label className="field">
          <span>{t("Type")}</span>
          <select value={type} onChange={(e) => setType(e.target.value as BarcodeType)}>
            {(Object.keys(BARCODE_TYPES) as BarcodeType[]).map((b) => <option key={b} value={b}>{t(BARCODE_TYPES[b])}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("Contenu")}</span>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
        <NumField label={t("Largeur de module")} unit="mm" value={module} min={0.05} max={5} step={0.05} digits={3} onChange={setModule} />
        <NumField label={t("Hauteur")} unit="mm" value={height} min={1} max={500} onChange={setHeight} />
      </div>
      <label className="check">
        <input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} />
        {t("Afficher le texte sous le code")}
      </label>
      <p className={error ? "hint warn-text" : "hint"}>{error ?? t("Placez-le sur un calque Remplissage. Le module doit rester plus large que le point laser.")}</p>
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        <button className="primary" disabled={!!error} onClick={() => (void addBarcode(type, text, module, height, showText), onClose())}>{t("Créer")}</button>
      </div>
    </Modal>
  );
}

export function NotesDialog({ onClose }: { onClose: () => void }) {
  const [notes, set] = useState(getState().project.notes ?? "");
  return (
    <Modal title={t("Notes du projet")} onClose={onClose} width={520}>
      <textarea rows={10} value={notes} onChange={(e) => set(e.target.value)} placeholder={t("Matériau, réglages, remarques… (enregistré avec le projet)")} autoFocus />
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        <button className="primary" onClick={() => (setNotes(notes), onClose())}>{t("Enregistrer")}</button>
      </div>
    </Modal>
  );
}

export function MacrosDialog({ onClose }: { onClose: () => void }) {
  const [macros, setMacros] = useState<Macro[]>(getState().macros);
  const edit = (i: number, patch: Partial<Macro>) => setMacros(macros.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <Modal title={t("Macros")} onClose={onClose} width={560}>
      <p className="hint">{t("Chaque macro devient un bouton du panneau Laser. Une ligne par commande.")}</p>
      <div className="library">
        {macros.map((m, i) => (
          <div key={i} className="macro-row">
            <input type="text" value={m.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder={t("Nom")} />
            <textarea rows={2} value={m.gcode} onChange={(e) => edit(i, { gcode: e.target.value })} spellCheck={false} />
            <button onClick={() => setMacros(macros.filter((_, j) => j !== i))} aria-label={t("Supprimer")}>✕</button>
          </div>
        ))}
      </div>
      <div className="row end">
        <button onClick={() => setMacros([...macros, { name: t("Nouvelle macro"), gcode: "" }])}>{t("Ajouter")}</button>
        <span className="grow" />
        <button onClick={onClose}>{t("Annuler")}</button>
        <button className="primary" onClick={() => (setState({ macros: macros.filter((m) => m.name.trim()) }), onClose())}>{t("Enregistrer")}</button>
      </div>
    </Modal>
  );
}

const GRBL_SETTINGS: Record<number, string> = {
  0: tk("Durée d'impulsion de pas (µs)"), 1: tk("Délai de mise en veille des moteurs (ms)"), 2: tk("Inversion des impulsions (masque)"),
  3: tk("Inversion des directions (masque)"), 4: tk("Inversion de l'activation"), 5: tk("Inversion des fins de course"),
  6: tk("Inversion de la sonde"), 10: tk("Rapport d'état (masque)"), 11: tk("Déviation de jonction (mm)"), 12: tk("Tolérance d'arc (mm)"),
  13: tk("Rapport en pouces"), 20: tk("Limites logicielles"), 21: tk("Limites matérielles"), 22: tk("Cycle d'origine"),
  23: tk("Inversion du sens d'origine (masque)"), 24: tk("Vitesse lente d'origine (mm/min)"), 25: tk("Vitesse rapide d'origine (mm/min)"),
  26: tk("Anti-rebond d'origine (ms)"), 27: tk("Dégagement d'origine (mm)"), 30: tk("Puissance / vitesse broche max (S)"),
  31: tk("Puissance / vitesse broche min (S)"), 32: tk("Mode laser"), 100: tk("Pas par mm X"), 101: tk("Pas par mm Y"), 102: tk("Pas par mm Z"),
  110: tk("Vitesse max X (mm/min)"), 111: tk("Vitesse max Y (mm/min)"), 112: tk("Vitesse max Z (mm/min)"), 120: tk("Accélération X (mm/s²)"),
  121: tk("Accélération Y (mm/s²)"), 122: tk("Accélération Z (mm/s²)"), 130: tk("Course max X (mm)"), 131: tk("Course max Y (mm)"),
  132: tk("Course max Z (mm)"),
};

/** Nouveau nombre de pas par mm d'après un déplacement demandé et la distance réellement parcourue. */
export const calibratedSteps = (current: number, requested: number, actual: number) => (actual > 0 ? (current * requested) / actual : current);

/** Étalonner un axe : corrige $100 / $101 / $102 d'après une mesure. */
function CalibrateAxis({ values, onWrite, disabled }: { values: Record<number, string>; onWrite: (id: number, v: string) => void; disabled: boolean }) {
  const [axis, setAxis] = useState(100);
  const [requested, setRequested] = useState(100);
  const [actual, setActual] = useState(100);
  const current = Number(values[axis] ?? 0);
  const next = calibratedSteps(current, requested, actual);
  return (
    <details>
      <summary>{t("Étalonner un axe")}</summary>
      <p className="hint">{t("Demandez un déplacement à la machine (par exemple avec le déplacement manuel), mesurez la distance réellement parcourue, puis écrivez la nouvelle valeur.")}</p>
      <div className="row">
        <label className="field">
          <span>{t("Axe")}</span>
          <select value={axis} onChange={(e) => setAxis(Number(e.target.value))}>
            <option value={100}>X ($100)</option>
            <option value={101}>Y ($101)</option>
            <option value={102}>Z ($102)</option>
          </select>
        </label>
        <NumField label={t("Distance demandée")} value={requested} min={0.001} max={100000} onChange={setRequested} />
        <NumField label={t("Distance réelle")} value={actual} min={0.001} max={100000} onChange={setActual} />
      </div>
      <div className="row">
        <span className="grow">{t("Pas/mm actuels : {cur} → nouveaux : {next}", { cur: current ? current.toFixed(3) : "?", next: current ? next.toFixed(3) : "?" })}</span>
        <button disabled={disabled || !current || Math.abs(next - current) < 1e-6} onClick={() => onWrite(axis, next.toFixed(3))}>{t("Écrire")}</button>
      </div>
    </details>
  );
}

export function GrblSettingsDialog({ onClose }: { onClose: () => void }) {
  const connected = useLaser((s) => s.connected);
  const log = useLaser((s) => s.log);
  const [edits, setEdits] = useState<Record<number, string>>({});
  useEffect(() => {
    if (connected) laser.send("$$");
  }, [connected]);
  // Dernière valeur lue pour chaque réglage dans la console.
  const values = useMemo(() => {
    const v: Record<number, string> = {};
    for (const line of log) {
      const m = /^\$(\d+)=([^\s(]+)/.exec(line.trim());
      if (m) v[Number(m[1])] = m[2];
    }
    return v;
  }, [log]);
  const ids = Object.keys(values).map(Number).sort((a, b) => a - b);

  const apply = async () => {
    for (const [id, val] of Object.entries(edits)) if (val !== values[Number(id)]) await laser.send(`$${id}=${val}`);
    setEdits({});
    await laser.send("$$");
  };
  const syncMachine = () => {
    const m = getState().machine;
    const num = (k: number, d: number) => (values[k] != null ? Number(values[k]) : d);
    setState({
      machine: {
        ...m, bedWidth: num(130, m.bedWidth), bedHeight: num(131, m.bedHeight), sMax: num(30, m.sMax),
        acceleration: Math.min(num(120, m.acceleration), num(121, m.acceleration)), travelSpeed: Math.min(num(110, m.travelSpeed), num(111, m.travelSpeed)),
      },
    });
    notify(t("Plateau, puissance max, vitesse et accélération repris des réglages GRBL"));
  };

  return (
    <Modal title={t("Réglages GRBL")} onClose={onClose} width={620}>
      {!connected && <p className="hint">{t("Connectez le laser pour lire ses réglages.")}</p>}
      {connected && !ids.length && <p className="hint">{t("Lecture des réglages ($$)…")}</p>}
      {values[32] === "0" && <p className="hint warn-text">{t("Le mode laser ($32) est désactivé : le laser restera allumé pendant les déplacements.")}</p>}
      <div className="library">
        <table className="shortcuts">
          <tbody>
            {ids.map((id) => (
              <tr key={id}>
                <td><code>${id}</code></td>
                <td>{GRBL_SETTINGS[id] ? t(GRBL_SETTINGS[id]) : ""}</td>
                <td>
                  <input type="text" value={edits[id] ?? values[id]} onChange={(e) => setEdits({ ...edits, [id]: e.target.value })} style={{ width: 90 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CalibrateAxis values={values} onWrite={async (id, v) => { await laser.send(`$${id}=${v}`); await laser.send("$$"); }} disabled={!connected} />
      <div className="row end">
        <button disabled={!ids.length} onClick={syncMachine} title={t("$130/$131, $30, $110/$111 et $120/$121 vers les réglages machine")}>{t("Reprendre dans les réglages machine")}</button>
        <span className="grow" />
        <button onClick={onClose}>{t("Fermer")}</button>
        <button className="primary" disabled={!connected || !Object.keys(edits).length} onClick={apply}>{t("Écrire dans le contrôleur")}</button>
      </div>
    </Modal>
  );
}

/**
 * Imprimer et découper : deux repères du dessin sont mesurés sur la pièce réelle en
 * y amenant la tête laser ; le travail est ensuite recalé (rotation, échelle, décalage).
 */
export function PrintCutDialog({ onClose }: { onClose: () => void }) {
  const connected = useLaser((s) => s.connected);
  useLaser((s) => s.status);
  const alignment = useStore((s) => s.alignment);
  // État partagé avec les commandes du menu Outils laser → Imprimer et couper.
  const { targets, measured } = usePrintCut();
  const record = recordTarget;
  const fmt = (p: Pt | null) => (p ? `${p[0].toFixed(2)}, ${p[1].toFixed(2)}` : "—");
  const result = printCutMatrix();
  const scale = result ? Math.hypot(result[0], result[1]) : 1;
  const angle = result ? (Math.atan2(result[1], result[0]) * 180) / Math.PI : 0;

  return (
    <Modal title={t("Imprimer et découper")} onClose={onClose} width={520}>
      <ol className="steps">
        <li>
          {t("Sélectionnez les deux repères dans le dessin (ou une forme : ses coins opposés serviront de repères).")}
          <div className="row"><button onClick={takeTargets}>{t("Utiliser la sélection")}</button><span className="mono">{targets ? `${fmt(targets[0])} / ${fmt(targets[1])}` : ""}</span></div>
        </li>
        {[0, 1].map((i) => (
          <li key={i}>
            {t("Amenez la tête laser (jog) exactement sur le repère {n} de la pièce, puis enregistrez.", { n: i + 1 })}
            <div className="row">
              <button disabled={!connected || !targets} onClick={() => record(i)}>{t("Enregistrer le repère {n}", { n: i + 1 })}</button>
              <span className="mono">{fmt(measured[i])}</span>
            </div>
          </li>
        ))}
      </ol>
      {result && (
        <p className={Math.abs(scale - 1) > 0.05 ? "hint warn-text" : "hint"}>
          {t("Rotation {angle}° · échelle {scale} %", { angle: angle.toFixed(2), scale: (scale * 100).toFixed(2) })}
          {Math.abs(scale - 1) > 0.05 && ` — ${t("écart important, vérifiez les repères")}`}
        </p>
      )}
      {alignment && <p className="hint">{t("Un alignement est actif : il s'applique à l'aperçu, au cadrage et à la gravure.")}</p>}
      <div className="row end">
        {alignment && <button onClick={() => setState({ alignment: null })}>{t("Désactiver l'alignement")}</button>}
        {(targets || alignment) && <button onClick={resetPrintCut}>{t("Réinitialiser")}</button>}
        <span className="grow" />
        <button onClick={onClose}>{t("Fermer")}</button>
        <button className="primary" disabled={!result} onClick={() => (setState({ alignment: result }), notify(t("Alignement appliqué")), onClose())}>{t("Appliquer")}</button>
      </div>
    </Modal>
  );
}

export function ArtLibraryDialog({ onClose }: { onClose: () => void }) {
  const items = useArt();
  const libs = useArtLibraries();
  const [thumb, setThumb] = useState(96);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const hasSel = useStore((s) => s.selection.length > 0);
  const shown = items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()));
  const insert = (id: string) => {
    const item = items.find((i) => i.id === id)!;
    const st = getState();
    const w = Math.max(...item.shapes.map((s) => (shapeBox(s)?.x ?? 0) + (shapeBox(s)?.w ?? 0)));
    const h = Math.max(...item.shapes.map((s) => (shapeBox(s)?.y ?? 0) + (shapeBox(s)?.h ?? 0)));
    addShapes(instantiate(item, st.machine.bedWidth / 2 - w / 2, st.machine.bedHeight / 2 - h / 2));
    notify(t("« {name} » inséré", { name: item.name }));
  };
  return (
    <Modal title={t("Bibliothèque d'art")} onClose={onClose} width={680}>
      <div className="row">
        <select value={libs.current} onChange={(e) => switchArtLibrary(e.target.value)} aria-label={t("Bibliothèque")}>
          {libs.libs.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.items.length})</option>)}
        </select>
        <input key={libs.current} type="text" className="grow" aria-label={t("Nom de la bibliothèque")} title={t("Nom de la bibliothèque")}
          defaultValue={libs.libs.find((l) => l.id === libs.current)?.name} onBlur={(e) => e.target.value.trim() && renameArtLibrary(libs.current, e.target.value.trim())} />
        <button onClick={() => newArtLibrary(t("Nouvelle bibliothèque"))}>{t("Nouvelle")}</button>
        <button disabled={libs.libs.length < 2} onClick={() => unloadArtLibrary(libs.current)}>{t("Décharger")}</button>
        <button onClick={() => void importFilesTo((file, shapes) => {
          try {
            addArt(file.name.replace(/\.[^.]+$/, ""), shapes);
          } catch (e) {
            notify(e instanceof Error ? e.message : String(e));
          }
        })} title={t("Ajoute des fichiers (SVG, DXF, PDF, images…) à la bibliothèque, un élément par fichier")}>{t("Importer des fichiers…")}</button>
        <label className="field" title={t("Taille des aperçus")}>
          <input type="range" min={60} max={180} value={thumb} onChange={(e) => setThumb(Number(e.target.value))} />
        </label>
      </div>
      <div className="row">
        <input type="text" className="grow" placeholder={t("Rechercher…")} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <input type="text" placeholder={t("Nom du nouvel élément")} value={name} onChange={(e) => setName(e.target.value)} />
        <button
          disabled={!hasSel}
          onClick={() => {
            try {
              addArt(name.trim() || selectedShapes()[0]?.name || t("Forme"), selectedShapes());
              setName("");
            } catch (e) {
              notify(String(e));
            }
          }}
        >
          {t("Ajouter la sélection")}
        </button>
      </div>
      <div className="art-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumb}px, 1fr))` }}>
        {shown.length === 0 && <p className="hint">{t("Aucun élément : sélectionnez des formes et « Ajouter la sélection ».")}</p>}
        {shown.map((i) => (
          <div key={i.id} className="art-item">
            <button className="art-thumb" onClick={() => insert(i.id)} title={t("Insérer sur le plateau")}>
              <svg viewBox="0 0 100 100"><path d={i.thumb} fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
            </button>
            <input type="text" value={i.name} onChange={(e) => renameArt(i.id, e.target.value)} />
            <button onClick={() => deleteArt(i.id)} aria-label={t("Supprimer")}>✕</button>
          </div>
        ))}
      </div>
      <div className="row end">
        <button onClick={async () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json,.lumart";
          input.onchange = async () => {
            const f = input.files?.[0];
            if (!f) return;
            try {
              notify(t("{n} élément(s) importé(s)", { n: importArt(await f.text()) }));
            } catch (e) {
              notify(e instanceof Error ? e.message : String(e));
            }
          };
          input.click();
        }}>{t("Importer…")}</button>
        <button disabled={!items.length} onClick={() => exportText(exportArt(), "bibliotheque-lumiere.lumart")}>{t("Exporter…")}</button>
        <span className="grow" />
        <button onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}
