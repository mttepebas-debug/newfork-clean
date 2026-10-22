import { z } from "zod";
export * from "./us-forms";
import { toUsPhone, usPhoneSchema, usText } from "./us-forms";
export * from "./document-lifecycle.js";
import { documentLifecycleSettingsSchema } from "./document-lifecycle.js";
export * from "./timezones.js";
import { isValidIanaTimezone } from "./timezones.js";
import {
  employeeEligiblePermissions,
  personalRolePermissions,
  rolePermissionDependencies,
} from "./role-permissions";
export * from "./role-permissions";
import {
  timeOffCancellationContextSchema,
  timeOffPeriodReadSchema,
  timeOffProgressSchema,
  timeOffReleasedAssignmentSchema,
} from "./time-off";
export * from "./time-off";
import { shiftAvailabilityAssessmentSchema, scheduleConflictRulesSchema } from "./availability-assessment";
import { shiftTimeBasisSchema, shiftTimeSnapshotSchema } from "./availability";
import { announcementCategorySchema, announcementDaySchema } from "./communications";
import { lineupArtKeySchema } from "./lineup-art";
import { employeeProfilePhotoMimeTypes } from "./storage-access";

export * from "./availability";
export * from "./availability-assessment";
export * from "./weekly-preferences";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("newfork-api"),
  phase: z.literal("phase-10"),
});

export * from "./employee-hub";
export * from "./communications";
export * from "./notifications";
export * from "./storage-access";
export * from "./notification-settings";
export * from "./onboarding-approval";
export * from "./push-alerts";
export * from "./lineup";
export * from "./lineup-art";
export * from "./time-off-requests";

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const workspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "manager",
  "employee",
]);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const workspaceMembershipLifecycleStatusSchema = z.enum([
  "active",
  "pending_activation",
  "suspended",
  "removed",
]);
export type WorkspaceMembershipLifecycleStatus = z.infer<
  typeof workspaceMembershipLifecycleStatusSchema
>;

export const workspaceSummaryStatusSchema = z.enum([
  "active",
  "pending",
  "suspended",
  "removed",
]);
export type WorkspaceSummaryStatus = z.infer<
  typeof workspaceSummaryStatusSchema
>;

// Every state the account's own list can report, endings included: a workspace
// it cannot open any more is still a workspace it is owed an explanation about.
export const workspaceLifecycleStatusSchema = z.enum([
  "draft",
  "active",
  "suspended",
  "closure_scheduled",
  // In the database's own enum and nothing writes it, which is exactly why it
  // belongs here: the day something does, a workspace that says it is closed
  // would fail to parse and the account would be told nothing at all.
  "closed",
  // What the plan calls closed. Seven database functions write this word.
  "deleted",
]);
export type WorkspaceLifecycleStatus = z.infer<
  typeof workspaceLifecycleStatusSchema
>;

export const permissionSchema = z.enum([
  "availability.read",
  "availability.manage",
  "schedule.templates.read",
  "employee_access.read",
  "employees.private.read",
  "employees.private.manage",
  "employee_documents.read",
  "important_dates.read",
  "important_dates.manage",
  "settings.general.read",
  "settings.general.manage",
  "settings.locations.read",
  "settings.locations.manage",
  "settings.jobs.read",
  "settings.jobs.manage",
  "settings.shift_catalog.read",
  "settings.shift_catalog.manage",
  "settings.schedule_rules.read",
  "settings.schedule_rules.manage",

  "workspace.read",
  "workspace.manage",
  "schedule.read",
  "schedule.manage",
  "schedule.conflict_rules.manage",
  "schedule.publish",
  "schedule.templates.manage",
  "schedule.export",
  "schedule.time_off_requests.read",
  "schedule.time_off_requests.manage",
  "schedule.shift_change_requests.read",
  "schedule.shift_change_requests.manage",
  "roles.read",
  "roles.manage",
  "documents.read",
  "documents.manage",
  "employees.read",
  "employees.manage",
  "employees.archive",
  "employee_access.manage",
  "employee_onboarding.review",
  "employee_documents.review",
  "announcements.read",
  "announcements.manage",
  "notifications.read",
  "notifications.read_own",
  "notifications.preferences.write_own",
]);
export type Permission = z.infer<typeof permissionSchema>;

const rolePermissions = {
  owner: permissionSchema.options,
  // Admins edit roles by default (D2), as app_private.role_default_permissions.
  admin: permissionSchema.options,
  manager: [
    "employees.archive",
    "availability.read",
    "availability.manage",
    "schedule.templates.read",
    "important_dates.read",
    "important_dates.manage",
    "notifications.read_own",
    "notifications.preferences.write_own",
    "workspace.read",
    "schedule.read",
    "schedule.manage",
    "schedule.publish",
    "schedule.templates.manage",
    "schedule.export",
    "schedule.time_off_requests.read",
    "schedule.time_off_requests.manage",
    "schedule.shift_change_requests.read",
    "schedule.shift_change_requests.manage",
    "employees.read",
    "employees.manage",
    "employee_onboarding.review",
    // BL-560: the documents of the people where they manage, as app_private.role_default_permissions.
    "employee_documents.read",
    "employee_documents.review",
    // BL-680: the Settings catalog, read only (KARARLAR K14 S1).
    "settings.jobs.read",
    "settings.shift_catalog.read",
    "settings.schedule_rules.read",
    "documents.read",
    "announcements.read",
    "announcements.manage",
    "notifications.read",
  ],
  employee: [
    "workspace.read",
    "schedule.read",
    "announcements.read",
    "notifications.read",
  ],
} as const satisfies Record<WorkspaceRole, readonly Permission[]>;

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  logo_url: z.string().url().nullable().default(null),
  logo_file_name: z.string().trim().min(1).max(255).nullable().default(null),
  logo_updated_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .default(null),
  schedule_logo_placement: z
    .object({
      scale: z.number().min(0.25).max(4),
      offset_x: z.number().min(-100).max(100),
      offset_y: z.number().min(-100).max(100),
    })
    .default({ scale: 1, offset_x: 0, offset_y: 0 }),
});
export type Workspace = z.infer<typeof workspaceSchema>;
export type ScheduleLogoPlacement = Workspace["schedule_logo_placement"];
export const defaultScheduleLogoPlacement: ScheduleLogoPlacement = {
  scale: 1,
  offset_x: 0,
  offset_y: 0,
};
export const organizationLogoMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
] as const;
export const organizationLogoMaxBytes = 5 * 1024 * 1024;

/** A management access: Manager, Admin or Owner (ROL-CIFT, design §3). */
export const managementAccessSchema = z.enum(["manager", "admin", "owner"]);
export type ManagementAccess = z.infer<typeof managementAccessSchema>;

/**
 * The two access slots of a membership (ROL-CIFT, KARARLAR S-164 ... S-169):
 * the employee slot (held or not) and the management slot (none, Manager,
 * Admin or Owner). At least one is held.
 */
export const workspaceAccessSchema = z
  .object({
    employee: z.boolean(),
    management: managementAccessSchema.nullable(),
  })
  .refine((access) => access.employee || access.management !== null, {
    message: "A membership holds the employee access, a management access, or both",
  });
export type WorkspaceAccess = z.infer<typeof workspaceAccessSchema>;

/** Rank on the management side; somebody who only works ranks as an employee. */
export function accessRank(access: WorkspaceAccess): 1 | 2 | 3 | 4 {
  if (access.management === "owner") return 4;
  if (access.management === "admin") return 3;
  if (access.management === "manager") return 2;
  return 1;
}

/** The one class a screen shows: the management access's, else employee. */
export function accessClass(access: WorkspaceAccess): WorkspaceRole {
  return access.management ?? "employee";
}

export const workspaceMembershipSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  access: workspaceAccessSchema,
  roleId: z.string().uuid().optional(),
  roleName: z.string().trim().min(1).max(64).optional(),
  status: z.literal("active"),
});
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;

export const onboardingStatusSchema = z.enum(["incomplete", "complete"]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const workspaceOnboardingSchema = z.object({
  status: onboardingStatusSchema,
  currentStep: z.number().int().min(1).max(4),
  revision: z.number().int().positive().optional(),
});
export type WorkspaceOnboarding = z.infer<typeof workspaceOnboardingSchema>;

export const themePreferenceSchema = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const personalTimeFormatSchema = z.enum(["system", "12h", "24h"]);
export type PersonalTimeFormat = z.infer<typeof personalTimeFormatSchema>;

export const personalDateFormatSchema = z.enum([
  "system",
  "MM-DD-YYYY",
  "DD-MM-YYYY",
  "YYYY-MM-DD",
]);
export type PersonalDateFormat = z.infer<typeof personalDateFormatSchema>;

/**
 * The account's phone as it is written: a US number in E.164 (KARARLAR "Form
 * ve girdi kuralları"; no country picker, no international number). Empty is
 * no phone.
 */
export function normalizeAccountPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return usPhoneSchema.parse(toUsPhone(trimmed) ?? trimmed);
}

export const accountProfileSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().trim().min(1).max(100),
  // A US number in E.164 (BL-969); a typed one goes through normalizeAccountPhone.
  phone: usPhoneSchema.nullable().default(null),
  // AVATAR-IKON: no avatar here; each workspace has the person's own (ownAvatarResponseSchema).
  theme: themePreferenceSchema,
  timeFormat: personalTimeFormatSchema.default("system"),
  dateFormat: personalDateFormatSchema.default("system"),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

/**
 * AVATAR-IKON (design §4.3-4.5): a person's avatar in one workspace, a photo they uploaded or a
 * drawing from the Lineup archive. A photo travels only as a short-lived signed address, never its path.
 */
export const avatarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("photo"), url: z.string().url().nullable() }),
  z.object({ kind: z.literal("art"), art_key: lineupArtKeySchema }),
]);
export type Avatar = z.infer<typeof avatarSchema>;

/** One's own avatar here; present and url stay for the readers that knew only a photo (url only for a photo). */
export const ownAvatarResponseSchema = z.object({
  present: z.boolean(),
  url: z.string().url().nullable(),
  avatar: avatarSchema.nullable(),
  // The drawings one's jobs here suggest, the primary job's first.
  suggested: z.array(lineupArtKeySchema),
});
export type OwnAvatarResponse = z.infer<typeof ownAvatarResponseSchema>;

/** What a person saves as their avatar here: a drawing, a photo they uploaded here, or their last avatar. */
export const avatarChoiceSchema = z.union([
  z.object({ art_key: lineupArtKeySchema }).strict(),
  z.object({ photo_path: z.string().min(1).max(300) }).strict(),
  z.object({ use_last: z.literal(true) }).strict(),
]);
export type AvatarChoice = z.infer<typeof avatarChoiceSchema>;

/** The account's last avatar, offered in another workspace, and the workspace it came from. */
export const lastAvatarResponseSchema = z.object({
  avatar: avatarSchema.nullable(),
  from_workspace_name: z.string().nullable(),
});
export type LastAvatarResponse = z.infer<typeof lastAvatarResponseSchema>;

/** The machine keys of the avatar refusals, for the screens to tell them apart. */
export const avatarReasons = {
  /** The uploaded photo is not a JPG, PNG or WebP of at most 5 MB, or is not in storage (400). */
  photoInvalid: "avatar.photo_invalid",
  /** "Use my last avatar" with none to use (409). */
  noLastAvatar: "avatar.no_last_avatar",
  /** A manager removes only an uploaded photo, not a drawing or nothing (409, the database's PT409). */
  notPhoto: "avatar.not_photo",
} as const;
export type AvatarReason = (typeof avatarReasons)[keyof typeof avatarReasons];

/** A photo upload is asked for by its image type; the API names the place. */
export const avatarUploadRequestSchema = z.object({ content_type: z.enum(employeeProfilePhotoMimeTypes) });
export type AvatarUploadRequest = z.infer<typeof avatarUploadRequestSchema>;
export const avatarUploadResponseSchema = z.object({ path: z.string(), token: z.string() });
export type AvatarUploadResponse = z.infer<typeof avatarUploadResponseSchema>;

/** What a request for a preferred name did: took effect, or is waiting. */
export const preferredNameOutcomeSchema = z.enum([
  "published",
  "waiting",
  "cleared",
]);
export type PreferredNameOutcome = z.infer<typeof preferredNameOutcomeSchema>;

export const pendingPreferredNameSchema = z.object({
  requestId: z.string().uuid(),
  employeeId: z.string().uuid(),
  employeeName: z.string(),
  requestedName: z.string(),
  requestedAt: z.string(),
});
export type PendingPreferredName = z.infer<typeof pendingPreferredNameSchema>;

export function pendingPreferredNameFromRow(
  input: unknown,
): PendingPreferredName {
  const row = z
    .object({
      request_id: z.string().uuid(),
      employee_id: z.string().uuid(),
      employee_name: z.string(),
      requested_name: z.string(),
      requested_at: z.string(),
    })
    .parse(input);
  return {
    requestId: row.request_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    requestedName: row.requested_name,
    requestedAt: row.requested_at,
  };
}

/**
 * What each part of the account area is waiting for from this person. A number
 * means somebody is waiting for an answer; it closes when the thing is done,
 * not when the tab is opened.
 */
export const accountAttentionSchema = z.object({
  documents: z.number().int().nonnegative(),
  workspaces: z.number().int().nonnegative(),
});
export type AccountAttention = z.infer<typeof accountAttentionSchema>;

/**
 * A person's own employment record in one workspace. There is one per
 * workspace they are in, because that is where an employment record lives.
 */
export const employmentContactRecordSchema = z.object({
  workspaceId: z.string().uuid(),
  workspaceName: z.string(),
  employeeId: z.string().uuid(),
  preferredName: z.string(),
  // A US number in E.164, as the data keeps it (BL-969); "" until a contact is given.
  phone: usPhoneSchema.nullable(),
  emergencyContactName: z.string(),
  emergencyContactRelationship: z.string(),
  emergencyContactPhone: usPhoneSchema.or(z.literal("")),
  emergencyContactEmail: z.string(),
});
export type EmploymentContactRecord = z.infer<
  typeof employmentContactRecordSchema
>;

export function employmentContactRecordFromRow(
  input: unknown,
): EmploymentContactRecord {
  const row = z
    .object({
      workspace_id: z.string().uuid(),
      workspace_name: z.string(),
      employee_id: z.string().uuid(),
      preferred_name: z.string(),
      phone: z.string().nullable(),
      emergency_contact_name: z.string(),
      emergency_contact_relationship: z.string(),
      emergency_contact_phone: z.string(),
      emergency_contact_email: z.string(),
    })
    .parse(input);
  return employmentContactRecordSchema.parse({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    employeeId: row.employee_id,
    preferredName: row.preferred_name,
    phone: row.phone,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactRelationship: row.emergency_contact_relationship,
    emergencyContactPhone: row.emergency_contact_phone,
    emergencyContactEmail: row.emergency_contact_email,
  });
}

