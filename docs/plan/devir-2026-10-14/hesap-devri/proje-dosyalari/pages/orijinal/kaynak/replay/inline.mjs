// Turns the Vite build into one self-contained HTML document (CSS and JS
// inline, fonts as data URIs), served next to a page as today/index.html.
// Usage: node inline.mjs <out.html>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("./dist/", import.meta.url));
const out = process.argv[2];
const assets = readdirSync(`${dist}assets`);
const js = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".js"))}`, "utf8");
let css = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".css"))}`, "utf8");
css = css.replace(/url\((["']?)\/fonts\/([^)"']+)\1\)/g, (_, _quote, file) =>
  `url(data:font/woff2;base64,${readFileSync(`${dist}fonts/${file}`).toString("base64")})`);
if (/url\((["']?)\/(?!\/)/.test(css)) throw new Error("CSS still points at a server path");
const page = `<!doctype html>
<html lang="en" data-theme="light" style="color-scheme: light">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Newfork today</title>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script").replace(/\uFFFD/g, "\\uFFFD")}</script>
</body>
</html>
`;
writeFileSync(out, page);
console.log(out, (Buffer.byteLength(page) / 1024 / 1024).toFixed(2), "MB");
