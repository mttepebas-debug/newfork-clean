// Employee onboarding in the demo backend: the case a newly invited person
// works through on /welcome (profile, documents and policies, availability,
// review), with the routes of apps/api/src/employees/onboarding-routes.ts and
// the self-service document routes (document-lifecycle-routes.ts) it uses.
// The logic follows get/save/submit/leave_employee_onboarding_service in
// supabase/schema.sql at the level the screen can see.
import * as shared from "@newfork/shared";
import { fingerprint, uuid } from "./time";
import { viewer, WORKSPACE_ID, world, ZONE } from "./world";
import { fail, nowIso, uploadedFileUrl, type Route } from "./hub-onboarding-shared";

type Kind = "profile" | "ssn" | "document" | "acknowledgement" | "availability";
type ReqStatus = "not_started" | "in_progress" | "awaiting_review" | "completed" | "rejected" | "manual_follow_up" | "superseded";
type Format = "pdf" | "jpeg" | "png" | "webp";

export interface Requirement {
  id: string;
  kind: Kind;
  title: string;
  description: string;
  status: ReqStatus;
  required: boolean;
  document_mode: "optional" | "required" | "conditional" | null;
  conditional_reason: string | null;
  blocks_activation: boolean;
  requires_review: boolean;
  sort_order: number;
  source_id: string | null;
  accepted_formats: Format[];
  content_text: string | null;
  content_digest: string | null;
  intent_statement: string | null;
  rejection_reason: string | null;
  // Document details the obligation reads (not sent with the case).
  tracks_expiry?: boolean;
  extra_fields?: { key: string; label: string; kind: "text" | "date" | "number"; required: boolean }[];
  period_days?: number | null;
}

interface SubmissionFile { id: string; filename: string; media_type: string; size_bytes: number; decision: "keep" | "discard"; note: string; path: string }
interface Submission {
  id: string;
  version: number;
  state: "draft" | "pending_review" | "accepted" | "rejected" | "superseded";
  submitted_at: string | null;
  reviewed_at: string | null;
  expiry_date: string | null;
  metadata: Record<string, string | number | null>;
  rejection_reason: string | null;
  files: SubmissionFile[];
}
interface DocState {
  revision: number;
  submissions: Submission[];
  submitted_id: string | null;
  evidence: { typed_name: string; executed_at: string; content_digest: string; intent_statement: string } | null;
  signatures: { typed_name: string; executed_at: string; withdrawn_at: string | null; content_digest: string }[];
  history: { id: string; action: string; occurred_at: string; metadata: Record<string, unknown> }[];
}

export interface EmployeeCase {
  case_id: string;
  workspace_id: string;
  workspace_name: string;
  employee_id: string;
  employee_name: string;
  membership_id: string;
  case_status: "in_progress" | "submitted" | "changes_requested" | "approved" | "cancelled";
  revision: number;
  profile: Record<string, unknown> | null;
  locations: { id: string; name: string }[];
  jobs: string[];
  requirements: Requirement[];
  docs: Record<string, DocState>;
  availability: { revision: number; submitted: boolean; updated_at: string | null; preference: shared.WeeklyPreference };
  shift_types: { id: string; name: string; start_time: string | null; end_time: string | null }[];
}

const hex = (n: number) => n.toString(16).padStart(12, "0");
// Fixed ids per workspace, so links to a step survive a reload.
const caseIds = (prefix: string) => (n: number) => `${prefix}-0000-4000-8000-${hex(n)}`;

const handbookText = (name: string) => [
  `Welcome to ${name}. This handbook sets out what we expect of each other.`,
  "Scheduling. Your schedule is posted in Newfork at least one week ahead. Ask for time off through the app at least 14 days before the day you need. Shift swaps need a manager's approval before they count.",
  "Attendance. Arrive in uniform and ready to work at the start of your shift. If you are running late or cannot make a shift, call the manager on duty at least two hours before it starts. Two no-call, no-shows end employment.",
  "Food safety. Wash your hands when you arrive, after breaks and whenever you change tasks. Report any illness with vomiting, diarrhea, fever or jaundice to your manager before your shift; you will not be scheduled until you are well.",
  "Alcohol service. Check ID for anyone who looks under 40. Never serve a guest who appears intoxicated, and tell the manager on duty when you refuse service.",
  "Tips. Tips are pooled by shift and paid out with your paycheck, following the posted tip policy at each location.",
  "Respect at work. Harassment and discrimination of any kind are not tolerated. Report anything that makes you uncomfortable to any manager or to the owner directly.",
].join("\n\n");

