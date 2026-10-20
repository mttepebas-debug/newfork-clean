#!/usr/bin/env node
/**
 * PARALEL-1 (BL-897, replaces reload-test-builder.mjs): `pnpm test:db` for a branch, on the one local
 * database every session shares (a branch's change reaches the shared DB only after it is on main,
 * through scripts/db-apply.mjs under db.lock).
 *
 * `supabase test db` runs pgTAP against whatever test world builder (supabase/test-support/builder.sql)
 * the database has loaded. Loading the branch's builder for good (the old reload) changed every other
 * session's tests before the branch reached main. Now:
 *   1. origin/main's builder is loaded for good, in one transaction: what stays in the shared DB is
 *      main's world (local e2e reads it). origin/main is one ref for every worktree, so no session
 *      can roll back a newer main. A failure only warns: step 2 does not depend on it.
 *   2. Every test file is copied to supabase/tests/.builder-run/ (gitignored; the CLI mounts only
 *      supabase/tests) with its opening `begin;` line turned into `begin; \ir builder.psql`, so the
 *      worktree's builder loads inside the test's own transaction and leaves with its rollback. Line
 *      numbers stay the same. Tracked test files are never touched.
 *   3. `supabase test db` runs the copies; its exit code is ours. The copies are removed afterwards.
 *
 * Usage: node scripts/test-db.mjs [supabase/tests/<file>.test.sql ...]   (what `pnpm test:db` runs)
 *        node scripts/test-db.mjs --load-only    only step 1 (refresh the shared DB to main's world)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TESTS = "supabase/tests";
const BUILDER = "supabase/test-support/builder.sql";
export const RUN_DIR = `${TESTS}/.builder-run`;
const INCLUDE = "builder.psql";
const TEST_FILE = /\.(sql|pg)$/; // what the CLI's pg_prove runs (--ext .pg --ext .sql)

const posix = (p) => p.split(path.sep).join("/");

// The builder wrapped for loading: NOTICEs ("schema tests already exists, skipping") stay out of the
// TAP output; the reset hands the test its own setting back.
const wrap = (builder) => `set client_min_messages = warning;\n${builder}\nreset client_min_messages;\n`;

// The first statement must be a `begin;` on its own line (`begin transaction;`, a trailing `-- …`
// comment allowed): that line also includes the builder, so it joins the test's transaction. Anything
// else is refused by name rather than run against the shared world.
const OPEN = /^(\s*begin(?:\s+(?:transaction|work))?\s*;)\s*(?:--.*)?\r?$/i;
export function scopeToBuilder(sql, include, name) {
  const lines = sql.split("\n");
  const at = lines.findIndex((l) => !/^\s*(--.*)?\r?$/.test(l));
  const open = at < 0 ? null : lines[at].match(OPEN);
  if (!open) throw new Error(`${name}: ilk deyim kendi satırında "begin;" değil; dalın builder'ı bu dosyanın işlemine bağlanamaz`);
  lines[at] = `${open[1]} \\ir ${include}`; // the comment, if any, goes: \ir takes the rest of the line
  return lines.join("\n");
}

// Top-level statements, with comments, quoted strings and $$ bodies blanked (a function body's
// `begin` / `end;` is not a statement).
function statements(sql) {
  const out = [];
  let cur = "";
  const dollar = /\$([A-Za-z_]\w*)?\$/y;
  for (let i = 0; i < sql.length; ) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const j = sql.indexOf("\n", i);
      i = j < 0 ? sql.length : j;
    } else if (two === "/*") {
      const j = sql.indexOf("*/", i + 2);
      i = j < 0 ? sql.length : j + 2;
      cur += " ";
    } else if (sql[i] === "'" || sql[i] === '"') {
      const q = sql[i];
      let j = i + 1;
      while (j < sql.length && !(sql[j] === q && sql[j + 1] !== q)) j += sql[j] === q ? 2 : 1;
      cur += `${q}${q}`;
      i = j + 1;
    } else if (sql[i] === "$" && ((dollar.lastIndex = i), dollar.test(sql))) {
      const tag = sql.slice(i, dollar.lastIndex);
      const j = sql.indexOf(tag, dollar.lastIndex);
      i = j < 0 ? sql.length : j + tag.length;
      cur += "$$";
    } else if (sql[i] === ";") {
      out.push(cur.trim());
      cur = "";
      i++;
    } else {
      cur += sql[i++];
    }
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

// What cannot run inside a test's transaction (and would break step 2 for every file).
const OUTSIDE_TX = /^(begin|start\s+transaction|commit|end|rollback|abort|vacuum|create\s+database|drop\s+database|alter\s+system)\b|\bconcurrently\b/i;
export const nonTransactional = (sql) => statements(sql).filter((s) => OUTSIDE_TX.test(s)).map((s) => s.slice(0, 80));

