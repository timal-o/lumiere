import { useEffect, useRef, useState } from "react";
import {
  addQr, autoJoinSelection, chooseFiles, convertToBitmap, copyAlongPath, generateOutline, exportText, filletSelection, gridArray, nestSelection, notify,
  offsetSelection, radialArray, selectionBox, sendGcode, simplifySelection, traceImage, traceLoops,
} from "../actions";
import { api } from "../backend";
import { boxCenter, shapeBox } from "../geometry";
import {
  axisValues, buildMaterialTest, DEFAULT_TEST, deleteTestPreset, exportTestPresets, importTestPresets, PARAM_LABEL, saveTestPreset, TEST_PRESETS, testSize,
  userTestPresets, type MaterialTestOptions, type TestAxis,
  type TestParam,
} from "../materialTest";
import { exportClb } from "../clb";
import {
  deletePreset, exportPresets, mergeIntoCurrent, newLibrary, parseLibraryFile, presetLabel, renameLibrary, savePreset, settingsOf, switchLibrary, syncLinks,
  unloadLibrary, updatePreset, useLibraries, usePresets, type MergeRule, type Preset,
} from "../materials";
import { qrPayload, type QrFields, type QrMode } from "../barcode";
import { MODE_LABEL, type GridOptions, type ImageShape, type Layer, type Polyline } from "../model";
import { parseSvg } from "../import/svg";
import type { JoinKind } from "../pathops";
import type { QrLevel } from "../qr";
import { commit, getState, selectedShapes, setState, updateLayer } from "../store";
import { parseToolpath } from "../toolpath";
import { Modal } from "./Menu";
import { NumField } from "./NumField";
import { t } from "../i18n";

export type DialogName =
  | "machine" | "offset" | "array" | "qr" | "trace" | "materialTest" | "library"
  | "fillet" | "join" | "simplify" | "nest" | "alongPath" | "bitmap" | "outline"
  | "barcode" | "notes" | "macros" | "grbl" | "printCut" | "art" | "camera" | "guide" | "about" | "settings"
  | "closeTol" | "boolean" | "adjustImage" | "history" | "prefsBackups" | "taper" | "license" | "usageData" | "slots" | "multiTrace" | "hotkeys" | "optimization" | "centerFinder" | "depthMap" | "checklist" | "circleSelect" | "pcb" | "newDevice" | "console" | "profiles";

let option: string | null = null;

// Mode demandé depuis un module sans accès à openDialog (actions).
if (typeof window !== "undefined") window.addEventListener("lumiere:dialog-option", (e) => (option = (e as CustomEvent<string>).detail));

/** Ouvre une fenêtre ; `opt` choisit son mode initial (ex. tableau circulaire). */
export function openDialog(name: DialogName, opt: string | null = null) {
  option = opt;
  window.dispatchEvent(new CustomEvent("lumiere:dialog", { detail: name }));
}

/** Mode demandé à l'ouverture (lu une seule fois par la fenêtre). */
function takeOption(): string | null {
  const o = option;
  option = null;
  return o;
}

let pending: DialogName | null = null;

/** Rouvre une fenêtre quand l'interface est reconstruite (changement de langue). */
export function reopenAfterRemount(name: DialogName) {
  pending = name;
}

export function takePendingDialog(): DialogName | null {
  const name = pending;
  pending = null;
  return name;
}

function Buttons({ onClose, onOk, ok = t("Appliquer") }: { onClose: () => void; onOk: () => void; ok?: string }) {
  return (
    <div className="row end">
      <button onClick={onClose}>{t("Annuler")}</button>
      <button
        className="primary"
        onClick={() => {
          onOk();
          onClose();
        }}
      >
        {ok}
      </button>
    </div>
  );
}

export function OffsetDialog({ onClose }: { onClose: () => void }) {
  const [delta, setDelta] = useState(2);
  const [direction, setDirection] = useState<"out" | "in" | "both">("out");
  const [outerOnly, setOuterOnly] = useState(false);
  const [join, setJoin] = useState<JoinKind>("round");
  const [keep, setKeep] = useState(true);
  return (
    <Modal title={t("Décalage des formes")} onClose={onClose} width={420}>
      <div className="grid2">
        <NumField label={t("Distance")} unit="mm" value={delta} min={0.01} max={500} step={0.1} digits={3} onChange={setDelta} />
        <label className="field">
          <span>{t("Sens")}</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as "out" | "in" | "both")}>
            <option value="out">{t("Vers l'extérieur")}</option>
            <option value="in">{t("Vers l'intérieur")}</option>
            <option value="both">{t("Les deux")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("Angles")}</span>
          <select value={join} onChange={(e) => setJoin(e.target.value as JoinKind)}>
            <option value="round">{t("Arrondis")}</option>
            <option value="miter">{t("Vifs")}</option>
            <option value="square">{t("Chanfreinés")}</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        {t("Conserver les formes d'origine")}
      </label>
      <label className="check" title={t("Ne décale que les contours extérieurs ; les trous et les formes intérieures sont ignorés")}>
        <input type="checkbox" checked={outerOnly} onChange={(e) => setOuterOnly(e.target.checked)} />
        {t("Formes extérieures seulement")}
      </label>
      <Buttons onClose={onClose} onOk={() => offsetSelection(direction === "in" ? -delta : delta, join, keep, direction === "both", outerOnly)} />
    </Modal>
  );
}

