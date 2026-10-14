// Demo backend for the hub area: Shift Hub (shift-exchanges routes) and the
// Employee Hub reads and actions. Routes follow apps/api; answers follow the
// shared schemas the web app parses (packages/shared).
import { ApiError, type Handler } from "./api";
import { exchangeCandidates, exchangeCommand, exchangePreview, personalTasks, readExchanges } from "./hub-exchanges";
import { employeeBoard, employeeHub, hubActor } from "./hub-read";
import { withdrawOwn } from "./requests-time-off";
import { world } from "./world";

export function hubRoutes(route: (method: string, path: string, handler: Handler) => void): void {
  // ---------- Shift Hub ----------
  route("GET", "/v1/workspaces/:workspaceId/shift-exchanges/schedule-recovery/:sessionId", ({ params }) => {
    const session = world.sessions.find((item) => item.id === params.sessionId);
    if (!session) throw new ApiError(404, { error: "Schedule edit session not found" });
    return { session_id: session.id, session_revision: session.revision, fingerprint: `recovery:${session.id}:${session.revision}`, changes: [] };
  });
  route("POST", "/v1/workspaces/:workspaceId/shift-exchanges/schedule-recovery/:sessionId", () => {
    throw new ApiError(409, { error: "There is nothing to restore in this schedule" });
  });
  route("GET", "/v1/workspaces/:workspaceId/shift-exchanges", ({ query }) => {
    const shift = query.get("shift_id");
    if (shift) return exchangeCandidates(shift);
    const caseId = query.get("case_id");
    const application = query.get("application_id");
    if (caseId && application) return exchangePreview(caseId, application);
    return readExchanges(query);
  });
  route("POST", "/v1/workspaces/:workspaceId/shift-exchanges", ({ body }) => exchangeCommand(body as never));

  // ---------- Employee Hub ----------
  route("GET", "/v1/workspaces/:workspaceId/employee-hub/schedule", ({ query }) => employeeBoard(query));
  route("GET", "/v1/workspaces/:workspaceId/employee-hub/personal-tasks", () => personalTasks());
  route("POST", "/v1/workspaces/:workspaceId/employee-hub/personal-tasks", ({ body }) => personalTasks(body as never));
  route("POST", "/v1/workspaces/:workspaceId/employee-hub/request-action", ({ body }) => {
    hubActor();
    const input = body as { request_id?: string; kind?: string; action?: string; expected_revision?: number };
    if (input.kind !== "time_off" || input.action !== "cancel" || !input.request_id || typeof input.expected_revision !== "number") {
      throw new ApiError(400, { error: "unsupported employee request action" });
    }
    return withdrawOwn(input.request_id, input.expected_revision);
  });
  route("GET", "/v1/workspaces/:workspaceId/employee-hub", ({ query }) => employeeHub(query));
}
