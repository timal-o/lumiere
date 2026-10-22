// Import DXF (ASCII) : LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, SPLINE.

import { joinPaths } from "../geometry";
import type { Polyline, Pt } from "../model";
import type { ImportResult } from "./svg";
import { t } from "../i18n";

type Pair = [number, string];

const UNITS_MM: Record<number, number> = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };
const ARC_STEP = 0.1; // mm

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.min(512, Math.max(8, Math.ceil((sweep * r) / ARC_STEP)));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

/** Arc défini par un « bulge » entre deux sommets (tan(θ/4)). */
function bulgePoints(p0: Pt, p1: Pt, bulge: number): Pt[] {
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (chord < 1e-9) return [p1];
  const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
  const mid: Pt = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  const h = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2)) * Math.sign(bulge) * (Math.abs(theta) > Math.PI ? -1 : 1);
  const nx = -(p1[1] - p0[1]) / chord, ny = (p1[0] - p0[0]) / chord;
  const c: Pt = [mid[0] + nx * h, mid[1] + ny * h];
  const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
  const n = Math.max(4, Math.ceil((Math.abs(theta) * r) / ARC_STEP));
  const pts: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const t = a0 + (theta * i) / n;
    pts.push(i === n ? p1 : [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]);
  }
  return pts;
}

function vertexPath(verts: { p: Pt; bulge: number }[], closed: boolean): Polyline {
  const pts: Pt[] = verts.length ? [verts[0].p] : [];
  const n = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    if (Math.abs(a.bulge) > 1e-9) pts.push(...bulgePoints(a.p, b.p, a.bulge));
    else pts.push(b.p);
  }
  if (closed && pts.length > 1) pts.pop(); // dernier point = premier
  return { pts, closed: closed && pts.length > 2 };
}

/** B-spline rationnelle évaluée par l'algorithme de De Boor. */
function splinePoints(degree: number, knots: number[], ctrl: Pt[], weights: number[]): Pt[] {
  const n = ctrl.length;
  if (n < 2 || knots.length !== n + degree + 1) return ctrl;
  const w = weights.length === n ? weights : ctrl.map(() => 1);
  const t0 = knots[degree], t1 = knots[n];
  const samples = Math.min(2000, Math.max(16, n * 16));
  const pts: Pt[] = [];
  for (let s = 0; s <= samples; s++) {
    const t = Math.min(t0 + ((t1 - t0) * s) / samples, t1 - 1e-12 * Math.abs(t1 || 1));
    let k = degree;
    while (k < n - 1 && knots[k + 1] <= t) k++;
    const d: [number, number, number][] = [];
    for (let j = 0; j <= degree; j++) {
      const i = k - degree + j;
      d.push([ctrl[i][0] * w[i], ctrl[i][1] * w[i], w[i]]);
    }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j;
        const den = knots[i + degree - r + 1] - knots[i];
        const a = den === 0 ? 0 : (t - knots[i]) / den;
        for (let c = 0; c < 3; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
      }
    }
    const [x, y, ww] = d[degree];
    pts.push([x / ww, y / ww]);
  }
  return pts;
}

