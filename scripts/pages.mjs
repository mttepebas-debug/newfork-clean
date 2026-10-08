#!/usr/bin/env node
// OTOMASYON-4: the shared pages folder for published claude.ai pages (CLAUDE.md §6).
// Mert runs two Claude accounts on one PC and neither sees the other's artifacts, so every
// page file lives in newfork-pages/ and both accounts publish from there. This script keeps
// that folder's local gallery (index.html) and its link catalog (pages.json).
//
//   node scripts/pages.mjs index                          rebuild index.html
//   node scripts/pages.mjs link <file> <hesap1|hesap2> <url>   record an account's link, rebuild
//
// pages.json: { "accounts": { "hesap1": "<label>", "hesap2": "<label>" },
//               "pages": [ { "file": "x.html" | "dir/", "title"?: "...", "links": { "hesap1": "<url>" } } ] }
// A catalogued entry without "file" is a page that exists only as a link (no local copy yet).
// Directory is overridable via NEWFORK_PAGES_DIR (tests only).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PAGES_DIR = process.env.NEWFORK_PAGES_DIR ?? "C:/Users/TheWe/Documents/Codex/newfork-pages";

const ACCOUNTS = ["hesap1", "hesap2"];
const ARTIFACT_URL = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9-]+$/;
const at = (...p) => path.join(PAGES_DIR, ...p);

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readTitle(file) {
  try {
    const head = fs.readFileSync(file, "utf8").slice(0, 200_000);
    // <title> holds plain text (RCDATA): anything up to </title> is the title, even "<b>".
    const m = head.match(/<title>([\s\S]*?)<\/title>/i);
    return m?.[1].trim() || null;
  } catch {
    return null;
  }
}

