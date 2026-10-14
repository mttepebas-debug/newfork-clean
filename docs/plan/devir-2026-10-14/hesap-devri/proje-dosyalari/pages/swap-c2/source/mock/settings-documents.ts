// Settings → Documents (document types: drafts, publication, archive, order)
// and Settings → Acknowledgements (retention policies, templates and their
// versions). The employees' own documents are the Employee Documents area's;
// this file owns the definitions. Logic follows save_document_type_*_service,
// preview/set_document_publication_service and the signature_* services.
import {
  defaultDocumentLifecycleSettings,
  documentTypeInputSchema,
  signatureRetentionPolicyInputSchema,
  signatureTemplateDraftInputSchema,
  type DocumentLifecycleSettings,
  type DocumentType,
  type SignatureTemplateVersion,
} from "@newfork/shared";
import type { Handler } from "./api";
import { catalogRows, fail, revisionOf } from "./settings-catalog";
import { nowIso, settings } from "./settings-store";
import { fingerprint } from "./time";
import { WORKSPACE_ID, world, type Employee } from "./world";

type Route = (method: string, path: string, handler: Handler) => void;
type Target = DocumentLifecycleSettings["target"];

const lower = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** The document types as Settings lists them (also for other areas: titles, rules). */
export function documentTypes(): DocumentType[] {
  return [...settings.data.document_types].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

// ---------- who a definition reaches ----------

function departmentOf(jobId: string): string | null {
  return (world.jobs.find((job) => job.id === jobId)?.department_id as string | null | undefined) ?? null;
}

export function targetMatches(employee: Employee, target: Target): boolean {
  const checks: boolean[] = [];
  if (target.location_ids.length) checks.push(employee.location_ids.some((id) => target.location_ids.includes(id)));
  if (target.department_ids.length) checks.push(employee.job_ids.some((id) => target.department_ids.includes(departmentOf(id) ?? "")));
  if (target.job_ids.length) checks.push(employee.job_ids.some((id) => target.job_ids.includes(id)));
  if (target.employee_ids.length) checks.push(target.employee_ids.includes(employee.id));
  if (!checks.length) return true;
  return target.operator === "or" ? checks.some(Boolean) : checks.every(Boolean);
}

function targetOptions() {
  return {
    locations: catalogRows("locations").filter((row) => !row.archived_at)
      .map((row) => ({ id: String(row.id), name: String(row.name) })).sort((a, b) => a.name.localeCompare(b.name)),
    departments: catalogRows("departments").filter((row) => !row.archived_at)
      .map((row) => ({ id: String(row.id), name: String(row.name) })).sort((a, b) => lower(a.name).localeCompare(lower(b.name))),
    jobs: catalogRows("jobs").filter((row) => !row.archived_at)
      .map((row) => ({ id: String(row.id), name: String(row.name), department_id: (row.department_id as string | null) ?? null }))
      .sort((a, b) => lower(a.name).localeCompare(lower(b.name))),
    employees: world.employees.map((employee) => ({ id: employee.id, name: employee.display_name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function assertTarget(target: Target): void {
  const options = targetOptions();
  const known = (ids: string[], list: { id: string }[]) => ids.every((id) => list.some((item) => item.id === id));
  if (!known(target.location_ids, options.locations) || !known(target.department_ids, options.departments) ||
    !known(target.job_ids, options.jobs) || !known(target.employee_ids, options.employees))
    fail(400, "Choose active locations, departments, jobs and people", { reason: "document.target_unavailable" });
}

/** Whom a published definition was given to; a seeded one reached everyone it matched. */
function assignedTo(sourceId: string, lifecycle: DocumentLifecycleSettings | null | undefined): string[] {
  const saved = settings.data.assigned[sourceId];
  if (saved) return saved;
  return lifecycle ? world.employees.filter((employee) => targetMatches(employee, lifecycle.target)).map((employee) => employee.id) : [];
}

interface Effect {
  employee_id: string;
  employee_name: string;
  employee_revision: number;
  requirement_id: string | null;
  revision: number | null;
  action: "assign" | "update" | "reopen" | "remove" | "unchanged" | "exempt" | "pause";
  deadline_action: "preserve" | "restart" | "clear" | "pause";
  matches_target?: boolean;
}

/** preview_lifecycle_definition: what saving or publishing a definition does to each person. */
function lifecycleEffects(sourceId: string, lifecycle: DocumentLifecycleSettings, published: boolean, archived: boolean): Effect[] {
  const already = published ? new Set(assignedTo(sourceId, lifecycle)) : new Set<string>();
  return [...world.employees].sort((a, b) => a.id.localeCompare(b.id)).map((employee) => {
    const matches = !archived && targetMatches(employee, lifecycle.target);
    const has = already.has(employee.id);
    const action: Effect["action"] = matches && !has
      ? (lifecycle.assignment_scope === "all_active" ? "assign" : "unchanged")
      : !matches && has ? "remove" : "unchanged";
    return {
      employee_id: employee.id,
      employee_name: employee.display_name,
      employee_revision: revisionOf(employee.id),
      requirement_id: null,
      revision: null,
      action,
      deadline_action: action === "remove" || lifecycle.mode === "optional" ? "clear" : action === "assign" ? "restart" : "preserve",
    };
  });
}

function identities(target: Target) {
  const options = targetOptions();
  const pick = (ids: string[], list: { id: string; name: string }[], allWhenEmpty: boolean) =>
    (ids.length ? list.filter((item) => ids.includes(item.id)) : allWhenEmpty ? list : []).map(({ id, name }) => ({ id, name }));
  return {
    locations: pick(target.location_ids, options.locations, true),
    departments: pick(target.department_ids, options.departments, true),
    jobs: pick(target.job_ids, options.jobs, true),
    named_people: pick(target.employee_ids, options.employees, false),
  };
}

// ---------- document types ----------

function findType(id: string): DocumentType {
  const type = settings.data.document_types.find((item) => item.id === id);
  if (!type) fail(404, "document type not found");
  return type;
}

function saveDocumentType(id: string | null, body: unknown): string {
  const parsed = documentTypeInputSchema.safeParse(body);
  if (!parsed.success) fail(400, "Valid document type details required");
  const input = parsed.data;
  const lifecycle: DocumentLifecycleSettings = {
    ...(input.lifecycle_settings ?? { ...defaultDocumentLifecycleSettings, mode: input.required_at_onboarding ? "required" : "optional" }),
    assignment_scope: "all_active",
  };
  const existing = id ? findType(id) : null;
  if (!existing && lifecycle.target.employee_ids.length) fail(400, "Individual document assignment is not supported");
  if (existing && JSON.stringify(existing.lifecycle_settings?.target.employee_ids ?? []) !== JSON.stringify(lifecycle.target.employee_ids))
    fail(400, "Legacy named targets must be preserved");
  assertTarget(lifecycle.target);
  const period = lifecycle.period_days;
  if ((period !== null && (period < 1 || period > 3650)) || (lifecycle.mode === "conditional" && period === null) ||
    (lifecycle.suspend_on_overdue && (lifecycle.mode === "optional" || period === null)))
    fail(400, "valid document period required");
  if (existing && existing.lifecycle_revision !== input.lifecycle_revision) fail(409, "document type changed; refresh required");
  const title = input.title.trim();
  if (settings.data.document_types.some((item) => item.id !== id && !item.archived_at && lower(item.title) === lower(title)))
    fail(409, "A document with this title already exists. Choose another title.");
  const values = {
    title, description: input.description.trim(), required_at_onboarding: lifecycle.mode === "required",
    requires_review: input.requires_review, accepted_formats: input.accepted_formats, tracks_expiry: input.tracks_expiry,
    expiry_warning_days: input.expiry_warning_days, expiry_schedule_impact: "track_only" as const, lifecycle_settings: lifecycle,
  };
  if (existing) {
    Object.assign(existing, values, { lifecycle_revision: (existing.lifecycle_revision ?? 1) + 1 });
    settings.save();
    return existing.id;
  }
  const created: DocumentType = {
    id: crypto.randomUUID(), workspace_id: WORKSPACE_ID, archived_at: null, ...values, lifecycle_revision: 1,
    sort_order: Math.max(-1, ...settings.data.document_types.map((item) => item.sort_order)) + 1,
    publication_status: "draft", publication_revision: 1, published_at: null,
  };
  settings.data.document_types.push(created);
  settings.save();
  return created.id;
}

function publicationPreview(id: string) {
  const type = findType(id);
  if (type.archived_at) fail(409, "Archived documents cannot be published; restore first");
  const lifecycle = type.lifecycle_settings ?? defaultDocumentLifecycleSettings;
  assertTarget(lifecycle.target);
  const published = type.publication_status === "published";
  let employees: Effect[];
  if (published) {
    const reached = new Set(assignedTo(type.id, lifecycle));
    employees = world.employees.filter((employee) => reached.has(employee.id)).sort((a, b) => a.id.localeCompare(b.id))
      .map((employee) => ({
        employee_id: employee.id, employee_name: employee.display_name, employee_revision: revisionOf(employee.id),
        requirement_id: null, revision: null, action: "pause", deadline_action: "pause",
      }));
  } else {
    employees = lifecycleEffects(type.id, lifecycle, false, false);
  }
  employees = employees.map((effect) => ({
    ...effect, matches_target: targetMatches(world.employees.find((employee) => employee.id === effect.employee_id)!, lifecycle.target),
  }));
  const result = {
    revision: type.lifecycle_revision ?? 1,
    employees,
    ...identities(lifecycle.target),
    publication_revision: type.publication_revision ?? 1,
    target: lifecycle.target,
    assignment_scope: lifecycle.assignment_scope,
    transition: published ? "unpublish" : "publish",
  };
  return { ...result, preview_token: fingerprint(JSON.stringify({ type, result })) };
}

function setPublication(id: string, body: Record<string, unknown>, status: "published" | "draft") {
  const reason = String(body.reason ?? "").trim();
  if (!reason || reason.length > 500 || typeof body.preview_token !== "string") fail(400, "A current publication preview and reason are required");
  const type = findType(id);
  if (type.lifecycle_revision !== body.revision || type.publication_revision !== body.publication_revision || type.publication_status === status)
    fail(409, "Document publication changed; refresh required");
  const preview = publicationPreview(id);
  if (preview.preview_token !== body.preview_token) fail(409, "Document publication impact changed; refresh preview");
  const revision = (type.publication_revision ?? 1) + 1;
  if (status === "published") {
    const lifecycle = type.lifecycle_settings ?? defaultDocumentLifecycleSettings;
    settings.data.assigned[type.id] = world.employees.filter((employee) => targetMatches(employee, lifecycle.target)).map((employee) => employee.id);
    Object.assign(type, { publication_status: "published", publication_revision: revision, published_at: nowIso() });
    settings.save();
    return { applied: preview.employees.filter((effect) => effect.action === "assign").length, publication_status: status, publication_revision: revision };
  }
  Object.assign(type, { publication_status: "draft", publication_revision: revision });
  settings.save();
  return { paused: preview.employees.length, publication_status: status, publication_revision: revision };
}

// ---------- acknowledgements ----------

function draftVersion(templateId: string): SignatureTemplateVersion | undefined {
  return settings.data.signature_versions.find((version) => version.template_id === templateId && version.status === "draft");
}

function saveTemplateDraft(templateId: string | null, body: unknown): string {
  const parsed = signatureTemplateDraftInputSchema.safeParse(body);
  if (!parsed.success) fail(400, "Valid acknowledgement template required");
  const input = parsed.data;
  const lifecycle = input.lifecycle_settings ?? null;
  if (lifecycle) {
    if (!["optional", "required"].includes(lifecycle.mode)) fail(400, "valid policy assignment settings required");
    assertTarget(lifecycle.target);
    const period = lifecycle.period_days;
    if ((period !== null && (period < 1 || period > 3650)) || (lifecycle.suspend_on_overdue && (lifecycle.mode === "optional" || period === null)))
      fail(400, "valid policy delivery period required");
  }
  const content = input.content_text.replace(/\r\n?/g, "\n");
  if (!settings.data.retention_policies.some((policy) => policy.id === input.retention_policy_id && !policy.archived_at))
    fail(400, "active retention policy required");
  const required = lifecycle ? lifecycle.mode === "required" : input.required_at_onboarding;
  const blocks = lifecycle ? lifecycle.mode === "required" : input.blocks_activation;
  if (blocks && !required) fail(400, "activation blocking requires onboarding assignment");
  const name = input.title.trim();
  let template = templateId ? settings.data.signature_templates.find((item) => item.id === templateId) : undefined;
  if (templateId && (!template || template.archived_at)) fail(404, "active acknowledgement template not found");
  const draft = template ? draftVersion(template.id) : undefined;
  if (lifecycle && draft && draft.lifecycle_revision !== input.lifecycle_revision) fail(409, "policy draft changed; refresh required");
  if (!template) {
    template = { id: crypto.randomUUID(), workspace_id: WORKSPACE_ID, name, archived_at: null };
    settings.data.signature_templates.push(template);
  } else {
    template.name = name;
  }
  const values = {
    title: name, summary: input.summary.trim(), content_text: content, content_digest: fingerprint(content),
    intent_statement: input.intent_statement.trim(), locale: input.locale, effective_date: input.effective_date,
    required_at_onboarding: required, blocks_activation: blocks, retention_policy_id: input.retention_policy_id,
  };
  if (draft) {
    Object.assign(draft, values);
    if (lifecycle) Object.assign(draft, { lifecycle_settings: lifecycle, lifecycle_revision: (draft.lifecycle_revision ?? 0) + 1 });
  } else {
    const latest = settings.data.signature_versions.filter((version) => version.template_id === template!.id)
      .sort((a, b) => b.version_number - a.version_number)[0];
    settings.data.signature_versions.push({
      id: crypto.randomUUID(), workspace_id: WORKSPACE_ID, template_id: template.id,
      version_number: (latest?.version_number ?? 0) + 1, execution_class: "acknowledgement", status: "draft", published_at: null,
      ...values,
      lifecycle_settings: lifecycle ?? latest?.lifecycle_settings ?? null,
      lifecycle_revision: lifecycle ? 1 : latest?.lifecycle_revision ?? 1,
    });
  }
  settings.save();
  return template.id;
}

function findVersion(versionId: string): SignatureTemplateVersion {
  const version = settings.data.signature_versions.find((item) => item.id === versionId);
  if (!version) fail(404, "acknowledgement version not found");
  return version;
}

function policyPreview(versionId: string) {
  const version = findVersion(versionId);
  const lifecycle = version.lifecycle_settings ?? { ...defaultDocumentLifecycleSettings, mode: version.required_at_onboarding ? "required" as const : "optional" as const };
  const template = settings.data.signature_templates.find((item) => item.id === version.template_id);
  const employees = lifecycleEffects(version.id, lifecycle, Boolean(settings.data.assigned[version.id]), Boolean(template?.archived_at));
  const revision = version.lifecycle_revision ?? 1;
  return { revision, employees, preview_token: fingerprint(JSON.stringify({ version, employees })) };
}

// ---------- routes ----------

export function documentsSettingsRoutes(route: Route): void {
  const ws = "/v1/workspaces/:workspaceId";

  route("GET", `${ws}/settings/document-types`, () => documentTypes());
  route("GET", `${ws}/settings/acknowledgements`, () => ({
    policies: [...settings.data.retention_policies].sort((a, b) => a.name.localeCompare(b.name)),
    templates: [...settings.data.signature_templates].sort((a, b) => a.name.localeCompare(b.name)),
    versions: [...settings.data.signature_versions].sort((a, b) => b.version_number - a.version_number || a.id.localeCompare(b.id)),
  }));

  // Document types.
  route("GET", `${ws}/document-types/target-options`, () => targetOptions());
  route("POST", `${ws}/document-types/reorder`, ({ body }) => {
    const ids = (body?.orderedIds ?? []) as string[];
    if (new Set(ids).size !== ids.length || ids.some((id) => !settings.data.document_types.some((type) => type.id === id)))
      fail(400, "Valid order required");
    ids.forEach((id, index) => { findType(id).sort_order = index; });
    settings.save();
    return undefined;
  });
  route("POST", `${ws}/document-types`, ({ body }) => ({ id: saveDocumentType(null, body) }));
  route("PUT", `${ws}/document-types/:documentTypeId`, ({ params, body }) => ({ id: saveDocumentType(params.documentTypeId, body) }));
  route("PATCH", `${ws}/document-types/:documentTypeId/archive`, ({ params, body }) => {
    if (typeof body?.archived !== "boolean") fail(400, "Valid archive state required");
    const type = findType(params.documentTypeId);
    if (!body.archived && settings.data.document_types.some((item) => item.id !== type.id && !item.archived_at && lower(item.title) === lower(type.title)))
      fail(409, "A document with this title already exists. Choose another title.");
    type.archived_at = body.archived ? nowIso() : null;
    settings.save();
    return undefined;
  });
  route("POST", `${ws}/document-types/:documentTypeId/publication-preview`, ({ params }) => publicationPreview(params.documentTypeId));
  route("POST", `${ws}/document-types/:documentTypeId/publish`, ({ params, body }) => setPublication(params.documentTypeId, body ?? {}, "published"));
  route("POST", `${ws}/document-types/:documentTypeId/unpublish`, ({ params, body }) => setPublication(params.documentTypeId, body ?? {}, "draft"));

  // Retention policies.
  const policy = (id: string) => {
    const found = settings.data.retention_policies.find((item) => item.id === id);
    if (!found) fail(404, "retention policy not found");
    return found;
  };
  const savePolicy = (id: string | null, body: unknown) => {
    const parsed = signatureRetentionPolicyInputSchema.safeParse(body);
    if (!parsed.success) fail(400, "Valid retention policy required");
    const values = {
      name: parsed.data.name.trim(), retention_trigger: parsed.data.retention_trigger, duration_days: parsed.data.duration_days,
      jurisdiction_scope: parsed.data.jurisdiction_scope.trim(), authority_reference: parsed.data.authority_reference.trim(),
    };
    if (id) {
      const found = settings.data.retention_policies.find((item) => item.id === id && item.status === "draft");
      if (!found) fail(404, "editable retention policy not found");
      Object.assign(found, values);
    } else {
      id = crypto.randomUUID();
      settings.data.retention_policies.push({ id, workspace_id: WORKSPACE_ID, ...values, status: "draft", approved_at: null, archived_at: null });
    }
    settings.save();
    return { id };
  };
  route("POST", `${ws}/signature-retention-policies`, ({ body }) => savePolicy(null, body));
  route("PUT", `${ws}/signature-retention-policies/:policyId`, ({ params, body }) => savePolicy(params.policyId, body));
  route("POST", `${ws}/signature-retention-policies/:policyId/approve`, ({ params }) => {
    const found = policy(params.policyId);
    if (found.status !== "draft" || found.archived_at) fail(404, "approvable retention policy not found");
    Object.assign(found, { status: "approved", approved_at: nowIso() });
    settings.save();
    return undefined;
  });
  route("POST", `${ws}/signature-retention-policies/:policyId/unapprove`, ({ params }) => {
    const found = policy(params.policyId);
    if (found.status !== "approved" || found.archived_at) fail(404, "approved retention policy not found");
    Object.assign(found, { status: "draft", approved_at: null });
    settings.save();
    return undefined;
  });
  route("PATCH", `${ws}/signature-retention-policies/:policyId/archive`, ({ params, body }) => {
    if (typeof body?.archived !== "boolean") fail(400, "Valid archive state required");
    policy(params.policyId).archived_at = body.archived ? nowIso() : null;
    settings.save();
    return undefined;
  });

  // Acknowledgement templates and their versions.
  route("GET", `${ws}/signature-templates/target-options`, () => targetOptions());
  route("POST", `${ws}/signature-templates`, ({ body }) => ({ id: saveTemplateDraft(null, body) }));
  route("PUT", `${ws}/signature-templates/:templateId/draft`, ({ params, body }) => ({ id: saveTemplateDraft(params.templateId, body) }));
  route("POST", `${ws}/signature-templates/:templateId/publish`, ({ params }) => {
    const template = settings.data.signature_templates.find((item) => item.id === params.templateId && !item.archived_at);
    const draft = template ? draftVersion(template.id) : undefined;
    if (!draft) fail(404, "publishable acknowledgement draft not found");
    if (!settings.data.retention_policies.some((item) => item.id === draft.retention_policy_id && item.status === "approved" && !item.archived_at))
      fail(400, "approved active retention policy required for publication");
    Object.assign(draft, { status: "published", published_at: nowIso() });
    settings.save();
    return undefined;
  });
  route("POST", `${ws}/signature-templates/:templateId/unpublish`, ({ params }) => {
    const template = settings.data.signature_templates.find((item) => item.id === params.templateId && !item.archived_at);
    const published = settings.data.signature_versions
      .filter((version) => version.template_id === template?.id && version.status === "published")
      .sort((a, b) => b.version_number - a.version_number)[0];
    if (!published) fail(404, "published acknowledgement template not found");
    if (draftVersion(published.template_id)) fail(409, "draft acknowledgement already exists");
    Object.assign(published, { status: "draft", published_at: null });
    settings.save();
    return undefined;
  });
  route("PATCH", `${ws}/signature-templates/:templateId/archive`, ({ params, body }) => {
    if (typeof body?.archived !== "boolean") fail(400, "Valid archive state required");
    const template = settings.data.signature_templates.find((item) => item.id === params.templateId);
    if (!template) fail(404, "acknowledgement template not found");
    template.archived_at = body.archived ? nowIso() : null;
    settings.save();
    return undefined;
  });
  route("POST", `${ws}/signature-versions/:versionId/preview`, ({ params }) => policyPreview(params.versionId));
  route("POST", `${ws}/signature-versions/:versionId/apply`, ({ params, body }) => {
    const reason = String(body?.reason ?? "").trim();
    if (!reason || typeof body?.preview_token !== "string" || typeof body?.revision !== "number") fail(400, "Valid policy application required");
    const preview = policyPreview(params.versionId);
    if (preview.revision !== body.revision) fail(409, "Policy changed; refresh required");
    if (preview.preview_token !== body.preview_token) fail(409, "Policy impact changed; refresh preview");
    const version = findVersion(params.versionId);
    const reached = new Set(assignedTo(version.id, null));
    for (const effect of preview.employees) {
      if (effect.action === "assign") reached.add(effect.employee_id);
      if (effect.action === "remove") reached.delete(effect.employee_id);
    }
    settings.data.assigned[version.id] = [...reached];
    settings.save();
    return { applied: preview.employees.filter((effect) => effect.action !== "unchanged").length };
  });
}
