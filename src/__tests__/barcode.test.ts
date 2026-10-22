import { describe, expect, it } from "vitest";
import { barcodePaths, encodeBarcode } from "../barcode";
import { pathsBox } from "../geometry";

describe("codes-barres", () => {
  it("EAN-13 : 95 modules, gardes 101 aux extrémités", () => {
    const bits = encodeBarcode("EAN13", "590123412345");
    expect(bits).toHaveLength(95);
    expect(bits.startsWith("101")).toBe(true);
    expect(bits.endsWith("101")).toBe(true);
  });

  it("Code 128 : barres en rectangles, largeur = modules × pas", () => {
    const bits = encodeBarcode("CODE128", "Lumiere-42");
    const paths = barcodePaths("CODE128", "Lumiere-42", 0.3, 15);
    const box = pathsBox(paths)!;
    expect(box.w).toBeCloseTo(bits.lastIndexOf("1") * 0.3 + 0.3, 6);
    expect(box.h).toBe(15);
  });

  it("contenu invalide", () => {
    expect(() => encodeBarcode("EAN13", "abc")).toThrow();
  });
});

describe("contenus de QR code", () => {
  it("Wi-Fi, contact, e-mail, téléphone, URL", async () => {
    const { qrPayload } = await import("../barcode");
    expect(qrPayload("wifi", { ssid: "Atelier;1", password: "p:w", auth: "WPA" })).toBe("WIFI:T:WPA;S:Atelier\\;1;P:p\\:w;;");
    expect(qrPayload("wifi", { ssid: "Libre", auth: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Libre;H:true;;");
    expect(qrPayload("contact", { firstName: "Ana", lastName: "Lopez", phone: "+33 6 12" })).toBe("MECARD:N:Lopez,Ana;TEL:+33 6 12;;");
    expect(qrPayload("email", { email: "a@b.fr", subject: "Bonjour à tous" })).toBe("mailto:a@b.fr?subject=Bonjour%20%C3%A0%20tous");
    expect(qrPayload("phone", { phone: "+33 (0)6 12" })).toBe("tel:+33061" + "2");
    expect(qrPayload("url", { url: "lumiere.app" })).toBe("https://lumiere.app");
  });
});

describe("QR code avec logo", () => {
  it("retire les modules du centre et y place le logo", async () => {
    const { qrWithLogo, qrPaths } = await import("../qr");
    const logo = [{ closed: true, pts: [[0, 0], [100, 0], [100, 50], [0, 50]] as [number, number][] }];
    const out = qrWithLogo("https://lumiere.app", 40, logo);
    const plain = qrPaths("https://lumiere.app", 40, "H");
    const placed = out[out.length - 1];
    const xs = placed.pts.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40 * 0.22 * 0.8, 3);
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(20, 3);
    // Aucun module ne reste au centre (sauf le logo).
    const inside = (p: { pts: [number, number][] }) => p.pts.some(([x, y]) => Math.abs(x - 20) < 3 && Math.abs(y - 20) < 3);
    expect(out.slice(0, -1).some(inside)).toBe(false);
    expect(plain.length).toBeGreaterThan(0);
  });
});
