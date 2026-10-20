import type {
  AnnouncementCategory,
  AnnouncementDay,
  AnnouncementDetail,
  AnnouncementDisplayStatus,
  AnnouncementDraft,
  AnnouncementImpactShift,
  AnnouncementIntent,
  AnnouncementList,
  AnnouncementPreview,
  AnnouncementProblem,
  AnnouncementRecord,
  AnnouncementRecurrence,
  AnnouncementShiftChoice,
} from "@newfork/shared";
import { announcementCategoryLabel, announcementCategoryLabels } from "../lib/announcementCategories";

/**
 * The one announcement record (EKRAN-08) as the list and the drawer show it:
 * pure helpers, so the screens stay thin and every wording is tested here.
 * The server decides what keeps a post from going out (preview problems);
 * nothing here re-checks a database rule.
 */

export type TimeFormat = "12h" | "24h";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdaysLong = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthsLong = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const utcDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date!));
};
const isoDay = (value: Date) => value.toISOString().slice(0, 10);
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Thu, Nov 26", with ", 2026" when asked. */
export function dayText(day: string, withYear = false): string {
  const value = utcDay(day);
  return `${weekdays[value.getUTCDay()]}, ${months[value.getUTCMonth()]} ${value.getUTCDate()}${
    withYear ? `, ${value.getUTCFullYear()}` : ""
  }`;
}

/** "Thu, Nov 26" or "Thu, Nov 26 – Fri, Nov 27". */
export function rangeText(start: string, end: string | null): string {
  return !end || end === start ? dayText(start) : `${dayText(start)} – ${dayText(end)}`;
}

const minutesOf = (clock: string) => {
  const [hour, minute] = clock.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
};

/** "3:00 PM" or "15:00", in the workspace's clock. */
export function clockText(clock: string, timeFormat: TimeFormat): string {
  const total = minutesOf(clock) % 1440;
  const hour = Math.floor(total / 60);
  const minute = String(total % 60).padStart(2, "0");
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}:${minute}`;
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

/** "4:00 PM–10:00 PM" or "16:00–22:00": both ends name their half (Mert, 2026-10-12). */
export function hoursText(from: string, until: string, timeFormat: TimeFormat): string {
  return `${clockText(from, timeFormat)}–${clockText(until, timeFormat)}`;
}

/** Closing at or before opening runs into the next day. */
export function closesNextDay(opens: string, closes: string): boolean {
  return minutesOf(closes) <= minutesOf(opens);
}

function wallParts(moment: number, zone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(moment))
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}` };
}

/** A moment as the wall clock in `zone` reads it: "2026-11-01T09:00" (a datetime-local value). */
export function zonedWall(iso: string, zone: string): string {
  const { day, clock } = wallParts(Date.parse(iso), zone);
  return `${day}T${clock}`;
}

/**
 * The moment a wall clock in `zone` names (the datetime-local box), or null
 * when the box is empty or half filled. A clock the zone skips (spring
 * forward) lands just after the gap.
 */
export function zonedMoment(wall: string, zone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall)) return null;
  const target = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(target)) return null;
  let guess = target;
  for (let step = 0; step < 3; step += 1) {
    const read = wallParts(guess, zone);
    const drift = Date.parse(`${read.day}T${read.clock}:00Z`) - target;
    if (!drift) break;
    guess -= drift;
  }
  return new Date(guess).toISOString();
}

/** "Sun, Nov 1, 9:00 AM" in the post's zone. */
export function momentText(iso: string, zone: string, timeFormat: TimeFormat): string {
  const { day, clock } = wallParts(Date.parse(iso), zone);
  return `${dayText(day)}, ${clockText(clock, timeFormat)}`;
}

/** The calendar day a moment falls on in `zone`. */
export function momentDay(iso: string, zone: string): string {
  return wallParts(Date.parse(iso), zone).day;
}

// ---------- repeats (every year on the date, the nth or the last weekday) ----------

