import { useEffect, useRef, useState } from "react";
import { addImage, chooseFiles, exportText, freeLayer, notify, primitiveCurve, sendGcode } from "../actions";
import { flattenBez } from "../bezier";
import { translate } from "../geometry";
import { detectDots, fitHomography, fitK1, indexGrid } from "../lenscal";
import { api } from "../backend";
import { captureOverlay, getCamera, homography, setCamera, undistort, useCamera, type CameraCalibration } from "../camera";
import { layerParams, machineParams } from "../job";
import { DEFAULT_CUT, uid, type Pt, type Shape } from "../model";
import { commit, getState, withLayer } from "../store";
import { Modal } from "./Menu";
import { NumField } from "./NumField";
import { t, tk } from "../i18n";

/** Mire d'alignement : 4 croix à 15 % des bords, ou 9 (grille 3 × 3, ligne par ligne). */
export function defaultTargets(count: 4 | 9 = 4, w = getState().machine.bedWidth, h = getState().machine.bedHeight): Pt[] {
  if (count === 9) {
    const xs = [0.15, 0.5, 0.85], ys = [0.15, 0.5, 0.85];
    return ys.flatMap((y) => xs.map((x): Pt => [w * x, h * y]));
  }
  return [[w * 0.15, h * 0.15], [w * 0.85, h * 0.15], [w * 0.85, h * 0.85], [w * 0.15, h * 0.85]];
}

async function engraveTargets(targets: Pt[], power: number, speed: number) {
  const c = 5; // demi-branche des croix (mm)
  const paths = targets.flatMap(([x, y]) => [
    { points: [[x - c, y], [x + c, y]] as Pt[], closed: false },
    { points: [[x, y - c], [x, y + c]] as Pt[], closed: false },
  ]);
  const st = getState();
  const job = { machine: machineParams(st.machine), layers: [{ ...layerParams({ ...DEFAULT_CUT, name: "Mire", power, speed }), paths, images: [] }] };
  const result = await api.generateGcode(job);
  await sendGcode(result.gcode);
}

/** Mire de calibration de l'objectif : grille de points pleins, centrée sur le plateau, sur un calque Remplissage. */
function addDotGrid(cols: number, rows: number, pitch: number, dia: number) {
  const st = getState();
  const layerId = freeLayer(st.project, st.currentLayer, new Set());
  const { bedWidth, bedHeight } = st.machine;
  const x0 = bedWidth / 2 - ((cols - 1) * pitch) / 2, y0 = bedHeight / 2 - ((rows - 1) * pitch) / 2;
  const primitive = { type: "ellipse" as const, w: dia, h: dia };
  const curves = [primitiveCurve(primitive)];
  const groupId = uid();
  const shapes: Shape[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      shapes.push({ id: uid(), kind: "vector", name: t("Mire de calibration"), layerId, groupId, matrix: translate(x0 + i * pitch - dia / 2, y0 + j * pitch - dia / 2), curves, paths: flattenBez(curves, 0.02), primitive });
    }
  }
  commit((p) => {
    const q = withLayer({ ...p, shapes: [...p.shapes, ...shapes] }, layerId);
    return { ...q, layers: q.layers.map((l) => (l.id === layerId ? { ...l, mode: "fill" as const } : l)) };
  }, { selection: shapes.map((s) => s.id) });
}

