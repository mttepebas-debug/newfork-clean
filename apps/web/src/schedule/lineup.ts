import type { LineupDay, LineupDayLineup, LineupTarget } from "@newfork/shared";
import type { ScheduleReadModel } from "@newfork/shared/schedule";

import { formatTime, type ScheduleTimeFormat } from "./lib/scheduleDateTime";

// Lineup (Mert 2026-10-13): the day's lineups, per location and shift type, then by department and job.
// The rows and the publish state come from the lineup day read (LINEUP-PUBLISH-WEB: the live Schedule with
// what the lineup changed, the one source employees see too); the Schedule read only gives the catalog
// around it (every shift type gets a place, the week, the time format). Nothing here decides who works.

export interface LineupRow {
  readonly shiftId: string;
  /** What an edit names (LINEUP-EDIT W2a): the lineup's own row once it has one, and the Schedule shift it comes from. */
  readonly rowId: string | null;
  readonly sourceShiftId: string | null;
  readonly jobId: string | null;
  readonly labelIds: readonly string[];
  /** One of the location's sections; null with none or with a name typed in this lineup only ("Other…"). */
  readonly sectionId: string | null;
  readonly employeeId: string;
  readonly name: string;
  readonly jobName: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly crossesMidnight: boolean;
  /** The Schedule's In and Out for this row, when it comes from the Schedule. */
  readonly scheduleStartTime: string | null;
  readonly scheduleEndTime: string | null;
  readonly labels: readonly string[];
  /** Where on the floor (the lineup's own), if set. */
  readonly sectionName: string | null;
  /** Added on the lineup, not in the Schedule. */
  readonly lineupOnly: boolean;
  /** What the lineup changed against the Schedule. */
  readonly changed: readonly string[];
  /** The person can sign in (counted in "Read"). */
  readonly hasApp: boolean;
  /** When she acknowledged the version staff see, if she did. */
  readonly acknowledgedAt: string | null;
}

export interface LineupJob {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly rows: readonly LineupRow[];
}

export interface LineupDepartment {
  readonly id: string | null;
  readonly name: string;
  readonly jobs: readonly LineupJob[];
}

/** Where a lineup stands for its staff (LINEUP-PUBLISH). */
export interface LineupPublish {
  /** The lineup a command names. */
  readonly target: LineupTarget;
  readonly status: LineupDayLineup["status"];
  /** Employees see it now. */
  readonly published: boolean;
  readonly sharedAt: string | null;
  readonly sharedByName: string | null;
  readonly askAck: boolean;
  /** Acknowledged of the version staff see, and how many on it have the app ("Read 7/11"). */
  readonly acknowledged: number;
  readonly withApp: number;
  /** Everybody on it; those without the app are not counted in "Read". */
  readonly people: number;
  readonly notes: LineupDayLineup["notes"];
}

export interface LineupShift {
  /** The shift type's id, or "none" for shifts that have no shift type. */
  readonly key: string;
  readonly name: string;
  readonly color: string | null;
  readonly departments: readonly LineupDepartment[];
  readonly count: number;
  readonly publish: LineupPublish;
}

export interface LineupClosure {
  readonly title: string;
  readonly opens?: string | null;
  readonly closes?: string | null;
}

export interface LineupLocation {
  readonly id: string;
  readonly name: string;
  /** The location's IANA time zone: its own clock says when a shift has started. */
  readonly timezone: string;
  /** A published closed day: the location has no lineup. */
  readonly closed: LineupClosure | null;
  /** Published short hours that day. */
  readonly shortHours: LineupClosure | null;
  readonly shifts: readonly LineupShift[];
  /** The location's sections, in their order: every Section list there (S-178 madde 4). */
  readonly sections: readonly LineupSection[];
}

export interface LineupSection {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
}

const NO_SHIFT_TYPE = "none";
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en-US", { sensitivity: "base" });

/** Postgres-style HH:MM compares as text; an empty time sorts last. */
function startKey(time: string): string {
  return time || "99:99";
}

const published = <T extends { readonly status: string | null }>(closure: T | null): T | null =>
  closure && (closure.status ?? "published") === "published" ? closure : null;

function emptyLineup(typeId: string | null): LineupDayLineup {
  return {
    id: null, shift_type_id: typeId, shift_type_name: null, color: null, status: "draft", version: null,
    shared_at: null, ask_ack: null, acknowledged: null, revision: null, published: false, version_id: null,
    shared_by: null, shared_by_name: null, people: 0, with_app: 0,
    notes: { specials: "", n86: "", shift_notes: "" }, rows: [],
  };
}

/**
 * The day's lineups as the page shows them: the day read's rows grouped by department and job, every active
 * shift type of the catalog in its place (Mert 2026-10-13: an empty shift stays as a short card).
 */