export function repeatOptions(start: string | null): { value: AnnouncementRecurrence; label: string }[] {
  const options: { value: AnnouncementRecurrence; label: string }[] = [{ value: "none", label: "Never" }];
  if (!start) return options;
  const value = utcDay(start);
  const date = value.getUTCDate();
  const weekday = weekdaysLong[value.getUTCDay()]!;
  const month = monthsLong[value.getUTCMonth()]!;
  const nth = Math.ceil(date / 7);
  options.push({ value: "date", label: `Every year on ${months[value.getUTCMonth()]} ${date}` });
  if (nth <= 4)
    options.push({
      value: "nth",
      label: `Every year on the ${["", "1st", "2nd", "3rd", "4th"][nth]} ${weekday} of ${month}`,
    });
  if (date + 7 > daysIn(value.getUTCFullYear(), value.getUTCMonth()))
    options.push({ value: "last", label: `Every year on the last ${weekday} of ${month}` });
  return options;
}

/** Next year's day for a repeat: the same date (Feb 29 → 28), the same nth weekday, or the last one. */
export function nextYearDay(start: string, mode: AnnouncementRecurrence): string | null {
  const value = utcDay(start);
  const year = value.getUTCFullYear() + 1;
  const month = value.getUTCMonth();
  const date = value.getUTCDate();
  const weekday = value.getUTCDay();
  if (mode === "date") return isoDay(new Date(Date.UTC(year, month, Math.min(date, daysIn(year, month)))));
  if (mode === "nth") {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return isoDay(new Date(Date.UTC(year, month, 1 + ((weekday - first + 7) % 7) + (Math.ceil(date / 7) - 1) * 7)));
  }
  if (mode === "last") {
    const last = daysIn(year, month);
    const lastWeekday = new Date(Date.UTC(year, month, last)).getUTCDay();
    return isoDay(new Date(Date.UTC(year, month, last - ((lastWeekday - weekday + 7) % 7))));
  }
  return null;
}

// ---------- status ----------

export const statusLabels: Record<AnnouncementDisplayStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Unpublished",
  publish_failed: "Couldn't publish",
  past: "Past",
  archived: "Archived",
};

export type StatusTone = "green" | "blue" | "gray" | "red" | "past";
export const statusTones: Record<AnnouncementDisplayStatus, StatusTone> = {
  draft: "gray",
  scheduled: "blue",
  published: "green",
  unpublished: "gray",
  publish_failed: "red",
  past: "past",
  archived: "gray",
};

/** A published Important Date whose first day has come: the list marks it "Today". */
export function isUnderway(
  record: Pick<AnnouncementRecord, "display_status" | "on_important_dates" | "starts_at">,
  now = Date.now(),
): boolean {
  return (
    record.display_status === "published" &&
    record.on_important_dates &&
    record.starts_at !== null &&
    Date.parse(record.starts_at) <= now
  );
}

/** It has gone out and its first day has come: only the text, the people, the boxes and Ends change. */
export function hasStarted(
  record: Pick<AnnouncementRecord, "status" | "starts_at">,
  now = Date.now(),
): boolean {
  return record.status === "published" && record.starts_at !== null && Date.parse(record.starts_at) <= now;
}

// ---------- the list ----------

export type ListTab = "all" | "draft" | "scheduled" | "published" | "archived";
export const listTabs: { id: ListTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "archived", label: "Archived" },
];

/** Draft holds unpublished ones, Scheduled the ones that couldn't publish, Published the past ones; All leaves out Archived. */
export function inListTab(record: Pick<AnnouncementRecord, "display_status">, tab: ListTab): boolean {
  const status = record.display_status;
  if (tab === "all") return status !== "archived";
  if (tab === "draft") return status === "draft" || status === "unpublished";
  if (tab === "scheduled") return status === "scheduled" || status === "publish_failed";
  if (tab === "published") return status === "published" || status === "past";
  return status === "archived";
}

/**
 * "Published on": the moment it went out; a scheduled one (or one that
 * couldn't publish) shows its planned moment in grey; never published, a dash.
 */
export function publishedOn(
  record: Pick<AnnouncementRecord, "display_status" | "published_at" | "publish_at">,
): { at: string | null; planned: boolean } {
  const planned = record.display_status === "scheduled" || record.display_status === "publish_failed";
  if (planned) return { at: record.publish_at, planned: true };
  return { at: record.published_at, planned: false };
}

