import { z } from "zod";

const id = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const lineupTargetSchema = z.object({
  date: z.string().date(),
  location_id: id,
  job_id: id,
  shift_type_id: id,
  start_time: time,
  end_time: time,
  section_id: id.nullable(),
  station: z.string().max(80),
});
export type LineupTarget = z.infer<typeof lineupTargetSchema>;
export const lineupOperationSchema = z.object({
  kind: z.enum(["assign", "replace", "move", "swap", "release"]),
  source_entry_id: id.nullable(),
  target_entry_id: id.nullable(),
  employee_id: id.nullable(),
  replace_target: z.boolean().optional(),
  target: lineupTargetSchema,
  reason: z.string().trim().min(1).max(500),
  travel_minutes: z.number().int().min(0).max(240),
});
export type LineupOperation = z.infer<typeof lineupOperationSchema>;
const lineupAvailabilityWarningSchema = z
  .object({
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    policy: z.enum(["warn", "confirm"]),
  })
  .nullable()
  .optional();
export const lineupCandidateSchema = z.object({
  availability_warning: lineupAvailabilityWarningSchema,
  display_group: z
    .enum([
      "eligible",
      "not_suitable",
      "working_elsewhere",
      "working_here",
      "day_off",
      "missing_location",
      "missing_job",
    ])
    .optional(),
  context_labels: z.array(z.string()).optional(),
  has_availability_conflict: z.boolean().optional(),
  employee_id: id,
  display_name: z.string(),
  status: z.enum([
    "eligible",
    "partial",
    "movable",
    "verification_required",
    "ineligible",
  ]),
  reasons: z.array(z.string()),
  available_start: z.string().nullable(),
  available_end: z.string().nullable(),
  move_source: z
    .object({
      entry_id: id,
      location_id: id,
      location_name: z.string(),
      date: z.string().date(),
      timezone: z.string(),
      job_name: z.string(),
      start_time: z.string(),
      end_time: z.string(),
    })
    .optional(),
});
export type LineupCandidate = z.infer<typeof lineupCandidateSchema>;
export const lineupOperationPreviewSchema = z.object({
  availability_warning: lineupAvailabilityWarningSchema,
  minimum_travel_minutes: z.number().int().min(0).max(240).optional(),
  effective_travel_minutes: z.number().int().min(0).max(240).optional(),
  fingerprint: z.string().length(64),
  allowed: z.boolean(),
  requires_approval: z.boolean(),
  effects: z.array(z.string()),
  blockers: z.array(z.string()),
});
export type LineupOperationPreview = z.infer<
  typeof lineupOperationPreviewSchema
>;
export const lineupNoteSchema = z.object({
  id,
  revision: z.number().int().positive(),
  location_id: id.nullable(),
  shift_type_id: id.nullable(),
  section_id: id.nullable(),
  date: z.string().date(),
  category: z.enum([
    "priority",
    "specials",
    "86",
    "event",
    "instruction",
    "checklist",
    "briefing",
  ]),
  content: z.string().trim().min(1).max(2000),
  visibility: z.enum(["team", "managers"]),
  pinned: z.boolean(),
  expires_at: z.string().datetime({ offset: true }).nullable(),
});
export const lineupNoteInputSchema = lineupNoteSchema.omit({
  id: true,
  revision: true,
});
export type LineupNote = z.infer<typeof lineupNoteSchema>;
export const lineupReminderResultSchema = z.object({
  sent: z.number().int().nonnegative(),
});
export type LineupNoteInput = z.infer<typeof lineupNoteInputSchema>;
export const lineupReceiptSchema = z.object({
  employee_id: id,
  employee_name: z.string(),
  snapshot_id: id,
  version: z.number().int(),
  viewed_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
});
export const lineupSectionPlanInputSchema = z.object({
  date: z.string().date(),
  location_id: id,
  shift_type_id: id.nullable(),
  section_id: id,
  closed: z.boolean(),
  lead_employee_id: id.nullable(),
  stations: z.string().max(500),
  expected_revision: z.number().int().positive().nullable(),
});
export const lineupSectionPlanSchema = lineupSectionPlanInputSchema
  .omit({ expected_revision: true })
  .extend({ id, revision: z.number().int(), lead_name: z.string() });