function emptyWeek(): shared.WeeklyPreference {
  return shared.emptyWeeklyPreference("time_range");
}

/** The case Maria Lopez opens after her invitation to Harbor & Vine. */
export function harborCase(): EmployeeCase {
  const id = caseIds("0000d001");
  const employee = world.employees.find((one) => one.id === viewer.employeeId) ?? world.employees[0]!;
  const handbook = handbookText("Harbor & Vine");
  const requirements: Requirement[] = [
    profileRequirement(id(1)),
    {
      ...documentBase(id(2), 10),
      title: "Form W-4",
      description: "Your federal tax withholding form, filled in and signed. A clear photo or a PDF is fine.",
      accepted_formats: ["pdf", "jpeg", "png"],
      tracks_expiry: false,
      extra_fields: [],
    },
    {
      ...documentBase(id(3), 20),
      title: "I-9 identity document",
      description: "The document you will show for Form I-9: a U.S. passport, a permanent resident card, or a driver's license with a birth certificate.",
      accepted_formats: ["pdf", "jpeg", "png", "webp"],
      tracks_expiry: true,
      extra_fields: [{ key: "document_number", label: "Document number", kind: "text", required: true }],
    },
    {
      ...documentBase(id(4), 30),
      title: "Food handler card",
      description: "Your county food handler card. If you don't have one yet, say why; you have 30 days after you start.",
      required: false,
      document_mode: "conditional",
      blocks_activation: false,
      accepted_formats: ["pdf", "jpeg", "png"],
      tracks_expiry: true,
      extra_fields: [],
      period_days: 30,
    },
    {
      id: id(5), kind: "acknowledgement", title: "Employee handbook",
      description: "Read the handbook and confirm it with your name.",
      status: "not_started", required: true, document_mode: "required", conditional_reason: null,
      blocks_activation: true, requires_review: false, sort_order: 40, source_id: id(0x15),
      accepted_formats: [], content_text: handbook, content_digest: fingerprint(handbook),
      intent_statement: "I have read the Harbor & Vine employee handbook and agree to follow it.",
      rejection_reason: null,
    },
    availabilityRequirement(id(6)),
  ];
  const [first, ...rest] = employee.display_name.split(" ");
  return {
    case_id: id(0x10),
    workspace_id: WORKSPACE_ID,
    workspace_name: "Harbor & Vine",
    employee_id: employee.id,
    employee_name: employee.display_name,
    membership_id: viewer.membershipId,
    case_status: "in_progress",
    revision: 1,
    profile: { legal_first_name: first, legal_last_name: rest.join(" ") },
    locations: world.locations.filter((one) => employee.location_ids.includes(one.id)).map((one) => ({ id: one.id, name: one.name })),
    // The primary job first, as the employee record lists them.
    jobs: [employee.primary_job_id, ...employee.job_ids.filter((one) => one !== employee.primary_job_id)]
      .map((jobId) => world.jobs.find((job) => job.id === jobId)?.name)
      .filter((name): name is string => Boolean(name)),
    requirements,
    docs: Object.fromEntries(requirements.filter(isDocument).map((item) => [item.id, newDoc()])),
    availability: { revision: 0, submitted: false, updated_at: null, preference: emptyWeek() },
    shift_types: world.shift_types.map((type) => ({ id: type.id, name: type.name, start_time: type.default_start_time, end_time: type.default_end_time })),
  };
}