export type SortKey = "status" | "title" | "category" | "starts" | "ends" | "published_on";
export type ListSort = { key: SortKey; direction: 1 | -1 };
export const defaultSort: ListSort = { key: "published_on", direction: -1 };

/** The first press sorts A to Z (dates: newest first); the next one turns it around. */
export function nextSort(current: ListSort, key: SortKey): ListSort {
  if (current.key === key) return { key, direction: current.direction === 1 ? -1 : 1 };
  return { key, direction: dateKeys.has(key) ? -1 : 1 };
}

const dateKeys: ReadonlySet<SortKey> = new Set(["starts", "ends", "published_on"]);

const publishedMoment = (record: AnnouncementRecord) => {
  const at = publishedOn(record).at;
  return at ? Date.parse(at) : null;
};

/** The moment a sort by date compares: published, first day, or last day. */
function sortMoment(record: AnnouncementRecord, key: SortKey): number | null {
  if (key === "published_on") return publishedMoment(record);
  const day = key === "starts" ? record.starts_on : (record.ends_on ?? record.starts_on);
  return day ? Date.parse(`${day}T00:00:00Z`) : null;
}

/** Empty dates stay at the bottom either way; ties go newest first. */
export function sortRecords(rows: readonly AnnouncementRecord[], sort: ListSort): AnnouncementRecord[] {
  const text = (record: AnnouncementRecord) =>
    sort.key === "status"
      ? statusLabels[record.display_status].toLowerCase()
      : sort.key === "category"
        ? announcementCategoryText(record).toLowerCase()
        : (record.title || "Untitled").toLowerCase();
  const byMoment = (a: AnnouncementRecord, b: AnnouncementRecord) => {
    const x = publishedMoment(a);
    const y = publishedMoment(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x;
  };
  return [...rows].sort((a, b) => {
    if (dateKeys.has(sort.key)) {
      const x = sortMoment(a, sort.key);
      const y = sortMoment(b, sort.key);
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1;
      } else if (x !== y) return (x - y) * sort.direction;
    } else {
      const compared = text(a).localeCompare(text(b), "en", { numeric: true, sensitivity: "base" });
      if (compared) return compared * sort.direction;
    }
    return byMoment(a, b) || a.id.localeCompare(b.id);
  });
}

// ---------- days ----------

type DayLocation = Pick<AnnouncementRecord["locations"][number], "name" | "short_name" | "day" | "opens" | "closes">;
const placeName = (location: DayLocation) => location.short_name || location.name;

/** "Thu, Nov 26" for an all-day date, "Thu, Nov 26 · 3:00 PM" when it has a time. */
export function momentLabel(day: string, clock: string | null, timeFormat: TimeFormat): string {
  return clock ? `${dayText(day)} · ${clockText(clock, timeFormat)}` : dayText(day);
}

/** Closed somewhere (red), shorter hours somewhere (amber), or neither. */
export function dayTone(record: Pick<AnnouncementRecord, "locations">): "red" | "amber" | null {
  if (record.locations.some((location) => location.day === "closed")) return "red";
  if (record.locations.some((location) => location.day === "short")) return "amber";
  return null;
}

/**
 * A line on the employee's Home: "Downtown closed · Thu, Nov 26" where it
 * changes their location's day, else the title; the second line says why.
 */
export function comingUp(
  record: AnnouncementRecord,
  myLocationIds: readonly string[],
  timeFormat: TimeFormat,
): { line: string; sub: string } {
  const range = record.starts_on ? rangeText(record.starts_on, record.ends_on) : "";
  const mine = record.locations.find((location) => myLocationIds.includes(location.location_id));
  const category = announcementCategoryText(record);
  if (mine && mine.day === "closed")
    return { line: `${placeName(mine)} closed · ${range}`, sub: record.title };
  if (mine && mine.day === "short" && mine.opens && mine.closes)
    return {
      line: `${placeName(mine)} open ${hoursText(mine.opens, mine.closes, timeFormat)} · ${range}`,
      sub: record.title,
    };
  return {
    line: `${record.title} · ${range}`,
    sub: mine ? `${placeName(mine)} keeps its usual hours` : category,
  };
}

