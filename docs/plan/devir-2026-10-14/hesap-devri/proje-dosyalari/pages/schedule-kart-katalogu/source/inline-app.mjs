// Writes the build as one self-contained document (app.html) for the page's
// frame, and the small page around it (index.html). Big pages go up as a
// supporting file; the viewer refuses an 8 MB page on its own.
// Usage: node inline-app.mjs <out dir>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("./dist/", import.meta.url));
const [out] = process.argv.slice(2);
if (!out) throw new Error("Usage: node inline-app.mjs <out dir>");
const assets = readdirSync(`${dist}assets`);
const js = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".js"))}`, "utf8");
let css = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".css"))}`, "utf8");
css = css.replace(/url\((["']?)\/fonts\/([^)"']+)\1\)/g, (_, _quote, file) =>
  `url(data:font/woff2;base64,${readFileSync(`${dist}fonts/${file}`).toString("base64")})`);
if (/url\((["']?)\//.test(css)) throw new Error("CSS still points at a server path");
const app = `<!doctype html>
<html lang="en" data-theme="light" style="color-scheme: light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Schedule shift cards</title>
<style>body { margin: 0; font-size: 16px; background: var(--theme-page, #f4f5f3); color: var(--theme-text-body, #1f2937); }</style>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div id="root" data-atlas-page="schedule"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script").replace(/\uFFFD/g, "\\uFFFD")}</script>
</body>
</html>
`;
writeFileSync(`${out}/app.html`, app);
const shell = `<title>Schedule shift cards</title>
<style>
  :root { color-scheme: light; }
  html, body { height: 100%; margin: 0; background: #f4f5f3; }
  body { display: flex; flex-direction: column; }
  iframe { display: block; flex: 1 1 auto; width: 100%; min-height: 0; border: 0; background: #f4f5f3; }
</style>
<iframe title="Schedule with demo data and the card catalog" name="pages:s=3.0&amp;sc=owner&amp;frame=solo" src="app.html#s=3.0&amp;sc=owner&amp;frame=solo"></iframe>
`;
writeFileSync(`${out}/index.html`, shell);
console.log(`${out}/app.html`, (Buffer.byteLength(app) / 1024 / 1024).toFixed(2), "MB; index.html", Buffer.byteLength(shell), "bytes");
