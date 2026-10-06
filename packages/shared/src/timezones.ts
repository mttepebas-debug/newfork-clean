/** Validate an IANA region identifier (or UTC), not a guessed fixed offset. */
export function isValidIanaTimezone(value: string): boolean {
  if (value !== "UTC" && !/^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; }
  catch { return false; }
}
export function availableIanaTimezones(current = ""): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  const values = intl.supportedValuesOf?.("timeZone") ?? [];
  return [...new Set(["UTC", ...values, ...(isValidIanaTimezone(current) ? [current] : [])])].sort();
}
