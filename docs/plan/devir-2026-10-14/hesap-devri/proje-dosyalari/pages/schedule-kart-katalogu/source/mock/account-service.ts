// Demo backend for the account area (/account/...): the signed-in person's
// profile and preferences (supabase-js tables user_profiles / user_preferences),
// security, workspaces, owner legal name, employment records, notification
// preferences and the account badge. Routes follow apps/api/src/account/*.ts
// and notifications/notification-settings-routes.ts; answers follow the shared
// schemas the web app parses.
//
// Each atlas person is a separate account, so the store is kept per role. The
// other workspaces (Saltline, Pier 9, Bayside, Corner Bistro) and the Cedar &
// Smoke invitation are the ones the Workspace hub page shows for that person.
import * as shared from "@newfork/shared";
import { ApiError, type Handler } from "./api";
import { domainStore } from "./store";
import { uuid } from "./time";
import { viewerRole } from "./viewer";
import { currentPage } from "../pages";
import { registerTable, viewer, WORKSPACE_ID } from "./world";
import { HARBOR, OTHER } from "./hub-onboarding-shared";
import { workspaceIdentity } from "./settings-catalog";
import { settings, ROLE as SETTINGS_ROLE } from "./settings-store";
import { directory, fullName, personByUser, ROLE as PEOPLE_ROLE } from "./people";
import { obligations, statusOf } from "./documents-data";
import { notifyAccount } from "./communications-service";

type Route = (method: string, path: string, handler: Handler) => void;
type Role = "owner" | "admin" | "manager" | "employee";
type Preference = shared.NotificationUserPreference;

interface AccountWorkspace {
  id: string;
  name: string;
  role: Role;
  status: "active" | "pending" | "suspended" | "removed";
  isActive: boolean;
  onboarding: { status: "complete" | "incomplete"; currentStep: number; revision: number };
  lifecycleStatus: "draft" | "active" | "suspended" | "closure_scheduled" | "closed" | "deleted";
  accessRemoved: boolean;
  closureEffectiveAt: string | null;
  lastUsedAt: string | null;
  /** Fixed counts for a workspace outside the atlas; Harbor & Vine counts its people. */
  otherMemberCount?: number;
  pendingInvitationCount?: number;
}

interface AccountData {
  profile: { display_name: string; phone: string | null; avatar_object_path: string | null; updated_at: string };
  preferences: { theme: "light" | "dark" | "system"; time_format: string; date_format: string; updated_at: string };
  security: { pending_email: string | null; email_change_sent_at: string | null };
  workspaces: AccountWorkspace[];
  invitations: { id: string; workspaceId: string; workspaceName: string; expiresAt: string }[];
  legal_names: Record<string, { firstName: string; middleName: string; lastName: string }>;
  notification_preferences: Record<string, Preference[]>;
}

const nowIso = () => new Date().toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function fail(status: number, error: string, reason?: string, detail?: string): never {
  throw new ApiError(status, { error, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) });
}

