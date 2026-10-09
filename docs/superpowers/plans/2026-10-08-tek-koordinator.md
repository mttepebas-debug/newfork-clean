# Tek koordinatör iş akışı (v2) — uygulama planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Newfork'u tek koordinatör oturumu + arka plan alt ajanları + tren başına tek CI koşusu + tek karar defteri düzenine geçirmek.

**Architecture:** Koordinatör `newfork-wt/coord` worktree'sinde (dal `coord/kayit`) tek oturumdur; işi `nf-isci` alt ajanları kendi worktree'lerinde yapar. Raporları `SubagentStop` kancası diske yazar, bağlam sıkışınca `SessionStart` kancası `DURUM.md`'yi geri yükler. `scripts/train.mjs run` trenin tam kapısını GitHub Actions'ta bir kez koşturur ve yeşil commit'i main'e fast-forward eder. Tek kilit (`db`) yalnız bir komutla tutulur (`lock.mjs run`).

**Tech Stack:** Node 22 ESM betikleri (`scripts/*.mjs`, yalnız yerleşik modüller), `node --test`, git worktree, GitHub Actions (self-hosted runner), Claude Code kancaları, alt ajanlar ve skill'ler.

**Spec:** `docs/superpowers/specs/2026-10-08-tek-koordinator-design.md` (Mert onayı 2026-10-08). Uygulayan spec'i ve bu planı birlikte okur.

## Global Constraints

