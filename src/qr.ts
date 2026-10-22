// Génération de QR codes vectoriels.

import qrcode from "qrcode-generator";
import type { Polyline } from "./model";
import { booleanOp, weld } from "./pathops";

export type QrLevel = "L" | "M" | "Q" | "H";

/**
 * QR code avec un logo au centre : les modules sous le logo (carré de `ratio` × la taille,
 * aligné sur la grille) sont retirés, le logo y est mis à l'échelle. Le niveau H est imposé :
 * il tolère ~30 % de modules perdus.
 */
export function qrWithLogo(text: string, size: number, logo: Polyline[], ratio = 0.22): Polyline[] {
  const qr = qrPaths(text, size, "H");
  const xs = logo.flatMap((p) => p.pts.map((q) => q[0])), ys = logo.flatMap((p) => p.pts.map((q) => q[1]));
  if (!xs.length) return qr;
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const hole = size * ratio, c = size / 2;
  const cut: Polyline = { closed: true, pts: [[c - hole / 2, c - hole / 2], [c + hole / 2, c - hole / 2], [c + hole / 2, c + hole / 2], [c - hole / 2, c + hole / 2]] };
  // Le logo occupe 80 % du trou, centré, proportions gardées.
  const k = (hole * 0.8) / Math.max(box.w, box.h, 1e-9);
  const placed = logo.map((p) => ({ closed: p.closed, pts: p.pts.map(([x, y]): [number, number] => [c + (x - box.x - box.w / 2) * k, c + (y - box.y - box.h / 2) * k]) }));
  return [...booleanOp("difference", [qr, [cut]]), ...placed];
}

/** QR code de `size` mm de côté (marge de silence non comprise), origine en haut à gauche. */
export function qrPaths(text: string, size: number, level: QrLevel = "M"): Polyline[] {
  const qr = qrcode(0, level);
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const m = size / n;
  const rects: Polyline[] = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < n && qr.isDark(r, c)) c++;
      const [x0, x1, y0, y1] = [start * m, c * m, r * m, (r + 1) * m];
      rects.push({ closed: true, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
    }
  }
  // Fusion des modules adjacents : contours propres, utilisables aussi en mode Ligne.
  return weld(rects);
}
