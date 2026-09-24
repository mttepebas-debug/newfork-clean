import {
  buildEmployeeOnboardingDocumentPrefix,
  employeeOnboardingDocumentBucket,
  employeeOnboardingDocumentMaxBytes,
  employeeOnboardingDocumentMimeTypes,
  employeeOnboardingDocumentSignedUrlTtlSeconds,
  employeeOnboardingManagerSchema,
  employeeOnboardingProfileSchema,
  employeeOnboardingSchema,
  isEmployeeOnboardingDocumentPath,
  type EmployeeOnboarding,
  type EmployeeOnboardingManager,
  type EmployeeOnboardingProfile,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createUserVerifier } from "../auth/verify-user.js";
import { rpcFailure } from "../http-error.js";
import { z } from "zod";

const mediaTypes = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export interface EmployeeOnboardingService {
  // workspaceId selects the case when the account onboards in several workspaces.
  get(accessToken: string, workspaceId?: string): Promise<EmployeeOnboarding>;
  saveProfile(
    accessToken: string,
    profile: EmployeeOnboardingProfile,
    revision: number,
    workspaceId?: string,
  ): Promise<number>;
  prepareDocumentUpload(
    accessToken: string,
    requirementId: string,
    filename: string,
    sizeBytes: number,
    workspaceId?: string,
  ): Promise<{ path: string; token: string }>;
  confirmDocument(
    accessToken: string,
    input: {
      requirementId: string;
      path: string;
      filename: string;
      sizeBytes: number;
      expiryDate: string | null;
      revision: number;
    },
  ): Promise<number>;
  acknowledge(
    accessToken: string,
    input: {
      requirementId: string;
      typedName: string;
      contentDigest: string;
      idempotencyKey: string;
      revision: number;
    },
  ): Promise<number>;
  submit(
    accessToken: string,
    revision: number,
    workspaceId?: string,
  ): Promise<number>;
  reset(accessToken: string, revision: number): Promise<number>;
  leave(
    accessToken: string,
    revision: number,
    workspaceId?: string,
  ): Promise<{
    status: "left";
    workspaceId: string;
    employeeId: string;
    membershipId: string;
    revision: number;
  }>;
  getReview(
    actorUserId: string,
    workspaceId: string,
    employeeId: string,
  ): Promise<EmployeeOnboardingManager | null>;
  getDocumentDownload(
    actorUserId: string,
    workspaceId: string,
    employeeId: string,
    requirementId: string,
  ): Promise<{ url: string; expiresIn: number }>;
  review(
    actorUserId: string,
    workspaceId: string,
    employeeId: string,
    input: {
      action: "accept_requirement" | "reject_requirement" | "activate";
      requirementId: string | null;
      reason: string;
      revision: number;
    },
  ): Promise<number>;
}

interface OnboardingServiceOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly productionReady: boolean;
  readonly ensureDevelopmentBucket?: boolean;
}

