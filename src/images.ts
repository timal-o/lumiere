// Cache des images décodées, partagé par le rendu et la génération du travail.

import { t } from "./i18n";

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();
const waiters = new Set<() => void>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const done = cache.get(src);
  if (done) return Promise.resolve(done);
  let p = pending.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        cache.set(src, img);
        pending.delete(src);
        waiters.forEach((w) => w());
        resolve(img);
      };
      img.onerror = () => {
        pending.delete(src);
        reject(new Error(t("Image illisible")));
      };
      img.src = src;
    });
    pending.set(src, p);
  }
  return p;
}

/** Image si déjà décodée, sinon lance le chargement et renvoie `null`. */
export function cachedImage(src: string): HTMLImageElement | null {
  const img = cache.get(src);
  if (!img) loadImage(src).catch(() => {});
  return img ?? null;
}

/** Prévient quand une image vient d'être décodée (pour redessiner). */
export function onImageLoaded(cb: () => void): () => void {
  waiters.add(cb);
  return () => waiters.delete(cb);
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
