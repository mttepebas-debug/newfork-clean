// Demo backend for the hub area: Shift Hub (shift-exchanges routes) and the
// Employee Hub reads and actions. Routes follow apps/api; answers follow the
// shared schemas the web app parses (packages/shared).
import { ApiError, contextFor, type Handler } from "./api";
import { failsNow, hubFlags } from "./hub-flags";
import { currentScenario } from "../pages";
import { exchangeCandidates, exchangeCommand, exchangePreview, personalTasks, readExchanges } from "./hub-exchanges";
import { employeeBoard, employeeHub, hubActor } from "./hub-read";
import { withdrawOwn } from "./requests-time-off";
import { WORKSPACE_ID, world } from "./world";

/** PAGES: how the one-case read of a Requests link answers ("" = normally). */
export const caseReadMode: { value: "" | "fail" | "slow" } = { value: "" };

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
    if (shift) {
      if (hubFlags.failCandidates) throw new ApiError(500, { error: "Internal server error" });
      return exchangeCandidates(shift);
    }
    const caseId = query.get("case_id");
    const application = query.get("application_id");
    if (caseId && application) return exchangePreview(caseId, application);
    if (failsNow("exchanges")) throw new ApiError(500, { error: "Internal server error" });
    if (caseId && caseReadMode.value === "fail") throw new ApiError(503, { error: "Service unavailable" });
    if (caseId && caseReadMode.value === "slow") return new Promise(() => {});
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
  route("GET", "/v1/workspaces/:workspaceId/employee-hub", ({ query }) => {
    if (failsNow("hub")) throw new ApiError(500, { error: "Internal server error" });
    return employeeHub(query);
  });

  // ---------- PAGES 0.x (the shell): a scenario's own answers ----------
  shellRoutes(route);
}

/** The shell's states that need another answer than the fallbacks (api.ts) give. */
function shellRoutes(route: (method: string, path: string, handler: Handler) => void): void {
  const setup = currentScenario()?.setup;
  const done = { status: "complete" as const, currentStep: 4 };
  if (setup === "hub-switcher" || setup === "hub-setup-pending" || setup === "hub-switch-fails") {
    // Two more workspaces (one ready, one still in setup); "Almost ready" then offers "Choose a workspace".
    route("GET", "/v1/account/workspaces", () => [
      { id: WORKSPACE_ID, name: "Harbor & Vine", role: contextFor().membership.role, status: "active", isActive: true, onboarding: done },
      { id: "5a17e2c4-3b9d-4e8f-a1c6-7d2e9f0b4c81", name: "Saltline Oyster Bar", role: "admin", status: "active", isActive: false, onboarding: done },
      { id: "b3c4d5e6-f708-4a1b-9c2d-3e4f5a6b7c8d", name: "Harbor & Vine Brooklyn", role: "owner", status: "active", isActive: false, onboarding: { status: "incomplete", currentStep: 2 } },
    ]);
  }
  if (setup === "hub-switcher") {
    // And an invitation waiting for an answer.
    route("GET", "/v1/invitations/pending", () => [{
      id: "1c3d5e7f-9a0b-4c2d-8e4f-6a8b0c2d4e6f", workspaceId: "cedae5b2-8b8f-4d1a-a0c4-6e2f9b1d3a52", workspaceName: "Cedar & Smoke BBQ",
      emailHint: "o***r@harborvine.test", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    }]);
  }
  if (setup === "hub-switch-fails") {
    // Opening another workspace fails: the switcher sends the person to the hub (/workspaces).
    route("GET", "/v1/context", () => {
      let tab: string | null = null;
      try { tab = window.sessionStorage.getItem("newfork.tabWorkspaceId"); } catch { /* storage blocked */ }
      if (tab && tab !== WORKSPACE_ID) throw new ApiError(500, { error: "Workspace could not be opened" });
      return contextFor();
    });
  }
  if (setup === "hub-setup-pending") route("GET", "/v1/context", () => ({ ...contextFor(), onboarding: { status: "incomplete", currentStep: 3 } }));
  if (setup === "hub-documents-restricted") {
    route("GET", "/v1/workspaces/:workspaceId/documents/access", () => ({ restricted: true }));
    route("GET", "/v1/me/workspaces/:workspaceId/documents/access", () => ({ restricted: true }));
  }
}
