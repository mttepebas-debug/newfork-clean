import { z } from "zod";

// One announcement record (EKRAN-08): an announcement, and when it has days,
// an Important Date and what those days do at each location. Archive is
// archived_at; Past is a published record whose last day is over.
export const announcementStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "unpublished",
]);
export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;
/** What the lists show: the status, or archived, past, or a scheduled one that couldn't publish. */
export const announcementDisplayStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "unpublished",
  "publish_failed",
  "past",
  "archived",
]);
export type AnnouncementDisplayStatus = z.infer<typeof announcementDisplayStatusSchema>;
export const announcementCategorySchema = z.enum([
  "general",
  "holiday",
  "event",
  "busy_day",
  "celebration",
  "inspection",
  "staff_meeting",
  "other",
]);
export type AnnouncementCategory = z.infer<typeof announcementCategorySchema>;
/** Repeats every year on the same date, the same nth weekday, or the last such weekday. */
export const announcementRecurrenceSchema = z.enum(["none", "date", "nth", "last"]);
export type AnnouncementRecurrence = z.infer<typeof announcementRecurrenceSchema>;
/** A checked location's day: Open as usual, Closed, or Short hours. */
export const announcementDaySchema = z.enum(["open", "closed", "short"]);
export type AnnouncementDay = z.infer<typeof announcementDaySchema>;

const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const momentSchema = z.string().datetime({ offset: true });
const countSchema = z.coerce.number().int().nonnegative();

export const appActionUrlSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^\/app(?:[/?#]|$)/, "Action URL must stay inside the app");

/** A checked location: its day, and with Short hours when it opens and closes (closing up to 6:00 AM the next day). */
export const announcementLocationRowSchema = z.object({
  location_id: z.string().uuid(),
  day: announcementDaySchema,
  opens: clockSchema.nullable(),
  closes: clockSchema.nullable(),
});
export type AnnouncementLocationRow = z.infer<typeof announcementLocationRowSchema>;

/** What happens to one listed shift (keyed by its source id): Keep, Remove, Open shift, or new hours. */
export const announcementShiftChoiceSchema = z.discriminatedUnion("choice", [
  z.object({ choice: z.enum(["keep", "remove", "open"]) }),
  z.object({ choice: z.literal("edit"), from: clockSchema, until: clockSchema }),
]);
export type AnnouncementShiftChoice = z.infer<typeof announcementShiftChoiceSchema>;

/**
 * The drawer as filled in. The server decides what keeps it from going out
 * (preview problems); a draft needs only a title.
 */
export const announcementDraftSchema = z.object({
  title: z.string().max(120),
  body: z.string().max(5_000),
  category: announcementCategorySchema,
  category_other: z.string().max(40).nullable(),
  starts_on: z.string().date().nullable(),
  ends_on: z.string().date().nullable(),
  event_from: clockSchema.nullable(),
  event_until: clockSchema.nullable(),
  recurrence: announcementRecurrenceSchema,
  on_important_dates: z.boolean(),
  on_calendar: z.boolean(),
  on_schedule: z.boolean(),
  ask_ack: z.boolean(),
  publish_at: momentSchema.nullable(),
  /** The device's clock, used only when the post has no location and its author none. */
  time_zone: z.string().max(64).nullable().optional(),
  locations: z.array(announcementLocationRowSchema).max(100),
  people: z.array(z.string().uuid()).max(1_000),
  choices: z
    .record(z.string().uuid(), announcementShiftChoiceSchema)
    .refine((choices) => Object.keys(choices).length <= 500, { message: "Too many shifts" })
    .default({}),
  /** The Shifts tab's list as it was shown; a publish or save over other shifts is refused. */
  fingerprint: z.string().max(64).nullable().optional(),
  /** Changed shifts to put back as they were (Save changes). */
  bring_back: z.array(z.string().uuid()).max(500).default([]),
});
export type AnnouncementDraft = z.infer<typeof announcementDraftSchema>;

/** Save draft, Schedule, Publish, or Save changes on a published one. */
export const announcementIntentSchema = z.enum(["draft", "schedule", "publish", "save"]);
export type AnnouncementIntent = z.infer<typeof announcementIntentSchema>;

export const announcementLocationSchema = announcementLocationRowSchema.extend({
  name: z.string(),
  short_name: z.string(),
  timezone: z.string(),
  archived: z.boolean(),
});
export type AnnouncementLocation = z.infer<typeof announcementLocationSchema>;

/** A shift the record changed: as it was (start/end) and, with new hours, as it is now. */
export const announcementShiftChangeSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  outcome: z.enum(["removed", "opened", "edited"]),
  /** A draft week's own shift: changed without telling anyone. */
  silent: z.boolean(),
  location_id: z.string().uuid(),
  location_name: z.string(),
  scheduled_date: z.string().date(),
  employee_id: z.string().uuid().nullable(),
  employee_user_id: z.string().uuid().nullable(),
  employee_name: z.string().nullable(),
  job_name: z.string(),
  start_time: clockSchema.nullable(),
  end_time: clockSchema.nullable(),
  after_start: clockSchema.nullable(),
  after_end: clockSchema.nullable(),
  changed_at: momentSchema.optional(),
  brought_back_at: momentSchema.nullable().optional(),
  /** Why it can't come back now (bring-back list only). */
  lock: z.string().nullable().optional(),
});
export type AnnouncementShiftChange = z.infer<typeof announcementShiftChangeSchema>;