/** Image courante de la vidéo en niveaux de gris. */
function grabGray(v: HTMLVideoElement): { gray: Uint8Array; w: number; h: number } {
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(v, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const gray = new Uint8Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++) gray[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
  return { gray, w: c.width, h: c.height };
}

/** Réglages de l'image proposés par la caméra (selon ce que le pilote accepte). */
const CONTROLS: [string, string][] = [
  ["brightness", tk("Luminosité")], ["contrast", tk("Contraste")], ["saturation", tk("Saturation")], ["sharpness", tk("Netteté")],
  ["exposureTime", tk("Exposition")], ["colorTemperature", tk("Balance des blancs")], ["focusDistance", tk("Mise au point")], ["zoom", tk("Zoom")],
];

function CameraControls({ video }: { video: React.RefObject<HTMLVideoElement | null> }) {
  const [, refresh] = useState(0);
  const track = (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
  const caps = (track?.getCapabilities?.() ?? {}) as Record<string, { min: number; max: number; step?: number } | string[] | undefined>;
  const settings = (track?.getSettings?.() ?? {}) as Record<string, number | string>;
  const available = CONTROLS.filter(([k]) => { const c = caps[k]; return c && !Array.isArray(c) && c.max > c.min; });
  if (!track) return null;
  const apply = async (k: string, v: number) => {
    // Les réglages manuels demandent souvent de quitter le mode automatique.
    const manual: Record<string, string> = { exposureTime: "exposureMode", colorTemperature: "whiteBalanceMode", focusDistance: "focusMode" };
    const c: Record<string, number | string> = { [k]: v };
    if (manual[k]) c[manual[k]] = "manual";
    try {
      await track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
    } catch {
      // réglage refusé par le pilote
    }
    refresh((n) => n + 1);
  };
  return (
    <details>
      <summary>{t("Réglages de l'image de la caméra")}</summary>
      {!available.length && <p className="hint">{t("Cette caméra ne propose aucun réglage dans cette fenêtre.")}</p>}
      {available.map(([k, label]) => {
        const c = caps[k] as { min: number; max: number; step?: number };
        const v = Number(settings[k] ?? c.min);
        return (
          <label key={k} className="field">
            <span>{t(label)} : {Math.round(v * 100) / 100}</span>
            <input type="range" min={c.min} max={c.max} step={c.step || (c.max - c.min) / 100} value={v} onChange={(e) => void apply(k, Number(e.target.value))} />
          </label>
        );
      })}
    </details>
  );
}

/** Calibration de la caméra en fichier (pour la sauvegarder ou la copier sur un autre ordinateur). */
function exportCalibration() {
  const cal = getCamera().calibration;
  if (cal) exportText(JSON.stringify({ format: "lumiere-camera", version: 1, calibration: cal }, null, 2), t("camera.json"));
}

async function importCalibration() {
  const [file] = await chooseFiles(["json"], t("Calibration de caméra"));
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()) as { format?: string; calibration?: CameraCalibration };
    if (data.format !== "lumiere-camera" || !data.calibration?.toBed) throw new Error(t("Fichier de calibration invalide"));
    setCamera({ calibration: data.calibration });
    notify(t("Caméra calibrée"));
  } catch (e) {
    notify(e instanceof Error ? e.message : String(e));
  }
}