/**
 * The owner's legal name: the name on their ID, the one documents and
 * signatures read. First and last are required; a middle name may be empty.
 * The limits are the database's (app_private.write_owner_legal_name).
 */
export const ownerLegalNameSchema = z.object({
  firstName: usText(z.string().trim().min(1).max(80)),
  middleName: usText(z.string().trim().max(80)),
  lastName: usText(z.string().trim().min(1).max(80)),
});
export type OwnerLegalName = z.infer<typeof ownerLegalNameSchema>;

/** What Account > Profile reads: null until a legal name is on file. */
export const ownerLegalNameResponseSchema = z.object({
  legalName: ownerLegalNameSchema.nullable(),
});

export const workspaceSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  role: workspaceRoleSchema,
  status: workspaceSummaryStatusSchema.default("active"),
  isActive: z.boolean(),
  onboarding: workspaceOnboardingSchema,
  lifecycleStatus: workspaceLifecycleStatusSchema.optional(),
  /** The account's access was taken, rather than the workspace being on hold. */
  accessRemoved: z.boolean().optional(),
  /**
   * How many other people hold access, and how many invitations are waiting
   * for an answer. The reader is not counted in the first: they know about
   * themselves, and what a closing screen has to say is what it costs everyone
   * else.
   */
  otherMemberCount: z.number().int().nonnegative().optional(),
  pendingInvitationCount: z.number().int().nonnegative().optional(),
  /**
   * Where a scheduled closure would land if nobody names a date. The rule is
   * the database's; this is what it produces, so the panel can say it before
   * anybody commits to anything.
   */
  defaultClosureEffectiveAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  /** When this membership was last opened; the landing decision sorts by it. */
  lastUsedAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  closureEffectiveAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  pendingOwnershipTransfer: z
    .object({
      id: z.string().uuid(),
      role: z.enum(["initiator", "target"]),
      expiresAt: z.string().datetime({ offset: true }),
    })
    .nullable()
    .optional(),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

/**
 * What an invitation link turned out to be. The screen picks its words from
 * this, not from the server's English sentence: a reworded message used to move
 * the page to a different branch without anyone noticing.
 */
export const invitationPreviewStateSchema = z.enum([
  "valid",
  "expired",
  "revoked",
  // Revoked because a newer invitation went to the same address (K7).
  "replaced",
  "declined",
  "accepted",
  "workspace_unavailable",
]);
export type InvitationPreviewState = z.infer<
  typeof invitationPreviewStateSchema
>;

export const invitationPreviewSchema = z.object({
  state: invitationPreviewStateSchema,
  workspaceName: z.string().trim().min(1).max(120),
  /** Masked: enough to recognise the address, not enough to learn it. */
  emailHint: z.string().trim().min(1),
  expiresAt: z.string().datetime({ offset: true }),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** Why an invitation could not be accepted, in a word the screen can branch on. */
export const invitationFailureCodeSchema = z.enum([
  "invitation_not_found",
  "invitation_email_mismatch",
  "already_member",
  "invitation_unavailable",
  // The account has not confirmed its email address yet, so it may not accept
  // or decline an invitation (SEC-003).
  "email_unconfirmed",
]);
export type InvitationFailureCode = z.infer<typeof invitationFailureCodeSchema>;

export const accountPendingInvitationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceName: z.string().trim().min(1).max(120),
  emailHint: z.string().trim().min(1),
  expiresAt: z.string().datetime({ offset: true }),
});
export type AccountPendingInvitation = z.infer<
  typeof accountPendingInvitationSchema
>;

/**
 * How one workspace has this account on file. The account is global and each
 * workspace keeps its own record of the person; this is the pair, side by side.
 */
export const workspaceIdentitySchema = z.object({
  workspaceId: z.string().uuid(),
  workspaceName: z.string().trim().min(1).max(120),
  role: workspaceRoleSchema,
  /** Null while the workspace has no employee record for this account. */
  employeeName: z.string().trim().min(1).max(200).nullable(),
  employeeCode: z.string().trim().min(1).max(40).nullable(),
});
export type WorkspaceIdentity = z.infer<typeof workspaceIdentitySchema>;

export const workspaceSummaryRowSchema = z.object({
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  workspace_role: workspaceRoleSchema,
  membership_status: workspaceMembershipLifecycleStatusSchema
    .optional()
    .default("active"),
  is_active: z.boolean(),
  onboarding_status: onboardingStatusSchema,
  onboarding_current_step: z.coerce.number().int().min(1).max(4),
  workspace_lifecycle_status: workspaceLifecycleStatusSchema
    .optional()
    .default("active"),
  closure_effective_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .default(null),
  last_used_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
  access_removed: z.boolean().optional(),
  other_member_count: z.number().int().nonnegative().nullable().optional(),
  pending_invitation_count: z.number().int().nonnegative().nullable().optional(),
  default_closure_effective_at: z.string().nullable().optional(),
  pending_ownership_transfer_id: z.string().uuid().nullable().optional(),
  pending_ownership_transfer_role: z
    .enum(["initiator", "target"])
    .nullable()
    .optional(),
  pending_ownership_transfer_expires_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional(),
});

export function workspaceSummaryFromRow(input: unknown): WorkspaceSummary {
  const row = workspaceSummaryRowSchema.parse(input);
  const status = workspaceSummaryStatusFromMembershipStatus(
    row.membership_status,
  );
  return workspaceSummarySchema.parse({
    id: row.workspace_id,
    name: row.workspace_name,
    role: row.workspace_role,
    status,
    isActive: row.is_active && status === "active",
    onboarding: {
      status: row.onboarding_status,
      currentStep: row.onboarding_current_step,
      revision: 1,
    },
    lifecycleStatus: row.workspace_lifecycle_status,
    lastUsedAt: row.last_used_at ?? null,
    accessRemoved: row.access_removed ?? false,
    otherMemberCount: row.other_member_count ?? undefined,
    pendingInvitationCount: row.pending_invitation_count ?? undefined,
    defaultClosureEffectiveAt: row.default_closure_effective_at ?? null,
    closureEffectiveAt: row.closure_effective_at,
    pendingOwnershipTransfer:
      status === "active" &&
      row.pending_ownership_transfer_id &&
      row.pending_ownership_transfer_role &&
      row.pending_ownership_transfer_expires_at
        ? {
            id: row.pending_ownership_transfer_id,
            role: row.pending_ownership_transfer_role,
            expiresAt: row.pending_ownership_transfer_expires_at,
          }
        : null,
  });
}

export function workspaceSummaryStatusFromMembershipStatus(
  status: WorkspaceMembershipLifecycleStatus,
): WorkspaceSummaryStatus {
  if (status === "removed") return "removed";
  if (status === "suspended") return "suspended";
  if (status === "pending_activation") return "pending";
  return "active";
}

export const activeWorkspaceContextSchema = z
  .object({
    userId: z.string().uuid(),
    workspace: workspaceSchema,
    membership: workspaceMembershipSchema,
    documentAccess: z.object({ restricted: z.boolean() }),
    permissions: z.array(permissionSchema),
    // What the authorization core lets this person do somewhere in the
    // workspace (app_private.actor_actions); gates read this, not permissions.
    actions: z.array(z.string()).default([]),
    onboarding: workspaceOnboardingSchema,
    locationScope: z.object({
      allLocations: z.boolean(),
      locationIds: z.array(z.string().uuid()),
    }),
  })
  .superRefine((context, issue) => {
    if (context.userId !== context.membership.userId) {
      issue.addIssue({
        code: "custom",
        message: "Membership user does not match context user",
      });
    }
    if (context.workspace.id !== context.membership.workspaceId) {
      issue.addIssue({
        code: "custom",
        message: "Membership workspace does not match context",
      });
    }
  });
export type ActiveWorkspaceContext = z.infer<
  typeof activeWorkspaceContextSchema
>;

export const activeWorkspaceRowSchema = z.object({
  user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  workspace_logo_storage_path: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .default(null),
  workspace_logo_file_name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .nullable()
    .default(null),
  workspace_logo_updated_at: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .default(null),
  schedule_logo_scale: z.coerce.number().min(0.25).max(4).default(1),
  schedule_logo_offset_x: z.coerce.number().min(-100).max(100).default(0),
  schedule_logo_offset_y: z.coerce.number().min(-100).max(100).default(0),
  membership_id: z.string().uuid(),
  management_access: managementAccessSchema.nullable(),
  employee_access: z.boolean(),
  membership_role_id: z.string().uuid().optional(),
  membership_role_name: z.string().trim().min(1).max(64).optional(),
  permission_keys: z.array(permissionSchema),
  all_locations: z.boolean(),
  onboarding_status: onboardingStatusSchema,
  onboarding_current_step: z.coerce.number().int().min(1).max(4),
  onboarding_revision: z.coerce.number().int().positive(),
  actions: z.array(z.string()),
  location_ids: z.array(z.string().uuid()),
  document_restricted: z.boolean(),
});
export type ActiveWorkspaceRow = z.infer<typeof activeWorkspaceRowSchema>;

export function activeWorkspaceContextFromRow(
  input: unknown,
): ActiveWorkspaceContext {
  const row = activeWorkspaceRowSchema.parse(input);
  return activeWorkspaceContextSchema.parse({
    userId: row.user_id,
    actions: row.actions,
    documentAccess: { restricted: row.document_restricted },
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name,
      logo_url: null,
      logo_file_name: row.workspace_logo_file_name,
      logo_updated_at: row.workspace_logo_updated_at,
      schedule_logo_placement: {
        scale: row.schedule_logo_scale,
        offset_x: row.schedule_logo_offset_x,
        offset_y: row.schedule_logo_offset_y,
      },
    },
    membership: {
      id: row.membership_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      access: { employee: row.employee_access, management: row.management_access },
      roleId: row.membership_role_id,
      roleName: row.membership_role_name,
      status: "active",
    },
    permissions: [
      ...new Set([
        ...row.permission_keys.filter(
          (permission) =>
            row.management_access !== null ||
            employeeEligiblePermissions.includes(permission),
        ),
        ...personalRolePermissions,
      ]),
    ],
    onboarding: {
      status: row.onboarding_status,
      currentStep: row.onboarding_current_step,
      revision: row.onboarding_revision,
    },
    locationScope: {
      allLocations: row.all_locations,
      locationIds: row.all_locations ? [] : row.location_ids,
    },
  });
}

export function permissionsForRole(role: WorkspaceRole): readonly Permission[] {
  return rolePermissions[role];
}

export function canAccessWorkspace(
  context: ActiveWorkspaceContext,
  workspaceId: string,
  permission: Permission,
): boolean {
  return (
    context.workspace.id === workspaceId &&
    context.permissions.includes(permission)
  );
}

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  targetType: z.string().trim().min(1).max(80),
  targetId: z.string().trim().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

/** A department's or a job's name, under the US letter rule (BL-503, BL-969). */
const entityNameSchema = usText(z.string().trim().min(1).max(100));
export const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a six-digit hex color");

export { scheduleExportV2PreferencesSchema, scheduleExportV2ScopeSchema, scheduleExportV2AuthorizationSchema,
  type ScheduleExportV2Preferences, type ScheduleExportV2Scope } from "./schedule-export-v2";

export const locationShortNameSchema = z.string().trim().toUpperCase().regex(
  /^[A-Z0-9-]{2,12}$/,
  "Use 2–12 characters: letters A–Z, numbers or hyphens. No spaces or other symbols.",
);

function asciiLetters(value: string): string {
  return value.replace(/ı/g, "i").replace(/İ/g, "I").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Multi-word: initials. One word: first letter + following consonants (max 3).
// Empty when nothing of length 2 fits.
export function suggestLocationShortName(name: string): string {
  const words = asciiLetters(name).toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (words.length > 1) {
    const initials = words.map((word) => word[0]).join("").slice(0, 12);
    return initials.length >= 2 ? initials : "";
  }
  const word = words[0] ?? "";
  const consonants = word.slice(0, 1) + word.slice(1).replace(/[AEIOU0-9]/g, "");
  // Too few consonants: first 3 distinct characters (Deea → DEA).
  const pick = consonants.length >= 2 ? consonants.slice(0, 3) : [...new Set(word)].join("").slice(0, 3);
  return pick.length >= 2 ? pick : "";
}

export const locationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  // The US letter rule (BL-503), in the data too (BL-969).
  name: usText(z.string().trim().min(1).max(120)),
  short_name: locationShortNameSchema,
  phone: usPhoneSchema.nullable().optional(),
  street_address: usText(z.string().trim().max(180)),
  city: usText(z.string().trim().max(100)),
  region: usText(z.string().trim().max(100)),
  postal_code: z.string().trim().max(20),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  timezone: z.string().trim().min(1).max(80),
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type Location = z.infer<typeof locationSchema>;

export const departmentSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: entityNameSchema,
  color: colorSchema,
  archived_at: z.string().datetime({ offset: true }).nullable(),
  // Set by workspace setup on the one department that is Management (BL-218).
  system_key: z.enum(["management"]).nullable(),
});
export type Department = z.infer<typeof departmentSchema>;

export const jobSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  department_id: z.string().uuid().nullable(),
  name: entityNameSchema,
  color: colorSchema,
  archived_at: z.string().datetime({ offset: true }).nullable(),
  // Set by workspace setup on the one job that is Owner (BL-218).
  system_key: z.enum(["owner"]).nullable(),
  // AVATAR-IKON: the job's Lineup drawings, archive keys in order (the database suggests them at birth).
  lineup_icons: z.array(lineupArtKeySchema),
});
export type Job = z.infer<typeof jobSchema>;

/**
 * What a person reads when the database keeps Management, the Owner job or the
 * owner's own assignments (23514), or when the Employees drawer's save is
 * missing a location or job (22023, .3b) — BL-218, keyed by the hint raised.
 * The API answers with these and the web uses them for the writes it still
 * makes straight to the tables (Settings → Jobs archive and save).
 */
