import { requestFailure } from "../lib/request-error";
import {
  employeePersonalTasksSchema,
  type EmployeePersonalTaskInput,
  employeeHubReadModelSchema,
  scheduleReadModelSchema,
} from "@newfork/shared";
import {
  getApiAccessToken,
  getTabWorkspaceId,
  newforkApiUrl,
  supabaseClient,
} from "../lib/supabase";

async function request(
  workspaceId: string,
  path: string,
  init: RequestInit = {},
) {
  if (!supabaseClient)
    throw new Error("Employee Hub storage is not configured");
  const token = await getApiAccessToken(supabaseClient);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const tabWorkspaceId = getTabWorkspaceId();
  if (tabWorkspaceId) headers.set("X-Newfork-Workspace-Id", tabWorkspaceId);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspaceId}/employee-hub${path}`,
    {
      ...init,
      headers,
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok)
    throw requestFailure(body, response.status, "Employee Hub operation failed");
  return body;
}

export async function getEmployeeHub(
  workspaceId: string,
  from: string,
  to: string,
) {
  return employeeHubReadModelSchema.parse(
    await request(workspaceId, `?${new URLSearchParams({ from, to })}`),
  );
}
export async function getEmployeeScheduleBoard(
  workspaceId: string,
  date: string,
) {
  return scheduleReadModelSchema.parse(
    await request(workspaceId, `/schedule?${new URLSearchParams({ date })}`),
  );
}
export async function getEmployeePersonalTasks(workspaceId: string) {
  return employeePersonalTasksSchema.parse(
    await request(workspaceId, "/personal-tasks"),
  );
}
export async function changeEmployeePersonalTask(
  workspaceId: string,
  task: EmployeePersonalTaskInput,
) {
  return employeePersonalTasksSchema.parse(
    await request(workspaceId, "/personal-tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }),
  );
}
