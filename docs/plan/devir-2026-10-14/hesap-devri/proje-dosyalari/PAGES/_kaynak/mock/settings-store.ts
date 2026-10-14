// The settings area's own demo data: the workspace's identity and logo,
// scheduling rules, notification policies, roles, document types and
// acknowledgement templates. The catalog (locations, departments, jobs, shift
// types, labels) is the shared world's; see settings-catalog.ts.
import { SHIFT_LEAD_PERMISSIONS } from "./access";
import {
  DEFAULT_SCHEDULE_CONFLICT_RULES,
  permissionsForRole,
  type DocumentLifecycleSettings,
  type DocumentType,
  type Permission,
  type ScheduleConflictRules,
  type SignatureRetentionPolicy,
  type SignatureTemplate,
  type SignatureTemplateVersion,
} from "@newfork/shared";
import { domainStore } from "./store";
import { addDays, fingerprint, todayIn } from "./time";
import { DEPT, JOB, LOC, OWNER_USER_ID, WORKSPACE_ID, ZONE } from "./world";

export const nowIso = () => new Date().toISOString();
const daysAgo = (days: number, hour = 15) => {
  const at = new Date(Date.now() - days * 86_400_000);
  at.setUTCHours(hour, 12, 0, 0);
  return at.toISOString();
};
// Fixed ids keep links and saved state stable across reloads.
const id = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const ROLE = {
  owner: id(0xc01), admin: id(0xc02), manager: id(0xc03), employee: id(0xc04),
  shiftLead: id(0xc05), kitchenLead: id(0xc06),
};

export interface WorkspaceRow {
  id: string;
  name: string;
  logo_storage_path: string | null;
  logo_file_name: string | null;
  logo_updated_at: string | null;
  schedule_logo_scale: number;
  schedule_logo_offset_x: number;
  schedule_logo_offset_y: number;
  updated_at: string;
}

export interface SchedulingRow {
  week_start_day: "sunday" | "monday";
  schedule_deadline_day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  time_format: "12h" | "24h";
  time_off_lead_hours: number;
  minimum_travel_minutes: number;
  minimum_rest_minutes: number;
  conflict_rules: ScheduleConflictRules;
  conflict_rules_revision: number;
}

export interface NotificationPolicyRow {
  id: string;
  type_key: string;
  schema_version: number;
  role_id: string | null;
  location_id: string | null;
  enabled: boolean;
  allowed_channels: ("in_app" | "email" | "push")[];
  cadence: "immediate" | "daily_digest" | "weekly_digest";
  version: number;
  updated_by: string;
  updated_at: string;
}

export interface NotificationAuditRow {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  actor_user_id: string | null;
  reason: string | null;
  before_version: number | null;
  after_version: number | null;
  occurred_at: string;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  system_key: "owner" | "admin" | "manager" | "employee" | null;
  access_class: "owner" | "admin" | "manager" | "employee";
  sort_order: number;
  created_at: string;
  updated_at: string;
  permission_keys: Permission[];
  member_count: number;
  pending_invite_count: number;
}

export interface SettingsData {
  workspace: WorkspaceRow;
  scheduling: SchedulingRow;
  notification_policies: NotificationPolicyRow[];
  notification_audit: NotificationAuditRow[];
  roles: RoleRow[];
  /** employee_profiles.revision, bumped by every change to someone's jobs or locations. */
  employee_revisions: Record<string, number>;
  document_types: DocumentType[];
  retention_policies: SignatureRetentionPolicy[];
  signature_templates: SignatureTemplate[];
  signature_versions: SignatureTemplateVersion[];
  /** Who a published document type or acknowledgement version was assigned to (employee ids). */
  assigned: Record<string, string[]>;
}

const target = (part: Partial<DocumentLifecycleSettings["target"]> = {}) => ({
  operator: "and" as const, location_ids: [], department_ids: [], job_ids: [], employee_ids: [], ...part,
});
const lifecycle = (part: Partial<DocumentLifecycleSettings>): DocumentLifecycleSettings => ({
  mode: "optional", target: target(), assignment_scope: "all_active", period_days: null,
  suspend_on_overdue: false, extra_fields: [], ...part,
});

