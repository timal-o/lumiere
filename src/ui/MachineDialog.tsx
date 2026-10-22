import { useState } from "react";
import { uid, type MachineSettings, type Origin } from "../model";
import { getState, setState, type Device } from "../store";
import { NumField } from "./NumField";
import { openDialog } from "./Dialogs";
import { SpeedField } from "./SpeedField";
import { t, tk } from "../i18n";

const ORIGINS: { id: Origin; label: string }[] = [
  { id: "rearLeft", label: tk("Arrière gauche") },
  { id: "rearRight", label: tk("Arrière droite") },
  { id: "frontLeft", label: tk("Avant gauche") },
  { id: "frontRight", label: tk("Avant droite") },
];

/** Codes personnalisés ↔ texte « error:N = description ». */
export function codesText(c: MachineSettings["customCodes"]): string {
  return [...Object.entries(c?.errors ?? {}).map(([k, v]) => `error:${k} = ${v}`), ...Object.entries(c?.alarms ?? {}).map(([k, v]) => `ALARM:${k} = ${v}`)].join("\n");
}

export function parseCodes(text: string): MachineSettings["customCodes"] {
  const errors: Record<string, string> = {}, alarms: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s*(error|alarm)\s*:\s*(\d+)\s*=\s*(.+?)\s*$/i.exec(line);
    if (m) (m[1].toLowerCase() === "error" ? errors : alarms)[m[2]] = m[3];
  }
  return { errors, alarms };
}