/** The case behind an invitation accepted on the workspace hub. */
export function invitedCase(workspace: { id: string; name: string }, first: string, last: string, location: string, jobs: string[]): EmployeeCase {
  const id = caseIds(workspace.id.slice(0, 8));
  const handbook = handbookText(workspace.name);
  const requirements: Requirement[] = [
    profileRequirement(id(1)),
    {
      id: id(2), kind: "acknowledgement", title: "Team handbook",
      description: "Read the handbook and confirm it with your name.",
      status: "not_started", required: true, document_mode: "required", conditional_reason: null,
      blocks_activation: true, requires_review: false, sort_order: 40, source_id: id(0x12),
      accepted_formats: [], content_text: handbook, content_digest: fingerprint(handbook),
      intent_statement: `I have read the ${workspace.name} team handbook and agree to follow it.`,
      rejection_reason: null,
    },
    availabilityRequirement(id(3)),
  ];
  return {
    case_id: id(0x10),
    workspace_id: workspace.id,
    workspace_name: workspace.name,
    employee_id: id(0x20),
    employee_name: `${first} ${last}`,
    membership_id: id(0x30),
    case_status: "in_progress",
    revision: 1,
    profile: { legal_first_name: first, legal_last_name: last },
    locations: [{ id: id(0x40), name: location }],
    jobs,
    requirements,
    docs: Object.fromEntries(requirements.filter(isDocument).map((item) => [item.id, newDoc()])),
    availability: { revision: 0, submitted: false, updated_at: null, preference: emptyWeek() },
    shift_types: [],
  };
}

function profileRequirement(id: string): Requirement {
  return {
    id, kind: "profile", title: "Your profile",
    description: "Your legal name, contact details and an emergency contact.",
    status: "not_started", required: true, document_mode: null, conditional_reason: null,
    blocks_activation: true, requires_review: false, sort_order: 0, source_id: null,
    accepted_formats: [], content_text: null, content_digest: null, intent_statement: null, rejection_reason: null,
  };
}

function availabilityRequirement(id: string): Requirement {
  return {
    id, kind: "availability", title: "Weekly availability",
    description: "The hours you can't work in a normal week.",
    status: "not_started", required: false, document_mode: null, conditional_reason: null,
    blocks_activation: false, requires_review: false, sort_order: 50, source_id: null,
    accepted_formats: [], content_text: null, content_digest: null, intent_statement: null, rejection_reason: null,
  };
}

function documentBase(id: string, sort: number): Requirement {
  return {
    id, kind: "document", title: "", description: "",
    status: "not_started", required: true, document_mode: "required", conditional_reason: null,
    blocks_activation: true, requires_review: true, sort_order: sort,
    source_id: `${id.slice(0, 8)}-5000-4000-8000-${id.slice(-12)}`,
    accepted_formats: ["pdf"], content_text: null, content_digest: null, intent_statement: null, rejection_reason: null,
  };
}

function newDoc(): DocState {
  return {
    revision: 1, submissions: [], submitted_id: null, evidence: null, signatures: [],
    history: [{ id: uuid(), action: "document.assigned", occurred_at: nowIso(), metadata: {} }],
  };
}

const isDocument = (item: Requirement) => item.kind === "document" || item.kind === "acknowledgement";

// ---------------------------------------------------------------------------
// What the screen reads.

/** A conditional document still needs either a file or a reason. */
function initialActionMissing(item: Requirement): boolean {
  return item.kind === "document" && item.document_mode === "conditional"
    && !item.conditional_reason?.trim() && !["awaiting_review", "completed"].includes(item.status);
}

function firstActionablePath(onboarding: EmployeeCase): string {
  const open = onboarding.requirements
    .filter((item) => (item.required || initialActionMissing(item))
      && ["not_started", "in_progress", "rejected", "manual_follow_up"].includes(item.status))
    .sort((a, b) => Number(b.status === "rejected") - Number(a.status === "rejected") || a.sort_order - b.sort_order);
  const first = open[0];
  if (!first) return onboarding.case_status === "approved" ? "/app/employee-hub" : "/welcome/review";
  if (first.kind === "profile") return "/welcome/profile";
  if (first.kind === "ssn") return "/welcome/review";
  if (first.kind === "availability") return "/welcome/availability";
  if (first.kind === "document") return `/welcome/documents/${first.id}`;
  return `/welcome/acknowledgements/${first.id}`;
}

