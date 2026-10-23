import { z } from "zod";

export const documentRequirementModeSchema = z.enum([
  "optional",
  "required",
  "conditional",
]);
export const documentCorrectionPeriodSchema = z.enum(["full", "remaining"]);
const ids = z
  .array(z.string().uuid())
  .max(500)
  .refine(
    (values) => new Set(values).size === values.length,
    "Selections must be unique",
  );
export const documentTargetSchema = z.object({
  operator: z.enum(["and", "or"]).default("and"),
  location_ids: ids.default([]),
  department_ids: ids.default([]),
  job_ids: ids.default([]),
  employee_ids: ids.default([]),
});
export type DocumentTarget = z.infer<typeof documentTargetSchema>;
const targetOption = z.object({ id: z.string().uuid(), name: z.string() });
export const documentTargetOptionsSchema = z.object({
  locations: z.array(targetOption),
  departments: z.array(targetOption),
  jobs: z.array(
    targetOption.extend({ department_id: z.string().uuid().nullable() }),
  ),
  employees: z.array(targetOption),
});
export type DocumentTargetOptions = z.infer<typeof documentTargetOptionsSchema>;

export const documentExtraFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["text", "date", "number"]),
  required: z.boolean(),
});
export const documentLifecycleSettingsSchema = z
  .object({
    mode: documentRequirementModeSchema,
    target: documentTargetSchema,
    assignment_scope: z.enum(["future_onboarding", "all_active"]),
    period_days: z.number().int().min(1).max(3650).nullable(),
    suspend_on_overdue: z.boolean(),
    extra_fields: z.array(documentExtraFieldSchema).max(20).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "optional" && value.suspend_on_overdue)
      ctx.addIssue({
        code: "custom",
        path: ["suspend_on_overdue"],
        message: "Optional documents cannot suspend access",
      });
    if (value.mode === "conditional" && value.period_days === null)
      ctx.addIssue({
        code: "custom",
        path: ["period_days"],
        message: "Conditional documents need a grace period",
      });
    if (value.suspend_on_overdue && value.period_days === null)
      ctx.addIssue({
        code: "custom",
        path: ["period_days"],
        message: "Suspension requires a delivery period",
      });
    if (
      new Set(value.extra_fields.map((field) => field.key)).size !==
      value.extra_fields.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["extra_fields"],
        message: "Field keys must be unique",
      });
  });
export type DocumentLifecycleSettings = z.infer<
  typeof documentLifecycleSettingsSchema
>;

export const defaultDocumentLifecycleSettings: DocumentLifecycleSettings = {
  mode: "optional",
  target: {
    operator: "and",
    location_ids: [],
    department_ids: [],
    job_ids: [],
    employee_ids: [],
  },
  assignment_scope: "future_onboarding",
  period_days: null,
  suspend_on_overdue: false,
  extra_fields: [],
};

export const documentObligationStatusSchema = z.enum([
  "missing",
  "grace",
  "pending_review",
  "rejected",
  "expired",
  "completed",
  "removed",
  "exempt",
  "timezone_required",
  "paused",
]);
export type DocumentObligationStatus = z.infer<
  typeof documentObligationStatusSchema
