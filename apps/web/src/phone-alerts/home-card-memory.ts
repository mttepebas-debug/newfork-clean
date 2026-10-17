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
