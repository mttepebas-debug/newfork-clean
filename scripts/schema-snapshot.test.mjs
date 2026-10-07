#!/usr/bin/env node
// SCHEMA-SNAP: the parts of schema-snapshot.mjs that need no database -- the
// throwaway project never lands on the shared stack, and the freshness
// fingerprint follows the migrations, not line endings or folder order.
// Run: node --test scripts/schema-snapshot.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apartConfig, fingerprint, headerHash, render } from "./schema-snapshot.mjs";

const config = (root) => fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
const repo = path.resolve(import.meta.dirname, "..");

test("the throwaway project leaves newfork-clean and every 553xx port", () => {
  const out = apartConfig(config(repo));
  assert.match(out, /^project_id = "newfork-schema-snap"$/m);
  assert.doesNotMatch(out, /newfork-clean/);
  assert.doesNotMatch(out, /^(shadow_)?port = 553/m);
  assert.match(out, /^port = 59522$/m);
});

test("a config it cannot retarget is refused, never started", () => {
  assert.throws(() => apartConfig("[db]\nport = 55322\n"));
  assert.throws(() => apartConfig('project_id = "newfork-clean"\n[db]\nport = 55322 # db\n'));
});

test("the fingerprint follows names and content, not line endings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nf-schema-snap-test-"));
  try {
    fs.writeFileSync(path.join(dir, "2_b.sql"), "select 2;\n");
    fs.writeFileSync(path.join(dir, "1_a.sql"), "select 1;\n");
    const before = fingerprint(dir);
    assert.deepEqual([before.count, before.last], [2, "2_b.sql"]);
    fs.writeFileSync(path.join(dir, "1_a.sql"), "select 1;\r\n");
    assert.equal(fingerprint(dir).hash, before.hash);
    fs.writeFileSync(path.join(dir, "1_a.sql"), "select 10;\n");
    assert.notEqual(fingerprint(dir).hash, before.hash);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the rendered file carries its fingerprint and no CR at all", () => {
  const fp = { count: 1, last: "1_a.sql", hash: "a".repeat(64) };
  // 20260909003001 keeps CR bytes in a function body: "AS $$\r\r\n select ..."
  const text = render("\r\n\r\nCREATE FUNCTION f() AS $$\r\r\n select 1;\r\n$$;\r\n\r\n", fp);
  assert.equal(headerHash(text), fp.hash);
  assert.ok(text.endsWith("\n\nCREATE FUNCTION f() AS $$\n select 1;\n$$;\n"));
  assert.doesNotMatch(text, /\r/);
});
