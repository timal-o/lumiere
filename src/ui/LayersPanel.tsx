import { useState } from "react";
import { assignLayer, selectCurrentLayer } from "../actions";
import {
  DEFAULT_CUT, defaultCut, DITHER_LABEL, setDefaultCut, MODE_LABEL, PALETTE, type CutDirection, type CutSettings, type DitherMode, type Layer,
  type LayerMode, layerColor, isToolLayer, TOOL_LAYERS,
} from "../model";
import { commit, moveLayer, setState, updateLayer, useBar, useStore } from "../store";
import { deleteLayer, invert, only, setAll, toggle } from "../layerops";
import { ContextMenu, type ContextItem } from "./ContextMenu";
import { openDialog } from "./Dialogs";
import { NumField } from "./NumField";
import { SpeedField } from "./SpeedField";
import { t } from "../i18n";

/** Éditeur des réglages de découpe, commun aux calques et aux sous-calques. */
function CutEditor({ cut, set }: { cut: CutSettings; set: (patch: Partial<CutSettings>) => void }) {
  const scan = cut.mode === "fill" || cut.mode === "image";
  const zAxis = useStore((s) => s.machine.zAxis);
  // Mode débutant : seulement les réglages courants.
  const adv = !useStore((s) => s.toolOptions.beginner);
  return (
    <>
      <label className="field">
        <span>{t("Mode")}</span>
        <select value={cut.mode} onChange={(e) => set({ mode: e.target.value as LayerMode })}>
          {(Object.keys(MODE_LABEL) as LayerMode[]).map((m) => (
            <option key={m} value={m}>{t(MODE_LABEL[m])}</option>
          ))}
        </select>
      </label>
      <div className="grid2">
        <SpeedField label={t("Vitesse")} value={cut.speed} onChange={(speed) => set({ speed })} />
        <NumField label={t("Passes")} value={cut.passes} min={1} max={100} digits={0} onChange={(passes) => set({ passes })} />
        <NumField label={t("Puissance max")} unit="%" value={cut.power} min={0} max={100} digits={1} onChange={(power) => set({ power })} />
        {cut.mode === "image" && cut.dither === "grayscale" && (
          <NumField label={t("Puissance min")} unit="%" value={cut.minPower} min={0} max={100} digits={1} onChange={(minPower) => set({ minPower })} />
        )}
        {cut.mode === "offsetFill" && (
          <NumField label={t("Pas")} unit="mm" value={cut.interval} min={0.01} max={10} step={0.01} digits={3} onChange={(interval) => set({ interval })} />
        )}
        {scan && (
          <>
            <NumField label={t("Pas")} unit="mm" value={cut.interval} min={0.01} max={10} step={0.01} digits={3} onChange={(interval) => set({ interval })} />
            {adv && <NumField label={t("Overscan")} unit="mm" value={cut.overscan} min={0} max={50} digits={1} onChange={(overscan) => set({ overscan })} />}
          </>
        )}
      </div>
      {scan && (
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={cut.bidirectional} onChange={(e) => set({ bidirectional: e.target.checked })} />
            {t("Bidirectionnel")}
          </label>
          <span className="hint">{Math.round(25.4 / cut.interval)} DPI</span>
        </div>
      )}
      {cut.mode === "fill" && (
        <>
          <div className="row">
            <NumField label={t("Angle")} unit="°" value={cut.fillAngle} min={-180} max={180} digits={1} width={52} onChange={(fillAngle) => set({ fillAngle })} />
            <label className="check">
              <input type="checkbox" checked={cut.crossHatch} onChange={(e) => set({ crossHatch: e.target.checked })} />
              {t("Croisé")}
            </label>
          </div>
          {adv && (<>
          <label className="field" title={t("Chaque forme (avec ses trous) est remplie à part : moins de trajets à vide entre formes éloignées")}>
            <span>{t("Remplissage")}</span>
            <select value={cut.fillGroups ? "groups" : cut.fillIndividually ? "shapes" : "all"}
              onChange={(e) => set({ fillIndividually: e.target.value === "shapes", fillGroups: e.target.value === "groups" })}>
              <option value="all">{t("Remplir toutes les formes à la fois")}</option>
              <option value="shapes">{t("Remplir chaque forme séparément")}</option>
              <option value="groups">{t("Remplir les groupes ensemble")}</option>
            </select>
          </label>
          <label className="check" title={t("Balaye chaque zone en entier avant de passer à la suivante : beaucoup moins de déplacements à vide sur les formes découpées")}>
            <input type="checkbox" checked={cut.floodFill} onChange={(e) => set({ floodFill: e.target.checked })} />
            {t("Remplissage par zones (Flood Fill)")}
          </label>
          <NumField label={t("Incrément d'angle par passe")} unit="°" value={cut.angleIncrement} min={-180} max={180} digits={1} onChange={(angleIncrement) => set({ angleIncrement })} />
          <div className="grid2" title={t("Rampe pour flancs inclinés, utilisée pour les tampons")}>
            <NumField label={t("Rampe")} unit="mm" value={cut.rampLength} min={0} max={50} step={0.1} onChange={(rampLength) => set({ rampLength })} />
            <NumField label={t("Départ rampe")} unit="%" value={cut.rampMin} min={0} max={100} digits={1} disabled={cut.rampLength <= 0} onChange={(rampMin) => set({ rampMin })} />
          </div>
          <label className="check" title={t("Rampe aussi le contour extérieur (désactivez pour les tampons)")}>
            <input type="checkbox" checked={cut.rampOuter} disabled={cut.rampLength <= 0} onChange={(e) => set({ rampOuter: e.target.checked })} />
            {t("Rampe du bord extérieur")}
          </label>
          </>)}
        </>
      )}
      {adv && cut.mode === "line" && (
        <>
          <div className="grid2">
            <NumField label={t("Kerf")} unit="mm" value={cut.kerf} min={-5} max={5} step={0.01} digits={3} onChange={(kerf) => set({ kerf })} />
            <span />
            <NumField label={t("Attaches")} value={cut.tabCount} min={0} max={50} digits={0} disabled={cut.tabSpacing > 0} onChange={(tabCount) => set({ tabCount })} />
            <NumField label={t("Espacement des attaches (0 = nombre fixe)")} unit="mm" value={cut.tabSpacing} min={0} max={10000} step={1} onChange={(tabSpacing) => set({ tabSpacing })} />
            {cut.tabSpacing > 0 && <NumField label={t("Attaches min")} value={cut.tabMin} min={0} max={50} digits={0} onChange={(tabMin) => set({ tabMin })} />}
            {cut.tabSpacing > 0 && <NumField label={t("Attaches max (0 = sans limite)")} value={cut.tabMax} min={0} max={50} digits={0} onChange={(tabMax) => set({ tabMax })} />}
            <NumField label={t("Largeur")} unit="mm" value={cut.tabSize} min={0.05} max={20} step={0.1} onChange={(tabSize) => set({ tabSize })} />
            <NumField label={t("Puissance des attaches")} unit="%" value={cut.tabPower} min={0} max={100} digits={1} onChange={(tabPower) => set({ tabPower })} />
            <label className="check">
              <input type="checkbox" checked={cut.tabSkipInner} onChange={(e) => set({ tabSkipInner: e.target.checked })} />
              {t("Pas sur les formes intérieures")}
            </label>
          </div>
          <div className="grid2">
            <NumField label={t("Amorce d'entrée")} unit="mm" value={cut.leadIn} min={0} max={50} step={0.5} onChange={(leadIn) => set({ leadIn })} />
            <NumField label={t("Amorce de sortie")} unit="mm" value={cut.leadOut} min={0} max={50} step={0.5} onChange={(leadOut) => set({ leadOut })} />
            <label className="field">
              <span>{t("Style des amorces")}</span>
              <select value={cut.leadArc ? "arc" : "line"} disabled={!cut.leadIn && !cut.leadOut} onChange={(e) => set({ leadArc: e.target.value === "arc" })}>
                <option value="line">{t("Droite")}</option>
                <option value="arc">{t("Arc")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("Côté des amorces")}</span>
              <select value={cut.leadInward ? "in" : "out"} disabled={!cut.leadIn && !cut.leadOut} onChange={(e) => set({ leadInward: e.target.value === "in" })}>
                <option value="out">{t("Vers l'extérieur")}</option>
                <option value="in">{t("Vers l'intérieur")}</option>
              </select>
            </label>
          </div>
          <div className="grid2" title={t("Mode « traverser » : le laser reste allumé sur place au début et à la fin de chaque tracé, pour percer les matériaux épais")}>
            <NumField label={t("Pause au début")} unit="ms" value={cut.startPause} min={0} max={10000} digits={0} onChange={(startPause) => set({ startPause })} />
            <NumField label={t("Pause à la fin")} unit="ms" value={cut.endPause} min={0} max={10000} digits={0} onChange={(endPause) => set({ endPause })} />
            <NumField label={t("Puissance des pauses (0 = calque)")} unit="%" value={cut.pausePower} min={0} max={100} digits={1}
              disabled={!cut.startPause && !cut.endPause} onChange={(pausePower) => set({ pausePower })} />
          </div>
          <div className="grid2">
            <NumField label={t("Dépassement")} unit="mm" value={cut.overcut} min={0} max={50} step={0.1} onChange={(overcut) => set({ overcut })} />
            <span />
            <NumField label={t("Rampe")} unit="mm" value={cut.rampLength} min={0} max={50} step={0.5} onChange={(rampLength) => set({ rampLength })} />
            <NumField label={t("Départ rampe")} unit="%" value={cut.rampMin} min={0} max={100} digits={1} disabled={cut.rampLength <= 0} onChange={(rampMin) => set({ rampMin })} />
          </div>
          <div className="row">
            <label className="field">
              <span>{t("Sens des contours")}</span>
              <select value={cut.direction} onChange={(e) => set({ direction: e.target.value as CutDirection })}>
                <option value="any">{t("Le plus court")}</option>
                <option value="cw">{t("Horaire")}</option>
                <option value="ccw">{t("Antihoraire")}</option>
              </select>
            </label>
          </div>
          <label className="check" title={t("Un bord commun à deux pièces (puzzle, assemblage à créneaux) n'est découpé qu'une fois")}>
            <input type="checkbox" checked={cut.removeOverlaps} onChange={(e) => set({ removeOverlaps: e.target.checked })} />
            {t("Supprimer les lignes superposées")}
          </label>
          <label className="check" title={t("Les formes intérieures sont découpées avant celles qui les entourent, pour que la pièce ne bouge pas")}>
            <input type="checkbox" checked={cut.innerFirst} onChange={(e) => set({ innerFirst: e.target.checked })} />
            {t("Découper l'intérieur d'abord")}
          </label>
          <label className="check" title={t("Respecte le point de départ de chaque contour (outil Nœuds, touche P) au lieu du point le plus proche")}>
            <input type="checkbox" checked={cut.keepStart} onChange={(e) => set({ keepStart: e.target.checked })} />
            {t("Conserver les points de départ")}
          </label>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={cut.dotMode} onChange={(e) => set({ dotMode: e.target.checked })} />
              {t("Mode points")}
            </label>
            {cut.dotMode && (
              <>
                <NumField label={t("Tir")} unit="ms" value={cut.dotTime} min={0.1} max={10000} digits={1} width={48} onChange={(dotTime) => set({ dotTime })} />
                <NumField label={t("Pas")} unit="mm" value={cut.dotSpacing} min={0.01} max={100} width={48} onChange={(dotSpacing) => set({ dotSpacing })} />
              </>
            )}
          </div>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={cut.perforate} onChange={(e) => set({ perforate: e.target.checked })} />
              {t("Perforation")}
            </label>
            {cut.perforate && (
              <>
                <NumField label={t("On")} unit="mm" value={cut.perfOn} min={0.01} max={100} width={48} onChange={(perfOn) => set({ perfOn })} />
                <NumField label={t("Off")} unit="mm" value={cut.perfOff} min={0.01} max={100} width={48} onChange={(perfOff) => set({ perfOff })} />
              </>
            )}
          </div>
        </>
      )}
      {zAxis && (
        <div className="grid2">
          <NumField label={t("Décalage Z")} unit="mm" value={cut.zOffset} min={-100} max={100} step={0.1} onChange={(zOffset) => set({ zOffset })} />
          <NumField label={t("Descente/passe")} unit="mm" value={cut.zStep} min={0} max={20} step={0.1} onChange={(zStep) => set({ zStep })} />
        </div>
      )}
      {cut.mode === "image" && (
        <label className="field">
          <span>{t("Tramage")}</span>
          <select value={cut.dither} onChange={(e) => set({ dither: e.target.value as DitherMode })}>
            {(Object.keys(DITHER_LABEL) as DitherMode[]).map((d) => (
              <option key={d} value={d}>{t(DITHER_LABEL[d])}</option>
            ))}
          </select>
        </label>
      )}
      {adv && cut.mode === "image" && (
        <NumField label={t("Relief 3D : tranches")} value={cut.imageSlices} min={1} max={64} digits={0} onChange={(imageSlices) => set({ imageSlices })} />
      )}
      {adv && cut.mode === "image" && cut.imageSlices > 1 && (
        <div className="row" title={t("Repasse régulièrement pour égaliser le fond de la gravure en relief")}>
          <NumField label={t("Nettoyage toutes les … tranches (0 = jamais)")} value={cut.cleanupEvery} min={0} max={64} digits={0} onChange={(cleanupEvery) => set({ cleanupEvery })} />
          <label className="check">
            <input type="checkbox" checked={cut.cleanupWhole} disabled={!cut.cleanupEvery} onChange={(e) => set({ cleanupWhole: e.target.checked })} />
            {t("Nettoyer toute l'image")}
          </label>
        </div>
      )}
      {adv && cut.mode === "image" && (
        <label className="check" title={t("Inverse l'image : utile pour l'acrylique, les miroirs ou les surfaces sombres")}>
          <input type="checkbox" checked={cut.negative} onChange={(e) => set({ negative: e.target.checked })} />
          {t("Image négative")}
        </label>
      )}
      {adv && cut.mode === "image" && cut.dither !== "grayscale" && (
        <NumField label={t("Correction de la largeur du point")} unit="mm" value={cut.dotWidth} min={0} max={1} step={0.01} digits={3}
          onChange={(dotWidth) => set({ dotWidth })} />
      )}
      {adv && cut.mode === "image" && (cut.dither === "halftone" || cut.dither === "newsprint") && (
        <div className="grid2">
          <NumField label={t("Cellules")} unit="/po" value={cut.halftoneLpi} min={2} max={300} digits={0} onChange={(halftoneLpi) => set({ halftoneLpi })} />
          <NumField label={t("Angle")} unit="°" value={cut.halftoneAngle} min={-90} max={90} digits={1} onChange={(halftoneAngle) => set({ halftoneAngle })} />
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={cut.airAssist} onChange={(e) => set({ airAssist: e.target.checked })} />
        {t("Assistance d'air (M8)")}
      </label>
      {adv && cut.airAssist && (
        <label className="check" title={t("Coupe l'air pendant les déplacements à vide")}>
          <input type="checkbox" checked={cut.airCutOnly} onChange={(e) => set({ airCutOnly: e.target.checked })} />
          {t("Air seulement pendant la découpe")}
        </label>
      )}
      {adv && (
        <label className="check" title={t("M3 : la puissance ne baisse pas dans les virages (sinon M4, puissance suivant la vitesse réelle)")}>
          <input type="checkbox" checked={cut.constantPower} onChange={(e) => set({ constantPower: e.target.checked })} />
          {t("Puissance constante (M3)")}
        </label>
      )}
    </>
  );
}

function LayerEditor({ layer }: { layer: Layer }) {
  const beginner = useStore((s) => s.toolOptions.beginner);
  const [tab, setTab] = useState(0);
  const sub = tab > 0 ? layer.subLayers[tab - 1] : null;
  const setSubs = (subLayers: Layer["subLayers"]) => updateLayer(layer.id, { subLayers });

  const addSub = () => {
    // Le sous-calque le plus courant : un contour après un remplissage.
    const mode: LayerMode = layer.mode === "fill" ? "line" : layer.mode === "line" ? "fill" : "line";
    setSubs([...layer.subLayers, { ...DEFAULT_CUT, mode, speed: layer.speed, power: layer.power, enabled: true }]);
    setTab(layer.subLayers.length + 1);
  };

  /** Copie du réglage affiché (calque principal ou sous-calque), ajoutée en dernier sous-calque. */
  const cloneSub = () => {
    const src = sub ?? (({ id: _i, name: _n, output: _o, visible: _v, subLayers: _s, libraryLink: _l, ...cut }) => cut)(layer);
    setSubs([...layer.subLayers, { ...DEFAULT_CUT, ...src, enabled: true, name: sub?.name ? `${sub.name} (2)` : undefined }]);
    setTab(layer.subLayers.length + 1);
  };

  return (
    <div className="layer-editor">
      <div className="row">
        <label className="field">
          <span>{t("Nom")}</span>
          <input type="text" value={layer.name} onChange={(e) => updateLayer(layer.id, { name: e.target.value })} />
        </label>
        <button onClick={() => openDialog("library")} title={t("Bibliothèque de matériaux")}>{t("Bibliothèque…")}</button>
      </div>
      {!beginner && <div className="row end">
        <button className="small" title={t("Les nouveaux calques reprendront ces réglages")} onClick={() => {
          const { id: _i, name: _n, output: _o, visible: _v, subLayers: _s, ...cut } = layer;
          setDefaultCut(cut);
          try {
            localStorage.setItem("lumiere.layerDefault", JSON.stringify(cut));
          } catch {
            // stockage indisponible
          }
        }}>{t("Définir par défaut")}</button>
        <button className="small" title={t("Les autres calques prennent les réglages de découpe de celui-ci (noms, couleurs et sous-calques gardés)")} onClick={() => {
          const { id: _i, name: _n, output: _o, visible: _v, subLayers: _s, libraryLink: _l, globalPasses: _g, ...cut } = layer;
          commit((p) => ({ ...p, layers: p.layers.map((l) => (l.id === layer.id ? l : { ...l, ...cut, libraryLink: undefined })) }));
        }}>{t("Copier vers tous les calques")}</button>
        <button className="small" title={t("Revenir aux réglages par défaut")} onClick={() => updateLayer(layer.id, { ...defaultCut(), libraryLink: undefined })}>{t("Réinitialiser aux valeurs par défaut")}</button>
      </div>}
      {layer.libraryLink && (
        <div className="row link-banner">
          <span className="grow" title={t("Les réglages viennent de la bibliothèque de matériaux ; déliez le calque pour les modifier")}>
            🔗 {t("Lié à : {name}", { name: layer.libraryLink.label })}
          </span>
          <button className="small" onClick={() => updateLayer(layer.id, { libraryLink: undefined })}>{t("Délier")}</button>
        </div>
      )}
      <fieldset className="plain" disabled={!!layer.libraryLink}>
      {!beginner && <div className="tabs" role="tablist" aria-label={t("Réglages du calque")}>
        <button role="tab" aria-selected={tab === 0} className={tab === 0 ? "active" : ""} onClick={() => setTab(0)}>
          1 · {t(MODE_LABEL[layer.mode])}
        </button>
        {layer.subLayers.map((s, i) => (
          <button key={i} role="tab" aria-selected={tab === i + 1} className={`${tab === i + 1 ? "active" : ""} ${s.enabled ? "" : "off"}`} onClick={() => setTab(i + 1)}>
            {i + 2} · {s.name || t(MODE_LABEL[s.mode])}
          </button>
        ))}
        <button onClick={addSub} title={t("Ajouter un sous-calque : un autre réglage appliqué aux mêmes formes")} aria-label={t("Ajouter un sous-calque")}>+</button>
        <button onClick={cloneSub} title={t("Cloner le sous-calque affiché")} aria-label={t("Cloner le sous-calque affiché")}>⧉</button>
      </div>}
      {!sub && !beginner && layer.subLayers.length > 0 && (
        <NumField label={t("Passes globales")} value={layer.globalPasses ?? 1} min={1} max={100} digits={0}
          onChange={(globalPasses) => updateLayer(layer.id, { globalPasses })} />
      )}
      {sub ? (
        <>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={sub.enabled} onChange={(e) => setSubs(layer.subLayers.map((x, i) => (i === tab - 1 ? { ...x, enabled: e.target.checked } : x)))} />
              {t("Actif")}
            </label>
            <input type="text" className="grow" placeholder={t("Nom du sous-calque")} value={sub.name ?? ""}
              onChange={(e) => setSubs(layer.subLayers.map((x, i) => (i === tab - 1 ? { ...x, name: e.target.value || undefined } : x)))} />
            <button
              onClick={() => {
                setSubs(layer.subLayers.filter((_, i) => i !== tab - 1));
                setTab(0);
              }}
            >
              {t("Supprimer le sous-calque")}
            </button>
          </div>
          <CutEditor cut={sub} set={(patch) => setSubs(layer.subLayers.map((x, i) => (i === tab - 1 ? { ...x, ...patch } : x)))} />
        </>
      ) : (
        <CutEditor cut={layer} set={(patch) => updateLayer(layer.id, patch)} />
      )}
      </fieldset>
    </div>
  );
}

export function LayersPanel() {
  const layers = useStore((s) => s.project.layers);
  const current = useStore((s) => s.currentLayer);
  const shapes = useStore((s) => s.project.shapes);
  const hasSel = useStore((s) => s.selection.length > 0);
  const showPalette = useBar("palette");
  const paletteLabels = useStore((s) => s.toolOptions.paletteLabels);
  const active = layers.find((l) => l.id === current);
  const [menu, setMenu] = useState<{ x: number; y: number; layer: Layer; index: number } | null>(null);
  const layerMenu = (l: Layer, i: number): ContextItem[] => [
    { label: l.output ? t("Désactiver ce calque") : t("Activer ce calque"), action: () => toggle("output", l.id) },
    { label: t("Activer tous les calques"), action: () => setAll("output", true) },
    { label: t("Désactiver tous les calques"), action: () => setAll("output", false) },
    { label: t("Désactiver tous les calques sauf celui-ci"), action: () => only("output", l.id) },
    { label: t("Inverser les calques activés"), action: () => invert("output") },
    "separator",
    { label: l.visible ? t("Masquer ce calque") : t("Afficher ce calque"), action: () => toggle("visible", l.id) },
    { label: t("Afficher tous les calques"), action: () => setAll("visible", true) },
    { label: t("Masquer tous les calques"), action: () => setAll("visible", false) },
    { label: t("Masquer tous les calques sauf celui-ci"), action: () => only("visible", l.id) },
    { label: t("Inverser les calques visibles"), action: () => invert("visible") },
    "separator",
    { label: t("Activer l'assistance d'air sur tous les calques"), action: () => setAll("airAssist", true) },
    { label: t("Désactiver l'assistance d'air sur tous les calques"), action: () => setAll("airAssist", false) },
    { label: t("Inverser l'assistance d'air de tous les calques"), action: () => invert("airAssist") },
    "separator",
    { label: t("Sélectionner toutes les formes dans le calque actuel"), action: () => (setState({ currentLayer: l.id }), selectCurrentLayer()) },
    { label: t("Déplacer le calque sélectionné vers le haut"), action: () => moveLayer(l.id, -1), disabled: i === 0 },
    { label: t("Déplacer le calque sélectionné vers le bas"), action: () => moveLayer(l.id, 1), disabled: i === layers.length - 1 },
    { label: t("Supprimer le calque"), action: () => deleteLayer(l.id) },
  ];

  return (
    <section className="panel">
      <h2>{t("Calques")} <span className="hint">{t("(ordre de gravure)")}</span></h2>
      <table className="layers">
        <thead>
          <tr>
            <th />
            <th>{t("Nom")}</th>
            <th>{t("Mode")}</th>
            <th>{t("Vit./Puiss.")}</th>
            <th title={t("Graver")}>{t("Sortie")}</th>
            <th title={t("Afficher")}>{t("Vue")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {layers.map((l, i) => (
            <tr key={l.id} className={l.id === current ? "current" : ""} onClick={() => setState({ currentLayer: l.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                setState({ currentLayer: l.id });
                setMenu({ x: e.clientX, y: e.clientY, layer: l, index: i });
              }}>
              <td><span className="swatch" style={{ background: layerColor(l.id) }} /></td>
              <td>
                {l.name}
                <span className="count">{shapes.filter((s) => s.layerId === l.id).length}</span>
              </td>
              <td>
                {t(MODE_LABEL[l.mode])}
                {l.subLayers.some((s) => s.enabled) && <span className="count">+{l.subLayers.filter((s) => s.enabled).length}</span>}
              </td>
              <td className="mono">{l.speed}/{l.power}%</td>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={l.output} onChange={(e) => updateLayer(l.id, { output: e.target.checked })} />
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={l.visible} onChange={(e) => updateLayer(l.id, { visible: e.target.checked })} />
              </td>
              <td className="order" onClick={(e) => e.stopPropagation()}>
                <button disabled={i === 0} onClick={() => moveLayer(l.id, -1)} title={t("Graver plus tôt")} aria-label={t("Monter")}>▲</button>
                <button disabled={i === layers.length - 1} onClick={() => moveLayer(l.id, 1)} title={t("Graver plus tard")} aria-label={t("Descendre")}>▼</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={layerMenu(menu.layer, menu.index)} onClose={() => setMenu(null)} />}
      {active && (isToolLayer(active.id)
        ? <p className="hint">{t("Calque outil : ses formes ne sont jamais gravées. Elles servent au cadrage (« Calques outils seulement ») et aux repères.")}</p>
        : <LayerEditor key={active.id} layer={active} />)}
      {showPalette && <div className={`palette ${paletteLabels ? "labels" : ""}`} title={hasSel ? t("Affecter la sélection à ce calque") : t("Choisir le calque des nouvelles formes")}>
        {PALETTE.map((c, i) => (
          <button
            key={c}
            className={i === current ? "current" : ""}
            style={{ background: c }}
            onClick={() => (hasSel ? assignLayer(i) : setState({ currentLayer: i }))}
            aria-label={t("Calque {n}", { n: i })}
          >{paletteLabels ? String(i).padStart(2, "0") : null}</button>
        ))}
        {TOOL_LAYERS.map((id) => (
          <button key={id} className={`tool-swatch ${id === current ? "current" : ""}`} style={{ borderColor: layerColor(id) }}
            onClick={() => (hasSel ? assignLayer(id) : setState({ currentLayer: id }))}
            title={t("Calque outil {name} : jamais gravé, sert au cadrage et aux repères", { name: `T${id - TOOL_LAYERS[0] + 1}` })}
            aria-label={`T${id - TOOL_LAYERS[0] + 1}`}>{`T${id - TOOL_LAYERS[0] + 1}`}</button>
        ))}
      </div>}
    </section>
  );
}
