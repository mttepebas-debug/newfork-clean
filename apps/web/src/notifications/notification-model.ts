import type { NotificationArea, NotificationItem } from "@newfork/shared";

// BILDIRIM-10: how a row reads (KARARLAR S-123, variant A): its tile, its
// time, its group, and the decision it carries.

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

/** "Just now", "12 min", "3 h" today; "Yesterday"; a weekday within the week; then "Oct 2". */
export function relativeTime(createdAt: string, now: Date): string {
  const at = new Date(createdAt);
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / dayMs);
  if (days <= 0) {
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h`;
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return at.toLocaleDateString("en-US", { weekday: "short" });
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: at.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export type DayGroup = "Today" | "Yesterday" | "Earlier";
export function dayGroup(createdAt: string, now: Date): DayGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(createdAt))) / dayMs);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : "Earlier";
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
  };
  const known = words[item.resolution];
  const mine = Boolean(viewerId) && item.resolved_by === viewerId;
  if (known) return mine ? known[1] : known[0];
  const plain = item.resolution.replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** The list's empty sentence per tab. */
export function emptyTitle(filter: "all" | "unread" | "needs_action"): string {
  return filter === "needs_action" ? "Nothing needs you right now" : "You're all caught up";
}