- Yeni bağımlılık yok: betikler yalnız Node yerleşik modülleri kullanır (spec §6.3 "yeni bağımlılık her zaman SOR").
- Testler gerçek klasörlere ve servislere dokunmaz: `NEWFORK_LOCK_DIR`, `NEWFORK_INBOX_DIR`, `NEWFORK_CI_STATE`, `NEWFORK_TRAIN_DIR`, `NEWFORK_MAIN_DIR` geçici klasöre; gerçek `gh` çağrılmaz.
- Betiklerin kullanıcıya mesajları Türkçe, kod yorumları İngilizce. Commit: İngilizce Conventional Commits, sonunda `(WORKFLOW-V2)`, gövdenin son satırı `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Dosyalar adıyla eklenir; `git commit -a` yok.
- Windows: `pnpm.cmd`; `.cmd` dosyası yalnız kabukla (`shell: true`) başlar.
- Alt ajanlar Opus 5.5, effort en az medium (Mert, 2026-10-07).
- `.claude/settings.json` yasak listesi (`permissions.deny`) değişmez.
- Spec değerleri: en çok 3 işçi; kilit 30 dakikayı geçerse "UZUN"; rapor yolu `docs/plan/gunluk/<YYYY-MM-DD>/<HHMM>-<İŞ>-<ajan>-<id8>.md`; son mesaj ilk satırı `İŞ: <ID> | DURUM: HAZIR | SORU | TAKILDI | BÖLÜNDÜ | DAL: task/<id>@<sha>`; CI tetiği `push: train/**`, `pull_request`, `workflow_dispatch`; `KARARLAR.md` hedef ≤ 700 satır; kayıt dosyaları `DURUM.md`, `docs/plan/{KARARLAR,SORULAR,BACKLOG,EKRAN-PLANI}.md`, `docs/plan/gunluk/**`.
- Çalışma yeri: worktree `C:/Users/TheWe/Documents/Codex/newfork-clean/.claude/worktrees/workflow-v2`, dal `task/workflow-v2`. Her komut oradan.

## Review Focus

1. **Kilit sahibi öldü** (terminal kapandı, bilgisayar yeniden başladı) ve başkaları bekliyor → sıradaki bekleyen kilidi temizleyip devam etmeli; ölü bilet sırayı tıkamamalı. Test: Task 1 ("dead holder", "dead waiter's ticket").
2. **Trenin CI koşusu hiç görünmüyor** (Actions kapalı, tetik tutmadı) → `ci` sonsuza dek beklememeli, `no-run` ile durmalı, `push` o sha'yı reddetmeli. Test: Task 4 ("no run showing up").
3. **İşçi kayıt dosyasına Windows yoluyla ya da commit'le yazıyor** → reddedilmeli; koordinatörün aynı yazısı geçmeli. Test: Task 2 ("worker agent cannot edit", "worker's git commit").
4. **Ajanın son mesajı boş ya da aynı dakikada iki rapor** → yine dosya yazılmalı, biri öbürünü ezmemeli. Test: Task 6 ("same minute twice", "falls back").
5. **`coord/kayit` zaten main'de** (yalnız eşdeğer commit'ler) → `run` onu trene eklememeli, boş tren kurmamalı. Test: Task 4 ("coord/kayit rides along … and not after").

---

## Dosya haritası

| Dosya | Durum | Sorumluluk |
|---|---|---|
| `scripts/ops.mjs` | yeni | Ortak klasör (`OPS_DIR`), `slug`, `ciState` |
| `scripts/lock.mjs` | yeniden | Tek `db` kilidi; `run` (sıra, ölü sahip temizliği), `status`; `take`/`release` yalnız tren için |
| `scripts/lock.test.mjs` | değişir | `run`, ölü sahip, sıra testleri |
| `scripts/guard.mjs` | sadeleşir | Main'e Bash push reddi, işçinin kayıt yazısı reddi, silme öncesi yedek, yasak logu |
| `scripts/coord-hooks.test.mjs` → `scripts/guard.test.mjs` | ad + içerik | Guard testleri |
| `scripts/inbox.mjs` | silinir | Posta kutusu (yerini ajan bildirimi + kanca alır) |
| `scripts/decision-log.mjs` | küçük | `ops.mjs`'ten içe aktarım, mesaj metni |
| `scripts/train.mjs`, `train-test-world.mjs`, `train-steps.test.mjs` | değişir | `gate` → `ci`; kilitsiz `push`; `run`; `coord/kayit` |
| `.github/workflows/ci.yml` | küçük | Tetik `train/**` |
| `scripts/hooks.mjs`, `scripts/hooks.test.mjs` | yeni | `agent-report` (SubagentStop), `session-start` (SessionStart) |
| `scripts/wt-hazirla.mjs`, `scripts/wt-hazirla.test.mjs` | yeni | İşçinin ilk komutu |
| `scripts/kararlar-check.mjs`, `scripts/kararlar-check.test.mjs` | yeni | "Hiçbir karar sessizce düşmez" denetimi |
| `.claude/settings.json` | değişir | Kancalar |
| `.claude/agents/nf-isci.md`, `nf-hakem.md` | yeni | İşçi, hakem |
| `.claude/agents/nf-okur.md`, `nf-guvenlik.md` | küçük | CI ayırma; yeni sınıf adları |
| `.claude/skills/oto/SKILL.md`, `durum/SKILL.md` | yeni | Otomasyon döngüsü, Mert'e dönüş |
| `.claude/skills/gece-modu/` | silinir | `/oto`'ya taşındı |
| `.claude/skills/haftalik-denetim/SKILL.md` | değişir | Yeni dosyalar |
| `CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`, `supabase/CLAUDE.md`, `e2e/CLAUDE.md` | yeniden / küçük | Yeni kurallar |
| `docs/plan/KARARLAR.md`, `SORULAR.md`, `gunluk/README.md` | yeni / yeniden | Karar defteri, sorular, günlük |
| `docs/archive/2026-10-08-v1/` | yeni | Eski kayıtlar + `SINIFLAMA.md` |
| `package.json` | küçük | Test listesi |

---

### Task 0: Dalı hazırla (tren aracını al)

**Files:** yok (cherry-pick)

**Interfaces:**
- Produces: `scripts/train.mjs` (`plan`, `build`, `applyLocal`, `gate`, `push`), `train-test-world.mjs`, `train-plan.test.mjs`, `train-steps.test.mjs`, `guard.mjs`'te `export function audit` ve `export function backupMain` — `task/tren-araci-2`'den.

- [ ] **Step 1: Tren aracının main'de olup olmadığını ölç**

Run: `git fetch -q origin && git cherry origin/main origin/task/tren-araci-2 | grep -c '^+'`
Expected: `5` ya da daha fazla (main'de değil). `0` ise Step 2'yi atla.

- [ ] **Step 2: Commit'leri bu dala al**

Run: `git cherry-pick $(git rev-list --reverse origin/main..origin/task/tren-araci-2)`
Expected: temiz. `package.json`'da çakışırsa `test` satırında tren-araci-2'nin hâlini al (`train-plan.test.mjs` ve `train-steps.test.mjs` listede), `git add package.json && git cherry-pick --continue`.

- [ ] **Step 3: Taban testleri koş**

Run: `node --test scripts/lock.test.mjs scripts/coord-hooks.test.mjs scripts/decision-log.test.mjs scripts/schema-snapshot.test.mjs scripts/test-db.test.mjs scripts/train-plan.test.mjs scripts/train-steps.test.mjs`
Expected: `fail 0`. Geçen test sayısını not et (sonraki görevlerde silinen ve eklenen sayıları buna göre açıklayacaksın).

---

### Task 1: Ortak modül ve tek kilit (`ops.mjs`, `lock.mjs run`)

**Files:**
- Create: `scripts/ops.mjs`
- Modify: `scripts/guard.mjs` (yalnız `runningRuns` / `ciState` taşınır)
- Rewrite: `scripts/lock.mjs`
- Test: `scripts/lock.test.mjs`

**Interfaces:**
- Produces: `ops.mjs` → `OPS_DIR: string`, `slug(s): string`, `runningRuns(ghJson): object[]`, `ciState(cwd): { state: "idle"|"running"|"unknown", runs }`.
- Produces: `lock.mjs` → `take(name, "kim/iş, amaç") → {ok, message}`, `release(name, "kim/iş") → {ok, message}`, `status(opts?) → [{ name, free, identity, purpose, pid, ageMinutes, long, stale, dead, queue: [{identity, command, dead}] }]`, `isDead(entry, { alive?, boot? }) → boolean`, `clearDead(name, opts?) → string|null`, `run(name, command, { as?, e2e?, maxWaitMin?, pollMs?, ciPollMs?, say?, exec?, deadOpts? }) → Promise<number>` (komutun çıkış kodu; 3 = beklemekten vazgeçti). Kilit adı yalnız `"db"`.

- [ ] **Step 1: `scripts/ops.mjs`'i yaz**

```js
#!/usr/bin/env node
// WORKFLOW-V2: what several scripts share. OPS_DIR is the git-free folder that keeps audit.log and
// decisions.jsonl (formerly inbox.mjs's INBOX_DIR; NEWFORK_INBOX_DIR overrides it, tests only).
// ciState() asks GitHub Actions through `gh`; NEWFORK_CI_STATE=idle|running|unknown forces it (tests only).
import { execFileSync } from "node:child_process";

export const OPS_DIR = process.env.NEWFORK_INBOX_DIR ?? "C:/Users/TheWe/Documents/Codex/.newfork-inbox";

export const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";

// GitHub Actions runs not yet completed (queued counts: the single runner is the user's PC).
export const runningRuns = (ghJson) => JSON.parse(ghJson).filter((r) => String(r.status).toLowerCase() !== "completed");

export function ciState(cwd) {
  const forced = process.env.NEWFORK_CI_STATE;
  if (forced) return { state: forced, runs: [] };
  try {
    const out = execFileSync("gh", ["run", "list", "--limit", "5", "--json", "status,name,headBranch"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
    });
    const runs = runningRuns(out);
    return { state: runs.length ? "running" : "idle", runs };
  } catch {
    return { state: "unknown", runs: [] };
  }
}
```

- [ ] **Step 2: `guard.mjs`'te `runningRuns` ve `ciState`'i taşı**

`scripts/guard.mjs`'ten `export const runningRuns = …` satırını ve `export function ciState(cwd) { … }` bloğunu sil. İçe aktarımların altına ekle:

```js
import { ciState } from "./ops.mjs";
export { ciState, runningRuns } from "./ops.mjs";
```

Run: `node --test scripts/coord-hooks.test.mjs`
Expected: `fail 0` (davranış aynı).

- [ ] **Step 3: Yeni kilit testlerini yaz (kırmızı)**

`scripts/lock.test.mjs`:
- İçe aktarımı `const { take, release, status, run, isDead, clearDead } = await import("./lock.mjs");` yap.
- `beforeEach`'e ekle: `for (const d of ["queue-db", "dead"]) fs.rmSync(path.join(tmpDir, d), { recursive: true, force: true }); delete process.env.NEWFORK_CI_STATE;`
- "heavy.lock takes, reports and releases like the others (OTOMASYON-3)" testini sil.
- "an unknown lock name is refused and the message lists the three names" testinin yerine:

```js
test("only db is a lock now: main and heavy are refused by name", () => {
  assert.throws(() => take("main", "koordinator/x, push"), /unknown lock "main" \(expected db\)/);
  assert.throws(() => take("heavy", "oturum/x, gate"), /unknown lock "heavy" \(expected db\)/);
});
```

- `main` ya da `heavy` kullanan başka bir test varsa ilk argümanı `"db"` yap. Test kilit adının kendisini sınıyorsa sil.
- Dosyanın sonuna ekle:

```js
const node = `"${process.execPath}"`;
const marker = path.join(tmpDir, "marker.mjs");
fs.writeFileSync(
  marker,
  'import fs from "node:fs";\nconst [file, tag, ms, code] = process.argv.slice(2);\nfs.appendFileSync(file, tag + "+");\nawait new Promise((r) => setTimeout(r, Number(ms)));\nfs.appendFileSync(file, tag + "-");\nprocess.exit(Number(code ?? 0));\n',
);
const quiet = { say: () => {}, pollMs: 20 };
const queueFiles = () => {
  try {
    return fs.readdirSync(path.join(tmpDir, "queue-db"));
  } catch {
    return [];
  }
};

test("run: holds db only while the command runs, returns its exit code, lets go after a failure too", async () => {
  const out = path.join(tmpDir, "one.txt");
  const code = await run("db", `${node} "${marker}" "${out}" a 10 7`, { ...quiet, as: "t" });
  assert.equal(code, 7);
  assert.equal(fs.readFileSync(out, "utf8"), "a+a-");
  assert.equal(status()[0].free, true);
  assert.deepEqual(queueFiles(), []);
});

test("run: two commands never overlap and go in arrival order", async () => {
  const out = path.join(tmpDir, "two.txt");
  const a = run("db", `${node} "${marker}" "${out}" a 300`, { ...quiet, as: "a" });
  await new Promise((r) => setTimeout(r, 30));
  const b = run("db", `${node} "${marker}" "${out}" b 10`, { ...quiet, as: "b" });
  assert.deepEqual(await Promise.all([a, b]), [0, 0]);
  assert.equal(fs.readFileSync(out, "utf8"), "a+a-b+b-");
});

test("run: a dead holder (taken before this boot) is moved to dead/ and the waiter goes on", async () => {
  fs.writeFileSync(dbLock, JSON.stringify({ identity: "oturum/eski", purpose: "test:db", startedAt: "2000-01-01T00:00:00Z", pid: process.pid }));
  const lines = [];
  const code = await run("db", `${node} -e "process.exit(0)"`, { pollMs: 20, as: "yeni", say: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.match(lines.join("\n"), /ölü sahibinden temizlendi: oturum\/eski/);
  assert.equal(fs.readdirSync(path.join(tmpDir, "dead")).length, 1);
});

test("run: a dead waiter's ticket ahead in the queue is dropped, not waited for", async () => {
  fs.mkdirSync(path.join(tmpDir, "queue-db"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "queue-db", "000000000000001-1-dead.json"),
    JSON.stringify({ identity: "run/eski-1", command: "x", pid: 1, startedAt: "2000-01-01T00:00:00Z" }),
  );
  const code = await run("db", `${node} -e "process.exit(0)"`, { ...quiet, as: "sonraki" });
  assert.equal(code, 0);
  assert.deepEqual(queueFiles(), []);
});

test("isDead: gone process or taken before boot is dead; a live one and a hand-written one are not", () => {
  const now = new Date().toISOString();
  assert.equal(isDead({ pid: 999999, startedAt: now }, { alive: () => false }), true);
  assert.equal(isDead({ pid: process.pid, startedAt: "2000-01-01T00:00:00Z" }), true);
  assert.equal(isDead({ pid: process.pid, startedAt: now }), false);
  assert.equal(isDead({ identity: "elle/yazilmis" }), false);
  assert.equal(clearDead("db"), null);
});

test("run: a live holder makes it wait; --max-wait gives up with 3 and leaves no ticket", async () => {
  take("db", "oturum/canli, test:db");
  const code = await run("db", `${node} -e "process.exit(0)"`, { ...quiet, as: "bekleyen", maxWaitMin: 0.002 });
  assert.equal(code, 3);
  assert.equal(status()[0].identity, "oturum/canli");
  assert.deepEqual(queueFiles(), []);
});

test("run --e2e: waits while CI runs, goes once it is idle", async () => {
  process.env.NEWFORK_CI_STATE = "running";
  setTimeout(() => (process.env.NEWFORK_CI_STATE = "idle"), 150);
  const t0 = Date.now();
  const code = await run("db", `${node} -e "process.exit(0)"`, { ...quiet, as: "e2e", e2e: true, ciPollMs: 20 });
  assert.equal(code, 0);
  assert.ok(Date.now() - t0 >= 150);
});

test("status: over 30 minutes is long, taken before boot is dead, waiting tickets are listed", () => {
  const old = new Date(Date.now() - 31 * 60000).toISOString();
  fs.writeFileSync(dbLock, JSON.stringify({ identity: "run/uzun-1", purpose: "x", startedAt: old, pid: process.pid }));
  fs.mkdirSync(path.join(tmpDir, "queue-db"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, "queue-db", "000000000000009-9-w.json"),
    JSON.stringify({ identity: "run/bekleyen-9", command: "pnpm.cmd test:db", pid: process.pid, startedAt: new Date().toISOString() }),
  );
  const s = status()[0];
  assert.equal(s.long, true);
  assert.equal(s.dead, false);
  assert.deepEqual(s.queue, [{ identity: "run/bekleyen-9", command: "pnpm.cmd test:db", dead: false }]);
  fs.writeFileSync(dbLock, JSON.stringify({ identity: "run/eski-1", purpose: "x", startedAt: "2000-01-01T00:00:00Z", pid: process.pid }));
  assert.equal(status()[0].dead, true);
});
```

- [ ] **Step 4: Testin kırmızı olduğunu gör**

Run: `node --test scripts/lock.test.mjs`
Expected: FAIL — `run is not a function` ve `unknown lock "main"` beklentisi tutmuyor.

- [ ] **Step 5: `scripts/lock.mjs`'i yeniden yaz**

```js
#!/usr/bin/env node
// WORKFLOW-V2 (spec §7.4): one lock, db -- the shared local database (migration tries, pgTAP, a local
// e2e, the train's apply-local). Only a command holds it:
//   node scripts/lock.mjs run db [--e2e] [--as <name>] [--max-wait <min>] -- <command…>
// waits its turn in arrival order (a ticket in queue-db/), runs the command (cmd.exe on Windows) and
// lets go when it ends, success or not. --e2e also waits while a GitHub Actions run is going: two e2e
// runs on the one PC time each other out. A holder whose process is gone, or that took the lock before
// this machine last started, is dead: the first waiter moves it to dead/ and goes on. A hand-written
// lock (no pid) is never cleared. take()/release() stay for scripts/train.mjs, which also holds the
// lock inside one command. The lock file only ever appears fully formed (scratch file + fs.linkSync),
// so EEXIST = held. Directory is overridable via NEWFORK_LOCK_DIR (tests only; never the real folder).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ciState } from "./ops.mjs";

const LOCK_DIR = process.env.NEWFORK_LOCK_DIR ?? "C:/Users/TheWe/Documents/Codex/.newfork-locks";
const LONG_MIN = 30; // spec §2: no lock is held longer than this; status flags it
const STALE_MS = 2 * 60 * 60 * 1000; // flagged in status, never deleted by age alone
const LOCKS = ["db"];

function lockPath(name) {
  if (!LOCKS.includes(name)) throw new Error(`unknown lock "${name}" (expected ${LOCKS.join("|")})`);
  return path.join(LOCK_DIR, `${name}.lock`);
}
const queueDir = (name) => path.join(LOCK_DIR, `queue-${name}`);

// Identity is "who/what" (e.g. "run/ekran-02-4412", "koordinator/tren-20261008T1000Z"),
// the first comma-separated field of take()'s and release()'s argument.
function splitIdentity(arg) {
  const [identity, ...rest] = arg.split(",");
  return { identity: identity.trim(), purpose: rest.join(",").trim() };
}

// A hand-written lock is plain text; ours is a JSON object. Anything else is read the plain-text way.
function readLock(file) {
  const raw = fs.readFileSync(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      identity: typeof parsed.identity === "string" ? parsed.identity : "",
      purpose: typeof parsed.purpose === "string" ? parsed.purpose : "",
      startedAt: parsed.startedAt,
      pid: Number.isInteger(parsed.pid) ? parsed.pid : undefined,
      session: typeof parsed.session === "string" ? parsed.session : undefined,
      cwd: typeof parsed.cwd === "string" ? parsed.cwd : undefined,
    };
  }
  const { identity, purpose } = splitIdentity(raw);
  return { identity, purpose, startedAt: undefined };
}

// JSON locks carry their own startedAt; a plain-text lock's age comes from the file's mtime.
function ageMinutes(file, startedAt) {
  const t = Date.parse(startedAt ?? "");
  if (!Number.isNaN(t)) return Math.round((Date.now() - t) / 60000);
  try {
    return Math.round((Date.now() - fs.statSync(file).mtimeMs) / 60000);
  } catch {
    return null;
  }
}

export const bootTime = () => Date.now() - os.uptime() * 1000;
export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists, owned by someone else
  }
}
// Dead = its process is gone, or it was taken before this machine started (a reboot reuses pids).
// No pid (a hand-written lock): never called dead.
export function isDead(entry, { alive = pidAlive, boot = bootTime() } = {}) {
  if (!Number.isInteger(entry?.pid)) return false;
  const t = Date.parse(entry.startedAt ?? "");
  if (!Number.isNaN(t) && t < boot) return true;
  return !alive(entry.pid);
}

export function take(name, arg) {
  const { identity, purpose } = splitIdentity(arg);
  const [who, what] = identity.split("/").map((part) => part.trim());
  if (!who || !what) {
    return { ok: false, message: `kimlik "${identity}" geçersiz: "kim/iş" biçiminde olmalı (ör. "run/ekran-02-4412")` };
  }
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const file = lockPath(name);
  const entry = {
    identity,
    purpose,
    startedAt: new Date().toISOString(),
    pid: process.pid,
    session: process.env.CLAUDE_CODE_SESSION_ID || undefined,
    cwd: process.cwd(),
  };
  const tmp = path.join(LOCK_DIR, `.${name}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2));
  try {
    fs.linkSync(tmp, file); // atomic: the entry appears only once fully written
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    if (err.code !== "EEXIST") throw err;
    const held = readLock(file);
    const age = ageMinutes(file, held.startedAt);
    return { ok: false, message: `${name}.lock zaten "${held.identity || "?"}" elinde${age != null ? ` (${age} dk önce alınmış)` : ""}` };
  }
  fs.rmSync(tmp, { force: true });
  return { ok: true, message: `${name}.lock alındı: ${identity}` };
}

export function release(name, arg) {
  const file = lockPath(name);
  if (!fs.existsSync(file)) return { ok: false, message: `${name}.lock zaten yok` };
  const held = readLock(file);
  if (!held.identity) return { ok: false, message: `${name}.lock sahibi boş ya da okunamıyor; silinmedi, koordinatöre sor` };
  const { identity } = splitIdentity(arg);
  if (held.identity !== identity) return { ok: false, message: `${name}.lock sahibi "${held.identity}", bırakmak isteyen "${identity}" değil; silinmedi` };
  fs.rmSync(file);
  return { ok: true, message: `${name}.lock bırakıldı: ${identity}` };
}

// A dead holder's lock goes to dead/ (kept for the record). Only the first waiter in the queue and the
// train call this, so two processes rarely race for it; a lost race is a rename that fails, not a harm.
export function clearDead(name, opts) {
  const file = lockPath(name);
  if (!fs.existsSync(file)) return null;
  const held = readLock(file);
  if (!isDead(held, opts)) return null;
  const dir = path.join(LOCK_DIR, "dead");
  fs.mkdirSync(dir, { recursive: true });
  const to = path.join(dir, `${name}.${Date.now()}.lock`);
  try {
    fs.renameSync(file, to);
  } catch {
    return null;
  }
  return `${name}.lock ölü sahibinden temizlendi: ${held.identity} (pid ${held.pid}) → ${to}`;
}

const tickets = (name) => {
  try {
    return fs.readdirSync(queueDir(name)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
};
const readTicket = (name, f) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(queueDir(name), f), "utf8"));
  } catch {
    return null;
  }
};

export function status(opts) {
  return LOCKS.map((name) => {
    const file = lockPath(name);
    const queue = tickets(name)
      .map((f) => readTicket(name, f))
      .filter(Boolean)
      .map((t) => ({ identity: t.identity, command: t.command, dead: isDead(t, opts) }));
    if (!fs.existsSync(file)) return { name, free: true, queue };
    const held = readLock(file);
    const age = ageMinutes(file, held.startedAt);
    return {
      name,
      free: false,
      identity: held.identity || "?",
      purpose: held.purpose,
      pid: held.pid,
      session: held.session,
      cwd: held.cwd,
      ageMinutes: age,
      long: age != null && age > LONG_MIN,
      stale: age != null && age * 60000 > STALE_MS,
      dead: isDead(held, opts),
      queue,
    };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The command in a shell (cmd.exe on Windows, so pnpm.cmd starts); Ctrl+C stops it and still lets go.
function spawnCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: "inherit" });
    const stop = () => child.kill();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.on("error", (err) => {
      console.error(String(err));
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

export async function run(name, command, { as, e2e = false, maxWaitMin = 60, pollMs = 2000, ciPollMs = 30000, say = (l) => console.log(l), exec = spawnCommand, deadOpts } = {}) {
  lockPath(name);
  const who = String(as ?? path.basename(process.cwd())).replace(/[^\w.-]+/g, "-").slice(0, 40) || "x";
  const identity = `run/${who}-${process.pid}`;
  fs.mkdirSync(queueDir(name), { recursive: true });
  const ticket = `${String(Date.now()).padStart(15, "0")}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`;
  const ticketFile = path.join(queueDir(name), ticket);
  fs.writeFileSync(ticketFile, JSON.stringify({ identity, command, pid: process.pid, startedAt: new Date().toISOString() }));
  const started = Date.now();
  let lastSay = 0;
  let lastCi = -Infinity;
  let ciBusy = false;
  try {
    for (;;) {
      for (const f of tickets(name)) {
        const t = readTicket(name, f);
        if (f !== ticket && t && isDead(t, deadOpts)) fs.rmSync(path.join(queueDir(name), f), { force: true });
      }
      const queue = tickets(name);
      if (queue[0] === ticket) {
        const cleared = clearDead(name, deadOpts);
        if (cleared) say(cleared);
        if (e2e && Date.now() - lastCi >= ciPollMs) {
          ciBusy = ciState(process.cwd()).state === "running";
          lastCi = Date.now();
        }
        if (!(e2e && ciBusy) && take(name, `${identity}, ${command}`).ok) break;
      }
      if (Date.now() - started > maxWaitMin * 60000) {
        say(`${name}.lock için ${maxWaitMin} dk beklendi; komut koşmadı: ${command}`);
        return 3;
      }
      if (Date.now() - lastSay >= 60000) {
        const held = status(deadOpts).find((l) => l.name === name);
        say(
          `bekliyor: sırada ${queue.indexOf(ticket) + 1}/${queue.length}` +
            `${held.free ? "" : `; kilit ${held.identity} elinde (${held.ageMinutes ?? "?"} dk)`}${e2e && ciBusy ? "; CI koşuyor" : ""}`,
        );
        lastSay = Date.now();
      }
      await sleep(pollMs);
    }
  } finally {
    fs.rmSync(ticketFile, { force: true });
  }
  say(`${name}.lock alındı (${identity}): ${command}`);
  try {
    return await exec(command);
  } finally {
    release(name, identity);
    say(`${name}.lock bırakıldı (${identity})`);
  }
}

function printStatus() {
  for (const l of status()) {
    if (l.free) console.log(`${l.name}.lock: boş`);
    else
      console.log(
        `${l.name}.lock: ${l.identity}, ${l.ageMinutes ?? "?"} dk${l.pid ? `, pid ${l.pid}` : ""}` +
          `${l.long ? " — UZUN (30 dk'yı geçti)" : ""}${l.dead ? " — ÖLÜ: sıradaki bekleyen temizler" : ""}` +
          `${l.stale && !l.pid ? " — elle yazılmış, 2 saatten eski; koordinatöre sor" : ""}`,
      );
    if (l.queue.length) console.log(`  sıra (${l.queue.length}): ${l.queue.map((t) => `${t.identity}${t.dead ? " (ölü)" : ""}: ${t.command}`).join(" · ")}`);
  }
}

const USAGE = [
  "usage: node scripts/lock.mjs run db [--e2e] [--as <ad>] [--max-wait <dk>] -- <komut…>",
  "       node scripts/lock.mjs status",
  "  Tırnak isteyen komutu tek argüman ver: -- 'psql -c \"select 1\"'",
].join("\n");

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "status") return printStatus();
  if (cmd === "run") {
    const sep = rest.indexOf("--");
    const opts = rest.slice(1, sep < 0 ? rest.length : sep);
    const command = sep < 0 ? "" : rest.slice(sep + 1).join(" ");
    const val = (flag) => {
      const i = opts.indexOf(flag);
      return i >= 0 ? opts[i + 1] : undefined;
    };
    if (rest[0] && command) {
      process.exitCode = await run(rest[0], command, { e2e: opts.includes("--e2e"), as: val("--as"), maxWaitMin: Number(val("--max-wait") ?? 60) });
      return;
    }
  }
  console.error(USAGE);
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
```

- [ ] **Step 6: Kilit testleri yeşil**

Run: `node --test scripts/lock.test.mjs`
Expected: `fail 0`.

- [ ] **Step 7: Kilidi kullananları ve kırılanları gör (kırmızı beklenir)**

Run: `node --test scripts/coord-hooks.test.mjs scripts/train-plan.test.mjs scripts/train-steps.test.mjs`
Expected: guard'ın `main.lock` / `heavy.lock` testleri ve trenin `gate` / `push` testleri kırmızı. Task 2 ve Task 4 bunları düzeltir. Başka bir test kırmızıysa (ör. plan testleri) dur ve nedenini bul.

- [ ] **Step 8: Commit**

```bash
git add scripts/ops.mjs scripts/lock.mjs scripts/lock.test.mjs scripts/guard.mjs
git commit -m "feat(scripts): one db lock held only by a command, in arrival order, dead holders cleared (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Guard sadeleşmesi

**Files:**
- Modify: `scripts/guard.mjs`
- Rename + modify: `scripts/coord-hooks.test.mjs` → `scripts/guard.test.mjs`

**Interfaces:**
- Consumes: `ops.mjs` `OPS_DIR`.
- Produces: `evaluate(input) → { block: boolean, message? }`; `isRecordFile(path): boolean`; `inWorkerTree(path): boolean`; `audit(entry)`, `backupMain(cwd) → { ref, sha, fetched }` (tren kullanır); `ciState`, `runningRuns` yeniden dışa aktarım.

- [ ] **Step 1: Test dosyasının adını değiştir**

Run: `git mv scripts/coord-hooks.test.mjs scripts/guard.test.mjs`

- [ ] **Step 2: Yeni guard testlerini yaz (kırmızı)**

`scripts/guard.test.mjs`'te:
- Üst içe aktarımı `const { evaluate, isRecordFile, inWorkerTree } = await import("./guard.mjs");` yap. `const inbox = await import("./inbox.mjs");` satırı Task 3'e kadar kalır. `ENFORCE_FROM`, `BEFORE`, `AFTER`, `runStep`, `recordsAllow` ve `takeAs` kullanan yardımcıları kaldır.
- Şu testleri sil (kaldırılan özellikler): "push to main with main.lock held passes", "main.lock taken in the same command, chained with &&, lets the push through (BL-500)", "e2e gap: …", "push to main reads the pushed source: …" (ikisi), "runStep: …", "a lone lint or typecheck is not a heavy run …", "heavy run …" (hepsi), "heavy.lock …" (hepsi), "e2e with db.lock but no heavy.lock …", "CI running: a local heavy run warns …", "NF_OVERRIDE in front of a heavy run …", "a push that starts CI while another session holds heavy.lock …", "a docs-only push starts no CI …", "records: …" (hepsi), "guard CLI routes Edit to the record check and records-allow writes the session's pass".
- Kalan ayrıştırıcı testlerinde (heredoc, tırnak, PowerShell, sarılmış kabuk, tarayıcı kenarları, satır devamı, `cd` takibi) ağır komut deneme olarak kullanılıyorsa (`pnpm test`, `pnpm.cmd test:db`, `npx playwright test`, `runStep`), denemeyi `git push origin HEAD:main` yap. Eski test ağır koşu uyarısı ya da reddi bekliyorsa yeni beklenti `block === true`, ağır koşu yok bekliyorsa `block === false` olsun.
- "push to main without main.lock is refused and logged" testinde beklenen mesaj kalıbını `/yalnız tren gider/` yap.
- Ekle:

```js
test("push to main is refused even with a lock: only the train goes to main", () => {
  fs.mkdirSync(process.env.NEWFORK_LOCK_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.NEWFORK_LOCK_DIR, "main.lock"), JSON.stringify({ identity: "koordinator/eski", pid: process.pid }));
  const r = evaluate(bash("git push origin HEAD:main"));
  assert.equal(r.block, true);
  assert.match(r.message, /yalnız tren gider/);
  assert.equal(auditLines().at(-1).event, "push-main-blocked");
});

test("push to a task or a train branch passes", () => {
  assert.equal(evaluate(bash("git push origin HEAD:task/x")).block, false);
  assert.equal(evaluate(bash("git push origin HEAD:train/20261008T1000Z")).block, false);
});

test("a worker agent cannot edit a record file; the coordinator can", () => {
  const worker = {
    tool_name: "Edit",
    session_id: "s",
    cwd: "C:/c/coord/.claude/worktrees/agent-a1",
    tool_input: { file_path: "C:\\c\\coord\\.claude\\worktrees\\agent-a1\\docs\\plan\\KARARLAR.md" },
  };
  assert.equal(evaluate(worker).block, true);
  assert.match(evaluate(worker).message, /yalnız koordinatör yazar/);
  assert.equal(evaluate({ ...worker, tool_input: { file_path: "C:/c/coord/.claude/worktrees/agent-a1/apps/web/src/x.ts" } }).block, false);
  const coord = { tool_name: "Write", session_id: "s", cwd: "C:/c/coord", tool_input: { file_path: "C:/c/coord/DURUM.md" } };
  assert.equal(evaluate(coord).block, false);
  assert.equal(evaluate({ ...coord, agent_id: "a1" }).block, true);
});

test("record files: DURUM, KARARLAR, SORULAR, BACKLOG, EKRAN-PLANI and the daily log; not the archive or a screen report", () => {
  for (const f of [
    "DURUM.md",
    "docs/plan/KARARLAR.md",
    "docs/plan/SORULAR.md",
    "docs/plan/BACKLOG.md",
    "docs/plan/EKRAN-PLANI.md",
    "docs/plan/gunluk/2026-10-08.md",
    "docs\\plan\\gunluk\\2026-10-08\\0930-X-nf-isci-ab.md",
  ])
    assert.equal(isRecordFile(f), true, f);
  for (const f of ["docs/archive/2026-10-08-v1/DERSLER.md", "docs/plan/ekranlar/02-requests/uygulama/RAPOR.md", "apps/web/src/DURUM.md.ts"])
    assert.equal(isRecordFile(f), false, f);
  assert.equal(inWorkerTree("C:\\c\\coord\\.claude\\worktrees\\agent-a1"), true);
  assert.equal(inWorkerTree("C:/c/coord/.claude/worktrees/workflow-v2"), false);
});

test("a worker's git commit carrying a record file is refused", () => {
  const dir = cloneRepo("worker-commit");
  fs.mkdirSync(path.join(dir, "docs/plan"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs/plan/KARARLAR.md"), "x");
  git(dir, "add", "docs/plan/KARARLAR.md");
  const r = evaluate({ ...bash('git commit -m "x"'), cwd: dir, agent_id: "a9" });
  assert.equal(r.block, true);
  assert.equal(evaluate({ ...bash('git commit -m "x"'), cwd: dir }).block, false);
});
```

- [ ] **Step 3: Kırmızıyı gör**

Run: `node --test scripts/guard.test.mjs`
Expected: FAIL — `isRecordFile`/`inWorkerTree` yeni tanımda değil, `yalnız tren gider` mesajı yok.

- [ ] **Step 4: `guard.mjs`'i sadeleştir**

1. Baş yorumunu şununla değiştir:

```js
// WORKFLOW-V2 (spec §7.2, §10): PreToolUse guard for Bash, PowerShell, Edit and Write.
// - A push to main is refused: only scripts/train.mjs sends main (its own process, not seen here), and
//   only a train CI passed. Emergency: NF_OVERRIDE="<reason>" in front of the push saves origin/main
//   as refs/nf-backup/main/<stamp> first and is logged.
// - A worker agent (a hook input with agent_id, or a folder under .claude/worktrees/agent-*) never writes
//   a record file (DURUM, KARARLAR, SORULAR, BACKLOG, EKRAN-PLANI, the daily log), by edit or by commit.
// - Deleting a branch or removing a worktree is allowed; the tip is saved under refs/nf-backup/... first.
// - Commands the settings deny list refuses are logged when tried.
// Every decision lands in <OPS_DIR>/audit.log (one JSON object per line, secrets masked).
// Fail-closed only for a push to main: if evaluate() itself breaks, that push is refused.
```

2. İçe aktarımlar: `import { status as lockStatus } from "./lock.mjs";` ve `import { INBOX_DIR, isCoordinator, slug } from "./inbox.mjs";` satırlarını sil; `import { OPS_DIR } from "./ops.mjs";` ekle; dosyada `INBOX_DIR` geçen her yeri `OPS_DIR` yap.
3. Sil: `ENFORCE_DAY`, `ENFORCE_FROM`, `DOCS_ONLY`, `startsCI`, `E2E_PASS`, `E2E_CODE`, `sameContent`, `e2eGap`, `GATE`, `HEAVY`, `FOCUSED`, `runStep`, `samePath`, `heavyLock`, `heavyRun`, `heavyPush`, `takesLockBefore`, eski `RECORDS`, eski `isRecordFile`, `ALLOW`, `userText`, `HEAD_BYTES`, `workerSession`, `recordsAllow`, `records`, `flagger`, `done`. `pushCall` içindeki `withAhead` yerine `({ dir, refs })` döndür ve `aheadFiles` başka yerde kullanılmıyorsa onu da sil. `prog` ve `words` yalnız silinenlerde kullanılıyorsa sil (`grep -n "prog(\|words(" scripts/guard.mjs`).
4. `commitRecords`'un üstüne ekle:

```js
// ---- record files (spec §6.1): the coordinator's; a worker agent never writes them ----
const RECORDS = /(^|\/)(DURUM\.md|docs\/plan\/(BACKLOG|KARARLAR|SORULAR|EKRAN-PLANI)\.md|docs\/plan\/gunluk\/.+)$/i;
export const isRecordFile = (f) => RECORDS.test(String(f ?? "").replaceAll("\\", "/"));
// Worker agents run in <project>/.claude/worktrees/agent-*/ (Agent tool, isolation: worktree).
const AGENT_TREE = /\/\.claude\/worktrees\/agent-[^/]+\//i;
export const inWorkerTree = (p) => AGENT_TREE.test(`${String(p ?? "").replaceAll("\\", "/")}/`);
const byWorker = (input, where) => Boolean(input.agent_id) || inWorkerTree(where);
const RECORD_REFUSAL =
  "Reddedildi: kayıt dosyasını (DURUM, KARARLAR, SORULAR, BACKLOG, EKRAN-PLANI, günlük) yalnız koordinatör yazar; bulduğunu son mesajına yaz (CLAUDE.md §5).";