function seed(): AccountData {
  const me = personByUser(viewer.userId);
  const done = { status: "complete" as const, currentStep: 4, revision: 3 };
  const harbor: AccountWorkspace = {
    ...HARBOR, role: viewerRole, status: "active", isActive: true, onboarding: done, lifecycleStatus: "active",
    accessRemoved: false, closureEffectiveAt: null, lastUsedAt: nowIso(),
  };
  const others: AccountWorkspace[] = viewerRole === "owner"
    ? [
      { ...OTHER.saltline, role: "admin", status: "active", isActive: false, onboarding: done, lifecycleStatus: "active",
        accessRemoved: false, closureEffectiveAt: null, lastUsedAt: daysFromNow(-4), otherMemberCount: 11, pendingInvitationCount: 0 },
      { ...OTHER.pier9, role: "owner", status: "suspended", isActive: false, onboarding: done, lifecycleStatus: "deleted",
        accessRemoved: false, closureEffectiveAt: daysFromNow(-23), lastUsedAt: daysFromNow(-30) },
    ]
    : viewerRole === "manager"
      ? [{ ...OTHER.bayside, role: "employee", status: "suspended", isActive: false, onboarding: done, lifecycleStatus: "active",
        accessRemoved: false, closureEffectiveAt: null, lastUsedAt: daysFromNow(-40) }]
      : [{ ...OTHER.corner, role: "employee", status: "removed", isActive: false, onboarding: done, lifecycleStatus: "active",
        accessRemoved: true, closureEffectiveAt: null, lastUsedAt: daysFromNow(-62) }];
  const accountPhone = me?.private?.phone ?? (viewerRole === "owner" ? "+16175550100" : null);
  return {
    profile: { display_name: viewer.name, phone: accountPhone, avatar_object_path: null, updated_at: daysFromNow(-12) },
    preferences: { theme: "light", time_format: "system", date_format: "system", updated_at: daysFromNow(-12) },
    security: { pending_email: null, email_change_sent_at: null },
    workspaces: [harbor, ...others],
    invitations: [{
      id: "1c3d5e7f-9a0b-4c2d-8e4f-6a8b0c2d4e6f", workspaceId: OTHER.cedar.id, workspaceName: OTHER.cedar.name,
      expiresAt: daysFromNow(viewerRole === "owner" ? 5 : viewerRole === "manager" ? 2 : 6),
    }],
    legal_names: viewerRole === "owner"
      ? { [WORKSPACE_ID]: { firstName: me?.private?.legal_first_name ?? "Mert", middleName: me?.middle_name ?? "", lastName: me?.private?.legal_last_name ?? "Tepebas" } }
      : {},
    // One choice made earlier: the owner keeps announcements out of the app inbox.
    notification_preferences: viewerRole === "owner"
      ? { [WORKSPACE_ID]: [preferenceRow("communications.announcement.available", { in_app: "disabled" }, 1, daysFromNow(-6))] }
      : {},
  };
}

function preferenceRow(scopeKey: string, channels: shared.NotificationChannelPreference, version: number, updatedAt: string): Preference {
  return {
    id: uuid(), preference_scope: "type", scope_key: scopeKey, channel_preferences: channels, cadence: "immediate",
    timezone: "America/New_York", quiet_hours: null, safe_preview_enabled: true, version, updated_at: updatedAt,
  };
}

const store = domainStore<AccountData>(`account.${viewerRole}`, seed);
const data = () => store.data;

/** The signed-in person's display name, as their profile has it. */
export function profileName(): string {
  return data().profile.display_name;
}

// ---------- workspaces ----------

const people = () => directory.data.people;

function summary(workspace: AccountWorkspace) {
  const harbor = workspace.id === WORKSPACE_ID;
  const owned = workspace.role === "owner" && workspace.status === "active" && workspace.lifecycleStatus === "active";
  return {
    id: workspace.id,
    name: harbor ? workspaceIdentity().name : workspace.name,
    role: workspace.role,
    status: workspace.status,
    isActive: workspace.isActive && workspace.status === "active",
    onboarding: workspace.onboarding,
    lifecycleStatus: workspace.lifecycleStatus,
    accessRemoved: workspace.accessRemoved,
    otherMemberCount: harbor
      ? people().filter((person) => person.membership?.status === "active" && !person.archived_at && person.user_id !== viewer.userId).length
      : workspace.otherMemberCount ?? 0,
    pendingInvitationCount: harbor
      ? people().filter((person) => !person.archived_at && person.invitations[person.invitations.length - 1]?.status === "pending").length
      : workspace.pendingInvitationCount ?? 0,
    defaultClosureEffectiveAt: owned ? daysFromNow(14) : null,
    lastUsedAt: workspace.lastUsedAt,
    closureEffectiveAt: workspace.closureEffectiveAt,
    pendingOwnershipTransfer: null,
  };
}

/** A workspace this account can act in (active membership, not closed). */
function liveWorkspace(id: string): AccountWorkspace | undefined {
  return data().workspaces.find((one) => one.id === id && one.status === "active" && ["active", "closure_scheduled"].includes(one.lifecycleStatus));
}