export const managementAndOwnerRefusals = {
  "catalog.system_record":
    "Management and the Owner job come with every workspace. You can rename them, but you can't archive or delete them, and the Owner job stays in Management.",
  "employee.owner_job":
    "The workspace owner always holds the Owner job, so it can't be removed from them.",
  "employee.management_primary":
    "The Owner job can't be marked primary. Choose another job as primary, or leave it empty if they only hold the Owner job.",
  "employee.owner_locations":
    "The workspace owner works at every location, so a location can't be removed from them.",
  // DAVET-ERISIM (Mert 2026-10-20): Remote and Exclude from schedule never lift these.
  "employee.location_required": "Choose at least one location and mark one as primary.",
  "employee.job_required": "Choose at least one job.",
  // EMP-001 K4: a manager manages where they are assigned, so one who is not
  // Remote is assigned somewhere, excluded from the schedule or not.
  "employee.manager_location_required":
    "A manager needs at least one location to manage. Choose a location.",
  // EMP-001 S2: any job can be primary, Manager too; only the Owner job never is.
  "employee.primary_job_required": "Mark one of the jobs as primary.",
  // DAVET-ERISIM: what an invitation or an access change has to name (Tur 4 B).
  "access.role_required": "Choose at least one access.",
  "access.management_role_required": "Choose a role for the management app.",
  "access.manages_required": "Choose at least one location they manage.",
  "access.manages_only_for_manager": "Only a manager manages chosen locations.",
  "access.management_job_required": "Add a job from Management in Employment first.",
} as const;
/** The sentence for one of those hints; undefined for any other hint. */
export function managementAndOwnerSentence(hint: string | null | undefined): string | undefined {
  const sentences: Readonly<Record<string, string>> = managementAndOwnerRefusals;
  return hint && Object.hasOwn(sentences, hint) ? sentences[hint] : undefined;
}

/**
 * The jobs under Management (BL-218). Management can be renamed, so it is
 * found by its department's system key, never by name. They sort last in
 * Schedule's Job/Position and do not count towards finishing setup; any of
 * them but the Owner job can be somebody's primary (EMP-001 S2).
 */
export function managementJobIds(
  departments: readonly { readonly id: string; readonly system_key: "management" | null }[],
  jobs: readonly { readonly id: string; readonly department_id: string | null }[],
): Set<string> {
  const management = departments.find((department) => department.system_key === "management")?.id;
  return new Set(management ? jobs.filter((job) => job.department_id === management).map((job) => job.id) : []);
}

export const locationInputSchema = locationSchema.pick({
  name: true,
  short_name: true,
  phone: true,
  street_address: true,
  city: true,
  region: true,
  postal_code: true,
  country_code: true,
  timezone: true,
}).extend({
  timezone: z.string().trim().max(80).refine(isValidIanaTimezone, "Select a valid IANA time zone"),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export const departmentInputSchema = departmentSchema.pick({
  name: true,
  color: true,
});
export type DepartmentInput = z.infer<typeof departmentInputSchema>;

/** At most this many Lineup drawings on one job (the database's limit too). */
export const maxJobLineupIcons = 24;

// AVATAR-IKON: left out, a new job takes the database's suggestion and a save keeps the job's list.
export const jobInputSchema = jobSchema
  .pick({
    name: true,
    color: true,
    department_id: true,
  })
  .extend({
    lineup_icons: z.array(lineupArtKeySchema).max(maxJobLineupIcons).optional(),
  });
export type JobInput = z.infer<typeof jobInputSchema>;

// A department's new jobs are born with the database's suggested drawings (AVATAR-IKON).
const departmentJobInputSchema = jobInputSchema.omit({ department_id: true, lineup_icons: true });

export const departmentWithJobsInputSchema = z.object({
  department: departmentInputSchema,
  jobs: z.array(departmentJobInputSchema).max(500),
});
export type DepartmentWithJobsInput = z.infer<
  typeof departmentWithJobsInputSchema
>;
export const jobDeletionResultSchema = z.object({
  removed_count: z.number().int().nonnegative(),
});
export const departmentJobsInputSchema = z.object({
  jobs: departmentJobInputSchema.array().min(1).max(500),
});
export const departmentWithJobsResultSchema = z.object({
  department: departmentSchema,
  jobs: z.array(jobSchema),
});
export const organizationJobCountsSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string().uuid(),
      employee_count: z.coerce.number().int().nonnegative(),
    }),
  ),
  departments: z.array(
    z.object({
      id: z.string().uuid(),
      employee_count: z.coerce.number().int().nonnegative(),
    }),
  ),
});
export type OrganizationJobCounts = z.infer<typeof organizationJobCountsSchema>;
export const jobAssignmentQuerySchema = z.object({
  search: z.string().trim().max(100).default(""),
  location_id: z.string().uuid().optional(),
  filter: z.enum(["all", "assigned", "unassigned"]).default("all"),
  page: z.coerce.number().int().min(0).max(100000).default(0),
});
export type JobAssignmentQuery = z.infer<typeof jobAssignmentQuerySchema>;
export const jobAssignmentEmployeeSchema = z.object({
  employee_id: z.string().uuid(),
  display_name: z.string(),
  employee_code: z.string(),
  location_name: z.string().nullable(),
  display_status: z.string(),
  assigned: z.boolean(),
  is_primary: z.boolean(),
  revision: z.number().int().positive(),
  can_manage: z.boolean(),
  disabled_reason: z.string().nullable(),
});
export type JobAssignmentEmployee = z.infer<typeof jobAssignmentEmployeeSchema>;
export const jobAssignmentPageSchema = z.object({
  employees: z.array(jobAssignmentEmployeeSchema),
  total: z.coerce.number().int().nonnegative(),
  manageable_total: z.coerce.number().int().nonnegative(),
  assigned_count: z.coerce.number().int().nonnegative(),
  locations: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type JobAssignmentPage = z.infer<typeof jobAssignmentPageSchema>;
export const jobAssignmentTargetSchema = jobAssignmentEmployeeSchema.pick({
  employee_id: true,
  assigned: true,
  revision: true,
});
export type JobAssignmentTarget = z.infer<typeof jobAssignmentTargetSchema>;
export const jobAssignmentChangeSchema = z.object({
  employee_id: z.string().uuid(),
  assigned: z.boolean(),
  expected_revision: z.number().int().positive(),
});
export type JobAssignmentChange = z.infer<typeof jobAssignmentChangeSchema>;
export const jobAssignmentChangesSchema = z
  .object({
    changes: z.array(jobAssignmentChangeSchema).min(1).max(10000),
  })
  .refine(
    (value) =>
      new Set(value.changes.map((row) => row.employee_id)).size ===
      value.changes.length,
    {
      message: "An employee may only appear once in a batch",
      path: ["changes"],
    },
  );
export const jobAssignmentResultSchema = z.object({
  changed_count: z.number().int().nonnegative(),
  unchanged_count: z.number().int().nonnegative(),
});

export const jobDetailsChangesSchema = z
  .object({
    job: jobInputSchema.optional(),
    expected_job: jobInputSchema.optional(),
    changes: z.array(jobAssignmentChangeSchema).max(10000).default([]),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.job) !== Boolean(value.expected_job))
      ctx.addIssue({
        code: "custom",
        message: "Job details require their original values",
        path: ["expected_job"],
      });
    if (!value.job && !value.changes.length)
      ctx.addIssue({
        code: "custom",
        message: "Choose at least one change",
        path: ["changes"],
      });
    if (
      new Set(value.changes.map((row) => row.employee_id)).size !==
      value.changes.length
    )
      ctx.addIssue({
        code: "custom",
        message: "An employee may only appear once in a batch",
        path: ["changes"],
      });
  });
export type JobDetailsChanges = z.infer<typeof jobDetailsChangesSchema>;
export const jobDetailsResultSchema = jobAssignmentResultSchema.extend({
  job: jobSchema,
});
export const jobCreateWithAssignmentsSchema = z
  .object({
    job: jobInputSchema,
    changes: z.array(jobAssignmentChangeSchema).max(10000).default([]),
  })
  .refine(
    (value) =>
      new Set(value.changes.map((row) => row.employee_id)).size ===
      value.changes.length,
    {
      message: "An employee may only appear once in a batch",
      path: ["changes"],
    },
  );
export type JobCreateWithAssignments = z.infer<
  typeof jobCreateWithAssignmentsSchema
>;
export const jobCreateWithAssignmentsResultSchema = jobDetailsResultSchema;

export const weekStartDaySchema = z.enum(["sunday", "monday"]);
export const scheduleDeadlineDaySchema = z.enum([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
export const scheduleTimeFormatSchema = z.enum(["12h", "24h"]);

export const schedulingSettingsSchema = z.object({
  workspace_id: z.string().uuid(),
  week_start_day: weekStartDaySchema,
  schedule_deadline_day: scheduleDeadlineDaySchema,
  minimum_travel_minutes: z.number().int().min(0).max(240).optional(),
  minimum_rest_minutes: z.number().int().min(0).max(1440).optional(),
  conflict_rules: scheduleConflictRulesSchema.optional(),
  conflict_rules_revision: z.number().int().positive().optional(),
  time_format: scheduleTimeFormatSchema,
  // Settings > Scheduling: a request must be decided this many hours before it starts.
  time_off_lead_hours: z.number().int().min(0).max(720).optional(),
});
export type SchedulingSettings = z.infer<typeof schedulingSettingsSchema>;
export const schedulingSettingsInputSchema = schedulingSettingsSchema.omit({
  workspace_id: true,
});
export type SchedulingSettingsInput = z.infer<
  typeof schedulingSettingsInputSchema
>;

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleUnpaidBreakMinutesSchema = z.union([
  z.literal(0),
  z.literal(15),
  z.literal(30),
  z.literal(45),
  z.literal(60),
]);
// BL-1031: one sentence wherever equal hours are refused (the database says it too).
export const SAME_START_END_TIME_MESSAGE = "Start and end time cannot be the same.";

// PRESET-SAAT (KARARLAR S-183): the hours a shift type offers besides its
// primary ones (default_start_time / default_end_time), in order. The database
// checks the same rules (trigger shift_types_time_options).
export const SHIFT_TYPE_TIME_OPTIONS_MAX = 8;
export const shiftTypeTimeOptionSchema = z.object({
  start_time: timeOfDaySchema,
  end_time: timeOfDaySchema,
});
export type ShiftTypeTimeOption = z.infer<typeof shiftTypeTimeOptionSchema>;
const shiftTypeTimeOptionsSchema = z.array(shiftTypeTimeOptionSchema).max(SHIFT_TYPE_TIME_OPTIONS_MAX);

/** Why a type's hours cannot be saved, or null: the primary and every option differ and appear once. */
export function shiftTypeTimesRefusal(value: {
  readonly default_start_time: string | null;
  readonly default_end_time: string | null;
  readonly time_options: readonly ShiftTypeTimeOption[];
}): { readonly index: number; readonly message: string } | null {
  const seen = new Set<string>();
  if (value.default_start_time && value.default_end_time) seen.add(`${value.default_start_time}-${value.default_end_time}`);
  for (const [index, option] of value.time_options.entries()) {
    if (option.start_time === option.end_time) return { index, message: SAME_START_END_TIME_MESSAGE };
    const pair = `${option.start_time}-${option.end_time}`;
    if (seen.has(pair)) return { index, message: "This time is already in the list." };
    seen.add(pair);
  }
  if (value.time_options.length > SHIFT_TYPE_TIME_OPTIONS_MAX)
    return { index: SHIFT_TYPE_TIME_OPTIONS_MAX, message: `Keep up to ${SHIFT_TYPE_TIME_OPTIONS_MAX + 1} times.` };
  return null;
}

export const shiftTypeSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  color: colorSchema,
  default_start_time: timeOfDaySchema.nullable(),
  default_end_time: timeOfDaySchema.nullable(),
  /** Missing in an older reply: read as none. */
  time_options: shiftTypeTimeOptionsSchema.optional(),
  default_revision: z.number().int().positive().optional(),
  crosses_midnight: z.boolean(),
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type ShiftType = z.infer<typeof shiftTypeSchema>;


export const shiftTypeInputSchema = shiftTypeSchema
  .pick({
    name: true,
    color: true,
    default_start_time: true,
    default_end_time: true,
  })
  .extend({ time_options: shiftTypeTimeOptionsSchema.default([]) })
  .refine(
    (value) =>
      Boolean(value.default_start_time) === Boolean(value.default_end_time),
    {
      message: "Start and end times must both be set",
      path: ["default_end_time"],
    },
  )
  .refine(
    (value) =>
      !value.default_start_time ||
      value.default_start_time !== value.default_end_time,
    {
      message: SAME_START_END_TIME_MESSAGE,
      path: ["default_end_time"],
    },
  )
  .refine((value) => !shiftTypeTimesRefusal(value), {
    message: "Each time needs a different start and end and appears once.",
    path: ["time_options"],
  });
export type ShiftTypeInput = z.infer<typeof shiftTypeInputSchema>;
/** What a form may send before parsing: time_options may be missing. */
export type ShiftTypeInputDraft = z.input<typeof shiftTypeInputSchema>;

export const shiftLabelSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  color: colorSchema,
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type ShiftLabel = z.infer<typeof shiftLabelSchema>;

export const shiftLabelInputSchema = shiftLabelSchema.pick({
  name: true,
  color: true,
});
export type ShiftLabelInput = z.infer<typeof shiftLabelInputSchema>;

export const scheduleViewSchema = z.enum(["day", "week"]);
export type ScheduleView = z.infer<typeof scheduleViewSchema>;

export const scheduleLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  // Only the schedule read carries it; other projections omit it.
  short_name: locationShortNameSchema.optional(),
  timezone: z.string().trim().min(1).max(80),
  sort_order: z.coerce.number().int().nonnegative(),
  publication_status: z.enum(["published", "unpublished"]),
  published_at: z.string().datetime({ offset: true }).nullable(),
});
export type ScheduleLocation = z.infer<typeof scheduleLocationSchema>;

// Departments and jobs go A to Z (BL-475); shift types and labels keep a hand order.
export const scheduleReferenceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  color: colorSchema,
});
const scheduleOrderedReferenceSchema = scheduleReferenceSchema.extend({
  sort_order: z.coerce.number().int().nonnegative(),
});

export const scheduleDepartmentSchema = scheduleReferenceSchema.extend({
  system_key: departmentSchema.shape.system_key,
});

export const scheduleCatalogNameSchema = scheduleReferenceSchema.pick({ id: true, name: true });
export type ScheduleCatalogName = z.infer<typeof scheduleCatalogNameSchema>;

export const scheduleJobSchema = scheduleReferenceSchema.extend({
  department_id: z.string().uuid().nullable(),
  system_key: jobSchema.shape.system_key,
});

