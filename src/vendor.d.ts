/// <reference types="vite/client" />
declare module "clipper-lib" {
  // Portage JavaScript de Clipper 6 (Angus Johnson) ; API non typée.
  const ClipperLib: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export default ClipperLib;
}

declare module "jsbarcode/bin/barcodes" {
  // Encodeurs de JsBarcode : chaque classe renvoie la suite de modules (« 1 » = barre).
  type Encoded = { data: string; text?: string };
  interface Encoder {
    valid(): boolean;
    encode(): Encoded | Encoded[];
  }
  const barcodes: Record<string, new (data: string, options: Record<string, unknown>) => Encoder>;
  export default barcodes;
}
