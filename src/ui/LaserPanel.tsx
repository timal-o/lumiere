import { useEffect, useRef, useState } from "react";
import { frameContour, frameHull, frameJob, moveLaserToSelection, startJob } from "../actions";
import { jobCounter, jobTiming, laser, setJobCounter, useLaser } from "../laser";
import { formatDuration } from "../toolpath";
import { getState, setState, useStore, type StartFrom } from "../store";
import { openDialog } from "./Dialogs";
import { NumField } from "./NumField";
import { SpeedField } from "./SpeedField";
import { t, tk } from "../i18n";
import { getJogStep, jogContinuousStart, jogContinuousStop, jogScreen, setJogStep } from "../lasertools";
import { deletePosition, savePosition, usePositions } from "../positions";

const STATE_LABEL: Record<string, string> = {
  Idle: tk("Prêt"),
  Run: tk("En cours"),
  Hold: tk("En pause"),
  Jog: tk("Déplacement"),
  Alarm: tk("Alarme"),
  Door: tk("Porte ouverte"),
  Check: tk("Vérification"),
  Home: tk("Origine"),
  Sleep: tk("Veille"),
};

function Jog() {
  // Pas commun avec Disposer → Déplacer le laser (gardé entre les sessions).
  const [step, setStepState] = useState(getJogStep);
  const setStep = (v: number) => (setJogStep(v), setStepState(v));
  const [continuous, setContinuous] = useState(false);
  const jogBtn = (dx: number, dy: number, label: string, title: string) => continuous
    ? <button onPointerDown={() => jogContinuousStart(dx, dy)} onPointerUp={jogContinuousStop} onPointerLeave={jogContinuousStop} title={title}>{label}</button>
    : <button onClick={() => jogScreen(dx, dy)} title={title}>{label}</button>;
  return (
    <div className="jog">
      <div className="pad">
        <span />
        {jogBtn(0, 1, "▲", t("Haut"))}
        <span />
        {jogBtn(-1, 0, "◀", t("Gauche"))}
        <button onClick={laser.goOrigin} title={t("Aller à l'origine (0, 0)")}>⌂</button>
        {jogBtn(1, 0, "▶", t("Droite"))}
        <span />
        {jogBtn(0, -1, "▼", t("Bas"))}
        <span />
      </div>
      <div className="jog-side">
        <label className="field">
          <span>{t("Pas")}</span>
          <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
            {[0.1, 1, 5, 10, 50, 100].map((v) => (
              <option key={v} value={v}>{v} mm</option>
            ))}
          </select>
        </label>
        <label className="check" title={t("Le laser avance tant que le bouton est maintenu (GRBL, déplacements $J)")}>
          <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} />
          {t("Déplacement continu")}
        </label>
        <button onClick={laser.home}>{t("Origine machine ($H)")}</button>
        <button onClick={() => moveLaserToSelection()} title={t("Point d'ancrage choisi dans « Départ depuis »")}>{t("Aller à la sélection")}</button>
        <button onClick={laser.unlock}>{t("Déverrouiller ($X)")}</button>
      </div>
    </div>
  );
}

