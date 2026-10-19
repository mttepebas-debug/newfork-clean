import { z } from "zod";
import { lineupArtItems, lineupArtKeys } from "./lineup-art.generated";
import { suggestLineupArtFrom, type LineupArtItem } from "./lineup-art-rule";

// AVATAR-IKON: the product's drawing archive (job icons, person drawings, team drawings) by key.
// The list is generated from scripts/lineup-art/archive.json (scripts/lineup-art/gen.mjs); the SVGs
// live in the web's own chunk (apps/web/src/lineup-art), the keys also in app_private.lineup_art.

export type { LineupArtItem, LineupArtKind, LineupArtStyle } from "./lineup-art-rule";

/** Every drawing, in number order. */
export const lineupArt: readonly LineupArtItem[] = lineupArtItems;

// The pure marks let a bundle that never reads the archive drop it whole (every web page imports
// this package's barrel): a pure call whose arguments still run would keep the list.
function indexByKey(items: readonly LineupArtItem[]): ReadonlyMap<string, LineupArtItem> {
  return new Map(items.map((item) => [item.key, item]));
}

export const lineupArtByKey: ReadonlyMap<string, LineupArtItem> = /* @__PURE__ */ indexByKey(lineupArt);

export const lineupArtKeySchema = /* @__PURE__ */ z.enum(lineupArtKeys);
export type LineupArtKey = z.infer<typeof lineupArtKeySchema>;

/** The drawings suggested for a new job's name (the database's rule, app_private.suggest_lineup_art). */
export function suggestLineupArt(jobName: string): string[] {
  return suggestLineupArtFrom(lineupArt, jobName);
}
