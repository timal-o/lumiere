// État de la connexion laser et actions associées.

import { useSyncExternalStore } from "react";
import { api, isTauri, onGrbl, type GrblProgress, type GrblStatus, type PortInfo, type Realtime, type Target } from "./backend";
import { bedToMachine, type Box } from "./geometry";
import { explain, type CustomCodes } from "./grblcodes";
import type { MachineSettings } from "./model";
import { t, translateMessage } from "./i18n";

export interface LaserState {
  ports: PortInfo[];
  /** Afficher aussi les ports non USB (Bluetooth, etc.). */
  allPorts: boolean;
  port: string;
  connected: boolean;
  status: GrblStatus | null;
  progress: GrblProgress | null;
  /** Dernière position machine connue (gardée après la déconnexion). */
  lastPos?: [number, number];
  log: string[];
}

let jobStarted = Date.now();

let state: LaserState = { ports: [], allPorts: false, port: "", connected: false, status: null, progress: null, log: [] };
const listeners = new Set<() => void>();

export const getLaserState = () => state;

function set(patch: Partial<LaserState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useLaser<T>(select: (s: LaserState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => select(state),
  );
}

/** Aide → Journal de débogage : horodate le journal et y ajoute chaque commande envoyée. */
let debug = false;
export const isDebugLog = () => debug;
export function setDebugLog(on: boolean) {
  debug = on;
  log(on ? t("Journal de débogage activé") : t("Journal de débogage désactivé"));
}

function sendLine(line: string) {
  if (debug) log(`→ ${line}`);
  return api.sendLine(line);
}

export const clearLog = () => set({ log: [] });

export function log(line: string) {
  if (debug) line = `${new Date().toISOString().slice(11, 23)} ${line}`;
  const next = state.log.length > 500 ? state.log.slice(-400) : state.log.slice();
  next.push(line);
  set({ log: next });
}

// ---------------------------------------------------------- Journal des travaux

export interface JobLogEntry {
  /** Début (horodatage ISO), durée (s), lignes envoyées / totales, erreurs. */
  start: string;
  seconds: number;
  acked: number;
  total: number;
  errors: number;
  name: string;
}

const JOB_LOG = "lumiere.jobLog";
const COUNTER = "lumiere.jobCounter";

/** Compteur de travaux terminés et arrêt à une valeur (0 = sans), comme « Count / Stop At » de LightBurn. */
export function jobCounter(): { count: number; stopAt: number } {
  try {
    return { count: 0, stopAt: 0, ...JSON.parse(localStorage.getItem(COUNTER) ?? "{}") };
  } catch {
    return { count: 0, stopAt: 0 };
  }
}

export function setJobCounter(patch: Partial<{ count: number; stopAt: number }>) {
  try {
    localStorage.setItem(COUNTER, JSON.stringify({ ...jobCounter(), ...patch }));
  } catch {
    // stockage indisponible
  }
  set({});
}
let jobName = "";
export const setJobName = (name: string) => (jobName = name);

export function jobLog(): JobLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(JOB_LOG) ?? "[]") as JobLogEntry[];
  } catch {
    return [];
  }
}

function recordJob(entry: JobLogEntry) {
  try {
    localStorage.setItem(JOB_LOG, JSON.stringify([...jobLog(), entry].slice(-1000)));
  } catch {
    // stockage indisponible : le journal n'est pas conservé
  }
}

/** Journal au format CSV (séparateur virgule). */
export function jobLogCsv(entries = jobLog()): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ["start,name,seconds,lines_sent,lines_total,errors,completed",
    ...entries.map((e) => [e.start, q(e.name), Math.round(e.seconds), e.acked, e.total, e.errors, e.acked >= e.total ? 1 : 0].join(","))].join("\n") + "\n";
}

/** Durée écoulée et restante estimée (s) du travail en cours, d'après les lignes acquittées. */
export function jobTiming(now = Date.now()): { elapsed: number; remaining: number | null } | null {
  const p = state.progress;
  if (!p?.running) return null;
  const elapsed = (now - jobStarted) / 1000;
  return { elapsed, remaining: p.acked > 0 && p.total > 0 ? (elapsed * (p.total - p.acked)) / p.acked : null };
}