function documentTypes(): DocumentType[] {
  const base = { workspace_id: WORKSPACE_ID, archived_at: null, expiry_schedule_impact: "track_only" as const, lifecycle_revision: 1 };
  return [
    {
      ...base, id: id(0xd01), sort_order: 0, title: "Form W-4",
      description: "Federal tax withholding certificate. Upload the signed form so payroll can set up withholding.",
      required_at_onboarding: true, requires_review: true, accepted_formats: ["pdf", "jpeg", "png"],
      tracks_expiry: false, expiry_warning_days: 30,
      lifecycle_settings: lifecycle({ mode: "required", period_days: 7 }), lifecycle_revision: 2,
      publication_status: "published", publication_revision: 2, published_at: daysAgo(40),
    },
    {
      ...base, id: id(0xd02), sort_order: 1, title: "Form I-9",
      description: "Employment eligibility verification. Bring original documents to your manager within 3 days of starting.",
      required_at_onboarding: true, requires_review: true, accepted_formats: ["pdf", "jpeg", "png"],
      tracks_expiry: false, expiry_warning_days: 30,
      lifecycle_settings: lifecycle({ mode: "required", period_days: 3, suspend_on_overdue: true }),
      publication_status: "published", publication_revision: 2, published_at: daysAgo(40),
    },
    {
      ...base, id: id(0xd03), sort_order: 2, title: "Food Handler Card",
      description: "A current food handler certificate for everyone who prepares or serves food.",
      required_at_onboarding: false, requires_review: true, accepted_formats: ["pdf", "jpeg", "png", "webp"],
      tracks_expiry: true, expiry_warning_days: 30,
      lifecycle_settings: lifecycle({
        mode: "conditional", period_days: 30,
        target: target({ operator: "or", department_ids: [DEPT.kitchen], job_ids: [JOB.server, JOB.bartender] }),
        extra_fields: [{ key: "certificate_number", label: "Certificate number", kind: "text", required: true }],
      }),
      lifecycle_revision: 3,
      publication_status: "published", publication_revision: 4, published_at: daysAgo(18),
    },
    {
      ...base, id: id(0xd04), sort_order: 3, title: "Direct Deposit Form",
      description: "Bank details for paychecks. Attach a voided check or your bank's direct deposit letter.",
      required_at_onboarding: false, requires_review: false, accepted_formats: ["pdf", "jpeg", "png"],
      tracks_expiry: false, expiry_warning_days: 30,
      lifecycle_settings: lifecycle({ mode: "optional" }),
      publication_status: "draft", publication_revision: 1, published_at: null,
    },
    {
      ...base, id: id(0xd05), sort_order: 4, title: "Employee Handbook acknowledgement",
      description: "The signed last page of the Harbor & Vine employee handbook.",
      required_at_onboarding: true, requires_review: false, accepted_formats: ["pdf"],
      tracks_expiry: false, expiry_warning_days: 30,
      lifecycle_settings: lifecycle({ mode: "required", period_days: 14 }),
      publication_status: "published", publication_revision: 2, published_at: daysAgo(60),
    },
    {
      ...base, id: id(0xd06), sort_order: 5, title: "TB Test Results",
      description: "No longer required by the county health department.",
      required_at_onboarding: false, requires_review: true, accepted_formats: ["pdf", "jpeg"],
      tracks_expiry: true, expiry_warning_days: 14,
      lifecycle_settings: lifecycle({ mode: "optional" }),
      publication_status: "draft", publication_revision: 3, published_at: null, archived_at: daysAgo(90),
    },
  ];
}

const handbookV1 = `Harbor & Vine Employee Handbook — Acknowledgement

I have received the Harbor & Vine Employee Handbook. I understand it describes our policies on scheduling, attendance, time off, uniforms, food safety and conduct at work.

I understand that I am responsible for reading the handbook and asking my manager about anything I do not understand. Harbor & Vine may change these policies, and will tell me when it does.

I understand that nothing in the handbook is a contract of employment.`;
const handbookV2 = `${handbookV1}

Updated: shift swaps must now be requested in Newfork at least 24 hours before the shift starts.`;
const tipPool = `Tip Pooling Policy

Tips at Harbor & Vine are pooled among front-of-house and bar staff who serve guests during a shift: servers, bartenders, bussers, barbacks and hosts. Managers and owners never take part in the tip pool.

The pool is divided by hours worked during each shift and paid out with the next paycheck. You can ask your manager for the tip report for any shift you worked.

By accepting, I confirm that I have read and understand this policy.`;