export function parseDxf(text: string): ImportResult {
  const lines = text.split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  if (!pairs.some(([c, v]) => c === 0 && v === "SECTION")) throw new Error(t("Fichier DXF illisible (le format binaire n'est pas pris en charge)"));

  let unit = 1;
  const ins = pairs.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  if (ins >= 0 && pairs[ins + 1]) unit = UNITS_MM[parseInt(pairs[ins + 1][1], 10)] ?? 1;

  // Découpe la section ENTITIES en entités (chaque entité commence par un code 0).
  const start = pairs.findIndex(([c, v], i) => c === 2 && v === "ENTITIES" && pairs[i - 1]?.[1] === "SECTION");
  if (start < 0) return { groups: [], warnings: [t("Aucune entité trouvée")] };
  const entities: Pair[][] = [];
  for (let i = start + 1; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0 && v === "ENDSEC") break;
    if (c === 0) entities.push([pairs[i]]);
    else entities[entities.length - 1]?.push(pairs[i]);
  }

  const paths: Polyline[] = [];
  const warnings = new Set<string>();
  const get = (e: Pair[], code: number, def = 0) => {
    const p = e.find(([c]) => c === code);
    return p ? parseFloat(p[1]) : def;
  };
  const all = (e: Pair[], code: number) => e.filter(([c]) => c === code).map(([, v]) => parseFloat(v));
  const rad = (deg: number) => (deg * Math.PI) / 180;

  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    const type = e[0][1];
    switch (type) {
      case "LINE":
        paths.push({ pts: [[get(e, 10), get(e, 20)], [get(e, 11), get(e, 21)]], closed: false });
        break;
      case "CIRCLE": {
        const pts = arcPoints(get(e, 10), get(e, 20), get(e, 40), 0, Math.PI * 2);
        pts.pop();
        paths.push({ pts, closed: true });
        break;
      }
      case "ARC":
        paths.push({ pts: arcPoints(get(e, 10), get(e, 20), get(e, 40), rad(get(e, 50)), rad(get(e, 51))), closed: false });
        break;
      case "ELLIPSE": {
        const [cx, cy, mx, my, ratio] = [get(e, 10), get(e, 20), get(e, 11), get(e, 21), get(e, 40, 1)];
        const t0 = get(e, 41, 0);
        let t1 = get(e, 42, Math.PI * 2);
        while (t1 <= t0) t1 += Math.PI * 2;
        const a = Math.hypot(mx, my), rot = Math.atan2(my, mx);
        const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
        const n = Math.max(16, Math.ceil(((t1 - t0) * a) / ARC_STEP));
        const pts: Pt[] = [];
        for (let k = 0; k <= n; k++) {
          const t = t0 + ((t1 - t0) * k) / n;
          const x = a * Math.cos(t), y = a * ratio * Math.sin(t);
          pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
        }
        if (full) pts.pop();
        paths.push({ pts, closed: full });
        break;
      }
      case "LWPOLYLINE": {
        const verts: { p: Pt; bulge: number }[] = [];
        for (const [c, v] of e) {
          if (c === 10) verts.push({ p: [parseFloat(v), 0], bulge: 0 });
          else if (c === 20 && verts.length) verts[verts.length - 1].p[1] = parseFloat(v);
          else if (c === 42 && verts.length) verts[verts.length - 1].bulge = parseFloat(v);
        }
        paths.push(vertexPath(verts, (get(e, 70) & 1) === 1));
        break;
      }
      case "POLYLINE": {
        const closed = (get(e, 70) & 1) === 1;
        const verts: { p: Pt; bulge: number }[] = [];
        while (entities[i + 1]?.[0][1] === "VERTEX") {
          const v = entities[++i];
          verts.push({ p: [get(v, 10), get(v, 20)], bulge: get(v, 42) });
        }
        if (entities[i + 1]?.[0][1] === "SEQEND") i++;
        paths.push(vertexPath(verts, closed));
        break;
      }
      case "SPLINE": {
        const xs = all(e, 10), ys = all(e, 20);
        const ctrl: Pt[] = xs.map((x, k) => [x, ys[k] ?? 0]);
        const closed = (get(e, 70) & 1) === 1;
        if (ctrl.length) {
          paths.push({ pts: splinePoints(get(e, 71, 3), all(e, 40), ctrl, all(e, 41)), closed: false });
        } else {
          const fx = all(e, 11), fy = all(e, 21);
          paths.push({ pts: fx.map((x, k) => [x, fy[k] ?? 0]), closed });
        }
        break;
      }
      case "INSERT":
        warnings.add(t("Blocs (INSERT) ignorés : décomposez-les avant l'export."));
        break;
      case "TEXT":
      case "MTEXT":
        warnings.add(t("Textes DXF ignorés."));
        break;
    }
  }

  // DXF : Y vers le haut → on retourne pour le repère écran, et on passe en mm.
  const mm = paths
    .filter((p) => p.pts.length >= 2)
    .map((p) => ({ closed: p.closed, pts: p.pts.map(([x, y]): Pt => [x * unit, -y * unit]) }));
  return { groups: [{ color: "#000000", paths: joinPaths(mm) }], warnings: [...warnings] };
}
