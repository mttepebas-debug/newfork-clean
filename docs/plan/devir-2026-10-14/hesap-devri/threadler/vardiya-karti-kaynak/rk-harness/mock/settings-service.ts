// Demo backend for the settings area (/app/settings/*). Routes follow apps/api
// (settings/*-routes.ts, notifications/notification-settings-routes.ts); answers
// follow the *_service functions in supabase/schema.sql and the shared schemas
// the web parses. The catalog lives in settings-catalog.ts, document types and
// acknowledgements in settings-documents.ts.
import {
  activeNotificationCatalogEntries,
  employeeEligiblePermissions,
  rolePermissionDependencies,
  scheduleConflictSettingsSchema,
  schedulingSettingsInputSchema,
  type Permission,
} from "@newfork/shared";
import { contextFor, type Handler } from "./api";
import { catalogRows, catalogRoutes, fail, workspaceIdentity } from "./settings-catalog";
import { documentsSettingsRoutes } from "./settings-documents";
import { permissionCatalog } from "./settings-permissions";
import { nowIso, settings, type NotificationPolicyRow, type RoleRow } from "./settings-store";
import { viewer, WORKSPACE_ID } from "./world";

type Route = (method: string, path: string, handler: Handler) => void;
type Row = Record<string, unknown>;

const lower = (value: unknown) => String(value ?? "").toLowerCase();
const byName = (a: Row, b: Row) => lower(a.name).localeCompare(lower(b.name)) || String(a.id).localeCompare(String(b.id));

// ---------- roles ----------

function roleView(role: RoleRow) {
  const editable = role.access_class !== "owner";
  return {
    ...role,
    workspace_id: WORKSPACE_ID,
    permission_keys: [...role.permission_keys].sort(),
    blocking_member_count: role.member_count,
    blocking_invite_count: role.pending_invite_count,
    editable,
    deletable: role.system_key === null && editable && role.member_count === 0 && role.pending_invite_count === 0,
  };
}

function saveRole(roleId: string | null, body: Row): string {
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const accessClass = String(body.access_class ?? "");
  const keys = [...new Set((body.permission_keys ?? []) as Permission[])].sort();
  let target: RoleRow | undefined;
  if (roleId) {
    target = settings.data.roles.find((role) => role.id === roleId);
    if (!target || target.access_class === "owner") fail(403, "role management access denied", { reason: "authz.denied" });
    if (!body.expected_updated_at || body.expected_updated_at !== target.updated_at)
      fail(409, "Role changed since you opened it. Reload before saving.");
    if (accessClass !== target.access_class) fail(400, "Existing role experience cannot change");
  } else if (!["manager", "employee"].includes(accessClass)) {
    fail(403, "Custom roles require a manager or employee experience");
  }
  if (name.length < 1 || name.length > 64 || description.length > 240) fail(400, "Valid role details required");
  if (!keys.includes("workspace.read")) fail(400, "Basic account access required");
  const catalog = new Map(permissionCatalog.map((permission) => [permission.key, permission]));
  if (keys.some((key) => !catalog.has(key))) fail(400, "Unknown permission");
  if (accessClass !== "admin" && keys.some((key) => !catalog.get(key)!.custom_grantable))
    fail(403, "Permission is not eligible for a lower role", { reason: "authz.rank" });
  if (accessClass !== "admin" && keys.some((key) => key === "roles.manage" || key === "workspace.manage"))
    fail(403, "Protected management access denied");
  if (accessClass === "employee" && keys.some((key) => !employeeEligiblePermissions.includes(key)))
    fail(403, "Employee roles are limited to personal access");
  if (keys.some((key) => (rolePermissionDependencies[key] ?? []).some((needed) => !keys.includes(needed))))
    fail(400, "Permission set requires dependent read access");
  const stamp = nowIso();
  if (!target) {
    target = {
      id: crypto.randomUUID(), name, description, system_key: null, access_class: accessClass as RoleRow["access_class"],
      sort_order: 100, created_at: stamp, updated_at: stamp, permission_keys: keys, member_count: 0, pending_invite_count: 0,
    };
    settings.data.roles.push(target);
  } else {
    if (target.system_key === null) Object.assign(target, { name, description });
    Object.assign(target, { permission_keys: keys, updated_at: stamp });
  }
  settings.save();
  return target.id;
}

