import {
  employeeAvailabilityInputSchema,
  employeeOnboardingManagerSchema,
  employeeOnboardingProfileSchema,
  employeeOnboardingSchema,
  type EmployeeAvailabilityInput,
  type EmployeeOnboarding,
  type EmployeeOnboardingManager,
  type EmployeeOnboardingProfile,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SsnEncryptionService } from "./ssn-encryption";

const documentBucket = "employee-onboarding";
const mediaTypes = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export interface EmployeeOnboardingService {
  get(accessToken: string): Promise<EmployeeOnboarding>;
  saveProfile(
    accessToken: string,
    profile: EmployeeOnboardingProfile,
    revision: number,
  ): Promise<number>;
  saveSsn(accessToken: string, ssn: string, revision: number): Promise<number>;
  saveAvailability(
    accessToken: string,
    availability: EmployeeAvailabilityInput,
    revision: number,
  ): Promise<number>;
  prepareDocumentUpload(
    accessToken: string,
    requirementId: string,
    filename: string,
    sizeBytes: number,
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
  submit(accessToken: string, revision: number): Promise<number>;
  getReview(
    actorUserId: string,
    workspaceId: string,
    employeeId: string,
  ): Promise<EmployeeOnboardingManager>;
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
  readonly encryption: SsnEncryptionService;
  readonly environment: string;
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
    async get(accessToken) {
      const user = await authenticatedUser(client, accessToken);
      const { data, error } = await client.rpc(
        "get_employee_onboarding_service",
        { target_user_id: user.id },
      );
      if (error) throw new Error(error.message);
      return employeeOnboardingSchema.parse(data);
    },
    async saveProfile(accessToken, input, revision) {
      const user = await authenticatedUser(client, accessToken);
      const profile = employeeOnboardingProfileSchema.parse(input);
      return numericRpc(client, "save_employee_onboarding_profile_service", {
        target_user_id: user.id,
        profile_payload: profile,
        expected_revision: revision,
      });
    },
    async saveSsn(accessToken, ssn, revision) {
      const user = await authenticatedUser(client, accessToken);
      const onboarding = await this.get(accessToken);
      const envelope = await options.encryption.encrypt(ssn, {
        workspaceId: onboarding.workspace_id,
        employeeId: onboarding.employee_id,
        environment: options.environment,
      });
      return numericRpc(client, "save_employee_ssn_envelope_service", {
        target_user_id: user.id,
        encrypted_ciphertext: envelope.ciphertext,
        encrypted_key: envelope.encryptedDataKey,
        encrypted_nonce: envelope.nonce,
        encrypted_tag: envelope.authenticationTag,
        kms_key_id: envelope.keyId,
        kms_key_version: envelope.keyVersion,
        ssn_last_four: envelope.lastFour,
        expected_revision: revision,
      });
    },
    async saveAvailability(accessToken, input, revision) {
      const user = await authenticatedUser(client, accessToken);
      const availability = employeeAvailabilityInputSchema.parse(input);
      return numericRpc(client, "save_employee_availability_service", {
        target_user_id: user.id,
        availability_timezone: availability.timezone,
        availability_days: availability.days,
        expected_revision: revision,
      });
    },
    async prepareDocumentUpload(
      accessToken,
      requirementId,
      filename,
      sizeBytes,
    ) {
      const onboarding = await this.get(accessToken);
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
        sizeBytes > 10_485_760
      )
        throw new Error("Document must be smaller than 10 MB");
      if (options.ensureDevelopmentBucket) await ensurePrivateBucket(client);
      const path = `${onboarding.workspace_id}/${onboarding.employee_id}/${requirementId}/${crypto.randomUUID()}.${format === "jpeg" ? "jpg" : format}`;
      const { data, error } = await client.storage
        .from(documentBucket)
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
      const slash = input.path.lastIndexOf("/");
      const prefix = input.path.slice(0, slash);
      const storedName = input.path.slice(slash + 1);
      const { data: objects, error: objectError } = await client.storage
        .from(documentBucket)
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
    async submit(accessToken, revision) {
      const user = await authenticatedUser(client, accessToken);
      return numericRpc(client, "submit_employee_onboarding_service", {
        target_user_id: user.id,
        expected_revision: revision,
      });
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
      if (error) throw new Error(error.message);
      return employeeOnboardingManagerSchema.parse(data);
    },
    async getDocumentDownload(
      actorUserId,
      workspaceId,
      employeeId,
      requirementId,
    ) {
      await this.getReview(actorUserId, workspaceId, employeeId);
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
      const expiresIn = 300;
      const signed = await client.storage
        .from(documentBucket)
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

async function authenticatedUser(client: SupabaseClient, accessToken: string) {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user)
    throw new Error("Valid authenticated account required");
  return data.user;
}

async function numericRpc(
  client: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await client.rpc(name, input);
  if (error) throw new Error(error.message);
  const value = Number(data);
  if (!Number.isSafeInteger(value))
    throw new Error("Invalid onboarding revision");
  return value;
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
  const current = await client.storage.getBucket(documentBucket);
  if (!current.error) return;
  const created = await client.storage.createBucket(documentBucket, {
    public: false,
    fileSizeLimit: 10_485_760,
    allowedMimeTypes: Object.values(mediaTypes),
  });
  if (created.error && !created.error.message.toLowerCase().includes("already"))
    throw new Error(
      `Private document bucket unavailable: ${created.error.message}`,
    );
}