export const announcementRecordSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  category: announcementCategorySchema,
  category_other: z.string().nullable(),
  status: announcementStatusSchema,
  display_status: announcementDisplayStatusSchema,
  /** Why a scheduled one couldn't publish: its author may no longer, its day came, or it failed. */
  publish_error_code: z.enum(["not_allowed", "too_late", "failed"]).nullable(),
  starts_on: z.string().date().nullable(),
  ends_on: z.string().date().nullable(),
  event_from: clockSchema.nullable(),
  event_until: clockSchema.nullable(),
  recurrence: announcementRecurrenceSchema,
  on_important_dates: z.boolean(),
  on_calendar: z.boolean(),
  on_schedule: z.boolean(),
  ask_ack: z.boolean(),
  time_zone: z.string(),
  publish_at: momentSchema.nullable(),
  published_at: momentSchema.nullable(),
  unpublished_at: momentSchema.nullable(),
  archived_at: momentSchema.nullable(),
  /** When its first day starts and its last ends, each location in its own clock. */
  starts_at: momentSchema.nullable(),
  ends_at: momentSchema.nullable(),
  locations: z.array(announcementLocationSchema),
  author_user_id: z.string().uuid().nullable(),
  author_name: z.string(),
  revision: z.coerce.number().int().positive(),
  content_revision: z.coerce.number().int().positive(),
  created_at: momentSchema,
  updated_at: momentSchema,
  /** Last year's record this yearly one repeats. */
  repeats_from: z.string().uuid().nullable(),
  can_edit: z.boolean(),
  can_unschedule: z.boolean(),
  can_unpublish: z.boolean(),
  can_archive: z.boolean(),
  /** It asks this reader to acknowledge. */
  asked_to_acknowledge: z.boolean(),
  acknowledged_at: momentSchema.nullable(),
  /** The reader acknowledged an earlier version and it changed since. */
  content_changed_since_acknowledged: z.boolean(),
  // For whoever may change it; null otherwise.
  respondent_count: countSchema.nullable(),
  acknowledged_count: countSchema.nullable(),
  recipient_count: countSchema.nullable(),
  shift_change_count: countSchema.nullable(),
  /** What it did to the reader's own shifts. */
  my_changes: z.array(announcementShiftChangeSchema),
});
export type AnnouncementRecord = z.infer<typeof announcementRecordSchema>;

/** Someone the Audience lists: name, primary job, where they work first. */
export const announcementPersonSchema = z.object({
  user_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  name: z.string(),
  job_name: z.string().nullable(),
  job_ids: z.array(z.string().uuid()),
  department_ids: z.array(z.string().uuid()),
  location_ids: z.array(z.string().uuid()),
  location_name: z.string().nullable(),
});
export type AnnouncementPerson = z.infer<typeof announcementPersonSchema>;

