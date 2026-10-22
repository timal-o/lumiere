// Accès au cœur Rust (commandes et événements Tauri).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DitherMode, MachineSettings, Pt } from "./model";

export interface JobPolyline {
  points: Pt[];
  closed: boolean;
  tabs?: Pt[];
  group?: string;
}

export interface JobImage {
  x: number;
  y: number;
  width: number;
  height: number;
  pxWidth: number;
  pxHeight: number;
  gray: number[];
}

/** Optimisation du parcours, côté moteur (voir Optimization). */
export interface JobOptimize {
  reorder: boolean;
  reduceTravel: boolean;
  directionOrder: "left" | "right" | "top" | "bottom" | null;
  bestStart: boolean;
  corners: boolean;
  bestDirection: boolean;
  backlash: number;
}

export interface JobLayer {
  name: string;
  mode: "line" | "fill" | "image";
  speed: number;
  power: number;
  minPower: number;
  passes: number;
  interval: number;
  bidirectional: boolean;
  overscan: number;
  dither: DitherMode;
  airAssist: boolean;
  fillAngle: number;
  crossHatch: boolean;
  fillIndividually: boolean;
  tabCount: number;
  tabSize: number;
  perforate: boolean;
  perfOn: number;
  perfOff: number;
  zOffset: number;
  zStep: number;
  overcut: number;
  rampLength: number;
  rampMin: number;
  dotMode: boolean;
  dotTime: number;
  dotSpacing: number;
  direction: "any" | "cw" | "ccw";
  keepStart: boolean;
  innerFirst: boolean;
  halftoneCell: number;
  halftoneAngle: number;
  imageSlices: number;
  optimize?: JobOptimize;
  leadIn: number;
  leadOut: number;
  leadArc: boolean;
  leadInward: boolean;
  startPause: number;
  endPause: number;
  pausePower: number;
  constantPower: boolean;
  angleIncrement: number;
  fillGroups: boolean;
  rampOuter: boolean;
  floodFill: boolean;
  cleanupEvery: number;
  cleanupWhole: boolean;
  airCutOnly: boolean;
  tabSpacing: number;
  tabMin: number;
  tabMax: number;
  tabSkipInner: boolean;
  tabPower: number;
  dotWidth: number;
  paths: JobPolyline[];
  images: JobImage[];
}

export interface Job {
  machine: Omit<
    MachineSettings,
    "baud" | "jogSpeed" | "airOn" | "rotary" | "rotaryMmPerRotation" | "rotaryDiameter" | "firmware" | "connection" | "host" | "tcpPort"
  > & {
    airOn: string;
    airOff: string;
    /** Lettre de l'axe Y en sortie (« A » : rotatif sur l'axe A). */
    yLetter?: string;
  };
  layers: JobLayer[];
  /** Nombre d'exécutions successives (1 par défaut). */
  repeat?: number;
}

export interface GcodeResult {
  gcode: string;
  stats: {
    lines: number;
    estimatedSeconds: number;
    layers: { name: string; seconds: number }[];
    cutLength: number;
    travelLength: number;
    warnings: string[];
  };
}

export interface PortInfo {
  name: string;
  description: string;
  usb: boolean;
}

export interface GrblStatus {
  state: string;
  mpos: [number, number, number];
  wpos: [number, number, number];
  feed: number;
  spindle: number;
  /** Surcharges en % : vitesse, rapides, puissance. */
  overrides: [number, number, number];
}

export interface GrblProgress {
  total: number;
  acked: number;
  running: boolean;
  errors: number;
}

export type Target = { kind: "serial"; port: string; baud: number; dtr?: boolean } | { kind: "tcp"; host: string; port: number };

export type Realtime =
  | "status" | "hold" | "resume" | "reset" | "jogCancel"
  | "feedReset" | "feedPlus10" | "feedMinus10" | "feedPlus1" | "feedMinus1"
  | "powerReset" | "powerPlus10" | "powerMinus10" | "powerPlus1" | "powerMinus1";

/** Contrôleur trouvé par la recherche USB. */
export interface Probe {
  port: string;
  baud: number;
  firmware: "grbl" | "marlin" | "smoothie";
  banner: string;
  settings: [number, string][];
}

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api = {
  listPorts: () => invoke<PortInfo[]>("list_ports"),
  probePorts: () => invoke<Probe[]>("probe_ports"),
  connect: (target: Target, firmware: Exclude<MachineSettings["firmware"], "ruida">) => invoke<void>("connect", { target, firmware }),
  ruidaSend: (host: string, gcode: string, sMax: number) => invoke<number>("ruida_send", { host, gcode, sMax }),
  ruidaFile: (gcode: string, sMax: number) => invoke<ArrayBuffer>("ruida_file", { gcode, sMax }),
  disconnect: () => invoke<void>("disconnect"),
  sendLine: (line: string) => invoke<void>("send_line", { line }),
  realtime: (command: Realtime) => invoke<void>("realtime", { command }),
  startJob: (gcode: string) => invoke<number>("start_job", { gcode }),
  generateGcode: (job: Job) => invoke<GcodeResult>("generate_gcode", { job }),
  writeTextFile: (path: string, contents: string) => invoke<void>("write_text_file", { path, contents }),
};

export function onGrbl(handlers: {
  line?: (l: string) => void;
  status?: (s: GrblStatus) => void;
  progress?: (p: GrblProgress) => void;
  disconnected?: (reason: string) => void;
}): () => void {
  if (!isTauri()) return () => {};
  const subs: Promise<UnlistenFn>[] = [];
  if (handlers.line) subs.push(listen<string>("grbl-line", (e) => handlers.line!(e.payload)));
  if (handlers.status) subs.push(listen<GrblStatus>("grbl-status", (e) => handlers.status!(e.payload)));
  if (handlers.progress) subs.push(listen<GrblProgress>("grbl-progress", (e) => handlers.progress!(e.payload)));
  if (handlers.disconnected) subs.push(listen<string>("grbl-disconnected", (e) => handlers.disconnected!(e.payload)));
  return () => subs.forEach((p) => p.then((un) => un()));
}
