import { z } from "zod";

// LINEUP-PUBLISH (KARARLAR "Lineup yayını öne alındı", 2026-10-17): a manager publishes a day's lineups and
// takes them back; an employee reads the published lineups she is on, as they are now, and acknowledges them.
// The database (lineup_command_service, get_my_lineups_service, acknowledge_lineup_service) decides; these
// are the shapes the API takes and answers with.

const id = z.string().uuid();
const day = z.string().date();
const instant = z.string().datetime({ offset: true });
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const sectionName = z.string().trim().min(1).max(40);

/** One lineup: a location's day and shift type (null: the day's shifts with no shift type). */
export const lineupTargetSchema = z.object({
  location_id: id,
  service_date: day,
  shift_type_id: id.nullable(),
});
export type LineupTarget = z.infer<typeof lineupTargetSchema>;

/**
 * A lineup command. The same command_id sent again answers what it answered the first time.
 * share asks whether employees acknowledge it; unpublish takes it back from them.
 */
export const lineupCommandInputSchema = z.discriminatedUnion("kind", [
  z.object({
    command_id: id,
    kind: z.literal("share"),
    lineups: z.array(lineupTargetSchema).min(1).max(50),
    ask_ack: z.boolean(),
  }),
  z.object({
    command_id: id,
    kind: z.literal("unpublish"),
    lineups: z.array(lineupTargetSchema).min(1).max(50),
  }),
]);
export type LineupCommandInput = z.infer<typeof lineupCommandInputSchema>;

export const lineupCommandResultSchema = z.object({
  command_id: id,
  kind: z.enum(["share", "unpublish"]),
  lineups: z.array(
    z.object({
      lineup_id: id,
      version: z.number().int().nonnegative(),
      // Only on a lineup this command published.
      version_id: id.optional(),
      // unchanged: it was already published and stays as it is.
      status: z.enum(["shared", "unchanged", "unpublished"]),
    }),
  ),
});
export type LineupCommandResult = z.infer<typeof lineupCommandResultSchema>;

/**
 * LINEUP-EDIT L2a (KARARLAR S-178): a change to a draft lineup that hasn't started, in the lineup only. set_row
 * names its row (a Schedule shift by source_shift_id, a person added in the lineup by row_id) and only the fields
 * that change: null puts a field back to the Schedule's (In and Out go together), or empties a section or labels.
 * set_notes sends the notes that change. The same command_id sent again answers what it answered the first time.
 */
const lineupEditRowSchema = z
  .object({
    source_shift_id: id.optional(),
    row_id: id.optional(),
    job_id: id.nullable().optional(),
    label_ids: z.array(id).max(20).nullable().optional(),
    starts: timeOfDay.nullable().optional(),
    ends: timeOfDay.nullable().optional(),
    section_id: id.nullable().optional(),
    /** LINEUP-EDIT L2b: "Other…", a name typed in this lineup only; save_section adds it to the location's sections. */
    section_name: sectionName.nullable().optional(),
    save_section: z.boolean().optional(),
  })
  .strict()
  .refine((row) => (row.source_shift_id === undefined) !== (row.row_id === undefined), "Name one row")
  .refine((row) => (row.starts === undefined) === (row.ends === undefined), "In and Out go together")
  .refine((row) => row.section_id === undefined || row.section_name === undefined, "A section or a typed name");

/** A row an action names: a Schedule shift by source_shift_id, a person added in the lineup by row_id. */
const lineupRowRefSchema = z
  .object({ source_shift_id: id.optional(), row_id: id.optional() })
  .strict()
  .refine((row) => (row.source_shift_id === undefined) !== (row.row_id === undefined), "Name one row");

export const lineupEditInputSchema = z.discriminatedUnion("action", [
  lineupTargetSchema.extend({ command_id: id, action: z.literal("set_row"), row: lineupEditRowSchema }),
  // LINEUP-EDIT L3a (S-178 madde 5-7): Call off and Call in; Add Staff (no hours: the position's on this lineup,
  // else the shift type's); Replace (the person takes the row's position, hours, labels and section); Undo.
  lineupTargetSchema.extend({ command_id: id, action: z.literal("call_off"), row: lineupRowRefSchema }),
  lineupTargetSchema.extend({ command_id: id, action: z.literal("call_in"), row: lineupRowRefSchema }),
  lineupTargetSchema.extend({
    command_id: id,
    action: z.literal("add_person"),
    person: z
      .object({ employee_id: id, job_id: id, starts: timeOfDay.optional(), ends: timeOfDay.optional() })
      .strict()
      .refine((person) => (person.starts === undefined) === (person.ends === undefined), "In and Out go together"),
  }),
  lineupTargetSchema.extend({
    command_id: id,
    action: z.literal("replace"),
    row: lineupRowRefSchema,
    person: z.object({ employee_id: id }).strict(),
  }),
  lineupTargetSchema.extend({
    command_id: id,
    action: z.literal("undo_replace"),
    row: z.object({ row_id: id }).strict(),
  }),
  lineupTargetSchema.extend({
    command_id: id,
    action: z.literal("set_notes"),
    notes: z
      .object({
        specials: z.string().max(500).optional(),
        n86: z.string().max(500).optional(),
        shift_notes: z.string().max(1000).optional(),
      })
      .strict(),
  }),
]);
export type LineupEditInput = z.infer<typeof lineupEditInputSchema>;

