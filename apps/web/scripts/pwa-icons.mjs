// Writes the Home Screen icons in public/ from public/favicon.svg:
//   node apps/web/scripts/pwa-icons.mjs
// Placeholder until the brand mark is chosen; rerun after favicon.svg changes.
// "any" icons keep the favicon's rounded corners; the maskable one and iPhone's
// are full-bleed, because Android and iOS cut their own shape out of them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const rounded = readFileSync(path.join(publicDir, "favicon.svg"), "utf8");
const fullBleed = rounded.replace(/\s+rx="[^"]*"/, "");

const icons = [
  { file: "icon-192.png", size: 192, svg: rounded },
  { file: "icon-512.png", size: 512, svg: rounded },
  { file: "icon-maskable-512.png", size: 512, svg: fullBleed },
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed },
];

const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const { file, size, svg } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`);
    await page.screenshot({ path: path.join(publicDir, file), omitBackground: true });
    await page.close();
    console.log(`${file} ${size}x${size}`);
  }
} finally {
  await browser.close();
}