export type LineupSectionPlan = z.infer<typeof lineupSectionPlanSchema>;
export type LineupSectionPlanInput = z.infer<
  typeof lineupSectionPlanInputSchema
>;
export const lineupOperationsStateSchema = z.object({
  read_only: z.boolean().optional(),
  can_manage_sections: z.boolean().optional(),
  section_plans: z.array(lineupSectionPlanSchema).optional(),
  server_time: z.string().optional(),
  source_current: z.boolean().optional(),
  unreachable_recipients: z.number().int().optional(),
  pending_notifications: z.number().int().optional(),
  active_entry_ids: z.array(id).optional(),
  notes: z.array(lineupNoteSchema),
  receipts: z.array(lineupReceiptSchema),
  events: z.array(
    z.object({
      id,
      kind: z.string(),
      description: z.string(),
      created_at: z.string(),
    }),
  ),
  unpublished_changes: z.boolean(),
});
export type LineupOperationsState = z.infer<typeof lineupOperationsStateSchema>;
const employeeLineupAssignmentSchema = z.object({
  note: z.string().max(500).optional(),
  placement_start_at: z.string().nullable().optional(),
  placement_end_at: z.string().nullable().optional(),
  id,
  employee_name: z.string(),
  job_name: z.string(),
  section_name: z.string(),
  station: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  shift_type_name: z.string(),
});
export const employeeLineupSnapshotSchema = z.object({
  source_current: z.boolean().optional(),
  snapshot_id: id,
  location_id: id,
  location_name: z.string(),
  timezone: z.string().optional(),
  date: z.string().date(),
  version: z.number().int(),
  shared_at: z.string(),
  viewed_at: z.string().nullable(),
  acknowledged_at: z.string().nullable(),
  entries: z.array(employeeLineupAssignmentSchema),
  section_team: z.array(employeeLineupAssignmentSchema).optional(),
  changes: z
    .object({
      previous_version: z.number().int().nullable(),
      assignment_changed: z.boolean(),
      brief_changed: z.boolean(),
      previous_entries: z.array(employeeLineupAssignmentSchema),
    })
    .optional(),
  notes: z.array(
    z.object({
      id,
      category: z.string(),
      content: z.string(),
      pinned: z.boolean(),
      expires_at: z.string().nullable().optional(),
    }),
  ),
  briefs: z.array(
    z.object({
      shift_type_id: id,
      specials: z.string(),
      out_of_stock: z.string(),
      pre_shift_notes: z.string(),
    }),
  ),
});
export type EmployeeLineupSnapshot = z.infer<
  typeof employeeLineupSnapshotSchema
>;

export const lineupDestinationSchema = z.object({
  id,
  name: z.string(),
  timezone: z.string(),
});
export const lineupProposalSchema = z.object({
  id,
  kind: z.enum(["offer", "transfer"]),
  status: z.string(),
  description: z.string(),
  resolution: z.string().nullable().optional(),
  source_name: z.string(),
  target_name: z.string(),
  source_date: z.string().date().optional(),
  target_date: z.string().date().optional(),
  employee_name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  can_choose_need: z.boolean().optional(),
  needs_counterpart: z.boolean().optional(),
  target_location_id: id.optional(),
  can_cancel: z.boolean().optional(),
  can_confirm: z.boolean(),
});
export const lineupOfferSchema = z.object({
  id,
  status: z.string(),
  date: z.string(),
  location_name: z.string(),
  job_name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  expires_at: z.string(),
  availability_warning: z
    .object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/) })
    .nullable()
    .optional(),
});

export const lineupPlacementPreviewSchema = z.object({
  fingerprint: z.string().length(64),
  allowed: z.boolean(),
  rows: z.array(
    z.object({
      entry_id: id,
      employee_name: z.string(),
      allowed: z.boolean(),
      effects: z.array(z.string()),
      blockers: z.array(z.string()),
    }),
  ),
});
export type LineupPlacementPreview = z.infer<
  typeof lineupPlacementPreviewSchema
>;

export const lineupPlacementResultSchema = z.object({
  entries: z.array(
    z.object({ entry_id: id, entry_revision: z.number().int().positive() }),
  ),
});