export function ArrayDialog({ onClose }: { onClose: () => void }) {
  const box = selectionBox();
  // « edit:<id> » : modification d'une répétition existante, réglages repris.
  const [opt] = useState(takeOption);
  const editId = opt?.startsWith("edit:") ? opt.slice(5) : undefined;
  const def = editId ? getState().project.arrays?.[editId] : undefined;
  const [tab, setTab] = useState<"grid" | "radial">(def?.kind ?? (opt === "radial" ? "radial" : "grid"));
  const [cols, setCols] = useState(def?.kind === "grid" ? def.cols : 3);
  const [rows, setRows] = useState(def?.kind === "grid" ? def.rows : 2);
  const [gapX, setGapX] = useState(def?.kind === "grid" ? def.gapX : 5);
  const [gapY, setGapY] = useState(def?.kind === "grid" ? def.gapY : 5);
  const [go, setGo] = useState<GridOptions>(() => {
    if (def?.kind !== "grid") return {};
    const { kind: _k, cols: _c, rows: _r, gapX: _x, gapY: _y, source: _s, ...rest } = def;
    return rest;
  });
  const [virtual, setVirtual] = useState(true);
  const opt2 = (key: keyof GridOptions, label: string) => (
    <label className="check">
      <input type="checkbox" checked={!!go[key]} onChange={(e) => setGo({ ...go, [key]: e.target.checked })} />
      {label}
    </label>
  );
  const c = box ? boxCenter(box) : [0, 0];
  const [count, setCount] = useState(def?.kind === "radial" ? def.count : 6);
  const [cx, setCx] = useState(def?.kind === "radial" ? def.center[0] : c[0]);
  const [cy, setCy] = useState(def?.kind === "radial" ? def.center[1] : c[1] + (box ? box.h * 1.5 : 0));
  const [angle, setAngle] = useState(def?.kind === "radial" ? def.angle : 360);
  const [rotateCopies, setRotateCopies] = useState(def?.kind === "radial" ? def.rotate : true);
  const [rStart, setRStart] = useState(def?.kind === "radial" ? def.start ?? 0 : 0);
  const [rGroup, setRGroup] = useState(def?.kind === "radial" ? !!def.group : false);
  const [rText, setRText] = useState(def?.kind === "radial" ? def.textStep ?? 0 : 0);
  const fullCircle = Math.abs(Math.abs(angle) - 360) < 1e-6;
  const stepAngle = angle / Math.max(1, fullCircle ? count : count - 1);
  if (!box) {
    return (
      <Modal title={t("Tableau")} onClose={onClose} width={360}>
        <p>{t("Sélectionnez d'abord les formes à répéter.")}</p>
        <div className="row end"><button onClick={onClose}>{t("Fermer")}</button></div>
      </Modal>
    );
  }
  return (
    <Modal title={t("Tableau")} onClose={onClose} width={440}>
      <div className="segmented-row">
        <button className={tab === "grid" ? "active" : ""} onClick={() => setTab("grid")}>{t("Grille")}</button>
        <button className={tab === "radial" ? "active" : ""} onClick={() => setTab("radial")}>{t("Circulaire")}</button>
      </div>
      {tab === "grid" ? (
        <>
          <div className="grid2">
            <NumField label={t("Colonnes")} value={cols} min={1} max={200} digits={0} onChange={setCols} />
            <NumField label={t("Lignes")} value={rows} min={1} max={200} digits={0} onChange={setRows} />
            <NumField label={go.pitch ? t("Pas X") : t("Écart X")} unit="mm" value={gapX} min={-1000} max={1000} step={0.5} onChange={setGapX} />
            <NumField label={go.pitch ? t("Pas Y") : t("Écart Y")} unit="mm" value={gapY} min={-1000} max={1000} step={0.5} onChange={setGapY} />
          </div>
          <div className="segmented-row">
            <button className={!go.pitch ? "active" : ""} onClick={() => { if (go.pitch) { setGapX(gapX - box.w); setGapY(gapY - box.h); } setGo({ ...go, pitch: false }); }}>{t("Écart entre les bords")}</button>
            <button className={go.pitch ? "active" : ""} onClick={() => { if (!go.pitch) { setGapX(gapX + box.w); setGapY(gapY + box.h); } setGo({ ...go, pitch: true }); }}>{t("Distance de centre à centre")}</button>
          </div>
          <div className="row">
            <button onClick={() => { const w = getState().machine.bedWidth, sx = go.pitch ? gapX : box.w + gapX; if (sx > 0) setCols(Math.max(1, Math.floor((w - box.w) / sx) + 1)); }}
              title={t("Assez de colonnes pour remplir la largeur du plateau")}>{t("Remplir en largeur")}</button>
            <button onClick={() => { const h = getState().machine.bedHeight, sy = go.pitch ? gapY : box.h + gapY; if (sy > 0) setRows(Math.max(1, Math.floor((h - box.h) / sy) + 1)); }}
              title={t("Assez de rangées pour remplir la hauteur du plateau")}>{t("Remplir en hauteur")}</button>
          </div>
          <details>
            <summary>{t("Options")}</summary>
            <div className="grid2">
              <NumField label={t("Décalage X par rangée")} unit="mm" value={go.rowShift ?? 0} min={-1000} max={1000} step={0.5} onChange={(rowShift) => setGo({ ...go, rowShift })} />
              <NumField label={t("Décalage Y par colonne")} unit="mm" value={go.colShift ?? 0} min={-1000} max={1000} step={0.5} onChange={(colShift) => setGo({ ...go, colShift })} />
              {opt2("halfShift", t("Décaler d'un demi-pas"))}
              {opt2("reverse", t("Sens inverse"))}
              {opt2("mirrorColsX", t("Miroir X des colonnes alternées"))}
              {opt2("mirrorColsY", t("Miroir Y des colonnes alternées"))}
              {opt2("mirrorRowsX", t("Miroir X des rangées alternées"))}
              {opt2("mirrorRowsY", t("Miroir Y des rangées alternées"))}
              {opt2("randomRotate", t("Orientation aléatoire"))}
              {opt2("group", t("Grouper les résultats"))}
              <NumField label={t("Incrément du texte variable")} value={go.textStep ?? 0} min={-1000} max={1000} digits={0}
                onChange={(textStep) => setGo({ ...go, textStep })} />
            </div>
          </details>
          {!editId && (
            <label className="check" title={t("Les copies restent liées à l'original (Disposer → Modifier la répétition)")}>
              <input type="checkbox" checked={virtual} onChange={(e) => setVirtual(e.target.checked)} />
              {t("Créer une répétition virtuelle")}
            </label>
          )}
          <p className="hint">
            {t("Taille totale : {w} × {h} mm · {n} copies", {
              w: ((cols - 1) * (go.pitch ? gapX : box.w + gapX) + box.w).toFixed(2), h: ((rows - 1) * (go.pitch ? gapY : box.h + gapY) + box.h).toFixed(2), n: cols * rows - 1,
            })}
          </p>
          <Buttons onClose={onClose} onOk={() => gridArray(cols, rows, gapX, gapY, editId, go.randomRotate && !go.seed ? { ...go, seed: Math.floor(Math.random() * 1e9) } : go, virtual)} />
        </>
      ) : (
        <>
          <div className="grid2">
            <NumField label={t("Nombre")} value={count} min={2} max={360} digits={0} onChange={setCount} />
            <NumField label={t("Angle total")} unit="°" value={angle} min={-360} max={360} digits={1} onChange={setAngle} />
            <NumField label={t("Centre X")} unit="mm" value={cx} min={-5000} max={5000} onChange={setCx} />
            <NumField label={t("Centre Y")} unit="mm" value={cy} min={-5000} max={5000} onChange={setCy} />
            <NumField label={t("Angle de départ")} unit="°" value={rStart} min={-360} max={360} digits={1} onChange={setRStart} />
            <NumField label={t("Pas")} unit="°" value={stepAngle} min={-360} max={360} digits={2}
              onChange={(s) => setAngle(Math.max(-360, Math.min(360, s * (fullCircle ? count : count - 1))))} />
            <NumField label={t("Incrément du texte variable")} value={rText} min={-1000} max={1000} digits={0} onChange={setRText} />
          </div>
          <div className="row">
            <button onClick={() => {
              // Centre : la dernière forme sélectionnée, qui n'est alors pas répétée.
              const st = getState();
              const last = st.project.shapes.find((s) => s.id === st.selection[st.selection.length - 1]);
              const lb = last && shapeBox(last);
              if (!lb || st.selection.length < 2) return;
              const c = boxCenter(lb);
              setCx(c[0]);
              setCy(c[1]);
              setState({ selection: st.selection.slice(0, -1) });
            }} title={t("Le centre devient celui de la dernière forme sélectionnée, retirée de la sélection")}>{t("Centre sur la dernière forme sélectionnée")}</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={rotateCopies} onChange={(e) => setRotateCopies(e.target.checked)} />
            {t("Faire tourner les copies")}
          </label>
          <label className="check">
            <input type="checkbox" checked={rGroup} onChange={(e) => setRGroup(e.target.checked)} />
            {t("Grouper les résultats")}
          </label>
          <Buttons onClose={onClose} onOk={() => radialArray(count, [cx, cy], angle, rotateCopies, editId, { start: rStart, group: rGroup, textStep: rText })} />
        </>
      )}
    </Modal>
  );
}

