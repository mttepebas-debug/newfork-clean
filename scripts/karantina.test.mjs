#!/usr/bin/env node
// WORKFLOW-V2 (S-106): e2e/karantina.mjs, the e2e quarantine list. Pure parsing on made-up text; never the
// real e2e/karantina.txt.
// Run: node --test scripts/karantina.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKarantina, grepInvertFrom, MAX_DAYS, MIN_PATTERN } from "../e2e/karantina.mjs";

const TODAY = "2026-10-08";

test("parseKarantina: a valid line gives its title part; comments and blank lines are skipped", () => {
  const text = ["# header", "", "  employee hub shows tomorrow | BL-612 | 2026-10-08 | 2026-10-10  ", "   # indented comment"].join("\n");
  assert.deepEqual(parseKarantina(text, TODAY), { patterns: ["employee hub shows tomorrow"], expired: [], invalid: [] });
});

test("parseKarantina: the end date itself still counts; the day after it the entry is expired and ignored", () => {
  const line = "publish dialog closes | BL-1 | 2026-10-05 | 2026-10-08";
  assert.deepEqual(parseKarantina(line, TODAY).patterns, ["publish dialog closes"]);
  const r = parseKarantina(line, "2026-10-09");
  assert.deepEqual(r, { patterns: [], expired: [line], invalid: [] });
});

test("parseKarantina: end minus start more than MAX_DAYS is invalid; exactly MAX_DAYS is fine", () => {
  assert.equal(MAX_DAYS, 7);
  const ok = "schedule week one | BL-2 | 2026-10-08 | 2026-10-15"; // 7 days
  const far = "schedule week two | BL-3 | 2026-10-08 | 2026-10-16"; // 8 days
  const old = "schedule week three | BL-4 | 2026-10-01 | 2026-10-09"; // 8 days, though only 1 day left
  assert.deepEqual(parseKarantina([ok, far, old].join("\n"), TODAY), { patterns: ["schedule week one"], expired: [], invalid: [far, old] });
});

test("parseKarantina: a start after the end, or after today, is invalid", () => {
  const backwards = "schedule week four | BL-5 | 2026-10-10 | 2026-10-09";
  const future = "schedule week five | BL-6 | 2026-10-09 | 2026-10-12";
  assert.deepEqual(parseKarantina([backwards, future].join("\n"), TODAY).invalid, [backwards, future]);
});

test("parseKarantina: a title part shorter than MIN_PATTERN characters is invalid (it would skip too much)", () => {
  assert.equal(MIN_PATTERN, 12);
  const short = "publish | BL-7 | 2026-10-08 | 2026-10-09"; // 7 characters
  const twelve = "publish week | BL-8 | 2026-10-08 | 2026-10-09"; // exactly 12
  assert.deepEqual(parseKarantina([short, twelve].join("\n"), TODAY), { patterns: ["publish week"], expired: [], invalid: [short] });
});

test("parseKarantina: ' › ' between describe and test becomes one space, as Playwright joins titles", () => {
  const r = parseKarantina("Schedule › owner publishes | BL-9 | 2026-10-08 | 2026-10-09", TODAY);
  assert.deepEqual(r.patterns, ["Schedule owner publishes"]);
  assert.ok(grepInvertFrom(r.patterns).test("flows/schedule.spec.ts Schedule owner publishes the week"));
});

test("parseKarantina: malformed lines are invalid, not quarantined", () => {
  const bad = [
    "only a title that is long",
    "title that is long | BL-4 | 2026-10-08", // no end date (old three-part form)
    " | BL-5 | 2026-10-08 | 2026-10-09", // empty title part
    "title that is long | 612 | 2026-10-08 | 2026-10-09", // no BL- prefix
    "title that is long | BL-x | 2026-10-08 | 2026-10-09",
    "title that is long | BL-6 | 08.10.2026 | 2026-10-09", // wrong date format
    "title that is long | BL-7 | 2026-10-08 | 2026-02-30", // no such day
    "title that is long | BL-8 | 2026-10-08 | 2026-10-09 | extra",
  ];
  const r = parseKarantina(bad.join("\r\n"), TODAY);
  assert.deepEqual(r.patterns, []);
  assert.deepEqual(r.expired, []);
  assert.deepEqual(r.invalid, bad.map((l) => l.trim()));
});

test("parseKarantina: an empty file or one with only comments quarantines nothing", () => {
  const none = { patterns: [], expired: [], invalid: [] };
  assert.deepEqual(parseKarantina("", TODAY), none);
  assert.deepEqual(parseKarantina("# a\n# b\n\n", TODAY), none);
});

test("parseKarantina: today may be a Date (its local calendar day)", () => {
  const line = "employee hub tomorrow | BL-9 | 2026-10-08 | 2026-10-08";
  assert.deepEqual(parseKarantina(line, new Date(2026, 9, 8, 23, 59)).patterns, ["employee hub tomorrow"]);
  assert.deepEqual(parseKarantina(line, new Date(2026, 9, 9, 0, 1)).patterns, []);
});

test("grepInvertFrom: no pattern means no filter", () => {
  assert.equal(grepInvertFrom([]), undefined);
});

test("grepInvertFrom: regex characters are literal; any one pattern matches", () => {
  const re = grepInvertFrom(["owner (admin) sees $5.00 + tax?", "a|b", "[x]"]);
  assert.ok(re instanceof RegExp);
  assert.ok(re.test("Schedule owner (admin) sees $5.00 + tax? on publish"));
  assert.ok(re.test("title with a|b inside"));
  assert.ok(re.test("[x] marks"));
  assert.ok(!re.test("owner admin sees 5.00 tax"));
  assert.ok(!re.test("a")); // "a|b" is not an alternation
  assert.ok(!re.test("x"));
});
