// Builds the app once and writes the PAGES files. Run from apps/web:
//   node .temp/pages/tools/build-pages.mjs [screen no ...]
// Output (PAGES_OUT, default /mnt/project-files/PAGES):
//   app.html                       the real app with demo data (shared by every screen)
//   <NN.MM>-<slug>.html            one shell page per screen (only the asked ones)
// tools/pages.json keeps each screen's Artifact link, sha and date.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { shellPage } from "./shell.mjs";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const outDir = process.env.PAGES_OUT ?? "/mnt/project-files/PAGES";
const repo = here("../../../../../");
const sha = execFileSync("git", ["-C", repo, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();
const built = new Date().toISOString().slice(0, 10);
const { screens } = JSON.parse(readFileSync(here("../screens.json"), "utf8"));
const manifestPath = here("./pages.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { index: null, screens: {} };
const wanted = process.argv.slice(2);
const chosen = screens.filter((screen) => wanted.length === 0 ? !screen.pending : wanted.includes(screen.no));

export const fileName = (screen) => {
  const [major, minor] = screen.no.split(".");
  const slug = screen.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${major.padStart(2, "0")}.${minor.padStart(2, "0")}-${slug}.html`;
};

mkdirSync(outDir, { recursive: true });

// Builds the app (with Schedule or without) as one self-contained document:
// CSS and JS inline, fonts as data URIs.
function buildApp(file, schedule) {
  execFileSync("./node_modules/.bin/vite", ["build", "--config", ".temp/pages/vite.config.ts", "--logLevel", "error"], {
    cwd: here("../../../"), stdio: "inherit",
    env: { ...process.env, ATLAS_SHA: sha, ATLAS_BUILT: built, ...(schedule ? { PAGES_SCHEDULE: "1" } : {}) },
  });
  const dist = process.env.PAGES_DIST ? `${process.env.PAGES_DIST.replace(/\/$/, "")}/` : here("../dist/");
  const assets = readdirSync(`${dist}assets`);
  const js = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".js"))}`, "utf8");
  let css = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".css"))}`, "utf8");
  css = css.replace(/url\((["']?)\/fonts\/([^)"']+)\1\)/g, (_, _quote, font) =>
    `url(data:font/woff2;base64,${readFileSync(`${dist}fonts/${font}`).toString("base64")})`);
  if (/url\((["']?)\//.test(css)) throw new Error("CSS still points at a server path");
  const app = `<!doctype html>
<html lang="en" data-theme="light" style="color-scheme: light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Newfork · PAGES</title>
<style>body { margin: 0; font-size: 16px; background: var(--theme-page, #f4f5f3); color: var(--theme-text-body, #1f2937); }</style>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script").replace(/\uFFFD/g, "\\uFFFD")}</script>
</body>
</html>
`;
  writeFileSync(`${outDir}/${file}`, app);
  console.log(file, (Buffer.byteLength(app) / 1024 / 1024).toFixed(2), "MB");
}

if (chosen.some((screen) => screen.area !== "schedule")) buildApp("app.html", false);
if (chosen.some((screen) => screen.area === "schedule")) buildApp("app-schedule.html", true);

for (const screen of chosen) {
  const file = fileName(screen);
  writeFileSync(`${outDir}/${file}`, shellPage(screen, { sha, built, indexUrl: manifest.index ?? "#" }));
  manifest.screens[screen.no] = { ...(manifest.screens[screen.no] ?? {}), file, title: screen.title, sha, built };
}
// PAGES_NO_MANIFEST: a trial build (a worker checking its scenarios) leaves pages.json alone.
if (!process.env.PAGES_NO_MANIFEST) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`main ${sha}: app.html and ${chosen.length} screen page(s) in ${outDir}`);
