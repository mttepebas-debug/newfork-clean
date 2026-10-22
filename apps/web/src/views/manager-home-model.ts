// The managers' Home, "Locations first" (YONETICI-HOME; KARARLAR S-210): what
// the page draws, worked out from the one Home read (each location's day) and
// the Shift Hub cases waiting for a manager. Pure: no React, no clock of its own.
import type { ExchangeCase, HomeSectionId, ManagerHome, ManagerHomeComing, ManagerHomeLocation, ManagerHomeUpdate } from "@newfork/shared";

/** 6 AM to midnight, an hour a bar (the employee's Home draws the same day). */
export const HOME_HOURS = 18;
const FIRST_HOUR = 6;

/**
 * The sections a manager arranges in Customize. A key is only where the
 * choice is stored (save_workspace_layout_service): "quick_actions" holds
 * where "Next 7 days" goes.
 */
export const HOME_SECTIONS: Record<HomeSectionId, string> = {
  operations: "Your locations",
  pending_requests: "Needs you",
  quick_actions: "Next 7 days",
  updates: "Updates",
  open_shifts: "Open shifts",
  announcements: "From your team",
  coming_up: "Coming up",
  todos: "Todos",
};

/**
 * S-220 (3): the location cards fill their rows, three to a row, and no card
 * is left alone on the last one: four are two and two, seven are three, two
 * and two. True for a card in a row of two.
 */
export function cardsInPairs(count: number): boolean[] {
  if (count <= 1) return Array.from({ length: count }, () => false);
  if (count === 2) return [true, true];
  const pairs = count % 3 === 1 ? 4 : count % 3 === 2 ? 2 : 0;
  return Array.from({ length: count }, (_, index) => index >= count - pairs);
}