export const announcementHistoryActionSchema = z.enum([
  "created",
  "saved",
  "scheduled",
  "unscheduled",
  "published",
  "updated",
  "unpublished",
  "brought_back",
  "archived",
  "publish_failed",
  "repeated",
  "reminded",
]);
export type AnnouncementHistoryAction = z.infer<typeof announcementHistoryActionSchema>;

export const announcementHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  action: announcementHistoryActionSchema,
  /** publish_at, told, shift_changes, brought_back, auto, code, from, acknowledgements_reset... */
  detail: z.record(z.string(), z.unknown()),
  changed_at: momentSchema,
  actor_user_id: z.string().uuid().nullable(),
  actor_name: z.string().nullable(),
});
export type AnnouncementHistoryEntry = z.infer<typeof announcementHistoryEntrySchema>;

/** One record for the drawer; the extras only for whoever may change it. */
export const announcementDetailSchema = announcementRecordSchema.extend({
  people: z.array(announcementPersonSchema).optional(),
  shift_choices: z.record(z.string(), z.unknown()).optional(),
  choices_saved_at: momentSchema.nullable().optional(),
  changes: z.array(announcementShiftChangeSchema).optional(),
  /** Changed shifts at locations the reader may not read the Schedule of. */
  hidden_change_count: countSchema.optional(),
  acknowledgements: z
    .array(announcementPersonSchema.extend({ acknowledged_at: momentSchema.nullable() }))
    .optional(),
  history: z.array(announcementHistoryEntrySchema).optional(),
  /** Reminds left today (two a day, in the post's time zone); only for whoever may change it. */
  reminders_left_today: countSchema.optional(),
});
export type AnnouncementDetail = z.infer<typeof announcementDetailSchema>;

export const announcementListSchema = z.object({
  workspace_id: z.string().uuid(),
  can_manage: z.boolean(),
  /** May change a location's day or put a post on Important Dates. */
  can_write_dates: z.boolean(),
  /** May open Important Dates. */
  can_read_dates: z.boolean(),
  time_format: z.enum(["12h", "24h"]),
  /** Where this person may write. */
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      short_name: z.string(),
      timezone: z.string(),
      can_change_hours: z.boolean(),
      people_count: countSchema,
    }),
  ),
  /** Who this person may add by hand. */
  people: z.array(announcementPersonSchema),
  departments: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  jobs: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      department_id: z.string().uuid().nullable(),
    }),
  ),
  announcements: z.array(announcementRecordSchema),
});
export type AnnouncementList = z.infer<typeof announcementListSchema>;

/** Important Dates (under Announcements): every published record on it, past ones too. */
export const importantDateListSchema = z.object({
  workspace_id: z.string().uuid(),
  time_format: z.enum(["12h", "24h"]),
  can_write: z.boolean(),
  dates: z.array(announcementRecordSchema),
});
export type ImportantDateList = z.infer<typeof importantDateListSchema>;

/** What keeps the post from going out, at its tab and field. */
export const announcementProblemSchema = z.object({
  tab: z.enum(["details", "where", "aud"]),
  /** title, category_other, starts_on, ends_on, event_until, publish_at, people, or location:<id>. */
  field: z.string(),
  code: z.string(),
  message: z.string(),
  /** An empty field: shown once a Publish or Schedule was tried. */
  required: z.boolean(),
});
export type AnnouncementProblem = z.infer<typeof announcementProblemSchema>;

/** A published shift the new days reach, and what will happen to it. */
export const announcementImpactShiftSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string(),
  scheduled_date: z.string().date(),
  employee_id: z.string().uuid().nullable(),
  employee_user_id: z.string().uuid().nullable(),
  employee_name: z.string().nullable(),
  job_id: z.string().uuid().nullable(),
  job_name: z.string(),
  start_time: clockSchema,
  end_time: clockSchema,
  day: z.enum(["closed", "short"]),
  opens: clockSchema.nullable(),
  closes: clockSchema.nullable(),
  /** Closed, or with Short hours: prep (ends by opening), after_close, or over an edge. */
  reason: z.enum(["closed", "prep", "after_close", "over"]),
  started: z.boolean(),
  /** Part of an offboarding or a time off: it can't be removed. */
  tied: z.boolean(),
  changed_in_schedule: z.boolean(),
  default: z.enum(["keep", "remove"]),
  choice: z.enum(["keep", "remove", "open", "edit"]),
  from: clockSchema.nullable(),
  until: clockSchema.nullable(),
  outcome: z.enum(["removed", "opened", "edited", "kept"]),
});
export type AnnouncementImpactShift = z.infer<typeof announcementImpactShiftSchema>;