/** The owner's own workspace, or the refusal the core gives. */
function ownedWorkspace(id: string): AccountWorkspace {
  const workspace = data().workspaces.find((one) => one.id === id);
  if (!workspace || workspace.lifecycleStatus === "deleted") fail(404, "workspace not found", "workspace.not_found");
  if (workspace.role !== "owner" || workspace.status !== "active") fail(403, "workspace owner access required", "workspace.owner_required");
  return workspace;
}

function requirePassword(password: unknown): void {
  // The atlas has no real password: any one typed is taken as the account's.
  if (typeof password !== "string" || !password) fail(400, "Current password required", "session.password_required");
}

const emailHint = () => {
  const [local, domain] = viewer.email.split("@");
  return `${local![0]}${"*".repeat(Math.max(local!.length - 1, 2))}@${domain}`;
};

// ---------- notification preferences ----------

const accountCatalog: { type_key: (typeof shared.accountNotificationTypeKeys)[number]; title: string; description: string }[] = [
  { type_key: "security.account.deletion_requested", title: "Account deletion requested", description: "Your account is set to be deleted. Use the link in the email to keep it." },
  { type_key: "security.account.deletion_restored", title: "Account restored", description: "Your account is no longer set to be deleted." },
  { type_key: "security.account.email_change_cancelled", title: "Email change cancelled", description: "The pending change to your sign-in email was cancelled." },
  { type_key: "security.account.email_change_requested", title: "Email change requested", description: "Someone asked to change the email you sign in with." },
  { type_key: "security.account.password_changed", title: "Password changed", description: "Your password was changed and your other sessions were signed out." },
  { type_key: "security.account.sessions_revoked", title: "Signed out of other devices", description: "Every other session of your account was signed out." },
];

const accountCatalogView = () =>
  accountCatalog.map((entry) => ({ ...entry, scope: "account" as const, mandatory_in_app: true as const, delivery: "transactional_in_app" as const }));

/** notification_user_channel_lock_reason_service, for this account. */
function lockReason(workspaceId: string, workspace: AccountWorkspace, entry: shared.NotificationCatalogEntry, channel: shared.NotificationChannel): string {
  // The account's email is confirmed; there is no workspace email sender yet.
  if (channel === "email") return "delivery_unavailable";
  if (!entry.supported_channels.includes(channel)) return "catalog_channel_unsupported";
  // Organization policies exist for Harbor & Vine only (Settings > Notifications).
  if (workspaceId !== WORKSPACE_ID) return "available";
  const policies = settings.data.notification_policies.filter((policy) => policy.type_key === entry.type_key && !policy.location_id);
  const global = policies.filter((policy) => !policy.role_id).sort((a, b) => b.version - a.version)[0];
  if (global && (!global.enabled || !global.allowed_channels.includes(channel))) return "organization_policy_denied";
  const roleId = SETTINGS_ROLE[workspace.role];
  const role = policies.filter((policy) => policy.role_id === roleId).sort((a, b) => b.version - a.version)[0];
  if (role && (!role.enabled || !role.allowed_channels.includes(channel))) return "role_policy_denied";
  return "available";
}

function preferencesFor(workspaceId: string) {
  const workspace = liveWorkspace(workspaceId);
  if (!workspace) fail(404, "Not found", "authz.not_member");
  const catalog = shared.activeNotificationCatalogEntries()
    .sort((a, b) => a.category.localeCompare(b.category) || a.type_key.localeCompare(b.type_key))
    .map((entry) => ({
      type_key: entry.type_key, schema_version: entry.schema_version, category: entry.category, severity: entry.severity,
      sensitivity: entry.sensitivity, supported_channels: entry.supported_channels, default_cadence: entry.default_cadence,
      mandatory_in_app: entry.mandatory_in_app,
      default_channels: { in_app: "enabled" as const, email: entry.severity === "action_required" ? "enabled" as const : "disabled" as const },
      channel_controls: (["in_app", "email", "push"] as const).map((channel) => {
        const reason = lockReason(workspaceId, workspace, entry, channel);
        return { channel, locked: reason !== "available", reason_code: reason };
      }),
    }));
  return {
    workspace_id: workspaceId,
    can_write: true,
    workspaces: data().workspaces.filter((one) => liveWorkspace(one.id)).map((one) => ({
      id: one.id, name: summary(one).name, role: one.role, isActive: one.id === workspaceId,
      onboarding: { status: one.onboarding.status, currentStep: one.onboarding.currentStep },
    })).sort((a, b) => a.name.localeCompare(b.name)),
    catalog,
    preferences: [...(data().notification_preferences[workspaceId] ?? [])]
      .sort((a, b) => a.preference_scope.localeCompare(b.preference_scope) || a.scope_key.localeCompare(b.scope_key)),
    account_catalog: accountCatalogView(),
    email_channel_reason: "delivery_unavailable" as const,
  };
}

