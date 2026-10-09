// WORKFLOW-V2 (S-106, Mert's #12 as the controller ruled it 2026-10-08): the e2e quarantine list.
// A known e2e red that is red on main too does not stop the train: the coordinator adds that test to
// e2e/karantina.txt (a BL number, at most MAX_DAYS days) on coord/kayit, the run skips it and CI stays green.
// e2e/playwright.config.ts turns the live entries into Playwright's grepInvert.
// Line format: `<a part of the test title> | BL-<no> | <YYYY-MM-DD start> | <YYYY-MM-DD end>`; `#` starts a comment.

// Longest quarantine: end minus start, in days; longer is invalid (logged, ignored).
export const MAX_DAYS = 7;
// Shortest title part: a shorter one would skip unrelated tests.
export const MIN_PATTERN = 12;

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

// Playwright matches grep against the title path joined by spaces; the report shows it joined by " › ".
const asPlaywrightTitle = (s) => s.replace(/\s*›\s*/g, " ").trim();

// The quarantine file's text → the title parts to skip today, plus the lines that no longer count (expired:
// end date before today) and the ones that never did (invalid: wrong shape, a title part under MIN_PATTERN
// characters, a start after the end or after today, or more than MAX_DAYS from start to end).
export function parseKarantina(text, today) {
  const out = { patterns: [], expired: [], invalid: [] };
  const now = epochDay(dayOf(today));
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split("|").map((p) => p.trim());
    const ok4 = parts.length === 4;
    const pattern = ok4 ? asPlaywrightTitle(parts[0]) : "";
    const start = ok4 ? epochDay(parts[2]) : null;
    const end = ok4 ? epochDay(parts[3]) : null;
    if (!ok4 || pattern.length < MIN_PATTERN || !/^BL-\d+$/.test(parts[1]) || start === null || end === null || now === null) {
      out.invalid.push(line);
    } else if (start > end || start > now || end - start > MAX_DAYS) {
      out.invalid.push(line);
    } else if (end < now) {
      out.expired.push(line);
    } else {
      out.patterns.push(pattern);
    }
  }
  return out;
}

// The title parts as one RegExp that matches any of them literally, or undefined when there are none.
export function grepInvertFrom(patterns) {
  if (!patterns?.length) return undefined;
  return new RegExp(patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
}