let customCodes: CustomCodes = {};
/** Codes d'erreur personnalisés de la machine connectée. */
export const setCustomCodes = (c: CustomCodes | undefined) => (customCodes = c ?? {});

onGrbl({
  line: (l) => log(translateMessage(explain(l, customCodes))),
  status: (status) => set({ status, lastPos: [status.mpos[0], status.mpos[1]] }),
  progress: (progress) => {
    const was = state.progress;
    set({ progress });
    // Fin de travail : message et durée réelle.
    if (was?.running && !progress.running && progress.total > 0 && progress.acked >= progress.total) {
      const seconds = (Date.now() - jobStarted) / 1000;
      const duration = `${Math.floor(seconds / 60)} min ${String(Math.round(seconds % 60)).padStart(2, "0")} s`;
      const errors = progress.errors ? ` (${t("{n} erreur(s)", { n: progress.errors })})` : "";
      log(`✓ ${t("Travail terminé en {duration}", { duration })}${errors}`);
      window.dispatchEvent(new CustomEvent("lumiere:toast", { detail: t("Travail terminé") }));
    }
    if (was?.running && !progress.running && progress.total > 0 && progress.acked >= progress.total) setJobCounter({ count: jobCounter().count + 1 });
    // Fin (terminée ou interrompue) : entrée du journal des travaux.
    if (was?.running && !progress.running && progress.total > 0) {
      recordJob({ start: new Date(jobStarted).toISOString(), seconds: (Date.now() - jobStarted) / 1000, acked: progress.acked, total: progress.total, errors: progress.errors, name: jobName });
    }
    if (progress.running && !was?.running) jobStarted = Date.now();
  },
  disconnected: (reason) => {
    log(t("Déconnecté : {reason}", { reason: translateMessage(reason) }));
    set({ connected: false, status: null, progress: null });
  },
});

async function run(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (e) {
    log(`⚠ ${translateMessage(String(e))}`);
  }
}