export function caseView(onboarding: EmployeeCase) {
  const counted = onboarding.requirements.filter((item) => item.required || (item.kind === "document" && item.document_mode === "conditional"));
  const done = counted.filter((item) => (item.required && ["completed", "awaiting_review"].includes(item.status))
    || (item.kind === "document" && item.document_mode === "conditional" && !initialActionMissing(item)));
  return {
    case_id: onboarding.case_id,
    workspace_id: onboarding.workspace_id,
    workspace_name: onboarding.workspace_name,
    employee_id: onboarding.employee_id,
    employee_name: onboarding.employee_name,
    membership_id: onboarding.membership_id,
    membership_status: onboarding.case_status === "approved" ? "active" : "pending_activation",
    case_status: onboarding.case_status,
    revision: onboarding.revision,
    progress_completed: done.length,
    progress_total: counted.length,
    first_actionable_path: firstActionablePath(onboarding),
    ssn_status: { present: false, last_four: null },
    profile: onboarding.profile,
    assignments: { locations: onboarding.locations.map((one) => one.name), jobs: onboarding.jobs },
    requirements: [...onboarding.requirements]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ tracks_expiry: _t, extra_fields: _e, period_days: _p, ...item }) => item),
  };
}

function obligationOf(onboarding: EmployeeCase, item: Requirement) {
  const doc = onboarding.docs[item.id]!;
  const status = item.kind === "acknowledgement"
    ? (doc.evidence ? "completed" : "missing")
    : item.status === "awaiting_review" ? "pending_review"
      : item.status === "completed" ? "completed"
        : item.status === "rejected" ? "rejected"
          : item.document_mode === "conditional" && item.conditional_reason ? "grace" : "missing";
  return {
    id: item.id,
    workspace_id: onboarding.workspace_id,
    employee_id: onboarding.employee_id,
    employee_name: onboarding.employee_name,
    title: item.title,
    source_id: item.source_id,
    kind: item.kind as "document" | "acknowledgement",
    mode: (item.document_mode ?? "required") as "optional" | "required" | "conditional",
    status,
    revision: doc.revision,
    requires_review: item.requires_review,
    // The clock on an initial document starts once onboarding is approved.
    deadline_at: null,
    remaining_seconds: null,
    rejection_reason: item.rejection_reason,
    suspended: false,
    exemption_locked: false,
    publication_paused: false,
    submitted_id: doc.submitted_id,
    approved_id: null,
    location_ids: onboarding.locations.map((one) => one.id),
    location_names: onboarding.locations.map((one) => one.name),
    timezone: ZONE,
    settings: {
      mode: (item.document_mode ?? "required") as "optional" | "required" | "conditional",
      target: { operator: "and" as const, location_ids: [], department_ids: [], job_ids: [], employee_ids: [] },
      assignment_scope: "future_onboarding" as const,
      period_days: item.period_days ?? (item.document_mode === "conditional" ? 30 : null),
      suspend_on_overdue: false,
      extra_fields: item.extra_fields ?? [],
    },
    accepted_formats: item.accepted_formats,
    tracks_expiry: item.tracks_expiry ?? false,
  };
}

function detailOf(onboarding: EmployeeCase, item: Requirement) {
  const doc = onboarding.docs[item.id]!;
  return {
    policy: item.kind === "acknowledgement"
      ? {
          content_text: item.content_text ?? "",
          content_digest: item.content_digest ?? fingerprint(""),
          intent_statement: item.intent_statement ?? "",
          can_withdraw: onboarding.case_status !== "approved",
          history: doc.signatures,
          evidence: doc.evidence,
        }
      : null,
    initial_deferral: item.document_mode === "conditional"
      ? { allowed: !["awaiting_review", "completed"].includes(item.status), reason: item.conditional_reason }
      : { allowed: false, reason: null },
    obligation: obligationOf(onboarding, item),
    submissions: doc.submissions.map(({ files, ...submission }) => ({
      ...submission,
      files: files.map(({ path: _path, ...file }) => file),
    })),
    history: doc.history,
  };
}

// ---------------------------------------------------------------------------
// Routes.

export interface CaseSource {
  /** The cases this page knows, by workspace id. */
  cases(): Record<string, EmployeeCase>;
  save(): void;
  /** The person walked away from the case (the workspace leaves their list). */
  left(workspaceId: string): void;
}