export const announcementCategories = Object.entries(announcementCategoryLabels).map(([value, label]) => ({
  value: value as AnnouncementCategory,
  label,
}));
export function announcementCategoryText(record: Pick<AnnouncementRecord, "category" | "category_other">): string {
  return announcementCategoryLabel(record.category, record.category_other);
}

// ---------- the drawer's draft ----------

/**
 * Details holds the locations and publishing too; Shifts shows only when a
 * shift is reached and History only once it was published (Mert, 2026-10-12).
 */
export type DrawerTab = "details" | "aud" | "shifts" | "history";

/** The server still names the old Locations & publishing tab; its fields live on Details now. */
export function onDrawerTabs(preview: AnnouncementPreview): AnnouncementPreview {
  if (!preview.problems.some((problem) => problem.tab === "where")) return preview;
  return {
    ...preview,
    problems: preview.problems.map((problem) => (problem.tab === "where" ? { ...problem, tab: "details" } : problem)),
  };
}

/** Under the drawer's title: "Holiday · Sun, Jul 4, 2027 · Every year". */
export function headerLine(
  draft: Pick<AnnouncementDraft, "category" | "category_other" | "starts_on" | "ends_on" | "recurrence">,
): string {
  const parts = [announcementCategoryLabel(draft.category, draft.category_other)];
  const { starts_on: start } = draft;
  if (start) {
    const end = draft.ends_on && draft.ends_on !== start ? draft.ends_on : null;
    if (!end) parts.push(dayText(start, true));
    else parts.push(`${dayText(start, start.slice(0, 4) !== end.slice(0, 4))} – ${dayText(end, true)}`);
  }
  if (draft.recurrence !== "none") parts.push("Every year");
  return parts.join(" · ");
}

/** The post as the drawer edits it, from what the server stored. */
export function draftFromRecord(record: AnnouncementDetail): AnnouncementDraft {
  const choices: Record<string, AnnouncementShiftChoice> = {};
  for (const [sourceId, value] of Object.entries(record.shift_choices ?? {})) {
    const picked = value as { choice?: string; from?: string; until?: string } | null;
    if (picked?.choice === "edit" && picked.from && picked.until)
      choices[sourceId] = { choice: "edit", from: picked.from, until: picked.until };
    else if (picked?.choice === "keep" || picked?.choice === "remove" || picked?.choice === "open")
      choices[sourceId] = { choice: picked.choice };
  }
  return {
    title: record.title,
    body: record.body,
    category: record.category,
    category_other: record.category_other,
    starts_on: record.starts_on,
    ends_on: record.ends_on,
    event_from: record.event_from,
    event_until: record.event_until,
    recurrence: record.recurrence,
    on_important_dates: record.on_important_dates,
    on_calendar: record.on_calendar,
    on_schedule: record.on_schedule,
    ask_ack: record.ask_ack,
    publish_at: record.display_status === "publish_failed" ? null : record.publish_at,
    time_zone: record.time_zone,
    locations: record.locations
      .filter((location) => !location.archived)
      .map(({ location_id, day, opens, closes }) => ({ location_id, day, opens, closes })),
    people: (record.people ?? []).map((person) => person.user_id),
    choices,
    fingerprint: null,
    bring_back: [],
  };
}

/** A new post; from Important Dates it starts as a holiday on every list. */
export function newDraft(
  list: Pick<AnnouncementList, "locations" | "can_write_dates">,
  importantDate: boolean,
  timeZone: string,
): AnnouncementDraft {
  const dates = importantDate && list.can_write_dates;
  return {
    title: "",
    body: "",
    category: dates ? "holiday" : "general",
    category_other: null,
    starts_on: null,
    ends_on: null,
    event_from: null,
    event_until: null,
    recurrence: "none",
    on_important_dates: dates,
    on_calendar: dates,
    on_schedule: dates,
    ask_ack: false,
    publish_at: null,
    time_zone: timeZone,
    // A manager writes for their one location (K1): a new post starts there.
    locations:
      list.locations.length === 1
        ? [{ location_id: list.locations[0]!.id, day: "open", opens: null, closes: null }]
        : [],
    people: [],
    choices: {},
    fingerprint: null,
    bring_back: [],
  };
}

