import { execSync } from "node:child_process";
import { createECDH } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { grepInvertFrom, parseKarantina } from "./karantina.mjs";

// Browser tests (FOUNDATION-B stage 2d): the real sign-in screen, the real API
// and the web app, against the local Supabase that `supabase start` runs.
// People come from the test world builder with a password
// (supabase/test-support/builder.sql), made fresh by global-setup on every run.

// BL-112: three self-hosted runners can each run an e2e job at once. Every
// runner needs its own web/api ports, or two concurrent e2e jobs would try to
// bind the same port; scripts/ci-supabase-apart.sh already worked out which
// runner this is (its Supabase project is keyed the same way) and left it in
// CI_RUNNER_INDEX. The Supabase port block can move to the next free one in
// the runner's lane (CI-PORT-FALLBACK); this file reads it from `supabase
// status`, never by number. These web/api ports stay: they are not Docker
// ports, so Windows's excluded ranges never reach them (WSL NAT). Locally
// (no CI_RUNNER_INDEX) nothing changes.
const runnerIndex = process.env.CI ? Number(process.env.CI_RUNNER_INDEX) : 0;
if (process.env.CI && !Number.isInteger(runnerIndex)) {
  throw new Error("CI_RUNNER_INDEX is not set; run scripts/ci-supabase-apart.sh first");
}
const webPort = process.env.CI ? 5580 + runnerIndex * 10 : 5565;
const apiPort = process.env.CI ? 5581 + runnerIndex * 10 : 5566;
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;

// The local project's URL and keys, as `supabase status` prints them.
function localSupabase(): Record<string, string> {
  // CI installs the pinned CLI on PATH; locally it runs through npx.
  const cli = process.env.CI ? "supabase" : "npx supabase";
  const printed = execSync(`${cli} status -o env`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return Object.fromEntries(
    printed
      .split(/\r?\n/)
      .map((line) => /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

const supabase = localSupabase();

// A spec that needs the auth admin API (the password reset flow mints its
// link there, since no email leaves a local run) reads these two.
// A P-256 key pair for phone alerts, made fresh each run (BILDIRIM-15).
const vapidPair = createECDH("prime256v1");
vapidPair.generateKeys();
// The private key is 32 bytes; Node drops leading zero bytes, so it is padded back.
const vapidPrivate = vapidPair.getPrivateKey();
const vapid = {
  publicKey: vapidPair.getPublicKey("base64url"),
  privateKey: Buffer.concat([Buffer.alloc(32 - vapidPrivate.length), vapidPrivate]).toString("base64url"),
};

process.env.E2E_SUPABASE_URL = requireSupabaseEnv("API_URL");
process.env.E2E_SERVICE_ROLE_KEY = requireSupabaseEnv("SERVICE_ROLE_KEY");
// A spec that calls the API the way a script would, past the screens (a fresh
// token alone must not be enough for a sensitive action, SEC-003), reads these.
process.env.E2E_API_URL = apiUrl;
process.env.E2E_ANON_KEY = requireSupabaseEnv("ANON_KEY");
// Supabase's local mail catcher, where sign-up confirmations land (SEC-003).
// Older CLIs print it as INBUCKET_URL.
process.env.E2E_MAILPIT_URL = supabase.MAILPIT_URL ?? supabase.INBUCKET_URL ?? "";

// `noUncheckedIndexedAccess` makes every lookup on a Record<string, string>
// come back `string | undefined`; the webServer env below needs a definite
// string, and a missing key means `supabase status` didn't print what this
// file expects -- worth failing loudly on, not passing `undefined` through.
function requireSupabaseEnv(key: string): string {
  const value = supabase[key];
  if (!value) {
    throw new Error(`supabase status -o env did not print ${key}`);
  }
  return value;
}

// S-106: tests on the quarantine list (e2e/karantina.txt) are skipped until their end date. No file means
// nothing is quarantined; expired and invalid lines are printed and ignored, so those tests run.
function quarantine(): RegExp | undefined {
  let text = "";
  try {
    text = readFileSync(fileURLToPath(new URL("./karantina.txt", import.meta.url)), "utf8");
  } catch {
    return undefined;
  }
  const { patterns, expired, invalid } = parseKarantina(text, new Date());
  for (const line of expired) console.warn(`karantina: süresi dolmuş, test koşar: ${line}`);
  for (const line of invalid) console.warn(`karantina: geçersiz satır, yok sayıldı: ${line}`);
  for (const p of patterns) console.log(`karantina: atlanıyor: ${p}`);
  return grepInvertFrom(patterns);
}

export default defineConfig({
  testDir: "./flows",
  globalSetup: "./global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // A forgotten test.only would quietly skip every other spec in CI (BL-281).
  forbidOnly: Boolean(process.env.CI),
  grepInvert: quarantine(),
  // CI retries a failed test once; one that passes on the retry is counted as flaky in the list
  // summary and marked on the run page by the github reporter (Mert, 2026-10-20).
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: webUrl,
    // CI installs Playwright's own Chromium; locally the installed Chrome is used
    // so a run needs no browser download.
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @newfork/api exec tsx src/server.ts",
      url: `${apiUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        HOST: "127.0.0.1",
        PORT: String(apiPort),
        APP_URL: webUrl,
        SUPABASE_URL: requireSupabaseEnv("API_URL"),
        SUPABASE_ANON_KEY: requireSupabaseEnv("ANON_KEY"),
        SUPABASE_SERVICE_ROLE_KEY: requireSupabaseEnv("SERVICE_ROLE_KEY"),
        // Phone alerts (BILDIRIM-15): a key pair made for this run only, so the screens offer them; no key
        // sits in the repository. No cron runs here, so the push worker never sends, and
        // flows/phone-alerts.spec.ts blocks every push host.
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:e2e@newfork.test",
      },
    },
    {
      command: `pnpm --filter @newfork/web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webUrl,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        VITE_API_URL: apiUrl,
        VITE_SUPABASE_URL: requireSupabaseEnv("API_URL"),
        VITE_SUPABASE_ANON_KEY: requireSupabaseEnv("ANON_KEY"),
      },
    },
  ],
});
