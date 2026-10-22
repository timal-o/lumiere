/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Application de bureau chargée en local : un gros paquet (opentype.js) ne pose pas problème.
  build: { target: "safari15", outDir: "dist", chunkSizeWarningLimit: 2000 },
  // Les tests vérifient des messages en français, quelle que soit la langue du système.
  test: { setupFiles: ["src/__tests__/setup.ts"] },
});
