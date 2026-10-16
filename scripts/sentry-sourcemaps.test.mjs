import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { mapFiles, run, TARGETS } from "./sentry-sourcemaps.mjs";

function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sentry-maps-"));
  for (const target of TARGETS) {
    fs.mkdirSync(path.join(root, target.dir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(root, target.dir, "assets", "index.js"), "x");
    fs.writeFileSync(path.join(root, target.dir, "assets", "index.js.map"), "{}");
  }
  return root;
}

const silent = () => {};
const web = (root) => path.join(root, "apps/web/dist");
const api = (root) => path.join(root, "apps/api/dist");

test("sentry-sourcemaps: without a token nothing is uploaded and nothing is deleted", () => {
  const root = world();
  const calls = [];

  assert.equal(run({ env: {}, cwd: root, cli: (args) => calls.push(args), log: silent }), 0);
  assert.equal(run({ env: { SENTRY_AUTH_TOKEN: " " }, cwd: root, cli: (args) => calls.push(args), log: silent }), 0);

  assert.deepEqual(calls, []);
  assert.equal(mapFiles(web(root)).length, 1);
});

test("sentry-sourcemaps: with a token both bundles go to their own project and the web maps are not served", () => {
  const root = world();
  const calls = [];

  run({ env: { SENTRY_AUTH_TOKEN: "t" }, cwd: root, cli: (args) => (calls.push(args), 0), log: silent });

  const uploads = calls.filter((args) => args[1] === "upload").map((args) => [args[5], args[6]]);
  assert.deepEqual(uploads, [
    ["javascript-react", web(root)],
    ["node-fastify", api(root)],
  ]);
  assert.equal(calls.filter((args) => args[1] === "inject").length, 2);
  assert.equal(mapFiles(web(root)).length, 0);
  assert.equal(mapFiles(api(root)).length, 1);
});

test("sentry-sourcemaps: a failed upload still deletes the web maps and keeps the deploy going", () => {
  const root = world();

  assert.equal(run({ env: { SENTRY_AUTH_TOKEN: "t" }, cwd: root, cli: () => 1, log: silent }), 0);
  assert.equal(mapFiles(web(root)).length, 0);
});
