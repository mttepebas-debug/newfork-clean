#!/usr/bin/env node
// OTOMASYON-4: the shared pages folder (newfork-pages) and its local gallery.
// Runs against a throwaway temp directory (NEWFORK_PAGES_DIR) -- never the real folder.
// Run: node --test scripts/pages.test.mjs
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-pages-test-"));
process.env.NEWFORK_PAGES_DIR = tmpDir;

const { scanPages, buildIndex, setLink } = await import("./pages.mjs");

const page = (title) => `<!doctype html><html><head><title>${title}</title></head><body>x</body></html>`;
const write = (rel, body, mtime) => {
  const p = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  if (mtime) fs.utimesSync(p, mtime, mtime);
};
const catalog = () => JSON.parse(fs.readFileSync(path.join(tmpDir, "pages.json"), "utf8"));
const indexHtml = () => fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");

beforeEach(() => {
  for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { recursive: true, force: true });
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("scan finds single-file pages and folder pages, not the gallery itself or other files", () => {
  write("employees-list-lab.html", page("Employees List Lab"));
  write("giris-ve-katilim-kesfi/index.html", page("Giriş ve Katılım Keşfi"));
  write("giris-ve-katilim-kesfi/shots/a.png", "png");
  write("index.html", page("Gallery"));
  write("notes.txt", "not a page");

  const found = scanPages().map(({ file, title }) => ({ file, title }));
  assert.deepEqual(
    found.sort((a, b) => a.file.localeCompare(b.file)),
    [
      { file: "employees-list-lab.html", title: "Employees List Lab" },
      { file: "giris-ve-katilim-kesfi/", title: "Giriş ve Katılım Keşfi" },
    ],
  );
});

test("a page without a <title> falls back to its file name", () => {
  write("no-title.html", "<p>hi</p>");
  assert.equal(scanPages()[0].title, "no-title.html");
});

test("the gallery lists the most recently changed page first", () => {
  write("old.html", page("Old Page"), new Date("2026-10-01T10:00:00Z"));
  write("new.html", page("New Page"), new Date("2026-10-08T10:00:00Z"));
  buildIndex();
  const html = indexHtml();
  assert.ok(html.indexOf("New Page") < html.indexOf("Old Page"), "newest page should come first");
});

test("the gallery escapes page titles", () => {
  write("x.html", page(`<b>Bold</b> & "quoted"`));
  buildIndex();
  const html = indexHtml();
  assert.ok(!html.includes("<b>Bold</b>"), "raw markup from a title must not reach the gallery");
  assert.ok(html.includes("&lt;b&gt;Bold&lt;/b&gt; &amp; &quot;quoted&quot;"));
});

test("the open link is relative and URI-encoded, folders open their index.html", () => {
  write("my page.html", page("Spaced"));
  write("folder-page/index.html", page("Folder"));
  buildIndex();
  const html = indexHtml();
  assert.ok(html.includes('href="my%20page.html"'));
  assert.ok(html.includes('href="folder-page/index.html"'));
  assert.ok(!/href="[A-Za-z]:/.test(html), "no absolute disk paths in links");
});

test("account links from pages.json show; an empty link is not a link", () => {
  write("a.html", page("A Page"));
  fs.writeFileSync(
    path.join(tmpDir, "pages.json"),
    JSON.stringify({ pages: [{ file: "a.html", links: { hesap1: "https://claude.ai/artifact/AAA", hesap2: "" } }] }),
  );
  buildIndex();
  const html = indexHtml();
  assert.ok(html.includes('href="https://claude.ai/artifact/AAA"'));
  assert.equal((html.match(/href="https:\/\/claude\.ai/g) ?? []).length, 1);
});

test("a catalogued page with no file is listed after the files, marked as having no file", () => {
  write("a.html", page("On Disk"));
  fs.writeFileSync(
    path.join(tmpDir, "pages.json"),
    JSON.stringify({ pages: [{ title: "Shared Elsewhere", links: { hesap1: "https://claude.ai/artifact/BBB" } }] }),
  );
  buildIndex();
  const html = indexHtml();
  assert.ok(html.indexOf("On Disk") < html.indexOf("Shared Elsewhere"));
  assert.match(html, /Shared Elsewhere[\s\S]*?dosya yok/);
});

test("the gallery loads nothing from the network", () => {
  write("a.html", page("A"));
  buildIndex();
  const html = indexHtml();
  assert.ok(!/<script[^>]+src=/i.test(html));
  assert.ok(!/<link[^>]+rel="?stylesheet/i.test(html));
  assert.ok(!/<img[^>]+src="?https?:/i.test(html));
});

test("setLink records an account link for a page on disk and rebuilds the gallery", () => {
  write("a.html", page("A Page"));
  const result = setLink("a.html", "hesap2", "https://claude.ai/artifact/CCC");
  assert.equal(result.ok, true);
  assert.equal(catalog().pages.find((p) => p.file === "a.html").links.hesap2, "https://claude.ai/artifact/CCC");
  assert.ok(indexHtml().includes("https://claude.ai/artifact/CCC"));
});

test("setLink keeps the other account's link when it adds one", () => {
  write("a.html", page("A Page"));
  setLink("a.html", "hesap1", "https://claude.ai/artifact/AAA");
  setLink("a.html", "hesap2", "https://claude.ai/artifact/CCC");
  assert.deepEqual(catalog().pages.find((p) => p.file === "a.html").links, {
    hesap1: "https://claude.ai/artifact/AAA",
    hesap2: "https://claude.ai/artifact/CCC",
  });
});

test("setLink refuses a link that is not a claude.ai artifact", () => {
  write("a.html", page("A Page"));
  const result = setLink("a.html", "hesap1", "https://example.com/x");
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(tmpDir, "pages.json")), false);
});

test("setLink refuses an unknown account and a page that is neither on disk nor catalogued", () => {
  write("a.html", page("A Page"));
  assert.equal(setLink("a.html", "hesap3", "https://claude.ai/artifact/AAA").ok, false);
  assert.equal(setLink("missing.html", "hesap1", "https://claude.ai/artifact/AAA").ok, false);
});

test("the CLI builds the gallery", () => {
  write("a.html", page("CLI Page"));
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "pages.mjs");
  const run = spawnSync(process.execPath, [script, "index"], { env: { ...process.env }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(indexHtml().includes("CLI Page"));
});
