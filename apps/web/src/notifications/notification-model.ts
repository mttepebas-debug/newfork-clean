import type { NotificationArea, NotificationItem } from "@newfork/shared";
import { validZone, zoneName } from "../lib/today";
import { formatTime } from "../schedule/lib/scheduleDateTime";
import type { TimeFormat } from "../schedule/timeInput";

// BILDIRIM-10: how a row reads (KARARLAR S-123, variant A): its tile, its
// time, whether it is new, and how it closed.

export type Tone = "amber" | "green" | "red" | "blue" | "slate";
export type TileIcon =
  | "clipboard"
  | "calendar"
  | "swap"
  | "time-off"
  | "users"
  | "file"
  | "megaphone"
  | "shield"
  | "building";

const areaLooks: Record<NotificationArea, { label: string; icon: TileIcon; tone: Tone }> = {
  schedule: { label: "Schedule", icon: "calendar", tone: "green" },
  shift_changes: { label: "Shift changes", icon: "swap", tone: "green" },
  time_off: { label: "Time off", icon: "time-off", tone: "red" },
  lineup: { label: "Lineup", icon: "clipboard", tone: "green" },
  people: { label: "People", icon: "users", tone: "blue" },
  documents: { label: "Documents", icon: "file", tone: "blue" },
  announcements: { label: "Announcements", icon: "megaphone", tone: "slate" },
  account: { label: "Account", icon: "shield", tone: "slate" },
  workspace: { label: "Workspace", icon: "building", tone: "slate" },
};

/** A request waiting for this person's answer looks like an approval, whatever its area. */
export function rowLook(item: Pick<NotificationItem, "area" | "topic">) {
  const look = areaLooks[item.area];
  return item.topic === "approvals" ? { label: "Approvals", icon: "clipboard" as const, tone: "amber" as const } : look;
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
 * When a notice arrived, on the device's clock (S-226 (2), S-247): "Just now", "5m ago", "3h ago" today;
 * "Yesterday 4:12 PM"; "Mon 4:12 PM" within the week; then "Oct 12" ("Oct 12, 2025" another year).
 */
export function arrivalLabel(createdAt: string, now: Date, timeFormat: TimeFormat = "12h"): string {
  const at = new Date(createdAt);
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  const days = Math.round((startOfDay(now) - startOfDay(at)) / dayMs);
  if (days <= 0) {
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
  if (days === 1) return `Yesterday ${clock(at, timeFormat)}`;
  if (days < 7) return `${at.toLocaleDateString("en-US", { weekday: "short" })} ${clock(at, timeFormat)}`;
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

/** "Approved", "Declined"; "You approved" when the reader decided it. */
export function resolutionLabel(item: Pick<NotificationItem, "resolution" | "resolved_by">, viewerId: string | undefined): string | null {
  if (!item.resolution) return null;
  const words: Record<string, [string, string]> = {
    approved: ["Approved", "You approved"],
    declined: ["Declined", "You declined"],
    denied: ["Declined", "You declined"],
    expired: ["Not decided in time", "Not decided in time"],
    cancelled: ["Cancelled", "You cancelled"],
    accepted: ["Accepted", "You accepted"],
    completed: ["Done", "Done"],
  };
  const known = words[item.resolution];
  const mine = Boolean(viewerId) && item.resolved_by === viewerId;
  if (known) return mine ? known[1] : known[0];
  const plain = item.resolution.replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** How it closed and when: "You approved · 2m ago". */
export function resolvedLine(
  item: Pick<NotificationItem, "resolution" | "resolved_by" | "resolved_at">,
  viewerId: string | undefined,
  now: Date,
  timeFormat: TimeFormat = "12h",
): string | null {
  const label = resolutionLabel(item, viewerId);
  if (!label) return null;
  return item.resolved_at ? `${label} · ${arrivalLabel(item.resolved_at, now, timeFormat)}` : label;
}

/** The list's empty sentence per tab. */
export function emptyTitle(filter: "all" | "unread" | "needs_action"): string {
  return filter === "needs_action" ? "Nothing needs you right now" : "You're all caught up";
}
