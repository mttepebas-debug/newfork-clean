import {
  employeeHubMutationResultSchema,
  employeeHubReadModelSchema,
  employeeTimeTrackingReadModelSchema,
  captureTimeEventResultSchema,
  timeCorrectionMutationResultSchema,
  type CaptureTimeEventResult,
  type EmployeeHubMutationResult,
  type EmployeeHubReadModel,
  type EmployeeHubAvailabilityInput,
  type EmployeeRequestActionInput,
  type EmployeeShiftRequestInput,
  type EmployeeTimeOffInput,
  type EmployeeTimeCaptureInput,
  type EmployeeTimeTrackingReadModel,
  type EmployeeTimeCorrectionInput,
  type TimeCorrectionMutationResult,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

export interface EmployeeHubService {
  get(input: {
    actorUserId: string;
    workspaceId: string;
    from: string;
    to: string;
  }): Promise<EmployeeHubReadModel>;
  saveAvailability(input: {
    actorUserId: string;
    workspaceId: string;
    availability: EmployeeHubAvailabilityInput;
  }): Promise<EmployeeHubMutationResult>;
  submitTimeOff(input: {
    actorUserId: string;
    workspaceId: string;
    request: EmployeeTimeOffInput;
  }): Promise<EmployeeHubMutationResult>;
  submitShiftRequest(input: {
    actorUserId: string;
    workspaceId: string;
    request: EmployeeShiftRequestInput;
  }): Promise<EmployeeHubMutationResult>;
  actOnRequest(input: {
    actorUserId: string;
    workspaceId: string;
    action: EmployeeRequestActionInput;
  }): Promise<EmployeeHubMutationResult>;
  getTimeTracking(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<EmployeeTimeTrackingReadModel>;
  captureTimeEvent(input: {
    actorUserId: string;
    workspaceId: string;
    event: EmployeeTimeCaptureInput;
    idempotencyKey: string;
  }): Promise<CaptureTimeEventResult>;
  requestTimeCorrection(input: {
    actorUserId: string;
    workspaceId: string;
    correction: EmployeeTimeCorrectionInput;
    idempotencyKey: string;
  }): Promise<TimeCorrectionMutationResult>;
}

export function createEmployeeHubService(options: {
  url: string;
  serviceRoleKey: string;
}): EmployeeHubService {
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
      return employeeHubReadModelSchema.parse(
        await rpc("get_employee_hub_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_from: input.from,
          target_to: input.to,
        }),
      );
    },
    async saveAvailability(input) {
      return employeeHubMutationResultSchema.parse(
        await rpc("save_employee_hub_availability_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          availability_timezone: input.availability.timezone,
          availability_days: input.availability.days,
        }),
      );
    },
    async submitTimeOff(input) {
      return employeeHubMutationResultSchema.parse(
        await rpc("submit_employee_time_off_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_location_id: input.request.location_id,
          target_reason: input.request.reason,
          target_dates: input.request.dates,
        }),
      );
    },
    async submitShiftRequest(input) {
      return employeeHubMutationResultSchema.parse(
        await rpc("submit_employee_shift_request_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_action: input.request.action,
          target_shift_id: input.request.shift_id,
          target_requested_shift_id: input.request.requested_shift_id ?? null,
          target_note: input.request.note,
        }),
      );
    },
    async actOnRequest(input) {
      return employeeHubMutationResultSchema.parse(
        await rpc("employee_request_action_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_request_id: input.action.request_id,
          target_kind: input.action.kind,
          target_action: input.action.action,
          target_expected_revision: input.action.expected_revision,
        }),
      );
    },
    async getTimeTracking(input) {
      return employeeTimeTrackingReadModelSchema.parse(
        await rpc("get_employee_time_tracking_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
        }),
      );
    },
    async captureTimeEvent(input) {
      return captureTimeEventResultSchema.parse(
        await rpc("capture_own_time_event_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_location_id: input.event.location_id,
          target_session_id: input.event.session_id,
          target_event_type: input.event.event_type,
          target_occurred_at: input.event.occurred_at,
          target_idempotency_key: input.idempotencyKey,
        }),
      );
    },
    async requestTimeCorrection(input) {
      return timeCorrectionMutationResultSchema.parse(
        await rpc("request_own_time_correction_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_session_id: input.correction.session_id,
          target_expected_revision: input.correction.expected_revision,
          target_requested_started_at: input.correction.requested_started_at,
          target_requested_ended_at: input.correction.requested_ended_at,
          target_reason: input.correction.reason,
          target_idempotency_key: input.idempotencyKey,
        }),
      );
    },
  };
}
