// Panneau de l'outil Mesure, en surimpression du plan de travail.

import { useState } from "react";
import { t, tk } from "../i18n";
import { useMeasureInfo } from "../measure";
import type { Pt } from "../model";
import { MM_PER_INCH, useInches } from "../units";

export function MeasurePanel() {
  const m = useMeasureInfo();
  const prefInches = useInches();
  const [inches, setInches] = useState(prefInches);
  const k = inches ? 1 / MM_PER_INCH : 1;
  const u = inches ? "in" : "mm";
  const n = (v: number) => (v * k).toFixed(inches ? 3 : 2);
  const pt = (p: Pt) => `${n(p[0])}, ${n(p[1])}`;
  const row = (label: string, value: string) => (
    <tr key={label}><th>{t(label)}</th><td>{value}</td></tr>
  );
  const s = m.shape, g = m.segment, l = m.line;
  return (
    <div className="measure-panel">
      <div className="row">
        <strong className="grow">{t("Mesure")}</strong>
        <button className="small" title={t("Basculer entre mm et pouces pour les valeurs affichées ici")} onClick={() => setInches(!inches)}>{u}</button>
      </div>
      <table>
        <tbody>
          {l && [
            row(tk("Point de départ :"), pt(l.a)),
            row(tk("Point d'arrivée :"), pt(l.b)),
            row(tk("Différence :"), `${n(l.b[0] - l.a[0])}, ${n(l.b[1] - l.a[1])} (${n(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]))} ${u})`),
            row(tk("Angle :"), `${((Math.atan2(-(l.b[1] - l.a[1]), l.b[0] - l.a[0]) * 180) / Math.PI).toFixed(1)}°`),
          ]}
          {!l && g && [
            row(tk("Point de départ :"), pt(g.start)),
            row(tk("Point d'arrivée :"), pt(g.end)),
            row(tk("Longueur du segment :"), `${n(g.length)} ${u}`),
            row(tk("Angle :"), `${g.angle.toFixed(1)}°`),
            ...(g.arc ? [row(tk("Centre de l'arc :"), pt(g.arc.center)), row(tk("Rayon de l'arc :"), `${n(g.arc.radius)} ${u}`)] : []),
          ]}
          {s && [
            row(tk("Largeur"), `${n(s.width)} ${u}`),
            row(tk("Hauteur"), `${n(s.height)} ${u}`),
            row(tk("Nœuds :"), String(s.nodes)),
            row(tk("Lignes :"), String(s.lines)),
            row(tk("Courbes :"), String(s.curves)),
            row(tk("Fermé/Ouvert :"), s.closed === "closed" ? t("Fermé") : s.closed === "open" ? t("Ouvert") : `${t("Fermé")} / ${t("Ouvert")}`),
            row(tk("Longueur du périmètre :"), `${n(s.perimeter)} ${u}`),
            ...(s.closed !== "open" ? [row(tk("Surface :"), `${(s.area * k * k).toFixed(inches ? 3 : 1)} ${u}²`)] : []),
          ]}
        </tbody>
      </table>
      {!s && !g && !l && <p className="hint">{t("Survolez une forme, ou glissez pour mesurer une distance.")}</p>}
    </div>
  );
}