export function CameraDialog({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const calibration = useCamera((s) => s.calibration);
  const overlay = useCamera((s) => s.overlay);
  const opacity = useCamera((s) => s.opacity);
  const visible = useCamera((s) => s.visible);
  const [deviceId, setDeviceId] = useState(calibration?.deviceId ?? "");
  const [count, setCount] = useState<4 | 9>(4);
  const [targets, setTargets] = useState<Pt[]>(() => defaultTargets(4));
  const [clicks, setClicks] = useState<Pt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [power, setPower] = useState(20);
  const [speed, setSpeed] = useState(1500);
  const [k1, setK1] = useState(calibration?.k1 ?? 0);
  const [grid, setGrid] = useState({ cols: 9, rows: 6, pitch: 20, dia: 8 });
  const [captures, setCaptures] = useState<{ grid: Pt[]; image: Pt[] }[]>([]);
  const [dots, setDots] = useState<Pt[]>([]);

  const capture = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const { gray, w, h } = grabGray(v);
    const found = detectDots(gray, w, h);
    setDots(found);
    const set = indexGrid(found, grid.cols, grid.rows);
    if (!set) return notify(t("Grille non reconnue ({n} points trouvés sur {total})", { n: found.length, total: grid.cols * grid.rows }));
    setCaptures([...captures, set]);
  };
  const computeLens = () => {
    const v = video.current;
    if (!v?.videoWidth || !captures.length) return;
    const r = fitK1(captures, v.videoWidth, v.videoHeight);
    setK1(Math.round(r.k1 * 1000) / 1000);
    notify(t("Correction de l'objectif : {k} (écart {before} % → {after} %) ; refaites les 4 repères puis enregistrez la calibration", {
      k: r.k1.toFixed(3), before: (r.before * 100).toFixed(2), after: (r.after * 100).toFixed(2),
    }));
  };

  // Ouverture du flux vidéo du périphérique choisi.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("Caméra indisponible dans cette fenêtre"));
        stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) video.current.srcObject = stream;
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        setDevices(list);
        if (!deviceId) setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = video.current;
    if (!v || !v.videoWidth || clicks.length >= targets.length) return;
    const r = v.getBoundingClientRect();
    setClicks([...clicks, [((e.clientX - r.left) / r.width) * v.videoWidth, ((e.clientY - r.top) / r.height) * v.videoHeight]]);
  };

  const saveCalibration = () => {
    const v = video.current!;
    try {
      // Les clics sont faits sur l'image déformée : on les corrige avant de calculer l'homographie.
      const straight = clicks.map((p) => undistort(p, k1, v.videoWidth, v.videoHeight));
      // 4 repères : homographie exacte ; 9 : moindres carrés (erreurs de clic moyennées).
      const toBed = targets.length === 4 ? homography(straight, targets) : fitHomography(straight, targets);
      setCamera({ calibration: { deviceId, toBed, width: v.videoWidth, height: v.videoHeight, k1 } });
      notify(t("Caméra calibrée"));
      update();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  };

  const update = () => {
    const v = video.current;
    const { bedWidth, bedHeight } = getState().machine;
    if (v) captureOverlay(v, bedWidth, bedHeight);
  };

  return (
    <Modal title={t("Caméra")} onClose={onClose} width={760}>
      {error && <p className="hint warn-text">{error}</p>}
      <div className="row">
        <label className="field">
          <span>{t("Caméra")}</span>
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Caméra ${i + 1}`}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t("Opacité de l'incrustation : {pct} %", { pct: Math.round(opacity * 100) })}</span>
          <input type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setCamera({ opacity: Number(e.target.value) })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={visible} onChange={(e) => setCamera({ visible: e.target.checked })} />
          {t("Afficher")}
        </label>
      </div>
      <div className="camera-wrap">
      <div className="camera-view" onClick={onClick}>
        <video ref={video} autoPlay playsInline muted />
        {clicks.map((p, i) => {
          const v = video.current;
          if (!v?.videoWidth) return null;
          return <span key={i} className="camera-mark" style={{ left: `${(p[0] / v.videoWidth) * 100}%`, top: `${(p[1] / v.videoHeight) * 100}%` }}>{i + 1}</span>;
        })}
        {video.current?.videoWidth ? dots.map((p, i) => (
          <span key={`d${i}`} className="camera-dot" style={{ left: `${(p[0] / video.current!.videoWidth) * 100}%`, top: `${(p[1] / video.current!.videoHeight) * 100}%` }} />
        )) : null}
      </div>
      </div>
      <CameraControls video={video} />
      <div className="row">
        <button disabled={!calibration} onClick={exportCalibration}>{t("Exporter la calibration…")}</button>
        <button onClick={() => void importCalibration()}>{t("Importer une calibration…")}</button>
      </div>
      <fieldset>
        <legend>{t("Alignement de la caméra")}</legend>
        <div className="segmented-row">
          {([4, 9] as const).map((n) => (
            <button key={n} className={count === n ? "active" : ""} onClick={() => { setCount(n); setTargets(defaultTargets(n)); setClicks([]); }}>
              {t("{n} repères", { n })}
            </button>
          ))}
        </div>
        <ol className="steps">
          <li>
            {t("Gravez la mire sur un carton posé à plat (ou utilisez 4 points connus du plateau).")}
            <div className="row">
              <NumField label={t("Puissance")} unit="%" value={power} min={1} max={100} width={44} onChange={setPower} />
              <NumField label={t("Vitesse")} unit="mm/min" value={speed} min={10} max={20000} digits={0} width={56} onChange={setSpeed} />
              <button onClick={() => engraveTargets(targets, power, speed)}>{t("Graver la mire")}</button>
            </div>
          </li>
          <li>
            {count === 4
              ? t("Cliquez les croix dans l'image, dans l'ordre : haut gauche, haut droite, bas droite, bas gauche.")
              : t("Cliquez les 9 croix dans l'image, ligne par ligne depuis le haut, de gauche à droite.")}
            <div className="grid2">
              {targets.map((t, i) => (
                <div key={i} className="row">
                  <span className="mono">{i + 1}{clicks[i] ? " ✓" : ""}</span>
                  <NumField label="X" value={t[0]} width={52} min={0} max={5000} onChange={(x) => setTargets(targets.map((q, j) => (j === i ? [x, q[1]] : q)))} />
                  <NumField label="Y" value={t[1]} width={52} min={0} max={5000} onChange={(y) => setTargets(targets.map((q, j) => (j === i ? [q[0], y] : q)))} />
                </div>
              ))}
            </div>
          </li>
        </ol>
        <label className="field">
          <span>{t("Correction de l'objectif : {k} (négatif pour un « fisheye »)", { k: k1.toFixed(3) })}</span>
          <input type="range" min={-0.6} max={0.3} step={0.005} value={k1} onChange={(e) => setK1(Number(e.target.value))} />
        </label>
        <p className="hint">{t("Ajustez jusqu'à ce que les bords droits du plateau apparaissent droits dans l'image redressée, puis réenregistrez la calibration.")}</p>
      </fieldset>
      <fieldset>
        <legend>{t("Calibration de l'objectif (assistant)")}</legend>
        <ol className="steps">
          <li>
            {t("Gravez ou imprimez une grille de points pleins et posez-la à plat sous la caméra.")}
            <div className="row">
              <NumField label={t("Colonnes")} value={grid.cols} min={3} max={30} digits={0} width={40} onChange={(cols) => setGrid({ ...grid, cols })} />
              <NumField label={t("Rangées")} value={grid.rows} min={3} max={30} digits={0} width={40} onChange={(rows) => setGrid({ ...grid, rows })} />
              <NumField label={t("Pas")} unit="mm" value={grid.pitch} min={2} max={200} width={44} onChange={(pitch) => setGrid({ ...grid, pitch })} />
              <NumField label={t("Diamètre")} unit="mm" value={grid.dia} min={1} max={100} width={44} onChange={(dia) => setGrid({ ...grid, dia })} />
              <button onClick={() => addDotGrid(grid.cols, grid.rows, grid.pitch, Math.min(grid.dia, grid.pitch * 0.8))}>{t("Ajouter la mire au projet")}</button>
            </div>
          </li>
          <li>
            {t("Capturez la mire entière plusieurs fois, en la déplaçant (centre, coins) : les points de chaque capture sont numérotés automatiquement.")}
            <div className="row">
              <button onClick={capture}>{t("Capturer")}</button>
              <span className="hint">{t("Captures : {n}", { n: captures.length })}</span>
              <button onClick={() => { setCaptures([]); setDots([]); }} disabled={!captures.length}>{t("Effacer les captures")}</button>
            </div>
          </li>
          <li>
            <button className="primary" disabled={!captures.length} onClick={computeLens}>{t("Calculer la correction")}</button>
          </li>
        </ol>
      </fieldset>
      <div className="row end">
        <button onClick={() => setClicks(clicks.slice(0, -1))} disabled={!clicks.length}>{t("Annuler le dernier")}</button>
        <button onClick={() => setClicks([])} disabled={!clicks.length}>{t("Recommencer les clics")}</button>
        <button onClick={saveCalibration} disabled={clicks.length !== targets.length}>{t("Enregistrer la calibration")}</button>
        <span className="grow" />
        <button onClick={() => setCamera({ overlay: null })}>{t("Effacer l'image")}</button>
        <button disabled={!overlay} onClick={() => {
          // L'image redressée couvre tout le plateau : elle est ajoutée au projet, sélectionnée, prête à vectoriser.
          const { bedWidth, bedHeight } = getState().machine;
          addImage(overlay!.toDataURL("image/png"), bedWidth, bedHeight, t("Capture caméra"));
          onClose();
          window.dispatchEvent(new CustomEvent("lumiere:dialog", { detail: "trace" }));
        }} title={t("Ajoute la capture au projet et ouvre la vectorisation")}>{t("Capturer et vectoriser")}</button>
        <button className="primary" disabled={!calibration} onClick={update}>{t("Mettre à jour l'image")}</button>
        <button onClick={onClose}>{t("Fermer")}</button>
      </div>
    </Modal>
  );
}
