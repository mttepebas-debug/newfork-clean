// Like inline-app.mjs, but the script stays a separate file (app.js) next to app.html.
import { readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
const [dist, out, title = "Card mark drafts"] = process.argv.slice(2);
const assets = readdirSync(`${dist}/assets`);
const jsName = assets.find((name) => name.endsWith(".js"));
let css = readFileSync(`${dist}/assets/${assets.find((name) => name.endsWith(".css"))}`, "utf8");
css = css.replace(/url\((["']?)\/fonts\/([^)"']+)\1\)/g, (_, _quote, file) =>
  `url(data:font/woff2;base64,${readFileSync(`${dist}/fonts/${file}`).toString("base64")})`);
if (/url\((["']?)\//.test(css)) throw new Error("CSS still points at a server path");
const app = `<!doctype html>
<html lang="en" data-theme="light" style="color-scheme: light">
<head>
<script>if (!location.hash.includes("s=")) history.replaceState(null, "", location.pathname + location.search + "#s=3.0&sc=owner&frame=solo");</script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body { margin: 0; font-size: 16px; background: var(--theme-page, #f4f5f3); color: var(--theme-text-body, #1f2937); }</style>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div id="root" data-atlas-page="schedule"></div>
<script type="module" src="app.js"></script>
</body>
</html>
`;
writeFileSync(`${out}/app.html`, app);
copyFileSync(`${dist}/assets/${jsName}`, `${out}/app.js`);
console.log("app.html", Buffer.byteLength(app), "app.js", readFileSync(`${out}/app.js`).length);