```

5. `evaluateEdit`, `evaluate` ve `main`'i şununla değiştir:

```js
const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
function evaluateEdit(input) {
  const file = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "");
  if (!isRecordFile(file) || !byWorker(input, file)) return { block: false };
  audit({ session_id: input.session_id ?? "", agent_id: input.agent_id ?? null, cwd: input.cwd ?? "", tool: input.tool_name, file, event: "record-by-worker-blocked" });
  return { block: true, message: RECORD_REFUSAL };
}

// Returns { block, message? }; performs backups and writes the audit log.
export function evaluate(input) {
  if (EDIT_TOOLS.test(input.tool_name ?? "")) return evaluateEdit(input);
  const cmd = input.tool_input?.command ?? "";
  const cwd = input.cwd ?? process.cwd();
  const base = { session_id: input.session_id ?? "", agent_id: input.agent_id ?? null, cwd, tool: input.tool_name ?? "", command: cmd };
  let segs = [];
  try {
    for (const re of DENIED) if (re.test(cmd)) audit({ ...base, event: "deny-pattern", pattern: String(re) });
    const links = chain(cmd, input.tool_name === "PowerShell" ? "pwsh" : "bash");
    segs = links.map((l) => l.seg);
    const dirs = folders(segs, cwd);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      for (const entry of backupBranches(seg, dirs[i], base)) audit(entry);
      if (byWorker(input, dirs[i]) && commitRecords(seg, dirs[i]).length) {
        audit({ ...base, event: "record-by-worker-blocked" });
        return { block: true, message: RECORD_REFUSAL };
      }
      const push = pushCall(seg, dirs[i]);
      if (!push || !push.refs.some(toMain)) continue;
      const reason = overrideReason(segs, i);
      if (reason) {
        const b = backupMain(push.dir);
        audit({ ...base, event: "push-main-override", reason, backup: b.ref, sha: b.sha, fetched: b.fetched });
        continue;
      }
      audit({ ...base, event: "push-main-blocked" });
      return {
        block: true,
        message:
          "main'e gönderim reddedildi: main'e yalnız tren gider (`node scripts/train.mjs run <dal…>`, koordinatör; CLAUDE.md §5). " +
          'Acil durumda push komutunun başına NF_OVERRIDE="<gerekçe>" koy; origin/main önce yedeklenir ve kayda düşer.',
      };
    }
    return { block: false };
  } catch (err) {
    const overridden = segs.some((_, i) => overrideReason(segs, i));
    const risky = /\bpush\b/.test(cmd) && /\bmain\b/.test(cmd) && !overridden;
    try {
      audit({ ...base, event: "guard-error", error: String(err?.message ?? err), blocked: risky });
    } catch {}
    return risky
      ? { block: true, message: `guard hata verdi, main'e gönderim güvenlik için reddedildi: ${err?.message ?? err}. NF_OVERRIDE ile aşılabilir.` }
      : { block: false };
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  const tool = input.tool_name ?? "";
  if (!/^(Bash|PowerShell)$/.test(tool) && !EDIT_TOOLS.test(tool)) return;
  const r = evaluate(input);
  if (r.block) {
    process.stderr.write(r.message);
    process.exitCode = 2; // PreToolUse: exit 2 = refuse, stderr goes back to the model
  }
}
```

- [ ] **Step 5: Yeşil**

Run: `node --check scripts/guard.mjs && node --test scripts/guard.test.mjs`
Expected: `fail 0`. Bir `ReferenceError` silinen bir yardımcıya işaret ediyorsa o yardımcı kalan bir fonksiyonda kullanılıyordur: geri koy.

- [ ] **Step 6: Commit**

```bash
git add scripts/guard.mjs scripts/guard.test.mjs
git commit -m "refactor(scripts): the guard refuses main pushes outside the train and record writes by worker agents, nothing else (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Posta kutusunu kaldır

**Files:**
- Delete: `scripts/inbox.mjs`
- Modify: `scripts/decision-log.mjs`, `scripts/guard.test.mjs`, `.claude/settings.json`, `package.json`

**Interfaces:**
- Consumes: `ops.mjs` `OPS_DIR`.
- Produces: `decision-log.mjs` aynı CLI ve kanca; mesajları `KARARLAR` der.

- [ ] **Step 1: `decision-log.mjs`'i güncelle**

- `import { INBOX_DIR } from "./inbox.mjs";` → `import { OPS_DIR as INBOX_DIR } from "./ops.mjs";`
- 2. satır yorumu: `// KARAR-001: Mert's decision log (CLAUDE.md §2.8, docs/plan/KARARLAR.md).`
- 153–154. satırlardaki metin: `"Bu oturumda kurala çevir: docs/plan/KARARLAR.md'ye (tarih, kaynak \"Mert\", neden, reddedilen seçenek). Yalnız bu işe özelse ya da TBD ise raporda öyle söyle."`
- 160. satırdaki `ILKELER/KARARLAR'da düzelt` → `KARARLAR.md'de düzelt`
- 177. satırdaki biçim: `"Dayanak: <KARARLAR madde kimliği / Mert'in <tarih> kararı>" ya da "Dayanak: yok — yeni karar".`

- [ ] **Step 2: Posta kutusu testlerini ve dosyayı sil**

- `scripts/guard.test.mjs`'ten `const inbox = await import("./inbox.mjs");` satırını ve adı `inbox:` ya da `board:` ile başlayan testleri sil.
- Run: `git rm scripts/inbox.mjs`

- [ ] **Step 3: Kancaları `.claude/settings.json`'dan çıkar**

`hooks` bloğunda:
- `PreToolUse` → `Bash|PowerShell` girdisinde yalnız `guard.mjs` kalır (`inbox.mjs hook pre` girdisini sil).
- `PostToolUse`'ta matcher'sız `inbox.mjs hook post` girdisini sil (`AskUserQuestion` girdisi kalır).
- `Stop` bloğunu tümüyle sil.

- [ ] **Step 4: Test listesini güncelle**

`package.json` `test` betiğinde `scripts/coord-hooks.test.mjs` → `scripts/guard.test.mjs`.

- [ ] **Step 5: Yeşil ve iz kalmadı**

Run: `node --test scripts/guard.test.mjs scripts/decision-log.test.mjs scripts/lock.test.mjs`
Expected: `fail 0`.
Run: `git grep -n "inbox.mjs" -- scripts .claude package.json`
Expected: çıktı yok. (`CLAUDE.md` ve skill'lerdeki izleri Task 9 ve Task 11 temizler.)

- [ ] **Step 6: Commit**

```bash
git add scripts/decision-log.mjs scripts/guard.test.mjs .claude/settings.json package.json
git commit -m "chore(scripts): the inbox goes; agents report back to the coordinator directly (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tren: `ci`, kilitsiz `push`, `run`, `coord/kayit`

**Files:**
- Modify: `scripts/train.mjs`, `scripts/train-test-world.mjs`, `scripts/train-steps.test.mjs`

**Interfaces:**
- Consumes: `lock.mjs` `take`, `release`, `status`, `clearDead`; `guard.mjs` `audit`, `backupMain`.
- Produces: `train.mjs` → `plan(ctx, args)`, `build(ctx, args)`, `ci(ctx, { timeoutMin? }) → { code, lines }`, `push(ctx) → { code, lines }`, `applyLocal(ctx) → { code, lines }`, `run(ctx, args) → { code: 0|1|2, lines, failedStep? }`. `ctx.exec.ciWait({ branch, sha, log, timeoutMin }) → { conclusion: "success"|"failure"|"cancelled"|"no-run"|"timeout"|…, run: number|null, failedJobs: string[] }`. Tren durumu: `s.gate` yerine `s.ci = { ok, head, run, conclusion, docsOnly, failedJobs, at }`. CLI: `node scripts/train.mjs plan|build|ci|push|apply-local|run`.

- [ ] **Step 1: Test dünyasını güncelle**

`scripts/train-test-world.mjs`:
- `export const { plan, build, applyLocal, gate, push } = await import("./train.mjs");` → `export const { plan, build, applyLocal, ci, push, run } = await import("./train.mjs");`
- `world()` içinde `const calls = { psql: [], pnpm: [], dbSchema: [], ci: [] };` ve `exec`'e ekle:

```js
    ciWait({ branch, sha, log }) {
      calls.ci.push({ branch, sha });
      fs.appendFileSync(log, `ci ${branch} ${sha}\n`);
      return w.ciResult ?? { conclusion: "success", run: 101, failedJobs: [] };
    },
```

- `return { dir, origin, repo, ctx, calls, ledger, branch, failOn: null, redStep: null };` → sonuna `ciResult: null` ekle.
- `gated` yardımcısını sil, yerine:

```js
export function greened(...branches) {
  built(...branches);
  const r = ci(w.ctx);
  assert.equal(r.code, 0, text(r));
}
```

- [ ] **Step 2: Yeni tren testlerini yaz (kırmızı)**

`scripts/train-steps.test.mjs`:
- İçe aktarımda `gate` → `ci, run`, `gated` → `greened`.
- Adı `gate:` ile başlayan bütün testleri ve adı `push:` ile başlayan bütün testleri sil.
- "apply-local: takes and keeps db.lock (never main.lock), …" testinde başlığı `"apply-local: applies new migrations in number order with their ledger rows and lets db.lock go"` yap; `assert.equal(lock("db").identity, ID);` → `assert.equal(lock("db").free, true);`; `assert.equal(lock("main").free, true);` satırını sil.
- Ekle:

```js
test("apply-local: a db.lock whose holder died (taken before this boot) is cleared, not waited for", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  built("task/m1");
  fs.mkdirSync(process.env.NEWFORK_LOCK_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.NEWFORK_LOCK_DIR, "db.lock"),
    JSON.stringify({ identity: "oturum/eski", purpose: "test:db", startedAt: "2000-01-01T00:00:00Z", pid: 4242 }),
  );
  const r = applyLocal(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.match(text(r), /ölü sahibinden temizlendi: oturum\/eski/);
});

// ---- ci ----

const code = (name) => ["code", { [`apps/web/src/${name}.ts`]: `export const ${name} = 1;\n` }];

test("ci: pushes train/<stamp>, waits for that sha's run and records it green", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  const r = ci(w.ctx);
  assert.equal(r.code, 0, text(r));
  const head = git(w.repo, "rev-parse", `train/${STAMP}`);
  assert.equal(git(w.origin, "rev-parse", `refs/heads/train/${STAMP}`), head);
  assert.deepEqual(w.calls.ci, [{ branch: `train/${STAMP}`, sha: head }]);
  assert.deepEqual({ ok: state().ci.ok, head: state().ci.head, run: state().ci.run }, { ok: true, head, run: 101 });
  assert.equal(auditLines().at(-1).event, "train-ci-green");
});

test("ci: a red run names its failed jobs, and push then refuses that head", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  w.ciResult = { conclusion: "failure", run: 202, failedJobs: ["e2e"] };
  const r = ci(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /CI failure: run 202; düşen işler: e2e/);
  const before = git(w.origin, "rev-parse", "refs/heads/main");
  const p = push(w.ctx);
  assert.equal(p.code, 1);
  assert.match(text(p), /CI bu sha'da yeşil değil/);
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), before);
});

test("ci: no run showing up for the sha (Actions down) is a stop, not an endless wait", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  w.ciResult = { conclusion: "no-run", run: null, failedJobs: [] };
  const r = ci(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /CI no-run/);
  assert.equal(state().ci.ok, false);
});

test("ci: a docs-only train needs no CI run", () => {
  w.branch("task/d", ["d", { "docs/plan/x.md": "x\n" }]);
  built("task/d");
  const r = ci(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.equal(w.calls.ci.length, 0);
  assert.equal(state().ci.docsOnly, true);
});

test("ci: an uncommitted change in the train folder stops it before anything is pushed", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  write(w.ctx.trainDir, "stray.txt", "x");
  const r = ci(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /tren klasörü temiz değil/);
  assert.equal(w.calls.ci.length, 0);
  assert.throws(() => git(w.origin, "rev-parse", "--verify", `refs/heads/train/${STAMP}`));
});

// ---- push ----

test("push: fast-forwards origin main to a train CI passed, takes no lock, logs the push", () => {
  w.branch("task/a", code("a"));
  greened("task/a");
  const head = state().ci.head;
  const r = push(w.ctx);
  assert.equal(r.code, 0, text(r));
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), head);
  assert.equal(lock("db").free, true);
  assert.equal(auditLines().at(-1).event, "train-push");
});

test("push: main moved since the build is refused (no force)", () => {
  w.branch("task/a", code("a"));
  greened("task/a");
  write(w.repo, "README.md", "moved\n");
  commit(w.repo, "moved");
  git(w.repo, "push", "-q", "origin", "HEAD:main");
  const r = push(w.ctx);
  assert.equal(r.code, 1);
  assert.match(text(r), /main ilerledi, yeniden build/);
});

test("push: NF_OVERRIDE passes a head CI did not pass, after saving origin main under refs/nf-backup/main/", () => {
  w.branch("task/a", code("a"));
  built("task/a");
  const before = git(w.origin, "rev-parse", "refs/heads/main");
  const r = push({ ...w.ctx, override: "acil düzeltme" });
  assert.equal(r.code, 0, text(r));
  assert.match(git(w.repo, "for-each-ref", "--format=%(refname)", "refs/nf-backup/main/"), /refs\/nf-backup\/main\//);
  const o = auditLines().find((l) => l.event === "train-override");
  assert.equal(o.reason, "acil düzeltme");
  assert.equal(o.sha, before);
});

// ---- run ----

test("run: build, ci, push and apply-local in one command; main ends at the train, db.lock is free", () => {
  w.branch("task/m1", ["m1", { "supabase/migrations/20261008020000_m1.sql": "create table m1(id int);\n" }]);
  const r = run(w.ctx, ["task/m1"]);
  assert.equal(r.code, 0, text(r));
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), state().head);
  assert.deepEqual(state().applied, ["20261008020000_m1.sql"]);
  assert.equal(lock("db").free, true);
});

test("run: a red CI stops before push; main does not move", () => {
  w.branch("task/a", code("a"));
  w.ciResult = { conclusion: "failure", run: 303, failedJobs: ["check"] };
  const before = git(w.origin, "rev-parse", "refs/heads/main");
  const r = run(w.ctx, ["task/a"]);
  assert.equal(r.code, 1);
  assert.equal(r.failedStep, "ci");
  assert.equal(git(w.origin, "rev-parse", "refs/heads/main"), before);
});

test("run: coord/kayit rides along while it holds commits main lacks, and not after", () => {
  w.branch("coord/kayit", ["records", { "DURUM.md": "# Durum\n" }]);
  const r = run(w.ctx, []);
  assert.equal(r.code, 0, text(r));
  assert.deepEqual(state().included.map((b) => b.name), ["coord/kayit"]);
  const again = run({ ...w.ctx, now: () => new Date("2026-10-08T11:00:00Z") }, []);
  assert.equal(again.code, 1);
  assert.match(text(again), /trene girecek dal yok/);
});
```

- [ ] **Step 3: Kırmızıyı gör**

Run: `node --test scripts/train-steps.test.mjs`
Expected: FAIL — `ci is not a function` / `run is not a function`.

- [ ] **Step 4: `train.mjs`'i değiştir**

1. Baş yorumdaki adım listesini şununla değiştir:

```js
//   plan <branch[@sha]…>   order, blockers, warnings and a dry run of build; changes nothing but `git fetch`
//   build <branch[@sha]…>  train/<stamp> from origin/main in the train folder; exit 2 = a branch was left out
//   ci                     pushes train/<stamp> and waits for its GitHub Actions run: the full check, once (WORKFLOW-V2)
//   push                   origin main fast-forwarded to the train, only when ci was green for that very sha
//   apply-local            the train's new migrations into the shared local database, holding db for this step only
//   run <branch[@sha]…>    build → ci → push → apply-local; coord/kayit rides along when main lacks its commits
// The push runs inside this script, so scripts/guard.mjs never sees it; the same rules (fast-forward only, a green
// CI) hold here and land in the guard's audit.log. NF_OVERRIDE="<reason>" in front of a step passes a lock or CI
// check (origin/main saved first; never a non-fast-forward push) and is logged.
```

2. İçe aktarımlar: `import { take, release, status as lockStatus, clearDead } from "./lock.mjs";` ve `import { audit, backupMain } from "./guard.mjs";` (artık `ciState` yok).
3. `hold`'u şununla değiştir:

```js
// The train holds `name` (already, or takes it now); a dead holder is cleared first; another live identity's lock
// is a check NF_OVERRIDE can pass.
function hold(ctx, s, name, step, lines, beforeOverride) {
  if (mine(s, name)) return true;
  const cleared = clearDead(name);
  if (cleared) lines.push(cleared);
  if (lockOf(name).free && take(name, `${s.identity}, tren ${step}`).ok) return true;
  const l = lockOf(name);
  return pass(ctx, s, step, `${name}.lock başka kimlikte: ${l.identity ?? "?"}${l.purpose ? ` (${l.purpose})` : ""}`, lines, beforeOverride);
}
```

4. `ciCheck` fonksiyonunu ve `gate` fonksiyonunu sil.
5. `build`'in yazdığı `state`'te `gate: null,` → `ci: null,`.
6. `applyLocal`'in sonundaki son iki satırı (`lines.push(mine(s, "db") ? …)` ve `return { code: 0, lines };`) ve `if (failed) return stop(…)` satırını şununla değiştir:

```js
  if (failed) return stop("ilk hatada durdu; kalan göçler uygulanmadı, uygulanan geri alınmaz (düzeltme yeni göçle)");
  letGo(s, "db");
  lines.push("db.lock bırakıldı");
  return { code: 0, lines };
