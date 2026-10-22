// Import d'un modèle 3D (STL) : conversion en carte de profondeur (image en niveaux de gris).

import { useEffect, useMemo, useState } from "react";
import { addImage, notify, pendingModel } from "../actions";
import { t, tk } from "../i18n";
import { depthMap, depthToPng, type DepthOptions, type View } from "../import/stl";
import { getState } from "../store";
import { Modal } from "./Menu";
import { NumField } from "./NumField";

const VIEWS: [View, string][] = [
  ["top", tk("Vue de dessus")], ["bottom", tk("Vue de dessous")], ["front", tk("Vue de face")], ["back", tk("Vue arrière")],
  ["left", tk("Vue de gauche")], ["right", tk("Vue de droite")],
];

export function DepthMapDialog({ onClose }: { onClose: () => void }) {
  const model = useMemo(() => pendingModel, []);
  const [o, setO] = useState<DepthOptions>({ view: "top", resolution: 10, invert: false, equalize: false, autoDepth: true, blackBackground: false });
  const [width, setWidth] = useState<number | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const map = useMemo(() => {
    if (!model) return null;
    try {
      return depthMap(model.triangles, o);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [model, o]);
  // Largeur proposée : celle du modèle, limitée au plateau.
  useEffect(() => {
    if (map && width === null) setWidth(Math.min(map.mmWidth, getState().machine.bedWidth * 0.9));
  }, [map]);
  useEffect(() => setPng(map ? depthToPng(map) : null), [map]);
  if (!model) return null;
  const set = (patch: Partial<DepthOptions>) => setO({ ...o, ...patch });
  const height = map && width ? (width * map.mmHeight) / map.mmWidth : 0;
  const check = (label: string, key: "invert" | "equalize" | "autoDepth" | "blackBackground", title?: string) => (
    <label className="check" title={title}>
      <input type="checkbox" checked={o[key]} onChange={(e) => set({ [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <Modal title={t("Convertir en carte de profondeur")} onClose={onClose} width={560}>
      <div className="depth-map">
        <div className="depth-preview">{png && <img src={png} alt="" />}</div>
        <div className="depth-options">
          <label className="field">
            <span>{t("Vue")}</span>
            <select value={o.view} onChange={(e) => set({ view: e.target.value as View })}>
              {VIEWS.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t("Résolution")}</span>
            <select value={o.resolution} onChange={(e) => set({ resolution: Number(e.target.value) })}>
              <option value={5}>{t("Basse (5 px/mm)")}</option>
              <option value={10}>{t("Moyenne (10 px/mm)")}</option>
              <option value={20}>{t("Haute (20 px/mm)")}</option>
              <option value={40}>{t("Très haute (40 px/mm)")}</option>
            </select>
          </label>
          <NumField label={t("Largeur")} unit="mm" value={width} min={1} max={5000} digits={1} onChange={setWidth} />
          <p className="hint mono">{map && t("{w} × {h} mm · profondeur {d} mm · {pw} × {ph} px", {
            w: (width ?? 0).toFixed(1), h: height.toFixed(1), d: map.depth.toFixed(2), pw: map.width, ph: map.height,
          })}</p>
          {check(t("Coupe automatique de la profondeur"), "autoDepth", t("Le fond de la carte est placé au point visible le plus bas"))}
          {check(t("Égaliser la carte de profondeur"), "equalize", t("Fait ressortir les reliefs faibles"))}
          {check(t("Inverser la carte de profondeur"), "invert")}
          {check(t("Fond noir"), "blackBackground", t("Sinon le fond est blanc, donc non gravé"))}
        </div>
      </div>
      <p className="hint">{t("Blanc = haut du modèle, noir = fond. Gravez en mode Image avec « Relief 3D : tranches » ou en niveaux de gris.")}</p>
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        <button className="primary" disabled={!png || !width} onClick={() => {
          if (png && width) addImage(png, width, height, model.name);
          onClose();
        }}>{t("Importer")}</button>
      </div>
    </Modal>
  );
}