export const scheduleShiftTypeSchema = scheduleOrderedReferenceSchema.extend({
  default_start_time: timeOfDaySchema.nullable(),
  default_end_time: timeOfDaySchema.nullable(),
  /** Missing in an older reply or a fixture: read as none. */
  time_options: shiftTypeTimeOptionsSchema.optional(),
  default_revision: z.number().int().positive().optional(),
});

export const scheduleShiftLabelSchema = scheduleOrderedReferenceSchema;
export type ScheduleShiftLabel = z.infer<typeof scheduleShiftLabelSchema>;

const scheduleWeeklyIntervalSchema = z.object({
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
});
export const scheduleWeeklyLocationSchema = z
  .object({
    location_id: z.string().uuid(),
    location_name: z.string(),
    timezone: z.string(),
    week_start: z.string().date(),
    status: z.enum(["ready", "unknown"]),
    unavailable_intervals: z.array(scheduleWeeklyIntervalSchema),
    // The employee's own marks: the same hours as unavailable_intervals (M12).
    employee_intervals: z.array(scheduleWeeklyIntervalSchema).optional(),
    // A manager note's hours, only for whoever may read the note; [] for
    // anybody else. A reminder shown while writing, never unavailable (M12).
    note_intervals: z.array(scheduleWeeklyIntervalSchema).optional(),
    // The manager note's words by weekday from Sunday ("" for none); null for a
    // reader the note is not for. Absent on the team board an employee reads.
    manager_notes: z.array(z.string()).length(7).nullable().optional(),
    // Who last wrote the note (named as the grid names a person) and when;
    // null for a reader the note is not for, or a writer with no profile.
    note_author: z.string().nullable().optional(),
    note_edited_at: z.string().datetime({ offset: true }).nullable().optional(),
    leave_intervals: z.array(scheduleWeeklyIntervalSchema),
    clock_segments: z.array(
      scheduleWeeklyIntervalSchema.extend({ offset_seconds: z.number().int() }),
    ),
    days: z.array(
      z.object({
        date: z.string().date(),
        has_unavailable: z.boolean(),
        all_day: z.boolean(),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    if (
      [
        ...value.unavailable_intervals,
        ...value.leave_intervals,
        ...value.clock_segments,
      ].some(
        (interval) =>
          Date.parse(interval.end_at) <= Date.parse(interval.start_at),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Availability intervals must have a positive duration.",
      });
    if (
      value.status === "ready" &&
      (!value.clock_segments.length ||
        value.days.length !== 7 ||
        new Set(value.days.map((day) => day.date)).size !== 7)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "A verified availability projection requires a complete week and clock offsets.",
      });
  });

export const scheduleEmployeeSchema = z.object({
  id: z.string().uuid(),
  employee_code: z.string().min(1).max(24),
  display_name: z.string().trim().min(1).max(161),
  location_ids: z.array(z.string().uuid()),
  job_ids: z.array(z.string().uuid()),
  shift_type_ids: z.array(z.string().uuid()).optional(),
  is_excluded_from_schedule: z.boolean().optional(),
  primary_job_id: z.string().uuid().nullable().optional(),
  weekly_availability: z.array(scheduleWeeklyLocationSchema).optional(),
});
export type ScheduleEmployee = z.infer<typeof scheduleEmployeeSchema>;

export const scheduleShiftSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  job_id: z.string().uuid(),
  shift_type_id: z.string().uuid().nullable(),
  scheduled_date: z.string().date(),
  start_time: z.preprocess(
    (value) => value ?? "",
    z.union([timeOfDaySchema, z.literal("")]),
  ),
  end_time: z.preprocess(
    (value) => value ?? "",
    z.union([timeOfDaySchema, z.literal("")]),
  ),
  crosses_midnight: z.preprocess((value) => value ?? false, z.boolean()),
  time_basis: shiftTimeBasisSchema.optional(),
  time_snapshot: shiftTimeSnapshotSchema.nullable().optional(),
  time_timezone: z.string().nullable().optional(),
  availability_assessment: shiftAvailabilityAssessmentSchema
    .nullable()
    .optional(),
  availability_responsibility_retained: z.boolean().optional(),
  unpaid_break_minutes: scheduleUnpaidBreakMinutesSchema.optional().default(0),
  hide_time_on_badge: z.boolean().optional().default(false),
  label_ids: z.array(z.string().uuid()).optional(),
  label_names: z.array(z.string().trim().min(1).max(80)).optional(),
  note: z.string().max(500),
  warning_codes: z.array(
    z.enum(["availability", "closed_location", "overlap"]),
  ),
  /**
   * K18, M11: the employee marked these hours after the shift was first
   * published; approved time off and a manager note never count.
   */
  availability_changed_after_publish: z.boolean().optional(),
});
export type ScheduleShift = z.infer<typeof scheduleShiftSchema>;

export const scheduleClosureSchema = z.object({
  // public.schedule_closures names a closed day md5(...)::uuid: UUID-shaped,
  // without an RFC version, so the strict uuid() rule refused it (BL-959).
  id: z.guid(),
  location_id: z.string().uuid(),
  closed_date: z.string().date(),
  title: z.string().trim().min(1).max(120),
  /** Closed the whole business day. */
  is_all_day: z.boolean(),
  /** closed: no shift that day; short: open only from opens to closes (closes at or before opens: the next day). */
  kind: z.enum(["closed", "short"]),
  opens: timeOfDaySchema.nullable(),
  closes: timeOfDaySchema.nullable(),
  /** A scheduled post's day reaches only the manager's week (EKRAN-08). */
  status: z.enum(["published", "scheduled", "unpublished"]).optional(),
  publish_at: z.string().datetime({ offset: true }).nullable().optional(),
  on_schedule: z.boolean().optional(),
  announcement_id: z.string().uuid().optional(),
});
export type ScheduleClosure = z.infer<typeof scheduleClosureSchema>;

const closureMinutes = (value: string) => {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * Whether a location's day reaches a shift from start to end (end at or before
 * start: past midnight); the twin of app_private.closure_covers. Closed reaches
 * every shift that starts that day; Short hours a shift with any part outside
 * them.
 */
export function scheduleClosureCoversShift(
  closure: Pick<ScheduleClosure, "kind" | "opens" | "closes">,
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  if (closure.kind === "closed") return true;
  if (!start || !end || !closure.opens || !closure.closes) return false;
  const from = closureMinutes(start);
  let to = closureMinutes(end);
  if (to <= from) to += 1440;
  const opens = closureMinutes(closure.opens);
  let closes = closureMinutes(closure.closes);
  if (closes <= opens) closes += 1440;
  return from < opens || to > closes;
}

/**
 * A post on the Schedule that touches the week, once per checked location the
 * reader reaches (null: a post for no location, everyone's). Its day at that
 * location comes with it.
 */
export const scheduleImportantDateSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(120),
  category: announcementCategorySchema,
  category_other: z.string().nullable(),
  starts_on: z.string().date(),
  ends_on: z.string().date(),
  status: z.enum(["published", "scheduled"]),
  publish_at: z.string().datetime({ offset: true }).nullable(),
  day: announcementDaySchema,
  opens: timeOfDaySchema.nullable(),
  closes: timeOfDaySchema.nullable(),
  event_from: timeOfDaySchema.nullable(),
  event_until: timeOfDaySchema.nullable(),
});
export type ScheduleImportantDate = z.infer<typeof scheduleImportantDateSchema>;

// A published shift of someone on the grid at a location the reader does not
// reach: what the shift card says (names travel with it), never its note, never
// editable. Only the manager week read sends it.
export const scheduleGhostShiftSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  scheduled_date: z.string().date(),
  start_time: timeOfDaySchema,
  end_time: timeOfDaySchema,
  crosses_midnight: z.boolean(),
  job_id: z.string().uuid(),
  job_name: z.string().max(120).nullable(),
  shift_type_id: z.string().uuid().nullable(),
  shift_type_name: z.string().max(120).nullable(),
  label_ids: z.array(z.string().uuid()),
  label_names: z.array(z.string().trim().min(1).max(80)),
});
export type ScheduleGhostShift = z.infer<typeof scheduleGhostShiftSchema>;

export const scheduleReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  week_start_day: weekStartDaySchema,
  settings: z
    .object({
      time_format: scheduleTimeFormatSchema,
      conflict_rules: scheduleConflictRulesSchema.optional(),
      minimum_travel_minutes: z.number().int().nonnegative().optional(),
      minimum_rest_minutes: z.number().int().nonnegative().optional(),
    })
    .default({ time_format: "12h" }),
  locations: z.array(scheduleLocationSchema),
  departments: z.array(scheduleDepartmentSchema),
  jobs: z.array(scheduleJobSchema),
  shift_types: z.array(scheduleShiftTypeSchema),
  shift_labels: z.array(scheduleShiftLabelSchema).optional(),
  employees: z.array(scheduleEmployeeSchema),
  shifts: z.array(scheduleShiftSchema),
  closures: z.array(scheduleClosureSchema),
  important_dates: z.array(scheduleImportantDateSchema).default([]),
  // ponytail: optional because the employee board read shares this schema and never sends it.
  ghost_shifts: z.array(scheduleGhostShiftSchema).optional(),
  // K8: archived (not deleted) jobs and shift types the week's shifts still point at,
  // so an old shift keeps its name. Never in the pickers; those read jobs / shift_types.
  referenced_jobs: z.array(scheduleCatalogNameSchema),
  referenced_shift_types: z.array(scheduleCatalogNameSchema),
});
export type ScheduleReadModel = z.infer<typeof scheduleReadModelSchema>;

export const scheduleDraftSummarySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  name: z.string().trim().min(1).max(80),
  revision: z.coerce.number().int().positive(),
  created_by: z.string().uuid(),
  updated_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleDraftSummary = z.infer<typeof scheduleDraftSummarySchema>;

export const scheduleEditSourceSchema = z.enum(["blank", "published", "draft"]);
export type ScheduleEditSource = z.infer<typeof scheduleEditSourceSchema>;

export const scheduleEditableShiftSchema = scheduleShiftSchema
  .omit({
    warning_codes: true,
  })
  .extend({
    revision: z.coerce.number().int().positive(),
    warning_codes: scheduleShiftSchema.shape.warning_codes,
    source_published_shift_id: z.string().uuid().nullable().optional(),
    pending_op_type: z
      .enum(["create", "update", "delete"])
      .nullable()
      .optional(),
    locked: z.boolean().nullable().optional(),
  });
export type ScheduleEditableShift = z.infer<typeof scheduleEditableShiftSchema>;

export const scheduleEditSessionSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  source_kind: scheduleEditSourceSchema,
  source_draft_id: z.string().uuid().nullable(),
  source_revision: z.coerce.number().int().nonnegative(),
  holder_user_id: z.string().uuid(),
  holder_name: z.string().trim().min(1).max(161),
  revision: z.coerce.number().int().positive(),
  dirty: z.boolean(),
  last_heartbeat: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  // The locations this edit covers; saving replaces its draft only there.
  location_ids: z.array(z.string().uuid()).min(1),
  shifts: z.array(scheduleEditableShiftSchema),
  // S2 (KK-171): steps Undo can still take back on the server, 0-25.
  // The database keeps at most 25; the screen does not enforce it.
  undo_depth: z.coerce.number().int().min(0).optional(),
  // BL-998: only on Undo's answer, when the last step could not come back and
  // left the history instead; names the rule that stopped it.
  undo_refused: z
    .object({ reason: z.enum(["availability", "document", "conflict_acceptance", "rule"]) })
    .optional(),
});
export type ScheduleEditSession = z.infer<typeof scheduleEditSessionSchema>;

export const scheduleEditAcquireResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.enum(["acquired", "resumed", "acquired_after_recovery"]),
    session: scheduleEditSessionSchema,
    recovered_draft_id: z.string().uuid().nullable().optional(),
    // D-O9: the "Auto-save · <name> · <time>" draft a lapsed edit was put into.
    recovered_draft_name: z.string().nullable().optional(),
  }),
  // Somebody else is editing the draft that was asked for.
  z.object({
    status: z.literal("conflict"),
    session_id: z.string().uuid().optional(),
    holder_name: z.string().trim().min(1).max(161),
    last_heartbeat: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
  }),
]);
export type ScheduleEditAcquireResult = z.infer<
  typeof scheduleEditAcquireResultSchema
>;

export const schedulePendingOpTypeSchema = z.enum([
  "create",
  "update",
  "delete",
]);
export type SchedulePendingOpType = z.infer<typeof schedulePendingOpTypeSchema>;
export const schedulePendingOpPayloadSchema = z
  .object({
    scheduled_date: z.string().date().optional(),
    start_time: scheduleShiftSchema.shape.start_time.optional(),
    end_time: scheduleShiftSchema.shape.end_time.optional(),
    time_basis: shiftTimeBasisSchema.optional(),
    time_snapshot: shiftTimeSnapshotSchema.nullable().optional(),
    time_timezone: z.string().nullable().optional(),
    unpaid_break_minutes: scheduleUnpaidBreakMinutesSchema.optional(),
    location_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
    employee_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
    shift_type_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
    job_id: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
    label_ids: z.array(z.string().uuid()).optional(),
    label_names: z.array(z.string().trim().min(1).max(80)).optional(),
    source_published_shift_id: z
      .union([z.string().uuid(), z.literal(""), z.null()])
      .optional(),
  })
  .passthrough();
export type SchedulePendingOpPayload = z.infer<
  typeof schedulePendingOpPayloadSchema
>;
export const schedulePendingOpSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  week_start: z.string().date(),
  op_type: schedulePendingOpTypeSchema,
  target_shift_id: z.string().uuid().nullable(),
  target_draft_id: z.string().uuid().nullable().optional(),
  payload: schedulePendingOpPayloadSchema,
  created_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type SchedulePendingOp = z.infer<typeof schedulePendingOpSchema>;
export const schedulePendingOpListSchema = z.object({
  pending_ops: z.array(schedulePendingOpSchema),
});
export const schedulePendingOpMutationResultSchema = z.object({
  status: z.string(),
  op_id: z.string().uuid().optional(),
});
export type SchedulePendingOpMutationResult = z.infer<
  typeof schedulePendingOpMutationResultSchema
>;
export const createSchedulePendingOpInputSchema = z.object({
  lock_id: z.string().uuid(),
  op_type: schedulePendingOpTypeSchema,
  target_shift_id: z.string().uuid().nullable().optional(),
  payload: schedulePendingOpPayloadSchema,
});
export type CreateSchedulePendingOpInput = z.infer<
  typeof createSchedulePendingOpInputSchema
