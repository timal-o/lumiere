// Analyse de l'attribut `d` des chemins SVG en courbes de Bézier cubiques.

import { arcToCubics, flattenBez, type BezNode, type BezPath } from "../bezier";
import type { Polyline, Pt } from "../model";
import { t } from "../i18n";

class Scanner {
  i = 0;
  constructor(private s: string) {}

  private skip() {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++;
  }

  command(): string | null {
    this.skip();
    const c = this.s[this.i];
    if (c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      this.i++;
      return c;
    }
    return null;
  }

  hasNumber(): boolean {
    this.skip();
    return this.i < this.s.length && /[-+.\d]/.test(this.s[this.i]);
  }

  number(): number {
    this.skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) throw new Error(t("Nombre attendu à la position {i}", { i: this.i }));
    this.i += m[0].length;
    return parseFloat(m[0]);
  }

  /** Les drapeaux d'arc peuvent être collés : « a1 1 0 0120 0 ». */
  flag(): number {
    this.skip();
    const c = this.s[this.i++];
    if (c !== "0" && c !== "1") throw new Error(t("Drapeau d'arc invalide"));
    return c === "1" ? 1 : 0;
  }
}

const same = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

export function parsePathData(d: string): BezPath[] {
  const sc = new Scanner(d);
  const out: BezPath[] = [];
  let nodes: BezNode[] = [];
  let pos: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastCtrl: Pt | null = null;
  let lastCmd = "";
  let cmd: string | null = null;

  const line = (p: Pt) => {
    nodes.push({ p });
    pos = p;
  };
  const cubic = (c1: Pt, c2: Pt, p: Pt) => {
    nodes[nodes.length - 1].c2 = c1;
    nodes.push({ p, c1: c2 });
    pos = p;
  };
  const flush = (closed: boolean) => {
    if (nodes.length >= 2) {
      if (closed && nodes.length > 2 && same(nodes[0].p, nodes[nodes.length - 1].p)) {
        // Le dernier nœud double le premier : on garde sa poignée entrante.
        const last = nodes.pop()!;
        if (last.c1) nodes[0].c1 = last.c1;
      }
      out.push({ nodes, closed: closed && nodes.length > 2 });
    }
    nodes = [];
  };

  try {
    while (true) {
      const next = sc.command();
      if (next) cmd = next;
      else if (!cmd || !sc.hasNumber()) break;
      // Un « M » suivi de coordonnées supplémentaires implique un « L ».
      else if (cmd === "M") cmd = "L";
      else if (cmd === "m") cmd = "l";

      const rel = cmd === cmd.toLowerCase();
      const P = (x: number, y: number): Pt => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
      if (nodes.length === 0 && !/[Mm]/.test(cmd)) nodes = [{ p: pos }];

      switch (cmd.toUpperCase()) {
        case "M":
          flush(false);
          pos = P(sc.number(), sc.number());
          start = pos;
          nodes = [{ p: pos }];
          lastCtrl = null;
          break;
        case "L": line(P(sc.number(), sc.number())); lastCtrl = null; break;
        case "H": { const x = sc.number(); line([rel ? pos[0] + x : x, pos[1]]); lastCtrl = null; break; }
        case "V": { const y = sc.number(); line([pos[0], rel ? pos[1] + y : y]); lastCtrl = null; break; }
        case "C": {
          const c1 = P(sc.number(), sc.number()), c2 = P(sc.number(), sc.number()), p = P(sc.number(), sc.number());
          cubic(c1, c2, p);
          lastCtrl = c2;
          break;
        }
        case "S": {
          const c1: Pt = lastCtrl && /[CcSs]/.test(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
          const c2 = P(sc.number(), sc.number()), p = P(sc.number(), sc.number());
          cubic(c1, c2, p);
          lastCtrl = c2;
          break;
        }
        case "Q":
        case "T": {
          const q: Pt =
            cmd.toUpperCase() === "Q"
              ? P(sc.number(), sc.number())
              : lastCtrl && /[QqTt]/.test(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
          const p = P(sc.number(), sc.number());
          // Quadratique → cubique équivalente.
          const p0 = pos;
          cubic([p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])], [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p);
          lastCtrl = q;
          break;
        }
        case "A": {
          const rx = sc.number(), ry = sc.number(), phi = sc.number(), large = sc.flag(), sweep = sc.flag();
          const p = P(sc.number(), sc.number());
          const arcs = arcToCubics(pos, rx, ry, phi, large, sweep, p);
          if (!arcs.length) {
            if (!same(pos, p)) line(p);
          } else for (const [c1, c2, e] of arcs) cubic(c1, c2, e);
          lastCtrl = null;
          break;
        }
        case "Z":
          flush(true);
          pos = start;
          lastCtrl = null;
          break;
      }
      lastCmd = cmd;
    }
  } catch {
    // Données mal formées : on garde ce qui a pu être lu, comme les navigateurs.
  }
  flush(false);
  return out;
}

/** Convertit des données de chemin en polylignes (erreur de corde ≈ `tol`). */
export function flattenPath(d: string, tol: number): Polyline[] {
  return flattenBez(parsePathData(d), tol);
}
