// Demo backend for the Employees area: the directory list, the drawer's
// record, saving, roles, invitations, termination, archive, access, locations,
// preferred names and the onboarding review. Routes follow apps/api
// (employee-directory-routes.ts, invitation and onboarding routes); answers
// follow the public.*_service functions in supabase/schema.sql and the shared
// schemas the web app parses (packages/shared).
import * as shared from "@newfork/shared";
import { ApiError, type Handler } from "./api";
import { iso, localInstant } from "./time";
import { MANAGER_USER_ID, OWNER_NAME, ZONE, world, WORKSPACE_ID } from "./world";
import {
  MGMT, ROLE, actor, catalog, directory, displayName, event, fullName, jobName, latestInvitation, locationName,
  may, mayInviteWith, personById, personRole, roleById, workspaceRoles, type Invitation, type Person,
} from "./people";
import { applyAssignments, documentStore, documentTypes, onboardingDocumentRequirements, settleOnboarding } from "./documents-data";

type Route = (method: string, path: string, handler: Handler) => void;
const BASE = "/v1/workspaces/:workspaceId/employees";
const rank = { owner: 4, admin: 3, manager: 2, employee: 1 } as const;
const refusals = shared.managementAndOwnerRefusals;

function fail(status: number, error: string, reason?: string, detail?: string): never {
  throw new ApiError(status, { error, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) });
}
/** The core's "no": 42501 + authz.* reaches the screen as 403 (not a member: 404). */
const deny = (action: string, reason = "out_of_scope"): never => fail(403, "Not allowed", `authz.${reason}`, action);
const refuse = (key: keyof typeof refusals): never => fail(400, refusals[key], key);

function save(): void {
  directory.save();
}

/** The record, if the reader may read it; the same "no" for unknown and out of reach. */
function readable(id: string): Person {
  const person = personById(id);
  if (!person || !may("employee.read", person)) deny("employee.read");
  return person!;
}

// ---------- shapes ----------

function listedJob(person: Person): { id: string | null; name: string | null } {
  const { jobs } = catalog();
  if (person.primary_job_id && person.job_ids.includes(person.primary_job_id))
    return { id: person.primary_job_id, name: jobName(person.primary_job_id) };
  const held = jobs.filter((job) => person.job_ids.includes(job.id));
  const owner = held.find((job) => job.system_key === "owner");
  const first = owner ?? [...held].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))[0];
  return { id: null, name: first?.name ?? null };
}

function invitationLive(invitation: Invitation | null): boolean {
  return invitation?.status === "pending" && Date.parse(invitation.expires_at) > Date.now();
}

function listStatus(person: Person): shared.EmployeeDisplayStatus {
  if (person.archived_at) return "archived";
  if (person.membership?.status === "active") return "active";
  if (person.onboarding && ["submitted", "changes_requested"].includes(person.onboarding.status)) return "needs_attention";
  if (person.membership?.status === "pending_activation") return "onboarding";
  if (invitationLive(latestInvitation(person))) return "invited";
  return "not_invited";
}

function summary(person: Person) {
  const job = listedJob(person);
  return {
    id: person.id,
    workspace_id: WORKSPACE_ID,
    employee_code: person.employee_code,
    first_name: person.first_name,
    middle_name: person.middle_name,
    last_name: person.last_name,
    preferred_name: person.preferred_name,
    display_name: displayName(person),
    invitation_email: person.invitation_email,
    start_date: person.start_date,
    primary_location_id: person.primary_location_id,
    primary_location_name: person.primary_location_id ? locationName(person.primary_location_id) : null,
    location_count: person.location_ids.length,
    primary_job_id: job.id,
    primary_job_name: job.name,
    job_count: person.job_ids.length,
    role_name: roleById(person.membership?.role_id ?? null)?.name ?? null,
    display_status: listStatus(person),
    archived_at: person.archived_at,
    revision: person.revision,
  };
}

/** May the reader invite this record (and with which role is asked separately). */
function mayInvite(person: Person): boolean {
  const me = actor();
  if (!me.permissions.includes("employees.manage")) return false;
  if (me.role === "owner" || me.role === "admin") return rank[personRole(person)] < rank[me.role];
  return may("employee.save", person);
}

