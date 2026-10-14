// Employee documents of the demo restaurant: the document types the workspace
// asks for (Settings > Documents owns their editing; the ids below are the
// ones its definitions should use) and each person's obligation, with
// submitted versions, files, review decisions and history. Read by the
// documents routes and by the Employees drawer (onboarding review, counts).
import { defaultDocumentLifecycleSettings, matchesDocumentTarget, type DocumentLifecycleSettings } from "@newfork/shared";
import { settings } from "./settings-store";
import { domainStore } from "./store";
import { addDays, fingerprint, iso, todayIn } from "./time";
import { OWNER_USER_ID, WORKSPACE_ID, ZONE } from "./world";
import {
  PERSON, catalog, directory, displayName, event, fixedId, locationName, people, personById, type Person,
} from "./people";

/**
 * Document type and acknowledgement ids. The definitions are Settings'
 * (settings-store.ts: Settings > Documents and > Acknowledgements); the
 * employees' obligations below point at these ids.
 */
export const DOC = {
  w4: fixedId(0xd01),
  i9: fixedId(0xd02),
  /** Conditional: the kitchen, and servers and bartenders. */
  foodHandler: fixedId(0xd03),
  /** Still a draft in Settings, so nobody is asked for it yet. */
  directDeposit: fixedId(0xd04),
  /** The signed last page of the handbook, uploaded as a PDF. */
  handbookPage: fixedId(0xd05),
  /** Published acknowledgement versions (signed in Newfork). */
  handbook: fixedId(0xe21),
  tipPool: fixedId(0xe23),
};

type Format = "pdf" | "jpeg" | "png" | "webp";

export interface DocType {
  id: string;
  kind: "document" | "acknowledgement";
  title: string;
  description: string;
  required_at_onboarding: boolean;
  requires_review: boolean;
  accepted_formats: Format[];
  tracks_expiry: boolean;
  expiry_warning_days: number;
  expiry_schedule_impact: "track_only" | "warn" | "block";
  sort_order: number;
  settings: DocumentLifecycleSettings;
  /** Acknowledgements only: the policy text. */
  policy?: { content_text: string; intent_statement: string };
}

/**
 * What employees can be asked for now: Settings' published, unarchived
 * document types, then its published acknowledgement versions.
 */
export function documentTypes(): DocType[] {
  const types = settings.data.document_types
    .filter((type) => type.published_at && !type.archived_at && type.publication_status === "published")
    .map((type): DocType => ({
      id: type.id, kind: "document", title: type.title, description: type.description ?? "",
      required_at_onboarding: type.required_at_onboarding, requires_review: type.requires_review,
      accepted_formats: [...type.accepted_formats] as Format[], tracks_expiry: type.tracks_expiry,
      expiry_warning_days: type.expiry_warning_days, expiry_schedule_impact: type.expiry_schedule_impact,
      sort_order: type.sort_order, settings: type.lifecycle_settings ?? defaultDocumentLifecycleSettings,
    }));
  const versions = settings.data.signature_versions
    .filter((version) => version.status === "published")
    .map((version, index): DocType => ({
      id: version.id, kind: "acknowledgement", title: version.title, description: version.summary ?? "",
      required_at_onboarding: version.required_at_onboarding, requires_review: false, accepted_formats: [],
      tracks_expiry: false, expiry_warning_days: 30, expiry_schedule_impact: "track_only",
      sort_order: 100 + index, settings: version.lifecycle_settings ?? defaultDocumentLifecycleSettings,
      policy: { content_text: version.content_text, intent_statement: version.intent_statement },
    }));
  return [...types, ...versions].sort((a, b) => a.sort_order - b.sort_order);
}
export const docType = (id: string) => documentTypes().find((type) => type.id === id);

export type ObligationStatus =
  "missing" | "grace" | "pending_review" | "rejected" | "expired" | "completed" | "removed" | "exempt" | "timezone_required" | "paused";