function signatureData() {
  const federal = id(0xe01);
  const state = id(0xe02);
  const handbook = id(0xe11);
  const tips = id(0xe12);
  const version = (part: Partial<SignatureTemplateVersion> & Pick<SignatureTemplateVersion, "id" | "template_id" | "version_number" | "title" | "content_text">): SignatureTemplateVersion => ({
    workspace_id: WORKSPACE_ID, summary: "", execution_class: "acknowledgement",
    content_digest: fingerprint(part.content_text), intent_statement: "I have read and understand this policy.",
    locale: "en-US", effective_date: addDays(todayIn(ZONE), -60), required_at_onboarding: true, blocks_activation: false,
    retention_policy_id: federal, status: "published", published_at: daysAgo(60),
    lifecycle_settings: lifecycle({ mode: "required", period_days: 14 }), lifecycle_revision: 1,
    ...part,
  });
  return {
    retention_policies: [
      {
        id: federal, workspace_id: WORKSPACE_ID, name: "Personnel records (federal)", retention_trigger: "employment_end",
        duration_days: 1095, jurisdiction_scope: "United States (federal)",
        authority_reference: "29 CFR 516.5 and 29 CFR 1602.14 — payroll and personnel records kept 3 years.",
        status: "approved", approved_at: daysAgo(75), archived_at: null,
      },
      {
        id: state, workspace_id: WORKSPACE_ID, name: "Massachusetts personnel records", retention_trigger: "employment_end",
        duration_days: 1095, jurisdiction_scope: "Massachusetts",
        authority_reference: "M.G.L. c.149 §52C — personnel records kept 3 years after employment ends.",
        status: "draft", approved_at: null, archived_at: null,
      },
    ] satisfies SignatureRetentionPolicy[],
    signature_templates: [
      { id: handbook, workspace_id: WORKSPACE_ID, name: "Employee Handbook", archived_at: null },
      { id: tips, workspace_id: WORKSPACE_ID, name: "Tip Pooling Policy", archived_at: null },
    ] satisfies SignatureTemplate[],
    signature_versions: [
      version({ id: id(0xe21), template_id: handbook, version_number: 1, title: "Employee Handbook", summary: "Confirms the employee received and will read the handbook.", content_text: handbookV1 }),
      version({
        id: id(0xe22), template_id: handbook, version_number: 2, title: "Employee Handbook", summary: "Adds the 24-hour shift swap rule.",
        content_text: handbookV2, status: "draft", published_at: null, effective_date: addDays(todayIn(ZONE), 7), lifecycle_revision: 2,
      }),
      version({
        id: id(0xe23), template_id: tips, version_number: 1, title: "Tip Pooling Policy", summary: "How tips are pooled and paid out.",
        content_text: tipPool, required_at_onboarding: false, published_at: daysAgo(30),
        lifecycle_settings: lifecycle({ mode: "optional", target: target({ department_ids: [DEPT.foh, DEPT.bar] }) }),
      }),
    ] satisfies SignatureTemplateVersion[],
  };
}

