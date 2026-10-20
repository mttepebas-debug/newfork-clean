import { test } from "node:test";
import assert from "node:assert/strict";
import { pending, applySql, version, fingerprint } from "./db-apply.mjs";

const a = { file: "20261001000000_a.sql", sql: "create table a();" };
const b = { file: "20261002000000_b.sql", sql: "create table b();" };

test("a migration the ledger lacks is applied; one it has with the same content is skipped", () => {
  const ledger = new Map([[version(a.file), { md5: fingerprint(a.sql), n: 1 }]]);
  assert.deepEqual(pending(ledger, [a, b]), { apply: [b.file], stop: null, cli: 0 });
});

test("an out-of-order file (renamed to its live version) is still applied", () => {
  const ledger = new Map([[version(b.file), { md5: fingerprint(b.sql), n: 1 }]]);
  assert.deepEqual(pending(ledger, [a, b]).apply, [a.file]);
});

test("a one-statement row with other content stops the run before anything after it", () => {
  const ledger = new Map([[version(a.file), { md5: "x", n: 1 }]]);
  const r = pending(ledger, [a, b]);
  assert.deepEqual(r.apply, []);
  assert.match(r.stop, /başka içerikle/);
});

// Mert 2026-10-20 ("düzeltilsin"): the shared DB's older rows were written by the CLI, statement by statement, so a
// split row can't be compared with its file: it counts as applied and the run goes on.
test("a row the CLI split into statements counts as applied, and the run goes on", () => {
  const ledger = new Map([[version(a.file), { md5: "x", n: 3 }]]);
  assert.deepEqual(pending(ledger, [a, b]), { apply: [b.file], stop: null, cli: 1 });
});

// The CLI keeps one statement without its semicolon or final newline; db-apply and MCP keep the whole file.
test("a one-statement row is the same text whatever its end: semicolon, newline, spaces", () => {
  const sql = "alter type t add value 'x';\n";
  for (const kept of ["alter type t add value 'x'", "alter type t add value 'x';", sql, "alter type t add value 'x';  \r\n"])
    assert.equal(fingerprint(kept), fingerprint(sql));
  assert.notEqual(fingerprint("alter type t add value 'y';"), fingerprint(sql));
});

test("the ledger row goes in with the migration, its body dollar-quoted even when it holds the quote tag", () => {
  const sql = "select '$nf_apply$';";
  const out = applySql("20261003000000_it's.sql", sql);
  assert.match(out, /values \('20261003000000', 'it''s', array\[\$nf_apply1\$select '\$nf_apply\$';\$nf_apply1\$\]\)/);
});