export interface SubmissionFile { id: string; filename: string; media_type: string; size_bytes: number; decision: "keep" | "discard"; note: string }
export interface Submission {
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
export interface DocEvent { id: string; action: string; occurred_at: string; metadata: Record<string, unknown> }
export interface Obligation {
  id: string;
  employee_id: string;
  type_id: string;
  status: ObligationStatus;
  /** What the status was before an exemption, so removing it can go back. */
  status_before_exempt: ObligationStatus | null;
  revision: number;
  deadline_at: string | null;
  rejection_reason: string | null;
  exemption_locked: boolean;
  submitted_id: string | null;
  approved_id: string | null;
  submissions: Submission[];
  history: DocEvent[];
  /** Acknowledgements: who signed and when. */
  evidence: { typed_name: string; executed_at: string } | null;
}

// ---------- seed ----------

let counter = 0;
const nextId = () => fixedId(0x100000 + ++counter);
const at = (date: string, clock: string) => iso(Date.parse(`${date}T${clock}:00-04:00`));
const slug = (text: string) => text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");

interface Plan {
  status: "completed" | "pending_review" | "rejected" | "missing" | "expired" | "exempt" | "resubmitted";
  /** Days from today the approved card expires (tracked documents). */
  expiresIn?: number;
  daysAgo?: number;
  reason?: string;
  deadlineIn?: number;
  exemptionLocked?: boolean;
}

function file(person: Person, type: DocType, version: number, kind: "pdf" | "jpg" = "pdf"): SubmissionFile {
  const name = `${slug(type.title)}_${person.first_name}_${person.last_name}${version > 1 ? `_v${version}` : ""}.${kind}`;
  return {
    id: nextId(),
    filename: name,
    media_type: kind === "pdf" ? "application/pdf" : "image/jpeg",
    size_bytes: 180_000 + ((name.length * 7919) % 900_000),
    decision: "keep",
    note: "",
  };
}

function metadataFor(type: DocType, person: Person): Record<string, string | number | null> {
  if (type.id === DOC.i9) return { list_document: person.last_name.length % 2 ? "U.S. Passport (List A)" : "Driver's license (List B) and Social Security card (List C)" };
  if (type.id === DOC.foodHandler) return { certificate_number: `SS-${(person.employee_code.charCodeAt(4) * 7919).toString().slice(0, 7)}` };
  return {};
}

function obligation(person: Person, type: DocType, plan: Plan, today: string): Obligation {
  const id = nextId();
  const assignedAt = at(addDays(today, -(plan.daysAgo ?? 120) - 4), "10:20");
  const submittedAt = at(addDays(today, -(plan.daysAgo ?? 120)), "20:05");
  const reviewedAt = at(addDays(today, -(plan.daysAgo ?? 120) + 1), "11:40");
  const history: DocEvent[] = [{ id: nextId(), action: "document.assigned", occurred_at: assignedAt, metadata: {} }];
  const result: Obligation = {
    id, employee_id: person.id, type_id: type.id, status: "missing", status_before_exempt: null, revision: 1,
    deadline_at: null, rejection_reason: null, exemption_locked: false, submitted_id: null, approved_id: null,
    submissions: [], history, evidence: null,
  };
  const expiry = (days: number | undefined) => (type.tracks_expiry ? addDays(today, days ?? 400) : null);
  const submission = (version: number, state: Submission["state"], extra: Partial<Submission> = {}): Submission => ({
    id: nextId(), version, state, submitted_at: submittedAt, reviewed_at: state === "accepted" || state === "rejected" ? reviewedAt : null,
    expiry_date: expiry(plan.expiresIn), metadata: metadataFor(type, person), rejection_reason: null,
    files: [file(person, type, version, version % 2 ? "pdf" : "jpg")], ...extra,
  });
  if (type.kind === "acknowledgement") {
    if (plan.status === "completed") {
      result.status = "completed";
      result.evidence = { typed_name: `${person.first_name} ${person.last_name}`, executed_at: submittedAt };
      history.unshift({ id: nextId(), action: "document.acknowledged", occurred_at: submittedAt, metadata: {} });
    } else {
      result.deadline_at = type.settings.period_days ? at(addDays(today, plan.deadlineIn ?? 5), "23:59") : null;
    }
    result.revision = history.length;
    return result;
  }
  switch (plan.status) {
    case "completed":
    case "expired": {
      const accepted = submission(1, "accepted", plan.status === "expired" ? { expiry_date: addDays(today, plan.expiresIn ?? -12) } : {});
      result.submissions = [accepted];
      result.submitted_id = accepted.id;
      result.approved_id = accepted.id;
      result.status = "completed";
      history.unshift(
        { id: nextId(), action: "document.submitted", occurred_at: submittedAt, metadata: { submission_id: accepted.id } },
        { id: nextId(), action: "document.approve", occurred_at: reviewedAt, metadata: { submission_id: accepted.id } },
      );
      break;
    }
    case "pending_review": {
      const pending = submission(1, "pending_review");
      result.submissions = [pending];
      result.submitted_id = pending.id;
      result.status = "pending_review";
      result.deadline_at = at(addDays(today, plan.deadlineIn ?? 6), "23:59");
      history.unshift({ id: nextId(), action: "document.submitted", occurred_at: submittedAt, metadata: { submission_id: pending.id } });
      break;
    }
    case "resubmitted": {
      // An approved version on file and a newer one waiting.
      const older = submission(1, "accepted", { submitted_at: at(addDays(today, -300), "19:00"), reviewed_at: at(addDays(today, -299), "10:00") });
      const newer = submission(2, "pending_review");
      result.submissions = [newer, older];
      result.submitted_id = newer.id;
      result.approved_id = older.id;
      result.status = "pending_review";
      history.unshift(
        { id: nextId(), action: "document.submitted", occurred_at: older.submitted_at!, metadata: { submission_id: older.id } },
        { id: nextId(), action: "document.approve", occurred_at: older.reviewed_at!, metadata: { submission_id: older.id } },
        { id: nextId(), action: "document.submitted", occurred_at: submittedAt, metadata: { submission_id: newer.id } },
      );
      break;
    }
    case "rejected": {
      const rejected = submission(1, "rejected", { rejection_reason: plan.reason ?? "The file is unreadable." });
      result.submissions = [rejected];
      result.submitted_id = rejected.id;
      result.status = "rejected";
      result.rejection_reason = rejected.rejection_reason;
      result.deadline_at = at(addDays(today, plan.deadlineIn ?? 4), "23:59");
      history.unshift(
        { id: nextId(), action: "document.submitted", occurred_at: submittedAt, metadata: { submission_id: rejected.id } },
        { id: nextId(), action: "document.reject", occurred_at: reviewedAt, metadata: { submission_id: rejected.id, reason: rejected.rejection_reason } },
      );
      break;
    }
    case "missing":
      result.deadline_at = type.settings.period_days ? at(addDays(today, plan.deadlineIn ?? 5), "23:59") : null;
      break;
    case "exempt":
      result.status = "exempt";
      result.status_before_exempt = "missing";
      result.exemption_locked = plan.exemptionLocked ?? false;
      if (!result.exemption_locked)
        history.unshift({ id: nextId(), action: "document.exempted", occurred_at: reviewedAt, metadata: { reason: plan.reason ?? "" } });
      break;
  }
  // Each audited change moved the revision on.
  result.revision = history.length;
  return result;
}

/** Which documents a person is asked for, from the type's target and their jobs. */
export function typeApplies(type: DocType, person: Pick<Person, "id" | "location_ids" | "job_ids">): boolean {
  const jobs = person.job_ids.map((jobId) => ({ job_id: jobId, department_id: catalog().jobs.find((job) => job.id === jobId)?.department_id ?? null }));
  return matchesDocumentTarget(type.settings.target, person.id, { location_ids: person.location_ids, jobs });
}

// Per-person exceptions to "everything on file". Optional acknowledgements
// nobody signed stay open without a deadline.
const plans: Record<string, Partial<Record<string, Plan>>> = {
  "HV-001": { [DOC.foodHandler]: { status: "completed", expiresIn: 21 } },
  "HV-003": { [DOC.foodHandler]: { status: "pending_review", daysAgo: 1, expiresIn: 1090 } },
  "HV-006": { [DOC.tipPool]: { status: "missing" } },
  "HV-008": { [DOC.handbookPage]: { status: "exempt", reason: "Signed a paper copy at hire; it is in the office file." } },
  "HV-009": { [DOC.foodHandler]: { status: "exempt", reason: "Holds a ServSafe Manager certificate; the original is in the office file." } },
  "HV-010": { [DOC.foodHandler]: { status: "expired", expiresIn: -12 } },
  "HV-011": { [DOC.foodHandler]: { status: "pending_review", daysAgo: 0, expiresIn: 1095 } },
  "HV-012": {
    [DOC.w4]: { status: "rejected", daysAgo: 3, reason: "Step 3 is blank and the form is not signed. Please sign page 1 and upload it again.", deadlineIn: 4 },
    [DOC.tipPool]: { status: "missing" },
  },
  "HV-014": { [DOC.foodHandler]: { status: "completed", expiresIn: 18 } },
  "HV-015": { [DOC.foodHandler]: { status: "expired", expiresIn: -3 } },
  "HV-016": { [DOC.w4]: { status: "resubmitted", daysAgo: 1 }, [DOC.foodHandler]: { status: "missing", deadlineIn: 12 } },
  "HV-020": {
    [DOC.w4]: { status: "missing", deadlineIn: 6 }, [DOC.i9]: { status: "missing", deadlineIn: 2 },
    [DOC.handbookPage]: { status: "missing", deadlineIn: 13 }, [DOC.handbook]: { status: "missing", deadlineIn: 13 },
    [DOC.tipPool]: { status: "missing" },
  },
  "HV-021": {
    [DOC.w4]: { status: "pending_review", daysAgo: 1 }, [DOC.i9]: { status: "pending_review", daysAgo: 1 },
    [DOC.foodHandler]: { status: "pending_review", daysAgo: 1, expiresIn: 700 }, [DOC.handbookPage]: { status: "completed", daysAgo: 1 },
    [DOC.tipPool]: { status: "missing" },
  },
};

function seed(): { obligations: Obligation[] } {
  const today = todayIn(ZONE);
  counter = 0;
  const obligations: Obligation[] = [];
  for (const person of people()) {
    // Archived records and people with no account are asked for nothing.
    if (person.archived_at || !person.user_id) continue;
    for (const type of documentTypes()) {
      if (!typeApplies(type, person)) continue;
      if (person.is_workspace_owner) {
        // An owner is never asked for the documents they ask of everyone else.
        if (type.kind === "document") obligations.push(obligation(person, type, { status: "exempt", exemptionLocked: true }, today));
        continue;
      }
      const plan = plans[person.employee_code]?.[type.id] ?? { status: "completed" as const, daysAgo: Math.max(10, Math.round((Date.parse(today) - Date.parse(person.start_date ?? today)) / 86_400_000)) };
      obligations.push(obligation(person, type, plan, today));
    }
  }
  return { obligations };
}

export const documentStore = domainStore("documents", seed);
/** Obligations whose definition Settings still publishes. */
export const obligations = () => documentStore.data.obligations.filter((row) => docType(row.type_id));

// ---------- views ----------

const today = () => todayIn(ZONE);

/** The status as read now: an approved card past its date reads expired. */
export function statusOf(row: Obligation): ObligationStatus {
  // A conditional document still inside its period reads "grace".
  if (row.status === "missing" && row.deadline_at && Date.parse(row.deadline_at) > Date.now() && docType(row.type_id)?.settings.mode === "conditional") return "grace";
  if (row.status === "completed") {
    const approved = row.submissions.find((item) => item.id === row.approved_id);
    if (approved?.expiry_date && approved.expiry_date < today()) return "expired";
  }
  return row.status;
}

export function obligationJson(row: Obligation) {
  const type = docType(row.type_id)!;
  const person = personById(row.employee_id);
  const deadline = row.deadline_at && !["completed", "exempt", "removed", "pending_review"].includes(statusOf(row)) ? row.deadline_at : null;
  return {
    id: row.id,
    workspace_id: WORKSPACE_ID,
    employee_id: row.employee_id,
    employee_name: person ? displayName(person) : "Employee",
    title: type.title,
    source_id: type.id,
    kind: type.kind,
    mode: type.settings.mode,
    status: statusOf(row),
    revision: row.revision,
    requires_review: type.requires_review,
    deadline_at: deadline,
    remaining_seconds: deadline ? Math.max(0, Math.round((Date.parse(deadline) - Date.now()) / 1000)) : null,
    rejection_reason: statusOf(row) === "rejected" ? row.rejection_reason : null,
    suspended: false,
    exemption_locked: row.exemption_locked,
    publication_paused: false,
    submitted_id: row.submitted_id,
    approved_id: row.approved_id,
    location_ids: [...(person?.location_ids ?? [])],
    location_names: (person?.location_ids ?? []).map(locationName),
    timezone: ZONE,
    settings: type.settings,
    accepted_formats: type.accepted_formats,
    tracks_expiry: type.tracks_expiry,
  };
}

export function detailJson(row: Obligation, selfOnly: boolean) {
  const type = docType(row.type_id)!;
  const person = personById(row.employee_id);
  const digest = fingerprint(type.policy?.content_text ?? type.id);
  return {
    obligation: obligationJson(row),
    submissions: [...row.submissions].sort((a, b) => b.version - a.version),
    history: [...row.history].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    policy: type.policy
      ? {
          content_text: type.policy.content_text,
          content_digest: digest,
          intent_statement: type.policy.intent_statement,
          can_withdraw: false,
          history: row.evidence ? [{ typed_name: row.evidence.typed_name, executed_at: row.evidence.executed_at, withdrawn_at: null, content_digest: digest }] : [],
          evidence: row.evidence ? { ...row.evidence, content_digest: digest, intent_statement: type.policy.intent_statement } : null,
        }
      : null,
    initial_deferral: { allowed: false, reason: null },
    timezone_settings: { value: ZONE, configured_value: null, employee_revision: person?.revision ?? 1, can_manage: !selfOnly && false },
  };
}

/** A new audited event; every change moves the revision on. */
export function audit(row: Obligation, action: string, metadata: Record<string, unknown> = {}): void {
  row.history.push({ id: crypto.randomUUID(), action, occurred_at: new Date().toISOString(), metadata });
  row.revision += 1;
}

/** A fresh obligation for somebody newly asked (an assignment change, a new hire). */
export function assign(person: Person, type: DocType): Obligation {
  const days = type.settings.period_days;
  const row: Obligation = {
    id: crypto.randomUUID(), employee_id: person.id, type_id: type.id, status: "missing", status_before_exempt: null, revision: 1,
    deadline_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null, rejection_reason: null,
    exemption_locked: false, submitted_id: null, approved_id: null, submissions: [],
    history: [{ id: crypto.randomUUID(), action: "document.assigned", occurred_at: new Date().toISOString(), metadata: {} }], evidence: null,
  };
  documentStore.data.obligations.push(row);
  return row;
}

/**
 * What a new set of locations and jobs would do to a linked person's
 * documents (preview_employee_document_assignments_service): assign what now
 * applies, remove what no longer does, reopen what applies again.
 */
export function assignmentImpact(person: Person, locationIds: string[], jobIds: string[], readable: boolean) {
  const after = { id: person.id, location_ids: locationIds, job_ids: jobIds };
  const impact: { title: string; action: "assign" | "remove" | "reopen"; deadline_at: string | null; period_days: number | null; clears_block: boolean; type: DocType }[] = [];
  for (const type of documentTypes()) {
    const row = obligations().find((item) => item.employee_id === person.id && item.type_id === type.id);
    const matches = typeApplies(type, after);
    const action = !row
      ? (matches && type.settings.assignment_scope === "all_active" ? "assign" : null)
      : !matches && row.status !== "removed"
        ? "remove"
        : matches && row.status === "removed"
          ? "reopen"
          : null;
    if (!action) continue;
    const days = type.settings.period_days;
    impact.push({
      title: readable ? type.title : "Document requirement",
      action,
      deadline_at: action !== "remove" && days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
      period_days: days,
      clears_block: false,
      type,
    });
  }
  return impact;
}

/** Applies an assignment change once it is saved. */
export function applyAssignments(person: Person): void {
  for (const change of assignmentImpact(person, person.location_ids, person.job_ids, true)) {
    const row = obligations().find((item) => item.employee_id === person.id && item.type_id === change.type.id);
    if (change.action === "assign") assign(person, change.type);
    else if (row && change.action === "remove") {
      row.status_before_exempt = row.status;
      row.status = "removed";
      audit(row, "document.removed", { reason: "No longer matches the employee's locations or jobs" });
    } else if (row && change.action === "reopen") {
      row.status = row.approved_id ? "completed" : "missing";
      row.deadline_at = change.deadline_at;
      audit(row, "document.reopened");
    }
  }
  documentStore.save();
}

/** A person's documents as onboarding requirements (status words of the case). */
export function onboardingDocumentRequirements(person: Person) {
  const statusWord = (status: ObligationStatus) =>
    status === "completed" || status === "exempt" ? "completed"
      : status === "pending_review" ? "awaiting_review"
        : status === "rejected" ? "rejected"
          : status === "expired" ? "manual_follow_up"
            : "not_started";
  return obligations()
    .filter((row) => row.employee_id === person.id && row.status !== "removed")
    .map((row) => {
      const type = docType(row.type_id)!;
      return {
        id: row.id,
        kind: type.kind,
        title: type.title,
        description: type.description,
        status: statusWord(statusOf(row)),
        required: type.settings.mode !== "optional",
        document_mode: type.kind === "document" ? type.settings.mode : null,
        conditional_reason: null,
        blocks_activation: type.settings.mode === "required",
        requires_review: type.requires_review,
        sort_order: 10 + type.sort_order,
        source_id: type.id,
        accepted_formats: type.accepted_formats,
        content_text: null,
        content_digest: type.policy ? fingerprint(type.policy.content_text) : null,
        intent_statement: null,
        rejection_reason: statusOf(row) === "rejected" ? row.rejection_reason : null,
      };
    });
}

/**
 * After a review: a submitted onboarding case with nothing left blocking
 * activates by itself (this workspace asks for no final approval), as
 * app_private.activate_employee_onboarding_case does after the last review.
 */
export function settleOnboarding(person: Person, actorUserId: string): void {
  const kase = person.onboarding;
  if (!kase || person.membership?.status !== "pending_activation" || kase.status !== "submitted") return;
  if (kase.profile.status !== "completed") return;
  const blocking = onboardingDocumentRequirements(person).filter((row) => row.required && row.blocks_activation && row.status !== "completed");
  if (blocking.length) return;
  kase.status = "approved";
  kase.revision += 1;
  person.membership.status = "active";
  person.revision += 1;
  person.events.push(event("employee.auto_activated", "Onboarding complete; workspace access active", new Date().toISOString(), actorUserId));
  directory.save();
}

/** A rejected required document sends a submitted onboarding case back for changes. */
export function documentRejected(person: Person, type: DocType): void {
  const kase = person.onboarding;
  if (!kase || person.membership?.status !== "pending_activation" || type.kind !== "document" || type.settings.mode === "optional") return;
  if (kase.status === "submitted") {
    kase.status = "changes_requested";
    kase.revision += 1;
    directory.save();
  }
}

export { OWNER_USER_ID, PERSON };
