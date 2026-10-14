// The demo backend: answers the web app's API calls from the in-browser world.
// Routes follow apps/api (schedule-routes.ts and friends); the logic follows the
// database functions in supabase/schema.sql closely enough for the screen.
import * as shared from "@newfork/shared";
import { schedule } from "./schedule-service";
import { OWNER_NAME, OWNER_USER_ID, WORKSPACE_ID, world } from "./world";

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

function contextFor() {
  const role = "owner" as const;
  const permissions = shared.permissionsForRole(role);
  return {
    userId: OWNER_USER_ID,
    workspace: {
      id: WORKSPACE_ID,
      name: "Harbor & Vine",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      userId: OWNER_USER_ID,
      workspaceId: WORKSPACE_ID,
      role,
      status: "active",
      allLocations: true,
    },
    permissions,
    actions: shared.authzActionKeys.filter((action: string) => {
      if (action === "workspace.read") return true;
      if (action === "employee_hub.read" || action === "employee_hub.self") return true;
      const rule = (shared.targetedAuthzActions as Record<string, { person?: boolean }>)[action];
      return rule !== undefined && (shared.expected as (...args: unknown[]) => boolean)(
        { workspaceId: WORKSPACE_ID, role, status: "active", locationIds: [], permissions },
        action,
        ...(rule.person ? [{ person: { role: "employee", isSelf: false } }] : []),
      );
    }),
    onboarding: { status: "complete", currentStep: 4 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  };
}

route("GET", "/v1/context", () => contextFor());
route("GET", "/v1/account/attention", () => ({ documents: 0, workspaces: 0 }));
route("GET", "/v1/workspaces/:workspaceId/me/avatar", () => ({ url: null }));
route("GET", "/v1/workspaces/:workspaceId/documents/access", () => ({ restricted: false }));
route("GET", "/v1/me/workspaces/:workspaceId/documents/access", () => ({ restricted: false }));
route("GET", "/v1/workspaces/:workspaceId/communications/notifications", ({ params }) => ({ workspace_id: params.workspaceId, unread_count: 0, next_cursor: null, notifications: [] }));
route("GET", "/v1/account/workspaces", () => [{
  id: WORKSPACE_ID, name: "Harbor & Vine", role: "owner", status: "active", isActive: true,
  onboarding: { status: "complete", currentStep: 4 },
}]);
route("GET", "/v1/invitations/pending", () => []);

schedule(route);

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
  return json(404, { error: "Not available in the test page", reason: "demo.not_available" });
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