function detail(person: Person) {
  const me = actor();
  // The owner holds every permission; a default manager reads neither the
  // private profile nor the invitation (employees.private.read, employee_access.read).
  const readsPrivate = me.role === "owner" || me.permissions.includes("employees.private.read");
  const readsAccess = me.role === "owner" || me.permissions.includes("employee_access.read");
  const invitation = latestInvitation(person);
  const role = roleById(person.membership?.role_id ?? null);
  const base = summary(person);
  const { jobs } = catalog();
  return {
    ...base,
    display_name: fullName(person),
    primary_job_id: person.primary_job_id,
    primary_job_name: person.primary_job_id ? jobName(person.primary_job_id) : null,
    display_status: base.display_status === "needs_attention" ? "onboarding" : base.display_status,
    user_id: person.user_id,
    account_email: person.account_email,
    internal_note: person.internal_note,
    is_remote: person.is_remote,
    is_excluded_from_schedule: person.is_excluded_from_schedule,
    role_id: role?.id ?? null,
    role_name: role?.name ?? null,
    private_contact: readsPrivate && person.private ? person.private : null,
    locations: [...person.location_ids]
      .map((id) => ({ id, name: locationName(id), primary: id === person.primary_location_id, archived: false, removable: may("employee.remove_from_location", person, [id]) }))
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name)),
    jobs: [...person.job_ids]
      .map((id) => ({ id, name: jobName(id), primary: id === person.primary_job_id, archived: Boolean(jobs.find((job) => job.id === id)?.archived_at) }))
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
    invitation: !invitation || !readsAccess ? null : {
      id: invitation.id,
      email: invitation.email,
      role_id: invitation.role_id,
      status: invitation.status,
      expires_at: invitation.expires_at,
      sent_at: invitation.sent_at,
      delivery_status: invitation.delivery_status,
      delivery_attempted_at: invitation.delivery_attempted_at,
      delivery_failed_at: invitation.delivery_failed_at,
      delivery_error: invitation.delivery_error,
      role_name: roleById(invitation.role_id)?.name ?? null,
      invited_by_name: invitation.invited_by_user_id === MANAGER_USER_ID ? "Rachel Adams" : OWNER_NAME,
    },
    onboarding: {
      status: person.membership?.status === "pending_activation" ? "in_progress" : invitation?.status === "pending" ? "invited" : "not_requested",
      required_documents: documentTypes().filter((type) => type.kind === "document" && type.required_at_onboarding).length,
      completed_documents: 0,
    },
    events: [...person.events].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 50),
    is_workspace_owner: person.is_workspace_owner,
    allowed: {
      save: may("employee.save", person),
      terminate: may("employee.terminate", person),
      archive: may("employee.archive", person),
      remove_access: may("employee.remove_access", person),
      change_role: may("employee.change_role", person),
      make_admin: may("employee.make_admin", person),
      invite: mayInvite(person) && person.user_id === null && person.archived_at === null,
      onboarding_review: may("onboarding.review", person),
    },
  };
}

// ---------- writes ----------

type Input = shared.EmployeeInput;

function parseInput(body: unknown): Input {
  const parsed = shared.employeeInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // The form's own rules first, in the API's words.
    const message = issue?.message;
    if (message && Object.values(refusals).includes(message as never)) fail(400, message);
    fail(400, "Valid employee details required");
  }
  return parsed.data!;
}

/** The database's checks on a record (save_employee_service). */
function validate(input: Input, person: Person | null, roleClass: string | null): void {
  if (!input.first_name.trim() || !input.last_name.trim()) fail(400, "employee first and last name are required");
  const owner = person?.is_workspace_owner ?? false;
  if (owner) {
    if (!input.job_ids.includes(MGMT.owner)) refuse("employee.owner_job");
    if (input.primary_job_id === MGMT.owner) refuse("employee.management_primary");
    if (person!.location_ids.some((id) => !input.location_ids.includes(id))) refuse("employee.owner_locations");
    return;
  }
  if (input.primary_job_id === MGMT.owner) refuse("employee.management_primary");
  if (input.job_ids.includes(MGMT.owner)) fail(400, "Only the workspace owner holds the Owner job.");
  const optional = input.is_remote || input.is_excluded_from_schedule;
  if (roleClass === "manager" && !input.is_remote && input.location_ids.length === 0) refuse("employee.manager_location_required");
  if (!optional) {
    if (input.location_ids.length === 0 || !input.primary_location_id) refuse("employee.location_required");
    if (input.job_ids.length === 0) refuse("employee.job_required");
    if (!input.primary_job_id) refuse("employee.primary_job_required");
  }
  if (input.primary_location_id && !input.location_ids.includes(input.primary_location_id)) fail(400, "primary location must be assigned");
  if (input.primary_job_id && !input.job_ids.includes(input.primary_job_id)) fail(400, "primary job must be assigned");
  const known = new Set(catalog().jobs.map((job) => job.id));
  if (input.job_ids.some((id) => !known.has(id))) fail(400, "invalid employee job");
}

function nextCode(): string {
  const highest = Math.max(0, ...directory.data.people.map((person) => Number(/(\d+)$/.exec(person.employee_code)?.[1] ?? 0)));
  return `HV-${String(highest + 1).padStart(3, "0")}`;
}