// ---------- notification settings ----------

const scopeName = (policy: NotificationPolicyRow) =>
  policy.role_id
    ? settings.data.roles.find((role) => role.id === policy.role_id)?.name ?? "Role"
    : policy.location_id
      ? (catalogRows("locations").find((row) => row.id === policy.location_id)?.name as string | undefined) ?? "Location"
      : "Organization";

function policyView(policy: NotificationPolicyRow) {
  return {
    id: policy.id,
    scope: {
      kind: policy.role_id ? "role" : policy.location_id ? "location" : "global",
      id: policy.role_id ?? policy.location_id,
      name: scopeName(policy),
    },
    enabled: policy.enabled,
    allowed_channels: policy.allowed_channels,
    cadence: policy.cadence,
    version: policy.version,
    updated_by: policy.updated_by,
    updated_at: policy.updated_at,
    source: "organization_policy" as const,
  };
}

function notificationSettings() {
  const { notification_policies: policies, notification_audit: audit } = settings.data;
  const catalog = activeNotificationCatalogEntries()
    .sort((a, b) => a.category.localeCompare(b.category) || a.type_key.localeCompare(b.type_key))
    .map((entry) => {
      const global = policies.find((policy) => policy.type_key === entry.type_key && !policy.role_id && !policy.location_id);
      return {
        type_key: entry.type_key,
        schema_version: entry.schema_version,
        category: entry.category,
        severity: entry.severity,
        sensitivity: entry.sensitivity,
        supported_channels: entry.supported_channels,
        default_cadence: entry.default_cadence,
        action_route: entry.action_route_contract.route,
        mandatory_in_app: entry.mandatory_in_app,
        policy: global ? policyView(global) : {
          id: null, scope: { kind: "global", id: null, name: "Organization" }, enabled: true,
          allowed_channels: entry.supported_channels, cadence: entry.default_cadence,
          version: null, updated_by: null, updated_at: null, source: "catalog_default",
        },
      };
    });
  return {
    workspace_id: WORKSPACE_ID,
    can_write: true,
    catalog,
    policies: policies
      .map((policy) => ({ type_key: policy.type_key, schema_version: policy.schema_version, ...policyView(policy) }))
      .sort((a, b) => a.type_key.localeCompare(b.type_key) || a.scope.name.localeCompare(b.scope.name)),
    roles: [...settings.data.roles].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name })),
    locations: catalogRows("locations").filter((row) => !row.archived_at)
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || byName(a, b)).map((row) => ({ id: row.id, name: row.name })),
    audit: [...audit].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 50),
  };
}

function saveNotificationPolicy(body: Row) {
  const entry = activeNotificationCatalogEntries().find((item) => item.type_key === body.type_key && item.schema_version === body.schema_version);
  if (!entry) fail(404, "active notification type not found");
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3 || reason.length > 500) fail(400, "notification policy reason required");
  const channels = (body.allowed_channels ?? []) as NotificationPolicyRow["allowed_channels"];
  if (!channels.length || channels.some((channel) => !entry.supported_channels.includes(channel))) fail(400, "notification channel is not supported");
  if (entry.mandatory_in_app && (!body.enabled || !channels.includes("in_app"))) fail(400, "mandatory in-app notification cannot be disabled");
  const scope = body.scope as { kind: string; id: string | null };
  let roleId: string | null = null;
  let locationId: string | null = null;
  if (scope.kind === "role") {
    if (!settings.data.roles.some((role) => role.id === scope.id)) fail(403, "notification role scope not found");
    roleId = scope.id;
  } else if (scope.kind === "location") {
    if (!catalogRows("locations").some((row) => row.id === scope.id && !row.archived_at)) fail(403, "notification location scope not found");
    locationId = scope.id;
  } else if (scope.kind !== "global" || scope.id !== null) fail(400, "notification policy scope is invalid");
  const policies = settings.data.notification_policies;
  const existing = policies.find((policy) => policy.type_key === entry.type_key && policy.role_id === roleId && policy.location_id === locationId);
  const expected = body.expected_version as number | null;
  if ((!existing && expected !== null) || (existing && existing.version !== expected))
    fail(409, "notification policy stale version");
  const stamp = nowIso();
  const values = { enabled: Boolean(body.enabled), allowed_channels: channels, cadence: body.cadence as NotificationPolicyRow["cadence"], updated_by: viewer.userId, updated_at: stamp };
  let saved: NotificationPolicyRow;
  if (existing) {
    Object.assign(existing, values, { version: existing.version + 1 });
    saved = existing;
  } else {
    saved = { id: crypto.randomUUID(), type_key: entry.type_key, schema_version: entry.schema_version, role_id: roleId, location_id: locationId, version: 1, ...values };
    policies.push(saved);
  }
  settings.data.notification_audit.push({
    id: crypto.randomUUID(), action: "notification.policy.saved", target_type: "notification_org_policy", target_id: saved.id,
    actor_user_id: viewer.userId, reason, before_version: existing ? saved.version - 1 : null, after_version: saved.version, occurred_at: stamp,
  });
  settings.save();
  return { status: "saved", policy: policyView(saved) };
}

