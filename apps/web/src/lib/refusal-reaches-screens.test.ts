import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWeeklyTeam } from "../availability/availability-data";
import {
  getAnnouncements,
  getWorkspaceDashboard,
} from "../communications/communications-data";
import { getEmployeeHub } from "../employee-hub/employee-hub-data";
import { listEmployees } from "../employees/employee-data";
import {
  getDocumentTargetOptions,
  previewDocumentPublication,
} from "../settings/documents-data";
import { loadSchedulingSettings } from "../settings/organization-data";
import { loadTimeOffToAnswer } from "../time-off/time-off-data";
import { isNoAccess } from "./no-access";

vi.mock("./supabase", () => ({
  // The shared helper as it answers a failure: the body's sentence, status and key.
  apiRequest: async (_client: unknown, path: string, init?: RequestInit) => {
    const response = await fetch(path, init);
    const body: unknown = await response.json();
    if (!response.ok) throw (await import("./request-error")).requestFailure(body, response.status, "Workspace operation failed");
    return body;
  },
  getApiAccessToken: vi.fn(async () => "token"),
  getTabWorkspaceId: vi.fn(() => null),
  newforkApiUrl: "http://api.test",
  supabaseClient: {
    auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) },
  },
}));

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

// Every screen's first read, through the request helper it really uses.
const reads: Array<[string, () => Promise<unknown>]> = [
  ["Workspace", () => getWorkspaceDashboard(workspace)],
  ["Employees", () => listEmployees(workspace, false, "", "all")],
  ["Requests", () => loadTimeOffToAnswer(workspace, { view: "open" })],
  ["Availability", () => loadWeeklyTeam(workspace)],
  ["Announcements", () => getAnnouncements(workspace)],
  ["Employee Hub", () => getEmployeeHub(workspace, "2026-09-21", "2026-09-27")],
  ["Settings > Documents (targets)", () => getDocumentTargetOptions(workspace)],
  ["Settings > Documents > Publish impact", () => previewDocumentPublication(workspace, workspace)],
  ["Settings > Scheduling", () => loadSchedulingSettings(workspace)],
];

async function failure(read: () => Promise<unknown>) {
  return read().then(
    () => { throw new Error("expected the read to fail"); },
    (error: unknown) => error,
  );
}

describe("the API's no reaches every screen's read as a no (FB-6.1.9)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(reads)("%s keeps the refusal's status and authz reason", async (_screen, read) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden", reason: "authz.missing_permission" }),
    })));
    const error = await failure(read);
    expect(isNoAccess(error)).toBe(true);
    expect((error as Error).message).toBe("Forbidden");
  });

  it.each(reads)("%s does not call a plain failure a no", async (_screen, read) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    })));
    expect(isNoAccess(await failure(read))).toBe(false);
  });
});