function savePreferences(workspaceId: string, body: unknown) {
  const patch = shared.notificationUserPreferencePatchSchema.safeParse(body);
  if (!patch.success) fail(400, "Valid notification settings input required");
  const view = preferencesFor(workspaceId);
  const list = (data().notification_preferences[workspaceId] ??= []);
  // Every update is checked before any is written: the service runs in one transaction.
  const staged: Preference[] = list.map((row) => ({ ...row, channel_preferences: { ...row.channel_preferences } }));
  for (const update of patch.data.updates) {
    if (accountCatalog.some((entry) => entry.type_key === update.scope_key)) fail(403, "account security notifications are mandatory", "authz.denied");
    const entries = update.preference_scope === "type"
      ? view.catalog.filter((entry) => entry.type_key === update.scope_key)
      : view.catalog.filter((entry) => entry.category === update.scope_key);
    if (!entries.length) fail(404, "notification preference scope not found");
    const existing = staged.find((row) => row.preference_scope === update.preference_scope && row.scope_key === update.scope_key);
    for (const [channel, value] of Object.entries(update.channel_preferences)) {
      if (value !== "enabled" || existing?.channel_preferences[channel as shared.NotificationChannel] === value) continue;
      if (entries.some((entry) => entry.channel_controls.find((control) => control.channel === channel)?.locked))
        fail(403, "notification channel managed by organization", "authz.denied");
    }
    if (existing) {
      if (update.expected_version === null || existing.version !== update.expected_version) fail(409, "stale notification preference version");
      Object.assign(existing, {
        channel_preferences: { ...existing.channel_preferences, ...update.channel_preferences }, cadence: update.cadence,
        timezone: update.timezone, quiet_hours: update.quiet_hours, safe_preview_enabled: update.safe_preview_enabled,
        version: (existing.version ?? 1) + 1, updated_at: nowIso(),
      });
    } else {
      if (update.expected_version !== null) fail(404, "notification preference not found");
      staged.push({
        id: uuid(), preference_scope: update.preference_scope, scope_key: update.scope_key, channel_preferences: update.channel_preferences,
        cadence: update.cadence, timezone: update.timezone, quiet_hours: update.quiet_hours, safe_preview_enabled: update.safe_preview_enabled,
        version: 1, updated_at: nowIso(),
      });
    }
  }
  data().notification_preferences[workspaceId] = staged;
  store.save();
  return { status: "saved" as const, preferences: staged };
}

// ---------- the account's own records ----------

function employmentRecords() {
  const me = personByUser(viewer.userId);
  const harbor = data().workspaces.find((one) => one.id === WORKSPACE_ID && ["active", "pending"].includes(one.status) && one.lifecycleStatus !== "deleted");
  if (!me || !harbor) return [];
  const contact = me.private;
  return [{
    workspaceId: WORKSPACE_ID,
    workspaceName: summary(harbor).name,
    employeeId: me.id,
    preferredName: me.preferred_name,
    phone: contact?.phone ?? null,
    emergencyContactName: contact?.emergency_contact_name ?? "",
    emergencyContactRelationship: contact?.emergency_contact_relationship ?? "",
    emergencyContactPhone: contact?.emergency_contact_phone ?? "",
    emergencyContactEmail: contact?.emergency_contact_email ?? "",
  }];
}