/** The same post: what changed only counts once it changes what gets saved. */
export function draftKey(draft: AnnouncementDraft): string {
  return JSON.stringify({
    ...draft,
    title: draft.title.trim(),
    body: draft.body.trim(),
    category_other: draft.category_other?.trim() || null,
    locations: [...draft.locations].sort((a, b) => a.location_id.localeCompare(b.location_id)),
    people: [...draft.people].sort(),
    choices: Object.fromEntries(Object.entries(draft.choices).sort(([a], [b]) => a.localeCompare(b))),
    bring_back: [...draft.bring_back].sort(),
    fingerprint: null,
  });
}

/**
 * What the server reads: trimmed text, Other's name only with Other. With the
 * preview it was checked against, the choices are the listed shifts' and the
 * fingerprint says which list the person saw.
 */
export function draftToSend(draft: AnnouncementDraft, preview?: AnnouncementPreview): AnnouncementDraft {
  const listed = preview ? new Set(preview.shifts.map((shift) => shift.source_id)) : null;
  return {
    ...draft,
    title: draft.title.trim(),
    body: draft.body.trim(),
    category_other: draft.category === "other" ? draft.category_other?.trim() || null : null,
    choices: listed
      ? Object.fromEntries(Object.entries(draft.choices).filter(([sourceId]) => listed.has(sourceId)))
      : draft.choices,
    fingerprint: preview?.fingerprint ?? null,
  };
}

/** Closed or Short hours at a checked location: shifts follow. */
export function changesHours(draft: Pick<AnnouncementDraft, "locations">): boolean {
  return draft.locations.some((location) => location.day !== "open");
}

/** A new post or a draft walks its tabs with Next (Mert, 2026-10-12). */
export function isWizard(status: AnnouncementDisplayStatus | null): boolean {
  return status === null || status === "draft";
}

export function wizardSteps(shifts: boolean): DrawerTab[] {
  return ["details", "aud", ...(shifts ? (["shifts"] as const) : [])];
}

/** The first earlier step that still needs something, which keeps `tab` locked. */
export function stepBefore(
  wizard: boolean,
  steps: readonly DrawerTab[],
  problems: readonly AnnouncementProblem[],
  tab: DrawerTab,
): DrawerTab | null {
  if (!wizard) return null;
  const index = steps.indexOf(tab);
  if (index < 0) return null;
  return steps.slice(0, index).find((step) => problems.some((problem) => problem.tab === step)) ?? null;
}

export function nextStepAfter(wizard: boolean, steps: readonly DrawerTab[], tab: DrawerTab): DrawerTab | null {
  if (!wizard) return null;
  const index = steps.indexOf(tab);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1]! : null;
}

/**
 * Every problem sits next to its field; an empty required field shows only
 * after a Publish or Schedule try, after a dim Next on its tab, or (the title)
 * after Save draft.
 */
export function shownProblems(
  problems: readonly AnnouncementProblem[],
  tried: boolean | "draft",
  triedTabs: ReadonlySet<string>,
): AnnouncementProblem[] {
  return problems.filter(
    (problem) =>
      !problem.required ||
      tried === true ||
      triedTabs.has(problem.tab) ||
      (tried === "draft" && problem.field === "title"),
  );
}

export type MainAction = { intent: AnnouncementIntent; label: string; verb: string };

/** The green button: Save changes, Publish, Schedule, Publish now, or Save as draft. */
export function mainAction(
  status: AnnouncementDisplayStatus | null,
  later: boolean,
  publishAt: string | null,
): MainAction {
  if (status === "published") return { intent: "save", label: "Save changes", verb: "save" };
  if (status === "scheduled") {
    if (!later) return { intent: "publish", label: "Publish", verb: "publish" };
    if (!publishAt) return { intent: "draft", label: "Save as draft", verb: "" };
    return { intent: "schedule", label: "Save changes", verb: "schedule" };
  }
  if (status === "publish_failed" && !later) return { intent: "publish", label: "Publish now", verb: "publish" };
  return later
    ? { intent: "schedule", label: "Schedule", verb: "schedule" }
    : { intent: "publish", label: "Publish", verb: "publish" };
}

