// Turns the Vite build into one self-contained page for the Artifact viewer:
// CSS and JS inline, fonts as data URIs. The viewer wraps the file in its own
// <html>/<head>/<body>, so the output starts at <title>.
// Usage: node inline.mjs <page id> <page title> <out.html>
// One build serves every atlas page; the page id picks which screen it opens.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("./dist/", import.meta.url));
const [pageId, pageTitle, out] = process.argv.slice(2);
if (!pageId || !pageTitle || !out) throw new Error("Usage: node inline.mjs <page id> <page title> <out.html>");
const assets = readdirSync(`${dist}assets`);
const js = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".js"))}`, "utf8");
let css = readFileSync(`${dist}assets/${assets.find((name) => name.endsWith(".css"))}`, "utf8");
css = css.replace(/url\((["']?)\/fonts\/([^)"']+)\1\)/g, (_, _quote, file) =>
  `url(data:font/woff2;base64,${readFileSync(`${dist}fonts/${file}`).toString("base64")})`);
if (/url\((["']?)\//.test(css)) throw new Error("CSS still points at a server path");
// The viewer's skeleton gives body a 14px system font and no background; the
// real app's body inherits Inter at 16px from :root and shows the page color.
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const page = `<title>${escape(pageTitle)}</title>
<style>:root { color-scheme: light; } body { font: inherit; font-size: 16px; background: var(--theme-page, #f4f5f3); color: var(--theme-text-body, #1f2937); }</style>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
<div id="root" data-atlas-page="${escape(pageId)}"></div>
<script type="module">${js.replace(/<\/script/gi, "<\\/script").replace(/\uFFFD/g, "\\uFFFD")}</script>
`;
writeFileSync(out, page);
console.log(out, (Buffer.byteLength(page) / 1024 / 1024).toFixed(2), "MB");
