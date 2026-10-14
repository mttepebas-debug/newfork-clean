// Demo backend for employee documents: the list and detail an owner reviews
// (/app/employees/documents and the Employees drawer's Documents section),
// approve / reject, exemptions, deadline extensions, the assignment preview
// the drawer shows before a save, and file downloads. Routes follow
// apps/api/src/employees/document-lifecycle-routes.ts; answers follow
// packages/shared/src/document-lifecycle.ts.
import { documentReviewCommandSchema } from "@newfork/shared";
import { ApiError, type Handler } from "./api";
import { todayIn } from "./time";
import { WORKSPACE_ID, ZONE } from "./world";
import { actor, displayName, may, personById, personByUser } from "./people";
import {
  assignmentImpact, audit, detailJson, docType, documentRejected, documentStore, settleOnboarding, obligationJson, obligations, statusOf, type Obligation,
} from "./documents-data";

type Route = (method: string, path: string, handler: Handler) => void;
const MANAGER_ROOT = "/v1/workspaces/:workspaceId/employee-documents";
const SELF_ROOT = "/v1/me/workspaces/:workspaceId/documents";

function fail(status: number, error: string, reason?: string, detail?: string): never {
  throw new ApiError(status, { error, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) });
}
const deny = (action: string, reason = "out_of_scope"): never => fail(403, "Not allowed", `authz.${reason}`, action);

/** documents.read on the workspace: the permission first, then whose rows. */
function readsDocuments(): void {
  if (!actor().permissions.includes("employee_documents.read")) deny("documents.read", "missing_permission");
}

function rowFor(requirementId: string, selfOnly: boolean): Obligation {
  const row = obligations().find((item) => item.id === requirementId);
  const person = row ? personById(row.employee_id) : undefined;
  if (selfOnly) {
    const me = personByUser(actor().userId);
    if (!row || !me || row.employee_id !== me.id) fail(404, "document unavailable");
    return row!;
  }
  readsDocuments();
  if (!row || !person || !may("documents.read", person)) deny("documents.read");
  return row!;
}

function reviewable(row: Obligation): void {
  const person = personById(row.employee_id);
  if (!person || !may("documents.review", person)) deny("documents.review", "rank");
}

const save = () => documentStore.save();