export function QrDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<QrMode>("text");
  const [f, setF] = useState<QrFields>({ text: "https://", auth: "WPA" });
  const [size, setSize] = useState(30);
  const [level, setLevel] = useState<QrLevel>("M");
  const [logo, setLogo] = useState<{ name: string; paths: Polyline[] } | null>(null);
  const [format, setFormat] = useState<"qr" | "datamatrix">("qr");
  const field = (key: keyof QrFields, label: string, type = "text") => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input type={type} value={(f[key] as string) ?? ""} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  );
  const text = qrPayload(mode, f);
  return (
    <Modal title={t("QR code")} onClose={onClose} width={440}>
      <div className="segmented-row">
        <button className={format === "qr" ? "active" : ""} onClick={() => setFormat("qr")}>QR code</button>
        <button className={format === "datamatrix" ? "active" : ""} onClick={() => setFormat("datamatrix")}>DataMatrix</button>
      </div>
      <label className="field">
        <span>{t("Type de contenu")}</span>
        <select value={mode} onChange={(e) => setMode(e.target.value as QrMode)}>
          <option value="text">{t("Texte libre")}</option>
          <option value="url">{t("Adresse web")}</option>
          <option value="wifi">{t("Réseau Wi-Fi")}</option>
          <option value="contact">{t("Contact")}</option>
          <option value="email">{t("E-mail")}</option>
          <option value="phone">{t("Téléphone")}</option>
        </select>
      </label>
      {mode === "text" && field("text", t("Contenu"))}
      {mode === "url" && field("url", t("Adresse"))}
      {mode === "wifi" && (
        <div className="grid2">
          {field("ssid", t("Nom du réseau (SSID)"))}
          {f.auth !== "nopass" && field("password", t("Mot de passe"))}
          <label className="field">
            <span>{t("Sécurité")}</span>
            <select value={f.auth} onChange={(e) => setF({ ...f, auth: e.target.value as QrFields["auth"] })}>
              <option value="WPA">WPA / WPA2 / WPA3</option>
              <option value="WEP">WEP</option>
              <option value="nopass">{t("Aucune (sans mot de passe)")}</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={!!f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} />
            {t("Réseau masqué")}
          </label>
        </div>
      )}
      {mode === "contact" && (
        <div className="grid2">
          {field("firstName", t("Prénom"))}
          {field("lastName", t("Nom"))}
          {field("phone", t("Téléphone"), "tel")}
          {field("email", t("E-mail"), "email")}
          {field("org", t("Société ou note"))}
          {field("url", t("Site web"))}
          {field("address", t("Adresse postale"))}
        </div>
      )}
      {mode === "email" && (
        <div className="grid2">
          {field("email", t("E-mail"), "email")}
          {field("subject", t("Objet"))}
          {field("body", t("Message"))}
        </div>
      )}
      {mode === "phone" && field("phone", t("Téléphone"), "tel")}
      {mode !== "text" && <p className="hint mono">{text}</p>}
      <div className="grid2">
        <NumField label={t("Taille")} unit="mm" value={size} min={5} max={1000} onChange={setSize} />
        {format === "qr" && (
        <label className="field">
          <span>{t("Correction d'erreur")}</span>
          <select value={level} onChange={(e) => setLevel(e.target.value as QrLevel)}>
            <option value="L">{t("Faible (7 %)")}</option>
            <option value="M">{t("Moyenne (15 %)")}</option>
            <option value="Q">{t("Forte (25 %)")}</option>
            <option value="H">{t("Maximale (30 %)")}</option>
          </select>
        </label>
        )}
      </div>
      {format === "qr" && <div className="row">
        <button onClick={async () => {
          const [file] = await chooseFiles(["svg"], "SVG");
          if (!file) return;
          try {
            const paths = parseSvg(await file.text()).groups.flatMap((g) => g.paths);
            if (!paths.length) throw new Error(t("Aucun tracé trouvé"));
            setLogo({ name: file.name, paths });
          } catch (e) {
            notify(e instanceof Error ? e.message : String(e));
          }
        }}>{t("Charger un logo (SVG)…")}</button>
        {logo && <span className="hint grow">{logo.name} · {t("correction d'erreur maximale imposée")}</span>}
        {logo && <button onClick={() => setLogo(null)} title={t("Retirer le logo")}>✕</button>}
      </div>}
      <p className="hint">{t("Placez-le sur un calque en mode Remplissage pour graver les modules pleins.")}</p>
      <Buttons onClose={onClose} onOk={() => addQr(text, size, level, logo?.paths, format)} ok={t("Créer")} />
    </Modal>
  );
}

