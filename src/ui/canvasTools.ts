// Outils interactifs du plan de travail : rotation / échelle à deux points, déformation à
// 4 points (Sélection de la chaîne) et à 16 points. Le plan de travail leur délègue les
// clics, les déplacements, les touches et le dessin de leur repère.

import { curvesOf, editCurves, notify } from "../actions";
import { apply, mul, shapeBox, unionBoxes, worldPaths, type Box } from "../geometry";
import { t } from "../i18n";
import { hasPaths, type Pt, type VectorShape } from "../model";
import { filletNodes } from "../nodeedit";
import { applyWarp, twoPointMatrix, warpGrid, warpPaths } from "../shapeops";
import { getState, selectedShapes, setState, updateShapes, type Tool } from "../store";

export interface ToolContext {
  /** Magnétisme (⌥ le désactive). */
  snap: (p: Pt, alt: boolean) => Pt;
  /** Pixels par millimètre. */
  scale: number;
}

export interface CanvasTool {
  /** Appelé quand l'outil devient actif ; renvoie false s'il ne peut pas démarrer. */
  start(): boolean;
  down(p: Pt, e: { alt: boolean; shift: boolean }, c: ToolContext): void;
  move(p: Pt, e: { alt: boolean; shift: boolean }, c: ToolContext): void;
  up(): void;
  key(key: string): boolean;
  draw(ctx: CanvasRenderingContext2D, toScreen: (p: Pt) => Pt, colors: { accent: string; text: string }): void;
}

const done = () => setState({ tool: "select" });