function newInvitation(email: string, roleId: string): Invitation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    email,
    role_id: roleId,
    status: "pending",
    expires_at: iso(now + 7 * 86_400_000),
    sent_at: iso(now),
    delivery_status: "sent",
    delivery_attempted_at: iso(now),
    delivery_failed_at: null,
    delivery_error: null,
    invited_by_user_id: actor().userId,
    token: crypto.randomUUID().replaceAll("-", ""),
  };
}

const nowIso = () => new Date().toISOString();
const log = (person: Person, action: string, summary: string) => person.events.push(event(action, summary, nowIso(), actor().userId));

function describeChanges(before: Person, input: Input): string[] {
  const lines: string[] = [];
  const name = (a: string, b: string) => `${a} ${b}`;
  if (name(before.first_name, before.last_name) !== name(input.first_name.trim(), input.last_name.trim()) || (before.middle_name ?? "") !== (input.middle_name ?? "").trim())
    lines.push(`Name changed to ${input.first_name.trim()} ${input.last_name.trim()}`);
  for (const id of input.location_ids.filter((id) => !before.location_ids.includes(id))) lines.push(`Assigned to ${locationName(id)}`);
  for (const id of before.location_ids.filter((id) => !input.location_ids.includes(id))) lines.push(`Removed from ${locationName(id)}`);
  if (input.primary_location_id !== before.primary_location_id && input.primary_location_id)
    lines.push(`Primary location set to ${locationName(input.primary_location_id)}`);
  const added = input.job_ids.filter((id) => !before.job_ids.includes(id));
  const removed = before.job_ids.filter((id) => !input.job_ids.includes(id));
  if (added.length || removed.length)
    lines.push(`Jobs changed: ${[...added.map((id) => `+${jobName(id)}`), ...removed.map((id) => `−${jobName(id)}`)].join(", ")}`);
  else if (input.primary_job_id !== before.primary_job_id && input.primary_job_id) lines.push(`Primary job set to ${jobName(input.primary_job_id)}`);
  if (Boolean(input.is_remote) !== before.is_remote) lines.push(input.is_remote ? "Marked as remote" : "No longer remote");
  if (Boolean(input.is_excluded_from_schedule) !== before.is_excluded_from_schedule)
    lines.push(input.is_excluded_from_schedule ? "Excluded from the schedule" : "Back on the schedule");
  if ((input.start_date || null) !== before.start_date) lines.push(input.start_date ? `Start date set to ${input.start_date}` : "Start date cleared");
  if (input.internal_note.trim() !== before.internal_note) lines.push("Internal note updated");
  if ((input.invitation_email.trim().toLowerCase() || null) !== (before.invitation_email ?? null) && !before.user_id)
    lines.push(input.invitation_email ? `Invite email set to ${input.invitation_email.trim().toLowerCase()}` : "Invite email cleared");
  return lines;
}

function apply(person: Person, input: Input): void {
  person.first_name = input.first_name.trim();
  person.middle_name = (input.middle_name ?? "").trim();
  person.last_name = input.last_name.trim();
  if (!person.user_id) person.invitation_email = input.invitation_email.trim().toLowerCase() || null;
  person.start_date = input.start_date || null;
  person.internal_note = input.internal_note.trim();
  person.location_ids = [...new Set(input.location_ids)];
  person.primary_location_id = input.primary_location_id;
  person.job_ids = [...new Set(input.job_ids)];
  person.primary_job_id = input.primary_job_id;
  person.is_remote = Boolean(input.is_remote);
  person.is_excluded_from_schedule = Boolean(input.is_excluded_from_schedule);
}

/** May the reader place somebody at these locations (employee.create). */
function mayCreateAt(locationIds: string[]): boolean {
  const me = actor();
  if (!me.permissions.includes("employees.manage")) return false;
  if (me.role === "owner" || me.role === "admin") return true;
  return locationIds.length > 0 && locationIds.every((id) => me.locationIds.includes(id));
}

function create(input: Input, inviteRoleId: string | null) {
  if (!mayCreateAt(input.location_ids)) deny("employee.create");
  if (inviteRoleId && !mayInviteWith(inviteRoleId)) deny("employee.invite", "rank");
  const email = input.invitation_email.trim().toLowerCase();
  if (inviteRoleId && !email) fail(400, "valid invitation email required");
  validate(input, null, inviteRoleId ? roleById(inviteRoleId)?.access_class ?? null : null);
  const code = nextCode();
  const person: Person = {
    id: crypto.randomUUID(), employee_code: code, first_name: "", middle_name: "", last_name: "", preferred_name: "",
    invitation_email: null, start_date: null, internal_note: "", location_ids: [], primary_location_id: null, job_ids: [],
    primary_job_id: null, is_remote: false, is_excluded_from_schedule: false, user_id: null, account_email: null,
    membership: null, snapshot_role_id: null, is_workspace_owner: false, private: null, invitations: [], onboarding: null,
    events: [], archived_at: null, revision: 1, avatar: null, preferred_request: null, terminations: [],
  };
  apply(person, input);
  person.events.push(event("employee.created", `Employee record created (${code})`, nowIso(), actor().userId));
  if (inviteRoleId) {
    const invitation = newInvitation(email, inviteRoleId);
    person.invitations.push(invitation);
    log(person, "employee.invited", `Invited as ${roleById(inviteRoleId)!.name} (${email})`);
  }
  directory.data.people.push(person);
  return person;
}