>;
export const updateSchedulePendingOpInputSchema = z.object({
  payload: schedulePendingOpPayloadSchema,
});
export type UpdateSchedulePendingOpInput = z.infer<
  typeof updateSchedulePendingOpInputSchema
>;

export const schedulePublicationLocationStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  color: colorSchema.nullable(),
  timezone: z.string().trim().min(1).max(80).nullable(),
  status: z.enum(["published", "unpublished"]),
  reason: z.enum([
    "active_publication_and_shifts",
    "missing_publication",
    "no_published_shifts",
  ]),
  publication_includes_location: z.boolean(),
  published_shift_count: z.coerce.number().int().nonnegative(),
  draft_shift_count: z.coerce.number().int().nonnegative(),
  published_at: z.string().datetime({ offset: true }).nullable(),
  published_by_name: z.string().trim().min(1).max(161).nullable(),
  source_draft_id: z.string().uuid().nullable(),
  source_draft_name: z.string().nullable(),
});
export const schedulePublicationStatusSchema = z.object({
  week_start: z.string().date(),
  week_end: z.string().date(),
  week_start_day: weekStartDaySchema,
  schedule_deadline_day: scheduleDeadlineDaySchema,
  is_anchor_only: z.boolean(),
  locations: z.array(schedulePublicationLocationStatusSchema),
});
export type SchedulePublicationStatus = z.infer<
  typeof schedulePublicationStatusSchema
>;

export const scheduleShiftMutationInputSchema = scheduleShiftSchema
  .pick({
    location_id: true,
    employee_id: true,
    job_id: true,
    shift_type_id: true,
    scheduled_date: true,
    start_time: true,
    end_time: true,
    unpaid_break_minutes: true,
    hide_time_on_badge: true,
    time_basis: true,
    time_snapshot: true,
    time_timezone: true,
    label_ids: true,
    label_names: true,
    note: true,
  })
  .extend({
    unpaid_break_minutes: scheduleUnpaidBreakMinutesSchema
      .optional()
      .default(0),
    idempotency_key: z.string().uuid().optional(),
    conflict_override_note: z.string().trim().min(10).max(1000).optional(),
    availability_assessment_fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  });
export type ScheduleShiftMutationInput = z.infer<
  typeof scheduleShiftMutationInputSchema
>;

/**
 * What a schedule of the week holds where the reader schedules: assigned shifts
 * and their paid minutes, as the grid totals them; open shifts apart (QA 41).
 */
export const scheduleWeekFactsSchema = z.object({
  shift_count: z.coerce.number().int().nonnegative(),
  paid_minutes: z.coerce.number().int().nonnegative(),
  // Default until every server sends it (the live database goes first).
  open_shift_count: z.coerce.number().int().nonnegative().default(0),
});
export type ScheduleWeekFacts = z.infer<typeof scheduleWeekFactsSchema>;
/** A row of the New Schedule window: the draft, who saved it last, and its facts. */
export const scheduleDraftListItemSchema = scheduleDraftSummarySchema
  .extend({ updated_by_name: z.string().trim().min(1).max(100) })
  .merge(scheduleWeekFactsSchema);
export type ScheduleDraftListItem = z.infer<typeof scheduleDraftListItemSchema>;
export const scheduleDraftListSchema = z.object({
  drafts: z.array(scheduleDraftListItemSchema),
  /** The live schedule's facts (zeros when nothing is published). */
  published: scheduleWeekFactsSchema,
});
export type ScheduleDraftList = z.infer<typeof scheduleDraftListSchema>;
export const legacyScheduleShiftListSchema = z.object({
  shifts: z.array(scheduleShiftSchema),
  ghost_shifts: z.array(scheduleShiftSchema).optional(),
});
export type LegacyScheduleShiftList = z.infer<
  typeof legacyScheduleShiftListSchema
>;
export const scheduleBulkDeleteResultSchema = z.object({
  deleted_count: z.coerce.number().int().nonnegative(),
  session: scheduleEditSessionSchema.optional(),
});
export type ScheduleBulkDeleteResult = z.infer<
  typeof scheduleBulkDeleteResultSchema
>;
// S1: an idle edit kept as an "Auto-save" draft, or closed with nothing to keep.
export const scheduleEditAutosaveResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), draft_id: z.string().uuid(), draft_name: z.string() }),
  z.object({ status: z.literal("nothing_to_save"), draft_id: z.null(), draft_name: z.null() }),
]);
export type ScheduleEditAutosaveResult = z.infer<typeof scheduleEditAutosaveResultSchema>;
export const scheduleDraftDeleteResultSchema = z.object({
  status: z.literal("deleted"),
  draft_id: z.string().uuid(),
});
export type ScheduleDraftDeleteResult = z.infer<
  typeof scheduleDraftDeleteResultSchema
>;
export const schedulePublishFindingCodeSchema = z.enum([
  "schedule_conflict",
  "availability_unknown",
  "availability_review_pending",
  "overlap",
  "availability",
  "closed_location",
  "double_booking",
  "time_off",
  "closed_day",
  "clopening",
  "advance_notice",
  "solo_opener",
  // A shift change approved after the last publication that the draft would undo (BL-198).
  "shift_exchange_undone",
  // A shift that meets time off still waiting for a decision: a note, never a block (FB-6.3).
  "time_off_pending",
]);
export const schedulePublishFindingSchema = z.object({
  id: z.string().min(12).max(64),
  code: schedulePublishFindingCodeSchema,
  severity: z.enum(["hard", "soft"]),
  overrideable: z.boolean(),
  availability_state: z.enum(["new", "accepted"]).optional(),
  conflict_severity: z.enum(["allow", "warn", "confirm", "block"]).optional(),
  warning_policy: z.enum(["warn", "confirm"]).optional(),
  tier: z.enum(["blocker", "risk", "note"]).optional(),
  projected: z.boolean().optional(),
  introduced: z.boolean().optional(),
  fix_hint: z.string().trim().min(1).max(500).nullable().optional(),
  message: z.string().trim().min(1).max(500),
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120).nullable().optional(),
  employee_id: z.string().uuid().nullable(),
  employee_name: z.string().trim().min(1).max(161).nullable().optional(),
  scheduled_date: z.string().date(),
  date: z.string().date().nullable().optional(),
  shift_ids: z.array(z.string().uuid()),
  // shift_exchange_undone only: the approved change and what the draft has instead.
  // draft_* is null when the draft left the shift out.
  start_time: timeOfDaySchema.optional(),
  end_time: timeOfDaySchema.optional(),
  exchange_case_id: z.string().uuid().optional(),
  exchange_kind: z.enum(["cover", "swap"]).optional(),
  from_employee_id: z.string().uuid().optional(),
  from_employee_name: z.string().trim().min(1).max(161).nullable().optional(),
  to_employee_id: z.string().uuid().optional(),
  to_employee_name: z.string().trim().min(1).max(161).nullable().optional(),
  draft_employee_id: z.string().uuid().nullable().optional(),
  draft_employee_name: z.string().trim().min(1).max(161).nullable().optional(),
  // time_off_pending only: the request waiting for a decision.
  time_off_request_id: z.string().uuid().optional(),
});
export type SchedulePublishFinding = z.infer<
  typeof schedulePublishFindingSchema
>;

export const schedulePublicationLocationPreviewSchema = z.object({
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  active_publication_id: z.string().uuid().nullable(),
  active_version: z.coerce.number().int().positive().nullable(),
  current_shift_count: z.coerce.number().int().nonnegative(),
  next_shift_count: z.coerce.number().int().nonnegative(),
  added: z.coerce.number().int().nonnegative(),
  updated: z.coerce.number().int().nonnegative(),
  removed: z.coerce.number().int().nonnegative(),
  unchanged: z.coerce.number().int().nonnegative(),
  affected_employee_ids: z.array(z.string().uuid()).default([]),
  // Somebody published or unpublished this location after the draft's work
  // there started; publishing replaces what they did.
  changed_since_start: z
    .object({
      kind: z.enum(["published", "unpublished"]),
      by_name: z.string().trim().min(1).max(161),
      at: z.string().datetime({ offset: true }),
    })
    .nullable(),
});
export type SchedulePublicationLocationPreview = z.infer<
  typeof schedulePublicationLocationPreviewSchema
>;

// An open shift the publish brings, asked about before publishing (Mert, 2026-10-20).
export const schedulePublicationOpenShiftSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string(),
  job_id: z.string().uuid().nullable(),
  job_name: z.string(),
  scheduled_date: z.string().date(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
});
export type SchedulePublicationOpenShift = z.infer<typeof schedulePublicationOpenShiftSchema>;
// What happens to them: offered to eligible employees in Shift Hub, kept for managers, or deleted.
export const scheduleOpenShiftChoiceSchema = z.enum(["offer", "keep", "delete"]);
export type ScheduleOpenShiftChoice = z.infer<typeof scheduleOpenShiftChoiceSchema>;

export const schedulePublicationPreviewSchema = z.object({
  status: z.enum([
    "publish_ready",
    "hard_blocked",
    "override_required",
    "past_week_closed",
  ]),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  draft_id: z.string().uuid(),
  draft_revision: z.coerce.number().int().positive(),
  fingerprint: z.string().min(32).max(128),
  locations: z.array(schedulePublicationLocationPreviewSchema),
  findings: z.array(schedulePublishFindingSchema),
  open_shifts: z.array(schedulePublicationOpenShiftSchema).optional(),
});
export type SchedulePublicationPreview = z.infer<
  typeof schedulePublicationPreviewSchema
>;

// The publisher acknowledges a finding by id; who and when are recorded by
// the database, there is no written reason (BL-190).
export const schedulePublicationOverrideInputSchema = z.object({
  finding_id: z.string().min(12).max(64),
});
export type SchedulePublicationOverrideInput = z.infer<
  typeof schedulePublicationOverrideInputSchema
>;

export const schedulePublicationPreflightAckSchema = z.object({
  fingerprint: z.string().min(32).max(128),
  decisions: z
    .array(schedulePublicationOverrideInputSchema)
    .max(200)
    .optional(),
});
export type SchedulePublicationPreflightAck = z.infer<
  typeof schedulePublicationPreflightAckSchema
>;

export const schedulePublishConflictShiftSummarySchema = z.object({
  shift_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  location_name: z.string().trim().min(1).max(120).nullable().optional(),
  time_range: z.string().trim().min(1).max(80),
  shift_type: z.string().trim().min(1).max(80).nullable().optional(),
});
export type SchedulePublishConflictShiftSummary = z.infer<
  typeof schedulePublishConflictShiftSummarySchema
>;

export const schedulePublishShiftConflictSummarySchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161).nullable(),
  date: z.string().date(),
  reason: z.enum(["same_named_shift_type", "time_overlap"]).optional(),
  first: schedulePublishConflictShiftSummarySchema,
  second: schedulePublishConflictShiftSummarySchema,
  introduced: z.boolean().optional(),
});
export type SchedulePublishShiftConflictSummary = z.infer<
  typeof schedulePublishShiftConflictSummarySchema
>;

export const schedulePublishDocumentConflictSummarySchema = z.object({
  kind: z.literal("document_expiry").default("document_expiry"),
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161).nullable(),
  shift_id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  date: z.string().date(),
  start_time: z.string().trim().min(1).max(16),
  end_time: z.string().trim().min(1).max(16),
  document_type_id: z.string().uuid(),
  requirement_id: z.string().uuid(),
  document_id: z.string().uuid(),
  document_title: z.string().trim().min(1).max(160),
  expiry_date: z.string().date(),
  expiry_policy_version: z.coerce.number().int().positive(),
  pending_document_id: z.string().uuid().nullable().optional(),
  review_action: z.literal("review_document").nullable().optional(),
  severity: z.enum(["soft", "hard"]),
  overrideable: z.boolean(),
  warning_text: z.string().trim().min(1).max(240),
  conflict_fingerprint: z.string().trim().min(1).max(128).optional(),
});
export type SchedulePublishDocumentConflictSummary = z.infer<
  typeof schedulePublishDocumentConflictSummarySchema
>;

export const schedulePublishConflictSummarySchema = z.union([
  schedulePublishShiftConflictSummarySchema,
  schedulePublishDocumentConflictSummarySchema,
]);
export type SchedulePublishConflictSummary = z.infer<
  typeof schedulePublishConflictSummarySchema
>;

export const schedulePublicationPreflightBlockReasonSchema = z.enum([
  "unacknowledged",
  "stale_fingerprint",
  "not_overrideable",
]);
export type SchedulePublicationPreflightBlockReason = z.infer<
  typeof schedulePublicationPreflightBlockReasonSchema
>;

export const schedulePublishPublishedResultSchema = z.object({
  status: z.literal("published"),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  draft_id: z.string().uuid(),
  draft_revision: z.coerce.number().int().positive(),
  location_ids: z.array(z.string().uuid()).min(1),
  publication_ids: z.array(z.string().uuid()).min(1),
  published_shift_count: z.coerce.number().int().nonnegative(),
  published_at: z.string().datetime({ offset: true }),
});
export type SchedulePublishPublishedResult = z.infer<
  typeof schedulePublishPublishedResultSchema
>;

export const schedulePublishStaleBaselineResultSchema = z.object({
  status: z.literal("stale_baseline"),
  fingerprint: z.string().min(1).max(128).optional(),
});
export type SchedulePublishStaleBaselineResult = z.infer<
  typeof schedulePublishStaleBaselineResultSchema
>;

export const schedulePublishScheduleConflictsResultSchema = z.object({
  status: z.literal("schedule_conflicts"),
  schedule_conflicts: z.array(schedulePublishConflictSummarySchema).default([]),
});
export type SchedulePublishScheduleConflictsResult = z.infer<
  typeof schedulePublishScheduleConflictsResultSchema
>;

export const schedulePublishPreflightResultSchema = z.object({
  status: z.literal("preflight"),
  preflight: schedulePublicationPreviewSchema,
  preflight_block_reason:
    schedulePublicationPreflightBlockReasonSchema.optional(),
  fingerprint: z.string().min(1).max(128).optional(),
});
export type SchedulePublishPreflightResult = z.infer<
  typeof schedulePublishPreflightResultSchema
>;

export const schedulePublishResultSchema = z.discriminatedUnion("status", [
  schedulePublishPublishedResultSchema,
  schedulePublishStaleBaselineResultSchema,
  schedulePublishScheduleConflictsResultSchema,
  schedulePublishPreflightResultSchema,
]);
export type SchedulePublishResult = z.infer<typeof schedulePublishResultSchema>;

