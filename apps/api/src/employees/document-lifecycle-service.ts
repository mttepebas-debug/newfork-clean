import {
  buildEmployeeOnboardingDocumentPrefix,
  documentDetailSchema,
  documentObligationSchema,
  documentAcknowledgeCommandSchema,
  documentAssignmentImpactSchema,
  type DocumentAssignmentImpact,
  documentReviewCommandSchema,
  documentSubmitCommandSchema,
  employeeOnboardingDocumentBucket,
  employeeOnboardingDocumentMaxBytes,
  employeeOnboardingDocumentSignedUrlTtlSeconds,
  isEmployeeOnboardingDocumentPath,
  type DocumentDetail,
  type DocumentObligation,
  type DocumentReviewCommand,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createUserVerifier } from "../auth/verify-user.js";
import { HttpError, rpcFailure } from "../http-error.js";

export interface DocumentAudience {
  workspaceId: string;
  selfOnly: boolean;
}
export interface DocumentFileInput {
  path: string;
  filename: string;
  sizeBytes: number;
  revision: number;
}
export interface DocumentLifecycleService {
  access(token: string, workspaceId: string): Promise<{ restricted: boolean }>;
  assignmentPreview(
    token: string,
    workspaceId: string,
    employeeId: string,
    input: { location_ids: string[]; job_ids: string[] },
  ): Promise<DocumentAssignmentImpact>;
  extendDeadline(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: { revision: number; additional_days: number; reason: string },
  ): Promise<number>;
  removeDraftFile(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: { revision: number; submission_id: string; file_id: string },
  ): Promise<number>;
  withdraw(
    token: string,
    workspaceId: string,
    requirementId: string,
    revision: number,
  ): Promise<number>;
  acknowledge(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: z.infer<typeof documentAcknowledgeCommandSchema>,
  ): Promise<number>;
  list(
    token: string,
    audience: DocumentAudience,
  ): Promise<DocumentObligation[]>;
  detail(
    token: string,
    audience: DocumentAudience,
    requirementId: string,
  ): Promise<DocumentDetail>;
  prepareUpload(
    token: string,
    workspaceId: string,
    requirementId: string,
    filename: string,
    sizeBytes: number,
  ): Promise<{ path: string; token: string }>;
  confirmUpload(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: DocumentFileInput,
  ): Promise<number>;
  submit(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: z.infer<typeof documentSubmitCommandSchema>,
  ): Promise<number>;
  review(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: DocumentReviewCommand,
  ): Promise<number>;
  exemption(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: { revision: number; exempt: boolean; reason: string },
  ): Promise<number>;
  setTimezone(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: { employee_revision: number; timezone: string },
  ): Promise<number>;
  defer(
    token: string,
    workspaceId: string,
    requirementId: string,
    input: { revision: number; reason: string },
  ): Promise<number>;
  download(
    token: string,
    audience: DocumentAudience,
    requirementId: string,
    submissionId: string,
    fileId: string,
  ): Promise<{ url: string; expiresIn: number }>;
}

const formats = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;
function fileFormat(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  const format = extension === "jpg" ? "jpeg" : extension;
  return format && format in formats ? (format as keyof typeof formats) : null;
}