function roles(): RoleRow[] {
  const created = daysAgo(120);
  const role = (part: Omit<RoleRow, "created_at" | "updated_at" | "pending_invite_count"> & Partial<RoleRow>): RoleRow => ({
    created_at: created, updated_at: created, pending_invite_count: 0, ...part,
  });
  return [
    role({ id: ROLE.owner, name: "Owner", description: "Full access to every location and setting.", system_key: "owner", access_class: "owner", sort_order: 0, permission_keys: [...permissionsForRole("owner")], member_count: 1 }),
    role({ id: ROLE.admin, name: "Admin", description: "Runs the workspace with the owner.", system_key: "admin", access_class: "admin", sort_order: 1, permission_keys: [...permissionsForRole("admin")], member_count: 1 }),
    role({ id: ROLE.manager, name: "Manager", description: "Runs the schedule and team at their locations.", system_key: "manager", access_class: "manager", sort_order: 2, permission_keys: [...permissionsForRole("manager")], member_count: 2 }),
    role({ id: ROLE.employee, name: "Employee", description: "Sees their own schedule and sends requests.", system_key: "employee", access_class: "employee", sort_order: 3, permission_keys: [...permissionsForRole("employee")], member_count: 14, pending_invite_count: 2 }),
    role({
      id: ROLE.shiftLead, name: "Shift Lead", description: "Covers the floor when no manager is in: sees the team and answers requests.",
      system_key: null, access_class: "manager", sort_order: 100, updated_at: daysAgo(21), member_count: 2,
      permission_keys: [...SHIFT_LEAD_PERMISSIONS],
    }),
    role({
      id: ROLE.kitchenLead, name: "Kitchen Lead", description: "Sees the kitchen schedule and posts announcements.",
      system_key: null, access_class: "manager", sort_order: 100, updated_at: daysAgo(4), member_count: 0,
      permission_keys: ([
        "workspace.read", "schedule.read", "employees.read", "announcements.read", "announcements.manage",
        "notifications.read", "notifications.read_own", "notifications.preferences.write_own",
      ] satisfies Permission[]).sort(),
    }),
  ];
}

function seed(): SettingsData {
  return {
    workspace: {
      id: WORKSPACE_ID, name: "Harbor & Vine", logo_storage_path: null, logo_file_name: null, logo_updated_at: null,
      schedule_logo_scale: 1, schedule_logo_offset_x: 0, schedule_logo_offset_y: 0, updated_at: daysAgo(120),
    },
    scheduling: {
      week_start_day: "monday", schedule_deadline_day: "thursday", time_format: "12h", time_off_lead_hours: 48,
      minimum_travel_minutes: 30, minimum_rest_minutes: 600,
      conflict_rules: { ...DEFAULT_SCHEDULE_CONFLICT_RULES, minimum_rest: "warn" }, conflict_rules_revision: 3,
    },
    notification_policies: [
      {
        id: id(0xf01), type_key: "availability.weekly_updated", schema_version: 1, role_id: null, location_id: null,
        enabled: true, allowed_channels: ["in_app"], cadence: "daily_digest", version: 2, updated_by: OWNER_USER_ID, updated_at: daysAgo(9),
      },
      {
        id: id(0xf02), type_key: "requests.shift_change.submitted", schema_version: 1, role_id: ROLE.shiftLead, location_id: null,
        enabled: true, allowed_channels: ["in_app"], cadence: "immediate", version: 1, updated_by: OWNER_USER_ID, updated_at: daysAgo(21),
      },
      {
        id: id(0xf03), type_key: "communications.announcement.available", schema_version: 1, role_id: null, location_id: LOC.uptown,
        enabled: false, allowed_channels: ["in_app"], cadence: "immediate", version: 1, updated_by: OWNER_USER_ID, updated_at: daysAgo(3),
      },
    ],
    notification_audit: [
      { id: id(0xf11), action: "notification.policy.saved", target_type: "notification_org_policy", target_id: id(0xf03), actor_user_id: OWNER_USER_ID, reason: "Uptown posts announcements on the break room board during the remodel.", before_version: null, after_version: 1, occurred_at: daysAgo(3) },
      { id: id(0xf12), action: "notification.policy.saved", target_type: "notification_org_policy", target_id: id(0xf02), actor_user_id: OWNER_USER_ID, reason: "Shift leads cover swaps on weekends.", before_version: null, after_version: 1, occurred_at: daysAgo(21) },
      { id: id(0xf13), action: "notification.policy.saved", target_type: "notification_org_policy", target_id: id(0xf01), actor_user_id: OWNER_USER_ID, reason: "Too many pings on Sunday nights; one summary a day is enough.", before_version: 1, after_version: 2, occurred_at: daysAgo(9) },
      { id: id(0xf14), action: "notification.policy.saved", target_type: "notification_org_policy", target_id: id(0xf01), actor_user_id: OWNER_USER_ID, reason: "Trying digests for availability updates.", before_version: null, after_version: 1, occurred_at: daysAgo(30) },
    ],
    roles: roles(),
    employee_revisions: {},
    document_types: documentTypes(),
    ...signatureData(),
    assigned: {},
  };
}

export const settings = domainStore<SettingsData>("settings", seed);