export const announcementPreviewSchema = z.object({
  problems: z.array(announcementProblemSchema),
  fingerprint: z.string().nullable(),
  /** Only shifts at locations the person reads the Schedule of. */
  shifts: z.array(announcementImpactShiftSchema),
  hidden_count: countSchema,
  /** Draft shifts that change without telling anyone. */
  quiet_count: countSchema,
  counts: z.object({
    removed: countSchema,
    edited: countSchema,
    opened: countSchema,
    kept: countSchema,
    quiet: countSchema,
  }),
  /** Shifts it changed that may come back. */
  bring_back: z.array(announcementShiftChangeSchema),
  time_zone: z.string(),
  starts_at: momentSchema.nullable(),
  ends_at: momentSchema.nullable(),
  recipient_count: countSchema,
});
export type AnnouncementPreview = z.infer<typeof announcementPreviewSchema>;

export const announcementSavedSchema = z.object({
  status: announcementStatusSchema,
  display_status: announcementDisplayStatusSchema,
  announcement_id: z.string().uuid(),
  revision: z.coerce.number().int().positive(),
  recipient_count: countSchema,
  shift_changes: countSchema,
  brought_back: countSchema,
});
export type AnnouncementSaved = z.infer<typeof announcementSavedSchema>;

/** Unschedule, Unpublish, Archive, Bring back (on an unpublished one), Remind (twice a day at most, KARARLAR S-126). */
export const announcementStateActionSchema = z.enum([
  "unschedule",
  "unpublish",
  "archive",
  "bring_back",
  "remind",
]);
export type AnnouncementStateAction = z.infer<typeof announcementStateActionSchema>;

export const announcementStateResultSchema = z.object({
  status: announcementStatusSchema,
  display_status: announcementDisplayStatusSchema,
  announcement_id: z.string().uuid(),
  revision: z.coerce.number().int().positive(),
  archived_at: momentSchema.nullable(),
  /** People told now. */
  told: countSchema,
  /** Reminds left today for this post (two a day, in its time zone). */
  reminders_left_today: countSchema.optional(),
});
export type AnnouncementStateResult = z.infer<typeof announcementStateResultSchema>;

export const communicationSavedResultSchema = z.object({
  status: z.literal("saved"),
  affected: z.coerce.number().int().nonnegative().optional(),
});
export type CommunicationSavedResult = z.infer<
  typeof communicationSavedResultSchema
>;

export const workspaceWidgetIdSchema = z.enum([
  "operations",
  "pending_requests",
  "open_shifts",
  "announcements",
  "todos",
  "quick_actions",
]);
export type WorkspaceWidgetId = z.infer<typeof workspaceWidgetIdSchema>;

const workspaceWidgetCount = workspaceWidgetIdSchema.options.length;

export const workspaceLayoutInputSchema = z
  .object({
    widget_order: z.array(workspaceWidgetIdSchema).length(workspaceWidgetCount),
    hidden_widget_ids: z
      .array(workspaceWidgetIdSchema)
      .max(workspaceWidgetCount),
  })
  .superRefine((value, issue) => {
    if (new Set(value.widget_order).size !== workspaceWidgetCount) {
      issue.addIssue({
        code: "custom",
        path: ["widget_order"],
        message: "Each workspace widget must appear exactly once",
      });
    }
  });
export type WorkspaceLayoutInput = z.infer<typeof workspaceLayoutInputSchema>;