export const scheduleUnpublishPreviewSchema = z.object({
  status: z.enum(["unpublish_ready", "past_week_closed"]),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  locations: z.array(
    z.object({
      location_id: z.string().uuid(),
      location_name: z.string().trim().min(1).max(120),
      publication_id: z.string().uuid(),
      version: z.coerce.number().int().positive(),
      shift_count: z.coerce.number().int().nonnegative(),
    }),
  ),
  fingerprint: z.string().min(32).max(128),
});
export type ScheduleUnpublishPreview = z.infer<
  typeof scheduleUnpublishPreviewSchema
>;

export const scheduleUnpublishResultSchema = z.object({
  status: z.literal("unpublished"),
  workspace_id: z.string().uuid(),
  week_start: z.string().date(),
  location_ids: z.array(z.string().uuid()).min(1),
  publication_ids: z.array(z.string().uuid()).min(1),
  unpublished_at: z.string().datetime({ offset: true }),
});
export type ScheduleUnpublishResult = z.infer<
  typeof scheduleUnpublishResultSchema
>;

export const scheduleTemplateSummarySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  revision: z.coerce.number().int().positive(),
  shift_count: z.coerce.number().int().nonnegative(),
  open_slot_count: z.coerce.number().int().nonnegative(),
  created_by_name: z.string().trim().min(1).max(100),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleTemplateSummary = z.infer<
  typeof scheduleTemplateSummarySchema
>;

export const scheduleTemplateShiftSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  employee_id: z.string().uuid().nullable(),
  job_id: z.string().uuid(),
  shift_type_id: z.string().uuid().nullable(),
  day_offset: z.coerce.number().int().min(0).max(6),
  start_time: scheduleShiftSchema.shape.start_time,
  end_time: scheduleShiftSchema.shape.end_time,
  crosses_midnight: scheduleShiftSchema.shape.crosses_midnight,
  time_basis: shiftTimeBasisSchema.optional(),
  time_snapshot: shiftTimeSnapshotSchema.nullable().optional(),
  time_timezone: z.string().nullable().optional(),
  label_ids: z.array(z.string().uuid()).optional(),
  label_names: z.array(z.string().trim().min(1).max(80)).optional(),
  note: z.string().max(500),
});
export const scheduleTemplateDetailSchema = z.object({
  template: scheduleTemplateSummarySchema,
  shifts: z.array(scheduleTemplateShiftSchema),
});
export type ScheduleTemplateDetail = z.infer<
  typeof scheduleTemplateDetailSchema
>;

export const scheduleTemplateListSchema = z.object({
  templates: z.array(scheduleTemplateSummarySchema),
});
export type ScheduleTemplateList = z.infer<typeof scheduleTemplateListSchema>;

export const scheduleTemplateApplyResultSchema = z.object({
  status: z.literal("applied"),
  mode: z.enum(["merge", "overwrite"]),
  applied_shift_count: z.coerce.number().int().nonnegative(),
  converted_open_count: z.coerce.number().int().nonnegative(),
  // What the template could not apply, one entry per kind and name; [] when nothing (BL-197).
  skipped: z.array(
    z.object({
      kind: z.enum(["archived_label"]),
      name: z.string().trim().min(1),
      shift_count: z.coerce.number().int().positive(),
    }),
  ),
  session: scheduleEditSessionSchema,
});
export type ScheduleTemplateApplyResult = z.infer<
  typeof scheduleTemplateApplyResultSchema
>;

/** KK-162 (BL-694): what Replace would remove, counted by the database. */
export const scheduleTemplateApplyPreviewSchema = z.object({
  removed_shift_count: z.coerce.number().int().nonnegative(),
});
export type ScheduleTemplateApplyPreview = z.infer<
  typeof scheduleTemplateApplyPreviewSchema
>;

export const scheduleAutoFillCandidateSchema = z.object({
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161),
  scheduled_minutes: z.coerce.number().int().nonnegative(),
  primary_job: z.boolean(),
  reasons: z.array(z.string().trim().min(1).max(120)).min(1),
});
export const scheduleAutoFillProposalSchema = z.object({
  shift_id: z.string().uuid(),
  location_name: z.string().trim().min(1).max(120),
  job_name: z.string().trim().min(1).max(120),
  scheduled_date: z.string().date(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  recommended_employee_id: z.string().uuid(),
  candidates: z.array(scheduleAutoFillCandidateSchema).min(1),
});
export const scheduleAutoFillPreviewSchema = z.object({
  status: z.literal("review_ready"),
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  session_revision: z.coerce.number().int().positive(),
  fingerprint: z.string().length(64),
  proposals: z.array(scheduleAutoFillProposalSchema),
  unfilled: z.array(
    z.object({
      shift_id: z.string().uuid(),
      reason: z.string().trim().min(1).max(240),
    }),
  ),
});
export type ScheduleAutoFillPreview = z.infer<
  typeof scheduleAutoFillPreviewSchema
>;

export const scheduleAutoFillAssignmentSchema = z.object({
  shift_id: z.string().uuid(),
  employee_id: z.string().uuid(),
});
export type ScheduleAutoFillAssignment = z.infer<
  typeof scheduleAutoFillAssignmentSchema
>;
export const scheduleAutoFillApplyResultSchema = z.object({
  status: z.literal("applied"),
  applied: z.array(scheduleAutoFillAssignmentSchema),
  rejected: z.array(
    z.object({
      shift_id: z.string().uuid(),
      reason: z.string().trim().min(1).max(240),
    }),
  ),
  session: scheduleEditSessionSchema,
});
export type ScheduleAutoFillApplyResult = z.infer<
  typeof scheduleAutoFillApplyResultSchema
>;

export const scheduleExportSettingsSchema = z.object({
  format: z.enum(["pdf", "csv", "print", "xlsx"]),
  layout: z.enum(["weekly", "daily", "daily_roster"]),
  locale: z.enum(["en", "tr", "es"]).optional(),
  time_format: z.enum(["12h", "24h"]),
  paper_size: z.enum(["a4", "letter"]).optional(),
  orientation: z.enum(["auto", "portrait", "landscape"]).optional(),
  fit_mode: z.enum(["auto", "fit_to_page", "one_location_per_page"]).optional(),
  include_unassigned: z.boolean(),
  include_notes: z.boolean(),
  include_scheduled_hours: z.boolean(),
  show_shift_type: z.boolean().optional(),
  show_labels: z.boolean().optional(),
  show_clock_in_out: z.boolean().optional(),
  show_role_separators: z.boolean().optional(),
  show_preset_shift_badges: z.boolean().optional(),
  csv_delimiter: z.enum([",", ";"]),
});
export type ScheduleExportSettings = z.infer<
  typeof scheduleExportSettingsSchema
>;
export const scheduleExportSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("published") }),
  z.object({ type: z.literal("draft"), draft_id: z.string().uuid() }),
]);
export type ScheduleExportSource = z.infer<typeof scheduleExportSourceSchema>;
export const scheduleExportRequestSchema = z.object({
  week_start: z.string().date(),
  source: scheduleExportSourceSchema,
  location_ids: z.array(z.string().uuid()).min(1),
  settings: scheduleExportSettingsSchema,
});
export type ScheduleExportRequest = z.infer<typeof scheduleExportRequestSchema>;
export const scheduleExportRowSchema = z.object({
  time_basis: shiftTimeBasisSchema.optional(),
  time_snapshot: shiftTimeSnapshotSchema.nullable().optional(),
  time_timezone: z.string().nullable().optional(),
  shift_id: z.string().uuid(),
  scheduled_date: z.string().date(),
  location_name: z.string().trim().min(1).max(120),
  employee_name: z.string().trim().min(1).max(161).nullable(),
  job_name: z.string().trim().min(1).max(120),
  shift_type_name: z.string().trim().min(1).max(80).nullable(),
  label_names: z.array(z.string().trim().min(1).max(80)).optional(),
  start_time: scheduleShiftSchema.shape.start_time,
  end_time: scheduleShiftSchema.shape.end_time,
  crosses_midnight: scheduleShiftSchema.shape.crosses_midnight,
  note: z.string().max(500),
  scheduled_minutes: z.coerce.number().int().nonnegative(),
});
export const scheduleExportPreviewSchema = z.object({
  status: z.literal("export_ready"),
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  week_start: z.string().date(),
  source: scheduleExportSourceSchema,
  source_revision: z.coerce.number().int().positive().nullable(),
  fingerprint: z.string().length(64),
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    }),
  ),
  rows: z.array(scheduleExportRowSchema),
  summary: z.object({
    shift_count: z.coerce.number().int().nonnegative(),
    employee_count: z.coerce.number().int().nonnegative(),
    scheduled_minutes: z.coerce.number().int().nonnegative(),
  }),
  warnings: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(80),
        severity: z.enum(["info", "warning"]),
        message: z.string().trim().min(1).max(240),
      }),
    )
    .optional(),
});
export type ScheduleExportPreview = z.infer<typeof scheduleExportPreviewSchema>;
export const scheduleExportPresetSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  settings: scheduleExportSettingsSchema,
  created_by: z.string().uuid(),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleExportPreset = z.infer<typeof scheduleExportPresetSchema>;
export const scheduleExportPresetListSchema = z.object({
  presets: z.array(scheduleExportPresetSchema),
});
export const scheduleExportScheduleSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  preset_id: z.string().uuid(),
  preset_name: z.string().trim().min(1).max(80).nullable(),
  name: z.string().trim().min(1).max(80),
  recipients: z.array(z.string().email()).min(1).max(10),
  location_ids: z.array(z.string().uuid()).default([]),
  day_of_week: z.coerce.number().int().min(0).max(6),
  send_hour: z.coerce.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  last_sent_at: z.string().datetime({ offset: true }).nullable(),
  consecutive_failures: z.coerce.number().int().nonnegative(),
  last_error: z.string().max(500).nullable(),
  auto_disabled_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type ScheduleExportSchedule = z.infer<
  typeof scheduleExportScheduleSchema
>;
export const scheduleExportScheduleListSchema = z.object({
  schedules: z.array(scheduleExportScheduleSchema),
});
export const scheduleRecentExportEventSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  surface: z.string().trim().min(1).max(80),
  format: z.string().trim().min(1).max(20),
  params: z.record(z.string(), z.unknown()),
  actor_user_id: z.string().uuid().nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export type ScheduleRecentExportEvent = z.infer<
  typeof scheduleRecentExportEventSchema
>;
export const scheduleRecentExportEventListSchema = z.object({
  events: z.array(scheduleRecentExportEventSchema),
});
export const createScheduleExportScheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  preset_id: z.string().uuid(),
  recipients: z.array(z.string().email()).min(1).max(10),
  location_ids: z.array(z.string().uuid()).min(1).max(100),
  day_of_week: z.coerce.number().int().min(0).max(6),
  send_hour: z.coerce.number().int().min(0).max(23),
  timezone: z.string().trim().max(80).refine(isValidIanaTimezone, "Select a valid IANA time zone"),
});
export type CreateScheduleExportScheduleInput = z.infer<
  typeof createScheduleExportScheduleInputSchema
>;
export const updateScheduleExportScheduleInputSchema =
  createScheduleExportScheduleInputSchema.partial().extend({
    enabled: z.boolean().optional(),
  });
export type UpdateScheduleExportScheduleInput = z.infer<
  typeof updateScheduleExportScheduleInputSchema
>;

export const scheduleRequestEventSchema = z.object({
  released_assignments: z.array(timeOffReleasedAssignmentSchema).optional(),
  id: z.string().uuid(),
  action: z.string().trim().min(1).max(48),
  actor_name: z.string().trim().min(1).max(160),
  note: z.string().max(1000),
  created_at: z.string().datetime({ offset: true }),
});
export type ScheduleRequestEvent = z.infer<typeof scheduleRequestEventSchema>;

export const timeOffRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "revoked",
]);
export const timeOffSegmentStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
]);
export const timeOffRequestSegmentSchema = timeOffPeriodReadSchema;
export const timeOffRequestSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(160),
  request_type: z.enum(["time_off", "time_off_cancellation"]),
  cancellation: timeOffCancellationContextSchema.optional(),
  reason: z.string().max(1000),
  status: timeOffRequestStatusSchema,
  start_date: z.string().date(),
  end_date: z.string().date(),
  revision: z.number().int().positive(),
  created_at: z.string().datetime({ offset: true }),
  decide_by: z.string().datetime({ offset: true }).nullable().optional(),
  conflict_count: z.number().int().nonnegative(),
  segments: z.array(timeOffRequestSegmentSchema),
  events: z.array(scheduleRequestEventSchema),
  // Pending requests only; null once closed.
  progress: timeOffProgressSchema.nullable().optional(),
});
export type TimeOffRequest = z.infer<typeof timeOffRequestSchema>;

export const scheduleRequestsReadModelSchema = z.object({
  workspace_id: z.string().uuid(),
  time_format: z.enum(["12h", "24h"]).optional(),
  locations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    }),
  ),
  time_off_pending_count: z.number().int().nonnegative(),
  time_off_next_cursor: z.string().datetime({ offset: true }).nullable(),
  time_off_requests: z.array(timeOffRequestSchema),
});
export type ScheduleRequestsReadModel = z.infer<
  typeof scheduleRequestsReadModelSchema
>;

export const customRoleAccessClassSchema = z.enum(["manager", "employee"]);
export type CustomRoleAccessClass = z.infer<typeof customRoleAccessClassSchema>;

export const permissionDefinitionSchema = z.object({
  key: permissionSchema,
  label: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  custom_grantable: z.boolean(),
  sort_order: z.number().int().nonnegative(),
});
export type PermissionDefinition = z.infer<typeof permissionDefinitionSchema>;

export const workspaceRoleRecordSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  description: z.string().max(240),
  system_key: workspaceRoleSchema.nullable(),
  access_class: workspaceRoleSchema,
  sort_order: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  permission_keys: z.array(permissionSchema),
  member_count: z.number().int().nonnegative(),
  pending_invite_count: z.number().int().nonnegative().default(0),
  blocking_member_count: z.number().int().nonnegative().default(0),
  blocking_invite_count: z.number().int().nonnegative().default(0),
  editable: z.boolean().default(false),
  deletable: z.boolean().default(false),
});
export type WorkspaceRoleRecord = z.infer<typeof workspaceRoleRecordSchema>;