```

7. `push`'u şununla değiştir:

```js
export function push(ctx) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const { repo } = ctx;
  const lines = [];
  tryGit(repo, ["fetch", "-q", "origin"]);
  const tip = git(repo, ["rev-parse", `refs/heads/${s.branch}`]);
  const before = git(repo, ["rev-parse", BASE]);
  if (!isAncestor(repo, before, tip)) {
    refuse(ctx, s, "push", `main ilerledi, yeniden build (origin/main @${short(before)} trenin atası değil; force push yok)`, lines, { before, after: tip });
    return { code: 1, lines };
  }
  // passing a missing green CI with NF_OVERRIDE first saves origin/main, as the guard does
  const backup = () => {
    const b = backupMain(repo);
    return { backup: b.ref, sha: b.sha, fetched: b.fetched };
  };
  if (!(s.ci?.ok && s.ci.head === tip) && !pass(ctx, s, "push", `CI bu sha'da yeşil değil (@${short(tip)})`, lines, backup)) return { code: 1, lines };
  const r = spawnSync("git", ["-C", repo, "push", "origin", `${tip}:refs/heads/main`], { encoding: "utf8" });
  if (r.status !== 0) {
    audit({ ...auditBase(ctx, "push"), event: "train-push-failed", before, after: tip, branch: s.branch });
    lines.push(`push reddedildi: ${tailOf(r.stderr, 3).join(" | ")}`);
    return { code: 1, lines };
  }
  audit({ ...auditBase(ctx, "push"), event: "train-push", before, after: tip, branch: s.branch });
  s.pushed = { at: new Date().toISOString(), before, after: tip };
  writeState(ctx, s);
  lines.push(`main: ${short(before)}..${short(tip)} (${s.branch})`);
  return { code: 0, lines };
}
```

8. `push`'un üstüne `ci`'yi ekle:

```js
const DOCS_ONLY = /^docs\/|\.md$/; // ci.yml's paths-ignore: such a train starts no run

export function ci(ctx, { timeoutMin = 90 } = {}) {
  const s = readState(ctx);
  if (!s) return NO_STATE;
  const lines = [];
  const tip = tryGit(ctx.repo, ["rev-parse", `refs/heads/${s.branch}`]);
  const head = git(ctx.trainDir, ["rev-parse", "HEAD"]);
  const dirty = listed(git(ctx.trainDir, ["status", "--porcelain"]));
  if (dirty.length) refuse(ctx, s, "ci", `tren klasörü temiz değil (${dirty.slice(0, 3).join("; ")}); commit'le ya da elle bak`, lines);
  else if (head !== tip) refuse(ctx, s, "ci", `tren klasörü ${s.branch} ucunda değil (@${short(head)})`, lines);
  if (lines.length) return { code: 1, lines };
  const at = () => ctx.now().toISOString();
  const files = listed(git(ctx.repo, ["diff", "--name-only", `${s.base}..${tip}`]));
  if (files.every((f) => DOCS_ONLY.test(f))) {
    s.ci = { ok: true, head: tip, run: null, conclusion: "docs-only", docsOnly: true, failedJobs: [], at: at() };
    writeState(ctx, s);
    lines.push("yalnız belge değişti: CI koşmaz, gerekmez");
    return { code: 0, lines };
  }
  const p = spawnSync("git", ["-C", ctx.repo, "push", "-q", "origin", `${tip}:refs/heads/${s.branch}`], { encoding: "utf8" });
  if (p.status !== 0) {
    lines.push(`${s.branch} push edilemedi: ${tailOf(p.stderr, 3).join(" | ")}`);
    return { code: 1, lines };
  }
  const log = logFile(ctx, s.stamp, "ci");
  const r = ctx.exec.ciWait({ branch: s.branch, sha: tip, log, timeoutMin });
  const ok = r.conclusion === "success";
  s.ci = { ok, head: tip, run: r.run, conclusion: r.conclusion, docsOnly: false, failedJobs: r.failedJobs ?? [], at: at() };
  writeState(ctx, s);
  audit({ ...auditBase(ctx, "ci"), event: ok ? "train-ci-green" : "train-ci-red", train: s.branch, run: r.run, conclusion: r.conclusion });
  if (ok) {
    lines.push(`CI yeşil: run ${r.run} (${s.branch} @${short(tip)})`);
    return { code: 0, lines };
  }
  lines.push(`CI ${r.conclusion}: run ${r.run ?? "-"}; düşen işler: ${s.ci.failedJobs.join(", ") || "-"}; log: ${log}`);
  if (r.run) lines.push(`ayrıntı: gh run view ${r.run} --log-failed`);
  return { code: 1, lines };
}
```

9. `push`'un altına `run`'ı ekle:

```js
const COORD_BRANCH = "coord/kayit"; // the coordinator's records (spec §7.3)
function coordBranch(repo) {
  const ref = tryGit(repo, ["rev-parse", "--verify", "-q", `refs/heads/${COORD_BRANCH}`]);
  return ref && ahead(repo, ref).length ? COORD_BRANCH : null;
}

export function run(ctx, args) {
  const names = [...args];
  const coord = coordBranch(ctx.repo);
  if (coord && !names.some((n) => n.split("@")[0] === COORD_BRANCH)) names.push(coord);
  if (!names.length) return { code: 1, lines: ["trene girecek dal yok"] };
  const b = build(ctx, names);
  const lines = [...b.lines];
  if (b.code === 1) return { code: 1, lines, failedStep: "build" };
  for (const [step, fn] of [["ci", ci], ["push", push], ["apply-local", applyLocal]]) {
    const r = fn(ctx);
    lines.push(`— ${step}`, ...r.lines);
    if (r.code !== 0) return { code: 1, lines, failedStep: step };
  }
  return { code: b.code, lines };
}
```

10. `realExec`'e `ciWait`'i ekle (dosyanın `toLog`'unun altına yardımcılar, `realExec` nesnesine tek satır):

```js
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const ghJson = (args, cwd) => {
  const r = spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 60000 });
  try {
    return r.status === 0 ? JSON.parse(r.stdout) : null;
  } catch {
    return null;
  }
};
// The GitHub Actions run of `sha` on `branch`: up to 5 minutes for it to show up, then until it completes or
// timeoutMin passes. Progress goes to the log.
function ciWait({ cwd, branch, sha, log, timeoutMin }) {
  const note = (l) => fs.appendFileSync(log, `${new Date().toISOString()} ${l}\n`);
  let run = null;
  const seen = Date.now() + 5 * 60000;
  while (!run && Date.now() < seen) {
    run = (ghJson(["run", "list", "--branch", branch, "--limit", "5", "--json", "databaseId,headSha"], cwd) ?? []).find((r) => r.headSha === sha)?.databaseId ?? null;
    if (!run) sleepSync(10000);
  }
  if (!run) {
    note("koşu 5 dakikada görünmedi");
    return { conclusion: "no-run", run: null, failedJobs: [] };
  }
  note(`koşu ${run}`);
  const end = Date.now() + timeoutMin * 60000;
  while (Date.now() < end) {
    const v = ghJson(["run", "view", String(run), "--json", "status,conclusion,jobs"], cwd);
    if (v) {
      note(`${v.status}${v.conclusion ? ` ${v.conclusion}` : ""}`);
      if (String(v.status).toLowerCase() === "completed")
        return {
          conclusion: v.conclusion || "unknown",
          run,
          failedJobs: (v.jobs ?? []).filter((j) => !["success", "skipped"].includes(String(j.conclusion))).map((j) => j.name),
        };
    }
    sleepSync(30000);
  }
  note("süre doldu");
  return { conclusion: "timeout", run, failedJobs: [] };
}
```

`realExec` nesnesine: `ciWait: (o) => ciWait({ cwd: trainDir, ...o }),`

11. `USAGE` ve `main`'i şununla değiştir:

```js
const USAGE = [
  "usage: node scripts/train.mjs run <dal[@sha]…>   (build → ci → push → apply-local; coord/kayit kendiliğinden)",
  "       node scripts/train.mjs plan|build <dal[@sha]…>",
  "       node scripts/train.mjs ci|push|apply-local",
  '       NF_OVERRIDE="<gerekçe>" önüne: kilit ya da CI kontrolünü aşar (origin/main önce yedeklenir, audit.log); fast-forward olmayan push asla',
];

function main(argv) {
  const [cmd, ...rest] = argv;
  const repo = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const ctx = { repo, trainDir: TRAIN_DIR, exec: realExec(TRAIN_DIR), now: () => new Date(), override: process.env.NF_OVERRIDE?.trim() || null };
  const r =
    cmd === "plan" && rest.length
      ? plan(ctx, rest)
      : cmd === "build" && rest.length
        ? build(ctx, rest)
        : cmd === "ci"
          ? ci(ctx)
          : cmd === "push"
            ? push(ctx)
            : cmd === "apply-local"
              ? applyLocal(ctx)
              : cmd === "run"
                ? run(ctx, rest)
                : { code: 1, lines: USAGE };
  for (const l of r.lines) console.log(l);
  process.exitCode = r.code;
}
```

- [ ] **Step 5: Yeşil**

Run: `node --test scripts/train-plan.test.mjs scripts/train-steps.test.mjs`
Expected: `fail 0`. `git grep -n "gate\|heavy\|main.lock" scripts/train*.mjs` yalnız açıklama dışında iz göstermemeli; gösterirse temizle.

- [ ] **Step 6: Commit**

```bash
git add scripts/train.mjs scripts/train-test-world.mjs scripts/train-steps.test.mjs
git commit -m "feat(scripts): the train runs its full check once on CI and fast-forwards main to that green commit (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: CI yalnız trende

**Files:**
- Modify: `.github/workflows/ci.yml:1-15`

- [ ] **Step 1: Tetikleri değiştir**

`on:` ve `concurrency:` bloklarını şununla değiştir:

```yaml
on:
  # WORKFLOW-V2 (spec §7.2): the full check runs once per train, on its train/<stamp> branch; main only ever
  # receives that same green commit (scripts/train.mjs push), so a push to main or task/** starts nothing.
  push:
    branches: ["train/**"]
    paths-ignore: ["docs/**", "**/*.md"]
  pull_request:
    paths-ignore: ["docs/**", "**/*.md"]
  workflow_dispatch:

# A newer push to the same ref (a PR) cancels the running check; every train branch is new.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

- [ ] **Step 2: Gözle doğrula**

Run: `git diff .github/workflows/ci.yml`
Expected: yalnız bu iki blok değişti; girinti iki boşluk; `jobs:` aynı.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the full check on train branches only (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Kancalar: ajan raporu ve DURUM geri yükleme

**Files:**
- Create: `scripts/hooks.mjs`, `scripts/hooks.test.mjs`
- Modify: `.claude/settings.json`, `package.json`

**Interfaces:**
- Produces: `jobOf(text) → string|null`, `day(date) → "YYYY-MM-DD"`, `agentReport(input, { projectDir, now? }) → filePath`, `sessionStart(input, { projectDir }) → { hookSpecificOutput } | null`. CLI: `node scripts/hooks.mjs agent-report|session-start` (stdin JSON).

- [ ] **Step 1: Testleri yaz (kırmızı)**

`scripts/hooks.test.mjs`:

```js
#!/usr/bin/env node
// WORKFLOW-V2: scripts/hooks.mjs in throwaway folders. Run: node --test scripts/hooks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { agentReport, sessionStart, jobOf } from "./hooks.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "newfork-hooks-"));
const at = new Date(2026, 9, 8, 9, 5); // local 2026-10-08 09:05
const rel = (dir, file) => path.relative(dir, file).replaceAll("\\", "/");

test("jobOf reads the job id from the contract's first line", () => {
  assert.equal(jobOf("İŞ: EKRAN-02 | DURUM: HAZIR | DAL: task/ekran-02@abc"), "EKRAN-02");
  assert.equal(jobOf("Özet\nİŞ: BL-987 | DURUM: SORU"), "BL-987");
  assert.equal(jobOf("hiç sözleşme yok"), null);
});

test("agent-report: the last message lands in docs/plan/gunluk/<day>/<HHMM>-<job>-<agent>-<id8>.md", () => {
  const dir = tmp();
  const file = agentReport(
    { agent_id: "a1b2c3d4e5", agent_type: "nf-isci", last_assistant_message: "İŞ: BL-1 | DURUM: HAZIR\nbitti" },
    { projectDir: dir, now: at },
  );
  assert.equal(rel(dir, file), "docs/plan/gunluk/2026-10-08/0905-BL-1-nf-isci-a1b2c3d4.md");
  assert.match(fs.readFileSync(file, "utf8"), /ajan: nf-isci[\s\S]*İŞ: BL-1 \| DURUM: HAZIR\nbitti/);
});

test("agent-report: the same minute twice keeps both files", () => {
  const dir = tmp();
  const input = { agent_id: "a1", agent_type: "nf-okur", last_assistant_message: "İŞ: BL-1 | DURUM: HAZIR" };
  const one = agentReport(input, { projectDir: dir, now: at });
  const two = agentReport(input, { projectDir: dir, now: at });
  assert.notEqual(one, two);
  assert.equal(fs.readdirSync(path.dirname(one)).length, 2);
});

test("agent-report: no last message falls back to the agent's transcript, then to a placeholder", () => {
  const dir = tmp();
  const tr = path.join(dir, "agent.jsonl");
  fs.writeFileSync(
    tr,
    [
      JSON.stringify({ type: "user", message: { content: "x" } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "İŞ: BL-2 | DURUM: TAKILDI" }] } }),
      "{broken",
    ].join("\n"),
  );
  const f1 = agentReport({ agent_type: "nf-isci", agent_transcript_path: tr }, { projectDir: dir, now: at });
  assert.match(fs.readFileSync(f1, "utf8"), /İŞ: BL-2/);
  const f2 = agentReport({ agent_type: "nf-okur" }, { projectDir: dir, now: at });
  assert.match(fs.readFileSync(f2, "utf8"), /\(son mesaj boş\)/);
  assert.match(path.basename(f2), /^0905-is-yok-nf-okur/);
});

