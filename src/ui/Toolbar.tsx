import { useState } from "react";
import {
  align, centerOnBedSelection, deleteSelection, distribute, duplicateSelection, exportGcode, group, makePreview, mirrorH,
  mirrorV, rotate, selectionBox, selectionRotation, setRotation, setSelectionBox, ungroup,
} from "../actions";
import { getState, redo, setState, undo, useBar, useStore, type Tool } from "../store";
import { icons } from "./Icons";
import { NumField } from "./NumField";
import { t, tk } from "../i18n";

const TOOLS: { id: Tool & keyof typeof icons; label: string; key: string }[] = [
  { id: "select", label: tk("Sélection"), key: "V" },
  { id: "node", label: tk("Éditer les nœuds"), key: "N" },
  { id: "measure", label: tk("Mesurer"), key: "M" },
  { id: "trim", label: tk("Ajuster : supprimer un tronçon entre deux intersections"), key: "" },
  { id: "tab", label: tk("Attaches : cliquez sur un contour (Maj+clic pour retirer)"), key: "" },
  { id: "position", label: tk("Positionner le laser : cliquez pour y envoyer la tête"), key: "" },
  { id: "line", label: tk("Ligne / polyligne"), key: "L" },
  { id: "rect", label: tk("Rectangle"), key: "R" },
  { id: "ellipse", label: tk("Ellipse"), key: "E" },
  { id: "polygon", label: tk("Polygone"), key: "P" },
  { id: "star", label: tk("Étoile"), key: "S" },
  { id: "text", label: tk("Texte"), key: "T" },
];

export function ToolPalette() {
  const tool = useStore((s) => s.tool);
  return (
    <nav className="tool-palette" aria-label={t("Outils")}>
      {TOOLS.map((tl) => (
        <button key={tl.id} className={tool === tl.id ? "active" : ""} onClick={() => setState({ tool: tl.id })} title={tl.key ? `${t(tl.label)} (${tl.key})` : t(tl.label)} aria-label={t(tl.label)}>
          {icons[tl.id]}
        </button>
      ))}
    </nav>
  );
}

export function Toolbar() {
  const hasSel = useStore((s) => s.selection.length > 0);
  // Recalcule la boîte à chaque changement de projet ou de sélection.
  useStore((s) => s.project);
  useStore((s) => s.selection);
  const box = hasSel ? selectionBox() : null;
  const [lock, setLock] = useState(true);
  // Point de référence des champs X / Y (comme LightBurn) : 0…2 en largeur et en hauteur.
  const [anchor, setAnchor] = useState<[number, number]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("lumiere.numericAnchor") ?? "null");
      return Array.isArray(v) ? (v as [number, number]) : [0, 0];
    } catch {
      return [0, 0];
    }
  });
  const pickAnchor = (a: [number, number]) => {
    setAnchor(a);
    try {
      localStorage.setItem("lumiere.numericAnchor", JSON.stringify(a));
    } catch {
      // préférence non conservée
    }
  };
  const ax = box ? box.x + (box.w * anchor[0]) / 2 : null, ay = box ? box.y + (box.h * anchor[1]) / 2 : null;
  const showMain = useBar("main"), showNumeric = useBar("numeric");

  // Redimensionnement autour du point de référence choisi.
  const resize = (w: number, h: number) => box && setSelectionBox({ w, h, x: box.x + ((box.w - w) * anchor[0]) / 2, y: box.y + ((box.h - h) * anchor[1]) / 2 });
  const setW = (w: number) => box && resize(w, lock && box.w > 0 ? (box.h * w) / box.w : box.h);
  const setH = (h: number) => box && resize(lock && box.h > 0 ? (box.w * h) / box.h : box.w, h);

  return (
    <header className="toolbar">
      {showMain && <div className="group">
        <button className="icon" onClick={undo} title={t("Annuler (⌘Z)")} aria-label={t("undo::Annuler")}>{icons.undo}</button>
        <button className="icon" onClick={redo} title={t("Rétablir (⇧⌘Z)")} aria-label={t("Rétablir")}>{icons.redo}</button>
      </div>}
      {showNumeric && <div className="group fields">
        <div className="anchor-grid" role="radiogroup" aria-label={t("Point de référence de la position")}>
          {[0, 1, 2].flatMap((j) => [0, 1, 2].map((i) => (
            <button key={`${i}${j}`} role="radio" aria-checked={anchor[0] === i && anchor[1] === j} className={anchor[0] === i && anchor[1] === j ? "active" : ""}
              onClick={() => pickAnchor([i, j])} title={t("Point de référence de la position")} />
          )))}
        </div>
        <NumField label="X" unit="mm" value={ax} width={64} onChange={(x) => box && setSelectionBox({ x: x - (box.w * anchor[0]) / 2 })} />
        <NumField label="Y" unit="mm" value={ay} width={64} onChange={(y) => box && setSelectionBox({ y: y - (box.h * anchor[1]) / 2 })} />
        <NumField label={t("L")} unit="mm" value={box?.w ?? null} width={64} min={0.01} onChange={setW} />
        <button className={`icon small ${lock ? "active" : ""}`} onClick={() => setLock(!lock)} title={t("Conserver les proportions")} aria-pressed={lock}>
          {lock ? icons.lock : icons.unlock}
        </button>
        <NumField label={t("H")} unit="mm" value={box?.h ?? null} width={64} min={0.01} onChange={setH} />
        <NumField label={t("Rot.")} unit="°" value={hasSel ? selectionRotation() : null} width={52} digits={1} onChange={setRotation} />
      </div>}
      <div className="spacer" />
      {showMain && <div className="group">
        <button onClick={() => makePreview()} title={t("Aperçu de la trajectoire (⌥P)")}>{t("Aperçu")}</button>
        <button onClick={() => exportGcode()} title={t("Enregistrer le G-code")}>{t("Exporter G-code")}</button>
      </div>}
    </header>
  );
}