export const workspaceRoleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    description: z.string().trim().max(240),
    access_class: z.enum(["admin", "manager", "employee"]),
    permission_keys: z.array(permissionSchema),
    expected_updated_at: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((role, issue) => {
    const permissions = new Set(role.permission_keys);
    const error = (message: string) =>
      issue.addIssue({ code: "custom", message, path: ["permission_keys"] });
    if (!permissions.has("workspace.read"))
      error("Roles require workspace access");
    if (
      role.access_class !== "admin" &&
      (permissions.has("workspace.manage") || permissions.has("roles.manage"))
    )
      error("Protected management permissions cannot be granted");
    if (
      role.access_class === "employee" &&
      role.permission_keys.some(
        (key) => !employeeEligiblePermissions.includes(key),
      )
    )
      error("Employee roles are limited to personal access");
    for (const key of permissions)
      if (
        (rolePermissionDependencies[key] ?? []).some(
          (dependency) => !permissions.has(dependency),
        )
      )
        error(`${key} requires its read access`);
  });
export type WorkspaceRoleInput = z.infer<typeof workspaceRoleInputSchema>;

export const employeeSectionSchema = z.enum([
  "profile",
  "employment",
  "availability",
  "documents",
  "access",
  "history",
]);
export type EmployeeSection = z.infer<typeof employeeSectionSchema>;

export const employeeDisplayStatusSchema = z.enum([
  "not_invited",
  "invited",
  "onboarding",
  "needs_attention",
  "active",
  "archived",
]);
export type EmployeeDisplayStatus = z.infer<typeof employeeDisplayStatusSchema>;

export const employeeAssignmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  primary: z.boolean(),
  archived: z.boolean(),
});
export type EmployeeAssignment = z.infer<typeof employeeAssignmentSchema>;

export const employeeSummarySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  employee_code: z.string().min(1).max(24),
  first_name: z.string().trim().min(1).max(80),
  /** Optional everywhere: empty string when the person has none. */
  middle_name: z.string().max(80).optional(),
  last_name: z.string().trim().min(1).max(80),
  preferred_name: z.string().max(80),
  display_name: z.string().trim().min(1).max(161),
  invitation_email: z.string().email().nullable(),
  start_date: z.string().date().nullable(),
  /**
   * Every location they work at, the primary first, then A to Z (BL-436): the
   * list filters on "works here" and names the first one (BL-428).
   */
  locations: z.array(employeeAssignmentSchema.pick({ id: true, name: true, primary: true })),
  primary_job_id: z.string().uuid().nullable(),
  primary_job_name: z.string().nullable(),
  job_count: z.coerce.number().int().nonnegative(),
  /**
   * The two access slots apart (KARARLAR S-179): whether they reach the
   * management app and the employee app. Neither: no account (No access).
   */
  management_access: z.boolean(),
  employee_access: z.boolean(),
  display_status: employeeDisplayStatusSchema,
  archived_at: z.string().datetime({ offset: true }).nullable(),
  revision: z.coerce.number().int().positive(),
});
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;

/**
 * What the Employees drawer picks from (BL-231): the locations the person may
 * place somebody at, every job, and only the roles they may invite with.
 */
export const employeeReferenceDataSchema = z.object({
  locations: z.array(locationSchema.pick({ id: true, name: true, archived_at: true, timezone: true })),
  // Archived ones included, so an archived job still finds its department (BL-218).
  departments: z.array(departmentSchema.pick({ id: true, name: true, archived_at: true, system_key: true })),
  jobs: z.array(
    jobSchema.pick({ id: true, name: true, archived_at: true, department_id: true, system_key: true }),
  ),
  invite_roles: z.array(
    workspaceRoleRecordSchema.pick({ id: true, name: true, system_key: true, access_class: true }),
  ),
});
export type EmployeeReferenceDataRecord = z.infer<typeof employeeReferenceDataSchema>;

export const employeeEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string().trim().min(1).max(120),
  occurred_at: z.string().datetime({ offset: true }),
  actor_user_id: z.string().uuid(),
  summary: z.string().max(240),
});
export type EmployeeEvent = z.infer<typeof employeeEventSchema>;

// The drawer names the role itself (the rank, KARARLAR S-179); the list names the two slots.
export const employeeDetailSchema = employeeSummarySchema.omit({ management_access: true, employee_access: true }).extend({
  role_name: z.string().nullable(),
  primary_location_id: z.string().uuid().nullable(),
  primary_location_name: z.string().nullable(),
  location_count: z.coerce.number().int().nonnegative(),
  user_id: z.string().uuid().nullable(),
  account_email: z.string().email().nullable().optional(),
  internal_note: z.string().max(1000),
  is_remote: z.boolean().optional(),
  is_excluded_from_schedule: z.boolean().optional(),
  role_id: z.string().uuid().nullable().optional(),
  // The record's two access slots (ROL-CIFT 2.2): somebody with no account yet
  // holds the employee one, as the server's has_employee_access reads it.
  access: workspaceAccessSchema,
  // DAVET-ERISIM: the account's two slots by role, and where a manager manages
  // (empty for who may neither read nor change access).
  employee_role_id: z.string().uuid().nullable().default(null),
  management_role_id: z.string().uuid().nullable().default(null),
  managed_location_ids: z.array(z.string().uuid()).default([]),
  private_contact: z
    .object({
      // Names, addresses and phones under the US form rules the data keeps
      // (BL-503, BL-969).
      legal_first_name: usText(z.string().trim().min(1).max(80)).optional(),
      legal_middle_name: usText(z.string().trim().max(80)).optional(),
      legal_last_name: usText(z.string().trim().min(1).max(80)).optional(),
      preferred_name: usText(z.string().trim().max(80)).optional(),
      // Null for a person the workspace only knows an emergency contact for:
      // the owner, who never runs employee onboarding.
      phone: usPhoneSchema.nullable(),
      street_address: usText(z.string().trim().max(180)).nullable().optional(),
      city: usText(z.string().trim().max(100)).nullable().optional(),
      region: usText(z.string().trim().max(100)).nullable().optional(),
      postal_code: z.string().trim().max(20).nullable().optional(),
      country_code: z.string().trim().length(2).nullable().optional(),
      date_of_birth: z.string().date().nullable(),
      // Null together until a contact is given: the owner's record is opened
      // at setup with the legal name only (BL-080).
      emergency_contact_name: usText(z.string().trim().min(1).max(120)).nullable(),
      emergency_contact_relationship: usText(z.string().trim().min(1).max(80)).nullable(),
      emergency_contact_email: z.string().trim().email().or(z.literal("")),
      emergency_contact_phone: usPhoneSchema.nullable(),
      share_phone_with_teammates: z.boolean(),
      share_email_with_teammates: z.boolean(),
    })
    .nullable()
    .default(null),
  // removable: may the reader take them off this location
  // (employee.remove_from_location there; FB-6.2 S1).
  locations: z.array(employeeAssignmentSchema.extend({ removable: z.boolean() })),
  jobs: z.array(employeeAssignmentSchema),
  invitation: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      role_id: z.string().uuid(),
      // DAVET-ERISIM: the two accesses it carries.
      employee_role_id: z.string().uuid().nullable().default(null),
      management_role_id: z.string().uuid().nullable().default(null),
      managed_location_ids: z.array(z.string().uuid()).default([]),
      status: z.enum(["pending", "accepted", "revoked", "expired", "declined"]),
      expires_at: z.string().datetime({ offset: true }),
      sent_at: z.string().datetime({ offset: true }),
      delivery_status: z.enum(["pending", "sent", "failed"]).default("sent"),
      delivery_attempted_at: z
        .string()
        .datetime({ offset: true })
        .nullable()
        .optional(),
      delivery_failed_at: z
        .string()
        .datetime({ offset: true })
        .nullable()
        .optional(),
      delivery_error: z.string().max(500).nullable().optional(),
      role_name: z.string().trim().min(1).max(120).nullable().optional(),
      invited_by_name: z.string().trim().min(1).max(320).nullable().optional(),
    })
    .nullable(),
  onboarding: z.object({
    status: z.enum([
      "not_requested",
      "invited",
      "in_progress",
      "submitted",
      "changes_requested",
      "approved",
      "cancelled",
    ]),
    required_documents: z.coerce.number().int().nonnegative(),
    completed_documents: z.coerce.number().int().nonnegative(),
  }),
  events: z.array(employeeEventSchema),
  // Whether this is the workspace owner's own record (EMP-001 C, BL-421). The
  // server says it for every reader; a role name never does.
  is_workspace_owner: z.boolean(),
  // What the reader may do to this record, answered by the authorization core
  // (get_employee_detail_service). The drawer opens its buttons from this,
  // never from a role name.
  allowed: z.object({
    save: z.boolean(),
    terminate: z.boolean(),
    archive: z.boolean(),
    remove_access: z.boolean(),
    change_role: z.boolean(),
    make_admin: z.boolean(),
    invite: z.boolean(),
    onboarding_review: z.boolean(),
  }),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

/**
 * ROL-CIFT 4.1 (design §4.8): changing somebody's two access slots. Giving the
 * employee access up closes their employee side; what it does is shown first
 * and sent back, so a change made since refuses the save (PT409).
 */
export const employeeAccessImpactSchema = z.object({
  shifts_opened: z.number().int().nonnegative(),
  requests_closed: z.number().int().nonnegative(),
  applications_closed: z.number().int().nonnegative(),
  time_off_withdrawn: z.number().int().nonnegative(),
  availability_deleted: z.boolean(),
});
export type EmployeeAccessImpact = z.infer<typeof employeeAccessImpactSchema>;
export const employeeAccessPreviewInputSchema = z.object({
  employee_role_id: z.string().uuid().nullable(),
  management_role_id: z.string().uuid().nullable(),
});
export type EmployeeAccessPreviewInput = z.infer<
  typeof employeeAccessPreviewInputSchema
>;
export const employeeAccessChangeInputSchema =
  employeeAccessPreviewInputSchema.extend({
    managed_location_ids: z.array(z.string().uuid()).max(500),
    // Left out: the person's own Management jobs (the drawer names none).
    management_job_ids: z.array(z.string().uuid()).max(100).optional(),
    expected_impact: employeeAccessImpactSchema,
  });
export type EmployeeAccessChangeInput = z.infer<
  typeof employeeAccessChangeInputSchema
>;
export const employeeAccessChangeResultSchema = z.object({
  membership_id: z.string().uuid(),
  employee_role_id: z.string().uuid().nullable(),
  management_role_id: z.string().uuid().nullable(),
  impact: employeeAccessImpactSchema,
});
export type EmployeeAccessChangeResult = z.infer<
  typeof employeeAccessChangeResultSchema
>;

/**
 * Taking somebody off one location (FB-6.2 S1): their shifts there from now on
 * are left open and the record stays, with no location if it was the only one.
 */
export const employeeLocationRemovalSchema = z.object({
  releasedShiftCount: z.number().int().nonnegative(),
  locationsLeft: z.number().int().nonnegative(),
});
export type EmployeeLocationRemoval = z.infer<typeof employeeLocationRemovalSchema>;

export const employeeInputSchema = z
  .object({
    // The US letter rule on every name (BL-503).
    first_name: usText(z.string().trim().min(1).max(80)),
    middle_name: usText(z.string().trim().max(80)).optional(),
    last_name: usText(z.string().trim().min(1).max(80)),
    // Not written by this save: it changes by the employee's request (KK-205),
    // where the US letter rule holds.
    preferred_name: z.string().trim().max(80),
    invitation_email: z.string().trim().email().or(z.literal("")),
    start_date: z.string().date().or(z.literal("")),
    internal_note: z.string().trim().max(1000),
    location_ids: z.array(z.string().uuid()),
    primary_location_id: z.string().uuid().nullable(),
    job_ids: z.array(z.string().uuid()),
    primary_job_id: z.string().uuid().nullable(),
    is_remote: z.boolean().optional(),
    is_excluded_from_schedule: z.boolean().optional(),
    /**
     * The workspace's owner. They hold every location and every job, so naming
     * one of them primary says nothing, and requiring it would stop the record
     * saving at all. The server decides this for itself; this only keeps the
     * form from refusing first.
     */
    is_owner_record: z.boolean().optional(),
    expected_revision: z.number().int().positive().nullable(),
  })
  .superRefine((value, issue) => {
    // Remote and Exclude from schedule never lift it (DAVET-ERISIM); the owner works anywhere.
    if (value.is_owner_record === true) return;
    // The primary job is the database's to ask for
    // (employee.primary_job_required): a picker marks the first job ticked,
    // so a form has nothing to say first. So is whether a location is needed
    // after all because they are a manager (employee.manager_location_required,
    // EMP-001 K4): the role is not in this payload. managerLocationRefusal()
    // is that rule for a form.
    if (value.location_ids.length === 0 || value.primary_location_id === null) {
      issue.addIssue({
        code: "custom",
        message: managementAndOwnerRefusals["employee.location_required"],
        path: ["location_ids"],
      });
    }
    if (value.job_ids.length === 0) {
      issue.addIssue({
        code: "custom",
        message: managementAndOwnerRefusals["employee.job_required"],
        path: ["job_ids"],
      });
    }
  });
export type EmployeeInput = z.infer<typeof employeeInputSchema>;

/**
 * EMP-001 K4: a manager manages where they are assigned, so a manager who is
 * not Remote has at least one location, excluded from the schedule or not.
 * The database decides (employee.manager_location_required on a save, a
 * removal from a location, a role change and an invitation). This is the same
 * rule for a form that knows the role the record holds or is about to be
 * given: the sentence to show, or undefined when there is nothing to say.
 */
export function managerLocationRefusal(
  roleClass: WorkspaceRole | null | undefined,
  record: { readonly is_remote?: boolean; readonly location_ids: readonly string[] },
): string | undefined {
  return roleClass === "manager" && record.is_remote !== true && record.location_ids.length === 0
    ? managementAndOwnerRefusals["employee.manager_location_required"]
    : undefined;
}

/**
 * DAVET-ERISIM (Tur 4 B): what an invitation gives, the employee app and the
 * management app apart (a role, and for a manager the locations they manage).
 */
export const employeeInvitationAccessSchema = z.object({
  employee_role_id: z.string().uuid().nullable(),
  management_role_id: z.string().uuid().nullable(),
  managed_location_ids: z.array(z.string().uuid()).max(500),
});
export type EmployeeInvitationAccess = z.infer<typeof employeeInvitationAccessSchema>;

/**
 * The database's rule for what an invitation or an access change names, for a
 * form that refuses first: the sentence to show, or undefined. managementClass
 * is the class of the management role chosen (undefined: not known yet).
 */