const listTests = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => TEST_FILE.test(f) && !posix(f).startsWith(".builder-run/") && fs.statSync(path.join(dir, f)).isFile())
    .sort();

function named(root, testsDir, arg) {
  const abs = path.resolve(root, arg);
  const rel = path.relative(testsDir, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || posix(rel).startsWith(".builder-run"))
    throw new Error(`${arg}: yalnız ${TESTS} altındaki test dosyaları koşar`);
  if (!fs.existsSync(abs)) throw new Error(`${arg}: dosya yok`);
  return fs.statSync(abs).isDirectory() ? listTests(abs).map((f) => path.join(rel, f)) : [rel];
}

// Writes the scoped copies and builder.psql; returns what to hand `supabase test db`.
export function prepareRun(root, files = []) {
  const testsDir = path.join(root, TESTS);
  const runDir = path.join(root, RUN_DIR);
  fs.rmSync(runDir, { recursive: true, force: true }); // a killed run's leftover
  const builder = fs.readFileSync(path.join(root, BUILDER), "utf8");
  const bad = nonTransactional(builder);
  if (bad.length) throw new Error(`${BUILDER}: bir işlemin içinde koşamayan deyim: ${bad.join(" | ")}`);
  const picked = files.length ? [...new Set(files.flatMap((f) => named(root, testsDir, f)))] : listTests(testsDir);
  try {
    for (const rel of picked) {
      const include = posix(path.relative(path.dirname(path.join(runDir, rel)), path.join(runDir, INCLUDE)));
      const target = path.join(runDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, scopeToBuilder(fs.readFileSync(path.join(testsDir, rel), "utf8"), include, posix(path.join(TESTS, rel))));
    }
    fs.writeFileSync(path.join(runDir, INCLUDE), wrap(builder));
  } catch (err) {
    fs.rmSync(runDir, { recursive: true, force: true });
    throw err;
  }
  return files.length ? picked.map((rel) => posix(path.join(RUN_DIR, rel))) : [RUN_DIR];
}

// origin/main's builder, or null when that ref (or the file on it) is missing.
export function mainBuilder(root, ref = "origin/main") {
  try {
    return execFileSync("git", ["-C", root, "show", `${ref}:${BUILDER}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export function container(root) {
  const id = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!id) throw new Error("supabase/config.toml'da project_id okunamadı");
  return `supabase_db_${id}`;
}

function realExec(cmd, args, { input, cwd } = {}) {
  // supabase is an npm .cmd shim on Windows, which only a shell can start
  if (cmd === "supabase" && process.platform === "win32")
    return spawnSync([cmd, ...args.map((a) => `"${a}"`)].join(" "), { cwd, stdio: "inherit", shell: true });
  return spawnSync(cmd, args, { cwd, input, stdio: [input == null ? "inherit" : "pipe", "inherit", "inherit"] });
}

export function run({ root, argv = [], exec = realExec, log = (s) => console.error(s) }) {
  const loadOnly = argv.includes("--load-only");
  // ponytail: options go to `supabase test db` as before; one that takes a value needs --opt=value
  const options = argv.filter((a) => a.startsWith("-") && a !== "--load-only");
  const files = argv.filter((a) => !a.startsWith("-"));
  try {
    if (loadOnly && (files.length || options.length)) throw new Error("--load-only test koşmaz, başka argüman almaz");
    const targets = loadOnly ? null : prepareRun(root, files); // refuses before the database is touched
    const db = container(root);
    const main = mainBuilder(root);
    let loaded = false;
    if (main === null) log("test-db: origin/main'de builder.sql okunamadı; ortak DB'ye kalıcı yükleme atlandı");
    else {
      const r = exec("docker", ["exec", "-i", db, "psql", "-X", "-q", "-1", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-f", "-"], {
        input: wrap(main),
        cwd: root,
      });
      loaded = r.status === 0;
      if (!loaded)
        log(
          `test-db: origin/main'deki builder ortak DB'ye yüklenemedi (${r.error?.message ?? `çıkış ${r.status}`}); ` +
            "ortak DB değişmedi (tek işlem), testler yine dalın kendi builder'ıyla koşar",
        );
    }
    if (loadOnly) return loaded ? 0 : 1;
    const r = exec("supabase", ["test", "db", ...options, ...targets], { cwd: root });
    if (r.error) log(`test-db: supabase test db başlatılamadı: ${r.error.message}`);
    return r.status ?? 1;
  } catch (err) {
    log(`test-db: ${err.message}`);
    return 1;
  } finally {
    if (!loadOnly) fs.rmSync(path.join(root, RUN_DIR), { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Ctrl+C reaches pgTAP too; staying alive until it exits lets the copies be removed
  process.on("SIGINT", () => {});
  process.exitCode = run({ root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), argv: process.argv.slice(2) });
}