/**
 * LINEUP-EDIT L3a (S-178 madde 6-7): who may join a lineup's department (Add Staff) or take a person's place
 * (Replace), by a score in four groups. The reason is the screen's to word.
 */
export const lineupCandidatesQuerySchema = z.union([
  lineupTargetSchema.extend({ department_id: id.nullable() }).strict(),
  lineupTargetSchema.extend({ row: lineupRowRefSchema }).strict(),
]);
export type LineupCandidatesQuery = z.infer<typeof lineupCandidatesQuerySchema>;

const lineupCandidateWhySchema = z.discriminatedUnion("reason", [
  z.object({ reason: z.literal("no_shift") }),
  z.object({ reason: z.literal("time_off") }),
  z.object({
    reason: z.literal("elsewhere"),
    location_name: z.string(),
    shift_name: z.string(),
    start_time: timeOfDay,
    end_time: timeOfDay,
    /** For part of these hours, not all of them. */
    partial: z.boolean(),
  }),
  z.object({
    reason: z.literal("overlap_here"),
    shift_name: z.string(),
    start_time: timeOfDay,
    end_time: timeOfDay,
    overlap_minutes: z.number().int().nonnegative(),
  }),
  z.object({
    reason: z.literal("other_shift"),
    /** Null when it is at this location. */
    location_name: z.string().nullable(),
    shift_name: z.string(),
    start_time: timeOfDay,
    end_time: timeOfDay,
  }),
]);

export const lineupCandidatesSchema = z.object({
  /** The hours measured by: the row's, the department's on this lineup, or the shift type's. */
  window: z.object({ start_time: timeOfDay, end_time: timeOfDay }),
  /** The row's position on Replace. */
  job_id: id.nullable(),
  candidates: z.array(
    z.object({
      employee_id: id,
      name: z.string(),
      job_ids: z.array(id),
      /** The position the person would take; null when none of hers fits the department. */
      job_id: id.nullable(),
      group: z.enum(["best_fit", "available", "consider", "unavailable"]),
      score: z.number().int(),
      why: lineupCandidateWhySchema,
    }),
  ),
});
export type LineupCandidates = z.infer<typeof lineupCandidatesSchema>;

export const lineupEditResultSchema = z.object({
  command_id: id,
  kind: z.literal("edit"),
  lineup_id: id,
  /** The row it changed; null for notes. */
  row_id: id.nullable(),
});
export type LineupEditResult = z.infer<typeof lineupEditResultSchema>;

const myLineupRowSchema = z.object({
  start_time: timeOfDay,
  end_time: timeOfDay,
  crosses_midnight: z.boolean(),
  job_name: z.string().nullable(),
  job_color: z.string().nullable(),
  section_name: z.string().nullable(),
  label_names: z.array(z.string()),
  called_off: z.boolean(),
});

export const myLineupSchema = z.object({
  id,
  version_id: id,
  version: z.number().int().positive(),
  location: z.object({ id, name: z.string(), timezone: z.string() }),
  shift_type_id: id.nullable(),
  // null: the day's other shifts.
  shift_type_name: z.string().nullable(),
  color: z.string().nullable(),
  shared_at: instant,
  ask_ack: z.boolean(),
  acknowledged_at: instant.nullable(),
  notes: z.object({ specials: z.string(), n86: z.string(), shift_notes: z.string() }),
  /** Her own rows on it (usually one); replaced: someone took her place (LINEUP-EDIT L2a, S-178). */
  mine: z.array(myLineupRowSchema.extend({ replaced: z.boolean() })).min(1),
  /** Everybody on it, in the lineup's order (PLAN §11.3: the whole team). */
  team: z.array(
    myLineupRowSchema.extend({
      employee_id: id,
      name: z.string().nullable(),
      department_name: z.string().nullable(),
      is_me: z.boolean(),
    }),
  ),
});
export type MyLineup = z.infer<typeof myLineupSchema>;

export const myLineupsSchema = z.object({
  workspace_id: id,
  date: day,
  lineups: z.array(myLineupSchema),
});
export type MyLineups = z.infer<typeof myLineupsSchema>;

export const lineupAcknowledgementSchema = z.object({
  status: z.literal("saved"),
  version_id: id,
  acknowledged_at: instant,
});
export type LineupAcknowledgement = z.infer<typeof lineupAcknowledgementSchema>;

// The manager's day (get_lineup_day_service, LINEUP-DB + LINEUP-PUBLISH): the day's lineups at each location
// the actor reads, each with its publish state and its rows as the live Schedule has them plus what the lineup
// changed. A lineup with no header yet (never touched, never published) has a null id.