/** Published shifts from an instant on (Schedule's current publications), at some locations. */
function futureShifts(person: Person, fromInstant: number, locationIds?: string[]): number {
  return world.publications
    .flatMap((publication) => publication.shifts)
    .filter((shift) => shift.employee_id === person.id && (!locationIds || locationIds.includes(shift.location_id)))
    .filter((shift) => localInstant(shift.scheduled_date, shift.start_time, ZONE) >= fromInstant).length;
}

// ---------- onboarding review ----------

function onboardingRequirements(person: Person, forReader: boolean) {
  const kase = person.onboarding!;
  const docs = onboardingDocumentRequirements(person);
  // A document row the reader may not read is not shown or counted (S2).
  const readsDocuments = actor().permissions.includes("employee_documents.read");
  return [
    {
      id: kase.profile.id, kind: "profile" as const, title: "Legal name and contact details",
      description: "Legal name as on their ID, address, phone and emergency contact.",
      status: kase.profile.status, required: true, document_mode: null, conditional_reason: null,
      blocks_activation: true, requires_review: true, sort_order: 0, source_id: null, accepted_formats: [],
      content_text: null, content_digest: null, intent_statement: null, rejection_reason: kase.profile.rejection_reason,
    },
    ...(forReader && !readsDocuments ? docs.filter((row) => row.kind !== "document") : docs),
    {
      id: kase.availability.id, kind: "availability" as const, title: "Weekly availability",
      description: "When they can usually work.", status: kase.availability.status, required: true,
      document_mode: null, conditional_reason: null, blocks_activation: false, requires_review: false, sort_order: 30,
      source_id: null, accepted_formats: [], content_text: null, content_digest: null, intent_statement: null, rejection_reason: null,
    },
  ].sort((a, b) => a.sort_order - b.sort_order);
}

function onboardingReview(person: Person) {
  const kase = person.onboarding;
  if (!kase) return null;
  const requirements = onboardingRequirements(person, true);
  const required = requirements.filter((item) => item.required);
  return {
    case_id: kase.id,
    employee_id: person.id,
    case_status: kase.status,
    revision: kase.revision,
    submitted_at: kase.submitted_at,
    progress_completed: required.filter((item) => item.status === "completed").length,
    progress_total: required.length,
    ssn_present: false,
    requirements,
  };
}

// ---------- routes ----------

