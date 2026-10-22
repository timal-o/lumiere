// Rendu et sélection pour l'outil Nœuds (coordonnées plateau).

import { nearestOnPath, segmentAt, segmentCount, transformBez, type BezPath } from "../bezier";
import { curvesOf } from "../actions";
import { nodeKey, parseKey, type NodeRef } from "../nodeedit";
import type { Pt, Shape } from "../model";

export type NodeHit =
  | { kind: "handle"; ref: NodeRef; which: "c1" | "c2" }
  | { kind: "node"; ref: NodeRef }
  | { kind: "segment"; path: number; seg: number; t: number; p: Pt };

export const worldCurves = (s: Shape & { kind: "vector" }) => transformBez(curvesOf(s), s.matrix);

const near = (a: Pt, b: Pt, tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

export function hitTest(curves: BezPath[], sel: string[], q: Pt, tol: number): NodeHit | null {
  // Poignées des nœuds sélectionnés d'abord : elles peuvent recouvrir un nœud.
  for (const key of sel) {
    const ref = parseKey(key);
    const n = curves[ref.path]?.nodes[ref.node];
    if (!n) continue;
    if (n.c1 && near(n.c1, q, tol)) return { kind: "handle", ref, which: "c1" };
    if (n.c2 && near(n.c2, q, tol)) return { kind: "handle", ref, which: "c2" };
  }
  for (let pi = 0; pi < curves.length; pi++) {
    const nodes = curves[pi].nodes;
    for (let ni = 0; ni < nodes.length; ni++) if (near(nodes[ni].p, q, tol)) return { kind: "node", ref: { path: pi, node: ni } };
  }
  let best: NodeHit | null = null;
  let bd = tol;
  curves.forEach((c, pi) => {
    const hit = nearestOnPath(c, q);
    if (hit && hit.d <= bd) {
      bd = hit.d;
      best = { kind: "segment", path: pi, seg: hit.seg, t: hit.t, p: hit.p };
    }
  });
  return best;
}

export function nodesInBox(curves: BezPath[], x0: number, y0: number, x1: number, y1: number): string[] {
  const out: string[] = [];
  curves.forEach((c, pi) =>
    c.nodes.forEach((n, ni) => {
      if (n.p[0] >= x0 && n.p[0] <= x1 && n.p[1] >= y0 && n.p[1] <= y1) out.push(nodeKey({ path: pi, node: ni }));
    }),
  );
  return out;
}

interface Colors {
  accent: string;
  surface: string;
  text: string;
}

export function drawNodeMode(
  ctx: CanvasRenderingContext2D,
  curves: BezPath[],
  toScreen: (p: Pt) => Pt,
  sel: string[],
  hover: NodeHit | null,
  c: Colors,
) {
  // Segment survolé.
  if (hover?.kind === "segment") {
    const seg = segmentAt(curves[hover.path], hover.seg);
    const pts = seg.map(toScreen);
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    if (pts.length === 2) ctx.lineTo(...pts[1]);
    else ctx.bezierCurveTo(...pts[1], ...pts[2], ...pts[3]);
    ctx.stroke();
  }
  // Contour de la forme, en courbes exactes.
  ctx.strokeStyle = c.text;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const path of curves) {
    if (!path.nodes.length) continue;
    ctx.moveTo(...toScreen(path.nodes[0].p));
    for (let i = 0; i < segmentCount(path); i++) {
      const s = segmentAt(path, i).map(toScreen);
      if (s.length === 2) ctx.lineTo(...s[1]);
      else ctx.bezierCurveTo(...s[1], ...s[2], ...s[3]);
    }
    if (path.closed) ctx.closePath();
  }
  ctx.stroke();

  const selected = new Set(sel);
  // Poignées des nœuds sélectionnés.
  ctx.lineWidth = 1;
  for (const key of sel) {
    const ref = parseKey(key);
    const n = curves[ref.path]?.nodes[ref.node];
    if (!n) continue;
    const p = toScreen(n.p);
    for (const h of [n.c1, n.c2]) {
      if (!h) continue;
      const q = toScreen(h);
      ctx.strokeStyle = c.accent;
      ctx.beginPath();
      ctx.moveTo(...p);
      ctx.lineTo(...q);
      ctx.stroke();
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(q[0], q[1], 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Nœuds : carrés (anguleux), ronds (lisses) ; pleins si sélectionnés.
  curves.forEach((path, pi) =>
    path.nodes.forEach((n, ni) => {
      const [x, y] = toScreen(n.p);
      const isSel = selected.has(nodeKey({ path: pi, node: ni }));
      const isHover = hover?.kind === "node" && hover.ref.path === pi && hover.ref.node === ni;
      ctx.fillStyle = isSel ? c.accent : c.surface;
      ctx.strokeStyle = isHover ? c.text : c.accent;
      ctx.lineWidth = isHover ? 2 : 1.25;
      ctx.beginPath();
      if (n.smooth) ctx.arc(x, y, 4, 0, Math.PI * 2);
      else ctx.rect(x - 3.5, y - 3.5, 7, 7);
      ctx.fill();
      ctx.stroke();
      // Premier nœud d'un tracé ouvert : repère de départ.
      if (ni === 0 && !path.closed) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }),
  );
}
