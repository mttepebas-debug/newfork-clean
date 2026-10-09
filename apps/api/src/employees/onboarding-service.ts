import {
  employeeOnboardingManagerSchema,
  employeeOnboardingProfileSchema,
  employeeOnboardingSchema,
  type EmployeeOnboarding,
  type EmployeeOnboardingManager,
  type EmployeeOnboardingProfile,
} from "@newfork/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createUserVerifier } from "../auth/verify-user.js";
import { HttpError, rpcFailure } from "../http-error.js";
import { z } from "zod";

export interface EmployeeOnboardingService {
  // workspaceId selects the case when the account onboards in several workspaces.
  get(accessToken: string, workspaceId?: string): Promise<EmployeeOnboarding>;
  saveProfile(
    accessToken: string,
    profile: EmployeeOnboardingProfile,
    revision: number,
    workspaceId?: string,
  ): Promise<number>;
  // TEL-2: whether another live record of the workspace holds the number.
  phoneInUse(
    accessToken: string,
    phone: string,
    workspaceId?: string,
  ): Promise<boolean>;
  submit(
    accessToken: string,
    revision: number,
    workspaceId?: string,
  ): Promise<number>;
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
    async phoneInUse(accessToken, phone, workspaceId) {
      const user = await authenticatedUser(client, accessToken);
      const data = await rpc(client, "onboarding_phone_in_use_service", {
        target_user_id: user.id,
        typed_phone: phone,
        ...workspaceArg(workspaceId),
      });
      return z.boolean().parse(data);
    },
    async submit(accessToken, revision, workspaceId) {
      const user = await authenticatedUser(client, accessToken);
      return numericRpc(client, "submit_employee_onboarding_service", {
        target_user_id: user.id,
        expected_revision: revision,
        ...workspaceArg(workspaceId),
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
  if (!user) throw new HttpError("Valid authenticated account required", 401);
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

// Omit the argument when absent so the RPC keeps its default case selection.
function workspaceArg(workspaceId: string | undefined) {
  return workspaceId ? { target_workspace_id: workspaceId } : {};
}