/** Customize: one location a place earlier (-1) or later (1) in the person's order. */
export function moveLocation(order: readonly string[], id: string, offset: number): string[] {
  const index = order.indexOf(id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Minutes from the location's own midnight on `today` to the moment, on its wall clock. */
export function minutesFromToday(iso: string, zone: string, today: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "0";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days * 1440 + Number(part("hour")) * 60 + Number(part("minute"));
}

export type HourBar = { readonly count: number; readonly gap: boolean };

/** How many shifts run at the middle of each hour from 6 AM to midnight, and whether an open one does. */
export function hourBars(location: ManagerHomeLocation): HourBar[] {
  const spans = location.today_shifts.map((shift) => ({
    from: minutesFromToday(shift.starts_at, location.timezone, location.today),
    to: minutesFromToday(shift.ends_at, location.timezone, location.today),
    open: shift.open,
  }));
  return Array.from({ length: HOME_HOURS }, (_, index) => {
    const middle = (FIRST_HOUR + index) * 60 + 30;
    const running = spans.filter((span) => span.from <= middle && middle < span.to);
    return { count: running.length, gap: running.some((span) => span.open) };
  });
}

/** The bar the clock is in, or null before 6 AM. */
export function hourNow(location: ManagerHomeLocation, now: Date): number | null {
  const minute = minutesFromToday(now.toISOString(), location.timezone, location.today);
  const index = Math.floor(minute / 60) - FIRST_HOUR;
  return index >= 0 && index < HOME_HOURS ? index : null;
}

const running = (shift: { starts_at: string; ends_at: string }, now: Date) =>
  Date.parse(shift.starts_at) <= now.getTime() && now.getTime() < Date.parse(shift.ends_at);

/** People on a shift right now: open shifts are nobody. */
export function onNow(location: ManagerHomeLocation, now: Date): number {
  return location.today_shifts.filter((shift) => !shift.open && running(shift, now)).length;
}

/** S-163 (7): shown only while somebody in a Management job is on a shift there. */
export function managerOnFloor(location: ManagerHomeLocation, now: Date): string | null {
  return location.floor_managers.find((shift) => running(shift, now))?.name ?? null;
}

export function openToday(location: ManagerHomeLocation): number {
  return location.today_shifts.filter((shift) => shift.open).length;
}

export type NeedKind = "docs" | "timeoff" | "swap" | "publish";
export type ManagerNeed = {
  readonly id: string;
  readonly kind: NeedKind;
  readonly urgent: boolean;
  readonly title: string;
  readonly detail: string;
  readonly cta: string;
  /** Null: nothing to open from here (Schedule on a phone). */
  readonly href: string | null;
  readonly locationIds: readonly string[];
};

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const dateRange = (first: string | null, last: string | null) =>
  !first ? "" : !last || last === first ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * Documents filtered to the location and, when one tab holds every line, its
 * status (Rejected counts as Missing there); one person's line also opens the
 * first document's review drawer.
 */
function documentsHref(location: ManagerHomeLocation, onePerson: boolean): string {
  const tabs = new Set(location.missing_documents.map((item) => (item.status === "expired" ? "expired" : "missing")));
  const params = new URLSearchParams({ location: location.id });
  if (tabs.size === 1) params.set("status", [...tabs][0]!);
  const first = location.missing_documents[0];
  if (onePerson && first) params.set("requirement", first.requirement_id);
  return `/app/employees/documents?${params}`;
}

/** A Shift Hub case is the manager's once the people agreed (the Requests page's rule). */
export const waitsOnManager = (item: ExchangeCase) =>
  item.status === "open" && (item.stage === "ready_for_manager" || item.stage === "awaiting_other_manager");

/**
 * Everything that waits on the manager, in the order it is answered: who works
 * without a required document first (S-206, red), then requests, then days
 * not yet published.
 */
export function homeNeeds(home: ManagerHome, cases: readonly ExchangeCase[], phone: boolean): ManagerNeed[] {
  const inView = new Set(home.locations.map((location) => location.id));
  const docs = home.locations.flatMap((location): ManagerNeed[] => {
    const people = [...new Map(location.missing_documents.map((item) => [item.employee_id, item.name])).values()];
    if (!people.length) return [];
    const shown = location.missing_documents.slice(0, 3).map((item) => `${item.name} · ${item.document}`);
    const more = location.missing_documents.length - shown.length;
    return [
      {
        id: `docs:${location.id}`,
        kind: "docs",
        urgent: true,
        title: people.length === 1 ? `${people[0]} is working without a required document` : `${people.length} people are working without a required document`,
        detail: [...shown, ...(more > 0 ? [`${more} more`] : [])].join(" · "),
        cta: "Review documents",
        href: documentsHref(location, people.length === 1),
        locationIds: [location.id],
      },
    ];
  });
  const timeOff = home.time_off.map(
    (request): ManagerNeed => ({
      id: `timeoff:${request.id}`,
      kind: "timeoff",
      urgent: false,
      title: `${request.employee_name} asks for time off`,
      detail: dateRange(request.first_date, request.last_date),
      cta: "Review request",
      href: `/app/schedule/requests?request=${request.id}`,
      locationIds: request.location_ids,
    }),
  );
  const swaps = cases.filter(waitsOnManager).map(
    (item): ManagerNeed => ({
      id: `swap:${item.id}`,
      kind: "swap",
      urgent: false,
      title:
        item.kind === "swap"
          ? `${item.owner_name ?? "Somebody"} wants to swap a shift`
          : item.owner_id === null
            ? "Somebody asked for an open shift"
            : `${item.owner_name ?? "Somebody"} wants a shift covered`,
      detail: `${shortDate(item.shift.scheduled_date)} · ${item.shift.job_name}`,
      cta: item.kind === "swap" ? "Review swap" : "Review cover",
      href: `/app/schedule/requests?case=${item.id}`,
      locationIds: inView.has(item.shift.location_id) ? [item.shift.location_id] : [],
    }),
  );
  const publish = home.locations.flatMap((location): ManagerNeed[] => {
    const days = location.week.filter((day) => !day.published);
    if (!days.length) return [];
    return [
      {
        id: `publish:${location.id}`,
        kind: "publish",
        urgent: false,
        title: days.length === 7 ? "The next 7 days aren’t published" : `${plural(days.length, "day")} of the next 7 ${days.length === 1 ? "isn’t" : "aren’t"} published`,
        detail: `${dateRange(days[0]!.date, days[days.length - 1]!.date)} · ${location.name}`,
        cta: phone ? "Publish from a computer" : "Open Schedule",
        href: phone ? null : `/app/schedule?date=${days[0]!.date}`,
        locationIds: [location.id],
      },
    ];
  });
  return [...docs, ...timeOff, ...swaps, ...publish];
}

/** One location's share: a request about somebody who works at two shows at both. */
export const needsAt = (needs: readonly ManagerNeed[], locationId: string) =>
  needs.filter((need) => need.locationIds.includes(locationId));

export type NeedGroup = { readonly id: string; readonly name: string; readonly needs: readonly ManagerNeed[] };

/**
 * "All locations": a heading per location in the cards' order, each need once,
 * under the first of its locations; what belongs to none in view goes last.
 */
export function groupNeeds(needs: readonly ManagerNeed[], locations: readonly { id: string; name: string }[]): NeedGroup[] {
  const order = locations.map((location) => location.id);
  const groups = locations.map((location) => ({ id: location.id, name: location.name, needs: [] as ManagerNeed[] }));
  const other: ManagerNeed[] = [];
  for (const need of needs) {
    const first = order.find((id) => need.locationIds.includes(id));
    if (first) groups.find((group) => group.id === first)!.needs.push(need);
    else other.push(need);
  }
  return [...groups, { id: "other", name: "Other", needs: other }].filter((group) => group.needs.length);
}

export type LocationBadge = { readonly tone: "danger" | "warn" | "ok"; readonly text: string; readonly label: string };

export function locationBadge(location: ManagerHomeLocation, needs: readonly ManagerNeed[]): LocationBadge {
  const people = new Set(location.missing_documents.map((item) => item.employee_id)).size;
  if (people)
    return {
      tone: "danger",
      text: plural(people, "document"),
      label: `${plural(people, "person", "people")} working without a required document`,
    };
  const count = needsAt(needs, location.id).length;
  if (count) return { tone: "warn", text: `${count} need you`, label: `${plural(count, "thing")} need you here` };
  return { tone: "ok", text: "All clear", label: "Nothing needs you here" };
}

/** The greeting's second line. */
export function homeSubline(people: number, locations: readonly { name: string }[], needs: number): string {
  const where = locations.length === 1 ? `at ${locations[0]!.name}` : `across ${plural(locations.length, "location")}`;
  const floor = `${plural(people, "person", "people")} on the floor ${where}.`;
  return needs ? `${floor} ${plural(needs, "thing")} ${needs === 1 ? "needs" : "need"} you.` : `${floor} Nothing needs you right now.`;
}

export type HomeLine = {
  readonly id: string;
  readonly icon: "published" | "approved" | "declined" | "joined" | "closed" | "off" | "draft";
  readonly title: string;
  readonly detail: string;
  /** Coming up's date tile. */
  readonly month?: string;
  readonly day?: string;
};

const placeNames = (ids: readonly string[], locations: readonly { id: string; name: string }[]) => {
  const names = locations.filter((location) => ids.includes(location.id)).map((location) => location.name);
  return names.length && names.length === locations.length && locations.length > 1 ? "All locations" : names.join(", ");
};
const joined = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const requestNoun = { time_off: "time off", swap: "swap", cover: "cover request" } as const;

/** Updates (S-225), one line each; the location shows only where there is more than one. */
export function updateLines(updates: readonly ManagerHomeUpdate[], locations: readonly { id: string; name: string }[]): HomeLine[] {
  const multi = locations.length > 1;
  const where = (ids: readonly string[]) => (multi ? placeNames(ids, locations) : "");
  return updates.map((item): HomeLine => {
    if (item.kind === "published")
      return {
        id: item.id,
        icon: "published",
        title: multi ? `Schedule published · ${placeNames(item.location_ids, locations)}` : "Schedule published",
        detail: joined(dateRange(item.first_date, item.last_date), plural(item.shifts, "shift"), item.by ? `by ${item.by}` : null),
      };
    if (item.kind === "joined")
      return { id: item.id, icon: "joined", title: `${item.person} joined${multi ? ` ${placeNames(item.location_ids, locations)}` : ""}`, detail: "Accepted the invitation" };
    return {
      id: item.id,
      icon: item.approved ? "approved" : "declined",
      title: `${item.person}’s ${requestNoun[item.kind]} was ${item.approved ? "approved" : "declined"}`,
      detail: joined(dateRange(item.first_date, item.last_date), where(item.location_ids), item.by ? `by ${item.by}` : null),
    };
  });
}

/** Coming up (S-225), one line each with the first day on its tile. */
export function comingLines(coming: readonly ManagerHomeComing[], locations: readonly { id: string; name: string }[]): HomeLine[] {
  const multi = locations.length > 1;
  return coming.map((item): HomeLine => {
    const tile = new Date(`${item.first_date}T12:00:00Z`);
    const month = tile.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    const day = String(tile.getUTCDate());
    const where = placeNames(item.location_ids, locations);
    if (item.kind === "closed") return { id: item.id, icon: "closed", title: `Closed · ${item.name}`, detail: joined(dateRange(item.first_date, item.last_date), multi ? where : null), month, day };
    if (item.kind === "time_off") return { id: item.id, icon: "off", title: `${item.person} is off`, detail: joined(dateRange(item.first_date, item.last_date), multi ? where : null), month, day };
    return { id: item.id, icon: "draft", title: "Not published yet", detail: joined(dateRange(item.first_date, item.last_date), multi ? where : null), month, day };
  });
}
