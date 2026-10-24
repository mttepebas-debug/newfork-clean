import type { NotificationArea, NotificationItem } from "@newfork/shared";
import { validZone, zoneName } from "../lib/today";
import { formatTime } from "../schedule/lib/scheduleDateTime";
import type { TimeFormat } from "../schedule/timeInput";

// BILDIRIM-10: how a row reads (KARARLAR S-123, variant A; S-251, S-258, S-261):
// its tile, its two lines, its time, whether it is new, and how it closed.

export type Tone = "amber" | "green" | "red" | "blue" | "slate";
export type TileIcon =
  | "time-off"
  | "swap"
  | "pickup"
  | "cover"
  | "asked"
  | "exchange"
  | "approved"
  | "declined"
  | "revoked"
  | "expired"
  | "joined"
  | "name"
  | "no-location"
  | "owner"
  | "published"
  | "calendar"
  | "clipboard"
  | "users"
  | "file"
  | "megaphone"
  | "shield"
  | "building";

const areaLooks: Record<NotificationArea, { icon: TileIcon; tone: Tone }> = {
  schedule: { icon: "calendar", tone: "green" },
  shift_changes: { icon: "exchange", tone: "green" },
  time_off: { icon: "time-off", tone: "red" },
  lineup: { icon: "clipboard", tone: "green" },
  people: { icon: "users", tone: "blue" },
  documents: { icon: "file", tone: "blue" },
  announcements: { icon: "megaphone", tone: "slate" },
  account: { icon: "shield", tone: "slate" },
  workspace: { icon: "building", tone: "slate" },
};

/** A decision shows how it went (S-258): approved, declined, revoked, or nobody decided in time. */
const outcomeLooks: Record<string, { icon: TileIcon; tone: Tone }> = {
  approved: { icon: "approved", tone: "green" },
  declined: { icon: "declined", tone: "red" },
  denied: { icon: "declined", tone: "red" },
  revoked: { icon: "revoked", tone: "slate" },
  expired: { icon: "expired", tone: "slate" },
};

/** The kind of thing a notice is about: the request icons the whole app uses (Requests → KindIcon, S-251). */
function kindIcon(item: Pick<NotificationItem, "type" | "area" | "data">): TileIcon {
  const { type, data } = item;
  if (type.startsWith("time_off.")) return "time-off";
  // A shift someone asks you by name to take (S-261, Mert 2026-10-24: "Soru işareti olarak 3. Seçeneği kullan").
  if (type === "shift_changes.cover_asked") return "asked";
  if (type.startsWith("shift_changes.open_shift_")) return "pickup";
  if (type.startsWith("shift_changes.")) {
    if (data.kind === "swap") return "swap";
    if (data.audience === "eligible_pool") return "pickup";
    if (data.kind === "cover") return "cover";
  }
  if (type === "people.joined" || type.startsWith("people.onboarding_")) return "joined";
  if (type.startsWith("people.preferred_name_")) return "name";
  if (type === "people.no_location") return "no-location";
  if (type.startsWith("people.ownership_transfer_")) return "owner";
  if (type === "schedule.published") return "published";
  return areaLooks[item.area].icon;
}

/**
 * The requests that wait on the reader outside Approvals (variant A, frame.js fmtReq): amber like the rest, as in
 * Needs you (S-258). An extra shift on offer to the pool is news, not a request: it keeps its area's green.
 */
const waitsOnReader = new Set([
  "shift_changes.cover_asked",
  "shift_changes.swap_offered",
  "people.ownership_transfer_requested",
  "people.no_location",
  "schedule.shifts_unassigned",
  "schedule.week_not_published",
]);

/** A row's tile: what it is about, or how a decision went; a request waiting on this person is amber. */
export function rowLook(item: Pick<NotificationItem, "type" | "area" | "topic" | "data">): { icon: TileIcon; tone: Tone } {
  const outcome = item.data.outcome;
  if (item.type.endsWith(".decided") && typeof outcome === "string" && Object.hasOwn(outcomeLooks, outcome)) return outcomeLooks[outcome]!;
  return { icon: kindIcon(item), tone: item.topic === "approvals" || waitsOnReader.has(item.type) ? "amber" : areaLooks[item.area].tone };
}

function startOfDay(at: Date) {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}
const dayMs = 86_400_000;