export function invitationAccessRefusal(
  access: { readonly employee: boolean; readonly management: boolean; readonly managementRoleId: string; readonly managedLocationIds: readonly string[] },
  managementClass: WorkspaceRole | null | undefined,
): string | undefined {
  if (!access.employee && !access.management) return managementAndOwnerRefusals["access.role_required"];
  if (!access.management) return undefined;
  if (!access.managementRoleId) return managementAndOwnerRefusals["access.management_role_required"];
  return managementClass === "manager" && access.managedLocationIds.length === 0
    ? managementAndOwnerRefusals["access.manages_required"]
    : undefined;
}

export const employeeCreateCommandSchema = z
  .object({
    request_id: z.string().uuid(),
    employee: employeeInputSchema,
    invite_access: employeeInvitationAccessSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.invite_access && !value.employee.invitation_email.trim()) {
      context.addIssue({
        code: "custom",
        path: ["employee", "invitation_email"],
        message: "Enter a valid email address.",
      });
    }
  });
export type EmployeeCreateCommand = z.infer<typeof employeeCreateCommandSchema>;
export const employeeCreateResultSchema = z.object({
  id: z.string().uuid(),
  invitation: z
    .object({
      id: z.string().uuid(),
      deliveryStatus: z.enum(["pending", "sent", "failed"]),
      developmentUrl: z.string().optional(),
    })
    .nullable(),
});
export type EmployeeCreateResult = z.infer<typeof employeeCreateResultSchema>;

export const employeeOnboardingCaseStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "changes_requested",
  "approved",
  "cancelled",
]);
export type EmployeeOnboardingCaseStatus = z.infer<
  typeof employeeOnboardingCaseStatusSchema
>;

export const employeeOnboardingRequirementKindSchema = z.enum([
  "profile",
  "ssn",
  "document",
  "acknowledgement",
  "availability",
]);
export const employeeOnboardingRequirementStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "awaiting_review",
  "completed",
  "rejected",
  "manual_follow_up",
  "superseded",
]);

export const employeeOnboardingRequirementSchema = z.object({
  id: z.string().uuid(),
  kind: employeeOnboardingRequirementKindSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500),
  status: employeeOnboardingRequirementStatusSchema,
  required: z.boolean(),
  document_mode: z.enum(["optional", "required", "conditional"]).nullable().optional(),
  conditional_reason: z.string().nullable().optional(),
  blocks_activation: z.boolean(),
  requires_review: z.boolean(),
  sort_order: z.number().int().nonnegative(),
  source_id: z.string().uuid().nullable(),
  accepted_formats: z.array(z.enum(["pdf", "jpeg", "png", "webp"])).default([]),
  content_text: z.string().max(50000).nullable(),
  content_digest: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  intent_statement: z.string().max(500).nullable(),
  rejection_reason: z.string().max(500).nullable(),
});
export type EmployeeOnboardingRequirement = z.infer<
  typeof employeeOnboardingRequirementSchema
>;

/**
 * The private profile: the US letter rule on names, addresses and the contact,
 * and phones as a US number in E.164 (BL-503), the same in the data (BL-969).
 */
const employeeOnboardingProfileBaseSchema = z.object({
  legal_first_name: usText(z.string().trim().min(1).max(80)),
  legal_middle_name: usText(z.string().trim().max(80)).optional(),
  legal_last_name: usText(z.string().trim().min(1).max(80)),
  /** What the team calls this person; documents keep the legal name. */
  preferred_name: usText(z.string().trim().max(80)).optional(),
  phone: usPhoneSchema,
  street_address: usText(z.string().trim().min(1).max(180)),
  city: usText(z.string().trim().min(1).max(100)),
  region: usText(z.string().trim().min(1).max(100)),
  postal_code: z.string().trim().min(1).max(20),
  country_code: z.literal("US"),
  date_of_birth: z
    .string()
    .date()
    .refine(
      (value) => value <= new Date().toISOString().slice(0, 10),
      "Date of birth cannot be in the future",
    ),
  emergency_contact_name: usText(z.string().trim().min(1).max(120)),
  emergency_contact_relationship: usText(z.string().trim().min(1).max(80)),
  emergency_contact_email: z.string().trim().email().or(z.literal("")),
  emergency_contact_phone: usPhoneSchema,
  share_phone_with_teammates: z.boolean(),
  share_email_with_teammates: z.boolean(),
});

/** A profile part way through onboarding: any part may still be missing. */
const employeeOnboardingProfileReadSchema =
  employeeOnboardingProfileBaseSchema.partial().extend({
    street_address: employeeOnboardingProfileBaseSchema.shape.street_address
      .nullable()
      .optional(),
    city: employeeOnboardingProfileBaseSchema.shape.city
      .nullable()
      .optional(),
    region: employeeOnboardingProfileBaseSchema.shape.region
      .nullable()
      .optional(),
    postal_code: employeeOnboardingProfileBaseSchema.shape.postal_code
      .nullable()
      .optional(),
    country_code: employeeOnboardingProfileBaseSchema.shape.country_code
      .nullable()
      .optional(),
    date_of_birth: employeeOnboardingProfileBaseSchema.shape.date_of_birth
      .nullable()
      .optional(),
  });

export const employeeOnboardingProfileSchema =
  employeeOnboardingProfileBaseSchema.superRefine((profile, context) => {
    // Both are E.164 by now: the same number is the same string.
    if (profile.phone === profile.emergency_contact_phone) {
      context.addIssue({
        code: "custom",
        path: ["emergency_contact_phone"],
        message: "Emergency phone must be different from your phone",
      });
    }
  });

export type EmployeeOnboardingProfile = z.infer<
  typeof employeeOnboardingProfileSchema
>;

function isPathWithinRoot(path: string, root: string) {
  return (
    path === root ||
    path.startsWith(`${root}/`) ||
    path.startsWith(`${root}?`) ||
    path.startsWith(`${root}#`)
  );
}

const employeeOnboardingActionPathSchema = z
  .string()
  .refine(
    (path) =>
      isPathWithinRoot(path, "/welcome") ||
      isPathWithinRoot(path, "/app/employee-hub"),
    "Employee onboarding action path must stay in onboarding or employee hub",
  );

export const employeeOnboardingSchema = z.object({
  case_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  workspace_name: z.string().trim().min(1).max(120),
  employee_id: z.string().uuid(),
  employee_name: z.string().trim().min(1).max(161),
  membership_id: z.string().uuid(),
  membership_status: z.enum(["pending_activation", "active"]),
  case_status: employeeOnboardingCaseStatusSchema,
  revision: z.number().int().positive(),
  progress_completed: z.number().int().nonnegative(),
  progress_total: z.number().int().nonnegative(),
  first_actionable_path: employeeOnboardingActionPathSchema,
  ssn_status: z.object({
    present: z.boolean(),
    last_four: z
      .string()
      .regex(/^\d{4}$/)
      .nullable(),
  }),
  profile: employeeOnboardingProfileReadSchema.nullable(),
  assignments: z.object({
    locations: z.array(z.string()),
    jobs: z.array(z.string()),
  }),
  requirements: z.array(employeeOnboardingRequirementSchema),
});
export type EmployeeOnboarding = z.infer<typeof employeeOnboardingSchema>;

export const employeeOnboardingManagerSchema = z.object({
  case_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  case_status: employeeOnboardingCaseStatusSchema,
  revision: z.number().int().positive(),
  submitted_at: z.string().datetime({ offset: true }).nullable(),
  progress_completed: z.number().int().nonnegative(),
  progress_total: z.number().int().nonnegative(),
  ssn_present: z.boolean(),
  requirements: z.array(employeeOnboardingRequirementSchema),
});
export type EmployeeOnboardingManager = z.infer<
  typeof employeeOnboardingManagerSchema
>;

export const documentFormatSchema = z.enum(["pdf", "jpeg", "png", "webp"]);
export type DocumentFormat = z.infer<typeof documentFormatSchema>;

export const documentExpiryScheduleImpactSchema = z.enum([
  "track_only",
  "warn",
  "block",
]);
export type DocumentExpiryScheduleImpact = z.infer<
  typeof documentExpiryScheduleImpactSchema
>;

export const documentTypeSchema = z.object({
  publication_status: z.enum(["draft", "published"]).optional(),
  publication_revision: z.number().int().positive().optional(),
  published_at: z.string().datetime({ offset: true }).nullable().optional(),
  lifecycle_settings: documentLifecycleSettingsSchema.optional(),
  lifecycle_revision: z.number().int().positive().optional(),
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  description: z.string().max(240),
  required_at_onboarding: z.boolean(),
  requires_review: z.boolean(),
  accepted_formats: z.array(documentFormatSchema).min(1),
  tracks_expiry: z.boolean(),
  expiry_warning_days: z.number().int().min(1).max(365),
  expiry_schedule_impact:
    documentExpiryScheduleImpactSchema.default("track_only"),
  sort_order: z.number().int().nonnegative(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentTypeInputSchema = documentTypeSchema
  .pick({
    lifecycle_settings: true,
    lifecycle_revision: true,
    title: true,
    description: true,
    required_at_onboarding: true,
    requires_review: true,
    accepted_formats: true,
    tracks_expiry: true,
    expiry_warning_days: true,
    expiry_schedule_impact: true,
  })
  .refine(
    (documentType) =>
      new Set(documentType.accepted_formats).size ===
      documentType.accepted_formats.length,
    {
      message: "Document formats must be unique",
      path: ["accepted_formats"],
    },
  )
  .superRefine((documentType, issue) => {
    if (
      documentType.tracks_expiry &&
      documentType.expiry_schedule_impact === "block" &&
      !documentType.required_at_onboarding
    ) {
      issue.addIssue({
        code: "custom",
        message: "Only required documents can create hard schedule conflicts",
        path: ["expiry_schedule_impact"],
      });
    }
  });
export type DocumentTypeInput = z.infer<typeof documentTypeInputSchema>;

export const signatureRetentionTriggerSchema = z.enum([
  "signed_at",
  "employment_end",
]);
export const signatureRetentionStatusSchema = z.enum(["draft", "approved"]);
export const signatureExecutionClassSchema = z.enum([
  "acknowledgement",
  "electronic_signature",
  "external_process",
]);
export const signatureVersionStatusSchema = z.enum(["draft", "published"]);

export const signatureRetentionPolicySchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  retention_trigger: signatureRetentionTriggerSchema,
  duration_days: z.number().int().min(1).max(36500),
  jurisdiction_scope: z.string().trim().min(1).max(120),
  authority_reference: z.string().trim().min(1).max(500),
  status: signatureRetentionStatusSchema,
  approved_at: z.string().datetime({ offset: true }).nullable(),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type SignatureRetentionPolicy = z.infer<
  typeof signatureRetentionPolicySchema
>;

export const signatureRetentionPolicyInputSchema =
  signatureRetentionPolicySchema.pick({
    name: true,
    retention_trigger: true,
    duration_days: true,
    jurisdiction_scope: true,
    authority_reference: true,
  });
export type SignatureRetentionPolicyInput = z.infer<
  typeof signatureRetentionPolicyInputSchema
>;

export const signatureTemplateSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  archived_at: z.string().datetime({ offset: true }).nullable(),
});
export type SignatureTemplate = z.infer<typeof signatureTemplateSchema>;

export const signatureTemplateVersionSchema = z.object({
  lifecycle_settings: documentLifecycleSettingsSchema.nullable().optional(),
  lifecycle_revision: z.number().int().positive().optional(),
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  template_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  title: z.string().trim().min(1).max(80),
  summary: z.string().max(240),
  execution_class: signatureExecutionClassSchema,
  content_text: z.string().min(1).max(50000),
  content_digest: z.string().regex(/^[0-9a-f]{64}$/),
  intent_statement: z.string().trim().min(1).max(500),
  locale: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  required_at_onboarding: z.boolean(),
  blocks_activation: z.boolean(),
  retention_policy_id: z.string().uuid(),
  status: signatureVersionStatusSchema,
  published_at: z.string().datetime({ offset: true }).nullable(),
});
export type SignatureTemplateVersion = z.infer<
  typeof signatureTemplateVersionSchema
>;

export const signatureTemplateDraftInputSchema = signatureTemplateVersionSchema
  .pick({
    lifecycle_settings: true,
    lifecycle_revision: true,
    title: true,
    summary: true,
    content_text: true,
    intent_statement: true,
    locale: true,
    effective_date: true,
    required_at_onboarding: true,
    blocks_activation: true,
    retention_policy_id: true,
  })
  .superRefine((template, issue) => {
    if (template.lifecycle_settings?.mode === "conditional") issue.addIssue({ code: "custom", path: ["lifecycle_settings", "mode"], message: "Policies are optional or required" });
    if (template.blocks_activation && !template.required_at_onboarding) {
      issue.addIssue({
        code: "custom",
        message: "Activation blocking requires onboarding assignment",
        path: ["blocks_activation"],
      });
    }
  });
export type SignatureTemplateDraftInput = z.infer<
  typeof signatureTemplateDraftInputSchema
>;

export const productBoundary = {
  oldReferencePath: "C:\\Users\\TheWe\\newfork",
  forbiddenLegacyDomains: [
    "time-entry",
    "kiosk",
    "payroll",
    "pay-entity",
    "compliance",
    "labor-law",
    "breaks",
    "overtime",
    "jurisdiction",
  ],
  exactPortSurfaces: [
    "left-sidebar-app-shell",
    "calendar",
    "main-schedule-page",
    "employee-drawer-shell",
  ],
} as const;
export * from "./shift-exchanges";
export * from "./schedule-default-hours";

export * from "./authorization";

/**
 * The Settings reads the API serves (GET /v1/workspaces/:id/settings/:kind),
 * each from one `*_service` that answers "no" with 42501 + authz.* (FB-6.1.9).
 * One map so the API route, its service and the web read the same contract.
 */
export const settingsReadSchemas = {
  locations: z.array(locationSchema),
  jobs: z.object({ departments: z.array(departmentSchema), jobs: z.array(jobSchema) }),
  "shift-types": z.array(shiftTypeSchema),
  "shift-labels": z.array(shiftLabelSchema),
  roles: z.object({ permissions: z.array(permissionDefinitionSchema), roles: z.array(workspaceRoleRecordSchema) }),
  "document-types": z.array(documentTypeSchema),
  acknowledgements: z.object({
    policies: z.array(signatureRetentionPolicySchema),
    templates: z.array(signatureTemplateSchema),
    versions: z.array(signatureTemplateVersionSchema),
  }),
} as const;
export type SettingsReadKind = keyof typeof settingsReadSchemas;
export type SettingsRead<K extends SettingsReadKind> = z.infer<(typeof settingsReadSchemas)[K]>;
export const settingsReadKinds = Object.keys(settingsReadSchemas) as SettingsReadKind[];