/** Déplacements précis, tir d'essai, positions enregistrées, position de fin (fenêtre Déplacer de LightBurn). */
function MoveExtras() {
  const machine = useStore((s) => s.machine);
  const status = useLaser((s) => s.status);
  const positions = usePositions();
  const [target, setTarget] = useState<[number, number]>([0, 0]);
  const [zStep, setZStep] = useState(1);
  const [firePower, setFirePower] = useState(1);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState("");
  const firing = useRef(false);
  const here = (): [number, number] | null => (status ? [status.wpos[0], status.wpos[1]] : null);
  const stopFire = () => {
    if (firing.current) {
      firing.current = false;
      laser.fireOff();
    }
  };
  useEffect(() => {
    window.addEventListener("blur", stopFire);
    return () => (window.removeEventListener("blur", stopFire), stopFire());
  }, []);
  const chosenPos = positions.find((p) => p.name === chosen);
  return (
    <div className="move-extras">
      {machine.zAxis && (
        <div className="row">
          <span className="num-label">Z</span>
          <button onClick={() => laser.jogZ(zStep, machine.jogSpeed)} title={t("Monter Z")}>Z+</button>
          <button onClick={() => laser.jogZ(-zStep, machine.jogSpeed)} title={t("Descendre Z")}>Z−</button>
          <NumField unit="mm" value={zStep} min={0.01} max={50} width={48} onChange={setZStep} />
          {machine.autofocusGcode?.trim() && (
            <button onClick={async () => {
              for (const line of machine.autofocusGcode!.split("\n").map((l) => l.trim()).filter(Boolean)) await laser.send(line);
            }} title={t("Lance le cycle de mise au point automatique défini dans les réglages machine")}>{t("Mise au point auto")}</button>
          )}
        </div>
      )}
      <div className="row">
        <NumField label="X" unit="mm" value={target[0]} min={-10000} max={10000} width={56} onChange={(x) => setTarget([x, target[1]])} />
        <NumField label="Y" unit="mm" value={target[1]} min={-10000} max={10000} width={56} onChange={(y) => setTarget([target[0], y])} />
        <button onClick={() => laser.moveTo(...target)} title={t("Déplacer vers la position")}>{t("Aller")}</button>
        <button disabled={!status} onClick={() => here() && setTarget(here()!)} title={t("Lire la position actuelle de la tête")}>{t("Obtenir la position")}</button>
      </div>
      <div className="row">
        {machine.fireButton && (<>
        <button
          className="fire"
          title={t("Tir d'essai : le laser reste allumé tant que le bouton est maintenu")}
          onPointerDown={() => {
            firing.current = true;
            laser.fire(firePower, machine.sMax);
          }}
          onPointerUp={stopFire}
          onPointerLeave={stopFire}
        >{t("Tir")}</button>
        <NumField unit="%" value={firePower} min={0} max={100} digits={1} width={44} onChange={setFirePower} />
        </>)}
        <span className="grow" />
        <button onClick={() => setState({ machine: { ...getState().machine, finish: status ? [status.mpos[0], status.mpos[1]] : null } })}
          disabled={!status} title={t("La tête revient à cette position à la fin du travail (sinon à l'origine)")}>{t("Définir la position de fin")}</button>
        {machine.finish && <button onClick={() => setState({ machine: { ...getState().machine, finish: null } })} title={t("Revenir à l'origine en fin de travail")}>×</button>}
      </div>
      <div className="row">
        <select value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label={t("Positions enregistrées")}>
          <option value="">{t("Positions enregistrées")}</option>
          {positions.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.x.toFixed(1)}, {p.y.toFixed(1)}{p.z != null ? `, Z ${p.z.toFixed(1)}` : ""})</option>)}
        </select>
        <button disabled={!chosenPos} onClick={() => chosenPos && laser.moveTo(chosenPos.x, chosenPos.y, machine.zAxis ? chosenPos.z : undefined)}>{t("Aller")}</button>
        <button disabled={!chosenPos} onClick={() => (deletePosition(chosen), setChosen(""))} title={t("Supprimer")}>−</button>
      </div>
      <div className="row">
        <input type="text" className="grow" placeholder={t("Nom de la position")} value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!status || !name.trim()} onClick={() => {
          const p = here();
          if (p) savePosition({ name: name.trim(), x: p[0], y: p[1], ...(machine.zAxis && status ? { z: status.wpos[2] } : {}) });
          setName("");
        }}>{t("Enregistrer ici")}</button>
      </div>
    </div>
  );
}

/** Surcharges temps réel GRBL : vitesse et puissance, pendant le travail. */
function Overrides({ overrides }: { overrides: [number, number, number] }) {
  const row = (label: string, value: number, prefix: "feed" | "power") => (
    <div className="row override">
      <span className="grow">{label} <strong>{Math.round(value)} %</strong></span>
      <button onClick={() => laser.override(`${prefix}Minus10`)}>−10</button>
      <button onClick={() => laser.override(`${prefix}Minus1`)}>−1</button>
      <button onClick={() => laser.override(`${prefix}Reset`)}>100</button>
      <button onClick={() => laser.override(`${prefix}Plus1`)}>+1</button>
      <button onClick={() => laser.override(`${prefix}Plus10`)}>+10</button>
    </div>
  );
  return (
    <div>
      {row(t("Vitesse"), overrides[0], "feed")}
      {row(t("Puissance"), overrides[2], "power")}
    </div>
  );
}

