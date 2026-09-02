import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@locales": path.resolve(__dirname, "../../locales"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:6001",
      "/assets": "http://127.0.0.1:6001",
      "/onlinePreview": "http://127.0.0.1:6001",
      "/__demo": "http://127.0.0.1:6001",
      "/health": "http://127.0.0.1:6001",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
  },
});
