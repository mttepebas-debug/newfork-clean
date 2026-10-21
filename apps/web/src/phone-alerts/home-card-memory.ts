// What this device remembers for the Home card (BILDIRIM-15). Permission is a
// device's, so these are too: the person opened their schedule here once, and
// said Not now here (the card asks once, KARARLAR S-123). Storage that is not
// there (a private window) counts as not yet and never throws.

const seenKey = "newfork.phoneAlerts.scheduleSeen";
const dismissedKey = "newfork.phoneAlerts.dismissed";

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Nothing kept: the card may show again, never wrongly.
  }
}

export const scheduleSeen = () => read(seenKey);
export const markScheduleSeen = () => write(seenKey);
export const cardDismissed = () => read(dismissedKey);
export const dismissCard = () => write(dismissedKey);

/** The schedule a person opens: My Schedule for an employee, Schedule for a manager. */
export function isSchedulePath(pathname: string): boolean {
  return /^\/app\/(schedule|employee-hub\/schedule)(\/|$)/.test(pathname);
}

// Employee Home (TELEFON-TUR2, K26): one alerts entry per opening. The first opening of Home on this
// device gets the small offer under "Your day"; later ones the block under Updates. Any Not now quiets
// both for 3 days; the block's own Not now hides it here for good (dismissCard above).

const openingKey = "newfork.phoneAlerts.opening";
const firstHomeKey = "newfork.phoneAlerts.firstHomeOpening";
const quietKey = "newfork.phoneAlerts.quietUntil";
const QUIET_MS = 3 * 24 * 60 * 60 * 1000;

let pageOpening: string | null = null;
/** This tab's opening: one per tab session (a reload keeps it). */
function opening(): string {
  if (pageOpening) return pageOpening;
  try {
    pageOpening = window.sessionStorage.getItem(openingKey);
    if (!pageOpening) {
      pageOpening = Math.random().toString(36).slice(2);
      window.sessionStorage.setItem(openingKey, pageOpening);
    }
  } catch {
    pageOpening = "page";
  }
  return pageOpening;
}

/** Whether this opening is the first Home on this device (and claims it if no opening has yet). */
export function firstHomeOpening(): boolean {
  const now = opening();
  try {
    const first = window.localStorage.getItem(firstHomeKey);
    if (!first) {
      window.localStorage.setItem(firstHomeKey, now);
      return true;
    }
    return first === now;
  } catch {
    // Nothing kept: the block, which is the quieter of the two.
    return false;
  }
}

export function quiet(now = Date.now()): boolean {
  try {
    return Number(window.localStorage.getItem(quietKey) ?? 0) > now;
  } catch {
    return false;
  }
}

export function quietForThreeDays(now = Date.now()) {
  try {
    window.localStorage.setItem(quietKey, String(now + QUIET_MS));
  } catch {
    // Nothing kept: the entry may come back sooner, never wrongly.
  }
}
