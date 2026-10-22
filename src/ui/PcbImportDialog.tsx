// Fichier → Importer un circuit imprimé : plusieurs fichiers Gerber / Excellon d'une même
// carte, chacun sur son calque, avec inversion du cuivre par le contour de la carte.

import { useState } from "react";
import { chooseFiles, freeLayer, notify, vectorFromWorld } from "../actions";
import { pathsBox } from "../geometry";
import { t, tk } from "../i18n";
import { parseExcellon, parseGerber } from "../import/gerber";
import { uid, type Polyline, type Shape } from "../model";
import { booleanOp } from "../pathops";
import { commit, getState, withLayer } from "../store";
import { Modal } from "./Menu";

type Role = "copper" | "silk" | "mask" | "paste" | "outline" | "drill" | "skip";

const ROLES: [Role, string][] = [
  ["copper", tk("Cuivre")], ["silk", tk("Sérigraphie")], ["mask", tk("Vernis épargne")], ["paste", tk("Pâte à braser")],
  ["outline", tk("Contour de la carte")], ["drill", tk("Perçage")], ["skip", tk("Ne pas importer")],
];

/** Rôle et face d'après le nom du fichier (KiCad, Eagle, Altium, Protel…). */
export function detectRole(name: string): { role: Role; bottom: boolean } {
  const n = name.toLowerCase();
  const ext = n.split(".").pop() ?? "";
  if (["drl", "xln", "exc"].includes(ext) || /drill|\.drd/.test(n)) return { role: "drill", bottom: false };
  if (["gko", "gm1", "gml"].includes(ext) || /edge[_.-]?cuts|outline|profile|\bdim\b/.test(n)) return { role: "outline", bottom: false };
  if (["gto", "gbo"].includes(ext) || /silk/.test(n)) return { role: "silk", bottom: ext === "gbo" || /b[_.-]silk|bottom/.test(n) };
  if (["gts", "gbs"].includes(ext) || /mask/.test(n)) return { role: "mask", bottom: ext === "gbs" || /b[_.-]mask|bottom/.test(n) };
  if (["gtp", "gbp"].includes(ext) || /paste/.test(n)) return { role: "paste", bottom: ext === "gbp" || /b[_.-]paste|bottom/.test(n) };
  return { role: "copper", bottom: ext === "gbl" || /b[_.-]cu|bottom|bot\b/.test(n) };
}

const area = (p: Polyline) => p.pts.reduce((acc, q, i) => { const r = p.pts[(i + 1) % p.pts.length]; return acc + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;

/** Surface de la carte d'après les tracés du fichier de contour (le plus grand tracé fermé). */
export function boardShape(paths: Polyline[]): Polyline[] {
  const closed = paths.filter((p) => p.closed && p.pts.length >= 3);
  if (!closed.length) return [];
  const outer = closed.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a));
  return [outer];
}

interface Entry {
  file: File;
  role: Role;
  bottom: boolean;
  paths: Polyline[];
}