export function TraceDialog({ onClose }: { onClose: () => void }) {
  const image = selectedShapes().find((s): s is ImageShape => s.kind === "image");
  const [threshold, setThreshold] = useState(128);
  const [minArea, setMinArea] = useState(8);
  const [tolerance, setTolerance] = useState(0.6);
  const [smooth, setSmooth] = useState(true);
  const [resolution, setResolution] = useState(0.1);
  const [cutoff, setCutoff] = useState(0);
  const [deleteImage, setDeleteImage] = useState(false);
  const [centerline, setCenterline] = useState(false);
  const [sketch, setSketch] = useState(false);
  const [fade, setFade] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  // Aperçu : image (estompée si demandé) et tracés, recalculés après chaque réglage.
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      const k = Math.min(400 / image.width, 300 / image.height);
      const pw = Math.max(1, Math.round(image.width * k)), ph = Math.max(1, Math.round(image.height * k));
      // Tolérances exprimées pour la résolution choisie, ramenées à celle de l'aperçu.
      const f = (k * resolution);
      const { loops, gray } = await traceLoops(image, { threshold, cutoff, minArea: minArea * f * f, tolerance: tolerance * f, smooth, centerline, sketch }, pw, ph);
      const c = preview.current;
      if (cancelled || !c) return;
      c.width = pw;
      c.height = ph;
      const ctx = c.getContext("2d")!;
      const img = ctx.createImageData(pw, ph);
      for (let i = 0; i < gray.length; i++) {
        const v = fade ? 255 - (255 - gray[i]) * 0.35 : gray[i];
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      ctx.strokeStyle = "#e53935";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of loops) {
        p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (p.closed) ctx.closePath();
      }
      ctx.stroke();
      if (showPoints) {
        ctx.fillStyle = "#1e88e5";
        for (const p of loops) for (const [x, y] of p.pts) ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [image, threshold, cutoff, minArea, tolerance, smooth, centerline, sketch, fade, showPoints, resolution]);
  if (!image) {
    return (
      <Modal title={t("Vectoriser une image")} onClose={onClose} width={360}>
        <p>{t("Sélectionnez d'abord une image.")}</p>
        <div className="row end"><button onClick={onClose}>{t("Fermer")}</button></div>
      </Modal>
    );
  }
  return (
    <Modal title={t("Vectoriser une image")} onClose={onClose} width={460}>
      <canvas ref={preview} className="trace-preview" />
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={fade} onChange={(e) => setFade(e.target.checked)} />
          {t("Estomper l'image")}
        </label>
        <label className="check">
          <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />
          {t("Afficher les points")}
        </label>
      </div>
      <label className="field">
        <span>{t("Seuil : {value} (les pixels plus sombres sont tracés)", { value: threshold })}</span>
        <input type="range" min={1} max={254} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
      </label>
      <div className="grid2">
        <NumField label={t("Résolution")} unit="mm" value={resolution} min={0.02} max={2} step={0.01} digits={3} onChange={setResolution} />
        <NumField label={t("Ignorer < ")} unit="px²" value={minArea} min={0} max={10000} digits={0} onChange={setMinArea} />
        <NumField label={t("Simplification")} unit="px" value={tolerance} min={0} max={10} step={0.1} digits={2} onChange={setTolerance} />
      </div>
      <label className="check">
        <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
        {t("Lisser les contours")}
      </label>
      <label className="field">
        <span>{t("Seuil bas : {value} (les pixels plus sombres sont ignorés)", { value: cutoff })}</span>
        <input type="range" min={0} max={254} value={cutoff} onChange={(e) => setCutoff(Math.min(Number(e.target.value), threshold - 1))} />
      </label>
      <label className="check" title={t("Pour les dessins au trait et l'écriture : une ligne au milieu des traits, plutôt que leur contour")}>
        <input type="checkbox" checked={centerline} onChange={(e) => setCenterline(e.target.checked)} />
        {t("Tracé central")}
      </label>
      <label className="check" title={t("Trace les bords de l'image en lignes, comme un croquis, plutôt que ses zones sombres")}>
        <input type="checkbox" checked={sketch} onChange={(e) => setSketch(e.target.checked)} />
        {t("Tracé croquis")}
      </label>
      <label className="check">
        <input type="checkbox" checked={deleteImage} onChange={(e) => setDeleteImage(e.target.checked)} />
        {t("Supprimer l'image après le tracé")}
      </label>
      <p className="hint">{t("Les réglages de l'image (luminosité, contraste…) sont pris en compte.")}</p>
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await traceImage(image, { threshold, cutoff, minArea, tolerance, smooth, resolution, centerline, sketch }, deleteImage);
            setBusy(false);
            onClose();
          }}
        >
          {busy ? t("Calcul…") : t("Vectoriser")}
        </button>
      </div>
    </Modal>
  );
}