function strokePaths(ctx: CanvasRenderingContext2D, toScreen: (p: Pt) => Pt, paths: { closed: boolean; pts: Pt[] }[]) {
  ctx.beginPath();
  for (const path of paths) {
    path.pts.forEach((p, i) => {
      const [x, y] = toScreen(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (path.closed) ctx.closePath();
  }
  ctx.stroke();
}

// ----------------------------------------------- Rotation / échelle à deux points

/**
 * 1er clic : centre de rotation ; 2e clic : point de référence ; 3e clic : nouvelle
 * position de la référence. Maj met aussi à l'échelle.
 */
function twoPoint(): CanvasTool {
  let pivot: Pt | null = null, from: Pt | null = null, to: Pt | null = null, scale = false;
  const matrix = () => (pivot && from && to ? twoPointMatrix(pivot, from, to, scale) : null);
  return {
    start() {
      pivot = from = to = null;
      if (!selectedShapes().length) {
        notify(t("Sélectionnez d'abord les formes à tourner"));
        return false;
      }
      notify(t("Cliquez le centre de rotation, puis le point de référence, puis sa nouvelle position (Maj : mettre aussi à l'échelle)"));
      return true;
    },
    down(p, e, c) {
      const q = c.snap(p, e.alt);
      if (!pivot) pivot = q;
      else if (!from) from = q;
      else {
        to = q;
        scale = e.shift;
        const m = matrix();
        if (m) {
          const ids = selectedShapes().filter((s) => !s.locked).map((s) => s.id);
          updateShapes(ids, (s) => ({ ...s, matrix: mul(m, s.matrix) }));
        }
        done();
      }
    },
    move(p, e, c) {
      to = c.snap(p, e.alt);
      scale = e.shift;
    },
    up() {},
    key(k) {
      if (k === "Escape") return done(), true;
      return false;
    },
    draw(ctx, toScreen, colors) {
      if (!pivot) return;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      const line = (a: Pt, b: Pt) => {
        ctx.beginPath();
        ctx.moveTo(...toScreen(a));
        ctx.lineTo(...toScreen(b));
        ctx.stroke();
      };
      if (from) line(pivot, from);
      if (to) line(pivot, to);
      ctx.setLineDash([]);
      const m = matrix();
      if (m) {
        ctx.strokeStyle = colors.accent;
        for (const s of selectedShapes()) {
          if (!hasPaths(s)) continue;
          strokePaths(ctx, toScreen, worldPaths({ ...s, matrix: mul(m, s.matrix) }));
        }
      }
      ctx.fillStyle = colors.accent;
      for (const q of [pivot, from].filter((x): x is Pt => !!x)) {
        const [x, y] = toScreen(q);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

// ------------------------------------------------- Déformations à 4 et 16 points

function warp(n: 2 | 4): CanvasTool {
  let box: Box | null = null, grid: Pt[] = [], ids: string[] = [], dragging = -1;
  return {
    start() {
      const shapes = selectedShapes().filter((s) => hasPaths(s) && !s.locked);
      box = unionBoxes(shapes.map(shapeBox));
      if (!box || box.w <= 0 || box.h <= 0) {
        notify(t("Sélectionnez des formes vectorielles à déformer"));
        return false;
      }
      ids = shapes.map((s) => s.id);
      grid = warpGrid(box, n);
      notify(t("Glissez les poignées ; Entrée pour appliquer, Échap pour annuler"));
      return true;
    },
    down(p, _e, c) {
      const tol = 8 / c.scale;
      dragging = grid.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol);
    },
    move(p, e, c) {
      if (dragging >= 0) grid = grid.map((q, i) => (i === dragging ? c.snap(p, e.alt) : q));
    },
    up() {
      dragging = -1;
    },
    key(k) {
      if (k === "Enter") {
        if (box) applyWarp(ids, box, grid, n);
        done();
        return true;
      }
      if (k === "Escape") return done(), true;
      return false;
    },
    draw(ctx, toScreen, colors) {
      if (!box) return;
      const shapes = getState().project.shapes.filter((s) => ids.includes(s.id));
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.25;
      for (const s of shapes) if (hasPaths(s)) strokePaths(ctx, toScreen, warpPaths(worldPaths(s), box, grid, n));
      // Grille de contrôle.
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const [x, y] = toScreen(grid[j * n + i]);
          if (i + 1 < n) {
            ctx.moveTo(x, y);
            ctx.lineTo(...toScreen(grid[j * n + i + 1]));
          }
          if (j + 1 < n) {
            ctx.moveTo(x, y);
            ctx.lineTo(...toScreen(grid[(j + 1) * n + i]));
          }
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (const q of grid) {
        const [x, y] = toScreen(q);
        ctx.fillStyle = colors.text;
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.strokeRect(x - 4, y - 4, 8, 8);
      }
    },
  };
}

// ------------------------------------------------------------ Arrondir les angles

/** Clic près d'un angle d'une forme vectorielle : il est arrondi au rayon choisi (Maj : chanfrein). */
function roundCorners(): CanvasTool {
  let hover: Pt | null = null;
  const nearest = (p: Pt, tol: number) => {
    let best: { s: VectorShape; path: number; node: number; at: Pt; d: number } | null = null;
    for (const s of getState().project.shapes) {
      if (s.kind !== "vector" || s.locked) continue;
      curvesOf(s).forEach((c, pi) => c.nodes.forEach((n, ni) => {
        if (n.smooth) return;
        const at = apply(s.matrix, n.p);
        const d = Math.hypot(at[0] - p[0], at[1] - p[1]);
        if (d <= tol && (!best || d < best.d)) best = { s, path: pi, node: ni, at, d };
      }));
    }
    return best as { s: VectorShape; path: number; node: number; at: Pt; d: number } | null;
  };
  return {
    start() {
      notify(t("Cliquez un angle pour l'arrondir (Maj : chanfrein) ; le rayon se règle dans la barre d'options"));
      return true;
    },
    down(p, e, c) {
      const hit = nearest(p, 8 / c.scale);
      if (!hit) return;
      const k = Math.sqrt(Math.abs(hit.s.matrix[0] * hit.s.matrix[3] - hit.s.matrix[1] * hit.s.matrix[2])) || 1;
      const r = getState().toolOptions.cornerRadius || 2;
      editCurves(hit.s.id, (curves) => filletNodes(curves, [{ path: hit.path, node: hit.node }], r / k, e.shift));
    },
    move(p, _e, c) {
      hover = nearest(p, 8 / c.scale)?.at ?? null;
    },
    up() {},
    key(k) {
      if (k === "Escape") return done(), true;
      return false;
    },
    draw(ctx, toScreen, colors) {
      if (!hover) return;
      const [x, y] = toScreen(hover);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    },
  };
}

export const CANVAS_TOOLS: Partial<Record<Tool, CanvasTool>> = {
  roundCorners: roundCorners(),
  twoPoint: twoPoint(),
  warp: warp(2),
  deform: warp(4),
};