export function lineupDay(
  read: LineupDay,
  catalog: Pick<ScheduleReadModel, "shift_types"> | null,
): LineupLocation[] {
  const types = catalog?.shift_types ?? [];
  return read.locations
    .map((location) => {
      const closed = published(location.closed);
      const byType = new Map(location.lineups.map((lineup) => [lineup.shift_type_id ?? NO_SHIFT_TYPE, lineup]));
      if (!closed) for (const type of types) if (!byType.has(type.id)) byType.set(type.id, emptyLineup(type.id));
      const shifts = closed ? [] : [...byType.entries()]
        .map(([key, lineup]) => {
          const type = types.find((item) => item.id === key);
          const rows = lineup.rows.filter((row) => row.employee_id !== null);
          const byDepartment = new Map<string | null, { name: string; jobs: Map<string, { name: string; color: string | null; rows: LineupRow[] }> }>();
          for (const row of rows) {
            const department = byDepartment.get(row.department_id) ??
              { name: row.department_id ? row.department_name ?? "Department" : "Other", jobs: new Map() };
            byDepartment.set(row.department_id, department);
            const jobKey = row.job_id ?? "none";
            const job = department.jobs.get(jobKey) ?? { name: row.job_name ?? "Job", color: row.job_color, rows: [] };
            department.jobs.set(jobKey, job);
            job.rows.push({
              shiftId: row.shift_id ?? row.id ?? `${row.employee_id}-${row.start_time}`,
              rowId: row.id,
              sourceShiftId: row.source_shift_id,
              jobId: row.job_id,
              labelIds: row.label_ids ?? [],
              sectionId: row.section_id,
              employeeId: row.employee_id!,
              name: row.name ?? "Team member",
              jobName: row.job_name ?? "Job",
              startTime: row.start_time,
              endTime: row.end_time,
              crossesMidnight: row.crosses_midnight,
              scheduleStartTime: row.schedule_start_time,
              scheduleEndTime: row.schedule_end_time,
              labels: row.label_names ?? [],
              sectionName: row.section_name,
              lineupOnly: row.lineup_only,
              changed: row.changed,
              hasApp: row.has_app,
              acknowledgedAt: row.acknowledged_at,
            });
          }
          const departments: LineupDepartment[] = [...byDepartment.entries()]
            .map(([id, department]) => ({
              id,
              name: department.name,
              jobs: [...department.jobs.entries()]
                .map(([jobId, job]) => ({
                  id: jobId,
                  name: job.name,
                  color: job.color,
                  rows: [...job.rows].sort(
                    (a, b) => startKey(a.startTime).localeCompare(startKey(b.startTime)) || byName(a, b),
                  ),
                }))
                .sort(byName),
            }))
            // Departments by name, shifts without one last (catalog order, BL-475).
            .sort((a, b) => (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) || byName(a, b));
          return {
            key,
            name: lineup.shift_type_name ?? type?.name ?? "No shift type",
            color: lineup.color ?? type?.color ?? null,
            departments,
            count: rows.length,
            // By the shift type's start (a type gone from the catalog: its earliest row), shifts with no type last.
            start: key === NO_SHIFT_TYPE
              ? "99:99:99"
              : startKey(type?.default_start_time ?? rows.map((row) => row.start_time).sort()[0] ?? ""),
            publish: {
              target: { location_id: location.id, service_date: read.date, shift_type_id: lineup.shift_type_id },
              status: lineup.status,
              published: lineup.published,
              sharedAt: lineup.shared_at,
              sharedByName: lineup.shared_by_name,
              askAck: lineup.ask_ack ?? false,
              acknowledged: lineup.acknowledged ?? 0,
              withApp: lineup.with_app,
              people: lineup.people,
              notes: lineup.notes,
            },
          };
        })
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) || byName(a, b))
        .map(({ start: _start, ...shift }) => shift);
      return {
        id: location.id,
        name: location.name,
        timezone: location.timezone,
        closed,
        shortHours: published(location.short_hours),
        shifts,
        sections: read.sections
          .filter((section) => section.location_id === location.id)
          .sort((a, b) => a.sort_order - b.sort_order || byName(a, b))
          .map((section) => ({ id: section.id, name: section.name, sortOrder: section.sort_order })),
      };
    });
}

/** A lineup the manager can publish now: people on it, not published, the day not over. */
export function canPublish(shift: LineupShift): boolean {
  return shift.count > 0 && !shift.publish.published && shift.publish.status !== "past";
}

/** Lineups waiting to be published: the Publish button's badge. */
export function unpublishedCount(locations: readonly LineupLocation[]): number {
  return locations.reduce((sum, location) => sum + location.shifts.filter(canPublish).length, 0);
}

function minutes(time: string): number {
  const [hours = "0", mins = "0"] = time.split(":");
  return Number(hours) * 60 + Number(mins);
}

