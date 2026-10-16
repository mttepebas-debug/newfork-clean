#!/usr/bin/env node
// SENTRY-02: the last step of the Vercel build. With SENTRY_AUTH_TOKEN set (Vercel production only) the web
// and API bundles get debug ids and their source maps go to Sentry, so a stack reads "SchedulePage.tsx:212"
// instead of "index-abc.js:1:48213". The web maps are then deleted from apps/web/dist: that folder is served
// as it is, and the maps carry the source. Without the token (local, CI) nothing runs. An upload failure is
// logged and the deploy goes on: unreadable stacks are better than no deploy.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const ORG = "meyhouse";
export const TARGETS = [
  { project: "javascript-react", dir: "apps/web/dist", removeMaps: true },
  { project: "node-fastify", dir: "apps/api/dist", removeMaps: false },
];

export function enabled(env) {
  return Boolean(env.SENTRY_AUTH_TOKEN?.trim());
}

export function mapFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".map"))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

export function removeMaps(dir) {
  const files = mapFiles(dir);
  for (const file of files) fs.rmSync(file);
  return files.length;
}

function sentryCli(args, cwd) {
  const bin = createRequire(path.join(cwd, "package.json")).resolve("@sentry/cli/bin/sentry-cli");
  return spawnSync(process.execPath, [bin, ...args], { cwd, stdio: "inherit" }).status ?? 1;
}

export function run({ env = process.env, cwd = process.cwd(), cli = sentryCli, log = console.log } = {}) {
  if (!enabled(env)) {
    log("sentry-sourcemaps: SENTRY_AUTH_TOKEN yok, atlandı");
    return 0;
  }
  for (const target of TARGETS) {
    const dir = path.join(cwd, target.dir);
    const ok =
      cli(["sourcemaps", "inject", dir], cwd) === 0 &&
      cli(["sourcemaps", "upload", "--org", ORG, "--project", target.project, dir], cwd) === 0;
    log(`sentry-sourcemaps: ${target.project} ${ok ? "yüklendi" : "YÜKLENEMEDİ (yayın sürüyor)"}`);
    if (target.removeMaps) log(`sentry-sourcemaps: ${removeMaps(dir)} harita silindi (${target.dir})`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = run();