/** A one-page PDF that stands in for the uploaded file. */
function demoPdf(lines: string[]): string {
  const escape = (text: string) => text.replace(/[\\()]/g, (char) => `\\${char}`).replace(/[^\x20-\x7e]/g, "-");
  const content = [
    "BT /F1 20 Tf 72 720 Td", `(${escape(lines[0] ?? "")}) Tj`, "/F1 12 Tf",
    ...lines.slice(1).map((line) => `0 -22 Td (${escape(line)}) Tj`), "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
}

function download(row: Obligation, submissionId: string, fileId: string) {
  const submission = row.submissions.find((item) => item.id === submissionId);
  const file = submission?.files.find((item) => item.id === fileId && item.decision === "keep");
  if (!submission || !file) fail(404, "document file unavailable");
  const person = personById(row.employee_id);
  return {
    url: demoPdf([
      docType(row.type_id)?.title ?? "Document",
      `${person ? displayName(person) : "Employee"} - version ${submission!.version}`,
      `File: ${file!.filename}`,
      submission!.expiry_date ? `Expires ${submission!.expiry_date}` : "No expiration date",
      "Demo file on the Newfork page atlas.",
    ]),
  };
}

export function documentsRoutes(route: Route): void {
  // ---------- an owner's (or a reviewer's) view of everybody ----------

  route("GET", MANAGER_ROOT, () => {
    readsDocuments();
    return obligations()
      .filter((row) => {
        const person = personById(row.employee_id);
        return person && !person.archived_at && may("documents.read", person);
      })
      .sort((a, b) => (docType(a.type_id)?.sort_order ?? 0) - (docType(b.type_id)?.sort_order ?? 0) || a.id.localeCompare(b.id))
      .map(obligationJson);
  });

  // Before a save: what new locations and jobs would do to the person's documents.
  route("POST", `${MANAGER_ROOT}/:employeeId/assignment-preview`, ({ params, body }) => {
    const person = personById(params.employeeId);
    if (!person) fail(404, "employee unavailable");
    if (!may("employee.save", person!)) deny("employee.save");
    const readable = actor().permissions.includes("employee_documents.read");
    const locationIds = Array.isArray(body?.location_ids) ? (body.location_ids as string[]) : person!.location_ids;
    const jobIds = Array.isArray(body?.job_ids) ? (body.job_ids as string[]) : person!.job_ids;
    return assignmentImpact(person!, locationIds, jobIds, readable).map(({ type: _type, ...impact }) => impact);
  });

  route("GET", `${MANAGER_ROOT}/:requirementId`, ({ params }) => detailJson(rowFor(params.requirementId, false), false));

  route("GET", `${MANAGER_ROOT}/:requirementId/submissions/:submissionId/files/:fileId/download`, ({ params }) =>
    download(rowFor(params.requirementId, false), params.submissionId, params.fileId));

  route("POST", `${MANAGER_ROOT}/:requirementId/review`, ({ params, body }) => {
    const parsed = documentReviewCommandSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid document details required");
    const input = parsed.data!;
    const row = rowFor(params.requirementId, false);
    reviewable(row);
    if (row.revision !== input.revision || row.submitted_id !== input.submission_id) fail(409, "document changed; refresh required");
    if (["exempt", "removed", "paused"].includes(row.status)) fail(400, "document obligation is closed");
    const submission = row.submissions.find((item) => item.id === input.submission_id);
    if (!submission || !["pending_review", "accepted"].includes(submission.state)) fail(409, "submission changed; refresh required");
    const ids = submission!.files.map((item) => item.id).sort();
    if (JSON.stringify(input.files.map((item) => item.id).sort()) !== JSON.stringify(ids)) fail(400, "decide every file exactly once");
    const now = new Date().toISOString();
    for (const decision of input.files) {
      const file = submission!.files.find((item) => item.id === decision.id)!;
      file.decision = decision.decision;
      file.note = decision.note;
    }
    if (input.decision === "approve") {
      if (submission!.expiry_date && submission!.expiry_date < todayIn(ZONE)) fail(400, "expired document cannot be approved");
      for (const other of row.submissions) if (other.state === "accepted" && other.id !== submission!.id) other.state = "superseded";
      submission!.state = "accepted";
      submission!.reviewed_at = now;
      submission!.rejection_reason = null;
      row.approved_id = submission!.id;
      row.status = "completed";
      row.rejection_reason = null;
      row.deadline_at = null;
    } else {
      const type = docType(row.type_id)!;
      const remaining = row.deadline_at ? Date.parse(row.deadline_at) - Date.now() : 0;
      if (input.correction_period === "remaining" && remaining <= 0) fail(400, "no correction time remains");
      submission!.state = "rejected";
      submission!.reviewed_at = now;
      submission!.rejection_reason = input.reason;
      if (row.approved_id === submission!.id) row.approved_id = null;
      row.status = "rejected";
      row.rejection_reason = input.reason;
      row.deadline_at = input.correction_period === "remaining"
        ? row.deadline_at
        : new Date(Date.now() + (type.settings.period_days ?? 7) * 86_400_000).toISOString();
    }
    audit(row, `document.${input.decision}`, { submission_id: submission!.id, ...(input.decision === "reject" ? { reason: input.reason } : {}) });
    save();
    const person = personById(row.employee_id)!;
    if (input.decision === "approve") settleOnboarding(person, actor().userId);
    else documentRejected(person, docType(row.type_id)!);
    return { revision: row.revision };
  });

  route("POST", `${MANAGER_ROOT}/:requirementId/exemption`, ({ params, body }) => {
    const row = rowFor(params.requirementId, false);
    reviewable(row);
    const reason = String(body?.reason ?? "").trim();
    if (!reason || reason.length > 500) fail(400, "Valid document details required");
    if (Number(body?.revision) !== row.revision) fail(409, "document changed; refresh required");
    if (row.exemption_locked) fail(400, "An owner is never asked for this document");
    if (body?.exempt) {
      if (row.status === "exempt") fail(400, "This employee is already exempt");
      row.status_before_exempt = row.status;
      row.status = "exempt";
      audit(row, "document.exempted", { reason });
    } else {
      if (row.status !== "exempt") fail(400, "This employee is not exempt");
      const period = docType(row.type_id)!.settings.period_days;
      // A valid approved version is kept; otherwise the full period starts again.
      row.status = row.approved_id ? "completed" : "missing";
      row.deadline_at = row.approved_id || !period ? null : new Date(Date.now() + period * 86_400_000).toISOString();
      row.status_before_exempt = null;
      audit(row, "document.exemption_removed", { reason });
    }
    save();
    return { revision: row.revision };
  });

  route("POST", `${MANAGER_ROOT}/:requirementId/extend-deadline`, ({ params, body }) => {
    const row = rowFor(params.requirementId, false);
    reviewable(row);
    if (Number(body?.revision) !== row.revision) fail(409, "document changed; refresh required");
    const days = Number(body?.additional_days);
    const reason = String(body?.reason ?? "").trim();
    if (!Number.isInteger(days) || days < 1 || days > 3650 || !reason) fail(400, "extension days and reason required");
    const status = statusOf(row);
    if (!row.deadline_at || Date.parse(row.deadline_at) <= Date.now() || ["pending_review", "completed", "removed", "exempt", "paused"].includes(status))
      fail(400, "only an active deadline before suspension can be extended");
    const previous = row.deadline_at!;
    row.deadline_at = new Date(Date.parse(previous) + days * 86_400_000).toISOString();
    audit(row, "document.deadline_extended", { reason, previous_deadline: previous, new_deadline: row.deadline_at, additional_days: days });
    save();
    return { revision: row.revision };
  });

  route("POST", `${MANAGER_ROOT}/:requirementId/timezone`, ({ params }) => {
    const row = rowFor(params.requirementId, false);
    reviewable(row);
    // Everyone here works at a location, whose zone their documents use.
    fail(400, "This employee's documents use their primary location's time zone");
  });

  // ---------- one's own documents (Account > Documents, onboarding) ----------

  // Account > Documents lists every workspace the person belongs to; only
  // Harbor & Vine has documents in this demo.
  route("GET", SELF_ROOT, ({ params }) => {
    if (params.workspaceId !== WORKSPACE_ID) return [];
    const me = personByUser(actor().userId);
    if (!me) return [];
    return obligations().filter((row) => row.employee_id === me.id).map(obligationJson);
  });
  route("GET", `${SELF_ROOT}/:requirementId`, ({ params }) => {
    if (params.requirementId === "access") return { restricted: false };
    if (params.workspaceId !== WORKSPACE_ID) fail(404, "document unavailable");
    return detailJson(rowFor(params.requirementId, true), true);
  });
  route("GET", `${SELF_ROOT}/:requirementId/submissions/:submissionId/files/:fileId/download`, ({ params }) =>
    params.workspaceId !== WORKSPACE_ID ? fail(404, "document file unavailable") : download(rowFor(params.requirementId, true), params.submissionId, params.fileId));
}
