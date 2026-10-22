// Outils laser → Centre d'un cercle : trois points sur le bord d'un objet rond, relevés
// avec la tête, donnent son centre (pour y envoyer la tête ou y placer un cercle guide).

import { useState } from "react";
import { flattenBez } from "../bezier";
import { headPosition, moveLaserTo, notify, primitiveCurve } from "../actions";
import { translate } from "../geometry";
import { t } from "../i18n";
import { useLaser } from "../laser";
import { circleThrough } from "../lasertools";
import { uid, type Pt, type Shape } from "../model";
import { addShapes, getState } from "../store";
import { Modal } from "./Menu";

export function CenterFinderDialog({ onClose }: { onClose: () => void }) {
  const connected = useLaser((s) => s.connected);
  useLaser((s) => s.status);
  const [pts, setPts] = useState<(Pt | null)[]>([null, null, null]);
  const record = (i: number) => {
    const p = headPosition();
    if (!p) return notify(t("Position du laser inconnue"));
    setPts(pts.map((q, j) => (j === i ? p : q)));
  };
  const circle = pts.every(Boolean) ? circleThrough(pts[0]!, pts[1]!, pts[2]!) : null;
  const fmt = (p: Pt | null) => (p ? `${p[0].toFixed(2)}, ${p[1].toFixed(2)}` : "—");
  const addGuide = () => {
    if (!circle) return;
    const primitive = { type: "ellipse" as const, w: 2 * circle.r, h: 2 * circle.r };
    const curves = [primitiveCurve(primitive)];
    const shape: Shape = {
      id: uid(), kind: "vector", name: t("Cercle guide"), layerId: getState().currentLayer,
      matrix: translate(circle.c[0] - circle.r, circle.c[1] - circle.r), curves, paths: flattenBez(curves, 0.02), primitive,
    };
    addShapes([shape]);
  };
  const labels = [t("Définir le premier point du cercle"), t("Définir le deuxième point du cercle"), t("Définir le troisième point du cercle")];
  return (
    <Modal title={t("Centre d'un cercle")} onClose={onClose} width={480}>
      <p className="hint">{t("Amenez la tête sur trois points du bord de l'objet rond, bien espacés, et enregistrez chacun.")}</p>
      {labels.map((label, i) => (
        <div key={i} className="row">
          <button disabled={!connected} onClick={() => record(i)}>{label}</button>
          <span className="mono">{fmt(pts[i])}</span>
        </div>
      ))}
      <p className="mono">
        {circle ? t("Centre : {x}, {y} · diamètre {d} mm", { x: circle.c[0].toFixed(2), y: circle.c[1].toFixed(2), d: (2 * circle.r).toFixed(2) })
          : pts.every(Boolean) ? t("Points trop proches ou alignés") : ""}
      </p>
      <div className="row end">
        <button onClick={() => setPts([null, null, null])}>{t("Réinitialiser")}</button>
        <button disabled={!circle} onClick={addGuide}>{t("Ajouter un cercle guide au projet")}</button>
        <button className="primary" disabled={!circle || !connected} onClick={() => circle && moveLaserTo(circle.c)}>{t("Aller au centre")}</button>
      </div>
    </Modal>
  );
}
