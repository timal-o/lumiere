// Opérations d'édition de nœuds (fonctions pures sur des tracés de Bézier).

import { segmentAt, segmentCount, splitSegment, type BezNode, type BezPath } from "./bezier";
import type { Pt } from "./model";

export interface NodeRef {
  path: number;
  node: number;
}

export const nodeKey = (r: NodeRef) => `${r.path}:${r.node}`;
export const parseKey = (k: string): NodeRef => {
  const [path, node] = k.split(":").map(Number);
  return { path, node };
};

const clone = (paths: BezPath[]): BezPath[] => paths.map((p) => ({ closed: p.closed, nodes: p.nodes.map((n) => ({ ...n })) }));
const add = (a: Pt, d: Pt): Pt => [a[0] + d[0], a[1] + d[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt) => Math.hypot(v[0], v[1]);

/** Déplace des nœuds (leurs poignées suivent). */
export function moveNodes(paths: BezPath[], refs: NodeRef[], d: Pt): BezPath[] {
  const out = clone(paths);
  for (const { path, node } of refs) {
    const n = out[path]?.nodes[node];
    if (!n) continue;
    n.p = add(n.p, d);
    if (n.c1) n.c1 = add(n.c1, d);
    if (n.c2) n.c2 = add(n.c2, d);
  }
  return out;
}

/**
 * Place une poignée. Sur un nœud lisse, la poignée opposée reste alignée (sa
 * longueur est conservée), sauf si `breakSmooth` : le nœud devient anguleux.
 */
export function moveHandle(paths: BezPath[], ref: NodeRef, which: "c1" | "c2", to: Pt, breakSmooth: boolean): BezPath[] {
  const out = clone(paths);
  const n = out[ref.path].nodes[ref.node];
  n[which] = to;
  if (breakSmooth) n.smooth = false;
  const other = which === "c1" ? "c2" : "c1";
  const o = n[other];
  if (n.smooth && o) {
    const v = sub(n.p, to);
    const l = len(v);
    if (l > 1e-12) {
      const k = len(sub(o, n.p)) / l;
      n[other] = add(n.p, [v[0] * k, v[1] * k]);
    }
  }
  return out;
}

/** Supprime des nœuds ; un tracé réduit à moins de deux nœuds disparaît. */
export function deleteNodes(paths: BezPath[], refs: NodeRef[]): BezPath[] {
  const kill = new Set(refs.map(nodeKey));
  return clone(paths)
    .map((p, pi) => ({ ...p, nodes: p.nodes.filter((_, ni) => !kill.has(nodeKey({ path: pi, node: ni }))) }))
    .filter((p) => p.nodes.length >= 2)
    .map((p) => ({ ...p, closed: p.closed && p.nodes.length >= 3 }));
}

export function insertNode(paths: BezPath[], path: number, seg: number, t: number): BezPath[] {
  const out = clone(paths);
  out[path] = splitSegment(out[path], seg, t);
  return out;
}

/**
 * Coupe le tracé au nœud. Fermé : il s'ouvre à cet endroit. Ouvert : il est
 * séparé en deux tracés qui partagent ce point.
 */
export function breakAt(paths: BezPath[], ref: NodeRef): BezPath[] {
  const out = clone(paths);
  const p = out[ref.path];
  const i = ref.node;
  const dup = (n: BezNode): BezNode => ({ ...n });
  if (p.closed) {
    const nodes = [...p.nodes.slice(i), ...p.nodes.slice(0, i), dup(p.nodes[i])];
    nodes[0] = { ...nodes[0], c1: undefined, smooth: false };
    nodes[nodes.length - 1] = { ...nodes[nodes.length - 1], c2: undefined, smooth: false };
    out[ref.path] = { closed: false, nodes };
    return out;
  }
  if (i === 0 || i === p.nodes.length - 1) return out;
  const a = p.nodes.slice(0, i + 1);
  const b = [dup(p.nodes[i]), ...p.nodes.slice(i + 1)];
  a[a.length - 1] = { ...a[a.length - 1], c2: undefined, smooth: false };
  b[0] = { ...b[0], c1: undefined, smooth: false };
  out.splice(ref.path, 1, { closed: false, nodes: a }, { closed: false, nodes: b });
  return out;
}

/** Transforme un segment en droite (retire les poignées qui le concernent). */
export function segmentToLine(paths: BezPath[], path: number, seg: number): BezPath[] {
  const out = clone(paths);
  const p = out[path];
  const a = p.nodes[seg], b = p.nodes[(seg + 1) % p.nodes.length];
  a.c2 = undefined;
  b.c1 = undefined;
  a.smooth = b.smooth = false;
  return out;
}

/** Transforme une droite en courbe, poignées au tiers et aux deux tiers. */
export function segmentToCurve(paths: BezPath[], path: number, seg: number): BezPath[] {
  const out = clone(paths);
  const p = out[path];
  const s = segmentAt(p, seg);
  if (s.length === 4) return out;
  const [a, b] = s;
  p.nodes[seg].c2 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
  p.nodes[(seg + 1) % p.nodes.length].c1 = [a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3];
  return out;
}

/** Bascule un nœud entre anguleux et lisse (poignées alignées sur la tangente des voisins). */
export function toggleSmooth(paths: BezPath[], ref: NodeRef): BezPath[] {
  const out = clone(paths);
  const p = out[ref.path];
  const n = p.nodes[ref.node];
  if (n.smooth) {
    n.smooth = false;
    return out;
  }
  const count = p.nodes.length;
  const prev = ref.node > 0 || p.closed ? p.nodes[(ref.node - 1 + count) % count] : null;
  const next = ref.node < count - 1 || p.closed ? p.nodes[(ref.node + 1) % count] : null;
  const dir = sub(next?.p ?? n.p, prev?.p ?? n.p);
  const l = len(dir);
  if (l < 1e-12) return out;
  const u: Pt = [dir[0] / l, dir[1] / l];
  const l1 = prev ? len(sub(n.p, prev.p)) / 3 : 0;
  const l2 = next ? len(sub(next.p, n.p)) / 3 : 0;
  if (prev) n.c1 = [n.p[0] - u[0] * l1, n.p[1] - u[1] * l1];
  if (next) n.c2 = [n.p[0] + u[0] * l2, n.p[1] + u[1] * l2];
  n.smooth = true;
  return out;
}

const isEnd = (p: BezPath, i: number) => !p.closed && (i === 0 || i === p.nodes.length - 1);

/**
 * Relie deux extrémités de tracés ouverts. Même tracé : il se ferme. Tracés
 * différents : ils sont fusionnés en un seul.
 */
export function joinEnds(paths: BezPath[], a: NodeRef, b: NodeRef): BezPath[] | null {
  const pa = paths[a.path], pb = paths[b.path];
  if (!pa || !pb || !isEnd(pa, a.node) || !isEnd(pb, b.node)) return null;
  const out = clone(paths);
  if (a.path === b.path) {
    if (a.node === b.node || pa.nodes.length < 3) return null;
    out[a.path].closed = true;
    return out;
  }
  const rev = (nodes: BezNode[]) => nodes.map((n) => ({ ...n, c1: n.c2, c2: n.c1 })).reverse();
  // Oriente A pour finir par l'extrémité choisie, et B pour commencer par la sienne.
  const na = a.node === 0 ? rev(out[a.path].nodes) : out[a.path].nodes;
  const nb = b.node === 0 ? out[b.path].nodes : rev(out[b.path].nodes);
  const merged: BezPath = { closed: false, nodes: [...na, ...nb] };
  const keep = out.filter((_, i) => i !== a.path && i !== b.path);
  return [...keep, merged];
}

export { segmentCount };

// ------------------------------------------------------- Congés et chanfreins

/** Direction (unitaire) de la tangente en partant du nœud vers son voisin. */
function tangent(n: BezNode, neighbour: BezNode, handle: Pt | undefined): Pt | null {
  const t = sub(handle ?? neighbour.p, n.p);
  const l = len(t);
  return l > 1e-9 ? [t[0] / l, t[1] / l] : null;
}

/**
 * Remplace des nœuds anguleux par un arc de rayon `radius` (congé) ou par un
 * segment droit (chanfrein). Le recul est limité à la moitié des segments voisins.
 */
export function filletNodes(paths: BezPath[], refs: NodeRef[], radius: number, chamfer = false): BezPath[] {
  const out = clone(paths);
  const byPath = new Map<number, number[]>();
  for (const r of refs) byPath.set(r.path, [...(byPath.get(r.path) ?? []), r.node]);
  for (const [pi, nodesIdx] of byPath) {
    const path = out[pi];
    const n = path.nodes.length;
    const replaced = new Map<number, BezNode[]>();
    for (const i of nodesIdx) {
      if (!path.closed && (i === 0 || i === n - 1)) continue;
      const node = path.nodes[i];
      if (node.smooth) continue;
      const prev = path.nodes[(i - 1 + n) % n], next = path.nodes[(i + 1) % n];
      const u1 = tangent(node, prev, node.c1), u2 = tangent(node, next, node.c2);
      if (!u1 || !u2) continue;
      const cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
      const theta = Math.acos(cos); // angle intérieur
      if (theta < 1e-3 || Math.PI - theta < 1e-3) continue; // demi-tour ou alignés
      let d = radius / Math.tan(theta / 2);
      d = Math.min(d, len(sub(prev.p, node.p)) / 2, len(sub(next.p, node.p)) / 2);
      const a: Pt = [node.p[0] + u1[0] * d, node.p[1] + u1[1] * d];
      const b: Pt = [node.p[0] + u2[0] * d, node.p[1] + u2[1] * d];
      if (chamfer) {
        replaced.set(i, [{ p: a, c1: node.c1 && a }, { p: b, c2: node.c2 && b }]);
        continue;
      }
      // Arc tangent aux deux côtés : poignées de longueur 4/3·tan(φ/4)·r, φ = π − θ.
      const r = d * Math.tan(theta / 2);
      const h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * r;
      replaced.set(i, [
        { p: a, c2: [a[0] - u1[0] * h, a[1] - u1[1] * h] },
        { p: b, c1: [b[0] - u2[0] * h, b[1] - u2[1] * h] },
      ]);
    }
    if (replaced.size) path.nodes = path.nodes.flatMap((x, i) => replaced.get(i) ?? [x]);
  }
  return out;
}

/** Tous les nœuds anguleux d'un ensemble de tracés. */
export function cornerNodes(paths: BezPath[]): NodeRef[] {
  return paths.flatMap((p, pi) => p.nodes.map((n, ni) => ({ path: pi, node: ni, n })).filter((x) => !x.n.smooth).map(({ path, node }) => ({ path, node })));
}

// ------------------------------------------------------------ Jonction auto

/** Relie les tracés ouverts dont les extrémités sont à moins de `tol`, et ferme ceux qui bouclent. */
export function autoJoin(paths: BezPath[], tol: number): BezPath[] {
  const near = (a: Pt, b: Pt) => len(sub(a, b)) <= tol;
  const rev = (nodes: BezNode[]) => nodes.map((n) => ({ ...n, c1: n.c2, c2: n.c1 })).reverse();
  // Ajoute `b` après `a` en fusionnant le nœud commun.
  const append = (a: BezNode[], b: BezNode[]) => {
    const last = a[a.length - 1];
    a[a.length - 1] = { ...last, c2: b[0].c2 };
    return [...a, ...b.slice(1)];
  };
  const closed = clone(paths).filter((p) => p.closed);
  const open = clone(paths).filter((p) => !p.closed).map((p) => p.nodes);
  const out: BezPath[] = [...closed];
  while (open.length) {
    let cur = open.pop()!;
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < open.length; i++) {
        const o = open[i];
        const head = cur[0].p, tail = cur[cur.length - 1].p;
        if (near(tail, o[0].p)) cur = append(cur, o);
        else if (near(tail, o[o.length - 1].p)) cur = append(cur, rev(o));
        else if (near(head, o[o.length - 1].p)) cur = append(o, cur);
        else if (near(head, o[0].p)) cur = append(rev(o), cur);
        else continue;
        open.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (cur.length > 2 && near(cur[0].p, cur[cur.length - 1].p)) {
      const last = cur.pop()!;
      cur[0] = { ...cur[0], c1: last.c1 };
      out.push({ closed: true, nodes: cur });
    } else out.push({ closed: false, nodes: cur });
  }
  return out;
}

/** Fait du nœud le point de départ de son contour fermé (ou inverse un tracé ouvert depuis sa fin). */
export function setStartNode(paths: BezPath[], ref: NodeRef): BezPath[] {
  const out = clone(paths);
  const p = out[ref.path];
  if (p.closed) p.nodes = [...p.nodes.slice(ref.node), ...p.nodes.slice(0, ref.node)];
  else if (ref.node === p.nodes.length - 1) p.nodes = p.nodes.map((n) => ({ ...n, c1: n.c2, c2: n.c1 })).reverse();
  return out;
}