type ShiftCounts = Pick<AnnouncementPreview["counts"], "removed" | "edited" | "opened" | "kept">;

/**
 * The Shifts tab's count: every shift its days reach (the reference's round
 * badge, Mert 2026-10-12), yellow when one is removed, shortened or opened.
 * No count, no Shifts tab.
 */
export function shiftBadge(
  counts: ShiftCounts | null,
  bringBack: number,
  changed: number,
): { count: number; warn: boolean } | null {
  const count = (counts ? counts.removed + counts.edited + counts.opened + counts.kept : 0) + bringBack + changed;
  if (!count) return null;
  return { count, warn: counts !== null && counts.removed + counts.edited + counts.opened > 0 };
}

/** The band over the drawer's buttons: "2 shifts will be removed · 4 kept"; none when no shift is reached. */
export function shiftBand(
  counts: ShiftCounts | null,
  bringBack: number,
): { tone: "warn" | "ok" | "calm"; text: string } | null {
  if (counts && counts.removed + counts.edited + counts.opened + counts.kept > 0) {
    if (!(counts.removed + counts.edited + counts.opened))
      return { tone: "ok", text: `No shift changes · ${counts.kept} kept` };
    const parts: string[] = [];
    if (counts.removed) parts.push(`${plural(counts.removed, "shift")} will be removed`);
    if (counts.edited)
      parts.push(parts.length ? `${counts.edited} shortened` : `${plural(counts.edited, "shift")} will be shortened`);
    if (counts.opened)
      parts.push(
        parts.length
          ? `${counts.opened} become${counts.opened === 1 ? "s" : ""} open`
          : `${plural(counts.opened, "shift")} will become ${counts.opened === 1 ? "an open shift" : "open shifts"}`,
      );
    if (counts.kept) parts.push(`${counts.kept} kept`);
    return { tone: "warn", text: parts.join(" · ") };
  }
  if (bringBack) return { tone: "calm", text: `${plural(bringBack, "removed shift")} can come back` };
  return null;
}