function AxisFields({ title, axis, onChange }: { title: string; axis: TestAxis; onChange: (a: TestAxis) => void }) {
  const set = (patch: Partial<TestAxis>) => onChange({ ...axis, ...patch });
  const digits = axis.param === "interval" ? 3 : axis.param === "speed" || axis.param === "passes" ? 0 : 1;
  return (
    <fieldset>
      <legend>{title}</legend>
      <div className="grid2">
        <label className="field">
          <span>{t("Paramètre")}</span>
          <select value={axis.param} onChange={(e) => set({ param: e.target.value as TestParam })}>
            {(Object.keys(PARAM_LABEL) as TestParam[]).map((k) => <option key={k} value={k}>{t(PARAM_LABEL[k])}</option>)}
          </select>
        </label>
        <NumField label={t("Nombre")} value={axis.steps} min={1} max={30} digits={0} onChange={(steps) => set({ steps })} />
        <NumField label={t("De")} value={axis.min} min={-1000} max={100000} digits={digits} onChange={(min) => set({ min })} />
        <NumField label={t("À")} value={axis.max} min={-1000} max={100000} digits={digits} onChange={(max) => set({ max })} />
      </div>
    </fieldset>
  );
}

export function MaterialTestDialog({ onClose }: { onClose: () => void }) {
  const [o, setO] = useState<MaterialTestOptions>(() => {
    const preset = TEST_PRESETS[takeOption() ?? ""];
    return preset ? { ...DEFAULT_TEST, ...preset } : DEFAULT_TEST;
  });
  const [busy, setBusy] = useState(false);
  const [userPresets, setUserPresets] = useState(userTestPresets);
  const [presetName, setPresetName] = useState("");
  const set = (patch: Partial<MaterialTestOptions>) => setO({ ...o, ...patch });
  const setBase = (patch: Partial<MaterialTestOptions["base"]>) => set({ base: { ...o.base, ...patch } });
  const size = testSize(o);
  const varying = new Set([o.cols.param, o.rows.param]);

  const run = async (action: "preview" | "export" | "send") => {
    setBusy(true);
    try {
      const st = getState();
      const result = await api.generateGcode(await buildMaterialTest(o, st.machine));
      if (action === "preview") {
        const toolpath = parseToolpath(result.gcode, st.machine);
        setState({ preview: { result, toolpath, warnings: result.stats.warnings, shown: toolpath.count } });
        onClose();
      } else if (action === "export") await exportText(result.gcode, "test.gcode");
      else await sendGcode(result.gcode);
    } catch (e) {
      notify(String(e));
    }
    setBusy(false);
  };

  return (
    <Modal title={t("Grille de test")} onClose={onClose} width={680}>
      <div className="row">
        <label className="field">
          <span>{t("Préréglage")}</span>
          <select value="" onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("user:")) setO({ ...DEFAULT_TEST, ...userPresets[v.slice(5)] });
            else if (v) set(TEST_PRESETS[v]);
          }}>
            <option value="">{t("Choisir…")}</option>
            <optgroup label={t("Fournis")}>{Object.keys(TEST_PRESETS).map((k) => <option key={k} value={k}>{t(k)}</option>)}</optgroup>
            {Object.keys(userPresets).length > 0 && <optgroup label={t("Mes préréglages")}>{Object.keys(userPresets).map((k) => <option key={k} value={`user:${k}`}>{k}</option>)}</optgroup>}
          </select>
        </label>
        <input type="text" className="grow" placeholder={t("Nom du préréglage")} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
        <button disabled={!presetName.trim()} onClick={() => { saveTestPreset(presetName.trim(), o); setUserPresets(userTestPresets()); }} title={t("Enregistrer les réglages actuels comme préréglage")}>{t("Enregistrer")}</button>
        {userPresets[presetName.trim()] && <button onClick={() => { deleteTestPreset(presetName.trim()); setUserPresets(userTestPresets()); }} title={t("Supprimer")}>−</button>}
        <button onClick={() => exportText(exportTestPresets(), t("prereglages-tests.json"))} disabled={!Object.keys(userPresets).length}>{t("Exporter…")}</button>
        <button onClick={async () => {
          const [file] = await chooseFiles(["json"], t("Préréglages de test"));
          if (!file) return;
          try {
            notify(t("{n} préréglage(s) importé(s)", { n: importTestPresets(await file.text()) }));
            setUserPresets(userTestPresets());
          } catch (e) {
            notify(e instanceof Error ? e.message : String(e));
          }
        }}>{t("Importer…")}</button>
        <label className="field">
          <span>{t("Mode")}</span>
          <select value={o.mode} onChange={(e) => set({ mode: e.target.value as MaterialTestOptions["mode"] })}>
            <option value="fill">{t(MODE_LABEL.fill)}</option>
            <option value="line">{t(MODE_LABEL.line)}</option>
          </select>
        </label>
      </div>
      <div className="grid2">
        <AxisFields title={t("Colonnes")} axis={o.cols} onChange={(cols) => set({ cols })} />
        <AxisFields title={t("Lignes")} axis={o.rows} onChange={(rows) => set({ rows })} />
      </div>
      <fieldset>
        <legend>{t("Réglages fixes")}</legend>
        <div className="grid2">
          {!varying.has("power") && <NumField label={t("Puissance")} unit="%" value={o.base.power} min={0} max={100} digits={1} onChange={(power) => setBase({ power })} />}
          {!varying.has("speed") && <NumField label={t("Vitesse")} unit="mm/min" value={o.base.speed} min={10} max={100000} digits={0} onChange={(speed) => setBase({ speed })} />}
          {!varying.has("interval") && o.mode === "fill" && <NumField label={t("Pas")} unit="mm" value={o.base.interval} min={0.01} max={2} step={0.01} digits={3} onChange={(interval) => setBase({ interval })} />}
          {!varying.has("passes") && <NumField label={t("Passes")} value={o.base.passes} min={1} max={20} digits={0} onChange={(passes) => setBase({ passes })} />}
          <NumField label={t("Taille des cases")} unit="mm" value={o.cellSize} min={1} max={100} onChange={(cellSize) => set({ cellSize })} />
          <NumField label={t("Espacement")} unit="mm" value={o.gap} min={0} max={50} onChange={(gap) => set({ gap })} />
          <NumField label={t("Position X")} unit="mm" value={o.x} min={0} max={5000} onChange={(x) => set({ x })} />
          <NumField label={t("Position Y")} unit="mm" value={o.y} min={0} max={5000} onChange={(y) => set({ y })} />
        </div>
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={o.labels} onChange={(e) => set({ labels: e.target.checked })} />
        {t("Graver les légendes")}
        {o.labels && (
          <>
            <NumField value={o.labelPower} unit="%" min={1} max={100} width={48} onChange={(labelPower) => set({ labelPower })} />
            <NumField value={o.labelSpeed} unit="mm/min" min={10} max={100000} digits={0} width={60} onChange={(labelSpeed) => set({ labelSpeed })} />
          </>
        )}
      </label>
      <div className="row">
        <input type="text" className="grow" placeholder={t("Titre gravé au-dessus (facultatif)")} value={o.title ?? ""} onChange={(e) => set({ title: e.target.value || undefined })} />
      </div>
      <label className="check">
        <input type="checkbox" checked={!!o.border} onChange={(e) => set({ border: e.target.checked })} />
        {t("Découper une bordure")}
        {o.border && (
          <>
            <NumField value={o.borderPower ?? 80} unit="%" min={1} max={100} width={48} onChange={(borderPower) => set({ borderPower })} />
            <NumField value={o.borderSpeed ?? 600} unit="mm/min" min={10} max={100000} digits={0} width={60} onChange={(borderSpeed) => set({ borderSpeed })} />
          </>
        )}
      </label>
      {varying.has("zOffset") && !getState().machine.zAxis && <p className="hint warn-text">{t("Le décalage Z nécessite un axe Z motorisé (réglages machine).")}</p>}
      <p className="hint">
        {t("{cells} cases · {w} × {h} mm · colonnes {values}", { cells: o.cols.steps * o.rows.steps, w: size.w.toFixed(0), h: size.h.toFixed(0), values: axisValues(o.cols).join(", ") })}
      </p>
      <div className="row end">
        <button onClick={onClose}>{t("Fermer")}</button>
        <button disabled={busy} onClick={() => run("preview")}>{t("Aperçu")}</button>
        <button disabled={busy} onClick={() => run("export")}>{t("Exporter G-code")}</button>
        <button className="primary" disabled={busy} onClick={() => run("send")}>{t("Envoyer au laser")}</button>
      </div>
    </Modal>
  );
}