function shiftRows(shift: LineupShift): LineupRow[] {
  return shift.departments.flatMap((department) => department.jobs.flatMap((job) => job.rows));
}

/** Minutes worked from `start` to `end`; an end at or before the start is the next day. */
function worked(start: string, end: string): number {
  const span = minutes(end) - minutes(start);
  return span > 0 ? span : span + 24 * 60;
}

/**
 * How much longer (+) or shorter (−) the row's shift is than the Schedule's, in minutes of the TOTAL worked (Mert
 * 2026-10-19 ~5:30 AM; S-178 Ek 2): Schedule 4:00 PM–10:30 PM, lineup 3:00 PM–11:00 PM is +90. 0 when the same or
 * when the row has no Schedule times (added on the lineup). Managers only.
 */
export function lineupHoursChange(row: LineupRow): number {
  if (!row.scheduleStartTime || !row.scheduleEndTime) return 0;
  return worked(row.startTime, row.endTime) - worked(row.scheduleStartTime, row.scheduleEndTime);
}

/** Minutes after the day's midnight the row ends; past midnight runs over 24 h. */
function endsAt(row: LineupRow): number {
  return minutes(row.endTime) + (row.crossesMidnight ? 24 * 60 : 0);
}

/** When the shift's first person comes in and its last one leaves. */
export function lineupShiftSpan(shift: LineupShift): { firstIn: string; lastOut: string } | null {
  const rows = shiftRows(shift);
  if (!rows.length) return null;
  const first = rows.reduce((a, b) => (minutes(b.startTime) < minutes(a.startTime) ? b : a));
  const last = rows.reduce((a, b) => (endsAt(b) > endsAt(a) ? b : a));
  return { firstIn: first.startTime, lastOut: last.endTime };
}

/**
 * The shift a phone opens on (Mert 2026-10-14: one shift at a time, under
 * tabs): the chosen one; today, the first one still on the floor at `now`
 * (HH:MM), else the last one with people; another day, the first one with
 * people; else the first.
 */
export function phoneLineupShift(
  shifts: readonly LineupShift[],
  chosen: string,
  now: string | null,
): LineupShift | null {
  const picked = shifts.find((shift) => shift.key === chosen);
  if (picked) return picked;
  const staffed = shifts.filter((shift) => shift.count > 0);
  if (now !== null) {
    const at = minutes(now);
    const onFloor = staffed.find((shift) => shiftRows(shift).some((row) => endsAt(row) > at));
    if (onFloor) return onFloor;
    if (staffed.length) return staffed[staffed.length - 1]!;
  }
  return staffed[0] ?? shifts[0] ?? null;
}

/**
 * The least time a button that works in place (the Edit window's Edit, Acknowledge) shows its spinner, so a quick
 * answer still reads (Mert 2026-10-17 ~1:45 PM; mockup v-e.js 0.8 s).
 */
export const LINEUP_BUSY_MS = 800;

/** One shift tab over the locations shown: its people at all of them. */
export interface PhoneShiftTab {
  readonly key: string;
  readonly name: string;
  readonly color: string | null;
  readonly count: number;
}

/**
 * The phone's shift tabs (All locations, Mert 2026-10-17 ~9:10 AM): a tab stands for that shift at every location
 * shown; the first location's order, then any shift only a later one has; its count adds every location's people.
 */
export function phoneShiftTabs(locations: readonly LineupLocation[]): PhoneShiftTab[] {
  const tabs = new Map<string, { key: string; name: string; color: string | null; count: number }>();
  for (const location of locations)
    for (const shift of location.shifts) {
      const tab = tabs.get(shift.key);
      if (tab) tab.count += shift.count;
      else tabs.set(shift.key, { key: shift.key, name: shift.name, color: shift.color, count: shift.count });
    }
  return [...tabs.values()];
}

/**
 * The shift the phone opens on over the locations shown: the chosen one when any of them has it; otherwise where
 * the first location with people would open (phoneLineupShift, on that location's own clock); else the first's.
 */
export function phoneLineupKey(
  locations: readonly LineupLocation[],
  chosen: string,
  nowAt: (location: LineupLocation) => string | null,
): string | null {
  if (chosen && locations.some((location) => location.shifts.some((shift) => shift.key === chosen))) return chosen;
  const first = locations.find((location) => location.shifts.some((shift) => shift.count > 0)) ?? locations.find((location) => location.shifts.length);
  return first ? phoneLineupShift(first.shifts, "", nowAt(first))?.key ?? null : null;
}

/**
 * The phone card's state (E, card 1; Mert 2026-10-17): live (staff see it) or a draft, and whether the shift has
 * started: the day is over, or today (`now` is HH:MM on the location's clock) its first person is in. A started
 * shift locks Edit, live or not.
 */