function Macros() {
  const macros = useStore((s) => s.macros);
  const connected = useLaser((s) => s.connected);
  const run = async (gcode: string) => {
    for (const line of gcode.split("\n").map((l) => l.trim()).filter(Boolean)) await laser.send(line);
  };
  return (
    <div className="macros">
      {macros.map((m, i) => (
        <button key={i} disabled={!connected} onClick={() => run(m.gcode)} title={m.gcode}>{m.name}</button>
      ))}
      <button onClick={() => openDialog("macros")} title={t("Modifier les macros")}>…</button>
    </div>
  );
}

/** Historique des commandes tapées (↑ / ↓), commun aux consoles. */
const history: string[] = [];

export function Console({ tall = false }: { tall?: boolean }) {
  const lines = useLaser((s) => s.log);
  const [cmd, setCmd] = useState("");
  const [pos, setPos] = useState(-1);
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [lines]);
  return (
    <div className={`console ${tall ? "tall" : ""}`}>
      <pre ref={ref}>{lines.join("\n")}</pre>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cmd.trim()) {
            laser.send(cmd);
            if (history[history.length - 1] !== cmd) history.push(cmd);
          }
          setCmd("");
          setPos(-1);
        }}
      >
        <input type="text" placeholder={t("Commande G-code ou $…")} value={cmd} onChange={(e) => setCmd(e.target.value)} spellCheck={false}
          onKeyDown={(e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const next = e.key === "ArrowUp" ? (pos < 0 ? history.length - 1 : Math.max(0, pos - 1)) : pos < 0 ? -1 : pos + 1;
            if (next < 0 || next >= history.length) { setPos(-1); setCmd(""); return; }
            setPos(next);
            setCmd(history[next]);
          }} />
      </form>
    </div>
  );
}

const START_LABEL: Record<StartFrom, string> = {
  absolute: tk("Coordonnées absolues"),
  current: tk("Position actuelle"),
  user: tk("Origine utilisateur"),
};

function JobOriginControls({ connected }: { connected: boolean }) {
  const o = useStore((s) => s.jobOrigin);
  const set = (patch: Partial<typeof o>) => setState({ jobOrigin: { ...o, ...patch } });
  return (
    <div className="job-origin">
      <div className="field grow">
        <span>{t("Départ depuis")}</span>
        <select value={o.startFrom} onChange={(e) => set({ startFrom: e.target.value as StartFrom })}>
          {(Object.keys(START_LABEL) as StartFrom[]).map((k) => <option key={k} value={k}>{t(START_LABEL[k])}</option>)}
        </select>
        {o.startFrom === "user" && (
          <div className="row">
            <button disabled={!connected} onClick={laser.setUserOrigin} title="G10 L20 P1 X0 Y0">{t("Définir l'origine ici")}</button>
            <button disabled={!connected} onClick={laser.clearUserOrigin}>{t("Effacer")}</button>
          </div>
        )}
      </div>
      <div className="anchor-grid" role="radiogroup" aria-label={t("Point d'ancrage du travail")} aria-disabled={o.startFrom === "absolute"}>
        {Array.from({ length: 9 }, (_, i) => (
          <button
            key={i}
            disabled={o.startFrom === "absolute"}
            className={o.anchor === i ? "active" : ""}
            onClick={() => set({ anchor: i })}
            role="radio"
            aria-checked={o.anchor === i}
            title={t("Point du travail placé sur l'origine choisie")}
          />
        ))}
      </div>
    </div>
  );
}