export function LibraryDialog({ onClose }: { onClose: () => void }) {
  const presets = usePresets();
  const libs = useLibraries();
  const [rule, setRule] = useState<MergeRule>("keep");
  const layer: Layer | undefined = getState().project.layers.find((l) => l.id === getState().currentLayer);
  const [material, setMaterial] = useState("");
  const [thickness, setThickness] = useState<number>(3);
  const [description, setDescription] = useState(layer ? t(MODE_LABEL[layer.mode]) : "");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    if (layer) setDescription(t(MODE_LABEL[layer.mode]));
  }, [layer?.mode]);

  const shown = presets.filter((p) => `${p.material} ${p.description}`.toLowerCase().includes(filter.toLowerCase()));
  const apply = (p: Preset) => {
    if (!layer) return;
    updateLayer(layer.id, { ...p.settings });
    notify(t("« {material} — {description} » appliqué au calque {layer}", { material: p.material, description: p.description, layer: layer.name }));
  };
  const link = (p: Preset) => {
    if (!layer) return;
    updateLayer(layer.id, { ...p.settings, libraryLink: { id: p.id, label: presetLabel(p) } });
  };
  /** L'entrée prend les réglages du calque courant ; les calques qui y sont liés suivent. */
  const replace = (p: Preset) => {
    if (!layer) return;
    const settings = settingsOf(layer);
    updatePreset(p.id, settings);
    const lib = presets.map((x) => (x.id === p.id ? { ...x, settings } : x));
    commit((pr) => ({ ...pr, layers: syncLinks(pr.layers.map((l) => (l.id === layer.id ? { ...l, libraryLink: { id: p.id, label: presetLabel(p) } } : l)), lib) }));
    notify(t("Réglage « {name} » mis à jour", { name: presetLabel(p) }));
  };

  return (
    <Modal title={t("Bibliothèque de matériaux")} onClose={onClose} width={660}>
      <div className="row">
        <select value={libs.current} onChange={(e) => switchLibrary(e.target.value)} aria-label={t("Bibliothèque")}>
          {libs.libs.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.presets.length})</option>)}
        </select>
        <button onClick={() => newLibrary(t("Nouvelle bibliothèque"))}>{t("Nouvelle")}</button>
        <input key={libs.current} type="text" className="grow" aria-label={t("Nom de la bibliothèque")} defaultValue={libs.libs.find((l) => l.id === libs.current)?.name}
          onBlur={(e) => e.target.value.trim() && renameLibrary(libs.current, e.target.value.trim())} title={t("Nom de la bibliothèque")} />
        <button disabled={libs.libs.length < 2} onClick={() => unloadLibrary(libs.current)} title={t("Retire cette bibliothèque de la liste (exportez-la d'abord pour la garder)")}>{t("Décharger")}</button>
        <button onClick={async () => {
          const [file] = await chooseFiles(["json", "clb"], t("Bibliothèques (Lumière, LightBurn)"));
          if (!file) return;
          try {
            newLibrary(file.name.replace(/\.[^.]+$/, ""), parseLibraryFile(await file.text()));
          } catch (e) {
            notify(e instanceof Error ? e.message : String(e));
          }
        }} title={t("Ouvre un fichier comme nouvelle bibliothèque")}>{t("Ouvrir…")}</button>
      </div>
      <input type="text" placeholder={t("Rechercher…")} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="library">
        {shown.length === 0 && <p className="hint">{t("Aucun réglage enregistré pour l'instant.")}</p>}
        {shown.map((p) => (
          <div key={p.id} className="library-row">
            <div className="grow">
              <strong>{p.material}</strong>
              {p.thickness != null && <span className="muted"> · {p.thickness} mm</span>}
              <div className="hint">
                {p.description} — {t(MODE_LABEL[p.settings.mode])}, {p.settings.speed} mm/min, {p.settings.power} %, {t("{n} passe(s)", { n: p.settings.passes })}
              </div>
            </div>
            <button disabled={!layer} onClick={() => apply(p)} title={t("Appliquer au calque courant")}>{t("Appliquer")}</button>
            <button disabled={!layer} className={layer?.libraryLink?.id === p.id ? "active" : ""} onClick={() => link(p)}
              title={t("Lier le calque courant à ce réglage : il suivra les modifications de la bibliothèque")}>{t("Lier")}</button>
            <button disabled={!layer} onClick={() => replace(p)}
              title={t("Remplacer ce réglage par celui du calque courant (les calques liés suivent)")}>↻</button>
            <button onClick={() => deletePreset(p.id)} title={t("Supprimer")}>✕</button>
          </div>
        ))}
      </div>
      {layer && (
        <fieldset>
          <legend>{t("Enregistrer le calque {name}", { name: layer.name })} ({t(MODE_LABEL[layer.mode])}, {layer.speed} mm/min, {layer.power} %)</legend>
          <div className="row">
            <input type="text" placeholder={t("Matériau (ex. Contreplaqué)")} value={material} onChange={(e) => setMaterial(e.target.value)} className="grow" />
            <NumField value={thickness} unit="mm" min={0} max={100} width={50} onChange={setThickness} />
            <input type="text" placeholder={t("Description")} value={description} onChange={(e) => setDescription(e.target.value)} className="grow" />
            <button
              className="primary"
              disabled={!material.trim()}
              onClick={() => {
                savePreset({ material: material.trim(), thickness, description: description.trim(), settings: settingsOf(layer) });
                setMaterial("");
              }}
            >
              {t("Enregistrer")}
            </button>
          </div>
        </fieldset>
      )}
      <div className="row end">
        <label className="field">
          <span>{t("En cas de doublon")}</span>
          <select value={rule} onChange={(e) => setRule(e.target.value as MergeRule)}>
            <option value="keep">{t("Garder l'original")}</option>
            <option value="replace">{t("Remplacer par le nouveau")}</option>
            <option value="renameNew">{t("Renommer le nouveau")}</option>
            <option value="renameOld">{t("Renommer l'original")}</option>
          </select>
        </label>
        <button onClick={async () => {
          const [file] = await chooseFiles(["json", "clb"], t("Bibliothèques (Lumière, LightBurn)"));
          if (!file) return;
          try {
            const incoming = parseLibraryFile(await file.text());
            mergeIntoCurrent(incoming, rule);
            notify(t("{n} réglage(s) importé(s)", { n: incoming.length }));
          } catch (e) {
            notify(e instanceof Error ? e.message : String(e));
          }
        }} title={t("Fusionne un fichier (Lumière ou LightBurn .clb) dans cette bibliothèque")}>{t("Fusionner…")}</button>
        <button onClick={() => exportText(exportPresets(), "materiaux.json")}>{t("Exporter…")}</button>
        <button onClick={() => exportText(exportClb(presets), "materiaux.clb")} title={t("Bibliothèque au format LightBurn (.clb)")}>{t("Exporter en .clb…")}</button>
        <span className="grow" />
        <button onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------ Dialogues à paramètres

