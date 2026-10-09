// Types for e2e/karantina.mjs (plain Node module, also run by scripts/karantina.test.mjs).
export const MAX_DAYS: number;
export const MIN_PATTERN: number;
export function parseKarantina(
  text: string | null | undefined,
  today: string | Date,
): { patterns: string[]; expired: string[]; invalid: string[] };
export function grepInvertFrom(patterns: string[]): RegExp | undefined;