function resetNotificationPolicies(body: Row) {
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3 || reason.length > 500) fail(400, "notification policy reason required");
  const targetSpec = body.target as { kind: string; value?: string };
  const categoryOf = (typeKey: string) => activeNotificationCatalogEntries().find((entry) => entry.type_key === typeKey)?.category;
  const hit = (policy: NotificationPolicyRow) =>
    targetSpec.kind === "all" || (targetSpec.kind === "type" && policy.type_key === targetSpec.value) ||
    (targetSpec.kind === "category" && categoryOf(policy.type_key) === targetSpec.value);
  const removed = settings.data.notification_policies.filter(hit);
  settings.data.notification_policies = settings.data.notification_policies.filter((policy) => !hit(policy));
  const stamp = nowIso();
  for (const policy of removed) {
    settings.data.notification_audit.push({
      id: crypto.randomUUID(), action: "notification.policy.reset", target_type: "notification_org_policy", target_id: policy.id,
      actor_user_id: viewer.userId, reason, before_version: policy.version, after_version: null, occurred_at: stamp,
    });
  }
  settings.save();
  return { status: "reset", affected: removed.length };
}

function previewNotification(body: Row) {
  const entry = activeNotificationCatalogEntries().find((item) => item.type_key === body.type_key);
  if (!entry) fail(404, "active notification type not found");
  const channel = body.channel as NotificationPolicyRow["allowed_channels"][number];
  if (!entry.supported_channels.includes(channel)) fail(400, "notification channel is not supported");
  if (body.recipient_user_id && body.recipient_user_id !== viewer.userId) fail(403, "notification preview recipient must be current actor");
  const global = settings.data.notification_policies.find((policy) => policy.type_key === entry.type_key && !policy.role_id && !policy.location_id);
  const denied = global && (!global.enabled || !global.allowed_channels.includes(channel));
  const [decision, reason] = entry.mandatory_in_app && channel === "in_app"
    ? ["allow", "mandatory_in_app"]
    : denied ? ["deny", "organization_policy_denied"] : ["allow", global ? "organization_default" : "user_default"];
  return { status: "previewed", delivery_mode: "preview_only", redirected_to_user_id: viewer.userId, decision, reason_code: reason };
}

// ---------- routes ----------