>;
const instant = z.string().datetime({ offset: true });
const revision = z.number().int().positive();
export const documentObligationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  employee_name: z.string(),
  title: z.string(),
  source_id: z.string().uuid().nullable(),
  kind: z.enum(["document", "acknowledgement"]),
  mode: documentRequirementModeSchema,
  status: documentObligationStatusSchema,
  revision,
  requires_review: z.boolean(),
  deadline_at: instant.nullable(),
  remaining_seconds: z.number().nonnegative().nullable(),
  rejection_reason: z.string().nullable(),
  suspended: z.boolean(),
  /** An owner is never asked for the documents they ask of everyone else. */
  exemption_locked: z.boolean().optional(),
  publication_paused: z.boolean().optional(),
  submitted_id: z.string().uuid().nullable(),
  approved_id: z.string().uuid().nullable(),
  location_ids: z.array(z.string().uuid()),
  location_names: z.array(z.string()),
  timezone: z.string().nullable(),
  settings: documentLifecycleSettingsSchema,
  accepted_formats: z.array(z.enum(["pdf", "jpeg", "png", "webp"])),
  tracks_expiry: z.boolean(),
  /** When the approved version runs out; null without one or without an expiry (Daylight Home). */
  expiry_date: z.string().date().nullable().optional(),
  /** The approved version runs out within its type's warning days (the manager's to-do rule). */
  expiring_soon: z.boolean().optional(),
});
export type DocumentObligation = z.infer<typeof documentObligationSchema>;
export const documentSubmissionFileSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  media_type: z.string(),
  size_bytes: z.number(),
  decision: z.enum(["keep", "discard"]),
  note: z.string(),
});
export const documentSubmissionSchema = z.object({
  id: z.string().uuid(),
  version: revision,
  state: z.enum([
    "draft",
    "pending_review",
    "accepted",
    "rejected",
    "superseded",
  ]),
  submitted_at: instant.nullable(),
  reviewed_at: instant.nullable(),
  expiry_date: z.string().date().nullable(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  rejection_reason: z.string().nullable(),
  files: z.array(documentSubmissionFileSchema),
});
export const documentDetailSchema = z.object({
  policy: z
    .object({
      content_text: z.string(),
      content_digest: z.string(),
      intent_statement: z.string(),
      can_withdraw: z.boolean().default(false),
      history: z
        .array(
          z.object({
            typed_name: z.string(),
            executed_at: instant,
            withdrawn_at: instant.nullable(),
            content_digest: z.string(),
          }),
        )
        .default([]),
      evidence: z
        .object({
          typed_name: z.string(),
          executed_at: instant,
          content_digest: z.string(),
          intent_statement: z.string(),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
  initial_deferral: z
    .object({ allowed: z.boolean(), reason: z.string().nullable() })
    .optional(),
  timezone_settings: z
    .object({
      value: z.string().nullable(),
      configured_value: z.string().nullable(),
      employee_revision: revision,
      can_manage: z.boolean(),
    })
    .optional(),
  obligation: documentObligationSchema,
  submissions: z.array(documentSubmissionSchema),
  history: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      occurred_at: instant,
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
});
export type DocumentDetail = z.infer<typeof documentDetailSchema>;

export const documentReviewCommandSchema = z
  .object({
    revision,
    submission_id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(500).default(""),
    correction_period: documentCorrectionPeriodSchema.default("full"),
    files: z
      .array(
        z.object({
          id: z.string().uuid(),
          decision: z.enum(["keep", "discard"]),
          note: z.string().trim().max(500).default(""),
        }),
      )
      .min(1),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "reject" && !value.reason)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A rejection reason is required",
      });
    if (
      value.decision === "approve" &&
      !value.files.some((file) => file.decision === "keep")
    )
      ctx.addIssue({
        code: "custom",
        path: ["files"],
        message: "Keep at least one file to approve",
      });
    if (new Set(value.files.map((file) => file.id)).size !== value.files.length)
      ctx.addIssue({
        code: "custom",
        path: ["files"],
        message: "Each file must have one decision",
      });
  });
export type DocumentReviewCommand = z.infer<typeof documentReviewCommandSchema>;
export const documentSubmitCommandSchema = z.object({
  revision,
  submission_id: z.string().uuid(),
  expiry_date: z.string().date().nullable(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});
export const documentReasonCommandSchema = z.object({
  revision,
  reason: z.string().trim().min(1).max(500),
});
export const documentAcknowledgeCommandSchema = z.object({
  revision,
  typed_name: z.string().trim().min(1).max(161),
  content_digest: z.string().regex(/^[0-9a-f]{64}$/),
  idempotency_key: z.string().uuid(),
});
export const documentApplyCommandSchema = z.object({
  revision,
  preview_token: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});
export const documentDefinitionPreviewSchema = z.object({
  revision,
  preview_token: z.string(),
  employees: z.array(
    z.object({
      employee_id: z.string().uuid(),
      employee_name: z.string(),
      requirement_id: z.string().uuid().nullable(),
      action: z.enum([
        "assign",
        "update",
        "reopen",
        "remove",
        "unchanged",
        "exempt",
      ]),
      revision: z.number().int().nullable(),
      deadline_action: z.enum(["preserve", "restart", "clear"]),
    }),
  ),
});
export type DocumentDefinitionPreview = z.infer<
  typeof documentDefinitionPreviewSchema
>;

export const documentPublicationPreviewSchema =
  documentDefinitionPreviewSchema.extend({
    transition: z.enum(["publish", "unpublish"]),
    employees: z.array(
      documentDefinitionPreviewSchema.shape.employees.element.extend({
        matches_target: z.boolean(),
        action: z.enum([
          "assign",
          "update",
          "reopen",
          "remove",
          "unchanged",
          "exempt",
          "pause",
        ]),
        deadline_action: z.enum(["preserve", "restart", "clear", "pause"]),
      }),
    ),
    publication_revision: revision,
    target: documentTargetSchema,
    assignment_scope: z.enum(["future_onboarding", "all_active"]),
    locations: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    departments: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    jobs: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    named_people: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  });
export type DocumentPublicationPreview = z.infer<
  typeof documentPublicationPreviewSchema
>;
export const documentPublishCommandSchema = documentApplyCommandSchema.extend({
  publication_revision: revision,
});

/** The Documents list's tabs, by whose move it is (KARARLAR S-255). */
export const documentStatusFilters = [
  "needs_review",
  "to_do",
  "completed",
] as const;
export type DocumentStatusFilter = (typeof documentStatusFilters)[number];
const documentStatusGroups: Record<
  DocumentStatusFilter,
  readonly DocumentObligationStatus[]
> = {
  needs_review: ["pending_review", "timezone_required"],
  to_do: ["missing", "grace", "rejected", "expired"],
  completed: ["completed", "exempt", "paused"],
};
/** The tab a status sits under; a removed one sits under none. */
export function documentStatusFilterOf(
  status: DocumentObligationStatus,
): DocumentStatusFilter | null {
  return (
    documentStatusFilters.find((filter) =>
      documentStatusGroups[filter].includes(status),
    ) ?? null
  );
}
export function documentMatchesStatus(
  status: DocumentObligationStatus,
  filter: DocumentStatusFilter,
): boolean {
  return documentStatusGroups[filter].includes(status);
}
/** A link's `status`, old tab names included; "all" and unknown open the list's own first tab. */
export function documentStatusFilterFromLink(
  value: string | null | undefined,
): DocumentStatusFilter | undefined {
  if (value === "missing" || value === "expired") return "to_do";
  if (value === "pending_review") return "needs_review";
  return documentStatusFilters.find((filter) => filter === value);
}

/** Jobs apply across the employee's assigned locations; departments belong to jobs. */
export function matchesDocumentTarget(
  target: DocumentTarget,
  employeeId: string,
  assignments: {
    location_ids: readonly string[];
    jobs: readonly { department_id: string | null; job_id: string }[];
  },
): boolean {
  if (target.employee_ids.includes(employeeId)) return true;
  if (
    !target.location_ids.length &&
    !target.department_ids.length &&
    !target.job_ids.length
  )
    return true;
  const locationMatches = assignments.location_ids.some((id) =>
    target.location_ids.includes(id),
  );
  if (target.operator === "or")
    return (
      (target.location_ids.length > 0 && locationMatches) ||
      assignments.jobs.some(
        (job) =>
          target.job_ids.includes(job.job_id) ||
          (job.department_id !== null &&
            target.department_ids.includes(job.department_id)),
      )
    );
  return (
    (!target.location_ids.length || locationMatches) &&
    ((!target.job_ids.length && !target.department_ids.length) ||
      assignments.jobs.some(
        (job) =>
          (!target.job_ids.length || target.job_ids.includes(job.job_id)) &&
          (!target.department_ids.length ||
            (job.department_id !== null &&
              target.department_ids.includes(job.department_id))),
      ))
  );
}

export const documentAssignmentImpactSchema = z.array(
  z.object({
    title: z.string(),
    action: z.enum(["assign", "remove", "reopen"]),
    deadline_at: instant.nullable(),
    period_days: z.number().int().nullable(),
    clears_block: z.boolean(),
  }),
);
export type DocumentAssignmentImpact = z.infer<
  typeof documentAssignmentImpactSchema
>;
