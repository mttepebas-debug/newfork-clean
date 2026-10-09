#!/usr/bin/env node
// WORKFLOW-V2 (S-106): e2e/karantina.mjs, the e2e quarantine list. Pure parsing on made-up text; never the
// real e2e/karantina.txt.
// Run: node --test scripts/karantina.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKarantina, grepInvertFrom, MAX_DAYS } from "../e2e/karantina.mjs";

const TODAY = "2026-10-08";

test("parseKarantina: a valid line gives its title part; comments and blank lines are skipped", () => {
  const text = ["# header", "", "  employee hub shows tomorrow | BL-612 | 2026-10-10  ", "   # indented comment"].join("\n");
  assert.deepEqual(parseKarantina(text, TODAY), { patterns: ["employee hub shows tomorrow"], expired: [], invalid: [] });
});

test("parseKarantina: the end date itself still counts; the day after it the entry is expired and ignored", () => {
  const line = "publish dialog | BL-1 | 2026-10-08";
  assert.deepEqual(parseKarantina(line, TODAY).patterns, ["publish dialog"]);
  const r = parseKarantina(line, "2026-10-09");
  assert.deepEqual(r, { patterns: [], expired: [line], invalid: [] });
});

test("parseKarantina: an end date more than MAX_DAYS from today is invalid and ignored", () => {
  assert.equal(MAX_DAYS, 7);
  const ok = "a | BL-2 | 2026-10-15"; // exactly 7 days
  const far = "b | BL-3 | 2026-10-16"; // 8 days
  assert.deepEqual(parseKarantina([ok, far].join("\n"), TODAY), { patterns: ["a"], expired: [], invalid: [far] });
});

test("parseKarantina: malformed lines are invalid, not quarantined", () => {
  const bad = [
    "only a title",
    "title | BL-4", // no date
    " | BL-5 | 2026-10-09", // empty title part
    "title | 612 | 2026-10-09", // no BL- prefix
    "title | BL-x | 2026-10-09",
    "title | BL-6 | 09.10.2026", // wrong date format
    "title | BL-7 | 2026-02-30", // no such day
    "title | BL-8 | 2026-10-09 | extra",
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
  assert.deepEqual(parseKarantina("x | BL-9 | 2026-10-08", new Date(2026, 9, 8, 23, 59)).patterns, ["x"]);
  assert.deepEqual(parseKarantina("x | BL-9 | 2026-10-08", new Date(2026, 9, 9, 0, 1)).patterns, []);
});

test("grepInvertFrom: no pattern means no filter", () => {
  assert.equal(grepInvertFrom([]), undefined);
});

test("grepInvertFrom: regex characters are literal; any one pattern matches", () => {
  const re = grepInvertFrom(["owner (admin) sees $5.00 + tax?", "a|b", "[x]"]);
  assert.ok(re instanceof RegExp);
  assert.ok(re.test("Schedule › owner (admin) sees $5.00 + tax? on publish"));
  assert.ok(re.test("title with a|b inside"));
  assert.ok(re.test("[x] marks"));
  assert.ok(!re.test("owner admin sees 5.00 tax"));
  assert.ok(!re.test("a")); // "a|b" is not an alternation
  assert.ok(!re.test("x"));
});
