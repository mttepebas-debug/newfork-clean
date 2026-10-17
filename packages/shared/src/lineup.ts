import { z } from "zod";

// LINEUP-PUBLISH (KARARLAR "Lineup yayını öne alındı", 2026-10-17): a manager publishes a day's lineups and
// takes them back; an employee reads the published lineups she is on, as they are now, and acknowledges them.
// The database (lineup_command_service, get_my_lineups_service, acknowledge_lineup_service) decides; these
// are the shapes the API takes and answers with.

const id = z.string().uuid();
const day = z.string().date();
const instant = z.string().datetime({ offset: true });
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

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
  /** Her own rows on it (usually one). */
  mine: z.array(myLineupRowSchema).min(1),
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