/** Raccourcis de l'outil Nœuds, au survol d'un nœud ou d'un segment. */
const NODE_KEYS: [string, string][] = [
  ["D", tk("supprimer")], ["I", tk("insérer")], ["B", tk("couper")], ["L", tk("droite")],
  ["C", tk("courbe")], ["S", tk("lisse/anguleux")], ["J", tk("joindre 2 extrémités")], ["P", tk("point de départ")],
];

function ToolOptions() {
  const tool = useStore((s) => s.tool);
  const o = useStore((s) => s.toolOptions);
  const set = (patch: Partial<typeof o>) => setState({ toolOptions: { ...o, ...patch } });
  if (tool === "polygon") return <NumField label={t("Côtés")} value={o.polygonSides} min={3} max={64} digits={0} width={44} onChange={(polygonSides) => set({ polygonSides })} />;
  if (tool === "star" || tool === "dualStar")
    return (
      <>
        <NumField label={t("Branches")} value={o.starPoints} min={3} max={64} digits={0} width={44} onChange={(starPoints) => set({ starPoints })} />
        <NumField label={t("Rayon intérieur")} unit="%" value={Math.round(o.starRatio * 100)} min={5} max={95} digits={0} width={44} onChange={(v) => set({ starRatio: v / 100 })} />
      </>
    );
  if (tool === "roundCorners") return <NumField label={t("Rayon")} unit="mm" value={o.cornerRadius || 2} min={0.01} max={500} width={52} onChange={(cornerRadius) => set({ cornerRadius })} />;
  if (tool === "rect") return <NumField label={t("Rayon des angles")} unit="mm" value={o.cornerRadius} min={0} max={500} width={52} onChange={(cornerRadius) => set({ cornerRadius })} />;
  if (tool === "line") return <span className="hint">{t("Clic : ajouter un point · double-clic ou Entrée : terminer · clic sur le 1er point : fermer")}</span>;
  if (tool === "text") return <span className="hint">{t("Cliquez sur le plan de travail pour placer le texte")}</span>;
  if (tool === "measure") return <span className="hint">{t("Glissez pour mesurer une distance et un angle")}</span>;
  if (tool === "trim") return <span className="hint">{t("Cliquez sur un tronçon : il est supprimé jusqu'aux intersections les plus proches")}</span>;
  if (tool === "tab") return <span className="hint">{t("Clic sur un contour : ajoute une attache (largeur réglée dans le calque) · Maj+clic : la retire")}</span>;
  if (tool === "position") return <span className="hint">{t("Cliquez sur le plateau : la tête laser s'y rend (laser éteint)")}</span>;
  if (tool === "node")
    return (
      <span className="hint">
        {t("Glisser : déplacer nœuds et poignées (⌥ : casser la symétrie) · double-clic sur un segment : ajouter · au survol :")}{" "}
        {NODE_KEYS.map(([k, label]) => (
          <span key={k} className="key-hint"><kbd>{k}</kbd> {t(label)}</span>
        ))}
      </span>
    );
  return null;
}

