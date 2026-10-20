#!/usr/bin/env node
// CI-PORT-FALLBACK: scripts/ci-supabase-apart.sh against a fake netsh.exe (APART_NETSH), in a throwaway
// folder holding a copy of supabase/config.toml -- the repo's own config and the shared stack are never
// touched. On 2026-10-16 Windows excluded 58930-59029, runner pc's 590xx block fell inside it and the job
// went red (train/20261016T2147Z, run 38971735410); the runner now moves to its next block instead.
// Run: node --test scripts/ci-supabase-apart.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(DIR, "ci-supabase-apart.sh");
const CONFIG = fs.readFileSync(path.join(DIR, "..", "supabase", "config.toml"), "utf8").replace(/\r\n/g, "\n");

// On Windows `bash` on PATH can be WSL's; the script must run in Git Bash, next to git itself.
const BASH =
  process.platform === "win32"
    ? path.resolve(execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim(), "..", "..", "..", "bin", "bash.exe")
    : "bash";

const boxes = [];
after(() => boxes.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// What `netsh int ipv4 show excludedportrange protocol=tcp` prints, CRLF and all.
const netshOutput = (ranges) =>
  [
    "",
    "Protocol tcp Port Exclusion Ranges",
    "",
    "Start Port    End Port      ",
    "----------    --------      ",
    ...ranges.map(([from, to, admin]) => `     ${from}       ${to}     ${admin ? "*" : ""}`),
    "",
    "* - Administered port exclusions.",
    "",
  ].join("\r\n");

// ranges: [[from, to, administered?]] for a fake netsh; null for a runner with no netsh.exe (real Linux).
function run(runnerName, ranges, extraEnv = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "nf-apart-"));
  boxes.push(cwd);
  fs.mkdirSync(path.join(cwd, "supabase"));
  fs.writeFileSync(path.join(cwd, "supabase", "config.toml"), CONFIG);
  const githubEnv = path.join(cwd, "github-env");
  fs.writeFileSync(githubEnv, "");
  const netsh = path.join(cwd, "netsh.exe");
  if (ranges) {
    fs.writeFileSync(path.join(cwd, "netsh.txt"), netshOutput(ranges));
    fs.writeFileSync(netsh, '#!/usr/bin/env bash\ncat "$(dirname "$0")/netsh.txt"\n', { mode: 0o755 });
  }
  // On a GitHub-hosted runner the job's own RUNNER_ENVIRONMENT would make every case lane 1.
  const { RUNNER_ENVIRONMENT, ...hostEnv } = process.env;
  const r = spawnSync(BASH, [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...hostEnv, RUNNER_NAME: runnerName, GITHUB_ENV: githubEnv, APART_NETSH: netsh, ...extraEnv },
  });
  const config = fs.readFileSync(path.join(cwd, "supabase", "config.toml"), "utf8");
  return { code: r.status, out: `${r.stdout}${r.stderr}`, config, env: fs.readFileSync(githubEnv, "utf8") };
}

// Every port the CI project would listen on, read back from the rewritten config.
const ports = (config) => [...config.matchAll(/^(?:shadow_)?port = (\d+)$/gm)].map((m) => Number(m[1]));
const prefixOf = (config) => {
  const set = new Set(ports(config).map((p) => Math.floor(p / 100)));
  assert.equal(set.size, 1, `one block, got ${[...set]}`);
  return [...set][0];
};

test("a free first block: runner pc keeps 590xx, its own project, and CI_RUNNER_INDEX", () => {
  const r = run("newfork-local-pc", []);
  assert.equal(r.code, 0, r.out);
  assert.equal(prefixOf(r.config), 590);
  assert.match(r.config, /^project_id = "newfork-ci-pc1"$/m);
  assert.doesNotMatch(r.config, /newfork-clean|^(shadow_)?port = 553/m);
  assert.match(r.env, /^CI_RUNNER_INDEX=1$/m);
  assert.match(r.out, /::notice::.*590xx/);
});

test("a GitHub-hosted runner (any name) takes lane 1: it has its own machine, no shared stack", () => {
  const r = run("GitHub Actions 7", null, { RUNNER_ENVIRONMENT: "github-hosted" });
  assert.equal(r.code, 0, r.out);
  assert.equal(prefixOf(r.config), 590);
  assert.match(r.config, /^project_id = "newfork-ci-pc1"$/m);
  assert.match(r.env, /^CI_RUNNER_INDEX=1$/m);
});

test("the 2026-10-16 exclusion (58930-59029) moves runner pc to its next block, with a notice", () => {
  const r = run("newfork-local-pc", [[58930, 59029]]);
  assert.equal(r.code, 0, r.out);
  assert.equal(prefixOf(r.config), 600);
  assert.match(r.out, /::notice::.*600xx.*590xx.*58930-59029/);
  assert.match(r.env, /^CI_RUNNER_INDEX=1$/m);
});

test("an administered exclusion (marked *) counts too, and blocked blocks are skipped in order", () => {
  const r = run("newfork-local-pc-2", [[59120, 59129, true], [60100, 60199]]);
  assert.equal(r.code, 0, r.out);
  assert.equal(prefixOf(r.config), 611);
  assert.match(r.config, /^project_id = "newfork-ci-pc2"$/m);
});

test("two runners never share a block, even when both have to move", () => {
  const ranges = [[59000, 59299]];
  const a = run("newfork-local-pc", ranges);
  const b = run("newfork-local-pc-2", ranges);
  assert.equal(a.code, 0, a.out);
  assert.equal(b.code, 0, b.out);
  assert.deepEqual([prefixOf(a.config), prefixOf(b.config)], [600, 601]);
});

test("no free block: a clear error and the config untouched", () => {
  const r = run("newfork-local-pc", [[59000, 65535]]);
  assert.equal(r.code, 1);
  assert.match(r.out, /::error::.*no free port block.*runner index 1/);
  assert.equal(r.config, CONFIG);
  assert.equal(r.env, "");
});

test("no netsh.exe (a real Linux runner): the first block, no check", () => {
  const r = run("newfork-local-pc-2", null);
  assert.equal(r.code, 0, r.out);
  assert.equal(prefixOf(r.config), 591);
});

test("an unknown runner name or an index past the lanes is refused before any change", () => {
  for (const name of ["some-runner", "newfork-local-pc-6"]) {
    const r = run(name, []);
    assert.equal(r.code, 1, name);
    assert.match(r.out, /::error::/);
    assert.equal(r.config, CONFIG);
  }
});