type Field =
  | { key: string; label: string; kind: "number"; unit?: string; min: number; max: number; step?: number; digits?: number }
  | { key: string; label: string; kind: "check" }
  | { key: string; label: string; kind: "choice"; options: [string, string][] };

type Values = Record<string, number | boolean | string>;

/** Dialogue générique : quelques champs et un bouton d'action. */
export function ParamDialog({ title, fields, initial, hint, ok, onOk, onClose }: {
  title: string; fields: Field[]; initial: Values; hint?: string; ok: string; onOk: (v: Values) => void | Promise<void>; onClose: () => void;
}) {
  const [v, setV] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} width={420}>
      <div className="grid2">
        {fields.map((f) =>
          f.kind === "number" ? (
            <NumField key={f.key} label={f.label} unit={f.unit} value={v[f.key] as number} min={f.min} max={f.max} step={f.step} digits={f.digits ?? 2} onChange={(x) => setV({ ...v, [f.key]: x })} />
          ) : f.kind === "check" ? (
            <label key={f.key} className="check">
              <input type="checkbox" checked={v[f.key] as boolean} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} />
              {f.label}
            </label>
          ) : (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <select value={v[f.key] as string} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                {f.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          ),
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onOk(v);
            setBusy(false);
            onClose();
          }}
        >
          {busy ? t("Calcul…") : ok}
        </button>
      </div>
    </Modal>
  );
}

