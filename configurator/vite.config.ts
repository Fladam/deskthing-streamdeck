// Builds the configurator into ONE self-contained HTML file, which
// scripts/embed-configurator.mjs embeds into the server bundle.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here("."),
  plugins: [react(), viteSingleFile()],
  css: {
    postcss: { plugins: [tailwindcss({ config: here("./tailwind.config.js") }), autoprefixer()] },
  },
  build: { outDir: here("../.configurator-build"), emptyOutDir: true },
  // `npm run dev:configurator`: hot-reloading UI that talks to the running app's API.
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8891",
        changeOrigin: true,
        configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("origin")),
      },
    },
  },
});