export function employeesRoutes(route: Route): void {
  // What the drawer picks from (read_employee_references_service).
  route("GET", `${BASE}/reference-data`, () => {
    const me = actor();
    if (!me.permissions.includes("employees.read")) deny("employee.references.read", "missing_permission");
    const reach = me.role === "manager" ? me.locationIds : world.locations.map((location) => location.id);
    const { departments, jobs } = catalog();
    return {
      locations: [...world.locations]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((location) => reach.includes(location.id))
        .map((location) => ({ id: location.id, name: location.name, archived_at: null, timezone: location.timezone })),
      departments: [...departments]
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map((row) => ({ id: row.id, name: row.name, archived_at: row.archived_at, system_key: row.system_key === "management" ? "management" : null })),
      jobs: [...jobs]
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map((row) => ({ id: row.id, name: row.name, archived_at: row.archived_at, department_id: row.department_id, system_key: row.system_key === "owner" ? "owner" : null })),
      invite_roles: workspaceRoles
        .filter((role) => mayInviteWith(role.id))
        .map((role) => ({ id: role.id, name: role.name, system_key: role.system_key, access_class: role.access_class })),
    };
  });

  route("GET", BASE, ({ query }) => {
    const me = actor();
    if (!me.permissions.includes("employees.read")) deny("employee.list", "missing_permission");
    const archived = query.get("archived") === "true";
    const search = (query.get("search") ?? "").trim().toLowerCase();
    const status = archived ? "all" : (query.get("status") ?? "all");
    return directory.data.people
      .filter((person) => Boolean(person.archived_at) === archived && may("employee.list", person))
      .map(summary)
      .filter((row) => !search || [row.first_name, row.last_name, row.preferred_name, row.employee_code, row.invitation_email, row.primary_location_name, row.primary_job_name]
        .filter(Boolean).join(" ").toLowerCase().includes(search))
      .filter((row) => status === "all" || row.display_status === status)
      .sort((a, b) => a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase()) || a.id.localeCompare(b.id));
  });

  // Create, with an invitation when a role is picked (create_employee_command_service).
  route("POST", `${BASE}/create`, ({ body }) => {
    const command = shared.employeeCreateCommandSchema.safeParse(body);
    if (!command.success) fail(400, "Valid employee details required");
    const { request_id: requestId, employee, invite_role_id: roleId } = command.data!;
    const done = directory.data.commands[requestId];
    if (done) return done;
    const person = create(employee, roleId);
    const invitation = roleId ? latestInvitation(person) : null;
    const result = { id: person.id, invitation: invitation ? { id: invitation.id, deliveryStatus: "sent" as const } : null };
    directory.data.commands[requestId] = result;
    save();
    return result;
  });

  // The older create: a record without an invitation.
  route("POST", BASE, ({ body }) => {
    const person = create(parseInput(body), null);
    save();
    return { id: person.id };
  });

  route("GET", `${BASE}/:employeeId`, ({ params }) => detail(readable(params.employeeId)));

  route("PUT", `${BASE}/:employeeId`, ({ params, body }) => {
    const input = parseInput(body);
    const person = readable(params.employeeId);
    if (!may("employee.save", person)) deny("employee.save");
    // A manager places somebody only where they manage.
    if (actor().role === "manager" && input.location_ids.some((id) => !actor().locationIds.includes(id) && !person.location_ids.includes(id)))
      deny("employee.save");
    if (person.archived_at) fail(400, "Restore this employee before editing");
    if (input.expected_revision !== person.revision) fail(409, "employee revision conflict", "employee.revision_conflict");
    validate(input, person, personRole(person));
    const changes = describeChanges(person, input);
    const assignmentsChanged =
      JSON.stringify([...person.location_ids].sort()) !== JSON.stringify([...input.location_ids].sort()) ||
      JSON.stringify([...person.job_ids].sort()) !== JSON.stringify([...input.job_ids].sort());
    apply(person, input);
    person.revision += 1;
    for (const line of changes) log(person, "employee.updated", line);
    if (!changes.length) log(person, "employee.updated", "Profile saved");
    if (assignmentsChanged && person.user_id) applyAssignments(person);
    save();
    return { id: person.id };
  });

  route("PATCH", `${BASE}/:employeeId/role`, ({ params, body }) => {
    const parsed = shared.employeeRoleUpdateInputSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid employee role required");
    const person = readable(params.employeeId);
    if (!person.user_id) fail(400, "employee has no linked workspace account");
    if (!person.membership || person.membership.status !== "active") fail(404, "active workspace membership not found");
    if (!may("employee.change_role", person)) deny("employee.change_role", "rank");
    const role = roleById(parsed.data!.role_id);
    if (!role || role.access_class === "owner") fail(400, "role is unavailable");
    if (role!.access_class === "admin" && !may("employee.make_admin", person)) deny("employee.make_admin", "owner_only");
    if (role!.access_class !== "admin" && rank[role!.access_class] >= rank[actor().role]) deny("employee.change_role", "rank");
    if (role!.access_class === "manager" && !person.is_remote && person.location_ids.length === 0) refuse("employee.manager_location_required");
    const before = roleById(person.membership!.role_id);
    if (before?.id !== role!.id) {
      person.membership!.role_id = role!.id;
      person.revision += 1;
      log(person, "employee.role_changed", `Role changed from ${before?.name ?? "none"} to ${role!.name}`);
      save();
    }
    return { role_id: role!.id };
  });

  route("PATCH", `${BASE}/:employeeId/archive`, ({ params, body }) => {
    const person = readable(params.employeeId);
    if (!may("employee.archive", person)) deny("employee.archive", "rank");
    const archived = Boolean(body?.archived);
    if (archived) {
      if (person.archived_at) return undefined;
      person.archived_at = nowIso();
      if (person.membership && person.membership.status !== "suspended") {
        person.snapshot_role_id = person.membership.role_id;
        person.membership.status = "suspended";
      }
      log(person, "employee.archived", "Employee archived");
    } else {
      if (!person.archived_at) return undefined;
      person.archived_at = null;
      if (body?.restoreAccess) {
        if (!person.user_id || !person.membership) fail(400, "employee has no linked workspace account");
        if (!person.snapshot_role_id) fail(404, "restorable access snapshot not found");
        person.membership!.status = "active";
        person.membership!.role_id = person.snapshot_role_id!;
      }
      log(person, "employee.restored", body?.restoreAccess ? "Employee restored with workspace access" : "Employee restored");
    }
    person.revision += 1;
    save();
    return undefined;
  });

  // Ends employment now or at a past moment (terminate_employee_service).
  route("POST", `${BASE}/:employeeId/termination`, ({ params, body }) => {
    const person = readable(params.employeeId);
    if (!may("employee.terminate", person)) deny("employee.terminate", "rank");
    const key = String(body?.idempotencyKey ?? "");
    const reason = String(body?.reason ?? "").trim();
    const local = String(body?.effectiveLocal ?? "");
    const zone = String(body?.worksiteTimezone ?? "");
    if (!local || !key) fail(400, "effective time and idempotency key are required");
    const replay = person.terminations.find((item) => item.key === key);
    if (replay) return { ...replay.result, idempotentReplay: true };
    if (reason.length < 3 || reason.length > 240) fail(400, "termination reason must be between 3 and 240 characters");
    if (!shared.isValidIanaTimezone(zone)) fail(400, "invalid worksite timezone");
    const [date, clock] = local.split("T");
    const effective = localInstant(date!, (clock ?? "00:00").slice(0, 5), zone);
    if (Number.isNaN(effective)) fail(400, "effective time and idempotency key are required");
    if (effective > Date.now() + 60_000) fail(400, "future termination requires a scheduled offboarding workflow");
    if (person.archived_at) fail(404, "active employee not found");
    if (person.location_ids.length && !person.location_ids.some((id) => world.locations.find((row) => row.id === id)?.timezone === zone))
      fail(400, "worksite timezone must match an active employee location");
    const released = futureShifts(person, effective);
    if (person.membership && ["active", "pending_activation"].includes(person.membership.status)) {
      person.snapshot_role_id = person.membership.role_id;
      person.membership.status = "suspended";
    }
    for (const invitation of person.invitations) if (invitation.status === "pending") invitation.status = "revoked";
    person.archived_at = iso(effective);
    person.revision += 1;
    log(person, "employee.terminated", `Terminated: ${reason}. ${released} published shift${released === 1 ? "" : "s"} released.`);
    const result = { terminationId: crypto.randomUUID(), effectiveAt: iso(effective), releasedShiftCount: released, idempotentReplay: false };
    person.terminations.push({ key, result });
    save();
    return result;
  });

  route("GET", `${BASE}/:employeeId/avatar`, ({ params }) => {
    const person = readable(params.employeeId);
    return { present: Boolean(person.avatar), url: person.avatar };
  });

  route("DELETE", `${BASE}/:employeeId/avatar`, ({ params }) => {
    const person = readable(params.employeeId);
    if (!may("employee.save", person)) deny("employee.save");
    if (person.avatar) {
      person.avatar = null;
      log(person, "employee.avatar_removed", "Workspace profile photo removed");
      save();
    }
    return undefined;
  });

  // Takes the account off the workspace; the record and history stay.
  route("DELETE", `${BASE}/:employeeId/access`, ({ params }) => {
    const person = readable(params.employeeId);
    if (!may("employee.remove_access", person)) deny("employee.remove_access", "rank");
    if (!person.user_id || !person.membership) fail(404, "linked workspace membership not found");
    person.user_id = null;
    person.membership = null;
    person.account_email = null;
    person.revision += 1;
    log(person, "employee.access_removed", "Workspace access removed; record and work history kept");
    save();
    return undefined;
  });

  // Off one location; their shifts there from now on are left open (FB-6.2 S1).
  route("DELETE", `${BASE}/:employeeId/locations/:locationId`, ({ params }) => {
    const person = readable(params.employeeId);
    const locationId = params.locationId as string;
    if (person.is_workspace_owner) refuse("employee.owner_locations");
    if (!person.location_ids.includes(locationId) || !may("employee.remove_from_location", person, [locationId]))
      deny("employee.remove_from_location");
    if (personRole(person) === "manager" && !person.is_remote && person.location_ids.length === 1) refuse("employee.manager_location_required");
    const released = futureShifts(person, Date.now(), [locationId]);
    person.location_ids = person.location_ids.filter((id) => id !== locationId);
    if (person.primary_location_id === locationId) person.primary_location_id = person.location_ids[0] ?? null;
    person.revision += 1;
    log(person, "employee.location_removed", `Removed from ${locationName(locationId)}. ${released} shift${released === 1 ? "" : "s"} left open.`);
    if (person.user_id) applyAssignments(person);
    save();
    return { releasedShiftCount: released, locationsLeft: person.location_ids.length };
  });

  // ---------- invitations ----------

  route("POST", `${BASE}/:employeeId/invitations`, ({ params, body }) => {
    const person = readable(params.employeeId);
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "valid normalized invitation email required");
    if (person.user_id || person.archived_at) fail(404, "invitable employee not found");
    if (!mayInvite(person)) deny("employee.invite", "rank");
    const roleId = String(body?.roleId ?? latestInvitation(person)?.role_id ?? ROLE.employee);
    if (!roleById(roleId)) fail(400, "invitation role is unavailable");
    if (!mayInviteWith(roleId)) deny("employee.invite", "rank");
    if (!person.is_remote && person.location_ids.length === 0) fail(400, "employee requires a location before invitation");
    if (roleById(roleId)!.access_class === "manager" && !person.is_remote && person.location_ids.length === 0) refuse("employee.manager_location_required");
    for (const old of person.invitations) if (old.status === "pending") old.status = "revoked";
    const invitation = newInvitation(email, roleId);
    person.invitations.push(invitation);
    person.invitation_email = email;
    person.revision += 1;
    log(person, "employee.invited", `Invited as ${roleById(roleId)!.name} (${email})`);
    save();
    return { id: invitation.id, expiresAt: invitation.expires_at };
  });

  // Sends the same link again: a failed delivery or a reminder.
  route("POST", `${BASE}/:employeeId/invitations/retry`, ({ params }) => {
    const person = readable(params.employeeId);
    if (!mayInvite(person)) deny("employee.invite", "rank");
    const invitation = latestInvitation(person);
    if (!invitation || invitation.status !== "pending") fail(404, "Failed invitation not found");
    invitation!.delivery_status = "sent";
    invitation!.delivery_attempted_at = nowIso();
    invitation!.delivery_failed_at = null;
    invitation!.delivery_error = null;
    log(person, "employee.invitation_resent", `Invitation sent again to ${invitation!.email}`);
    save();
    return { id: invitation!.id, expiresAt: invitation!.expires_at };
  });

  route("DELETE", `${BASE}/:employeeId/invitations`, ({ params }) => {
    const person = readable(params.employeeId);
    const invitation = latestInvitation(person);
    if (!invitation || invitation.status !== "pending") fail(404, "pending invitation not found");
    if (!mayInvite(person)) deny("employee.invite", "rank");
    invitation!.status = "revoked";
    person.revision += 1;
    log(person, "employee.invitation_revoked", `Invitation to ${invitation!.email} revoked`);
    save();
    return undefined;
  });

  route("GET", `${BASE}/:employeeId/invitations/link`, ({ params }) => {
    const person = readable(params.employeeId);
    if (!mayInvite(person)) deny("employee.invite", "rank");
    const invitation = latestInvitation(person);
    if (!invitation || invitation.status !== "pending") fail(404, "Invitation link is unavailable");
    log(person, "employee.invitation_link_copied", "Invitation link copied");
    save();
    return { url: `https://app.newfork.demo/invite/accept?token=${invitation!.token}`, expiresAt: invitation!.expires_at };
  });

  // ---------- own contact, preferred names ----------

  route("PUT", `${BASE}/:employeeId/emergency-contact`, ({ params, body }) => {
    const person = personById(params.employeeId);
    if (!person || person.user_id !== actor().userId) deny("employee.save_own_contact");
    const name = String(body?.name ?? "").trim();
    const phone = shared.toUsPhone(String(body?.phone ?? ""));
    if (!name || !phone) fail(400, "An emergency contact needs a name and a phone number");
    const contact = person!.private ?? {
      legal_first_name: person!.first_name, legal_last_name: person!.last_name, phone: null, street_address: null, city: null,
      region: null, postal_code: null, country_code: null, date_of_birth: null, emergency_contact_name: null,
      emergency_contact_relationship: null, emergency_contact_email: "", emergency_contact_phone: null,
      share_phone_with_teammates: false, share_email_with_teammates: false,
    };
    contact.emergency_contact_name = name;
    contact.emergency_contact_relationship = String(body?.relationship ?? "").trim() || null;
    contact.emergency_contact_phone = phone;
    contact.emergency_contact_email = String(body?.email ?? "").trim();
    if (typeof body?.personalPhone === "string" && body.personalPhone) contact.phone = shared.toUsPhone(body.personalPhone) ?? contact.phone;
    person!.private = contact;
    person!.revision += 1;
    log(person!, "employee.emergency_contact_saved", "Emergency contact updated");
    save();
    return undefined;
  });

  route("GET", "/v1/workspaces/:workspaceId/preferred-name-approval", () => ({ approval: directory.data.approval }));
  route("PUT", "/v1/workspaces/:workspaceId/preferred-name-approval", ({ body }) => {
    const me = actor();
    if (me.role !== "owner" && me.role !== "admin") deny("settings.people", "rank");
    if (body?.approval !== "auto" && body?.approval !== "manager") fail(400, "A preferred name is either answered here or let through");
    directory.data.approval = body.approval;
    save();
    return undefined;
  });

  // The person asks for their own (request_employee_preferred_name_service).
  route("PUT", `${BASE}/:employeeId/preferred-name`, ({ params, body }) => {
    const person = personById(params.employeeId);
    if (!person || person.user_id !== actor().userId) deny("employee.request_preferred_name");
    const wanted = String(body?.preferredName ?? "").trim();
    if (wanted.length > 80) fail(400, "A preferred name is at most 80 characters");
    if (!wanted) {
      person!.preferred_name = "";
      person!.preferred_request = null;
      log(person!, "employee.preferred_name_cleared", "Preferred name cleared");
      save();
      return { outcome: "cleared" };
    }
    if (directory.data.approval === "auto") {
      person!.preferred_name = wanted;
      person!.preferred_request = null;
      log(person!, "employee.preferred_name_published", `Preferred name "${wanted}" in use`);
      save();
      return { outcome: "published" };
    }
    person!.preferred_request = { id: crypto.randomUUID(), requested_name: wanted, requested_at: nowIso() };
    log(person!, "employee.preferred_name_requested", `Asked to be called "${wanted}"`);
    save();
    return { outcome: "waiting" };
  });

  route("GET", "/v1/workspaces/:workspaceId/preferred-names/pending", () =>
    directory.data.people
      .filter((person) => person.preferred_request && !person.archived_at && may("employee.decide_preferred_name", person))
      .map((person) => ({
        requestId: person.preferred_request!.id,
        employeeId: person.id,
        employeeName: fullName(person),
        requestedName: person.preferred_request!.requested_name,
        requestedAt: person.preferred_request!.requested_at,
      })));

  route("POST", "/v1/workspaces/:workspaceId/preferred-names/:requestId/decision", ({ params, body }) => {
    const person = directory.data.people.find((item) => item.preferred_request?.id === params.requestId);
    if (!person) fail(404, "that request is no longer waiting for an answer", "employee.preferred_name.not_pending");
    if (!may("employee.decide_preferred_name", person!)) deny("employee.decide_preferred_name", "rank");
    const name = person!.preferred_request!.requested_name;
    if (body?.approve) {
      person!.preferred_name = name;
      if (person!.private) person!.private.preferred_name = name;
      log(person!, "employee.preferred_name_approved", `Preferred name "${name}" approved`);
    } else {
      log(person!, "employee.preferred_name_declined", `Preferred name "${name}" not used`);
    }
    person!.preferred_request = null;
    person!.revision += 1;
    save();
    return undefined;
  });

  // ---------- onboarding review (the drawer's legal name step, activation) ----------

  route("GET", `${BASE}/:employeeId/onboarding`, ({ params }) => {
    const person = readable(params.employeeId);
    if (!may("onboarding.review", person)) deny("onboarding.review", "rank");
    return onboardingReview(person);
  });

  route("POST", `${BASE}/:employeeId/onboarding/review`, ({ params, body }) => {
    const person = readable(params.employeeId);
    if (!may("onboarding.review", person)) deny("onboarding.review", "rank");
    const kase = person.onboarding;
    if (!kase) fail(404, "onboarding case unavailable");
    if (Number(body?.revision) !== kase!.revision) fail(409, "onboarding changed; refresh required");
    const action = String(body?.action ?? "");
    if (action === "accept_requirement" || action === "reject_requirement") {
      if (body?.requirementId !== kase!.profile.id) fail(400, "Review documents in the Documents section");
      // A legal name is approved by an owner or an admin, never a manager (FB-6.6 S1).
      if (!may("onboarding.legal_name", person)) deny("onboarding.legal_name", "rank");
      if (kase!.profile.status !== "awaiting_review") fail(400, "This step is not waiting for review");
      if (action === "accept_requirement") {
        kase!.profile = { ...kase!.profile, status: "completed", rejection_reason: null };
        log(person, "onboarding.requirement_accepted", "Legal name and contact details accepted");
      } else {
        const reason = String(body?.reason ?? "").trim();
        if (!reason) fail(400, "A reason is required to request changes");
        kase!.profile = { ...kase!.profile, status: "rejected", rejection_reason: reason };
        kase!.status = "changes_requested";
        log(person, "onboarding.changes_requested", `Changes requested: ${reason}`);
      }
    } else if (action === "activate") {
      const blocking = onboardingRequirements(person, false).filter((item) => item.required && item.blocks_activation && item.status !== "completed");
      if (kase!.status !== "submitted" || blocking.length) fail(400, `Finish reviewing ${blocking.map((item) => item.title).join(", ") || "the submitted onboarding"} before activating`);
      kase!.status = "approved";
      if (person.membership) person.membership.status = "active";
      person.revision += 1;
      log(person, "employee.onboarding_approved", "Onboarding approved; workspace access active");
    } else fail(400, "Valid onboarding review required");
    kase!.revision += 1;
    if (action === "accept_requirement") settleOnboarding(person, actor().userId);
    save();
    documentStore.save();
    return { revision: kase!.revision };
  });
}

