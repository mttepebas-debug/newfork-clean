// The demo backend: answers the web app's API calls from the in-browser world.
// Routes follow apps/api (schedule-routes.ts and friends); the logic follows the
// database functions in supabase/schema.sql closely enough for the screen.
import * as shared from "@newfork/shared";
import { schedule } from "./schedule-service";
import { requestsRoutes } from "./requests-service";
import { hubRoutes } from "./hub-service";
import { employeesRoutes } from "./employees-service";
import { documentsRoutes } from "./documents-service";
import { settingsRoutes } from "./settings-service";
import { datesRoutes } from "./dates-service";
import { workspaceRoutes } from "./workspace-service";
import { communicationsRoutes } from "./communications-service";
import { accountRoutes } from "./account-service";
import { availabilityRoutes } from "./availability-service";
import { onboardingRoutes } from "./onboarding-service";
import { LOC, OWNER_NAME, viewer, WORKSPACE_ID, world } from "./world";
import { viewerClass, viewerIdentity } from "./viewer";
import { viewerPermissions } from "./access";
import { currentScenario } from "../pages";

export const API_BASE = "https://api.newfork.demo";

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body.error ?? "Request failed"));
  }
}

export type Handler = (request: { params: any; query: URLSearchParams; body: any; method: string }) => unknown;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