export function lineupCardState(shift: LineupShift, now: string | null): { readonly live: boolean; readonly started: boolean } {
  const span = lineupShiftSpan(shift);
  const started = shift.publish.status === "past" || (now !== null && span !== null && minutes(now) >= minutes(span.firstIn));
  return { live: shift.publish.published, started };
}

/**
 * Whether a manager changes the lineup's rows and notes in place (LINEUP-EDIT W2a; the server's lock, L2a): a draft
 * whose shift hasn't started. A published one goes back to draft with Edit first.
 */
export function lineupEditable(shift: LineupShift, now: string | null): boolean {
  const state = lineupCardState(shift, now);
  return !state.live && !state.started;
}

/**
 * A time as a manager types it into In or Out (the design's parseT): "4:30 PM", "4:30p", "17:15", or a bare "5",
 * read as the time nearer the one it had. HH:MM, or null when it isn't a time.
 */
export function parseLineupTime(typed: string, base: string): string | null {
  const match = typed.trim().toLowerCase().replace(/\s+/g, "").replace(/\./g, "").match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const mins = match[2] ? Number(match[2]) : 0;
  const half = match[3]?.[0];
  if (mins > 59) return null;
  if (half) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (half === "p" ? 12 : 0);
  } else if (hours > 23) return null;
  // "00:30", "0:30", "09:15": written the 24-hour way, read as written.
  else if (hours <= 12 && !match[1]!.startsWith("0")) {
    // No AM or PM: the reading nearer the time it had, round the clock ("12:30" by 9 AM is noon, "1" by 10 PM is 1 AM).
    const had = minutes(base || "12:00");
    const away = (at: number) => Math.min(Math.abs(at * 60 + mins - had), 24 * 60 - Math.abs(at * 60 + mins - had));
    hours = away(hours % 12) <= away((hours % 12) + 12) ? hours % 12 : (hours % 12) + 12;
  }
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Copy as text (S-178 ek b; the design's lineupText): the lineup for people without the app. The place, shift and
 * day; each department with its people as "Job: Name · In – Out · Section · Label"; then the notes staff see.
 */
export function lineupCopyText(
  location: LineupLocation,
  shift: LineupShift,
  dateLabel: string,
  timeFormat: ScheduleTimeFormat,
): string {
  const lines = [`${location.name} · ${shift.name} · ${dateLabel}`];
  for (const department of shift.departments) {
    lines.push("", department.name);
    for (const job of department.jobs)
      for (const row of job.rows)
        lines.push(
          [
            `${job.name}: ${row.name}`,
            `${formatTime(row.startTime, timeFormat, "long")} – ${formatTime(row.endTime, timeFormat, "long")}`,
            row.sectionName,
            row.labels.join(", "),
          ]
            .filter(Boolean)
            .join(" · "),
        );
  }
  const notes = [
    ["Specials", shift.publish.notes.specials],
    ["86s", shift.publish.notes.n86],
    ["Shift notes", shift.publish.notes.shift_notes],
  ] as const;
  for (const [label, note] of notes) if (note.trim()) lines.push("", `${label}: ${note.trim()}`);
  return lines.join("\n");
}

/** How many of a lineup's notes staff see (an empty note doesn't show). */
export function lineupNoteCount(notes: LineupPublish["notes"]): number {
  return [notes.specials, notes.n86, notes.shift_notes].filter((note) => note.trim()).length;
}

/** One person on a lineup's Read list. */
export interface LineupReader {
  readonly employeeId: string;
  readonly name: string;
  readonly jobName: string;
  readonly acknowledgedAt: string | null;
}

/**
 * The Read list (Mert 2026-10-17): the people on a lineup, once each, as not read yet, read (earliest first)
 * and no app (not counted in "Read N/M").
 */
export function lineupReadLists(shift: LineupShift): {
  readonly unread: LineupReader[];
  readonly read: LineupReader[];
  readonly noApp: LineupReader[];
} {
  const seen = new Map<string, LineupRow>();
  for (const row of shiftRows(shift)) if (!seen.has(row.employeeId)) seen.set(row.employeeId, row);
  const people = [...seen.values()]
    .map((row) => ({ row, reader: { employeeId: row.employeeId, name: row.name, jobName: row.jobName, acknowledgedAt: row.acknowledgedAt } }))
    .sort((a, b) => byName(a.reader, b.reader));
  return {
    unread: people.filter(({ row }) => row.hasApp && !row.acknowledgedAt).map(({ reader }) => reader),
    read: people
      .filter(({ row }) => row.hasApp && row.acknowledgedAt)
      .map(({ reader }) => reader)
      .sort((a, b) => Date.parse(a.acknowledgedAt!) - Date.parse(b.acknowledgedAt!) || byName(a, b)),
    noApp: people.filter(({ row }) => !row.hasApp).map(({ reader }) => reader),
  };
}
