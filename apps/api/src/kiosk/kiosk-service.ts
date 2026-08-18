import {
  kioskActionStateSchema,
  kioskCaptureResultSchema,
  kioskDeviceSchema,
  kioskManagementSchema,
  kioskDirectorySchema,
  kioskEnrollmentSchema,
  kioskPinResetResultSchema,
  type KioskDevice,
  type KioskActionState,
  type KioskCaptureInput,
  type KioskCaptureResult,
  type KioskDirectory,
  type KioskEnrollment,
  type KioskManagement,
  type KioskPinResetResult,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createEnrollmentCode,
  createOpaqueToken,
  hashKioskPin,
  hashOpaqueSecret,
  normalizeEnrollmentCode,
  verifyKioskPin,
} from "./kiosk-crypto";

const exchangeRowSchema = z.object({ device: kioskDeviceSchema });
const beginVerificationSchema = z.object({
  attempt_id: z.string().uuid().nullable(),
  rate_limited: z.boolean(),
  eligible: z.boolean(),
  pin_hash: z.string().nullable(),
});
const finishVerificationSchema = z.object({
  verified: z.boolean(),
  expires_at: z.string().datetime({ offset: true }).nullable(),
});

export type KioskVerificationResult =
  | { status: "verified"; actionToken: string; expiresAt: string }
  | { status: "invalid" | "rate_limited" };

export interface KioskService {
  getManagement(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<KioskManagement>;
  updateLabel(input: {
    actorUserId: string;
    workspaceId: string;
    deviceId: string;
    label: string;
  }): Promise<KioskDevice>;
  createReenrollment(input: {
    actorUserId: string;
    workspaceId: string;
    deviceId: string;
  }): Promise<KioskEnrollment>;
  getDirectory(credential: string): Promise<KioskDirectory>;
  getActionState(
    credential: string,
    actionToken: string,
  ): Promise<KioskActionState>;
  capture(
    credential: string,
    actionToken: string,
    input: KioskCaptureInput,
  ): Promise<KioskCaptureResult>;
  cancel(credential: string, actionToken: string): Promise<void>;
  createEnrollment(input: {
    actorUserId: string;
    workspaceId: string;
    locationId: string;
    label: string;
  }): Promise<KioskEnrollment>;
  exchange(code: string): Promise<{ device: KioskDevice; credential: string }>;
  rotate(
    credential: string,
  ): Promise<{ device: KioskDevice; credential: string }>;
  revoke(input: {
    actorUserId: string;
    workspaceId: string;
    deviceId: string;
  }): Promise<void>;
  setPin(input: {
    actorUserId: string;
    workspaceId: string;
    locationId: string;
    employeeId: string;
    pin: string;
  }): Promise<KioskPinResetResult>;
  verify(input: {
    credential: string;
    employeeId: string;
    pin: string;
  }): Promise<KioskVerificationResult>;
}

export function createKioskService(options: {
  url: string;
  serviceRoleKey: string;
}): KioskService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const dummyPinHash = hashKioskPin("000000");

  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }

  return {
    async getManagement(input) {
      return kioskManagementSchema.parse(
        await rpc("get_kiosk_management_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
        }),
      );
    },
    async updateLabel(input) {
      return kioskDeviceSchema.parse(
        await rpc("update_kiosk_device_label_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_device_id: input.deviceId,
          target_label: input.label,
        }),
      );
    },
    async createReenrollment(input) {
      const code = createEnrollmentCode();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const row = await rpc("create_kiosk_reenrollment_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_device_id: input.deviceId,
        target_code_hash: hashOpaqueSecret(normalizeEnrollmentCode(code)),
        target_expires_at: expiresAt,
      });
      return kioskEnrollmentSchema.parse({ ...row, code });
    },
    async getDirectory(credential) {
      return kioskDirectorySchema.parse(
        await rpc("get_kiosk_directory_service", {
          target_credential_hash: hashOpaqueSecret(credential),
        }),
      );
    },
    async getActionState(credential, actionToken) {
      return kioskActionStateSchema.parse(
        await rpc("get_kiosk_action_state_service", {
          target_credential_hash: hashOpaqueSecret(credential),
          target_action_token_hash: hashOpaqueSecret(actionToken),
        }),
      );
    },
    async capture(credential, actionToken, input) {
      return kioskCaptureResultSchema.parse(
        await rpc("capture_kiosk_time_action_service", {
          target_credential_hash: hashOpaqueSecret(credential),
          target_action_token_hash: hashOpaqueSecret(actionToken),
          target_action: input.action,
          target_expected_revision: input.expected_revision,
          target_occurred_at: input.occurred_at,
          target_idempotency_key: input.idempotency_key,
        }),
      );
    },
    async cancel(credential, actionToken) {
      await rpc("cancel_kiosk_action_service", {
        target_credential_hash: hashOpaqueSecret(credential),
        target_action_token_hash: hashOpaqueSecret(actionToken),
      });
    },
    async createEnrollment(input) {
      const code = createEnrollmentCode();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const row = await rpc("create_kiosk_enrollment_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_location_id: input.locationId,
        target_label: input.label,
        target_code_hash: hashOpaqueSecret(normalizeEnrollmentCode(code)),
        target_expires_at: expiresAt,
      });
      return kioskEnrollmentSchema.parse({ ...row, code });
    },
    async exchange(code) {
      const credential = createOpaqueToken();
      const row = exchangeRowSchema.parse(
        await rpc("exchange_kiosk_enrollment_service", {
          target_code_hash: hashOpaqueSecret(normalizeEnrollmentCode(code)),
          target_credential_hash: hashOpaqueSecret(credential),
        }),
      );
      return { device: row.device, credential };
    },
    async rotate(credential) {
      const nextCredential = createOpaqueToken();
      const device = kioskDeviceSchema.parse(
        await rpc("rotate_kiosk_device_credential_service", {
          target_credential_hash: hashOpaqueSecret(credential),
          replacement_credential_hash: hashOpaqueSecret(nextCredential),
        }),
      );
      return { device, credential: nextCredential };
    },
    async revoke(input) {
      await rpc("revoke_kiosk_device_service", {
        actor_user_id: input.actorUserId,
        target_workspace_id: input.workspaceId,
        target_device_id: input.deviceId,
      });
    },
    async setPin(input) {
      return kioskPinResetResultSchema.parse(
        await rpc("set_employee_kiosk_pin_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_location_id: input.locationId,
          target_employee_id: input.employeeId,
          target_pin_hash: await hashKioskPin(input.pin),
        }),
      );
    },
    async verify(input) {
      const begin = beginVerificationSchema.parse(
        await rpc("begin_kiosk_pin_verification_service", {
          target_credential_hash: hashOpaqueSecret(input.credential),
          target_employee_id: input.employeeId,
        }),
      );
      if (begin.rate_limited) return { status: "rate_limited" };
      if (!begin.attempt_id) return { status: "invalid" };

      const pinMatches = await verifyKioskPin(
        input.pin,
        begin.pin_hash ?? (await dummyPinHash),
      );
      const actionToken = createOpaqueToken();
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      const finish = finishVerificationSchema.parse(
        await rpc("finish_kiosk_pin_verification_service", {
          target_attempt_id: begin.attempt_id,
          target_verified: begin.eligible && pinMatches,
          target_action_token_hash: hashOpaqueSecret(actionToken),
          target_expires_at: expiresAt,
        }),
      );
      return finish.verified && finish.expires_at
        ? {
            status: "verified",
            actionToken,
            expiresAt: finish.expires_at,
          }
        : { status: "invalid" };
    },
  };
}