export function PcbImportDialog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [invert, setInvert] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [fill, setFill] = useState(true);
  const add = async () => {
    const files = await chooseFiles(["gbr", "ger", "gtl", "gbl", "gto", "gbo", "gts", "gbs", "gtp", "gbp", "gko", "gm1", "gml", "art", "pho", "drl", "xln", "exc"], t("Fichiers de circuit imprimé"));
    const next: Entry[] = [];
    for (const file of files) {
      const { role, bottom } = detectRole(file.name);
      try {
        const text = await file.text();
        const r = role === "drill" ? parseExcellon(text) : parseGerber(text);
        next.push({ file, role, bottom, paths: r.groups.flatMap((g) => g.paths) });
      } catch (e) {
        notify(`${file.name} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setEntries([...entries, ...next]);
  };
  const outline = entries.find((e) => e.role === "outline");
  const run = () => {
    const st = getState();
    const groupId = uid();
    const all = entries.filter((e) => e.role !== "skip" && e.paths.length);
    const box = pathsBox(all.flatMap((e) => e.paths));
    if (!box) return;
    // Carte entière : un seul cadre de référence pour le miroir des faces inférieures.
    const cx = box.x + box.w / 2;
    // Contour plein de la carte : le profil est un trait épaissi (un anneau), on garde son bord extérieur.
    const board = outline ? boardShape(outline.paths) : [];
    const shapes: Shape[] = [];
    let project = st.project;
    const taken = new Set<number>();
    for (const e of all) {
      let paths = e.paths;
      if (invert && e.role === "copper" && board.length) paths = booleanOp("difference", [board, paths]);
      if (mirror && e.bottom) paths = paths.map((p) => ({ ...p, pts: p.pts.map(([x, y]): [number, number] => [2 * cx - x, y]) }));
      const layerId = freeLayer(project, st.currentLayer, taken);
      taken.add(layerId);
      project = withLayer(project, layerId);
      const name = `${e.file.name} (${t(ROLES.find((r) => r[0] === e.role)![1])}${e.bottom ? `, ${t("dessous")}` : ""})`;
      const s = vectorFromWorld(paths, layerId, name);
      if (s) shapes.push({ ...s, groupId });
    }
    const { bedWidth, bedHeight } = st.machine;
    const shift = [bedWidth / 2 - cx, bedHeight / 2 - (box.y + box.h / 2)];
    const placed = shapes.map((s) => ({ ...s, matrix: [s.matrix[0], s.matrix[1], s.matrix[2], s.matrix[3], s.matrix[4] + shift[0], s.matrix[5] + shift[1]] as Shape["matrix"] }));
    const fillRoles = new Set<Role>(["copper", "silk", "mask", "paste"]);
    const fillLayers = new Set(all.map((e, i) => (fill && fillRoles.has(e.role) ? placed[i]?.layerId : undefined)).filter((x): x is number => x !== undefined));
    commit((p) => {
      const withAll = placed.reduce((acc, s) => withLayer(acc, s.layerId), { ...p, shapes: [...p.shapes, ...placed] });
      return { ...withAll, layers: withAll.layers.map((l) => (fillLayers.has(l.id) ? { ...l, mode: "fill" as const } : l)) };
    }, { selection: placed.map((s) => s.id) });
    if (box.w > bedWidth || box.h > bedHeight) notify(t("La carte ({w} × {h} mm) dépasse la zone de travail", { w: box.w.toFixed(1), h: box.h.toFixed(1) }));
    onClose();
  };
  return (
    <Modal title={t("Importer un circuit imprimé")} onClose={onClose} width={620}>
      <table className="pcb-files">
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td className="grow">{e.file.name}</td>
              <td>
                <select value={e.role} onChange={(ev) => setEntries(entries.map((x, j) => (j === i ? { ...x, role: ev.target.value as Role } : x)))}>
                  {ROLES.map(([r, label]) => <option key={r} value={r}>{t(label)}</option>)}
                </select>
              </td>
              <td>
                <label className="check">
                  <input type="checkbox" checked={e.bottom} onChange={(ev) => setEntries(entries.map((x, j) => (j === i ? { ...x, bottom: ev.target.checked } : x)))} />
                  {t("Dessous")}
                </label>
              </td>
              <td><button onClick={() => setEntries(entries.filter((_, j) => j !== i))} title={t("Retirer")}>−</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!entries.length && <p className="hint">{t("Ajoutez les fichiers Gerber et de perçage de la carte (le rôle de chacun est détecté d'après son nom).")}</p>}
      <div className="row"><button onClick={add}>{t("Ajouter des fichiers…")}</button></div>
      <label className="check" title={t("Le cuivre devient la zone à retirer : contour de la carte moins les pistes (gravure à l'anglaise)")}>
        <input type="checkbox" checked={invert} disabled={!outline} onChange={(e) => setInvert(e.target.checked)} />
        {t("Inverser le cuivre avec le contour de la carte")}
      </label>
      {!outline && <p className="hint">{t("L'inversion demande un fichier de contour (Edge Cuts / Profile).")}</p>}
      <label className="check">
        <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
        {t("Retourner les faces du dessous")}
      </label>
      <label className="check">
        <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />
        {t("Mettre le cuivre, la sérigraphie et le vernis en Remplissage")}
      </label>
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        <button className="primary" disabled={!entries.some((e) => e.role !== "skip")} onClick={run}>{t("Importer")}</button>
      </div>
    </Modal>
  );
}