/** A location row's shift line, at the right of its day. */
export function locationImpact(
  row: { day: AnnouncementDay } | null,
  hasDay: boolean,
  shifts: readonly { outcome: AnnouncementImpactShift["outcome"] }[] | null,
): { text: string; tone?: "red" | "amber" } {
  if (!row) return { text: "—" };
  if (row.day === "open") return { text: "Usual hours" };
  if (!hasDay) return { text: "Pick a day" };
  if (!shifts) return { text: "" };
  if (!shifts.length) return { text: "All fit" };
  const counts = { removed: 0, edited: 0, opened: 0, kept: 0 };
  for (const shift of shifts) counts[shift.outcome] += 1;
  const text = [
    counts.removed && `${counts.removed} removed`,
    counts.edited && `${counts.edited} shortened`,
    counts.opened && `${counts.opened} open`,
    counts.kept && `${counts.kept} kept`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (counts.removed) return { text, tone: "red" };
  if (counts.edited || counts.opened) return { text, tone: "amber" };
  return { text };
}

/** Why a listed shift is listed. */
export function shiftReason(
  shift: Pick<AnnouncementPreview["shifts"][number], "reason" | "start_time" | "end_time" | "opens" | "closes">,
): string {
  if (shift.reason === "closed") return "Location closed";
  if (shift.reason === "prep") return "Ends before opening (prep)";
  if (shift.reason === "after_close") return "Starts after closing";
  if (!shift.opens || !shift.closes) return "Outside the hours";
  const opens = minutesOf(shift.opens);
  let closes = minutesOf(shift.closes);
  if (closes <= opens) closes += 1440;
  const start = minutesOf(shift.start_time);
  let end = minutesOf(shift.end_time);
  if (end <= start) end += 1440;
  const length = (minutes: number) =>
    minutes % 60 ? `${(minutes / 60).toFixed(1).replace(".0", "")} h` : `${minutes / 60} h`;
  const parts: string[] = [];
  if (start < opens) parts.push(`starts ${length(opens - start)} before opening`);
  if (end > closes) parts.push(`runs ${length(end - closes)} past closing`);
  const text = parts.join(", ") || "outside the hours";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Fit to hours: the part of the shift inside the day's hours. */
export function fitToHours(
  shift: Pick<AnnouncementPreview["shifts"][number], "start_time" | "end_time" | "opens" | "closes">,
): { from: string; until: string } | null {
  if (!shift.opens || !shift.closes) return null;
  const opens = minutesOf(shift.opens);
  let closes = minutesOf(shift.closes);
  if (closes <= opens) closes += 1440;
  const start = minutesOf(shift.start_time);
  let end = minutesOf(shift.end_time);
  if (end <= start) end += 1440;
  const from = Math.max(start, opens);
  const until = Math.min(end, closes);
  if (until <= from) return null;
  const clock = (minutes: number) => {
    const value = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  };
  return { from: clock(from), until: clock(until) };
}

/** Initials for a shift row's avatar. */
export function initials(name: string | null): string {
  if (!name) return "◌";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ---------- history ----------

type HistoryEntry = NonNullable<AnnouncementDetail["history"]>[number];

const failureReasons: Record<string, string> = {
  not_allowed: "Whoever scheduled it can't publish it there anymore.",
  too_late: "It started before it could go out.",
  nobody: "Nobody else would get it when it was due.",
  failed: "Something went wrong when it was due.",
};

/** One step of the History tab: what happened (head), the rest under it, and whether it took something away. */
export function historyStep(
  entry: HistoryEntry,
  zone: string,
  timeFormat: TimeFormat,
): { head: string; more: string; bad: boolean } {
  const who = entry.actor_name ?? "Someone";
  const detail = entry.detail as Record<string, unknown>;
  const count = (key: string) => (typeof detail[key] === "number" ? (detail[key] as number) : 0);
  const more: string[] = [];
  const shiftChanges = count("shift_changes");
  const told = count("told");
  const back = count("brought_back");
  let head: string;
  switch (entry.action) {
    case "created":
      head = `Created by ${who}`;
      break;
    case "saved":
      head = `Saved as draft by ${who}`;
      break;
    case "scheduled": {
      const at = typeof detail.publish_at === "string" ? momentText(detail.publish_at, zone, timeFormat) : "later";
      head = `${detail.rescheduled ? "Changed" : "Scheduled"} by ${who} for ${at}`;
      break;
    }
    case "unscheduled":
      head = `Unscheduled by ${who}: back to Draft`;
      break;
    case "published":
      if (detail.auto) {
        head = "Published at the scheduled time";
        more.push(`scheduled by ${who}`);
      } else head = `Published by ${who}`;
      if (shiftChanges) more.push(plural(shiftChanges, "shift change"));
      more.push(plural(told, "person", "people"));
      break;
    case "updated":
      head = `Changed by ${who}`;
      if (shiftChanges) more.push(plural(shiftChanges, "shift change"));
      if (back) more.push(`${plural(back, "shift")} brought back`);
      break;
    case "unpublished":
      head = `Unpublished by ${who}`;
      if (told) more.push(plural(told, "person", "people"));
      break;
    case "brought_back":
      head = `Brought back by ${who}`;
      if (back) more.push(plural(back, "shift"));
      break;
    case "archived":
      head = `Archived by ${who}`;
      break;
    case "publish_failed":
      head = "Couldn't publish";
      more.push(failureReasons[String(detail.code)] ?? failureReasons.failed!);
      break;
    case "repeated":
      head = "Made from last year's post";
      break;
    case "reminded":
      head = `Reminded by ${who}`;
      if (told) more.push(plural(told, "person", "people"));
      break;
  }
  return {
    head,
    more: more.join(" · "),
    bad: entry.action === "unpublished" || entry.action === "archived" || entry.action === "publish_failed",
  };
}

/** Why a scheduled one couldn't publish, for its banner. */
export function failureReason(code: AnnouncementRecord["publish_error_code"]): string {
  return failureReasons[code ?? "failed"] ?? failureReasons.failed!;
}