export function LaserPanel() {
  const { ports: allPorts, allPorts: showAll, port, connected, status, progress } = useLaser((s) => s);
  const ports = allPorts.filter((p) => p.usb || showAll);
  const machine = useStore((s) => s.machine);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [frameMode, setFrameMode] = useState<"box" | "hull" | "contour">("box");
  const [frameTool, setFrameTool] = useState(false);
  const [frameInk, setFrameInk] = useState(false);
  const [frameEach, setFrameEach] = useState(false);
  const [frameLoop, setFrameLoop] = useState(false);
  const [framePower, setFramePower] = useState(0);
  useEffect(() => {
    laser.refreshPorts();
  }, []);

  const running = !!progress?.running;
  const repeat = useStore((s) => s.jobRepeat);
  const ruida = machine.firmware === "ruida";
  const paused = status?.state === "Hold";
  const pct = progress && progress.total ? Math.round((progress.acked / progress.total) * 100) : 0;
  // Statistiques en temps réel : rafraîchies chaque seconde pendant le travail.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const timing = running ? jobTiming() : null;
  useLaser((s) => s.progress);
  const counter = jobCounter();

  return (
    <section className="panel">
      <h2>{t("Laser")}</h2>
      <div className="segmented-row">
        {(["serial", "tcp"] as const).map((c) => (
          <button key={c} disabled={connected} className={machine.connection === c ? "active" : ""} onClick={() => setState({ machine: { ...getState().machine, connection: c } })}>
            {c === "serial" ? "USB" : t("Réseau")}
          </button>
        ))}
      </div>
      <div className="row">
        {machine.connection === "serial" ? (
          <>
            <select value={port} onChange={(e) => laser.selectPort(e.target.value)} disabled={connected} className="grow">
              {ports.length === 0 && <option value="">{t("Aucun port USB")}</option>}
              {ports.map((p) => (
                <option key={p.name} value={p.name}>{p.name.replace("/dev/", "")} {p.description && `— ${p.description}`}</option>
              ))}
            </select>
            <button onClick={laser.refreshPorts} disabled={connected} title={t("Actualiser")}>↻</button>
          </>
        ) : (
          <>
            <input type="text" className="grow" value={machine.host} disabled={connected} placeholder={t("Adresse IP ou nom")} spellCheck={false}
              onChange={(e) => setState({ machine: { ...getState().machine, host: e.target.value } })} />
            <NumField value={machine.tcpPort} min={1} max={65535} digits={0} width={56} disabled={connected}
              onChange={(tcpPort) => setState({ machine: { ...getState().machine, tcpPort } })} />
          </>
        )}
        {connected ? (
          <button onClick={laser.disconnect}>{t("Déconnecter")}</button>
        ) : (
          <button className="primary" onClick={() => laser.connect(machine)}>{t("Connecter")}</button>
        )}
      </div>

      {machine.connection === "serial" && <label className="check hint">
        <input type="checkbox" checked={showAll} disabled={connected} onChange={(e) => laser.showAllPorts(e.target.checked)} />
        {t("Afficher tous les ports ({n})", { n: allPorts.length })}
      </label>}

      <div className="status">
        <span className={`badge ${status?.state ?? "off"}`}>{status ? (STATE_LABEL[status.state] ? t(STATE_LABEL[status.state]) : status.state) : connected ? "…" : t("Déconnecté")}</span>
        {status && (
          <span className="mono">
            X {status.wpos[0].toFixed(2)} · Y {status.wpos[1].toFixed(2)}
            {status.feed > 0 && ` · ${Math.round(status.feed)} mm/min`}
          </span>
        )}
      </div>

      {connected && <Jog />}
      {connected && <MoveExtras />}

      {ruida && <p className="hint warn-text">{t("Ruida {host} (expérimental) : « Démarrer » envoie le travail par le réseau ; jog et cadrage se font sur le panneau de la machine.", { host: machine.host })}</p>}
      <JobOriginControls connected={connected} />

      <div className="row job">
        <button disabled={!connected || running}
          onClick={() => ({ box: frameJob, hull: frameHull, contour: frameContour })[frameMode](selectionOnly, framePower, { individually: frameEach, continuous: frameLoop, toolLayersOnly: frameTool, imageInk: frameInk })}
          title={t("Parcourt le cadre du travail avec la tête laser")}>{t("Cadrer")}</button>
        <button className="primary" disabled={(!connected && !ruida) || running} onClick={() => startJob(selectionOnly)}>{t("Démarrer")}</button>
        <NumField label={t("Répéter")} unit="×" value={repeat} min={1} max={999} digits={0} width={40} onChange={(jobRepeat) => setState({ jobRepeat })} />
        <button disabled={!connected || !running} onClick={paused ? laser.resume : laser.pause}>{paused ? t("Reprendre") : t("Pause")}</button>
        <button className="danger" disabled={!connected} onClick={laser.stop}>{t("Arrêter")}</button>
      </div>
      <div className="row" title={t("Nombre de travaux terminés ; « Arrêt à » empêche de démarrer une fois ce nombre atteint (0 = sans limite)")}>
        <span>{t("Compteur : {n}", { n: counter.count })}</span>
        <button className="small" onClick={() => setJobCounter({ count: 0 })}>{t("Remettre à zéro")}</button>
        <NumField label={t("Arrêt à")} value={counter.stopAt} min={0} max={100000} digits={0} width={48} onChange={(stopAt) => setJobCounter({ stopAt })} />
      </div>
      <label className="check">
        <input type="checkbox" checked={selectionOnly} onChange={(e) => setSelectionOnly(e.target.checked)} />
        {t("Sélection uniquement")}
      </label>
      <label className="field">
        <span>{t("Cadrage")}</span>
        <select value={frameMode} onChange={(e) => setFrameMode(e.target.value as typeof frameMode)}>
          <option value="box">{t("Boîte englobante")}</option>
          <option value="hull">{t("Enveloppe (élastique)")}</option>
          <option value="contour">{t("Contour des formes")}</option>
        </select>
      </label>
      <div className="row">
        <label className="check" title={t("Cadre seulement les formes des calques outils T1 et T2")}>
          <input type="checkbox" checked={frameTool} onChange={(e) => setFrameTool(e.target.checked)} />
          {t("Calques outils seulement")}
        </label>
        <label className="check" title={t("Les images sont cadrées sur leur partie non blanche")}>
          <input type="checkbox" checked={frameInk} onChange={(e) => setFrameInk(e.target.checked)} />
          {t("Images : partie non blanche")}
        </label>
      </div>
      <div className="row">
        <label className="check" title={t("Cadre chaque forme (ou groupe) au lieu du travail entier")}>
          <input type="checkbox" checked={frameEach} onChange={(e) => setFrameEach(e.target.checked)} />
          {t("Cadrer chaque forme")}
        </label>
        <label className="check" title={t("Recommence le cadrage jusqu'à « Arrêter »")}>
          <input type="checkbox" checked={frameLoop} onChange={(e) => setFrameLoop(e.target.checked)} />
          {t("Cadrage continu")}
        </label>
      </div>
      <NumField label={t("Cadrer laser allumé à")} unit="%" value={framePower} min={0} max={20} digits={1} width={44} onChange={setFramePower} />
      <button onClick={() => openDialog("optimization")}>{t("Paramètres d'optimisation…")}</button>
      {running && status && <Overrides overrides={status.overrides} />}
      {progress && progress.total > 0 && (
        <div className="progress" title={t("{done} / {total} lignes", { done: progress.acked, total: progress.total })}>
          <div style={{ width: `${pct}%` }} />
          <span>{running ? `${pct} %${timing ? ` · ${formatDuration(timing.elapsed)}${timing.remaining != null ? ` · ${t("reste ~{d}", { d: formatDuration(timing.remaining) })}` : ""}` : ""}` : progress.acked >= progress.total ? t("Terminé") : t("Interrompu")}{progress.errors ? ` · ${t("{n} erreur(s)", { n: progress.errors })}` : ""}</span>
        </div>
      )}
      <Macros />
      <Console />
      <div className="row">
        <SpeedField label={t("Vitesse de jog")} value={machine.jogSpeed} min={10} max={20000}
          onChange={(jogSpeed) => setState({ machine: { ...getState().machine, jogSpeed } })} />
      </div>
    </section>
  );
}