export function employeeCaseRoutes(route: Route, source: CaseSource): void {
  const find = (workspaceId: string | null): EmployeeCase => {
    const cases = source.cases();
    const found = workspaceId ? cases[workspaceId] : Object.values(cases)[0];
    if (!found) fail(404, "employee onboarding is unavailable");
    return found;
  };
  const touch = (onboarding: EmployeeCase) => {
    onboarding.revision += 1;
    source.save();
  };
  const checkRevision = (onboarding: EmployeeCase, revision: unknown) => {
    if (onboarding.revision !== revision) fail(409, "onboarding changed; refresh required");
  };
  const requirement = (onboarding: EmployeeCase, id: string): Requirement => {
    const found = onboarding.requirements.find((item) => item.id === id && isDocument(item));
    if (!found) fail(404, "Document not found");
    return found;
  };
  const docRevision = (doc: DocState, revision: unknown) => {
    if (doc.revision !== revision) fail(409, "This document changed. Reload it and try again.");
  };
  const event = (doc: DocState, action: string, metadata: Record<string, unknown> = {}) => {
    doc.revision += 1;
    doc.history.unshift({ id: uuid(), action, occurred_at: nowIso(), metadata });
  };

  route("GET", "/v1/me/onboarding", ({ query }) => caseView(find(query.get("workspaceId"))));

  route("PATCH", "/v1/me/onboarding/profile", ({ query, body }) => {
    const parsed = shared.employeeOnboardingProfileSchema.safeParse(body?.profile);
    if (!parsed.success) fail(400, "Complete private profile required");
    const onboarding = find(query.get("workspaceId"));
    checkRevision(onboarding, body?.revision);
    onboarding.profile = { ...parsed.data };
    // The preferred name is what the team sees from now on.
    const name = `${parsed.data.legal_first_name} ${parsed.data.legal_last_name}`;
    if (!onboarding.employee_name.trim()) onboarding.employee_name = name;
    const item = onboarding.requirements.find((one) => one.kind === "profile");
    if (item) item.status = "completed";
    touch(onboarding);
    return { revision: onboarding.revision };
  });

  route("PUT", "/v1/me/onboarding/ssn", () => fail(410, "SSN is deferred from V1"));

  route("POST", "/v1/me/onboarding/submit", ({ query, body }) => {
    const onboarding = find(query.get("workspaceId"));
    checkRevision(onboarding, body?.revision);
    if (onboarding.requirements.some(initialActionMissing))
      fail(400, "Submit conditional documents or give an initial reason");
    if (onboarding.requirements.some((item) => item.required && !["completed", "awaiting_review"].includes(item.status)))
      fail(400, "required onboarding items remain incomplete");
    // Documents wait for a manager's review, so the case waits too (no auto-activation).
    onboarding.case_status = "submitted";
    touch(onboarding);
    return { revision: onboarding.revision };
  });

  route("POST", "/v1/me/onboarding/leave", ({ query, body }) => {
    const onboarding = find(query.get("workspaceId"));
    checkRevision(onboarding, body?.revision);
    const result = {
      status: "left",
      workspaceId: onboarding.workspace_id,
      employeeId: onboarding.employee_id,
      membershipId: onboarding.membership_id,
      revision: onboarding.revision + 1,
    };
    delete source.cases()[onboarding.workspace_id];
    source.left(onboarding.workspace_id);
    source.save();
    return result;
  });

  // Weekly availability, the onboarding way in (availability-data.ts).
  const availabilityModel = (onboarding: EmployeeCase) => ({
    employee_id: onboarding.employee_id,
    employee_name: onboarding.employee_name,
    can_edit_employee: onboarding.case_status !== "approved",
    can_manage: false,
    settings: { input_mode: "time_range" as const, onboarding_required: false, revision: 1 },
    employee: { ...onboarding.availability },
    manager: null,
    shift_types: onboarding.shift_types.map((type) => ({ ...type, archived: false, selectable: true })),
    time_format: "12h" as const,
  });
  route("GET", "/v1/me/onboarding/availability/weekly", ({ query }) => availabilityModel(find(query.get("workspaceId"))));
  route("POST", "/v1/me/onboarding/availability/weekly", ({ query, body }) => {
    const onboarding = find(query.get("workspaceId"));
    const parsed = shared.weeklyPreferenceSaveSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid weekly availability required");
    if (parsed.data.employee_id !== onboarding.employee_id || parsed.data.source !== "employee")
      fail(403, "Not allowed", { reason: "authz.out_of_scope" });
    if (parsed.data.expected_revision !== onboarding.availability.revision)
      fail(409, "Your availability changed somewhere else. Reload to see the latest.", { reason: "availability.revision_conflict" });
    if (parsed.data.preference.input_mode !== "time_range")
      fail(400, "Use the organization's selected entry mode.");
    onboarding.availability = {
      revision: onboarding.availability.revision + 1,
      submitted: true,
      updated_at: nowIso(),
      preference: parsed.data.preference,
    };
    const item = onboarding.requirements.find((one) => one.kind === "availability");
    if (item) item.status = "completed";
    touch(onboarding);
    return { model: availabilityModel(onboarding) };
  });

  // The person's own documents (selfOnly audience).
  const root = "/v1/me/workspaces/:workspaceId/documents";
  route("GET", root, ({ params }) => {
    const onboarding = find(params.workspaceId);
    return onboarding.requirements.filter(isDocument).map((item) => obligationOf(onboarding, item));
  });
  route("GET", `${root}/:requirementId`, ({ params }) => {
    const onboarding = find(params.workspaceId);
    return detailOf(onboarding, requirement(onboarding, params.requirementId));
  });
  route("POST", `${root}/:requirementId/upload-url`, ({ params, body }) => {
    const onboarding = find(params.workspaceId);
    const item = requirement(onboarding, params.requirementId);
    const filename = String(body?.filename ?? "").trim();
    const size = Number(body?.sizeBytes);
    if (!filename || !Number.isInteger(size) || size < 1 || size > 10_485_760)
      fail(400, "Valid document details required");
    if (item.kind !== "document") fail(400, "This item is confirmed, not uploaded");
    const extension = filename.toLowerCase().split(".").at(-1) ?? "";
    const format = extension === "jpg" ? "jpeg" : extension;
    if (!item.accepted_formats.includes(format as Format))
      fail(400, `This document takes ${item.accepted_formats.map((one) => one.toUpperCase()).join(", ")} files`, { reason: "document.format_not_accepted" });
    return { path: `${onboarding.workspace_id}/${onboarding.employee_id}/${item.id}/${uuid()}-${filename}`, token: `demo-${uuid()}` };
  });
  route("POST", `${root}/:requirementId/confirm`, ({ params, body }) => {
    const onboarding = find(params.workspaceId);
    const item = requirement(onboarding, params.requirementId);
    const doc = onboarding.docs[item.id]!;
    docRevision(doc, body?.revision);
    let draft = doc.submissions.find((one) => one.state === "draft");
    if (!draft) {
      draft = {
        id: uuid(), version: doc.submissions.length + 1, state: "draft", submitted_at: null, reviewed_at: null,
        expiry_date: null, metadata: {}, rejection_reason: null, files: [],
      };
      doc.submissions.unshift(draft);
    }
    const filename = String(body?.filename ?? "file");
    const extension = filename.toLowerCase().split(".").at(-1) ?? "";
    draft.files.push({
      id: uuid(), filename, size_bytes: Number(body?.sizeBytes) || 1, decision: "keep", note: "", path: String(body?.path ?? ""),
      media_type: extension === "pdf" ? "application/pdf" : `image/${extension === "jpg" ? "jpeg" : extension}`,
    });
    if (item.status === "not_started" || item.status === "rejected") item.status = "in_progress";
    event(doc, "document.file_uploaded", { filename });
    touch(onboarding);
    return { revision: doc.revision };
  });
  route("POST", `${root}/:requirementId/remove-draft-file`, ({ params, body }) => {
    const onboarding = find(params.workspaceId);
    const item = requirement(onboarding, params.requirementId);
    const doc = onboarding.docs[item.id]!;
    docRevision(doc, body?.revision);
    const draft = doc.submissions.find((one) => one.id === body?.submission_id && one.state === "draft");
    if (!draft) fail(404, "Draft not found");
    draft.files = draft.files.filter((file) => file.id !== body?.file_id);
    if (draft.files.length === 0) {
      doc.submissions = doc.submissions.filter((one) => one !== draft);
      if (item.status === "in_progress") item.status = doc.submitted_id ? "awaiting_review" : "not_started";
    }
    event(doc, "document.file_removed");
    touch(onboarding);
    return { revision: doc.revision };
  });
  route("POST", `${root}/:requirementId/submit`, ({ params, body }) => {
    const onboarding = find(params.workspaceId);
    const item = requirement(onboarding, params.requirementId);
    const doc = onboarding.docs[item.id]!;
    const parsed = shared.documentSubmitCommandSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid document details required");
    docRevision(doc, parsed.data.revision);
    const draft = doc.submissions.find((one) => one.id === parsed.data.submission_id && one.state === "draft");
    if (!draft || !draft.files.some((file) => file.decision === "keep")) fail(400, "Add a file before you submit");
    if (item.tracks_expiry && !parsed.data.expiry_date) fail(400, "Enter the expiry date on the document");
    if (parsed.data.expiry_date && parsed.data.expiry_date <= new Date().toISOString().slice(0, 10))
      fail(400, "This document has already expired. Upload a current one.", { reason: "document.expired" });
    const missing = (item.extra_fields ?? []).find((field) => field.required && !String(parsed.data.metadata[field.key] ?? "").trim());
    if (missing) fail(400, `${missing.label} is required`);
    for (const one of doc.submissions) if (one.state === "pending_review") one.state = "superseded";
    draft.state = "pending_review";
    draft.submitted_at = nowIso();
    draft.expiry_date = parsed.data.expiry_date;
    draft.metadata = parsed.data.metadata;
    doc.submitted_id = draft.id;
    item.status = item.requires_review ? "awaiting_review" : "completed";
    item.conditional_reason = null;
    event(doc, "document.submitted", { version: draft.version });
    touch(onboarding);
    return { revision: doc.revision };
  });
  route("POST", `${root}/:requirementId/defer`, ({ params, body }) => {
    const onboarding = find(params.workspaceId);
    const item = requirement(onboarding, params.requirementId);
    const doc = onboarding.docs[item.id]!;
    const parsed = shared.documentReasonCommandSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid document details required");
    docRevision(doc, parsed.data.revision);
    if (item.document_mode !== "conditional") fail(400, "This document can't wait", { reason: "document.deferral_not_allowed" });
    item.conditional_reason = parsed.data.reason;
    event(doc, "document.initial_deferred", { reason: parsed.data.reason });
    touch(onboarding);
    return { revision: doc.revision };
  });
  route("POST", `${root}/:requirementId/acknowledge`, ({ params, body }) => {
    const onboarding = find(params.workspaceId);
    const item = requirement(onboarding, params.requirementId);
    const doc = onboarding.docs[item.id]!;
    const parsed = shared.documentAcknowledgeCommandSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid document details required");
    docRevision(doc, parsed.data.revision);
    if (item.kind !== "acknowledgement") fail(400, "This document is uploaded, not confirmed");
    if (parsed.data.content_digest !== item.content_digest)
      fail(409, "The policy changed while you were reading it. Reload and read it again.", { reason: "document.policy_changed" });
    const fold = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (fold(parsed.data.typed_name) !== fold(onboarding.employee_name))
      fail(400, `Type your name as ${onboarding.employee_name}`, { reason: "document.signer_name_mismatch" });
    const signature = { typed_name: parsed.data.typed_name.trim(), executed_at: nowIso(), content_digest: item.content_digest! };
    doc.evidence = { ...signature, intent_statement: item.intent_statement ?? "" };
    doc.signatures.unshift({ ...signature, withdrawn_at: null });
    item.status = "completed";
    event(doc, "document.acknowledged");
    touch(onboarding);
    return { revision: doc.revision };
  });
  route("POST", `${root}/:requirementId/withdraw`, ({ params, body }) => {
    const onboarding = find(params.workspaceId);
    const item = requirement(onboarding, params.requirementId);
    const doc = onboarding.docs[item.id]!;
    docRevision(doc, body?.revision);
    if (!doc.evidence) fail(400, "Nothing to undo");
    doc.evidence = null;
    if (doc.signatures[0]) doc.signatures[0].withdrawn_at = nowIso();
    item.status = "not_started";
    event(doc, "document.acknowledgement_withdrawn");
    touch(onboarding);
    return { revision: doc.revision };
  });
  route("GET", `${root}/:requirementId/submissions/:submissionId/files/:fileId/download`, async ({ params }) => {
    const onboarding = find(params.workspaceId);
    const doc = onboarding.docs[requirement(onboarding, params.requirementId).id]!;
    const file = doc.submissions.find((one) => one.id === params.submissionId)?.files.find((one) => one.id === params.fileId);
    if (!file) fail(404, "File not found");
    const url = await uploadedFileUrl(file.path);
    if (!url) fail(404, "This file is no longer kept in this browser.");
    return { url };
  });
}
