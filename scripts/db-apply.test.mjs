import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pending, applySql, version } from "./db-apply.mjs";

const md5 = (t) => createHash("md5").update(t).digest("hex");
const a = { file: "20261001000000_a.sql", sql: "create table a();" };
const b = { file: "20261002000000_b.sql", sql: "create table b();" };

test("a migration the ledger lacks is applied; one it has with the same content is skipped", () => {
  const ledger = new Map([[version(a.file), { md5: md5(a.sql), n: 1 }]]);
  assert.deepEqual(pending(ledger, [a, b]), { apply: [b.file], stop: null });
});

test("an out-of-order file (renamed to its live version) is still applied", () => {
  const ledger = new Map([[version(b.file), { md5: md5(b.sql), n: 1 }]]);
  assert.deepEqual(pending(ledger, [a, b]).apply, [a.file]);
});

test("a ledger row with other content stops the run before anything after it", () => {
  const ledger = new Map([[version(a.file), { md5: "x", n: 1 }]]);
  const r = pending(ledger, [a, b]);
  assert.deepEqual(r.apply, []);
  assert.match(r.stop, /başka içerikle/);
});

test("a file the CLI split into statements cannot be compared and stops the run", () => {
  const ledger = new Map([[version(a.file), { md5: "x", n: 3 }]]);
  assert.match(pending(ledger, [a]).stop, /3 deyim/);
});

test("the ledger row goes in with the migration, its body dollar-quoted even when it holds the quote tag", () => {
  const sql = "select '$nf_apply$';";
  const out = applySql("20261003000000_it's.sql", sql);
  assert.match(out, /values \('20261003000000', 'it''s', array\[\$nf_apply1\$select '\$nf_apply\$';\$nf_apply1\$\]\)/);
});
