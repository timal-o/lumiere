// Menu Outils laser : déplacements (jog), étapes d'Imprimer et couper, déformation conique.

import { useSyncExternalStore } from "react";
import { headPosition, notify, selectionBox, similarity, vectorFromWorld } from "./actions";
import { boxCenter, shapeBox, worldPaths } from "./geometry";
import { t } from "./i18n";
import { getLaserState, laser } from "./laser";
import { hasPaths, type Mat, type Pt, type Shape } from "./model";
import { densify } from "./shapeops";
import { commit, getState, selectedShapes, setState } from "./store";

// -------------------------------------------------------------------- Jog

let jogStep = (() => {
  try {
    return Number(localStorage.getItem("lumiere.jogStep")) || 10;
  } catch {
    return 10;
  }
})();

export const getJogStep = () => jogStep;

export function setJogStep(step: number) {
  jogStep = step;
  try {
    localStorage.setItem("lumiere.jogStep", String(step));
  } catch {
    // stockage indisponible
  }
}

/**
 * Déplace la tête d'un pas dans une direction de l'écran : « haut » éloigne du bord avant
 * quand l'origine machine y est.
 */
/**
 * Déplacement continu (bouton maintenu) : un long $J vers le bord du plateau, annulé au
 * relâchement (GRBL « jog cancel »). Nécessite les déplacements $J.
 */
export function jogContinuousStart(dx: number, dy: number) {
  const m = getState().machine;
  const sy = m.origin === "frontLeft" || m.origin === "frontRight" ? 1 : -1;
  const sx = m.origin === "frontRight" || m.origin === "rearRight" ? -1 : 1;
  // Jusqu'au bord de la zone de travail (au-delà, GRBL refuse le déplacement si les limites logicielles sont actives).
  const pos = getLaserState().status?.wpos;
  const mx = dx * sx, my = dy * sy;
  const reach = (v: number, size: number, d: number) => (pos ? (d > 0 ? size - v : v) : size);
  const ax = mx ? Math.max(0, reach(pos?.[0] ?? 0, m.bedWidth, mx) - 0.5) : 0;
  const ay = my ? Math.max(0, reach(pos?.[1] ?? 0, m.bedHeight, my) - 0.5) : 0;
  if (ax + ay <= 0) return;
  return laser.jog(Math.sign(mx) * ax, Math.sign(my) * ay, m.jogSpeed, true);
}

export const jogContinuousStop = () => laser.override("jogCancel");

export function jogScreen(dx: number, dy: number) {
  const m = getState().machine;
  const sy = m.origin === "frontLeft" || m.origin === "frontRight" ? 1 : -1;
  const sx = m.origin === "frontRight" || m.origin === "rearRight" ? -1 : 1;
  return laser.jog(dx * jogStep * sx, dy * jogStep * sy, m.jogSpeed, m.jogWithJ !== false);
}

// ------------------------------------------------------- Imprimer et couper

interface PrintCut {
  /** Repères dans le dessin (coordonnées plateau). */
  targets: Pt[] | null;
  /** Positions de la tête enregistrées sur les repères de la pièce. */
  measured: (Pt | null)[];
}

let pc: PrintCut = { targets: null, measured: [null, null] };
const listeners = new Set<() => void>();

function setPc(patch: Partial<PrintCut>) {
  pc = { ...pc, ...patch };
  listeners.forEach((l) => l());
}

export function usePrintCut(): PrintCut {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pc,
  );
}

/** Deux repères : centres des deux formes sélectionnées, ou coins opposés d'une seule. */
export function takeTargets(): boolean {
  const sel = selectedShapes();
  if (sel.length === 2) setPc({ targets: sel.map((s) => boxCenter(shapeBox(s)!)), measured: [null, null] });
  else {
    const b = selectionBox();
    if (!b) {
      notify(t("Sélectionnez deux repères (ou une forme dont on prendra deux coins)"));
      return false;
    }
    setPc({ targets: [[b.x, b.y], [b.x + b.w, b.y + b.h]], measured: [null, null] });
  }
  return true;
}

/** Enregistre la position de la tête sur le repère i (les repères viennent de la sélection s'il n'y en a pas). */
export function recordTarget(i: number) {
  if (!pc.targets && !takeTargets()) return;
  const p = headPosition();
  if (!p) return notify(t("Position du laser inconnue"));
  setPc({ measured: pc.measured.map((m, j) => (j === i ? p : m)) });
  notify(t("Repère {n} enregistré", { n: i + 1 }));
}

/** Transformation dessin → pièce ; sans mise à l'échelle, seules la rotation et la position comptent. */
export function printCutMatrix(noScaling = false): Mat | null {
  const [a, b] = pc.targets ?? [];
  const [a2, b2] = pc.measured;
  if (!a || !b || !a2 || !b2) return null;
  const m = similarity(a, b, a2, b2);
  if (!noScaling) return m;
  const k = Math.hypot(m[0], m[1]) || 1;
  const c = m[0] / k, s = m[1] / k;
  // Le milieu des repères du dessin va au milieu des repères mesurés.
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], mid2: Pt = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
  return [c, s, -s, c, mid2[0] - (c * mid[0] - s * mid[1]), mid2[1] - (s * mid[0] + c * mid[1])];
}

export function alignToTargets(noScaling = false) {
  const m = printCutMatrix(noScaling);
  if (!m) return notify(t("Enregistrez d'abord les deux repères"));
  setState({ alignment: m });
  notify(t("Alignement appliqué"));
}

export function resetPrintCut() {
  setPc({ targets: null, measured: [null, null] });
  setState({ alignment: null });
  notify(t("Imprimer et couper réinitialisé"));
}

// ------------------------------------------------------ Déformation conique

/**
 * Déformation conique, pour graver un objet tronconique (gobelet) sur un rotatif : la
 * largeur est multipliée par un facteur qui varie linéairement du haut (diamètre du haut /
 * diamètre de référence) au bas de la sélection. Le diamètre de référence est le plus grand.
 */
export function taperWarp(topDiameter: number, bottomDiameter: number) {
  const shapes = selectedShapes().filter(hasPaths);
  const box = selectionBox();
  if (!shapes.length || !box) return notify(t("Sélectionnez des formes vectorielles"));
  const ref = Math.max(topDiameter, bottomDiameter);
  if (!(ref > 0)) return;
  const [cx] = boxCenter(box);
  const factor = (y: number) => {
    const u = box.h > 0 ? (y - box.y) / box.h : 0;
    return (topDiameter + (bottomDiameter - topDiameter) * u) / ref;
  };
  const replaced = new Map<string, Shape>();
  for (const s of shapes) {
    // Points intermédiaires pour que les droites suivent la courbure.
    const paths = worldPaths(s).map((p) => ({ ...p, pts: densify(p.pts, p.closed, 1).map(([x, y]): Pt => [cx + (x - cx) * factor(y), y]) }));
    const v = vectorFromWorld(paths, s.layerId, s.name);
    if (v) replaced.set(s.id, { ...v, id: s.id, groupId: s.groupId });
  }
  commit((p) => ({ ...p, shapes: p.shapes.map((s) => replaced.get(s.id) ?? s) }));
}

// ------------------------------------------------------- Centre d'un cercle

/** Cercle passant par trois points (null s'ils sont alignés ou trop proches). */
export function circleThrough(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-6) return null;
  const sq = (p: Pt) => p[0] * p[0] + p[1] * p[1];
  const x = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
  const y = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
  return { c: [x, y], r: Math.hypot(a[0] - x, a[1] - y) };
}