function SnapControls() {
  const o = useStore((s) => s.toolOptions);
  const set = (patch: Partial<typeof o>) => setState({ toolOptions: { ...o, ...patch } });
  return (
    <div className="group snap" title={t("Magnétisme (maintenir ⌥ pour l'ignorer)")}>
      {icons.magnet}
      <label className="check">
        <input type="checkbox" checked={o.snapObjects} onChange={(e) => set({ snapObjects: e.target.checked })} />
        {t("Objets")}
      </label>
      <label className="check">
        <input type="checkbox" checked={o.snapGrid} onChange={(e) => set({ snapGrid: e.target.checked })} />
        {t("Grille")}
      </label>
      {o.snapGrid && <NumField value={o.gridSize} unit="mm" min={0.01} max={100} width={44} onChange={(gridSize) => set({ gridSize })} />}
    </div>
  );
}

/** Interrupteurs : déplacer, tourner, redimensionner, cisailler à la souris. */
function DragSwitches() {
  const o = useStore((s) => s.toolOptions);
  const sw = (key: "dragMove" | "dragRotate" | "dragScale" | "dragShear", label: string, title: string) => (
    <button className={`icon ${o[key] !== false ? "active" : ""}`} aria-pressed={o[key] !== false} title={title} aria-label={title}
      onClick={() => setState({ toolOptions: { ...getState().toolOptions, [key]: o[key] === false } })}>{label}</button>
  );
  return (
    <div className="group">
      {sw("dragMove", "✥", t("Autoriser le déplacement des formes sélectionnées à la souris"))}
      {sw("dragRotate", "⟳", t("Autoriser la rotation des formes sélectionnées à la souris"))}
      {sw("dragScale", "⤡", t("Autoriser le redimensionnement des formes sélectionnées à la souris"))}
      {sw("dragShear", "▱", t("Autoriser le cisaillement des formes sélectionnées à la souris"))}
    </div>
  );
}

export function ArrangeBar() {
  const n = useStore((s) => s.selection.length);
  const beginner = useStore((s) => s.toolOptions.beginner);
  const tool = useStore((s) => s.tool);
  const b = (icon: keyof typeof icons, title: string, onClick: () => void, min = 1) => (
    <button className="icon" disabled={n < min} onClick={onClick} title={title} aria-label={title}>{icons[icon]}</button>
  );
  return (
    <div className="arrangebar">
      {tool !== "select" ? (
        <div className="group"><ToolOptions /></div>
      ) : (
        <>
          <div className="group">
            {b("rotL", t("Rotation −90°"), () => rotate(-90))}
            {b("rotR", t("Rotation +90°"), () => rotate(90))}
            {b("mirrorH", t("Miroir horizontal"), mirrorH)}
            {b("mirrorV", t("Miroir vertical"), mirrorV)}
          </div>
          <div className="group">
            {b("alignLeft", t("Aligner à gauche"), () => align("left"), 2)}
            {b("alignCenterX", t("Centrer horizontalement"), () => align("centerX"), 2)}
            {b("alignRight", t("Aligner à droite"), () => align("right"), 2)}
            {b("alignTop", t("Aligner en haut"), () => align("top"), 2)}
            {b("alignCenterY", t("Centrer verticalement"), () => align("centerY"), 2)}
            {b("alignBottom", t("Aligner en bas"), () => align("bottom"), 2)}
            {b("distX", t("Répartir horizontalement"), () => distribute("x"), 3)}
            {b("distY", t("Répartir verticalement"), () => distribute("y"), 3)}
          </div>
          <div className="group">
            {b("group", t("Grouper (⌘G)"), group, 2)}
            {b("ungroup", t("Dégrouper (⇧⌘G)"), ungroup)}
            {b("center", t("Centrer sur le plateau"), centerOnBedSelection)}
            {b("duplicate", t("Dupliquer (⌘D)"), duplicateSelection)}
            {b("trash", t("Supprimer (⌫)"), deleteSelection)}
          </div>
        </>
      )}
      <span className="spacer" />
      {!beginner && <DragSwitches />}
      <SnapControls />
    </div>
  );
}
