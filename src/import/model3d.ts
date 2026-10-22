// Modèles 3D OBJ et 3MF → triangles à plat (comme parseStl), pour la carte de profondeur.

import { t } from "../i18n";

/** OBJ : sommets « v x y z », faces « f a b c … » (polygones découpés en éventail, indices négatifs relatifs). */
export function parseObj(text: string): Float32Array {
  const v: number[][] = [];
  const out: number[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.split(/\s+/).map(Number);
      v.push([x, y, z]);
    } else if (line.startsWith("f ")) {
      const idx = line.split(/\s+/).slice(1).map((tok) => {
        const i = parseInt(tok.split("/")[0], 10);
        return i < 0 ? v.length + i : i - 1;
      });
      for (let k = 1; k + 1 < idx.length; k++) {
        for (const i of [idx[0], idx[k], idx[k + 1]]) {
          const p = v[i];
          if (!p) throw new Error(t("Fichier OBJ illisible"));
          out.push(p[0], p[1], p[2]);
        }
      }
    }
  }
  if (!out.length) throw new Error(t("Modèle 3D vide"));
  return Float32Array.from(out);
}

/** Fichiers d'une archive ZIP (méthodes « stocké » et « deflate »). */
export async function unzip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(data), dv = new DataView(data);
  // Répertoire central : fin d'archive repérée par sa signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(t("Archive ZIP illisible"));
  const count = dv.getUint16(eocd + 10, true);
  let o = dv.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(o, true) !== 0x02014b50) break;
    const method = dv.getUint16(o + 10, true), size = dv.getUint32(o + 20, true);
    const nameLen = dv.getUint16(o + 28, true), extraLen = dv.getUint16(o + 30, true), commentLen = dv.getUint16(o + 32, true);
    const local = dv.getUint32(o + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(o + 46, o + 46 + nameLen));
    o += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      files.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return files;
}

/** 3MF : archive ZIP contenant le modèle XML (<vertex x y z/>, <triangle v1 v2 v3/>), tous les objets. */
export async function parse3mf(data: ArrayBuffer): Promise<Float32Array> {
  const files = await unzip(data);
  const out: number[] = [];
  for (const [name, content] of files) {
    if (!/\.model$/i.test(name)) continue;
    const xml = new TextDecoder().decode(content);
    for (const mesh of xml.matchAll(/<mesh\b[\s\S]*?<\/mesh>/g)) {
      const verts = Array.from(mesh[0].matchAll(/<vertex\b[^>]*?x="([^"]+)"[^>]*?y="([^"]+)"[^>]*?z="([^"]+)"/g), (m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
      for (const tri of mesh[0].matchAll(/<triangle\b[^>]*?v1="(\d+)"[^>]*?v2="(\d+)"[^>]*?v3="(\d+)"/g)) {
        for (const i of [tri[1], tri[2], tri[3]]) {
          const p = verts[Number(i)];
          if (p) out.push(p[0], p[1], p[2]);
        }
      }
    }
  }
  if (!out.length) throw new Error(t("Modèle 3D vide"));
  return Float32Array.from(out);
}