/** Open documents and acknowledgements still the person's to act on. */
function documentsWaiting(): number {
  const me = personByUser(viewer.userId);
  if (!me) return 0;
  return obligations()
    .filter((row) => row.employee_id === me.id && !["completed", "pending_review", "exempt", "removed", "paused"].includes(statusOf(row)))
    .length;
}

function securityState() {
  return {
    emailVerified: true,
    email: viewer.email,
    pendingEmail: data().security.pending_email,
    emailChangeSentAt: data().security.email_change_sent_at,
  };
}

function deletionBlockers() {
  return data().workspaces
    .filter((one) => one.status === "active" && one.lifecycleStatus !== "deleted")
    .map((one) => ({
      kind: "active_membership" as const, workspace_id: one.id, workspace_name: summary(one).name,
      role_name: one.role, is_owner: one.role === "owner",
    }));
}

// ---------- supabase-js tables (Profile and Preferences save through these) ----------

registerTable("user_profiles", () => [{
  user_id: viewer.userId, display_name: data().profile.display_name, phone: data().profile.phone,
  phone_e164: data().profile.phone, avatar_object_path: data().profile.avatar_object_path, updated_at: data().profile.updated_at,
}], {
  insert: (values) => saveProfileRow(values),
  update: (_row, values) => saveProfileRow(values),
});
registerTable("user_preferences", () => [{
  user_id: viewer.userId, theme: data().preferences.theme, time_format: data().preferences.time_format,
  date_format: data().preferences.date_format, updated_at: data().preferences.updated_at,
}], {
  insert: (values) => savePreferenceRow(values),
  update: (_row, values) => savePreferenceRow(values),
});

function saveProfileRow(values: Record<string, unknown>): Record<string, unknown> {
  // RLS: a person writes only their own row.
  if (values.user_id !== undefined && values.user_id !== viewer.userId) throw { code: "42501", message: "new row violates row-level security policy for table \"user_profiles\"" };
  const profile = data().profile;
  if (values.display_name !== undefined) {
    const name = String(values.display_name ?? "").trim();
    if (!name || name.length > 120) throw { code: "23514", message: "new row for relation \"user_profiles\" violates check constraint \"user_profiles_display_name_check\"" };
    profile.display_name = name;
  }
  if (values.phone_e164 !== undefined || values.phone !== undefined) {
    const phone = (values.phone_e164 ?? values.phone) as string | null;
    if (phone !== null && !shared.toUsPhone(phone)) throw { code: "23514", message: "new row for relation \"user_profiles\" violates check constraint \"user_profiles_phone_e164_check\"" };
    profile.phone = phone;
  }
  if (values.avatar_object_path !== undefined) profile.avatar_object_path = (values.avatar_object_path as string | null) ?? null;
  profile.updated_at = nowIso();
  store.save();
  return { user_id: viewer.userId, ...profile, phone_e164: profile.phone };
}

function savePreferenceRow(values: Record<string, unknown>): Record<string, unknown> {
  if (values.user_id !== undefined && values.user_id !== viewer.userId) throw { code: "42501", message: "new row violates row-level security policy for table \"user_preferences\"" };
  const preferences = data().preferences;
  if (values.theme !== undefined) preferences.theme = values.theme as AccountData["preferences"]["theme"];
  if (values.time_format !== undefined) preferences.time_format = String(values.time_format);
  if (values.date_format !== undefined) preferences.date_format = String(values.date_format);
  preferences.updated_at = nowIso();
  store.save();
  return { user_id: viewer.userId, ...preferences };
}

// ---------- routes ----------

