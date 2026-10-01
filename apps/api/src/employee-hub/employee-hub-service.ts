import {
  employeePersonalTasksSchema,
  type EmployeePersonalTask,
  type EmployeePersonalTaskInput,
  employeeHubMutationResultSchema,
  employeeHubReadModelSchema,
  scheduleReadModelSchema,
  type EmployeeHubMutationResult,
  type EmployeeHubReadModel,
  type ScheduleReadModel,
  type EmployeeRequestActionInput,
  type EmployeeTimeOffInput,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { rpcFailure } from "../http-error";

export interface EmployeeHubService {
  getPersonalTasks(input: {
    actorUserId: string;
    workspaceId: string;
  }): Promise<EmployeePersonalTask[]>;
  changePersonalTask(input: {
    actorUserId: string;
    workspaceId: string;
    task: EmployeePersonalTaskInput;
  }): Promise<EmployeePersonalTask[]>;
  get(input: {
    actorUserId: string;
    workspaceId: string;
    from: string;
    to: string;
  }): Promise<EmployeeHubReadModel>;
  getScheduleBoard(input: {
    actorUserId: string;
    workspaceId: string;
    targetDate: string;
  }): Promise<ScheduleReadModel>;
  submitTimeOff(input: {
    actorUserId: string;
    workspaceId: string;
    request: EmployeeTimeOffInput;
  }): Promise<EmployeeHubMutationResult>;
  actOnRequest(input: {
    actorUserId: string;
    workspaceId: string;
    action: EmployeeRequestActionInput;
  }): Promise<EmployeeHubMutationResult>;
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
    if (error) throw rpcFailure(error);
    return data;
  }
  async function schedulingTimeFormat(workspaceId: string) {
    const { data, error } = await client
      .from("workspace_scheduling_settings")
      .select("time_format")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw rpcFailure(error);
    return data?.time_format === "24h" ? "24h" : "12h";
  }
  return {
    async getPersonalTasks(input) {
      return employeePersonalTasksSchema.parse(
        await rpc("employee_personal_tasks_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
        }),
      );
    },
    async changePersonalTask(input) {
      return employeePersonalTasksSchema.parse(
        await rpc("employee_personal_tasks_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          task_action: input.task.action,
          target_task_id: input.task.id,
          task_title: input.task.action === "create" ? input.task.title : null,
        }),
      );
    },
    async getScheduleBoard(input) {
      // Published, employee-scoped board. The SQL function owns the location
      // scope and keeps other employees' availability out of the payload.
      return scheduleReadModelSchema.parse(
        await rpc("get_employee_schedule_board_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_date: input.targetDate,
        }),
      );
    },
    async get(input) {
      const [model, timeFormat] = await Promise.all([
        rpc("get_employee_hub_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_from: input.from,
          target_to: input.to,
        }),
        schedulingTimeFormat(input.workspaceId),
      ]);
      const parsed = employeeHubReadModelSchema.parse(
        typeof model === "object" && model !== null
          ? { ...model, settings: { ...(model as { settings?: object }).settings, time_format: timeFormat } }
          : model,
      );
      if (!parsed.locations.length) return parsed;
      const { data: locations, error } = await client
        .from("locations")
        .select("id,timezone")
        .eq("workspace_id", input.workspaceId)
        .in(
          "id",
          parsed.locations.map((location) => location.id),
        );
      if (error) throw rpcFailure(error);
      return {
        ...parsed,
        locations: parsed.locations.map((location) => ({
          ...location,
          timezone:
            locations?.find((item) => item.id === location.id)?.timezone ??
            undefined,
        })),
      };
    },
    async submitTimeOff(input) {
      if (input.request.periods) {
        return employeeHubMutationResultSchema.parse(
          await rpc("submit_employee_time_off_periods_service", {
            actor_user_id: input.actorUserId,
            target_workspace_id: input.workspaceId,
            target_location_id: input.request.location_id,
            target_reason: input.request.reason,
            target_periods: input.request.periods,
            target_operation_id: input.request.request_id,
            target_expected_timezone: input.request.expected_timezone,
          }),
        );
      }
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
    async actOnRequest(input) {
      if (input.action.action === "request_cancellation") {
        return employeeHubMutationResultSchema.parse(await rpc("submit_employee_time_off_cancellation_service", {
          actor: input.actorUserId, w: input.workspaceId, parent_id: input.action.request_id,
          expected_revision: input.action.expected_revision, reason: input.action.reason,
          periods: input.action.periods, operation_id: input.action.operation_id,
        }));
      }
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
  };
}