test("session-start: the top of DURUM.md goes back into context; no DURUM.md, no output", () => {
  const dir = tmp();
  assert.equal(sessionStart({ source: "compact" }, { projectDir: dir }), null);
  fs.writeFileSync(path.join(dir, "DURUM.md"), `# Durum — 2026-10-08 10:00\n🟢 iyi\n## Koşuyor\n- BL-1\n${"x\n".repeat(5000)}`);
  const out = sessionStart({ source: "compact" }, { projectDir: dir });
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(out.hookSpecificOutput.additionalContext, /DURUM\.md \(compact\)[\s\S]*## Koşuyor\n- BL-1/);
  assert.ok(out.hookSpecificOutput.additionalContext.length <= 6500);
});

test("the CLI never fails the session: broken stdin still exits 0", () => {
  const script = fileURLToPath(new URL("./hooks.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [script, "agent-report"], { input: "{not json", encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: tmp() } });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Kırmızıyı gör**

Run: `node --test scripts/hooks.test.mjs`
Expected: FAIL — `Cannot find module './hooks.mjs'`.

- [ ] **Step 3: `scripts/hooks.mjs`'i yaz**

```js
#!/usr/bin/env node
// WORKFLOW-V2 (spec §5.5, §8.2): the coordinator session's two hooks, wired in .claude/settings.json.
//   agent-report   SubagentStop: the agent's last message -> docs/plan/gunluk/<day>/<HHMM>-<job>-<agent>-<id8>.md,
//                  so no report is lost to a missed notification or a compacted context.
//   session-start  SessionStart (startup, resume, clear, compact): the top of DURUM.md back into the context.
// Both read the hook JSON on stdin, write under CLAUDE_PROJECT_DIR and never fail the session (exit 0).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pad = (n) => String(n).padStart(2, "0");
export const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}${pad(d.getMinutes())}`;
const safe = (s, n) => String(s ?? "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, n);

// "İŞ: EKRAN-02 | DURUM: HAZIR | …" (spec §5.4) -> "EKRAN-02"
export const jobOf = (text) => String(text ?? "").match(/^\s*[İI][ŞS]\s*:\s*([^\s|]+)/mu)?.[1] ?? null;

// The last text an agent wrote, from its transcript (one JSON object per line).
function lastText(file) {
  let lines;
  try {
    lines = fs.readFileSync(file, "utf8").split("\n");
  } catch {
    return "";
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    let o;
    try {
      o = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (o?.type !== "assistant") continue;
    const c = o.message?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((p) => p?.type === "text").map((p) => p.text).join("\n") : "";
    if (text.trim()) return text;
  }
  return "";
}

export function agentReport(input, { projectDir, now = new Date() }) {
  const text = String(input.last_assistant_message ?? "").trim() || lastText(input.agent_transcript_path).trim();
  const job = safe(jobOf(text) ?? "is-yok", 40) || "is-yok";
  const agent = safe(input.agent_type ?? "ajan", 24) || "ajan";
  const id = safe(input.agent_id ?? "", 8);
  const dir = path.join(projectDir, "docs", "plan", "gunluk", day(now));
  fs.mkdirSync(dir, { recursive: true });
  const stem = path.join(dir, [hhmm(now), job, agent, id].filter(Boolean).join("-"));
  let file = `${stem}.md`;
  for (let k = 2; fs.existsSync(file); k++) file = `${stem}-${k}.md`;
  fs.writeFileSync(file, `<!-- ajan: ${input.agent_type ?? "?"} · id: ${input.agent_id ?? "?"} · ${now.toISOString()} -->\n${text || "(son mesaj boş)"}\n`);
  return file;
}

const MAX = 6000;
export function sessionStart(input, { projectDir }) {
  let durum;
  try {
    durum = fs.readFileSync(path.join(projectDir, "DURUM.md"), "utf8");
  } catch {
    return null;
  }
  const head = durum.length > MAX ? `${durum.slice(0, MAX)}\n… (devamı DURUM.md'de)` : durum;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `Koordinatörün panosu, DURUM.md (${input.source ?? "?"}). Koordinatörsen işe buradan devam et; değilsen yalnız bilgi içindir.\n\n${head}`,
    },
  };
}

async function main([cmd]) {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw || "{}");
  } catch {}
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    if (cmd === "agent-report") agentReport(input, { projectDir });
    else if (cmd === "session-start") {
      const out = sessionStart(input, { projectDir });
      if (out) process.stdout.write(JSON.stringify(out));
    } else process.stderr.write("usage: node scripts/hooks.mjs agent-report|session-start   (hook JSON on stdin)\n");
  } catch (err) {
    process.stderr.write(`hooks.mjs ${cmd}: ${err?.message ?? err}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
```

- [ ] **Step 4: Yeşil**

Run: `node --test scripts/hooks.test.mjs`
Expected: `fail 0`.

- [ ] **Step 5: Kancaları bağla**

`.claude/settings.json` `hooks` nesnesine ekle:

```json
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/hooks.mjs\" agent-report", "timeout": 15 }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/hooks.mjs\" session-start", "timeout": 15 }
        ]
      }
    ]
```

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 6: Test listesine ekle**

`package.json` `test` betiğinde `scripts/test-db.test.mjs`'ten sonra `scripts/hooks.test.mjs` ekle.

- [ ] **Step 7: Commit**

```bash
git add scripts/hooks.mjs scripts/hooks.test.mjs .claude/settings.json package.json
git commit -m "feat(scripts): every agent's last message is saved to the daily log; DURUM.md comes back after a compaction (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: İşçinin ilk komutu (`wt-hazirla.mjs`)

**Files:**
- Create: `scripts/wt-hazirla.mjs`, `scripts/wt-hazirla.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `branchOf(id) → "task/<id küçük harf>"` (geçersiz kimlikte hata fırlatır); `prepare(id, { cwd, mainDir?, pnpm? }) → { code: 0|1, branch?, message }`. CLI: `node scripts/wt-hazirla.mjs <İŞ-ID>`.

- [ ] **Step 1: Testleri yaz (kırmızı)**

`scripts/wt-hazirla.test.mjs`:

```js
#!/usr/bin/env node
// WORKFLOW-V2: scripts/wt-hazirla.mjs against a throwaway repo with a local bare origin. Never the real main folder.
// Run: node --test scripts/wt-hazirla.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { prepare, branchOf } from "./wt-hazirla.mjs";

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
function world() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "newfork-wt-"));
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, repo], { stdio: "ignore" });
  git(repo, "config", "user.email", "t@t");
  git(repo, "config", "user.name", "t");
  git(repo, "checkout", "-q", "-B", "main");
  fs.writeFileSync(path.join(repo, "README.md"), "x\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "push", "-q", "origin", "HEAD:main");
  const mainDir = path.join(root, "main");
  fs.mkdirSync(path.join(mainDir, "apps/api"), { recursive: true });
  fs.writeFileSync(path.join(mainDir, "apps/api/.env.local"), "LOCAL=1\n");
  const calls = [];
  const pnpm = (args, cwd) => {
    calls.push(args.join(" "));
    return 0;
  };
  return { root, origin, repo, mainDir, calls, pnpm };
}

test("branchOf: task/<id in lower case>; a bad id is refused", () => {
  assert.equal(branchOf("EKRAN-02"), "task/ekran-02");
  assert.throws(() => branchOf("../x"), /iş kimliği geçersiz/);
});

test("new job: task/<id> from origin/main, install then the libs, local env copied", () => {
  const w = world();
  const r = prepare("BL-1", { cwd: w.repo, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(r.code, 0, r.message);
  assert.equal(git(w.repo, "branch", "--show-current"), "task/bl-1");
  assert.equal(git(w.repo, "rev-parse", "HEAD"), git(w.repo, "rev-parse", "origin/main"));
  assert.deepEqual(w.calls, ["install --frozen-lockfile", "--filter @newfork/shared --filter @newfork/ui build"]);
  assert.equal(fs.readFileSync(path.join(w.repo, "apps/api/.env.local"), "utf8"), "LOCAL=1\n");
  assert.match(r.message, /origin\/main/);
});

test("continuing job: an existing origin/task/<id> is checked out with its commits", () => {
  const w = world();
  git(w.repo, "checkout", "-q", "-b", "task/bl-2");
  fs.writeFileSync(path.join(w.repo, "a.txt"), "a\n");
  git(w.repo, "add", "a.txt");
  git(w.repo, "commit", "-q", "-m", "a");
  git(w.repo, "push", "-q", "origin", "task/bl-2");
  const tip = git(w.repo, "rev-parse", "HEAD");
  const other = path.join(w.root, "other");
  execFileSync("git", ["clone", "-q", w.origin, other], { stdio: "ignore" });
  const r = prepare("BL-2", { cwd: other, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(r.code, 0, r.message);
  assert.equal(git(other, "rev-parse", "HEAD"), tip);
  assert.match(r.message, /devam/);
});

test("a dirty worktree stops before anything; a red install names the step", () => {
  const w = world();
  fs.writeFileSync(path.join(w.repo, "dirty.txt"), "x");
  const dirty = prepare("BL-3", { cwd: w.repo, mainDir: w.mainDir, pnpm: w.pnpm });
  assert.equal(dirty.code, 1);
  assert.match(dirty.message, /temiz değil/);
  assert.deepEqual(w.calls, []);
  fs.rmSync(path.join(w.repo, "dirty.txt"));
  const red = prepare("BL-3", { cwd: w.repo, mainDir: w.mainDir, pnpm: () => 1 });
  assert.equal(red.code, 1);
  assert.match(red.message, /pnpm install --frozen-lockfile kırmızı/);
});
```

- [ ] **Step 2: Kırmızıyı gör**

Run: `node --test scripts/wt-hazirla.test.mjs`
Expected: FAIL — modül yok.

- [ ] **Step 3: `scripts/wt-hazirla.mjs`'i yaz**

```js
#!/usr/bin/env node
// WORKFLOW-V2 (spec §5.3): a worker agent's first command, in its own worktree (Agent tool, isolation: worktree).
//   node scripts/wt-hazirla.mjs <İŞ-ID>
// task/<id> from origin/main, or the existing task/<id> (local, or on origin when a job continues), then
// pnpm install, the shared and ui builds, and the local .env files copied from the main folder (never hosted keys).
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const MAIN_DIR = process.env.NEWFORK_MAIN_DIR ?? "C:/Users/TheWe/Documents/Codex/newfork-clean";
const ENV_FILES = ["apps/api/.env.local", "apps/web/.env.local"];
const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const has = (cwd, ref) => spawnSync("git", ["-C", cwd, "rev-parse", "--verify", "-q", ref]).status === 0;
const realPnpm = (args, cwd) =>
  spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, { cwd, stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;

export function branchOf(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(String(id ?? ""))) throw new Error(`iş kimliği geçersiz: "${id}" (ör. BL-987, EKRAN-02)`);
  return `task/${String(id).toLowerCase()}`;
}

export function prepare(id, { cwd, mainDir = MAIN_DIR, pnpm = realPnpm }) {
  const branch = branchOf(id);
  if (git(cwd, ["status", "--porcelain"])) return { code: 1, message: `worktree temiz değil: ${cwd}` };
  git(cwd, ["fetch", "-q", "origin"]);
  let from;
  if (has(cwd, `refs/heads/${branch}`)) {
    git(cwd, ["switch", "-q", branch]);
    from = `yerel ${branch} (devam)`;
  } else if (has(cwd, `refs/remotes/origin/${branch}`)) {
    git(cwd, ["switch", "-q", "-c", branch, "--track", `origin/${branch}`]);
    from = `origin/${branch} (devam)`;
  } else {
    git(cwd, ["switch", "-q", "-c", branch, "origin/main"]);
    from = "origin/main";
  }
  for (const args of [["install", "--frozen-lockfile"], ["--filter", "@newfork/shared", "--filter", "@newfork/ui", "build"]]) {
    const st = pnpm(args, cwd);
    if (st !== 0) return { code: 1, branch, message: `pnpm ${args.join(" ")} kırmızı (çıkış ${st})` };
  }
  const copied = [];
  for (const rel of ENV_FILES) {
    const src = path.join(mainDir, rel);
    const dst = path.join(cwd, rel);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied.push(rel);
    }
  }
  const sha = git(cwd, ["rev-parse", "--short", "HEAD"]);
  return { code: 0, branch, message: `hazır: ${branch} @${sha} (${from}); env: ${copied.join(", ") || "kopyalanacak yok"}` };
}

function main([id]) {
  let r;
  try {
    r = prepare(id, { cwd: process.cwd() });
  } catch (err) {
    r = { code: 1, message: String(err?.message ?? err) };
  }
  console.log(r.message);
  process.exitCode = r.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
```

- [ ] **Step 4: Yeşil**

Run: `node --test scripts/wt-hazirla.test.mjs`
Expected: `fail 0`.

- [ ] **Step 5: Test listesine ekle ve commit**

`package.json` `test` betiğine `scripts/wt-hazirla.test.mjs` ekle.

```bash
git add scripts/wt-hazirla.mjs scripts/wt-hazirla.test.mjs package.json
git commit -m "feat(scripts): a worker's first command sets up its branch, packages and local env (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ajanlar

**Files:**
- Create: `.claude/agents/nf-isci.md`, `.claude/agents/nf-hakem.md`
- Modify: `.claude/agents/nf-okur.md`, `.claude/agents/nf-guvenlik.md`

**Interfaces:**
- Produces: ajan adları `nf-isci`, `nf-hakem` (koordinatör `Agent(subagent_type: …)` ile çağırır); `nf-isci`'nin son mesaj sözleşmesi (Global Constraints'teki ilk satır biçimi); `nf-hakem`'in çıktısı `HÜKÜM: KARAR …` ya da `HÜKÜM: SOR`.

- [ ] **Step 1: `.claude/agents/nf-isci.md`**

````markdown
---
name: nf-isci
description: Newfork işçi alt ajanı. Koordinatörün verdiği tek bir işi kendi worktree'sinde ve task/<iş> dalında uçtan uca yapar (veritabanından ekrana), yalnız hızlı kontrolleri koşar, dalı push eder ve sözleşmeli son mesajı bırakır. Yalnız koordinatör çağırır.
model: opus
effort: medium
disallowedTools: [AskUserQuestion]
---
Sen Newfork'un işçisisin. Koordinatör sana tek bir iş verir; onu kendi worktree'nde uçtan uca yaparsın. `CLAUDE.md` anayasandır; dokunduğun klasörün `CLAUDE.md`'si de geçerlidir.

İLK KOMUT: `node scripts/wt-hazirla.mjs <İŞ-ID>` (görevdeki kimlik). Kırmızıysa dur, `DURUM: TAKILDI` yaz.

ÇALIŞMA
- Önce ara: `docs/plan/KARARLAR.md`'de, `docs/design-canvas.md`'de ve kodda var olan parçayı kullan. Karar gerekiyorsa önce defterde dayanak ara; birebir kapsıyorsa uygula ve dayanağı son mesajına yaz.
- Davranış değişen ya da hata düzelten kodda önce kırmızı test (`superpowers:test-driven-development`). Beklenmedik bozulmada önce neden (`superpowers:systematic-debugging`). Migration, RLS, grant, sorgu: `supabase:supabase-postgres-best-practices`. "Bitti" demeden: `superpowers:verification-before-completion`.
- Küçük commit: her anlamlı adımda bir commit. İngilizce Conventional Commits, sonunda `(<İŞ-ID>)`. Dosyalar adıyla; `git commit -a` yok.
- Yalnız görevdeki "Dokun" listesine dokun. Başka bir şey bulursan düzeltme, "Backlog adayı" olarak yaz. İstisna: işin önündeyse, işle ilgili bir güvenlik açığıysa ya da ürünün çıktısını bozuyorsa düzelt ve nedenini yaz.
- Hızlı kontroller (tam kapı YOK): dokunduğun paketin `pnpm.cmd --filter <paket> lint` ve `typecheck`'i, ilgili vitest dosyaları; veritabanı işinde ilgili pgTAP ve migration denemesi `node scripts/lock.mjs run db -- <komut>`; kullanıcı akışı değiştiyse etkilenen e2e dosyası `node scripts/lock.mjs run db --e2e -- <komut>`; ekran değiştiyse görüntü `artifacts/<İŞ>/` (masaüstü 1440, telefon 390). Port görevde yazılıdır.
- Bitince `git push origin task/<id>` (CI başlatmaz).
- Canlı veritabanına yalnız koordinatör "gönder" dedikten sonra dokun: yedek (`pg_get_functiondef` + silinen nesnelerin tanımı) → Supabase MCP `apply_migration` → md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT → dosya adı = canlı ledger sürümü.
- Yaklaşık 2 saatte bitmeyecek iş: vardığın yeri commit'le, push et, `DURUM: BÖLÜNDÜ` ile kalanı yaz.

YAPMA
- Mert'le konuşma, soru sorma: karar veremiyorsan `DURUM: SORU` ile bitir.
- Kayıt dosyası yazma (`DURUM.md`, `KARARLAR`, `SORULAR`, `BACKLOG`, `EKRAN-PLANI`, günlük); bulduğunu son mesajına yaz.
- main'e push, `scripts/train.mjs`, kökten `pnpm.cmd test` ya da `build`, tam `test:db`, bütün e2e paketi.
- Başkasının worktree'si, isimle süreç öldürme, `git stash`, `reset --hard`, force push.

SON MESAJ (ilk satır makine okur; gövde en çok 15 satır, Türkçe, sade)
```
İŞ: <ID> | DURUM: HAZIR | SORU | TAKILDI | BÖLÜNDÜ | DAL: task/<id>@<kısa sha>
- Ne yapıldı (etkisi; ekranda ne değişti, ekran adıyla)
- Kanıt: komut + sonuç, dosya:satır, görüntü yolu
- Açık kalan ve nedeni
- Ders: (varsa, tek satır; bir klasörün tuzağıysa klasör adıyla)
- Backlog adayı: (varsa)
```
SORU ise: soru (bugün ne oluyor → isimli örnek → her seçeneğin sonucu), adlı seçenekler, önerilen ilk sırada "(Önerilen)", son satırı "Dayanak: <KARARLAR kimliği>" ya da "Dayanak: yok — yeni karar".
````

- [ ] **Step 2: `.claude/agents/nf-hakem.md`**

````markdown
---
name: nf-hakem
description: Newfork karar hakemi. Koordinatör bir soru getirince karar defterine (docs/plan/KARARLAR.md) ve CLAUDE.md vizyonuna bakar; bir madde durumu birebir kapsıyorsa kararı verir, kapsamıyorsa soruyu Mert için hazırlar. Salt okur.
model: opus
effort: high
disallowedTools: [Edit, Write, NotebookEdit, AskUserQuestion]
---
Sen Newfork'un karar hakemisin. Koordinatör sana bir soru getirir; Mert'e sormadan karar verilebilir mi, sen söylersin. Salt okursun.

GİRDİ: soru, seçenekler, işin bağlamı.

YÖNTEM
1. `CLAUDE.md` §1 (vizyon) ve §4 ("Her zaman Mert'e" listesi).
2. `docs/plan/KARARLAR.md`: anahtar kelimeyle ara (Grep), eşleşen maddelerin çevresini oku.
3. Mert'in aynı konudaki son cevapları: `C:/Users/TheWe/Documents/Codex/.newfork-inbox/decisions.jsonl` (büyük dosya; Grep ile anahtar kelime, yalnız son eşleşmeler).
4. Hüküm.

KURALLAR
- KARAR yalnız bir madde durumu birebir kapsıyorsa. "Benzer", "ruhuna uygun", "muhtemelen" → SOR.
- Her zaman SOR: yeni görsel tasarım; temel model (yetki kapsamı, saat dilimi, izin iptali gibi); kayıtların kapsamadığı ürün kuralı; para; gizli anahtar; yeni bağımlılık; geri alınamaz silme; canlıda gerçek veri silme; kural değişikliği.
- İki madde çelişiyorsa en yeni tarihli Mert kararı kazanır (P22). Emin değilsen SOR ve çelişkiyi yaz.
- Dayanak uydurma: kimlik KARARLAR.md'de gerçekten olmalı; maddeden kısa alıntı yap.

ÇIKTI (en çok 12 satır)
```
HÜKÜM: KARAR <seçenek> — Dayanak: <kimlik> "<maddeden kısa alıntı>"
```
ya da
```
HÜKÜM: SOR
Soru: <bugün ne oluyor → isimli örnek → her seçeneğin sonucu>
Seçenekler: 1) <ad> (Önerilen) — <sonuç> · Dayanak: <…>  2) <ad> — <sonuç>  …
Neden sorulmalı: <tek cümle>
```
````

- [ ] **Step 3: `nf-okur.md`'ye CI ayırmayı ekle**

`description` satırının sonuna ekle: ` Tren kırmızı dönünce CI kırmızısını ayırır (altyapı mı, kod mu; hangi dal).`
Gövdenin sonuna ekle:

````markdown

CI KIRMIZISINI AYIRMA (koordinatör tren kırmızı dönünce çağırır; girdi: run kimliği, tren dalı, trendeki dallar)
1. `gh run view <run> --json jobs` ve `gh run view <run> --log-failed` (uzunsa yalnız hatanın çevresi).
2. Altyapı işaretleri: "run out of resources", "forwards/expose returned unexpected status: 500", "toomanyrequests", "a prune operation is already running", Docker ya da Supabase başlamadı, runner kayboldu, yük altında zaman aşımı (aynı test boşta geçiyorsa). Kod işaretleri: beklenti farkı, tip hatası, lint, migration hatası, yeni test kırmızı.
3. Kodsa hangi dal: düşen testin ve dokunduğu dosyaların değişikliği `git log --format='%h %s' <taban>..<tren ucu> -- <dosya>`; commit mesajındaki iş numarası dalı söyler.
4. Hüküm (en çok 10 satır): `AYRIM: ALTYAPI | KOD | BELİRSİZ` · düşen iş ve test · kanıt satırı · KOD ise bozan dal ve dosya:satır · önerilen adım (`gh run rerun <run> --failed` ya da "task/<id> trenden çıksın").
````

- [ ] **Step 4: `nf-guvenlik.md`'yi yeni sınıflara uyarla**

- `description`: `CLAUDE.md §4.3'e göre R3 (riskli yüzey) işlerde ve koordinatör istediğinde (R2'de tek bağımsız inceleme olarak)` → `CLAUDE.md §5'e göre incelemeli sınıftaki işlerde`.
- 12. satır: `ilgili task dosyasını oku` → `görev metnini oku (koordinatörün çağrısında)`; `(ağır komut öncesi `db.lock`)` → `(veritabanı komutu `node scripts/lock.mjs run db -- <komut>` ile)`.
- 20. satır: `CLAUDE.md §2.A` → `CLAUDE.md §3.A`.
- 26. satırı sil (posta kutusu); yerine: `- Son cevabın rapordur; ilk satırı `ONAY @<sha>` ya da `BULGU: <sayı>`.`

- [ ] **Step 5: Doğrula ve commit**

Run: `git grep -nE "R[0-3]\b|inbox|heavy|main\.lock|task dosyası" -- .claude/agents`
Expected: çıktı yok.

```bash
git add .claude/agents/nf-isci.md .claude/agents/nf-hakem.md .claude/agents/nf-okur.md .claude/agents/nf-guvenlik.md
git commit -m "feat(agents): worker and decision-judge agents; the reader separates CI reds (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Skill'ler: `/oto`, `/durum`

**Files:**
- Create: `.claude/skills/oto/SKILL.md`, `.claude/skills/durum/SKILL.md`
- Delete: `.claude/skills/gece-modu/`
- Modify: `.claude/skills/haftalik-denetim/SKILL.md`

**Interfaces:**
- Consumes: `scripts/train.mjs run`, `scripts/lock.mjs status`, ajanlar `nf-isci`, `nf-guvenlik`, `nf-okur`, `nf-hakem`; `DURUM.md` şablonu (bu görevde tanımlanır, tek kaynak `/oto`).

- [ ] **Step 1: `.claude/skills/oto/SKILL.md`**

````markdown
---
name: oto
description: Koordinatörün otomasyonu, gece ve gündüz aynı (CLAUDE.md §5). Mert onaylı bir planla "/oto <hedef>" deyince koordinatör oturumunda başlat; sıra bitene ya da Mert dönüp /durum diyene kadar işçi ajanları yönetir, treni koşar, DURUM.md'yi yazar, soruları hakeme götürür. Yalnız koordinatör çalıştırır.
---

# /oto — koordinatörün otomasyonu

Yalnız koordinatör oturumu (`C:/Users/TheWe/Documents/Codex/newfork-wt/coord`, dal `coord/kayit`) çalıştırır. Kurallar `CLAUDE.md`'dedir; burada yalnız döngü var.

## Başlarken (bir kez)
1. **Plan.** Mert'in onayladığı hedef ve işler `DURUM.md` "Plan" ve "Sırada"ya: iş · sınıf (normal / incelemeli) · dokunacağı dosyalar · neden önce. Onaysız iş sıraya girmez.
2. **Uyanık tut.** `request_keep_awake` (`until: "session_idle"`, reason: "Otomasyon: koordinatör işleri yönetiyor").
3. **Yedek saat.** `CronCreate` `cron: "*/20 * * * *"`, prompt: `oto turu: .claude/skills/oto/SKILL.md "Her tur" adımları`. Dönen kimliği `DURUM.md` "Sağlık"a yaz.
4. İlk tur.

## Her tur
Uyandıran: ajan bildirimi · tren komutunun bitişi · yedek saat · Mert'in mesajı.

1. **Gelenler.** Her ajan sonucunun ilk satırını oku (`İŞ · DURUM · DAL`); tam metin `docs/plan/gunluk/<bugün>/`'de.
   - `HAZIR` + normal → "Trene hazır". `HAZIR` + incelemeli → `nf-guvenlik` (arka planda; görev: iş kimliği, dal, aralık `origin/main...task/<id>`). `ONAY @<sha>` → "Trene hazır". Bulgu → aynı işçiye `SendMessage` (bağlamıyla devam) ya da yeni işçi "devam: task/<id>@<sha>".
   - Canlı veritabanı işi: ONAY'dan sonra `CLAUDE.md` §5 koşullarını kontrol et, işçiye "gönder" (`SendMessage`).
   - `SORU` → `nf-hakem`. `KARAR` → işçiye cevap (`SendMessage`); günlüğe ve `DURUM.md` "Senin yerine verdiğim kararlar"a satır. `SOR` → `docs/plan/SORULAR.md`'ye soru biçimiyle, iş "Seni bekleyen"e. Mert penceredeyse ve iş duruyorsa hemen sor.
   - `TAKILDI` → `nf-okur` ile neden; yön ver ya da böl. `BÖLÜNDÜ` → kalan parça sıranın başına.
   - "Ders" satırı → ilgili klasörün `CLAUDE.md`'sine tek satır (tekrar değilse). "Backlog adayı" → `BACKLOG.md`.
   - Günlüğe (`docs/plan/gunluk/<bugün>.md`) her olay için tek satır: saat · iş · ne oldu.
2. **Tren.** Tren koşmuyorsa ve "Trene hazır" doluysa: kayıtları commit'le (dosyalar adıyla, `docs(plan): records (KAYIT)`), sonra arka planda `node scripts/train.mjs run <dal@sha…>` (Bash, `run_in_background`). Bitince:
   - `0` → main'de. `git rebase origin/main` (coord/kayit). İşler "Bugün biten"e (sha). Backlog maddeleri kapanır. İşçi worktree'leri ve dalları silinir: önce `git cherry -v origin/main <dal>` boş olmalı.
   - `2` → bir dal atlandı (çakışma): işçisine "rebase et, push et, HAZIR yaz".
   - `1` → başarısız adım satırda. `ci` kırmızı: `nf-okur` ile ayır. Altyapı → `gh run rerun <run> --failed`; yeşil olunca `node scripts/train.mjs push` ve `node scripts/train.mjs apply-local`. Kod → bozan dalı çıkar, işçisine geri ver, kalanlarla yeniden `run`. Main kırmızıysa ilk tren yalnız düzelteni taşır.
3. **Yeni iş.** Koşan işçi 3'ten azsa ve sırada iş varsa: dosyaları koşanlarla çakışmayan ilk işi ver. `Agent(subagent_type: "nf-isci", isolation: "worktree", run_in_background: true, model: "opus")`; incelemeli işte `effort: "high"`. Görev metni şablonu `CLAUDE.md` §5. Backlog'dan gelen iş önce `nf-okur` tazelik kontrolünden geçer. Port: boştaki ilk çift 5612/5613, 5620/5621, 5622/5623.
4. **Kullanım.** `get_usage`. 5 saatlik limit %80'i geçtiyse yeni incelemeli ya da uzun iş başlatma; ucuz işler sürer.
5. **Pano.** `DURUM.md`'yi aşağıdaki şablonla yeniden yaz; `request_keep_awake`'i yenile. Değişiklik yoksa tur tek satırla biter.

## Yeniden başlatmadan sonra
`DURUM.md` "Koşuyor"daki her iş için `git ls-remote origin task/<id>`: dal uzaktaysa yeni işçi "devam: task/<id>@<sha>"; değilse iş baştan.

## Bitiş
Sıra boş, tren yok, koşan ajan yok → `DURUM.md` başına "Bitti", `CronDelete`. Mert dönünce `/durum`.

## DURUM.md şablonu
```
# Durum — <YYYY-MM-DD HH:MM>
🟢/🟠/🔴 <tek cümle>

## Seni bekleyen (<n>)
- <soru / görsel seçim / "evet" gereken iş> — <ne zamandır>

## Bugün biten
- <iş> — <ekranda ne değişti, ekran adıyla> — `<sha>`

## Koşuyor
- <iş> — <ajan> — başladı <HH:MM> — son haber <HH:MM>

## Sırada
- <iş> — <sınıf> — <neden önce>

## Trene hazır
- task/<id>@<sha>

## Tren
- son tren: <dallar> · CI <sonuç, run> · <süre>

## Senin yerine verdiğim kararlar
- <karar> — Dayanak: <kimlik>

## Plan
- <Mert'in onayladığı hedef ve sıra>

## Sağlık
- CI dk/gün · hazır→main medyanı · kullanım % · yedek saat kimliği · ölçüm günü 2026-10-15
```
````

- [ ] **Step 2: `.claude/skills/durum/SKILL.md`**

````markdown
---
name: durum
description: Mert dönünce koordinatörün raporu (CLAUDE.md §2). DURUM.md'yi dosya olarak gönderir, en çok 6 satırlık özet ve "senin yerine verdiğim kararlar"ı yazar, sonra SORULAR.md'deki soruları tek turda sorar ve cevapları KARARLAR.md'ye işler. Yalnız koordinatör çalıştırır.
---

# /durum — Mert'e dönüş

1. `/oto`'nun "Her tur" adımlarını bir kez koş, `DURUM.md`'yi güncelle, `SendUserFile` ile gönder.
2. Özet, en çok 6 satır: 🟢/🟠/🔴 · ne bitti (ekran adıyla) · ne seni bekliyor · sıradaki en önemli iş ve nedeni.
3. "Senin yerine verdiğim kararlar": `DURUM.md`'deki liste (karar · dayanak). Tek soru: ters çevirmek istediğin var mı?
4. Soru turu: `docs/plan/SORULAR.md`, dörder dörder (`AskUserQuestion`; önerilen ilk, `(Önerilen)`, açıklamanın son satırı `Dayanak: …`).
5. Cevaplar: ürün, ekran ya da süreç kuralı → `docs/plan/KARARLAR.md` (tarih, kaynak Mert, neden, reddedilen seçenek). Soru `SORULAR.md`'den silinir; bağlı iş "Sırada"ya döner. Ters çevrilen hakem kararı: madde düzeltilir, `DURUM.md` "Sağlık"ta ters çevirme sayısı artar.
6. Kayıtlar commit'lenir (dosyalar adıyla); bir sonraki trenle gider.
````

- [ ] **Step 3: `gece-modu`'yu sil**

Run: `git rm -r .claude/skills/gece-modu`

- [ ] **Step 4: `haftalik-denetim`'i yeni dosyalara uyarla**

`.claude/skills/haftalik-denetim/SKILL.md`'de:
- `description`'da `(CLAUDE.md §4.6)` → `(CLAUDE.md §6)`; `§2.C özeti ile ILKELER.md farkı` → `CLAUDE.md §4 ile KARARLAR §0 farkı`; `gönderimden CI yeşiline süre` → `hazır → main süresi`.
- "Okunacaklar": `docs/plan/ILKELER.md`, → sil; `.claude/settings.json` kancaları kalır. "Kayıt" satırı → `DURUM.md`, `docs/plan/EKRAN-PLANI.md`, `docs/plan/gunluk/` (son 7 gün), `docs/plan/KARARLAR.md` §4.
- Kontrol listesi 3: `CLAUDE.md` / `ILKELER.md` / `KARARLAR.md` → `CLAUDE.md` / `KARARLAR.md`. Madde 4'ü şununla değiştir: `**CLAUDE.md §4 ↔ KARARLAR §0:** dayanak sırası ve "her zaman Mert'e" listesi iki yerde aynı mı.` Madde 5: `DERSLER.md` → `KARARLAR.md §4 (süreç) ve günlükteki "Ders" satırları`. Madde 6: olay adları → `push-main-override`, `push-main-blocked`, `record-by-worker-blocked`, `guard-error`, `train-override`, `train-ci-red`.
- "Dört sayı" 2. satırdaki kaynak: `docs/plan/KARARLAR.md`'de "ters çevrildi" + `DURUM.md` "Sağlık" ters çevirme sayısı. 4. satırı şununla değiştir: `| 4 | Hazır → main | docs/plan/gunluk/ (HAZIR satırı) ve "train-push" olayları (.newfork-inbox/audit.log) | Her işin HAZIR anından main'e girişine süre: medyan ve en uzun. |`
- "Aylık ek" 2. madde: `CLAUDE.md §4.8 dosya haritası` → `CLAUDE.md §6 kayıt tablosu`; 3. madde: `kökteki §6` → `kökteki §7`.
- "Çıktı" altındaki `Karar · İzin · Risk · Soru · Sonraki        (5 satır, CLAUDE.md §4.4)` satırını sil. Son paragraf: `Haber: node scripts/inbox.mjs send …` → `Son mesajın raporun yoludur; koordinatör günlükten okur.`

- [ ] **Step 5: Doğrula ve commit**

Run: `git grep -nE "inbox\.mjs|gece-modu|HANDOFF|SABAH-SORULAR|ILKELER\.md|DERSLER\.md|KOORDINATOR-KARARLARI" -- .claude`
Expected: çıktı yok.

```bash
git add .claude/skills/oto/SKILL.md .claude/skills/durum/SKILL.md .claude/skills/haftalik-denetim/SKILL.md
git commit -m "feat(skills): /oto runs the coordinator's loop day and night, /durum reports back to Mert (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Tek karar defteri ve arşiv

**Files:**
- Create: `scripts/kararlar-check.mjs`, `scripts/kararlar-check.test.mjs`, `docs/archive/2026-10-08-v1/SINIFLAMA.md`, `docs/plan/SORULAR.md`, `docs/plan/gunluk/README.md`
- Move: `docs/plan/{ILKELER,KOORDINATOR-KARARLARI,DERSLER,HANDOFF,SABAH-SORULAR}.md`, `docs/plan/KARARLAR.md` → `KARARLAR-v1.md`, `docs/plan/handoffs/`, kapanmış `docs/plan/tasks/*.md` → `docs/archive/2026-10-08-v1/`
- Create (yeniden): `docs/plan/KARARLAR.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `principleIds(text)`, `definedIds(text)`, `kkIds(text)`, `lessonHeads(text)`, `check(root) → { missing: string[], warnings: string[] }`; CLI `node scripts/kararlar-check.mjs` (çıkış 1 = eksik var).

- [ ] **Step 1: Denetim testlerini yaz (kırmızı)**

`scripts/kararlar-check.test.mjs`:

```js
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
```

- [ ] **Step 2: Kırmızıyı gör**

Run: `node --test scripts/kararlar-check.test.mjs`
Expected: FAIL — modül yok.

- [ ] **Step 3: `scripts/kararlar-check.mjs`'i yaz**

```js
#!/usr/bin/env node
// WORKFLOW-V2 (spec §6.2): no decision drops silently.
//   - every principle (P01…) of the archived ILKELER and every id the old KARARLAR defined (UI-05, OPS-08, …)
//     is in the new docs/plan/KARARLAR.md, in its body or in "Bırakılanlar";
//   - every coordinator decision (KK-n) and every lesson heading of the archive is classified in SINIFLAMA.md.
// Run: node scripts/kararlar-check.mjs   (exit 1 lists what is missing; over 700 lines is a warning)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ARCHIVE = "docs/archive/2026-10-08-v1";
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const uniq = (a) => [...new Set(a)];

// ILKELER writes a principle as a bold lead (**P01. …**); a heading form is read too.
export const principleIds = (text) => uniq([...text.matchAll(/^(?:#{2,4}\s*|\*\*)(P\d{2})\b/gm)].map((m) => m[1]));
// Ids an entry defines: a table row's first cell, a bold lead, a heading -- not a mention inside prose.
export const definedIds = (text) =>
  uniq([...text.matchAll(/^(?:\|\s*|[-*]\s+\*\*|\*\*|#{2,4}\s*)([A-Z]{1,6}-\d{1,4}[a-z]?)\b/gm)].map((m) => m[1]));
export const kkIds = (text) => uniq([...text.matchAll(/^#{2,4}\s*(KK-\d+)\b/gm)].map((m) => m[1]));
export const lessonHeads = (text) => [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
const mentions = (text, id) => new RegExp(`(^|[^\\w-])${id.replaceAll("-", "\\-")}([^\\w-]|$)`, "m").test(text);

export function check(root) {
  const kararlar = read(root, "docs/plan/KARARLAR.md");
  const sinif = read(root, `${ARCHIVE}/SINIFLAMA.md`);
  const missing = [];
  for (const id of principleIds(read(root, `${ARCHIVE}/ILKELER.md`))) if (!mentions(kararlar, id)) missing.push(`KARARLAR.md'de yok: ${id} (ILKELER)`);
  for (const id of definedIds(read(root, `${ARCHIVE}/KARARLAR-v1.md`))) if (!mentions(kararlar, id)) missing.push(`KARARLAR.md'de yok: ${id} (eski KARARLAR)`);
  for (const id of kkIds(read(root, `${ARCHIVE}/KOORDINATOR-KARARLARI.md`))) if (!mentions(sinif, id)) missing.push(`SINIFLAMA.md'de yok: ${id}`);
  for (const h of lessonHeads(read(root, `${ARCHIVE}/DERSLER.md`))) if (!sinif.includes(h.slice(0, 40))) missing.push(`SINIFLAMA.md'de yok: ders "${h.slice(0, 60)}"`);
  const lines = kararlar.split("\n").length;
  return { missing, warnings: lines > 700 ? [`KARARLAR.md ${lines} satır (hedef ≤ 700)`] : [] };
}

function main() {
  const r = check(process.cwd());
  for (const w of r.warnings) console.log(`UYARI: ${w}`);
  for (const m of r.missing) console.log(m);
  console.log(r.missing.length ? `${r.missing.length} eksik` : "tamam: hiçbir karar sessizce düşmedi");
  process.exitCode = r.missing.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Yeşil, listeye ekle, commit**

Run: `node --test scripts/kararlar-check.test.mjs`
Expected: `fail 0`.
`package.json` `test` betiğine `scripts/kararlar-check.test.mjs` ekle.

```bash
git add scripts/kararlar-check.mjs scripts/kararlar-check.test.mjs package.json
git commit -m "feat(scripts): a check that no decision drops silently from the decision book (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Eski kayıtları arşive taşı**

```bash
mkdir -p docs/archive/2026-10-08-v1/tasks
git mv docs/plan/ILKELER.md docs/archive/2026-10-08-v1/ILKELER.md
git mv docs/plan/KARARLAR.md docs/archive/2026-10-08-v1/KARARLAR-v1.md
git mv docs/plan/KOORDINATOR-KARARLARI.md docs/archive/2026-10-08-v1/KOORDINATOR-KARARLARI.md
git mv docs/plan/DERSLER.md docs/archive/2026-10-08-v1/DERSLER.md
git mv docs/plan/HANDOFF.md docs/archive/2026-10-08-v1/HANDOFF.md
git mv docs/plan/SABAH-SORULAR.md docs/archive/2026-10-08-v1/SABAH-SORULAR.md
git mv docs/plan/handoffs docs/archive/2026-10-08-v1/handoffs
```

Kesin kapanmış görev dosyaları: `grep -liE "^Status:.*(done|bitti|superseded|kapandı|tamamlandı)" docs/plan/tasks/*.md` listesindeki her dosya ve `_TEMPLATE.md` → `git mv <dosya> docs/archive/2026-10-08-v1/tasks/`. Gerisi (draft, ready, paused, durum satırı olmayan) yerinde kalır; Task 13 Step 5 devir raporuna göre ayırır. Kalanların listesini görev raporuna yaz.

- [ ] **Step 6: Sınıflama (`SINIFLAMA.md`)**

`docs/archive/2026-10-08-v1/SINIFLAMA.md`'yi yaz. Başlık ve bir tablo:

```markdown
# Sınıflama — 2026-10-08 (v1 → v2 geçişi)

Arşivdeki her koordinatör kararı (KK-n) ve her ders başlığı burada tek satırla sınıflanır. Sınıflar:
- `kural → <yeni kimlik>`: bugün de geçerli, sürekli bir kural; yeni defterde o kimlikle.
- `tek seferlik`: bir işin, dalın, oturumun ya da günün kaydı; kural değil.
- `bırakıldı: <neden>`: kuraldı ama yeni akışta anlamı kalmadı ya da başka maddeyle birleşti; yeni defterin "Bırakılanlar" ekinde de satırı var.

| Kimlik / başlık | Sınıf | Not |
|---|---|---|
```

Kaynaklar: `docs/archive/2026-10-08-v1/KOORDINATOR-KARARLARI.md` (her `### KK-n` başlığı) ve `DERSLER.md` (her `## ` başlığı, başlık metni aynen). Kural ölçüsü: madde "bundan sonra", "her zaman", "kural", "asla", "varsayılan" gibi süren bir davranış koyuyorsa ve Mert'ten ya da Mert'in onayladığı bir karardan geliyorsa `kural`; yeni akışın kaldırdığı şeyleri (posta kutusu, `main.lock`/`heavy.lock`, R0–R3, gece modu, rol oturumları, görev dosyası zorunluluğu, aktarılan onay) anlatıyorsa `bırakıldı`.

- [ ] **Step 7: Yeni `docs/plan/KARARLAR.md`**

Yapı:

```markdown
# Kararlar (karar defteri)

Newfork'un tek karar defteri (CLAUDE.md §4). Ajanlar karar vermeden önce burada dayanak arar; `nf-hakem` soruları buna göre karara bağlar.
- **Madde biçimi:** `**<KİMLİK>** <kural>. Neden: <…>. (<tarih>, <Mert | koordinatör>)`. Uzun ürün kuralı eski biçimiyle (kaynak, kural, neden, reddedilen seçenek, örnek) kalabilir.
- **Dayanak sırası:** Mert'in en güncel açık kararı > bu defter > koordinatör kararı > sektör emsali. Çelişkide en yeni Mert kararı kazanır (P22).
- **Yeni madde:** Mert'in seçenek dışı cevabı ve her yeni kural aynı oturumda buraya. Koordinatörün Mert yokken verdiği ve kural koyan kararı `(koordinatör, onaysız)` işaretiyle girer; Mert onaylayınca işaret kalkar.

## 0. Vizyon ve ilkeler
## 1. Ürün ve ekranlar
## 2. Yetki ve veri
## 3. Teknik
## 4. Süreç
## Bırakılanlar
```

Doldurma kuralları:
- **§0:** arşivdeki `ILKELER.md` "A. Vizyon" ve "B. Ödünleşim" (kısaltılmış, Mert'in sözleri ve tarihleri korunur), P01–P26 her biri en çok 3 satır (kural · neden · tarih), "D. Claude'un bilinen yanlış eğilimleri" madde listesi olarak. P15, P16, P17 yeni akışa göre güncellenir: P15 → "Kod ve git'te hızlı ve özerk; main'e yalnız tren gider (CLAUDE.md §5)". P16 → "Araç kuralları az ve kesindir: guard yalnız main'e push'u ve işçinin kayıt yazısını reddeder; acil kaçış NF_OVERRIDE, loglanır". P17 → "Paralel iş yalnız Mert'in onayladığı planın içinden ve dosyaları çakışmıyorsa; ekran işi tek işçide uçtan uca biter (Mert, 2026-10-08)". Her güncelleme `(güncellendi 2026-10-08, v2)` notuyla.
- **§1:** arşivdeki `KARARLAR-v1.md`'nin "Ürün kuralları — rol, kapsam, uygunluk", "Katılım ve giriş akışı", "Form ve girdi kuralları (ABD)", "MVP sınırı", "Ekran kararları" bölümleri **anlamı değişmeden** taşınır; yalnız aynı şeyi iki kez söyleyen satırlar tek satıra iner.
- **§2:** `KARARLAR-v1.md` kimlik tablosunun `DATA-*` satırları ve yetki/veri kuralları.
- **§3:** `KARARLAR-v1.md` kimlik tablosunun `UI-*`, `FB-*`, `OPS-*` satırları; `OPS-08` yeni trene göre güncellenir: "main'e yalnız `scripts/train.mjs run` gider; tam kapı trenin CI'ında bir kez (2026-10-08, v2)".
- **§4:** `SINIFLAMA.md`'de `kural → S-nn` sınıflanan KK ve ders maddeleri, `S-01`'den başlayan kimliklerle; her biri kaynağını taşır: `(KK-188'den)`, `(DERS 13'ten)`.
- **Bırakılanlar:** `SINIFLAMA.md`'de `bırakıldı` olan her kural ve taşınmayan her eski kimlik: `- <kimlik> — <neden>`.

- [ ] **Step 8: `SORULAR.md` ve günlük**

`docs/plan/SORULAR.md`:

```markdown
# Sorular — Mert'e açık

Koordinatör yazar, `/durum`'da dörder dörder sorulur; cevaplanan soru buradan silinir, cevabı `KARARLAR.md`'ye girer. Biçim: CLAUDE.md §2.8.
```

Altına, arşivdeki `SABAH-SORULAR.md`'nin **cevaplanmamış** her sorusu (`### G…` başlıkları; cevabı `KARARLAR-v1.md`'de ya da `KOORDINATOR-KARARLARI.md`'de yoksa) başlığıyla ve metniyle taşınır.

`docs/plan/gunluk/README.md`:

```markdown
# Günlük

- `<YYYY-MM-DD>.md`: koordinatörün o günkü satırları (saat · iş · ne oldu). Yalnız eklenir.
- `<YYYY-MM-DD>/`: ajanların ham son mesajları; `SubagentStop` kancası yazar (`scripts/hooks.mjs agent-report`), dosya adı `<HHMM>-<İŞ>-<ajan>-<id>.md`.
Kayıt dosyasıdır: işçi ajan yazamaz (guard).
```

- [ ] **Step 9: Denetimi geçir**

Run: `node scripts/kararlar-check.mjs`
Expected: `tamam: hiçbir karar sessizce düşmedi` ve çıkış 0. Eksik satırları kapatana kadar Step 6–7'ye dön. 700 satır uyarısı kalırsa §1'de tekrarları bir kez daha ara; kalıyorsa uyarıyı görev raporuna yaz.

- [ ] **Step 10: Commit**

```bash
git add docs/plan/KARARLAR.md docs/plan/SORULAR.md docs/plan/gunluk/README.md docs/archive/2026-10-08-v1
git commit -m "docs(plan): one decision book; principles, coordinator decisions and lessons merged, the rest archived (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 11: Mert'e "Bırakılanlar"**

`docs/plan/KARARLAR.md`'yi `SendUserFile` ile gönder, tek soru sor (önerilen ilk, `Dayanak:` satırıyla): "Bırakılanlar ekinde geri istediğin madde var mı?" Seçenekler: "Hayır, böyle kalsın (Önerilen)" / "Var, söyleyeceğim". Geri istenen madde ilgili bölüme taşınır, Step 9–10 yinelenir.

---

### Task 11: Yeni `CLAUDE.md` ve klasör kuralları

**Files:**
- Rewrite: `CLAUDE.md`
- Modify: `apps/web/CLAUDE.md`, `apps/api/CLAUDE.md`, `supabase/CLAUDE.md`, `e2e/CLAUDE.md`

- [ ] **Step 1: `CLAUDE.md`'yi yaz**

````markdown
# CLAUDE.md

# Newfork — çalışma kuralları

Bu repoda çalışan her oturumun ve ajanın ortak kuralı. Mert'in (ürün sahibi, tek geliştirici) yeni yazılı talimatı bu dosyadan önce gelir. Bir klasördeki koda dokununca o klasörün `CLAUDE.md`'si de geçerlidir. Bütün kararlar tek yerde: `docs/plan/KARARLAR.md` (karar defteri). Bu repo MeyHouse değildir.

## 1. Vizyon
- **Ürün:** ABD'deki restoranlar için çok kiracılı vardiya planlama SaaS'ı; her işletme kendi workspace'inde, başkasınınkini görmeden. Arayüz İngilizce (ABD). Mert: "uygulama bir kokpit".
- **Hedef:** self-serve, ücretli ABD lansmanı; ekran ekran (`docs/plan/EKRAN-PLANI.md`).
- **İlk müşteri:** 2–5 lokasyonlu, 20–100 kişilik restoran; her şubede müdür, owner merkezde. Çok lokasyon varsayılan; tek lokasyon da çalışır.
- **Kimin için:** hepsi eşit. MVP'de önce müdür ve owner; çalışan ekranları sonra, aynı kalitede. Müdür masaüstü, çalışan telefon; Schedule telefonda kapalı.
- **MVP sonucu:** owner workspace'i kurar, davet eder, Schedule yayınlar, günlük değişiklikleri yönetir, kartla öder (Stripe). Çalışan katılır, onboarding'i bitirir, programı görür, talep gönderir, kararı görür. MVP sonrası: time tracking, clock-in/out, mola, bordro, geniş compliance, kiosk. SSN toplanmaz.
- **Asla:** ayar cehennemi, bildirim gürültüsü, kurumsal hantallık, oyuncak görünüm. "Ayar, bildirim ya da onay adımı ekleyelim mi?" sorusunun varsayılan cevabı hayır. Rakipler (7shifts, Homebase, When I Work, Deputy) yalnız referans.

## 2. Mert'le iletişim (yalnız koordinatör konuşur)
1. **Türkçe, sade.** Kısa cümle, geliştirici dili yok. İç numara tek başına yazılmaz; yanında ne olduğu söylenir. Kod, commit ve ekran metni İngilizce. 5N1K konu elverdiği kadar; nerede = ekran → menü → düğme ya da kopyalanabilir tam dosya yolu.
2. **Dinle, sözünü kesme.** Mert anlatırken işe girişilmez. Önce dinle, gerekirse sor, sonra öner.
3. **Sorgula.** İstek Mert'ten geldi diye doğru kabul edilmez. Yanlış, gereksiz ya da zaman kaybı görülen istek açıkça söylenir. İtiraz bir kez, gerekçesiyle; Mert karar verince ona uyulur ve karar deftere yazılır. Güvenlik açığı ya da geri alınamaz kayıpta bir kez daha uyarılır.
4. **Daha iyi yolu göster.** Daha ucuz, daha kaliteli ya da projeye daha uygun yol varsa Mert ona yönlendirilir. Maliyet dolarla.
5. **Önce öneri, sonra iş.** Mert bir şey söyleyince işe başlamadan: ne anladım · artı/eksi ve çakışan kural · önerim ya da itirazım.
6. **İsteği daralt.** İstek ya da prompt gelince kapsam daraltılır, hedef ve başarı ölçütü yazılır, Mert onaylar, iş ondan sonra başlar. Küçük işte tek satır ve tek tık. Okuma ve ölçme onay beklemez.
7. **Yolda çıkan backlog'a.** İş sırasında bulunan başka şey plana katılmaz, `BACKLOG.md`'ye yazılır. İstisna: işin önündeyse, işle ilgili güvenlik açığıysa ya da ürünün çıktısını bozuyorsa o işte düzeltilir, nedeni günlüğe yazılır.
8. **Soru biçimi.** Tek tıkla cevaplanır, seçenekler adlıdır. Önerilen ilk sırada, `(Önerilen)` etiketli, açıklamasının son satırı `Dayanak: <KARARLAR kimliği / Mert'in <tarih> kararı>` ya da `Dayanak: yok — yeni karar`. Kuruluş: bugün ne oluyor → isimli örnek → her seçeneğin sonucu. "Hepsi önerilen gibi" paketi yok. İşi durduran soru hemen; durdurmayanlar birikir, `/durum`'da ya da üçü geçince tek turda.
9. **Hata saklanmaz.** Claude'dan kaynaklanan hata için "benim hatam".
10. **Komut Run düğmesiyle.** Mert komutu yalnız Claude uygulamasının Terminal panelinde ▶ ile çalıştırır: her komut ayrı, `bash` etiketli blokta, tek satır, PowerShell 7'de geçerli (`pnpm.cmd`, `$env:X='y'; …`). Claude'un kendisinin çalıştırabileceği komut Mert'e verilmez.
11. **Öğreterek.** Mert tek başına geliştirici ve öğreniyor: önemli kararın nedeni tek cümleyle; bilmediği kavramın yanında bir satırla ne olduğu. Amaç en verimli yoldan en kaliteli ürün.

## 3. Kesin kurallar
### A. Kalite ve güvenlik çıtası
1. **Workspace sınırı, tek yetki merkezi.** Bir workspace başkasının verisini göremez. Yeni her tablo, fonksiyon ve uç RLS + `app_private.authorize()` / `scope_set()` üzerinden. Yeni eklenmez: satır içi kapsam mantığı, `rls_can` dışında `auth.uid()`, `request.jwt.claim`, route-yerel yetki kapısı, web'de `permissions.includes`, `_base` / `_vN` / `_legacy` fonksiyon. Katalog sayaçları yalnız azalır. Yetki kodunda fail-open görülürse o işte kapatılır.
2. **"Hayır" tek biçim.** 42501 + `authz.*` hint. API'de `authz.not_member` → 404, diğer `authz.*` → 403. Bilinmeyen ve kapsam dışı hedef aynı cevabı alır (`authz.out_of_scope`).
3. **Test.** Hata için önce onu yakalayan kırmızı test. Yeni davranış = yeni test; kullanıcı akışı değiştiyse Playwright. Beklenti gevşetilmez; skip ya da todo da gevşetmedir. Yeni `*_service` yetki matrisinde ve katalogda sınıflanmadan girmez.
4. **İkiz sistem yok.** Yenisi gelince eskisi silinir ve `retired_objects_stay_gone`'a eklenir.
5. **Eski veri korunmaz.** Canlı kullanıcı ve canlı veri yok: kurala uymayan kayıt, ona tolerans gösteren kod ve onu kuran test silinir; geriye uyumluluk dalı yazılmaz.
6. **Performans.** Schedule ızgarası okuması ≤50 ms (fixture). Gevşetmek Mert onayı ister.
7. **Arayüz.** Yalnız light tema; ham hex yerine `--theme-*`. Aksiyon yeşil, vazgeç beyaz, yıkıcı iki tık kırmızı (`ConfirmButton` / `useConfirmClick`). Tarayıcı diyaloğu yok (`apps/web/src/shell/ConfirmDialog.tsx`). Kullanıcı metninde "workspace" ve "team"; kod adları ekranda görünmez. Tasarım kaynağı `docs/design-canvas.md`. Aynı işlevdeki bileşenler aynı ölçü ve renk rolüyle.
8. **Erişilebilirlik.** WCAG 2.1 AA kontrast, klavye, görünür odak.
9. **Bilinen muafiyetler (Mert).** Supabase "Leaked password protection" kapalı (ücretli). GitHub Actions harcama limiti $0; GitHub'ın makinesinde iş koşmaz. Realtime "Allow public access" kapalı; her canlı kanal private.
### B. Kod kaybı olmaz
1. Ana klasör (`newfork-clean`, main) Mert'indir: orada iş yapılmaz, dal değiştirilmez.
2. Her iş kendi worktree'sinde ve dalında, güncel `origin/main`'den.
3. Başkasının işi ezilmez. Yasak: `git stash`, `reset --hard`, `checkout -- .`, force push, `--no-verify`, toplu `git clean`, başkasının worktree'sinde değişiklik, isimle süreç öldürme. Yalnız kendi başlattığın PID durdurulur.
4. Geri alınamaz her adımdan önce yedek; yedeğin adı ve yeri günlükte.

## 4. Karar verme
- **Dayanak sırası:** Mert'in en güncel açık kararı > `KARARLAR.md` > koordinatör kararı > sektör emsali.
- **Ödünleşim:** doğru veri > tahmine dayalı UX · çekirdekte tam çözüm > kestirme · görünüm turunda dar kapsam > fırsatçı genişleme · kodda hız, altyapıda temkin · ücretsiz > ücretli.
- **Soru çıkınca:** `KARARLAR.md`'de dayanak ara. Bir madde birebir kapsıyorsa karar ver, dayanağı yaz. Kapsamıyorsa koordinatör `nf-hakem`'e sorar; o da kapsamıyorsa soru Mert'e (`docs/plan/SORULAR.md`).
- **Koordinatör sormadan karar verir:** iş sırası, ajan sayısı, model ve effort, test ve dal kararları, şemanın iç ayrıntısı, defterde dayanağı olan ürün kararı, birleşmesi doğrulanmış dalı ve temiz worktree'yi silmek, oturum arşivlemek, canlı migration için "gönder" (§5). Her kararını günlüğe ve `DURUM.md` "Senin yerine verdiğim kararlar"a yazar.
- **Her zaman Mert'e:** yeni görsel tasarım (varyant hazırlanır, Mert seçer); temel modeller (yetki kapsamı, saat dilimi, izin iptali gibi; önce sohbette); kayıtların kapsamadığı ürün kuralı; para (ücretli servis, hesap, abonelik); gizli anahtar; yeni bağımlılık; geri alınamaz silme, canlıda gerçek veri silme, `supabase db reset`, force push; `.claude/settings.json` yasak listesini gevşetmek; bu dosyada, klasör `CLAUDE.md`'lerinde, ajan dosyalarında ya da `KARARLAR.md` §0'da kural değişikliği (eskimiş bilgiyi düzeltmek hariç).
- **Geri alınamaz işte** Mert'in "evet"i koordinatörün penceresine yazılır ve işi koordinatör kendisi yapar; ajana aktarılmaz.
- **Mert bir kararı düzeltirse** madde aynı işte güncellenir. Seçenek dışı cevap `KARARLAR.md`'ye (tarih, kaynak Mert, neden, reddedilen seçenek).

## 5. İş akışı
### Roller
- **Koordinatör:** tek oturum, `C:/Users/TheWe/Documents/Codex/newfork-wt/coord`, dal `coord/kayit`. Mert'in tek muhatabı; kod yazmaz. Planı işlere böler, ajanlara verir, sonucu doğrular, treni koşar, kayıtları yazar. Otomasyon `/oto`, Mert'e dönüş `/durum`.
- **Alt ajanlar** (`.claude/agents/`; hepsi Opus 5.5, effort en az medium — Mert, 2026-10-07): `nf-isci` bir işi uçtan uca yapar; `nf-guvenlik` incelemeli işte bağımsız inceleme; `nf-okur` salt okur keşif, backlog tazeliği, CI kırmızısını ayırma; `nf-hakem` soruyu karar defteriyle karara bağlar ya da Mert'e hazırlar.
- **Paralellik:** aynı anda en çok 3 işçi, dosyaları çakışmayan işler, yalnız Mert'in onayladığı planın içinden.
- **Mert'in açtığı başka oturum** bu dosyaya uyar; çıktısı bir işi etkiliyorsa Mert'e söyler, Mert koordinatöre taşır.
### Bir işin yolu
1. İstek → daraltma → hedef + bitti ölçütü → Mert onayı → `DURUM.md` "Sırada". Backlog'dan gelen iş önce `nf-okur` tazelik kontrolünden geçer (geçerli / değişmiş / bayat).
2. **Görev:** `Agent(subagent_type: "nf-isci", isolation: "worktree", run_in_background: true)`, metin:
   ```
   İŞ: <ID> — <tek cümle hedef>
   Bitti ölçütü: <ölçülebilir maddeler>
   Dokun: <dosya/klasör> · Dokunma: <dosya/klasör>
   Sınıf: normal | incelemeli · Port: <web>/<api>
   İlgili kararlar: <KARARLAR kimlikleri>
   Önerilen skill'ler: <…>
   ```
3. **İşçi:** `node scripts/wt-hazirla.mjs <ID>` → TDD, küçük commit → hızlı kontroller → `git push origin task/<id>` → sözleşmeli son mesaj: ilk satır `İŞ: <ID> | DURUM: HAZIR | SORU | TAKILDI | BÖLÜNDÜ | DAL: task/<id>@<sha>`, gövde ≤15 satır. Her ajanın son mesajı kancayla `docs/plan/gunluk/<gün>/`'e yazılır.
4. **Sınıf:** **normal** (tek ekran ya da alan; paylaşılan sözleşme ve yetki yok) → kapı trenin CI'ı. **İncelemeli** (shared tip, API cevap şekli, birden çok ekran, yetki, RLS, grant, `*_service`, katılım/davet, sahiplik devri, veri silme, parola/oturum, canlı DDL) → `nf-guvenlik` `ONAY @<sha>`; ekran değiştiyse masaüstü 1440 ve telefon 390 görüntüsü; koordinatör diff'in riskli kısmını okur.
5. **Canlı veritabanı:** ONAY → koordinatörün "gönder"i → işçi: yedek (`pg_get_functiondef` + silinen nesnelerin tanımı) → Supabase MCP `apply_migration` → md5/sürüm doğrulaması + `get_advisors` + bağımsız SELECT → dosya adı = canlı ledger sürümü. Silen migration trenin CI'ı yeşil olunca. CLI `supabase db push` yasak.
6. **Tren:** `node scripts/train.mjs run <dal@sha…>` (koordinatör, arka planda): build → CI (`train/<zaman>`, tam kapı bir kez) → yeşilse main fast-forward → ortak yerel DB'ye migration'lar. `coord/kayit` kendiliğinden biner. Main'e başka yoldan push yok (guard reddeder). Kırmızıda `nf-okur` ayırır: altyapı → yalnız düşen iş yeniden; kod → bozan dal çıkar.
7. **Kapanış:** main'de ve CI yeşil → `DURUM.md` "Bugün biten", backlog maddesi kapanır, dal ve worktree silinir (`git cherry -v origin/main <dal>` boşsa).
- **Skill'ler** (sonucu değiştirecekse, sormadan): `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `supabase:supabase-postgres-best-practices`, `superpowers:receiving-code-review`, `superpowers:verification-before-completion`.
### Test ve kilit
- İşçi tam kapı koşmaz: dokunduğu paketin `pnpm.cmd --filter <paket> lint` / `typecheck`, ilgili vitest; DB işinde `node scripts/lock.mjs run db -- <komut>`; akış değiştiyse `node scripts/lock.mjs run db --e2e -- <komut>` (CI koşarken bekler). Komut cmd.exe'de koşar; tırnak isteyen komut tek argüman.
- Tek kilit `db`; yalnız komut tutar, komut bitince açılır. `node scripts/lock.mjs status` sırayı gösterir. Kilit elle silinmez; ölü sahibini sıradaki temizler.
- `pnpm.cmd test` yeşili CI yeşili değildir; tam kapı trenin CI'ıdır.

## 6. Kayıtlar (yalnız koordinatör yazar; guard işçiyi reddeder)
| Dosya | Ne |
|---|---|
| `DURUM.md` (koordinatör worktree'sinin kökü) | Mert'in okuduğu tek sayfa; her turda yeniden yazılır (şablon `/oto`) |
| `docs/plan/KARARLAR.md` | Karar defteri |
| `docs/plan/SORULAR.md` | Mert'e açık sorular |
| `docs/plan/gunluk/` | Gün günlüğü ve ajanların ham raporları |
| `docs/plan/BACKLOG.md` | Yapılabilecek işler: `BL-081 (leave: high / do: risky)`; yeni numaradan önce origin/main'deki en yüksek |
| `docs/plan/EKRAN-PLANI.md`, `docs/plan/ekranlar/` | Yol haritası ve Mert'in onayladığı ekran kapsamları |
- Claude'un hafızası yalnız Mert ve ortam bilgisi tutar; kural buraya, karar `KARARLAR.md`'ye.
- `docs/archive/` kural değildir, okunmaz.
- Commit: İngilizce Conventional Commits, iş numarasıyla (`fix(schedule): … (EKRAN-01)`); dosyalar adıyla, `git commit -a` yok.
- Haftalık denetim `/haftalik-denetim` (koordinatör bir `nf-okur` ile ya da kendisi).

## 7. Teknik harita
### Yığın
- pnpm + turbo monorepo; Windows'ta `pnpm.cmd`.
- `apps/web`: React 19, Vite 7, React Router 7, TanStack Query 5; sayfa başına CSS ve `--theme-*` (`apps/web/src/styles.css`). Giriş `apps/web/src/main.tsx`, `App.tsx`.
- `apps/api`: Fastify 5, zod 4, supabase-js. Giriş `apps/api/src/app.ts` (yerelde `server.ts`); Vercel'de `api/index.js`. Alanlar `apps/api/src/<alan>/`.
- `packages/shared`: tipler ve saf kurallar. `packages/ui`: Button, ConfirmButton, Toaster.
- `supabase/`: migration'lar, RLS, `app_private` yetki çekirdeği, pgTAP (`supabase/tests`), test dünyası (`supabase/test-support/builder.sql`).
- `e2e/`: Playwright (gerçek giriş ekranı, builder'dan gelen kişiler). Ortam: `.env.example` → `.env.local` (commit edilmez).
### Bir isteğin yolu
Ekran → TanStack Query hook'u (`*-data.ts`) → `apiRequest` → API route → `supabase.rpc('<ad>_service')` → RLS + `app_private.authorize()` / `scope_set()`. Web veriye API üzerinden ulaşır; bugünkü istisnalar `apps/web/CLAUDE.md`'de, yenisi eklenmez. Web'deki `can()` ve `isNoAccess()` yalnız yansıtır. Yeni `*_service`: `supabase/tests/authorization_matrix.test.sql` ve `supabase/tests/authz_catalog.test.sql`'de sınıflanır.
### Komutlar
- `pnpm.cmd install` · `pnpm.cmd supabase:start` · `pnpm.cmd dev` (web 5555, API 5556).
- Odaklı: `pnpm.cmd --filter @newfork/web exec vitest run <dosya>`, `pnpm.cmd --filter @newfork/web typecheck`.
- Tren: `node scripts/train.mjs run <dal@sha…>`; kilit: `node scripts/lock.mjs run db -- <komut>`, `node scripts/lock.mjs status`.
### Worktree ve portlar
- Koordinatör `../newfork-wt/coord`; işçi worktree'leri `<coord>/.claude/worktrees/agent-*`, dal `task/<id>`; tren klasörü `../newfork-wt/train`. Geçici kanıt `artifacts/<iş>/` (gitignore'da).
- Portlar: 5555/5556 Mert · 5565/5566 yerel e2e (db kilidi sahibi) · 5590/5591, 5600/5601, 5610/5611 CI runner'ları · 5642/5643 koordinatör · işçiler 5612/5613, 5620/5621, 5622/5623.
- Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort` (`VITE_API_URL=http://localhost:<api>`). API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>` ile `pnpm.cmd --filter @newfork/api dev`.
- Yayınlanan sayfalar (claude.ai Artifact): Mert iki Claude hesabıyla çalışır, bir hesabın sayfasını öbürü görmez. Sayfa dosyası `C:/Users/TheWe/Documents/Codex/newfork-pages/<ad>.html` (çok dosyalıysa `<ad>/`); yayın oradan; klasördeki `README.md` satırı (dosya, iki hesabın linki) güncellenir.
### Veritabanı, canlı, CI
- Yerel DB, migration denemesi, şema dosyası: `supabase/CLAUDE.md`. Main'e giren her şey Vercel'den yayına çıkar.
- CI (`.github/workflows/ci.yml`) yalnız `train/**` push'unda, PR'da ve elle koşar: check, db, e2e, db-budget; Mert'in bilgisayarındaki tek runner. Kırmızı ayırma ve runner kuralları `e2e/CLAUDE.md`.
- Ubuntu tek başına `wsl --terminate` / `--shutdown` ile yeniden başlatılmaz; Docker Desktop yeniden başlatılır.
### Tuzaklar
- Yeni worktree'de `pnpm.cmd install` olmadan vitest `@vitejs/plugin-react`'i bulamaz (`wt-hazirla.mjs` kurar).
- Dev sunucusunu port PID'iyle durdurmak `tsx watch`'ı canlı bırakır; süreç ağacı durdurulur, sahiplik başlatma zamanıyla kanıtlanır.
- Uzun yol yüzünden `git worktree remove` yarım kalırsa PowerShell `Remove-Item -LiteralPath '\\?\C:\...' -Recurse -Force`, sonra `git worktree prune`; önce `git status --porcelain --ignored`.
- Birleşmesi doğrulanmamış dal silinmez; rebase'li dal `git cherry -v origin/main <dal>` ile ölçülür.
````

- [ ] **Step 2: Klasör kurallarını uyarla**

- `apps/web/CLAUDE.md:3`: `kök CLAUDE.md §2.A, §6` → `kök CLAUDE.md §3.A, §7`. 23. satırdaki `onu yalnız dal CI'ı koşar` → `onu trenin CI'ı koşar; akış değiştiyse etkilenen e2e'yi `node scripts/lock.mjs run db --e2e -- …` ile sen de koş`.
- `supabase/CLAUDE.md:1`: `(kök CLAUDE.md §2.A ve §6'ya ek)` → `(kök CLAUDE.md §3.A ve §7'ye ek)`. Ortak DB'ye dokunan komut örneklerinin önüne `node scripts/lock.mjs run db -- ` eklenir (tırnak isteyen komut tek argüman).
- `apps/api/CLAUDE.md`: `grep -n "§" apps/api/CLAUDE.md`; kökteki eski bölüm numaraları yenilerine (`§2.A` → `§3.A`, `§6` → `§7`, `§4.x` → `§5`).
- `e2e/CLAUDE.md`: "CI ve runner" bölümünde `docs/** ve *.md push'u CI başlatmaz; dalda yeni push eskisini iptal eder, main'de sıraya girer.` → `CI yalnız trende (`train/**`), PR'da ve elle koşar; `docs/**` ve `*.md` değişikliği koşturmaz.`; `Yerelde geçen e2e … Önce commit, sonra e2e.` satırını sil. "Tek dosya" maddesine ekle: `Ortak DB'ye dokunduğu için `node scripts/lock.mjs run db --e2e -- "npx playwright test flows/<dosya>"` ile.` Kökteki bölüm atıflarını yenile.

- [ ] **Step 3: Eski izleri ara**

Run: `git grep -nE "inbox\.mjs|heavy\.lock|main\.lock|lock\.mjs take|HANDOFF|SABAH-SORULAR|KOORDINATOR-KARARLARI|ILKELER\.md|DERSLER\.md|gece-modu|TREN-HAZIR|\bR[0-3]\b" -- CLAUDE.md apps/web/CLAUDE.md apps/api/CLAUDE.md supabase/CLAUDE.md e2e/CLAUDE.md .claude scripts .github`
Expected: çıktı yok (yalnız `scripts/*.test.mjs` içindeki tarihsel test adları ve `scripts/kararlar-check.mjs`'teki arşiv yolları kalabilir).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md apps/web/CLAUDE.md apps/api/CLAUDE.md supabase/CLAUDE.md e2e/CLAUDE.md
git commit -m "docs(rules): one coordinator, worker agents, one train, one decision book (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Dalın doğrulanması ve incelemesi

**Files:** yok (yalnız koşu ve inceleme)

- [ ] **Step 1: Bütün betik testleri**

Run: `node --test scripts/lock.test.mjs scripts/guard.test.mjs scripts/decision-log.test.mjs scripts/schema-snapshot.test.mjs scripts/test-db.test.mjs scripts/hooks.test.mjs scripts/wt-hazirla.test.mjs scripts/kararlar-check.test.mjs scripts/train-plan.test.mjs scripts/train-steps.test.mjs`
Expected: `fail 0`. `package.json`'daki `test` listesi bu dosyaların aynısı olmalı: `node -e "console.log(require('./package.json').scripts.test)"`.

- [ ] **Step 2: Hızlı kapılar**

Run: `node scripts/kararlar-check.mjs && node scripts/schema-snapshot.mjs check-fast`
Expected: ikisi de çıkış 0.

- [ ] **Step 3: Bağımsız inceleme (incelemeli sınıf: main'e gönderim aracı)**

`nf-guvenlik`'i çağır (model opus, effort high). Prompt:

```
İŞ: WORKFLOW-V2 — iş akışı v2'nin araçları. Dal task/workflow-v2, aralık origin/main...task/workflow-v2.
Spec: docs/superpowers/specs/2026-10-08-tek-koordinator-design.md · Plan: docs/superpowers/plans/2026-10-08-tek-koordinator.md
Odak: (1) main'e push'un tek yolu train.mjs mi; guard'da kaçak yol (PowerShell, sarılmış kabuk, --all/--mirror, refspec biçimleri) kaldı mı; (2) train.mjs push yalnız CI'ı yeşil olan tam sha'yı mı gönderiyor, fast-forward dışı yol var mı; (3) lock.mjs ölü sahip temizliği canlı bir kilidi taşıyabilir mi; (4) işçinin kayıt dosyası yazısı yol ve commit üzerinden kapalı mı; (5) hooks.mjs oturumu düşürebilir mi; (6) settings.json yasak listesi değişmedi mi; (7) KARARLAR.md'de anlamı değişen ürün kuralı var mı (arşivdeki KARARLAR-v1.md ile §1 karşılaştır, örnekle).
Çıktı: ONAY @<sha> ya da bulgular (önem sırasıyla, dosya:satır, düzeltme önerisi).
```

- [ ] **Step 4: Bulguları işle**

`superpowers:receiving-code-review` ile. Her düzeltme kendi testiyle ve commit'iyle. ONAY gelene kadar Step 1–3.

---

### Task 13: Geçiş

**Files:** `DURUM.md` (coord/kayit), `docs/plan/SORULAR.md`, `docs/plan/gunluk/2026-10-08.md` (koordinatör yazar)

Ön koşul: Task 12'de ONAY. Bu görev oturumlar ve canlı main ile çalışır; adımlar sırayla, her biri öncekinin sonucu okunduktan sonra.

- [ ] **Step 1: Eski koordinatörün devir raporunu al**

Mert 2026-10-08'de eski koordinatöre açık oturumların envanterini yazdırdı: ilerleme, bitenler, açık kalanlar, karar ya da izin bekleyenler, inceleme bekleyen artifact'ler. Rapor Mert'in söyleyeceği oturuma devredilir. Raporu baştan sona oku. Her satır için not al: iş · dal@sha · durum · kimi bekliyor · sonraki adım.

- [ ] **Step 2: Mert'ten gönderim izni**

Mert'e tek soru (önerilen ilk, `Dayanak:` satırıyla): "İş akışı v2'nin araçlarını main'e göndereyim mi? Gönderim yeni trenin kendisiyle yapılır: `train/<zaman>` dalında CI bir kez koşar, yeşilse main ilerler. Eski koordinatör ve oturumlar bu sırada iş göndermez." Seçenekler: "Gönder (Önerilen)" / "Bekle".

- [ ] **Step 3: Gönder (yeni trenin ilk koşusu)**

```bash
git push -u origin task/workflow-v2
node scripts/train.mjs run task/workflow-v2@$(git rev-parse --short HEAD)
```

Expected: `— ci` altında `CI yeşil: run <id>`, `— push` altında `main: <eski>..<yeni>`, çıkış 0. Kırmızıysa `nf-okur` ile ayır (Task 8'deki yöntem), düzelt, yeniden `run`. Komut uzun sürer (CI ~15 dk): arka planda başlat.

- [ ] **Step 4: Koordinatör worktree'si**

```bash
git -C C:/Users/TheWe/Documents/Codex/newfork-wt/coord status --porcelain
git -C C:/Users/TheWe/Documents/Codex/newfork-wt/coord fetch -q origin
git -C C:/Users/TheWe/Documents/Codex/newfork-wt/coord switch -c coord/kayit origin/main
```

İlk komut boş değilse dur: oradaki değişiklik eski koordinatörün; ona ya da Mert'e sor.

- [ ] **Step 5: İlk `DURUM.md` ve sorular**

`C:/Users/TheWe/Documents/Codex/newfork-wt/coord/DURUM.md`'yi `/oto` şablonuyla yaz:
- "Sırada": devir raporundaki her açık iş (dal@sha, kalan adım, sınıf).
- "Seni bekleyen": karar ya da izin bekleyenler, inceleme bekleyen artifact'ler (bağlantısıyla).
- "Koşuyor": boş (eski oturumlar durduruldu).
- "Plan": Mert'in son onayladığı sıra (devir raporu ve `docs/plan/EKRAN-PLANI.md`).
Devir raporundaki her soru `docs/plan/SORULAR.md`'ye. `docs/plan/tasks/`'ta kalan görev dosyalarından devir raporunda açık iş olarak geçmeyenler `docs/archive/2026-10-08-v1/tasks/`'a taşınır (`git mv`). Günlüğün ilk satırı `docs/plan/gunluk/2026-10-08.md`: "v2'ye geçildi; devir raporu: <yol>".
Doğrula: devir raporundaki her iş ve her soru `DURUM.md`'de ya da `SORULAR.md`'de bir satırla karşılanıyor. Eksik varsa tamamla.

```bash
git -C C:/Users/TheWe/Documents/Codex/newfork-wt/coord add DURUM.md docs/plan/SORULAR.md docs/plan/gunluk/2026-10-08.md
git -C C:/Users/TheWe/Documents/Codex/newfork-wt/coord commit -m "docs(plan): first board of the single-coordinator workflow (WORKFLOW-V2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Eski düzenin artıkları (silmeden)**

- `.newfork-inbox/` içindeki `new/`, `done/`, `status/`, `label/`, `seen.json`, `coordinator.json` → `.newfork-inbox/archive-2026-10-08/` (taşı, silme).
- `.newfork-locks/` içinde `main.lock` ya da `heavy.lock` varsa → `.newfork-locks/dead/` (taşı).
- Eski oturumlar: devir raporundaki her oturumun işi `DURUM.md`'de karşılandıktan sonra arşivlenir (`archive_session`; silinmez, geri açılabilir). Mert'in kendi açtığı ve devir raporunda olmayan oturumlara dokunulmaz.

- [ ] **Step 6b: Ortak hafızayı temizle**

`anthropic-skills:consolidate-memory` ile Claude hafızası (`C:/Users/TheWe/.claude/projects/C--Users-TheWe-Documents-Codex-newfork-clean/memory/`):
- Aynı şeyi iki kez söyleyen dosyalar birleşir (ör. iki "Mert UI simetri" satırı).
- Yeni akışta anlamı kalmayan süreç notları silinir: posta kutusu, mesajın ulaşmaması, alt ajan raporunu jsonl'den okuma, kilidin komuttan önce alınması, gece modu.
- Kural niteliğindeki not `CLAUDE.md`'de ya da `KARARLAR.md`'de varsa hafızadan çıkar. Hafızada yalnız Mert ve ortam bilgisi kalır (CLAUDE.md §6).
- `MEMORY.md` dizini güncellenir; silinen her not günlüğe tek satırla yazılır.

- [ ] **Step 7: Mert'in ana klasörü**

Mert'e sor (önerilen ilk, `Dayanak:` satırıyla): "Ana klasörde sildiğin 14 dosyanın yeni sürümleri main'e geldi. Ana klasörü güncelleyeyim mi? Önce silinenler git'ten geri alınır, sonra `git pull --ff-only`." Seçenekler: "Güncelle (Önerilen)" / "Dokunma". Evet ise:

```bash
git -C C:/Users/TheWe/Documents/Codex/newfork-clean restore CLAUDE.md apps/api/CLAUDE.md apps/web/CLAUDE.md e2e/CLAUDE.md docs/plan
git -C C:/Users/TheWe/Documents/Codex/newfork-clean pull --ff-only
```

- [ ] **Step 8: Yeni koordinatörü başlat**

Mert, Claude uygulamasında `C:/Users/TheWe/Documents/Codex/newfork-wt/coord` klasöründe yeni oturum açar (adı "Koordinatör"). `SessionStart` kancası `DURUM.md`'yi yükler. Mert ilk hedefi verir; koordinatör §2.6'ya göre daraltır, Mert onaylar, `/oto <hedef>`.

- [ ] **Step 9: Deneme işi ve taban ölçüm**

İlk tur "Sırada"dan küçük, normal sınıf bir işi seçer (DERSLER 13: yeni orkestrasyon önce küçük, uçtan uca). Ölç ve günlüğe yaz: işçinin başlamasından `HAZIR`'a süre, `HAZIR`'dan main'e süre, trenin CI süresi, ajan raporunun `docs/plan/gunluk/`'te olduğu, `lock.mjs status`'ün boş olduğu. Bir şey kırılırsa (`SubagentStop` dosyası yok, kanca hata veriyor, tren takıldı) `/oto` durur, Mert'e o pencerede söylenir.

- [ ] **Step 10: Bir hafta sonra (2026-10-15)**

`DURUM.md` "Sağlık"taki ölçüm günü gelince koordinatör spec §2'nin yedi ölçütünü önce/sonra tablosuyla `/durum`'da Mert'e verir. Tutmayan ölçüt için önerisini de yazar (ör. tren kırmızı oranı %30'u geçtiyse incelemeli işler dalda kendi pgTAP'ini ve etkilenen e2e'yi koşar; spec §12).
