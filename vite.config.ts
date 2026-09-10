import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react()],
  root: resolve(rootDir, "src/renderer"),
  base: "./",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version)
  },
  build: {
    outDir: resolve(rootDir, "dist/renderer"),
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
