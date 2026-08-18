import {
  applyTimeAmendmentResultSchema,
  managerManualTimeEntryResultSchema,
  managerTimeEntriesReadModelSchema,
  timeCorrectionMutationResultSchema,
  approveTimeReviewWindowResultSchema,
  type ApplyTimeAmendmentResult,
  type ManagerManualTimeEntryInput,
  type ManagerManualTimeEntryResult,
  type ManagerTimeAmendmentInput,
  type ManagerTimeEntriesReadModel,
  type TimeCorrectionDecisionInput,
  type TimeCorrectionMutationResult,
  type ApproveTimeReviewWindowInput,
  type ApproveTimeReviewWindowResult,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

export interface TimeEntriesService {
  get(input: {
    actorUserId: string;
    workspaceId: string;
    from: string;
    to: string;
  }): Promise<ManagerTimeEntriesReadModel>;
  createManual(input: {
    actorUserId: string;
    workspaceId: string;
    entry: ManagerManualTimeEntryInput;
    idempotencyKey: string;
  }): Promise<ManagerManualTimeEntryResult>;
  amend(input: {
    actorUserId: string;
    workspaceId: string;
    sessionId: string;
    amendment: ManagerTimeAmendmentInput;
    idempotencyKey: string;
  }): Promise<ApplyTimeAmendmentResult>;
  decideCorrection(input: {
    actorUserId: string;
    workspaceId: string;
    correctionId: string;
    decision: TimeCorrectionDecisionInput;
    idempotencyKey: string;
  }): Promise<TimeCorrectionMutationResult>;
  approveReviewWindow(input: {
    actorUserId: string;
    workspaceId: string;
    review: ApproveTimeReviewWindowInput;
    idempotencyKey: string;
  }): Promise<ApproveTimeReviewWindowResult>;
}

export function createTimeEntriesService(options: {
  url: string;
  serviceRoleKey: string;
}): TimeEntriesService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async get(input) {
      return managerTimeEntriesReadModelSchema.parse(
        await rpc("get_manager_time_entries_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_from: input.from,
          target_to: input.to,
        }),
      );
    },
    async createManual(input) {
      return managerManualTimeEntryResultSchema.parse(
        await rpc("create_manual_time_session_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_employee_id: input.entry.employee_id,
          target_location_id: input.entry.location_id,
          target_started_at: input.entry.started_at,
          target_ended_at: input.entry.ended_at,
          target_reason: input.entry.reason,
          target_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async amend(input) {
      return applyTimeAmendmentResultSchema.parse(
        await rpc("apply_time_amendment_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_session_id: input.sessionId,
          target_expected_revision: input.amendment.expected_revision,
          target_effective_started_at: input.amendment.effective_started_at,
          target_effective_ended_at: input.amendment.effective_ended_at,
          target_reason: input.amendment.reason,
          target_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async decideCorrection(input) {
      return timeCorrectionMutationResultSchema.parse(
        await rpc("decide_time_correction_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_correction_id: input.correctionId,
          target_expected_session_revision:
            input.decision.expected_session_revision,
          target_action: input.decision.action,
          target_reason: input.decision.reason,
          target_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async approveReviewWindow(input) {
      return approveTimeReviewWindowResultSchema.parse(
        await rpc("approve_time_review_window_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_location_id: input.review.location_id,
          target_from: input.review.from,
          target_to: input.review.to,
          target_sessions: input.review.sessions,
          target_idempotency_key: input.idempotencyKey,
        }),
      );
    },
  };
}