const lineupDayRowSchema = z.object({
  id: id.nullable(),
  shift_id: id.nullable(),
  source_shift_id: id.nullable(),
  // null: an open shift.
  employee_id: id.nullable(),
  name: z.string().nullable(),
  job_id: id.nullable(),
  job_name: z.string().nullable(),
  job_color: z.string().nullable(),
  department_id: id.nullable(),
  department_name: z.string().nullable(),
  start_time: timeOfDay,
  end_time: timeOfDay,
  crosses_midnight: z.boolean(),
  schedule_start_time: timeOfDay.nullable(),
  schedule_end_time: timeOfDay.nullable(),
  label_ids: z.array(id).nullable(),
  label_names: z.array(z.string()).nullable(),
  section_id: id.nullable(),
  section_name: z.string().nullable(),
  sort_order: z.number().int().nullable(),
  called_off_at: instant.nullable(),
  called_off_by: id.nullable(),
  /** LINEUP-EDIT L1 (S-178 "Replaced"): the row of this lineup that took this one's place. */
  replaced_by_row_id: id.nullable(),
  lineup_only: z.boolean(),
  changed: z.array(z.string()),
  /** The Read list (Mert 2026-10-17): the person has the app, and when she acknowledged the version staff see. */
  has_app: z.boolean(),
  acknowledged_at: instant.nullable(),
});
export type LineupDayRow = z.infer<typeof lineupDayRowSchema>;

export const lineupDayLineupSchema = z.object({
  id: id.nullable(),
  shift_type_id: id.nullable(),
  shift_type_name: z.string().nullable(),
  color: z.string().nullable(),
  /** past: the day is over where the location is; editing: published once, taken back. */
  status: z.enum(["draft", "shared", "editing", "past"]),
  version: z.number().int().positive().nullable(),
  shared_at: instant.nullable(),
  ask_ack: z.boolean().nullable(),
  /** Acknowledgements of the version employees see; null before the first publish. */
  acknowledged: z.number().int().nonnegative().nullable(),
  revision: z.number().int().nullable(),
  /** Employees see it now. */
  published: z.boolean(),
  version_id: id.nullable(),
  shared_by: id.nullable(),
  shared_by_name: z.string().nullable(),
  /** Everybody on it, and those of them with the app ("Read 7/11" is acknowledged / with_app). */
  people: z.number().int().nonnegative(),
  with_app: z.number().int().nonnegative(),
  notes: z.object({ specials: z.string(), n86: z.string(), shift_notes: z.string() }),
  rows: z.array(lineupDayRowSchema),
});
export type LineupDayLineup = z.infer<typeof lineupDayLineupSchema>;

const lineupClosureSchema = z.object({ title: z.string(), status: z.string().nullable() });

/** One of a location's sections, in its order. */
export const lineupSectionSchema = z.object({ id, location_id: id, name: z.string(), sort_order: z.number().int() });
export type LineupSection = z.infer<typeof lineupSectionSchema>;

export const lineupDaySchema = z.object({
  workspace_id: id,
  date: day,
  locations: z.array(
    z.object({
      id,
      name: z.string(),
      timezone: z.string(),
      closed: lineupClosureSchema.nullable(),
      short_hours: lineupClosureSchema.extend({ opens: timeOfDay.nullable(), closes: timeOfDay.nullable() }).nullable(),
      lineups: z.array(lineupDayLineupSchema),
    }),
  ),
  sections: z.array(lineupSectionSchema),
});
export type LineupDay = z.infer<typeof lineupDaySchema>;

/**
 * LINEUP-EDIT L2b (S-178 madde 4): the Sections window, a location's sections. add answers the section of that
 * name if there is one; reorder sends every section of the location; remove leaves the draft rows that had it with
 * none (a published lineup keeps it until Edit). Each answers the location's sections in order.
 */
export const lineupSectionsInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), location_id: id, name: sectionName }).strict(),
  z.object({ action: z.literal("rename"), location_id: id, section_id: id, name: sectionName }).strict(),
  z.object({ action: z.literal("reorder"), location_id: id, section_ids: z.array(id).min(1).max(100) }).strict(),
  z.object({ action: z.literal("remove"), location_id: id, section_id: id }).strict(),
]);
export type LineupSectionsInput = z.infer<typeof lineupSectionsInputSchema>;

export const lineupSectionsResultSchema = z.object({ location_id: id, sections: z.array(lineupSectionSchema) });
export type LineupSectionsResult = z.infer<typeof lineupSectionsResultSchema>;

/** The day read's filters: comma-separated ids in the query string, each list optional. */
export const lineupDayQuerySchema = z.object({
  location_ids: z.array(id).min(1).max(100).optional(),
  shift_type_ids: z.array(id).min(1).max(100).optional(),
});
export type LineupDayQuery = z.infer<typeof lineupDayQuerySchema>;
