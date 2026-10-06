import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { MOTION_BOOT_SCRIPT } from "./src/motion/env";

/** Puts the motion boot script inline in <head>, before first paint. */
function motionBoot(): Plugin {
  return {
    name: "newfork-motion-boot",
    transformIndexHtml(html) {
      return html.replace("<!--motion-boot-->", `<script>${MOTION_BOOT_SCRIPT}</script>`);
    },
  };
}

// The marketing site is prerendered: `vite build` makes the client bundle,
// `vite build --ssr` makes the renderer, and scripts/prerender.mjs writes one
// HTML file per route (see README.md).
export default defineConfig(({ mode }) => ({
  envDir: mode === "test" ? false : undefined,
  plugins: [react(), motionBoot()],
  build: {
    target: "es2022",
    // One stylesheet for the whole site: prerendered pages paint styled
    // before any route chunk has loaded.
    cssCodeSplit: false,
    manifest: true,
    assetsInlineLimit: 0,
  },
  server: { port: 5650 },
  preview: { port: 5651 },
  test: {
    environment: "node",
    globals: true,
  },
}));