export function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/:[a-zA-Z]+/g, (match) => {
      keys.push(match.slice(1));
      return "([^/]+)";
    })}$`,
  );
  routes.push({ method, pattern, keys, handler });
}

const untargeted: Record<string, { permission: string | null; ownerOnly?: boolean }> = {
  "account.self": { permission: null },
  "announcement.acknowledge": { permission: null },
  "announcement.read": { permission: null },
  "employee_hub.read": { permission: null },
  "employee_hub.self": { permission: null },
  "employee.invite": { permission: "employees.manage" },
  "employee.request_preferred_name": { permission: null },
  "exchange.apply_own": { permission: null },
  "exchange.read": { permission: "schedule.shift_change_requests.read" },
  "settings.availability.read": { permission: null },
  "settings.availability.write": { permission: "settings.schedule_rules.manage" },
  "settings.catalog.read": { permission: null },
  "settings.documents.write": { permission: "documents.manage" },
  "settings.notifications.read": { permission: "notifications.settings.read" },
  "settings.notifications.write": { permission: "notifications.settings.write" },
  "workspace.accept_ownership": { permission: null },
  "workspace.create": { permission: null },
  "workspace.read": { permission: null },
  "workspace.setup": { permission: null, ownerOnly: true },
  "workspace.todos": { permission: "workspace.manage" },
};

export function contextFor() {
  const role = viewerClass;
  const allLocations = role === "owner" || role === "admin";
  const locationIds = allLocations ? [] : [LOC.downtown];
  const permissions = viewerPermissions();
  return {
    userId: viewer.userId,
    workspace: {
      id: WORKSPACE_ID,
      name: "Harbor & Vine",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: viewer.membershipId,
      userId: viewer.userId,
      workspaceId: WORKSPACE_ID,
      role,
      // The core's membership_role_name (the role's own name; Support shows it).
      roleName: { owner: "Owner", admin: "Admin", manager: "Manager", custom: "Shift Lead", employee: "Employee" }[viewerIdentity],
      status: "active",
      allLocations,
    },
    permissions,
    actions: shared.authzActionKeys.filter((action: string) => {
      // Untargeted actions: the core's authz_actions rows (permission_key, owner_only).
      if (action in untargeted) {
        const rule = untargeted[action]!;
        if (rule.ownerOnly) return role === "owner";
        return rule.permission === null || (permissions as readonly string[]).includes(rule.permission);
      }
      const rule = (shared.targetedAuthzActions as Record<string, { person?: boolean }>)[action];
      return rule !== undefined && (shared.expected as (...args: unknown[]) => boolean)(
        { workspaceId: WORKSPACE_ID, role, status: "active", locationIds, permissions },
        action,
        // A manager's place actions reach their own locations (the core's scope_set).
        ...(rule.person || !allLocations
          ? [{ ...(rule.person ? { person: { role: "employee", isSelf: false } } : {}), ...(allLocations ? {} : { locations: locationIds }) }]
          : []),
      );
    }),
    onboarding: { status: "complete", currentStep: 4 },
    documentAccess: { restricted: false },
    locationScope: { allLocations, locationIds },
  };
}



onboardingRoutes(route);
schedule(route);
requestsRoutes(route);
hubRoutes(route);
employeesRoutes(route);
documentsRoutes(route);
settingsRoutes(route);
datesRoutes(route);
workspaceRoutes(route);
communicationsRoutes(route);
accountRoutes(route);
availabilityRoutes(route);
// Fallbacks: an area's own route above wins over these.
route("GET", "/v1/context", () => contextFor());
route("GET", "/v1/account/attention", () => ({ documents: 0, workspaces: 0 }));
route("GET", "/v1/workspaces/:workspaceId/me/avatar", () => ({ url: null }));
route("GET", "/v1/workspaces/:workspaceId/documents/access", () => ({ restricted: false }));
route("GET", "/v1/me/workspaces/:workspaceId/documents/access", () => ({ restricted: false }));
route("GET", "/v1/workspaces/:workspaceId/communications/notifications", ({ params }) => ({ workspace_id: params.workspaceId, unread_count: 0, next_cursor: null, notifications: [] }));
route("GET", "/v1/account/workspaces", () => [{
  id: WORKSPACE_ID, name: "Harbor & Vine", role: viewerClass, status: "active", isActive: true,
  onboarding: { status: "complete", currentStep: 4 },
}]);
route("GET", "/v1/invitations/pending", () => []);

export async function handle(url: URL, init: RequestInit): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const path = url.pathname;
  let body: unknown = undefined;
  if (typeof init.body === "string" && init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  }
  // PAGES: the scenario's forced failures and calls that never answer.
  const scenario = currentScenario();
  // A hold may name its method first ("POST /weekly$"): the read still answers, the save never does.
  const held = (pattern: string) => {
    const [, verb, rest] = /^(GET|POST|PUT|PATCH|DELETE) (.*)$/.exec(pattern) ?? [null, null, pattern];
    return (!verb || verb === method) && new RegExp(rest!).test(path);
  };
  if (scenario?.hold?.some(held)) return new Promise<Response>(() => {});
  const forced = scenario?.fail?.find((rule) => (!rule.method || rule.method.toUpperCase() === method) && new RegExp(rule.path).test(path));
  if (forced) {
    const status = forced.status ?? 500;
    return json(status, {
      error: forced.error ?? (status === 403 ? "Not allowed" : status === 404 ? "Not found" : "Internal server error"),
      ...(forced.reason ? { reason: forced.reason } : status === 403 ? { reason: "authz.missing_permission" } : {}),
    });
  }
  for (const entry of routes) {
    if (entry.method !== method) continue;
    const match = entry.pattern.exec(path);
    if (!match) continue;
    const params = Object.fromEntries(entry.keys.map((key, index) => [key, decodeURIComponent(match[index + 1]!)]));
    try {
      const result = await entry.handler({ params, query: url.searchParams, body, method });
      if (result === undefined) return new Response(null, { status: 204 });
      return json(200, result);
    } catch (error) {
      if (error instanceof ApiError) return json(error.status, error.body);
      console.error("[demo api]", method, path, error);
      return json(500, { error: "Internal server error" });
    }
  }
  console.warn("[demo api] no route", method, path + url.search);
  unmatched.push(`${method} ${path}`);
  return json(404, { error: "Not available on the atlas yet", reason: "demo.not_available" });
}

export const unmatched: string[] = [];

function json(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

export function installFetch(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (href.startsWith(API_BASE)) {
      // A little latency, like a real network, so loading states show.
      await new Promise((resolve) => setTimeout(resolve, 60));
      return handle(new URL(href), init);
    }
    return original(input, init);
  };
}

export { OWNER_NAME, world };