export const ownerSetupChecklistItemIdSchema = z.enum([
  "app_tour",
  "scheduling_preferences",
  "employees",
  "documents",
  "schedule",
  "billing",
]);
export type OwnerSetupChecklistItemId = z.infer<
  typeof ownerSetupChecklistItemIdSchema
>;

export const ownerSetupChecklistProgressSchema = z.object({
  workspace_id: z.string().uuid(),
  user_id: z.string().uuid(),
  completed_item_ids: z.array(ownerSetupChecklistItemIdSchema),
  closed_at: z.string().datetime({ offset: true }).nullable(),
});
export type OwnerSetupChecklistProgress = z.infer<
  typeof ownerSetupChecklistProgressSchema
>;

export const workspaceTodoSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  severity: z.enum(["info", "warning", "action_required"]),
  status: z.enum(["open", "resolved"]),
  system_generated: z.boolean(),
  source_type: z.string(),
  source_id: z.string().uuid(),
  source_key: z.string(),
  employee_id: z.string().uuid().nullable(),
  due_at: z.string().datetime({ offset: true }).nullable(),
  action_url: appActionUrlSchema.nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export type WorkspaceTodo = z.infer<typeof workspaceTodoSchema>;

export const workspaceManualTodoInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(1000).default(""),
  employee_id: z.string().uuid().nullable().default(null),
  due_at: z.string().datetime({ offset: true }).nullable().default(null),
});
export type WorkspaceManualTodoInput = z.infer<
  typeof workspaceManualTodoInputSchema
>;

export const workspaceDashboardSchema = z.object({
  workspace_id: z.string().uuid(),
  display_name: z.string(),
  metrics: z.object({
    today_shift_count: z.coerce.number().int().nonnegative(),
    today_open_shift_count: z.coerce.number().int().nonnegative(),
    pending_time_off_count: z.coerce.number().int().nonnegative(),
  }),
  // When the first location in view reaches midnight and "today" turns
  // (BL-804); null with no location in view.
  today_ends_at: z.string().datetime({ offset: true }).nullable(),
  announcements: z.array(announcementRecordSchema).max(5),
  todos: z.array(workspaceTodoSchema).max(5),
  layout: workspaceLayoutInputSchema,
});
export type WorkspaceDashboard = z.infer<typeof workspaceDashboardSchema>;

const homeMomentSchema = z.string().datetime({ offset: true });
const homeDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * The managers' Home, "Locations first" (YONETICI-HOME, KARARLAR S-210): each
 * location in the actor's schedule scope with its day, its next seven days and
 * whoever works there without a required document (S-206), and the time off
 * waiting on an answer. Layout, to-dos and announcements stay on the
 * Workspace dashboard read.
 */
export const managerHomeLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  timezone: z.string(),
  today: homeDateSchema,
  today_shifts: z.array(z.object({ starts_at: homeMomentSchema, ends_at: homeMomentSchema, open: z.boolean() })),
  floor_managers: z.array(z.object({ name: z.string(), starts_at: homeMomentSchema, ends_at: homeMomentSchema })),
  week: z
    .array(
      z.object({
        date: homeDateSchema,
        shifts: z.coerce.number().int().nonnegative(),
        open: z.coerce.number().int().nonnegative(),
        published: z.boolean(),
      }),
    )
    .length(7),
  open_shifts: z.array(
    z.object({ date: homeDateSchema, starts_at: homeMomentSchema, ends_at: homeMomentSchema, job_name: z.string() }),
  ),
  missing_documents: z.array(z.object({ employee_id: z.string().uuid(), name: z.string(), document: z.string() })),
});
export type ManagerHomeLocation = z.infer<typeof managerHomeLocationSchema>;

export const managerHomeSchema = z.object({
  workspace_id: z.string().uuid(),
  now: homeMomentSchema,
  locations: z.array(managerHomeLocationSchema),
  time_off: z.array(
    z.object({
      id: z.string().uuid(),
      employee_id: z.string().uuid(),
      employee_name: z.string(),
      first_date: homeDateSchema.nullable(),
      last_date: homeDateSchema.nullable(),
      location_ids: z.array(z.string().uuid()),
    }),
  ),
});
export type ManagerHome = z.infer<typeof managerHomeSchema>;
