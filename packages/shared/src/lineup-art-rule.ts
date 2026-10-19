// AVATAR-IKON: the drawing archive's item shape and its suggestion rule, on their own.
//
// No zod and no archive here, so scripts/lineup-art/gen.mjs can run this very rule under Node to
// write the database's parity test (supabase/tests/lineup_art_parity.test.sql). The database owns
// the rule (app_private.suggest_lineup_art); the web runs this copy for the "New job" preview, and
// the parity test keeps the two giving the same answer. Change one, change the other.

export type LineupArtKind = "person" | "object" | "team";
export type LineupArtStyle = "line" | "color";

export interface LineupArtItem {
  readonly key: string;
  readonly no: number;
  readonly name: string;
  /** The jobs this drawing suits: lower case, trimmed. Empty for team drawings. */
  readonly jobs: readonly string[];
  readonly kind: LineupArtKind;
  readonly style: LineupArtStyle;
}

export const LINEUP_ART_SUGGESTION_LIMIT = 8;

/** A job's name as the rule compares it: lower case, trimmed, inner spaces folded to one. */
export function normalizeLineupJobName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The drawings suggested for a job's name: a drawing matches when one of its jobs equals the name,
 * sits inside the name ("Head Server" has "server"), or holds a name of three letters or more ("bar"
 * in "bartender"). Team drawings are never suggested. Colour drawings come first, then by number;
 * at most eight.
 */
export function suggestLineupArtFrom(items: readonly LineupArtItem[], jobName: string): string[] {
  const name = normalizeLineupJobName(jobName);
  if (!name) return [];
  return items
    .filter(
      (item) =>
        item.kind !== "team" &&
        item.jobs.some((job) => job === name || name.includes(job) || (name.length >= 3 && job.includes(name))),
    )
    .sort((a, b) => (a.style === b.style ? a.no - b.no : a.style === "color" ? -1 : 1))
    .slice(0, LINEUP_ART_SUGGESTION_LIMIT)
    .map((item) => item.key);
}
