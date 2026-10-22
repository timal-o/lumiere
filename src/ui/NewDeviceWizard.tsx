// Assistant « Nouvel appareil » : recherche du contrôleur sur les ports USB (ou réglage
// manuel), puis zone de travail, origine et puissance, comme dans LightBurn.

import { useState } from "react";
import { api, isTauri, type Probe } from "../backend";
import { t, tk } from "../i18n";
import { laser } from "../laser";
import { DEFAULT_MACHINE, uid, type MachineSettings, type Origin } from "../model";
import { getState, setState } from "../store";
import { Modal } from "./Menu";
import { NumField } from "./NumField";

const ORIGINS: [Origin, string][] = [["rearLeft", tk("Arrière gauche")], ["rearRight", tk("Arrière droite")], ["frontLeft", tk("Avant gauche")], ["frontRight", tk("Avant droite")]];

/** Réglages machine déduits d'une détection (zone $130/$131, $30, accélération, vitesse). */
export function machineFromProbe(p: Probe, base: MachineSettings = DEFAULT_MACHINE): MachineSettings {
  const v = new Map(p.settings);
  const num = (k: number, d: number) => (v.has(k) && Number.isFinite(Number(v.get(k))) && Number(v.get(k)) > 0 ? Number(v.get(k)) : d);
  return {
    ...base, firmware: p.firmware, connection: "serial", baud: p.baud,
    bedWidth: num(130, base.bedWidth), bedHeight: num(131, base.bedHeight), sMax: num(30, base.sMax),
    acceleration: v.has(120) || v.has(121) ? Math.min(num(120, Infinity), num(121, Infinity)) : base.acceleration,
  };
}

export function NewDeviceWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [found, setFound] = useState<Probe[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState("");
  const [name, setName] = useState(t("Mon laser"));
  const [m, setM] = useState<MachineSettings>({ ...DEFAULT_MACHINE });
  const set = (patch: Partial<MachineSettings>) => setM({ ...m, ...patch });
  const search = async () => {
    setSearching(true);
    setError(null);
    try {
      const list = await api.probePorts();
      setFound(list);
      if (list[0]) choose(list[0]);
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  };
  const choose = (p: Probe) => {
    setPort(p.port);
    setM(machineFromProbe(p, m));
  };
  const finish = () => {
    const device = { id: uid(), name: name.trim() || t("Mon laser"), machine: m };
    setState({ devices: [...getState().devices, device], deviceId: device.id, machine: m });
    if (port) laser.selectPort(port);
    onClose();
  };
  const originLabel = t(ORIGINS.find((o) => o[0] === m.origin)![1]);
  return (
    <Modal title={t("Assistant Nouvel appareil")} onClose={onClose} width={520}>
      {step === 0 && (
        <>
          <p>{t("Comment voulez-vous vous connecter ?")}</p>
          <div className="row">
            <button className="primary" disabled={!isTauri() || searching} onClick={search}>{searching ? t("Recherche sur les ports USB…") : t("Rechercher par USB")}</button>
            <button onClick={() => { set({ connection: "tcp" }); setFound([]); }}>{t("Réseau (adresse IP)")}</button>
          </div>
          {error && <p className="hint warn-text">{error}</p>}
          {found && found.length === 0 && m.connection !== "tcp" && <p className="hint">{t("Aucun appareil trouvé — vérifiez le câble USB, ou choisissez le contrôleur à la main.")}</p>}
          {found && found.length > 0 && (
            <div className="library">
              {found.map((p) => (
                <label key={p.port} className="check">
                  <input type="radio" checked={port === p.port} onChange={() => choose(p)} />
                  <span><strong>{p.firmware.toUpperCase()}</strong> · {p.port} · {p.baud} {t("bauds")}<br /><span className="hint">{p.banner}</span></span>
                </label>
              ))}
            </div>
          )}
          <div className="grid2">
            <label className="field">
              <span>{t("Contrôleur")}</span>
              <select value={m.firmware} onChange={(e) => set({ firmware: e.target.value as MachineSettings["firmware"] })}>
                <option value="grbl">{t("GRBL 1.1 / FluidNC / grblHAL")}</option>
                <option value="smoothie">{t("Smoothieware")}</option>
                <option value="marlin">{t("Marlin (laser)")}</option>
                <option value="ruida">{t("Ruida (expérimental)")}</option>
              </select>
            </label>
            {m.connection === "tcp" || m.firmware === "ruida" ? (
              <label className="field">
                <span>{t("Adresse IP / nom")}</span>
                <input type="text" value={m.host} onChange={(e) => set({ host: e.target.value, connection: "tcp" })} />
              </label>
            ) : (
              <NumField label={t("Vitesse (bauds)")} value={m.baud} min={1200} max={2000000} digits={0} onChange={(baud) => set({ baud })} />
            )}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <label className="field">
            <span>{t("Comment voulez-vous l'appeler ?")}</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <p>{t("Quelles sont les dimensions de la zone de travail ?")}</p>
          <div className="grid2">
            <NumField label={t("Longueur de l'axe X")} unit="mm" value={m.bedWidth} min={10} max={5000} digits={1} onChange={(bedWidth) => set({ bedWidth })} />
            <NumField label={t("Longueur de l'axe Y")} unit="mm" value={m.bedHeight} min={10} max={5000} digits={1} onChange={(bedHeight) => set({ bedHeight })} />
            <NumField label={t("S max ($30)")} value={m.sMax} min={1} max={100000} digits={0} onChange={(sMax) => set({ sMax })} />
          </div>
          <p>{t("Où se trouve l'origine (X0, Y0) de votre laser ?")}</p>
          <div className="origin-grid">
            {ORIGINS.map(([o, label]) => (
              <button key={o} className={m.origin === o ? "active" : ""} onClick={() => set({ origin: o })}>{t(label)}</button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={!!m.autoHome} onChange={(e) => set({ autoHome: e.target.checked })} />
            {t("Prise d'origine automatique du laser à la connexion ?")}
          </label>
        </>
      )}
      {step === 2 && (
        <>
          <p>{t("C'est fini. Voici le résumé :")}</p>
          <ul>
            <li><strong>{name}</strong> — {m.firmware.toUpperCase()}{port ? ` · ${port}` : m.connection === "tcp" ? ` · ${m.host}` : ""}</li>
            <li>{t("Zone de travail : {w} × {h} mm", { w: m.bedWidth, h: m.bedHeight })}</li>
            <li>{t("Origine : {o}", { o: originLabel })}</li>
            <li>{t("S max : {s}", { s: m.sMax })}</li>
          </ul>
          <p className="hint">{t("Cliquez sur « Terminer » pour ajouter l'appareil. Les autres réglages sont dans Réglages machine.")}</p>
        </>
      )}
      <div className="row end">
        <button onClick={onClose}>{t("Annuler")}</button>
        {step > 0 && <button onClick={() => setStep(step - 1)}>{t("Précédent")}</button>}
        {step < 2 ? <button className="primary" onClick={() => setStep(step + 1)}>{t("Suivant")}</button> : <button className="primary" onClick={finish}>{t("Terminer")}</button>}
      </div>
    </Modal>
  );
}
