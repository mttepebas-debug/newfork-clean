// WORKFLOW-V2 (S-106, Mert's #12 as the controller ruled it 2026-10-08): the e2e quarantine list.
// A known e2e red that is red on main too does not stop the train: the train adds that test to
// e2e/karantina.txt (a BL number, at most MAX_DAYS days), the run skips it and CI stays green.
// e2e/playwright.config.ts turns the live entries into Playwright's grepInvert.
// Line format: `<a part of the test title> | BL-<no> | <YYYY-MM-DD end date>`; `#` starts a comment.

// Longest quarantine, counted from today: an end date further out is invalid (logged, ignored).
export const MAX_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" of a Date's local calendar day, or the string as given.
function dayOf(today) {
  if (today instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  }
  return String(today);
}

// Days since the epoch of a real "YYYY-MM-DD" day, or null (wrong shape or no such day, like 2026-02-30).
function epochDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

// The quarantine file's text → the title parts to skip today, plus the lines that no longer count (expired:
// end date before today) and the ones that never did (invalid: wrong shape, or end date beyond MAX_DAYS).
export function parseKarantina(text, today) {
  const out = { patterns: [], expired: [], invalid: [] };
  const now = epochDay(dayOf(today));
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|").map((p) => p.trim());
    const end = parts.length === 3 ? epochDay(parts[2]) : null;
    if (parts.length !== 3 || !parts[0] || !/^BL-\d+$/.test(parts[1]) || end === null || now === null) {
      out.invalid.push(line);
    } else if (end < now) {
      out.expired.push(line);
    } else if (end - now > MAX_DAYS) {
      out.invalid.push(line);
    } else {
      out.patterns.push(parts[0]);
    }
  }
  return out;
}

// The title parts as one RegExp that matches any of them literally, or undefined when there are none.
export function grepInvertFrom(patterns) {
  if (!patterns?.length) return undefined;
  return new RegExp(patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
}