// Pages on disk: every *.html except the gallery, and every folder that has an index.html.
export function scanPages() {
  let names = [];
  try {
    names = fs.readdirSync(PAGES_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const pages = [];
  for (const entry of names) {
    if (entry.isFile() && /\.html$/i.test(entry.name) && entry.name.toLowerCase() !== "index.html") {
      const file = at(entry.name);
      pages.push({ file: entry.name, open: entry.name, title: readTitle(file) ?? entry.name, mtime: fs.statSync(file).mtime });
    } else if (entry.isDirectory()) {
      const file = at(entry.name, "index.html");
      if (!fs.existsSync(file)) continue;
      pages.push({
        file: `${entry.name}/`,
        open: `${entry.name}/index.html`,
        title: readTitle(file) ?? entry.name,
        mtime: fs.statSync(file).mtime,
      });
    }
  }
  return pages;
}

function readCatalog() {
  try {
    const parsed = JSON.parse(fs.readFileSync(at("pages.json"), "utf8"));
    return { accounts: parsed.accounts ?? {}, pages: Array.isArray(parsed.pages) ? parsed.pages : [] };
  } catch {
    return { accounts: {}, pages: [] };
  }
}

const sameFile = (a, b) => a && b && a.replace(/\/$/, "").toLowerCase() === b.replace(/\/$/, "").toLowerCase();

function galleryEntries() {
  const catalog = readCatalog();
  const disk = scanPages().map((p) => {
    const entry = catalog.pages.find((c) => sameFile(c.file, p.file));
    return { ...p, title: entry?.title || p.title, links: entry?.links ?? {} };
  });
  disk.sort((a, b) => b.mtime - a.mtime);
  const linkOnly = catalog.pages
    .filter((c) => !disk.some((p) => sameFile(p.file, c.file)))
    .map((c) => ({ file: c.file ?? null, open: null, title: c.title || c.file || "?", mtime: null, links: c.links ?? {} }));
  return { accounts: catalog.accounts, entries: [...disk, ...linkOnly] };
}

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const href = (rel) => rel.split("/").map(encodeURIComponent).join("/");
const when = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

function renderIndex({ accounts, entries }) {
  const label = (key, i) => accounts[key] || `Hesap ${i + 1}`;
  const rows = entries
    .map((e) => {
      const name = e.open
        ? `<a class="open" href="${href(e.open)}">${escape(e.title)}</a>`
        : `<span class="open none">${escape(e.title)}</span>`;
      const meta = e.open
        ? `<span>${escape(e.file)}</span><span>Değişti: ${escape(when.format(e.mtime))}</span>`
        : `<span>dosya yok — bu PC'de kopyası yok</span>`;
      const links = ACCOUNTS.map((key, i) => {
        const url = e.links?.[key];
        return ARTIFACT_URL.test(url ?? "")
          ? `<a class="acct" href="${escape(url)}" target="_blank" rel="noopener">${escape(label(key, i))} ↗</a>`
          : `<span class="acct missing">${escape(label(key, i))}: link yok</span>`;
      }).join("");
      return `<li><div class="name">${name}<div class="meta">${meta}</div></div><div class="links">${links}</div></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sayfa Galerisi</title>
<style>
:root { --bg: #f4f6f5; --surface: #ffffff; --ink: #17221e; --muted: #5f6b66; --line: #d8e0dc; --accent: #176954; --accent-soft: #e4f0eb; color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px 56px; }
h1 { margin: 0 0 4px; font-size: 24px; }
.lead { margin: 0 0 20px; color: var(--muted); }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.name { min-width: 0; flex: 1 1 320px; }
.open { color: var(--ink); font-weight: 600; font-size: 16px; text-decoration: none; }
a.open:hover { color: var(--accent); text-decoration: underline; }
.open.none { color: var(--muted); }
.meta { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.links { display: flex; flex-wrap: wrap; gap: 8px; }
.acct { padding: 4px 10px; border-radius: 999px; font-size: 13px; white-space: nowrap; }
a.acct { background: var(--accent-soft); color: var(--accent); font-weight: 600; text-decoration: none; }
a.acct:hover { text-decoration: underline; }
.acct.missing { color: var(--muted); border: 1px dashed var(--line); }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
@media (max-width: 560px) { .meta { flex-direction: column; gap: 0; } }
</style>
</head>
<body>
<main>
<h1>Sayfa Galerisi</h1>
<p class="lead">Yayınlanan sayfaların bu PC'deki en güncel hâli. Son değişen en üstte. Adına tıklayınca dosya açılır; hesap düğmeleri o hesaptaki yayını açar.</p>
<ul>
${rows}
</ul>
</main>
</body>
</html>
`;
}

export function buildIndex() {
  const gallery = galleryEntries();
  writeAtomic(at("index.html"), renderIndex(gallery));
  return { ok: true, message: `index.html: ${gallery.entries.length} sayfa`, count: gallery.entries.length };
}

export function setLink(file, account, url) {
  if (!ACCOUNTS.includes(account)) return { ok: false, message: `hesap "${account}" bilinmiyor: ${ACCOUNTS.join(" | ")}` };
  if (!ARTIFACT_URL.test(url ?? "")) return { ok: false, message: `"${url}" bir claude.ai sayfa linki değil` };
  const catalog = readCatalog();
  let entry = catalog.pages.find((c) => sameFile(c.file, file) || (!c.file && c.title === file));
  if (!entry) {
    const onDisk = scanPages().find((p) => sameFile(p.file, file));
    if (!onDisk) return { ok: false, message: `"${file}" ne klasörde ne pages.json'da var` };
    entry = { file: onDisk.file, links: {} };
    catalog.pages.push(entry);
  }
  entry.links = { ...entry.links, [account]: url };
  writeAtomic(at("pages.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  const built = buildIndex();
  return { ok: true, message: `${entry.file ?? entry.title}: ${account} linki kaydedildi; ${built.message}` };
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const result =
    cmd === "index"
      ? buildIndex()
      : cmd === "link" && args.length === 3
        ? setLink(...args)
        : { ok: false, message: "kullanım: pages.mjs index | pages.mjs link <dosya> <hesap1|hesap2> <url>" };
  (result.ok ? console.log : console.error)(result.message);
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