export function createEmployeeOnboardingService(
  options: OnboardingServiceOptions,
): EmployeeOnboardingService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async get(accessToken, workspaceId) {
      const user = await authenticatedUser(client, accessToken);
      const { data, error } = await client.rpc(
        "get_employee_onboarding_service",
        { target_user_id: user.id, ...workspaceArg(workspaceId) },
      );
      if (error) throw rpcFailure(error);
      return employeeOnboardingSchema.parse(data);
    },
    async saveProfile(accessToken, input, revision, workspaceId) {
      const user = await authenticatedUser(client, accessToken);
      const profile = employeeOnboardingProfileSchema.parse(input);
      return numericRpc(client, "save_employee_onboarding_profile_service", {
        target_user_id: user.id,
        profile_payload: profile,
        expected_revision: revision,
        ...workspaceArg(workspaceId),
      });
    },
    async prepareDocumentUpload(
      accessToken,
      requirementId,
      filename,
      sizeBytes,
      workspaceId,
    ) {
      const onboarding = await this.get(accessToken, workspaceId);
      const requirement = onboarding.requirements.find(
        (candidate) =>
          candidate.id === requirementId && candidate.kind === "document",
      );
      if (!requirement) throw new Error("Document requirement is unavailable");
      const format = extension(filename);
      if (!format || !requirement.accepted_formats.includes(format))
        throw new Error("This file format is not accepted");
      if (
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 1 ||
        sizeBytes > employeeOnboardingDocumentMaxBytes
      )
        throw new Error("Document must be smaller than 10 MB");
      if (options.ensureDevelopmentBucket) await ensurePrivateBucket(client);
      const prefix = buildEmployeeOnboardingDocumentPrefix({
        workspaceId: onboarding.workspace_id,
        employeeId: onboarding.employee_id,
        requirementId,
      });
      const path = `${prefix}/${crypto.randomUUID()}.${format === "jpeg" ? "jpg" : format}`;
      const { data, error } = await client.storage
        .from(employeeOnboardingDocumentBucket)
        .createSignedUploadUrl(path);
      if (error)
        throw new Error(
          `Private document storage unavailable: ${error.message}`,
        );
      return { path, token: data.token };
    },
    async confirmDocument(accessToken, input) {
      const user = await authenticatedUser(client, accessToken);
      const format = extension(input.filename);
      if (!format) throw new Error("Supported document format required");
      if (!isEmployeeOnboardingDocumentPath(input.path))
        throw new Error("Invalid private document upload path");
      const slash = input.path.lastIndexOf("/");
      const prefix = input.path.slice(0, slash);
      const storedName = input.path.slice(slash + 1);
      const { data: objects, error: objectError } = await client.storage
        .from(employeeOnboardingDocumentBucket)
        .list(prefix, { search: storedName, limit: 2 });
      if (objectError)
        throw new Error("Uploaded document could not be verified");
      const object = objects?.find(
        (candidate) => candidate.name === storedName,
      );
      if (!object) throw new Error("Uploaded document was not found");
      const metadata = object.metadata as
        { size?: number; mimetype?: string } | null | undefined;
      const actualSize = Number(metadata?.size ?? input.sizeBytes);
      const mediaType = mediaTypes[format];
      if (
        actualSize !== input.sizeBytes ||
        (metadata?.mimetype && metadata.mimetype !== mediaType)
      )
        throw new Error(
          "Uploaded document metadata does not match confirmation",
        );
      return numericRpc(client, "confirm_employee_document_service", {
        target_user_id: user.id,
        target_requirement_id: input.requirementId,
        storage_object_path: input.path,
        upload_filename: input.filename,
        upload_media_type: mediaType,
        upload_size_bytes: actualSize,
        upload_expiry_date: input.expiryDate,
        expected_revision: input.revision,
      });
    },
    async acknowledge(accessToken, input) {
      const user = await authenticatedUser(client, accessToken);
      const authenticatedAt = user.last_sign_in_at
        ? new Date(user.last_sign_in_at)
        : null;
      if (
        !authenticatedAt ||
        Date.now() - authenticatedAt.getTime() > 30 * 60 * 1000
      )
        throw new Error("Sign in again before acknowledging this document");
      return numericRpc(client, "acknowledge_employee_requirement_service", {
        target_user_id: user.id,
        target_requirement_id: input.requirementId,
        signer_name: input.typedName,
        expected_content_digest: input.contentDigest,
        authenticated_timestamp: authenticatedAt.toISOString(),
        request_idempotency_key: input.idempotencyKey,
        expected_revision: input.revision,
      });
    },
    async submit(accessToken, revision, workspaceId) {
      const user = await authenticatedUser(client, accessToken);
      return numericRpc(client, "submit_employee_onboarding_service", {
        target_user_id: user.id,
        expected_revision: revision,
        ...workspaceArg(workspaceId),
      });
    },
    async reset(accessToken, revision) {
      const user = await authenticatedUser(client, accessToken);
      return numericRpc(client, "reset_employee_onboarding_service", {
        target_user_id: user.id,
        expected_revision: revision,
      });
    },
    async leave(accessToken, revision, workspaceId) {
      const user = await authenticatedUser(client, accessToken);
      const body = await rpc(client, "leave_employee_onboarding_service", {
        target_user_id: user.id,
        expected_revision: revision,
        ...workspaceArg(workspaceId),
      });
      return leaveResultSchema.parse(body);
    },
    async getReview(actorUserId, workspaceId, employeeId) {
      const { data, error } = await client.rpc(
        "get_employee_onboarding_review_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_employee_id: employeeId,
        },
      );
      // The RPC deliberately uses the same result for absent and out-of-scope
      // cases. Neither should disclose case data or look like a service outage.
      if (
        error?.code === "P0002" &&
        error.message === "onboarding case unavailable"
      ) {
        return null;
      }
      if (error) throw rpcFailure(error);
      return employeeOnboardingManagerSchema.parse(data);
    },
    async getDocumentDownload(
      actorUserId,
      workspaceId,
      employeeId,
      requirementId,
    ) {
      const review = await this.getReview(actorUserId, workspaceId, employeeId);
      if (!review) throw new Error("Employee document is unavailable");
      const document = await client.rpc("get_employee_document_path_service", {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
        target_requirement_id: requirementId,
      });
      if (document.error || !document.data)
        throw new Error(
          document.error?.message ?? "Employee document is unavailable",
        );
      const expiresIn = employeeOnboardingDocumentSignedUrlTtlSeconds;
      const signed = await client.storage
        .from(employeeOnboardingDocumentBucket)
        .createSignedUrl(String(document.data), expiresIn, {
          download: true,
        });
      if (signed.error)
        throw new Error("Private document download is unavailable");
      return { url: signed.data.signedUrl, expiresIn };
    },
    async review(actorUserId, workspaceId, employeeId, input) {
      return numericRpc(client, "review_employee_onboarding_service", {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
        review_action: input.action,
        target_requirement_id: input.requirementId,
        review_reason: input.reason,
        expected_revision: input.revision,
        production_ready: options.productionReady,
      });
    },
  };
}