export function MachineDialog({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<Device[]>(getState().devices);
  const [deviceId, setDeviceId] = useState(getState().deviceId);
  const device = devices.find((d) => d.id === deviceId) ?? devices[0];
  const m = device.machine;
  const set = (patch: Partial<MachineSettings>) =>
    setDevices(devices.map((d) => (d.id === device.id ? { ...d, machine: { ...d.machine, ...patch } } : d)));
  const addDevice = (copy: boolean) => {
    const d: Device = { id: uid(), name: copy ? t("{name} (copie)", { name: device.name }) : t("Nouvelle machine"), machine: copy ? { ...m } : { ...getState().machine } };
    setDevices([...devices, d]);
    setDeviceId(d.id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-labelledby="machine-title">
        <h2 id="machine-title">{t("Réglages machine (GRBL)")}</h2>
        <div className="row">
          <label className="field">
            <span>{t("Machine")}</span>
            <select value={device.id} onChange={(e) => setDeviceId(e.target.value)}>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{t("Nom")}</span>
            <input type="text" value={device.name} onChange={(e) => setDevices(devices.map((d) => (d.id === device.id ? { ...d, name: e.target.value } : d)))} />
          </label>
        </div>
        <div className="row">
          <button onClick={() => { onClose(); openDialog("newDevice"); }} title={t("Rechercher le laser sur les ports USB et le configurer pas à pas")}>{t("Assistant…")}</button>
          <button onClick={() => addDevice(false)}>{t("Nouvelle")}</button>
          <button onClick={() => addDevice(true)}>{t("Dupliquer")}</button>
          <button
            disabled={devices.length < 2}
            onClick={() => {
              const rest = devices.filter((d) => d.id !== device.id);
              setDevices(rest);
              setDeviceId(rest[0].id);
            }}
          >
            {t("Supprimer")}
          </button>
        </div>
        <div className="grid2">
          <NumField label={t("Largeur du plateau")} unit="mm" value={m.bedWidth} min={10} max={5000} digits={1} onChange={(bedWidth) => set({ bedWidth })} />
          <NumField label={t("Profondeur du plateau")} unit="mm" value={m.bedHeight} min={10} max={5000} digits={1} onChange={(bedHeight) => set({ bedHeight })} />
          <NumField label={t("S max ($30)")} value={m.sMax} min={1} max={100000} digits={0} onChange={(sMax) => set({ sMax })} />
          <SpeedField label={t("Vitesse de déplacement")} value={m.travelSpeed} min={10} onChange={(travelSpeed) => set({ travelSpeed })} />
          <NumField label={t("Accélération ($120)")} unit="mm/s²" value={m.acceleration} min={0} max={100000} digits={0} onChange={(acceleration) => set({ acceleration })} />
        </div>
        <label className="field">
          <span>{t("Contrôleur")}</span>
          <select value={m.firmware} onChange={(e) => set({ firmware: e.target.value as MachineSettings["firmware"] })}>
            <option value="grbl">{t("GRBL 1.1 / FluidNC / grblHAL")}</option>
            <option value="smoothie">{t("Smoothieware")}</option>
            <option value="marlin">{t("Marlin (laser)")}</option>
            <option value="ruida">{t("Ruida — CO2, réseau (expérimental)")}</option>
          </select>
        </label>
        {m.firmware === "ruida" && (
          <div className="row">
            <label className="field">
              <span>{t("Adresse IP du contrôleur Ruida")}</span>
              <input type="text" value={m.host} onChange={(e) => set({ host: e.target.value })} spellCheck={false} />
            </label>
            <p className="hint warn-text">{t("Pilote expérimental, non validé sur machine : testez d'abord sans matériau, à faible puissance.")}</p>
          </div>
        )}
        <fieldset>
          <legend>{t("Origine machine")}</legend>
          <div className="origins">
            {ORIGINS.map((o) => (
              <label key={o.id} className="check">
                <input type="radio" name="origin" checked={m.origin === o.id} onChange={() => set({ origin: o.id })} />
                {t(o.label)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <label className="field">
            <span>{t("Mode laser")}</span>
            <select value={m.laserMode} onChange={(e) => set({ laserMode: e.target.value as MachineSettings["laserMode"] })}>
              <option value="dynamic">{t("M4 — puissance dynamique (recommandé)")}</option>
              <option value="constant">{t("M3 — puissance constante")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("Débit série")}</span>
            <select value={m.baud} onChange={(e) => set({ baud: Number(e.target.value) })}>
              {[9600, 19200, 38400, 57600, 115200, 230400, 250000].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <NumField label={t("Décalage de balayage")} unit="mm" value={m.scanOffset} min={-5} max={5} step={0.01} digits={3} onChange={(scanOffset) => set({ scanOffset })} />
          <label className="field">
            <span>{t("Assistance d'air")}</span>
            <select value={m.airOn} onChange={(e) => set({ airOn: e.target.value as MachineSettings["airOn"] })}>
              <option value="M8">{t("M8 (arrosage)")}</option>
              <option value="M7">{t("M7 (brouillard)")}</option>
            </select>
          </label>
        </div>
        <details>
          <summary>{t("Codes d'erreur et d'alarme personnalisés")}</summary>
          <p className="hint">{t("Une ligne par code : « error:12 = description » ou « ALARM:3 = description ». Ils remplacent les explications GRBL dans la console.")}</p>
          <textarea rows={4} className="mono" defaultValue={codesText(m.customCodes)} onBlur={(e) => set({ customCodes: parseCodes(e.target.value) })} />
        </details>
        <details>
          <summary>{t("Décalages de balayage selon la vitesse")}</summary>
          <p className="hint">{t("Le retard du laser dépend de la vitesse : mesurez le décalage à quelques vitesses, il est interpolé entre elles. Sans table, la valeur unique ci-dessus s'applique.")}</p>
          {(m.scanOffsets ?? []).map(([speed, off], i) => (
            <div className="row" key={i}>
              <SpeedField label={t("Vitesse")} value={speed} min={1} onChange={(v) => set({ scanOffsets: (m.scanOffsets ?? []).map((r, j): [number, number] => (j === i ? [v, r[1]] : r)) })} />
              <NumField label={t("Décalage")} unit="mm" value={off} min={-5} max={5} step={0.01} digits={3}
                onChange={(v) => set({ scanOffsets: (m.scanOffsets ?? []).map((r, j): [number, number] => (j === i ? [r[0], v] : r)) })} />
              <button onClick={() => set({ scanOffsets: (m.scanOffsets ?? []).filter((_, j) => j !== i) })} title={t("Retirer")}>−</button>
            </div>
          ))}
          <button onClick={() => set({ scanOffsets: [...(m.scanOffsets ?? []), [(m.scanOffsets?.at(-1)?.[0] ?? 3000) + 3000, m.scanOffset]] })}>{t("Ajouter une vitesse")}</button>
        </details>
        <p className="hint">{t("Si les bords des remplissages bidirectionnels sont dentelés, décalez les lignes retour (souvent 0,05–0,3 mm).")}</p>
        <fieldset>
          <legend>{t("Rotatif")}</legend>
          <label className="check">
            <input type="checkbox" checked={m.rotary} onChange={(e) => set({ rotary: e.target.checked })} />
            {t("Activer le rotatif")}
          </label>
          {m.rotary && (
            <>
              <div className="grid2">
                <label className="field">
                  <span>{t("Type de rotatif")}</span>
                  <select value={m.rotaryType ?? "chuck"} onChange={(e) => set({ rotaryType: e.target.value as "roller" | "chuck" })}>
                    <option value="roller">{t("À rouleaux")}</option>
                    <option value="chuck">{t("À mandrin")}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t("Axe du rotatif")}</span>
                  <select value={m.rotaryAxis ?? "Y"} onChange={(e) => set({ rotaryAxis: e.target.value as "Y" | "A" })}>
                    <option value="Y">{t("Axe Y (mm)")}</option>
                    <option value="A">{t("Axe A (degrés)")}</option>
                  </select>
                </label>
                {(m.rotaryAxis ?? "Y") === "Y" && (
                  <NumField label={t("mm par tour")} value={m.rotaryMmPerRotation} min={1} max={10000} digits={2} onChange={(rotaryMmPerRotation) => set({ rotaryMmPerRotation })} />
                )}
                {m.rotaryType === "roller" ? (
                  <NumField label={t("Diamètre des rouleaux")} unit="mm" value={m.rollerDiameter ?? 20} min={1} max={500} onChange={(rollerDiameter) => set({ rollerDiameter })} />
                ) : (
                  <NumField label={t("Diamètre de l'objet")} unit="mm" value={m.rotaryDiameter} min={1} max={1000} onChange={(rotaryDiameter) => set({ rotaryDiameter })} />
                )}
              </div>
              <label className="check">
                <input type="checkbox" checked={!!m.rotaryMirror} onChange={(e) => set({ rotaryMirror: e.target.checked })} />
                {t("Sortie en miroir")}
              </label>
            </>
          )}
          <p className="hint">{t("« mm par tour » : déplacement Y que le contrôleur effectue pour un tour (du rouleau ou du mandrin). Sur l'axe A, le contrôleur doit compter en degrés. Utilisez « Départ depuis : position actuelle ».")}</p>
        </fieldset>
        <div className="grid2">
          <label className="field">
            <span>{t("G-code de début")}</span>
            <textarea rows={3} value={m.startGcode} onChange={(e) => set({ startGcode: e.target.value })} spellCheck={false} />
          </label>
          <label className="field">
            <span>{t("G-code de fin")}</span>
            <textarea rows={3} value={m.endGcode} onChange={(e) => set({ endGcode: e.target.value })} spellCheck={false} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={m.zAxis} onChange={(e) => set({ zAxis: e.target.checked })} />
          {t("Axe Z motorisé (décalage et descente par passe)")}
        </label>
        <label className="check">
          <input type="checkbox" checked={m.returnToOrigin} onChange={(e) => set({ returnToOrigin: e.target.checked })} />
          {t("Revenir à l'origine en fin de travail")}
        </label>
        <fieldset>
          <legend>{t("Options du contrôleur")}</legend>
          <div className="grid2">
            {([
              ["autoHome", t("Origine machine automatique à la connexion")],
              ["jogWithJ", t("Jog avec $J (GRBL 1.1)"), true],
              ["emitSAlways", t("Répéter la valeur S sur chaque G1")],
              ["g0Overscan", t("Dépassements de balayage en G0")],
              ["boundsWarning", t("Avertir si le travail sort de la zone"), true],
              ["fireButton", t("Bouton de tir d'essai")],
            ] as [keyof MachineSettings, string, boolean?][]).map(([key, label, byDefault]) => (
              <label key={key} className="check">
                <input type="checkbox" checked={(m[key] as boolean | undefined) ?? !!byDefault} onChange={(e) => set({ [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          <NumField label={t("Échelle globale de vitesse")} unit="%" value={m.speedScale ?? 100} min={1} max={500} digits={0} onChange={(speedScale) => set({ speedScale })} />
          <NumField label={t("Attente avant le travail")} unit="s" value={m.startDelay ?? 0} min={0} max={600} digits={1} onChange={(startDelay) => set({ startDelay })} />
          {m.zAxis && (
            <div className="row">
              <label className="check">
                <input type="checkbox" checked={!!m.zReverse} onChange={(e) => set({ zReverse: e.target.checked })} />
                {t("Inverser le sens de l'axe Z")}
              </label>
              <label className="check">
                <input type="checkbox" checked={!!m.zRelative} onChange={(e) => set({ zRelative: e.target.checked })} />
                {t("Déplacements Z relatifs uniquement")}
              </label>
              <label className="field" title={t("Par exemple un palpage : G38.2 Z-40 F100, puis G92 Z0 et un dégagement")}>
                <span>{t("G-code de mise au point automatique")}</span>
                <textarea rows={2} className="mono" value={m.autofocusGcode ?? ""} onChange={(e) => set({ autofocusGcode: e.target.value })} />
              </label>
              <NumField label={t("Décalage de mise au point Z")} unit="mm" value={m.zFocusOffset ?? 0} min={-100} max={100} step={0.1} onChange={(zFocusOffset) => set({ zFocusOffset })} />
            </div>
          )}
          <div className="grid2">
            <NumField label={t("Jeu mécanique X")} unit="mm" value={m.backlashX ?? 0} min={0} max={5} step={0.01} digits={3} onChange={(backlashX) => set({ backlashX })} />
            <NumField label={t("Jeu mécanique Y")} unit="mm" value={m.backlashY ?? 0} min={0} max={5} step={0.01} digits={3} onChange={(backlashY) => set({ backlashY })} />
          </div>
          <div className="row">
            <label className="check" title={t("Pour les machines dont les axes X et Y sont inversés dans le contrôleur")}>
              <input type="checkbox" checked={!!m.swapXY} onChange={(e) => set({ swapXY: e.target.checked })} />
              {t("Échanger X et Y en sortie")}
            </label>
            {m.connection === "serial" && (
              <label className="check" title={t("Certaines cartes redémarrent quand le signal DTR change ; d'autres en ont besoin pour répondre")}>
                <input type="checkbox" checked={!!m.dtr} onChange={(e) => set({ dtr: e.target.checked })} />
                {t("Activer le signal DTR")}
              </label>
            )}
            {m.firmware === "grbl" && (
              <label className="check">
                <input type="checkbox" checked={!!m.fetchSettings} onChange={(e) => set({ fetchSettings: e.target.checked })} />
                {t("Lire les réglages à la connexion")}
              </label>
            )}
          </div>
          <div className="row">
            <label className="check" title={t("Décalage du pointeur rouge par rapport au laser : le cadrage laser éteint place le pointeur sur le cadre")}>
              <input type="checkbox" checked={!!m.pointerOffset} onChange={(e) => set({ pointerOffset: e.target.checked ? [0, 0] : null })} />
              {t("Pointeur laser décalé")}
            </label>
            {m.pointerOffset && (
              <>
                <NumField label="X" unit="mm" value={m.pointerOffset[0]} min={-200} max={200} width={52} onChange={(x) => set({ pointerOffset: [x, m.pointerOffset![1]] })} />
                <NumField label="Y" unit="mm" value={m.pointerOffset[1]} min={-200} max={200} width={52} onChange={(y) => set({ pointerOffset: [m.pointerOffset![0], y] })} />
              </>
            )}
          </div>
          <label className="field">
            <span>{t("Liste de vérification avant chaque travail (une ligne par point, vide = aucune)")}</span>
            <textarea rows={3} value={(m.checklist ?? []).join("\n")} spellCheck={false}
              onChange={(e) => set({ checklist: e.target.value.split("\n").some((l) => l.trim()) ? e.target.value.split("\n") : null })} />
          </label>
        </fieldset>
        <p className="hint">{t("Le mode laser de GRBL doit être actif ($32=1) pour que le laser s'éteigne pendant les déplacements.")}</p>
        <div className="row end">
          <button onClick={onClose}>{t("Annuler")}</button>
          <button
            className="primary"
            onClick={() => {
              setState({ devices, deviceId: device.id, machine: device.machine });
              onClose();
            }}
          >
            {t("Utiliser cette machine")}
          </button>
        </div>
      </div>
    </div>
  );
}