export function accountRoutes(route: Route): void {
  // The badge on the account menu, on every page (count_account_attention_service).
  route("GET", "/v1/account/attention", () => ({
    documents: documentsWaiting(),
    workspaces: data().invitations.filter((one) => Date.parse(one.expiresAt) > Date.now()).length,
  }));
  route("GET", "/v1/account/employment-records", () => employmentRecords());
  route("GET", "/v1/account/workspace-identities", () => data().workspaces.filter((one) => liveWorkspace(one.id)).map((one) => {
    const me = one.id === WORKSPACE_ID ? personByUser(viewer.userId) : undefined;
    return { workspaceId: one.id, workspaceName: summary(one).name, role: one.role, employeeName: me ? fullName(me) : null, employeeCode: me?.employee_code ?? null };
  }));

  // ---- owner legal name ----
  route("GET", "/v1/account/workspaces/:workspaceId/legal-name", ({ params }) => {
    const workspace = data().workspaces.find((one) => one.id === params.workspaceId);
    if (!workspace || workspace.status !== "active") fail(404, "Not found", "authz.not_member");
    if (workspace.lifecycleStatus === "deleted") fail(403, "workspace is closed", "authz.workspace_closed");
    if (workspace.role !== "owner") fail(403, "workspace owner access required", "authz.owner_only");
    return { legalName: data().legal_names[workspace.id] ?? null };
  });
  route("PUT", "/v1/account/workspaces/:workspaceId/legal-name", ({ params, body }) => {
    const name = shared.ownerLegalNameSchema.safeParse(body);
    if (!name.success) fail(400, "A first and a last name are required");
    const workspace = data().workspaces.find((one) => one.id === params.workspaceId);
    if (!workspace || workspace.status !== "active") fail(404, "Not found", "authz.not_member");
    if (workspace.lifecycleStatus === "deleted") fail(403, "workspace is closed", "authz.workspace_closed");
    if (workspace.role !== "owner") fail(403, "workspace owner access required", "authz.owner_only");
    data().legal_names[workspace.id] = { firstName: name.data.firstName, middleName: name.data.middleName, lastName: name.data.lastName };
    store.save();
    return undefined;
  });

  // ---- notification preferences ----
  // Without a workspace: only the account's own security notices are listed.
  route("GET", "/v1/account/notification-preferences", () => ({
    workspace_id: null, can_write: false, workspaces: [], catalog: [], preferences: [],
    account_catalog: accountCatalogView(), email_channel_reason: "delivery_unavailable",
  }));
  route("GET", "/v1/workspaces/:workspaceId/me/notification-preferences", ({ params }) => preferencesFor(params.workspaceId));
  route("PATCH", "/v1/workspaces/:workspaceId/me/notification-preferences", ({ params, body }) => savePreferences(params.workspaceId, body));

  // ---- security ----
  route("GET", "/v1/account/security", () => securityState());
  route("POST", "/v1/account/security/email-change", ({ body }) => {
    const email = String(body?.newEmail ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) fail(400, "Valid new email required");
    if (email === viewer.email) fail(400, "New email must be different");
    data().security = { pending_email: email, email_change_sent_at: nowIso() };
    store.save();
    notifyAccount({ type_key: "security.account.email_change_requested", title: "Email change requested", body: `Confirm the change to ${email} from both inboxes.`, severity: "warning" });
    return securityState();
  });
  route("POST", "/v1/account/security/email-change/resend", () => {
    if (!data().security.pending_email) fail(400, "Pending email change not found");
    data().security.email_change_sent_at = nowIso();
    store.save();
    return { status: "sent" };
  });
  route("DELETE", "/v1/account/security/email-change", () => {
    if (!data().security.pending_email) fail(400, "Pending email change not found");
    data().security = { pending_email: null, email_change_sent_at: null };
    store.save();
    notifyAccount({ type_key: "security.account.email_change_cancelled", title: "Email change cancelled", body: `You still sign in with ${viewer.email}.` });
    return { status: "cancelled" };
  });
  route("POST", "/v1/account/security/password", ({ body }) => {
    if (typeof body?.currentPassword !== "string" || !body.currentPassword) fail(400, "Current password required", "session.password_required");
    const next = String(body?.newPassword ?? "");
    if (next.length < 8 || next.length > 256 || next !== body?.confirmPassword || next === body.currentPassword)
      fail(400, "Valid password change required");
    notifyAccount({ type_key: "security.account.password_changed", title: "Password changed", body: "Your other sessions were signed out." });
    return { status: "changed" };
  });
  route("POST", "/v1/account/security/sessions/sign-out-others", ({ body }) => {
    requirePassword(body?.currentPassword);
    notifyAccount({ type_key: "security.account.sessions_revoked", title: "Signed out of other devices", body: "Every other session of your account was signed out." });
    return { status: "signed_out" };
  });
  route("GET", "/v1/account/security/deletion/blockers", () => ({ blockers: deletionBlockers() }));
  route("POST", "/v1/account/security/deletion", ({ body }) => {
    requirePassword(body?.currentPassword);
    const blockers = deletionBlockers();
    if (blockers.length) fail(409, `Account deletion blocked: ${JSON.stringify(blockers)}`);
    return { status: "scheduled" };
  });
  // The deletion email's link: the account comes back while the 14-day window is open.
  route("POST", "/v1/account/security/deletion/recovery", ({ body }) => {
    if (typeof body?.token !== "string" || body.token.length < 32) fail(400, "Valid recovery token required");
    return { status: "restored", loginUrl: "/sign-in" };
  });

  // The rest belongs to the Account page. Elsewhere the shell's workspace
  // switcher keeps the single workspace the fallbacks give it.
  if (currentPage().id !== "account") return;

  route("GET", "/v1/account/workspaces", () => data().workspaces.map(summary));
  route("POST", "/v1/account/workspaces", ({ body }) => {
    const name = shared.workspaceNameInputSchema.safeParse(body?.name);
    if (!name.success) fail(400, "Valid workspace name required");
    if (!data().workspaces.some((one) => one.role === "owner" && one.status === "active"))
      fail(403, "Only a workspace owner can create another workspace", "authz.owner_only");
    const id = uuid();
    data().workspaces.push({
      id, name: name.data, role: "owner", status: "active", isActive: false, onboarding: { status: "incomplete", currentStep: 1, revision: 1 },
      lifecycleStatus: "draft", accessRemoved: false, closureEffectiveAt: null, lastUsedAt: nowIso(), otherMemberCount: 0, pendingInvitationCount: 0,
    });
    store.save();
    return { id };
  });
  route("POST", "/v1/account/workspaces/:workspaceId/active", ({ params }) => {
    const target = liveWorkspace(params.workspaceId);
    if (!target) fail(404, "Not found", "authz.not_member");
    for (const one of data().workspaces) one.isActive = one === target;
    target.lastUsedAt = nowIso();
    store.save();
    return undefined;
  });

  route("POST", "/v1/account/workspaces/:workspaceId/closure", ({ params, body }) => {
    if (body?.acknowledged !== true) fail(400, "workspace closure requires explicit acknowledgement", "workspace.closure.acknowledgement_required");
    const workspace = ownedWorkspace(params.workspaceId);
    const draft = workspace.onboarding.status !== "complete";
    if (!draft) requirePassword(body?.password);
    if (body?.mode === "immediate" || draft) {
      if (String(body?.typedWorkspaceName ?? "").trim() !== summary(workspace).name)
        fail(400, "workspace name confirmation does not match", "workspace.closure.name_mismatch");
      workspace.lifecycleStatus = "deleted";
      workspace.status = "suspended";
      workspace.isActive = false;
      workspace.closureEffectiveAt = nowIso();
      store.save();
      return { status: "deleted", workspace_id: workspace.id, effective_at: workspace.closureEffectiveAt };
    }
    if (body?.mode !== "scheduled_end_period") fail(400, "valid workspace closure mode required", "workspace.closure.mode_invalid");
    const effective = body?.effectiveAt ? String(body.effectiveAt) : daysFromNow(14);
    if (Date.parse(effective) <= Date.now()) fail(400, "scheduled workspace closure requires a future effective time", "workspace.closure.effective_at_past");
    workspace.lifecycleStatus = "closure_scheduled";
    workspace.closureEffectiveAt = effective;
    store.save();
    return { status: "scheduled", workspace_id: workspace.id, closure_request_id: uuid(), effective_at: effective };
  });
  route("POST", "/v1/account/workspaces/:workspaceId/closure/cancel", ({ params }) => {
    const workspace = ownedWorkspace(params.workspaceId);
    if (workspace.lifecycleStatus !== "closure_scheduled") fail(400, "workspace closure is not scheduled", "workspace.closure.not_scheduled");
    workspace.lifecycleStatus = "active";
    workspace.closureEffectiveAt = null;
    store.save();
    return { status: "cancelled", workspace_id: workspace.id };
  });

  // Ownership goes only to an active admin of the workspace who finished setup.
  const admins = (workspaceId: string) => workspaceId !== WORKSPACE_ID ? [] : people().filter((person) =>
    person.membership?.status === "active" && person.membership.role_id === PEOPLE_ROLE.admin && person.user_id
    && person.user_id !== viewer.userId && !person.archived_at);
  route("GET", "/v1/account/workspaces/:workspaceId/ownership-transfer/candidates", ({ params, query }) => {
    const text = (query.get("q") ?? "").trim().toLowerCase();
    if (text.length < 2 || text.length > 80) fail(400, "Enter 2 to 80 characters to search");
    ownedWorkspace(params.workspaceId);
    return admins(params.workspaceId)
      .filter((person) => fullName(person).toLowerCase().includes(text) || (person.account_email ?? "").toLowerCase().includes(text))
      .map((person) => ({ userId: person.user_id!, name: fullName(person), email: person.account_email ?? "" }));
  });
  route("POST", "/v1/account/workspaces/:workspaceId/ownership-transfer", ({ params, body }) => {
    requirePassword(body?.password);
    const workspace = ownedWorkspace(params.workspaceId);
    if (body?.targetUserId === viewer.userId) fail(400, "ownership transfer target must be another account", "transfer.target_is_self");
    // Harbor & Vine has no admin yet, so every target is refused (the atlas keeps no transfers).
    if (!admins(workspace.id).some((person) => person.user_id === body?.targetUserId))
      fail(400, "ownership transfer target must be an active admin", "transfer.target_not_admin");
    fail(400, "Ownership transfers are not kept in the atlas", "demo.not_available");
  });
  route("POST", "/v1/account/workspaces/:workspaceId/ownership-transfer/cancel", () => {
    fail(404, "pending ownership transfer not found", "transfer.not_found");
  });
  route("POST", "/v1/account/workspaces/:workspaceId/ownership-transfer/respond", ({ body }) => {
    if (body?.action === "accept") requirePassword(body?.password);
    fail(404, "pending ownership transfer not found", "transfer.not_found");
  });

  // ---- invitations waiting for this account ----
  route("GET", "/v1/invitations/pending", () => data().invitations
    .filter((one) => Date.parse(one.expiresAt) > Date.now())
    .map(({ id, workspaceId, workspaceName, expiresAt }) => ({ id, workspaceId, workspaceName, emailHint: emailHint(), expiresAt })));
  route("POST", "/v1/invitations/:invitationId/accept", ({ params }) => {
    const invitation = data().invitations.find((one) => one.id === params.invitationId);
    if (!invitation) fail(404, "This invitation is no longer open", "invitation.not_found");
    data().invitations = data().invitations.filter((one) => one !== invitation);
    // Onboarding comes next, on the Welcome page.
    data().workspaces.push({
      id: invitation.workspaceId, name: invitation.workspaceName, role: "employee", status: "pending", isActive: false,
      onboarding: { status: "complete", currentStep: 4, revision: 1 }, lifecycleStatus: "active", accessRemoved: false,
      closureEffectiveAt: null, lastUsedAt: null,
    });
    store.save();
    return { workspaceId: invitation.workspaceId, status: "accepted" };
  });
  route("POST", "/v1/invitations/:invitationId/decline", ({ params }) => {
    const invitation = data().invitations.find((one) => one.id === params.invitationId);
    if (!invitation) fail(404, "This invitation is no longer open", "invitation.not_found");
    data().invitations = data().invitations.filter((one) => one !== invitation);
    store.save();
    return undefined;
  });
}
