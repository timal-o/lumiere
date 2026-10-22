// Codes-barres 1D vectoriels (encodeurs de JsBarcode).

import barcodes from "jsbarcode/bin/barcodes";
import { rectPath } from "./geometry";
import { t, tk } from "./i18n";
import type { Polyline } from "./model";

export const BARCODE_TYPES = {
  CODE128: tk("Code 128 (auto)"),
  CODE39: "Code 39",
  EAN13: "EAN-13",
  EAN8: "EAN-8",
  UPC: "UPC-A",
  ITF14: "ITF-14",
  codabar: "Codabar",
};

export type BarcodeType = keyof typeof BARCODE_TYPES;

/** Suite de modules (« 1 » = barre) ; erreur si le contenu n'est pas valide pour ce type. */
export function encodeBarcode(type: BarcodeType, text: string): string {
  const Encoder = barcodes[type];
  const enc = new Encoder(text, { flat: true });
  if (!enc.valid()) throw new Error(t("Contenu invalide pour {type}", { type: t(BARCODE_TYPES[type]) }));
  const out = enc.encode();
  return (Array.isArray(out) ? out : [out]).map((e) => e.data).join("");
}

/** Barres en rectangles fermés : `module` mm par module, hauteur `height` mm, origine en haut à gauche. */
export function barcodePaths(type: BarcodeType, text: string, module: number, height: number): Polyline[] {
  const bits = encodeBarcode(type, text);
  const out: Polyline[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] !== "1") {
      i++;
      continue;
    }
    const start = i;
    while (i < bits.length && bits[i] === "1") i++;
    out.push(rectPath(start * module, 0, (i - start) * module, height));
  }
  return out;
}

// ------------------------------------------------------- Contenus de QR code

export type QrMode = "text" | "url" | "wifi" | "contact" | "email" | "phone";

export interface QrFields {
  text?: string;
  ssid?: string;
  password?: string;
  auth?: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  org?: string;
  url?: string;
  subject?: string;
  body?: string;
}

/** Échappement des champs WIFI: et MECARD: (\ ; , : "). */
const esc = (s = "") => s.replace(/([\\;,:"])/g, "\\$1");

/** Contenu d'un QR code selon son type (formats lus par les applications photo des téléphones). */
export function qrPayload(mode: QrMode, f: QrFields): string {
  switch (mode) {
    case "url": {
      const u = (f.url ?? f.text ?? "").trim();
      return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
    }
    case "wifi":
      return `WIFI:T:${f.auth ?? "WPA"};S:${esc(f.ssid)};${f.auth === "nopass" ? "" : `P:${esc(f.password)};`}${f.hidden ? "H:true;" : ""};`;
    case "contact": {
      const parts = [`N:${esc(f.lastName)},${esc(f.firstName)}`];
      if (f.phone) parts.push(`TEL:${esc(f.phone)}`);
      if (f.email) parts.push(`EMAIL:${esc(f.email)}`);
      if (f.address) parts.push(`ADR:${esc(f.address)}`);
      if (f.org) parts.push(`NOTE:${esc(f.org)}`);
      if (f.url) parts.push(`URL:${esc(f.url)}`);
      return `MECARD:${parts.join(";")};;`;
    }
    case "email": {
      const q = [f.subject && `subject=${encodeURIComponent(f.subject)}`, f.body && `body=${encodeURIComponent(f.body)}`].filter(Boolean).join("&");
      return `mailto:${f.email ?? ""}${q ? `?${q}` : ""}`;
    }
    case "phone":
      return `tel:${(f.phone ?? "").replace(/[^\d+]/g, "")}`;
    default:
      return f.text ?? "";
  }
}