export function ToolDialog({ name, onClose }: { name: DialogName; onClose: () => void }) {
  switch (name) {
    case "fillet":
      return (
        <ParamDialog title={t("Congés et chanfreins")} onClose={onClose} ok={t("Appliquer")} initial={{ radius: 2, kind: "fillet" }}
          fields={[
            { key: "radius", label: t("Rayon / recul"), kind: "number", unit: "mm", min: 0.01, max: 1000, step: 0.5 },
            { key: "kind", label: t("Type"), kind: "choice", options: [["fillet", t("Congé (arrondi)")], ["chamfer", t("Chanfrein")]] },
          ]}
          hint={t("Appliqué aux nœuds sélectionnés en mode Nœuds, sinon à tous les angles des formes sélectionnées.")}
          onOk={(v) => filletSelection(v.radius as number, v.kind === "chamfer")} />
      );
    case "join":
      return (
        <ParamDialog title={t("Relier les tracés")} onClose={onClose} ok={t("Relier")} initial={{ tol: 0.1 }}
          fields={[{ key: "tol", label: t("Tolérance"), kind: "number", unit: "mm", min: 0.001, max: 10, step: 0.05, digits: 3 }]}
          hint={t("Relie les extrémités proches et ferme les tracés qui bouclent (utile après un import DXF).")}
          onOk={(v) => autoJoinSelection(v.tol as number)} />
      );
    case "simplify":
      return (
        <ParamDialog title={t("Simplifier les formes")} onClose={onClose} ok={t("Simplifier")} initial={{ tol: 0.05 }}
          fields={[{ key: "tol", label: t("Écart maximal"), kind: "number", unit: "mm", min: 0.001, max: 5, step: 0.01, digits: 3 }]}
          hint={t("Retire les points superflus (tracés importés, vectorisations). Les courbes deviennent des segments.")}
          onOk={(v) => simplifySelection(v.tol as number)} />
      );
    case "nest":
      return (
        <ParamDialog title={t("Imbrication")} onClose={onClose} ok={t("Imbriquer")} initial={{ gap: 2, margin: 5, rotate: true, lockInner: true, multipage: false }}
          fields={[
            { key: "gap", label: t("Espacement"), kind: "number", unit: "mm", min: 0, max: 100, step: 0.5 },
            { key: "margin", label: t("Marge au bord"), kind: "number", unit: "mm", min: 0, max: 200, step: 1 },
            { key: "rotate", label: t("Autoriser la rotation de 90°"), kind: "check" },
            { key: "lockInner", label: t("Garder les formes intérieures avec leur forme englobante"), kind: "check" },
            { key: "multipage", label: t("Placer le surplus sur de nouvelles pages"), kind: "check" },
          ]}
          hint={t("Range les formes sélectionnées (les groupes restent ensemble) sur le plateau, par boîtes englobantes.")}
          onOk={(v) => nestSelection(v.gap as number, v.rotate as boolean, v.margin as number, v.lockInner as boolean, v.multipage as boolean)} />
      );
    case "outline":
      return (
        <ParamDialog title={t("Générer un contour")} onClose={onClose} ok={t("Générer")} initial={{ distance: 2, join: "round" }}
          fields={[
            { key: "distance", label: t("Distance"), kind: "number", unit: "mm", min: 0, max: 500 },
            { key: "join", label: t("Angles"), kind: "choice", options: [["round", t("Arrondis")], ["miter", t("Vifs")], ["square", t("Chanfreinés")]] },
          ]}
          hint={t("Crée un contour sans trous autour de la sélection (les images suivent leurs pixels non blancs), par exemple pour découper autour d'un autocollant.")}
          onOk={(v) => void generateOutline(v.distance as number, v.join as JoinKind)} />
      );
    case "alongPath":
      return (
        <ParamDialog title={t("Copier le long d'un chemin")} onClose={onClose} ok={t("Copier")} initial={{ count: 10, rotate: true, spacing: 0, textStep: 0 }}
          fields={[
            { key: "count", label: t("Nombre de copies"), kind: "number", min: 1, max: 1000, digits: 0 },
            { key: "spacing", label: t("Espacement entre les copies (0 = selon le nombre)"), kind: "number", unit: "mm", min: 0, max: 10000 },
            { key: "rotate", label: t("Suivre la tangente"), kind: "check" },
            { key: "textStep", label: t("Incrément du texte variable"), kind: "number", min: -1000, max: 1000, digits: 0 },
          ]}
          hint={t("Sélectionnez les formes à copier, puis le chemin en dernier (Maj+clic).")}
          onOk={(v) => copyAlongPath(v.count as number, v.rotate as boolean, v.spacing as number, v.textStep as number)} />
      );
    case "bitmap":
      return (
        <ParamDialog title={t("Convertir en image")} onClose={onClose} ok={t("Convertir")} initial={{ dpi: 254, keep: false }}
          fields={[
            { key: "dpi", label: t("Résolution"), kind: "number", unit: "DPI", min: 25, max: 1270, digits: 0 },
            { key: "keep", label: t("Conserver les originaux"), kind: "check" },
          ]}
          hint={t("Les formes des calques Remplissage sont pleines, celles des calques Ligne en contour fin.")}
          onOk={(v) => convertToBitmap(v.dpi as number, v.keep as boolean)} />
      );
  }
  return null;
}