/** The arrival's clock time on the device ("4:12 PM", or "16:12" for whoever reads 24h). */
function clock(at: Date, timeFormat: TimeFormat): string {
  const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return formatTime(hhmm, timeFormat, "long");
}

/**
 * When a notice arrived, short, at the right of the row's second line (S-251), on the device's clock:
 * "now", "5m", "3h" today; "Yesterday"; "Mon" within the week; then "Oct 12" ("Oct 12, 2025" another year).
 */
export function arrivalLabel(createdAt: string, now: Date): string {
  const at = new Date(createdAt);
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  const days = Math.round((startOfDay(now) - startOfDay(at)) / dayMs);
  if (days <= 0) {
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return at.toLocaleDateString("en-US", { weekday: "short" });
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: at.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** The arrival in full for the hover: "Thursday, October 15, 2026 at 4:12 PM Pacific Time". */
export function arrivalTitle(createdAt: string, timeFormat: TimeFormat = "12h"): string {
  const at = new Date(createdAt);
  const day = at.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `${day} at ${clock(at, timeFormat)} ${zoneName(validZone(), at)}`;
}

/**
 * S-247 (2): New is what came since the list was last opened. `fresh` holds what this opening of the list
 * already showed as new, so a row stays New after the list marks it seen.
 */
export function isNewNotice(item: Pick<NotificationItem, "id" | "seen_at">, fresh: ReadonlySet<string>): boolean {
  return !item.seen_at || fresh.has(item.id);
}

/**
 * How it closed: "You approved" when the reader did it, "Approved by Maria L." when someone else did
 * and the core names them (S-247 (3)), else "Approved".
 */
export function resolutionLabel(
  item: Pick<NotificationItem, "resolution" | "resolved_by" | "resolved_by_name"> & Partial<Pick<NotificationItem, "type">>,
  viewerId: string | undefined,
): string | null {
  if (!item.resolution) return null;
  // A document that ran out says nothing about it: its own line says which one it is.
  if (item.resolution === "expired" && item.type?.startsWith("documents.")) return null;
  // Only a request waiting on someone's decision is "not decided in time"; a past shift or an offer runs out.
  if (item.resolution === "expired" && item.type && !/^(time_off|shift_changes)\./.test(item.type)) return "Expired";
  // [someone else did it, the reader did it, names the one who did it]
  const words: Record<string, [string, string, boolean]> = {
    approved: ["Approved", "You approved", true],
    declined: ["Declined", "You declined", true],
    denied: ["Declined", "You declined", true],
    revoked: ["Revoked", "You revoked", true],
    expired: ["Not decided in time", "Not decided in time", false],
    cancelled: ["Cancelled", "You cancelled", true],
    accepted: ["Accepted", "You accepted", true],
    withdrawn: ["Withdrawn", "You withdrew it", true],
    completed: ["Done", "Done", false],
    applied: ["Applied", "You applied", false],
    taken: ["Taken", "Taken", false],
    submitted: ["Handed in", "You handed it in", false],
    acknowledged: ["Acknowledged", "You acknowledged", false],
    fixed: ["Fixed", "You fixed it", true],
    removed: ["Removed", "You removed it", true],
    restored: ["Restored", "Restored", false],
  };
  const known = words[item.resolution];
  const mine = Boolean(viewerId) && item.resolved_by === viewerId;
  if (known) {
    if (mine) return known[1];
    return known[2] && item.resolved_by_name ? `${known[0]} by ${item.resolved_by_name}` : known[0];
  }
  const plain = item.resolution.replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/**
 * A row's two lines (S-251): the title, then the body, or once the card closed, how it closed (no time:
 * the time at the right stays the arrival). A row without a body keeps an empty second line.
 */
export function rowLines(
  item: Pick<NotificationItem, "title" | "body" | "resolution" | "resolved_by" | "resolved_by_name"> & Partial<Pick<NotificationItem, "type">>,
  viewerId: string | undefined,
): { first: string; second: string; closed: boolean } {
  const closing = resolutionLabel(item, viewerId);
  return { first: item.title, second: closing ?? item.body ?? "", closed: closing !== null };
}

/** The list's empty sentence per tab. */
export function emptyTitle(filter: "all" | "unread" | "needs_action"): string {
  return filter === "needs_action" ? "Nothing needs you right now" : "You're all caught up";
}