export const laser = {
  async refreshPorts() {
    if (!isTauri()) return log(t("⚠ Connexion série disponible uniquement dans l'application Lumière."));
    await run(async () => {
      const ports = await api.listPorts();
      const shown = ports.filter((p) => p.usb || state.allPorts);
      const port = shown.some((p) => p.name === state.port) ? state.port : shown[0]?.name ?? "";
      set({ ports, port });
    });
  },
  selectPort: (port: string) => set({ port }),
  showAllPorts(all: boolean) {
    set({ allPorts: all });
    laser.refreshPorts();
  },
  async connect(m: MachineSettings) {
    if (m.firmware === "ruida") return log(t("Ruida : pas de connexion permanente, le travail est envoyé par le réseau au démarrage."));
    const target: Target =
      m.connection === "tcp" ? { kind: "tcp", host: m.host, port: m.tcpPort } : { kind: "serial", port: state.port, baud: m.baud, dtr: m.dtr };
    if (target.kind === "serial" && !target.port) return log(t("⚠ Aucun port sélectionné"));
    const where = target.kind === "tcp" ? `${target.host}:${target.port}` : t("{port} ({baud} bauds)", { port: target.port, baud: target.baud });
    log(t("Connexion à {where}…", { where }));
    await run(async () => {
      await api.connect(target, m.firmware as Exclude<MachineSettings["firmware"], "ruida">);
      set({ connected: true, progress: null });
      log(t("Connecté à {where} — {firmware}", { where, firmware: m.firmware.toUpperCase() }));
      setCustomCodes(m.customCodes);
      if (m.fetchSettings && m.firmware === "grbl") await sendLine("$$");
      if (m.autoHome) await sendLine("$H");
    });
  },
  async disconnect() {
    await run(api.disconnect);
    set({ connected: false, status: null, progress: null });
    log(t("Déconnecté"));
  },
  send: (line: string) => run(() => sendLine(line)),
  home: () => run(() => sendLine("$H")),
  unlock: () => run(() => sendLine("$X")),
  goOrigin: () => run(() => sendLine("G90 G0 X0 Y0")),
  /** Place l'origine de travail (G54) à la position actuelle de la tête. */
  setUserOrigin: () => run(() => sendLine("G10 L20 P1 X0 Y0")),
  /** Rétablit l'origine de travail sur l'origine machine. */
  clearUserOrigin: () => run(() => sendLine("G10 L2 P1 X0 Y0")),
  /** Jog relatif : $J= (GRBL 1.1), ou G91 G0 pour les contrôleurs qui ne le connaissent pas. */
  jog: (dx: number, dy: number, feed: number, useJ = true) =>
    run(async () => {
      if (useJ) return sendLine(`$J=G91 G21 X${dx.toFixed(3)} Y${dy.toFixed(3)} F${Math.round(feed)}`);
      await sendLine(`G91 G0 X${dx.toFixed(3)} Y${dy.toFixed(3)}`);
      await sendLine("G90");
    }),
  jogZ: (dz: number, feed: number) => run(() => sendLine(`$J=G91 G21 Z${dz.toFixed(3)} F${Math.round(feed)}`)),
  jogCancel: () => run(() => api.realtime("jogCancel")),
  /** Déplacement en coordonnées de travail (champ « Aller à », positions enregistrées). */
  moveTo: (x: number, y: number, z?: number) => run(async () => {
    await sendLine(`G90 G0 X${x.toFixed(3)} Y${y.toFixed(3)}`);
    if (z != null) await sendLine(`G90 G0 Z${z.toFixed(3)}`);
  }),
  /**
   * Tir d'essai : laser allumé à `percent` % tant que le bouton est maintenu (M3, qui reste
   * allumé à l'arrêt même en mode laser GRBL), puis M5.
   */
  fire: (percent: number, sMax: number) => run(() => sendLine(`M3 S${Math.round((Math.min(100, Math.max(0, percent)) / 100) * sMax)}`)),
  fireOff: () => run(() => sendLine("M5")),
  pause: () => run(() => api.realtime("hold")),
  resume: () => run(() => api.realtime("resume")),
  async stop() {
    await run(() => api.realtime("reset"));
    log(t("Arrêt d'urgence logiciel (reset GRBL). Faites $X pour déverrouiller si besoin."));
  },
  async start(gcode: string) {
    await run(async () => {
      const n = await api.startJob(gcode);
      log(t("Travail lancé : {n} lignes", { n }));
    });
  },
  /** Parcourt le contour de la boîte, laser éteint. */
  frame(box: Box, m: MachineSettings, power = 0) {
    return laser.frameOutline([[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]], m, power);
  },
  /**
   * Parcourt un contour fermé (coordonnées plateau). `power` > 0 : laser allumé à ce
   * pourcentage (cadrage visible au point rouge absent), à la vitesse de jog.
   */
  frameOutline(pts: [number, number][], m: MachineSettings, power = 0) {
    return laser.frameOutlines([pts], m, power);
  },
  /** Parcourt plusieurs contours, `repeat` fois (cadrage continu : jusqu'à « Arrêter »). */
  async frameOutlines(outlines: [number, number][][], m: MachineSettings, power = 0, repeat = 1) {
    const f = (v: number) => v.toFixed(3);
    const xy = (p: [number, number]) => {
      const [x, y] = bedToMachine(p, m.origin, m.bedWidth, m.bedHeight);
      return `X${f(x)} Y${f(y)}`;
    };
    const lines = ["G90 G21", "M5"];
    for (let k = 0; k < repeat; k++) {
      for (const pts of outlines.filter((o) => o.length >= 2)) {
        lines.push(`G0 ${xy(pts[0])}`);
        if (power > 0) {
          lines.push(`M3 S${Math.round((power / 100) * m.sMax)}`);
          for (const p of [...pts.slice(1), pts[0]]) lines.push(`G1 ${xy(p)} F${Math.round(m.jogSpeed)}`);
          lines.push("M5");
        } else for (const p of [...pts.slice(1), pts[0]]) lines.push(`G0 ${xy(p)}`);
      }
    }
    await run(() => api.startJob(lines.join("\n")));
  },
  override: (command: Realtime) => run(() => api.realtime(command)),
};