export function settingsRoutes(route: Route): void {
  catalogRoutes(route);
  documentsSettingsRoutes(route);
  const ws = "/v1/workspaces/:workspaceId";

  // The workspace's name and logo as saved in Settings → General (the shared
  // context in api.ts has them fixed). Pages with their own context answer first.
  route("GET", "/v1/context", () => ({ ...contextFor(), workspace: workspaceIdentity() }));

  // GET /settings/:kind, one route per kind (important-dates is the Important Dates area's).
  route("GET", `${ws}/settings/locations`, () =>
    catalogRows("locations").sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || byName(a, b)));
  route("GET", `${ws}/settings/jobs`, () => ({
    departments: catalogRows("departments").sort(byName),
    jobs: catalogRows("jobs").sort(byName),
  }));
  const ordered = (a: Row, b: Row) => Number(a.sort_order) - Number(b.sort_order) || byName(a, b);
  route("GET", `${ws}/settings/shift-types`, () => catalogRows("shift_types").sort(ordered));
  route("GET", `${ws}/settings/shift-labels`, () => catalogRows("shift_labels").sort(ordered));
  route("GET", `${ws}/settings/roles`, () => ({
    permissions: permissionCatalog,
    roles: [...settings.data.roles].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map(roleView),
  }));

  // General's setup checklist (/workspace/setup-checklist) is the Workspace
  // area's and the preferred-name setting the Employees area's: one store each.

  // Scheduling rules and conflict handling share one row.
  const general = () => {
    const { week_start_day, schedule_deadline_day, time_format, time_off_lead_hours } = settings.data.scheduling;
    return { workspace_id: WORKSPACE_ID, week_start_day, schedule_deadline_day, time_format, time_off_lead_hours };
  };
  route("GET", `${ws}/scheduling-settings`, () => general());
  route("PUT", `${ws}/scheduling-settings`, ({ body }) => {
    const parsed = schedulingSettingsInputSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid settings required");
    if (["conflict_rules", "conflict_rules_revision", "minimum_travel_minutes", "minimum_rest_minutes"].some((key) => key in parsed.data))
      fail(400, "Use Conflict handling to change conflict rules.");
    Object.assign(settings.data.scheduling, parsed.data);
    settings.save();
    return general();
  });
  const conflicts = () => {
    const { conflict_rules, conflict_rules_revision, minimum_travel_minutes, minimum_rest_minutes } = settings.data.scheduling;
    return { conflict_rules, conflict_rules_revision, minimum_travel_minutes, minimum_rest_minutes };
  };
  route("GET", `${ws}/scheduling-settings/conflicts`, () => conflicts());
  route("PUT", `${ws}/scheduling-settings/conflicts`, ({ body }) => {
    const parsed = scheduleConflictSettingsSchema.strict().safeParse(body);
    if (!parsed.success) fail(400, "Valid conflict settings required");
    const current = settings.data.scheduling;
    if (parsed.data.conflict_rules_revision !== current.conflict_rules_revision)
      fail(409, "Conflict rules changed. Reload the current rules before saving.");
    const { conflict_rules, minimum_travel_minutes, minimum_rest_minutes } = parsed.data;
    const changed = JSON.stringify([conflict_rules, minimum_travel_minutes, minimum_rest_minutes]) !==
      JSON.stringify([current.conflict_rules, current.minimum_travel_minutes, current.minimum_rest_minutes]);
    Object.assign(current, { conflict_rules, minimum_travel_minutes, minimum_rest_minutes });
    if (changed) current.conflict_rules_revision += 1;
    settings.save();
    return conflicts();
  });

  // Notification settings (organization policy).
  route("GET", `${ws}/notification-settings`, () => notificationSettings());
  route("PATCH", `${ws}/notification-settings`, ({ body }) => saveNotificationPolicy(body ?? {}));
  route("POST", `${ws}/notification-settings/reset`, ({ body }) => resetNotificationPolicies(body ?? {}));
  route("POST", `${ws}/notification-settings/test`, ({ body }) => previewNotification(body ?? {}));

  // Roles & permissions.
  route("POST", `${ws}/roles`, ({ body }) => ({ id: saveRole(null, body ?? {}) }));
  route("PUT", `${ws}/roles/:roleId`, ({ params, body }) => ({ id: saveRole(params.roleId, body ?? {}) }));
  route("DELETE", `${ws}/roles/:roleId`, ({ params }) => {
    const role = settings.data.roles.find((item) => item.id === params.roleId);
    if (!role || role.access_class === "owner") fail(403, "role management access denied", { reason: "authz.denied" });
    if (role.system_key) fail(403, "Built-in roles cannot be deleted");
    if (role.member_count > 0 || role.pending_invite_count > 0)
      fail(409, "Role has member or invitation references. Resolve these dependencies before deleting.");
    settings.data.roles = settings.data.roles.filter((item) => item.id !== role.id);
    settings.data.notification_policies = settings.data.notification_policies.filter((policy) => policy.role_id !== role.id);
    settings.save();
    return undefined;
  });
}

export { workspaceIdentity };
