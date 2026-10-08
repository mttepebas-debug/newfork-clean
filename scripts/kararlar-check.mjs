#!/usr/bin/env node
// WORKFLOW-V2 (spec §6.2): no decision drops silently.
//   - every principle (P01…) of the archived ILKELER and every id the old KARARLAR defined (UI-05, OPS-08, …)
//     is in the new docs/plan/KARARLAR.md, in its body or in "Bırakılanlar";
//   - every coordinator decision (KK-n) and every lesson heading of the archive is classified in SINIFLAMA.md.
// Run: node scripts/kararlar-check.mjs   (exit 1 lists what is missing; over 700 lines is a warning)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ARCHIVE = "docs/archive/2026-10-08-v1";
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const uniq = (a) => [...new Set(a)];

// ILKELER writes a principle as a bold lead (**P01. …**); a heading form is read too.
export const principleIds = (text) => uniq([...text.matchAll(/^(?:#{2,4}\s*|\*\*)(P\d{2})\b/gm)].map((m) => m[1]));
// Ids an entry defines: a table row's first cell, a bold lead, a heading -- not a mention inside prose.
export const definedIds = (text) =>
  uniq([...text.matchAll(/^(?:\|\s*|[-*]\s+\*\*|\*\*|#{2,4}\s*)([A-Z]{1,6}-\d{1,4}[a-z]?)\b/gm)].map((m) => m[1]));
export const kkIds = (text) => uniq([...text.matchAll(/^#{2,4}\s*(KK-\d+)\b/gm)].map((m) => m[1]));
export const lessonHeads = (text) => [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
const mentions = (text, id) => new RegExp(`(^|[^\\w-])${id.replaceAll("-", "\\-")}([^\\w-]|$)`, "m").test(text);

export function check(root) {
  const kararlar = read(root, "docs/plan/KARARLAR.md");
  const sinif = read(root, `${ARCHIVE}/SINIFLAMA.md`);
  const missing = [];
  for (const id of principleIds(read(root, `${ARCHIVE}/ILKELER.md`))) if (!mentions(kararlar, id)) missing.push(`KARARLAR.md'de yok: ${id} (ILKELER)`);
  for (const id of definedIds(read(root, `${ARCHIVE}/KARARLAR-v1.md`))) if (!mentions(kararlar, id)) missing.push(`KARARLAR.md'de yok: ${id} (eski KARARLAR)`);
  for (const id of kkIds(read(root, `${ARCHIVE}/KOORDINATOR-KARARLARI.md`))) if (!mentions(sinif, id)) missing.push(`SINIFLAMA.md'de yok: ${id}`);
  for (const h of lessonHeads(read(root, `${ARCHIVE}/DERSLER.md`))) if (!sinif.includes(h.slice(0, 40))) missing.push(`SINIFLAMA.md'de yok: ders "${h.slice(0, 60)}"`);
  const lines = kararlar.split("\n").length;
  return { missing, warnings: lines > 700 ? [`KARARLAR.md ${lines} satır (hedef ≤ 700)`] : [] };
}

function main() {
  const r = check(process.cwd());
  for (const w of r.warnings) console.log(`UYARI: ${w}`);
  for (const m of r.missing) console.log(m);
  console.log(r.missing.length ? `${r.missing.length} eksik` : "tamam: hiçbir karar sessizce düşmedi");
  process.exitCode = r.missing.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