/** Detects obvious type mismatches; this is not malware scanning or conversion. */
export function documentBytesMatchFormat(
  bytes: Uint8Array,
  format: keyof typeof formats,
): boolean {
  const text = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (format === "pdf") return text(0, 5) === "%PDF-";
  if (format === "jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (format === "png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
  return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
}

export function createDocumentLifecycleService(options: {
  url: string;
  serviceRoleKey: string;
}): DocumentLifecycleService {
  return createDocumentLifecycleServiceWithClient(
    createClient(options.url, options.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  );
}
export function createDocumentLifecycleServiceWithClient(
  client: SupabaseClient,
): DocumentLifecycleService {
  const verifyUser = createUserVerifier(client);
  async function currentUser(token: string) {
    const user = await verifyUser(token);
    if (!user)
      throw new HttpError("A current authenticated account is required", 401);
    return user;
  }
  async function actor(token: string) {
    return (await currentUser(token)).id;
  }
  async function rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  async function detailFor(
    actorUserId: string,
    audience: DocumentAudience,
    requirementId: string,
  ) {
    return documentDetailSchema.parse(
      await rpc("get_employee_document_lifecycle_service", {
        actor_user_id: actorUserId,
        target_workspace_id: audience.workspaceId,
        target_requirement_id: requirementId,
        self_only: audience.selfOnly,
      }),
    );
  }
  const numeric = (value: unknown) => z.number().int().positive().parse(value);
  return {
    async access(token, workspaceId) {
      return z.object({ restricted: z.boolean() }).parse(
        await rpc("get_employee_document_access_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
        }),
      );
    },
    async assignmentPreview(token, workspaceId, employeeId, input) {
      return documentAssignmentImpactSchema.parse(
        await rpc("preview_employee_document_assignments_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
          target_employee_id: employeeId,
          proposed_location_ids: input.location_ids,
          proposed_job_ids: input.job_ids,
        }),
      );
    },
    async extendDeadline(token, workspaceId, requirementId, input) {
      return numeric(
        await rpc("extend_employee_document_deadline_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          additional_days: input.additional_days,
          extension_reason: input.reason,
        }),
      );
    },
    async removeDraftFile(token, workspaceId, requirementId, input) {
      return numeric(
        await rpc("remove_employee_document_draft_file_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          target_submission_id: input.submission_id,
          target_file_id: input.file_id,
        }),
      );
    },
    async withdraw(token, workspaceId, requirementId, revision) {
      return numeric(
        await rpc("withdraw_document_acknowledgement_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
          target_requirement_id: requirementId,
          expected_revision: revision,
        }),
      );
    },
    async acknowledge(token, workspaceId, requirementId, value) {
      const user = await currentUser(token);
      const authenticatedAt = Date.parse(user.last_sign_in_at ?? "");
      if (
        !Number.isFinite(authenticatedAt) ||
        Date.now() - authenticatedAt > 30 * 60 * 1000
      )
        throw new HttpError("Sign in again before acknowledging this policy", 400);
      await detailFor(
        user.id,
        { workspaceId, selfOnly: true },
        requirementId,
      );
      const input = documentAcknowledgeCommandSchema.parse(value);
      return numeric(
        await rpc("acknowledge_document_lifecycle_service", {
          actor_user_id: user.id,
          target_workspace_id: workspaceId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          signer_name: input.typed_name,
          expected_content_digest: input.content_digest,
          authenticated_timestamp: new Date(authenticatedAt).toISOString(),
          request_idempotency_key: input.idempotency_key,
        }),
      );
    },
    async list(token, audience) {
      return documentObligationSchema.array().parse(
        await rpc("list_employee_document_lifecycle_service", {
          actor_user_id: await actor(token),
          target_workspace_id: audience.workspaceId,
          self_only: audience.selfOnly,
        }),
      );
    },
    async detail(token, audience, requirementId) {
      return detailFor(await actor(token), audience, requirementId);
    },
    async prepareUpload(
      token,
      workspaceId,
      requirementId,
      filename,
      sizeBytes,
    ) {
      const detail = await detailFor(
        await actor(token),
        { workspaceId, selfOnly: true },
        requirementId,
      );
      const format = fileFormat(filename);
      if (!format || !detail.obligation.accepted_formats.includes(format))
        throw new HttpError("This file format is not accepted", 400);
      if (
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 1 ||
        sizeBytes > employeeOnboardingDocumentMaxBytes
      )
        throw new HttpError("File must be at most 10 MiB", 400);
      // BL-118: the owner's excused document stays open to a voluntary upload
      // (exemption_locked marks the owner's row); any other exemption is closed.
      const ownerExcused =
        detail.obligation.status === "exempt" && detail.obligation.exemption_locked === true;
      if (
        detail.obligation.publication_paused ||
        (!ownerExcused && ["removed", "exempt", "paused"].includes(detail.obligation.status))
      )
        throw new HttpError("This obligation is closed", 400);
      const prefix = buildEmployeeOnboardingDocumentPrefix({
        workspaceId,
        employeeId: detail.obligation.employee_id,
        requirementId,
      });
      const path = `${prefix}/${crypto.randomUUID()}.${format === "jpeg" ? "jpg" : format}`;
      const { data, error } = await client.storage
        .from(employeeOnboardingDocumentBucket)
        .createSignedUploadUrl(path);
      if (error)
        throw new HttpError("Private upload is unavailable", 503);
      return { path, token: data.token };
    },
    async confirmUpload(token, workspaceId, requirementId, input) {
      const actorUserId = await actor(token);
      const detail = await detailFor(
        actorUserId,
        { workspaceId, selfOnly: true },
        requirementId,
      );
      const prefix = buildEmployeeOnboardingDocumentPrefix({
        workspaceId,
        employeeId: detail.obligation.employee_id,
        requirementId,
      });
      const format = fileFormat(input.filename);
      if (
        !format ||
        !isEmployeeOnboardingDocumentPath(input.path) ||
        !input.path.startsWith(`${prefix}/`) ||
        !detail.obligation.accepted_formats.includes(format)
      )
        throw new HttpError("Invalid private upload", 400);
      // Read the stored object, never trust the client-reported byte count or MIME.
      const { data, error } = await client.storage
        .from(employeeOnboardingDocumentBucket)
        .download(input.path);
      if (error || !data)
        throw new HttpError("Uploaded file could not be verified", 400);
      if (
        data.size !== input.sizeBytes ||
        data.size < 1 ||
        data.size > employeeOnboardingDocumentMaxBytes ||
        (data.type && data.type !== formats[format]) ||
        !documentBytesMatchFormat(
          new Uint8Array(await data.slice(0, 12).arrayBuffer()),
          format,
        )
      )
        throw new HttpError("File content does not match its declared format or size", 400);
      return numeric(
        await rpc("save_employee_document_draft_file_service", {
          actor_user_id: actorUserId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          storage_object_path: input.path,
          upload_filename: input.filename,
          upload_media_type: formats[format],
          upload_size_bytes: data.size,
        }),
      );
    },
    async submit(token, workspaceId, requirementId, value) {
      const actorUserId = await actor(token);
      await detailFor(
        actorUserId,
        { workspaceId, selfOnly: true },
        requirementId,
      );
      const input = documentSubmitCommandSchema.parse(value);
      return numeric(
        await rpc("submit_employee_document_lifecycle_service", {
          actor_user_id: actorUserId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          target_submission_id: input.submission_id,
          submission_expiry: input.expiry_date,
          submission_metadata: input.metadata,
        }),
      );
    },
    async review(token, workspaceId, requirementId, value) {
      const input = documentReviewCommandSchema.parse(value);
      return numeric(
        await rpc("review_employee_document_lifecycle_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          target_submission_id: input.submission_id,
          review_decision: input.decision,
          review_reason: input.reason,
          correction_period: input.correction_period,
          file_decisions: input.files,
        }),
      );
    },
    async exemption(token, workspaceId, requirementId, input) {
      return numeric(
        await rpc("set_employee_document_exemption_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          make_exempt: input.exempt,
          exemption_reason: input.reason,
        }),
      );
    },
    async setTimezone(token, workspaceId, requirementId, input) {
      return numeric(
        await rpc("set_employee_document_timezone_service", {
          actor_user_id: await actor(token),
          target_workspace_id: workspaceId,
          target_requirement_id: requirementId,
          expected_employee_revision: input.employee_revision,
          reference_timezone: input.timezone,
        }),
      );
    },
    async defer(token, workspaceId, requirementId, input) {
      const actorUserId = await actor(token);
      await detailFor(
        actorUserId,
        { workspaceId, selfOnly: true },
        requirementId,
      );
      return numeric(
        await rpc("defer_initial_employee_document_service", {
          actor_user_id: actorUserId,
          target_requirement_id: requirementId,
          expected_revision: input.revision,
          deferral_reason: input.reason,
        }),
      );
    },
    async download(token, audience, requirementId, submissionId, fileId) {
      const path = z.string().parse(
        await rpc("get_employee_document_lifecycle_path_service", {
          actor_user_id: await actor(token),
          target_workspace_id: audience.workspaceId,
          target_requirement_id: requirementId,
          target_submission_id: submissionId,
          target_file_id: fileId,
          self_only: audience.selfOnly,
        }),
      );
      const expiresIn = employeeOnboardingDocumentSignedUrlTtlSeconds;
      const { data, error } = await client.storage
        .from(employeeOnboardingDocumentBucket)
        .createSignedUrl(path, expiresIn, { download: true });
      if (error)
        throw new HttpError("Private download is unavailable", 503);
      return { url: data.signedUrl, expiresIn };
    },
  };
}
