#!/usr/bin/env node
// WORKFLOW-V2: scripts/kararlar-check.mjs on a small made-up archive. Run: node --test scripts/kararlar-check.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { check, principleIds, definedIds, kkIds, lessonHeads, ARCHIVE } from "./kararlar-check.mjs";

function root(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-kararlar-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const archive = {
  [`${ARCHIVE}/ILKELER.md`]: "# İlkeler\n**P01. Canlı müşteri yok.**\n### P02 Tam çözüm\n(P15) metin içinde geçen bir atıf\n",
  [`${ARCHIVE}/KARARLAR-v1.md`]: "| ID | Ne |\n|---|---|\n| UI-05 | tema |\n- **OPS-08** tren\nBL-216'ya bakın\n",
  [`${ARCHIVE}/KOORDINATOR-KARARLARI.md`]: "### KK-1 (2026-09-29) Tek iş\n### KK-2 (2026-09-29) Settings\n",
  [`${ARCHIVE}/DERSLER.md`]: "## 1. The list arrives in pieces\n## 13. A new tool was set up at full size\n",
};

test("ids: principles, defined ids (not mere mentions), coordinator decisions, lesson headings", () => {
  assert.deepEqual(principleIds(archive[`${ARCHIVE}/ILKELER.md`]), ["P01", "P02"]);
  assert.deepEqual(definedIds(archive[`${ARCHIVE}/KARARLAR-v1.md`]), ["UI-05", "OPS-08"]);
  assert.deepEqual(kkIds(archive[`${ARCHIVE}/KOORDINATOR-KARARLARI.md`]), ["KK-1", "KK-2"]);
  assert.deepEqual(lessonHeads(archive[`${ARCHIVE}/DERSLER.md`]), ["1. The list arrives in pieces", "13. A new tool was set up at full size"]);
});

test("check: everything carried or classified passes", () => {
  const dir = root({
    ...archive,
    "docs/plan/KARARLAR.md": "## 0\n**P01** …\n**P02** …\n## 3\n| UI-05 | … |\n## Bırakılanlar\n- OPS-08 — tren aracına taşındı\n",
    [`${ARCHIVE}/SINIFLAMA.md`]: "| KK-1 | tek seferlik | |\n| KK-2 | kural → S-01 | |\n| 1. The list arrives in pieces | kural → S-02 | |\n| 13. A new tool was set up at full size | kural → S-03 | |\n",
  });
  assert.deepEqual(check(dir), { missing: [], warnings: [] });
});

test("check: a dropped id and an unclassified decision are named; KK-1 does not pass for KK-12", () => {
  const dir = root({
    ...archive,
    "docs/plan/KARARLAR.md": "**P01** …\n| UI-05 | … |\nOPS-08\n",
    [`${ARCHIVE}/SINIFLAMA.md`]: "| KK-12 | tek seferlik | |\n| 1. The list arrives in pieces | kural | |\n",
  });
  const r = check(dir);
  assert.deepEqual(r.missing.sort(), [
    "KARARLAR.md'de yok: P02 (ILKELER)",
    "SINIFLAMA.md'de yok: KK-1",
    "SINIFLAMA.md'de yok: KK-2",
    'SINIFLAMA.md\'de yok: ders "13. A new tool was set up at full size"',
  ].sort());
});

test("check: over 700 lines is a warning, not a failure", () => {
  const dir = root({
    ...archive,
    "docs/plan/KARARLAR.md": `P01 P02 UI-05 OPS-08\n${"x\n".repeat(720)}`,
    [`${ARCHIVE}/SINIFLAMA.md`]: "KK-1 KK-2 1. The list arrives in pieces 13. A new tool was set up at full size\n",
  });
  const r = check(dir);
  assert.deepEqual(r.missing, []);
  assert.match(r.warnings[0], /satır \(hedef ≤ 700\)/);
});