const leaveResultSchema = z
  .object({
    status: z.literal("left"),
    workspace_id: z.string().uuid(),
    employee_id: z.string().uuid(),
    membership_id: z.string().uuid(),
    revision: z.number().int().positive(),
  })
  .transform((row) => ({
    status: row.status,
    workspaceId: row.workspace_id,
    employeeId: row.employee_id,
    membershipId: row.membership_id,
    revision: row.revision,
  }));

async function authenticatedUser(client: SupabaseClient, accessToken: string) {
  const user = await createUserVerifier(client)(accessToken);
  if (!user) throw new Error("Valid authenticated account required");
  return user;
}

async function numericRpc(
  client: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
): Promise<number> {
  const data = await rpc(client, name, input);
  const value = Number(data);
  if (!Number.isSafeInteger(value))
    throw new Error("Invalid onboarding revision");
  return value;
}

async function rpc(
  client: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, input);
  if (error) throw rpcFailure(error);
  return data;
}

function extension(filename: string) {
  const value = filename.split(".").pop()?.toLowerCase();
  if (value === "jpg") return "jpeg" as const;
  if (
    value === "pdf" ||
    value === "jpeg" ||
    value === "png" ||
    value === "webp"
  )
    return value;
  return null;
}

async function ensurePrivateBucket(client: SupabaseClient): Promise<void> {
  const current = await client.storage.getBucket(
    employeeOnboardingDocumentBucket,
  );
  if (!current.error) return;
  const created = await client.storage.createBucket(
    employeeOnboardingDocumentBucket,
    {
      public: false,
      fileSizeLimit: employeeOnboardingDocumentMaxBytes,
      allowedMimeTypes: [...employeeOnboardingDocumentMimeTypes],
    },
  );
  if (created.error && !created.error.message.toLowerCase().includes("already"))
    throw new Error(
      `Private document bucket unavailable: ${created.error.message}`,
    );
}

// Omit the argument when absent so the RPC keeps its default case selection.
function workspaceArg(workspaceId: string | undefined) {
  return workspaceId ? { target_workspace_id: workspaceId } : {};
}
