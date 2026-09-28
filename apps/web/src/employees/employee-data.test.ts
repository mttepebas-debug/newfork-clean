import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { loadEmployeeReferenceData } from "./employee-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  newforkApiUrl: "http://api.test",
  getApiAccessToken: async () => "session-token",
  getTabWorkspaceId: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

const answer = {
  locations: [
    { id: "10000000-0000-4000-8000-000000000001", name: "Kadikoy", archived_at: null, timezone: "America/New_York" },
  ],
  jobs: [{ id: "33000000-0000-4000-8000-000000000001", name: "Server", archived_at: "2026-09-01T10:00:00+00:00" }],
  invite_roles: [
    { id: "44000000-0000-4000-8000-000000000001", name: "Employee", system_key: "employee", access_class: "employee" },
  ],
};

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Employees reference data (BL-231)", () => {
  it("reads the drawer's pick lists through the API, not the tables", async () => {
    const fetchMock = respond(200, answer);
    await expect(loadEmployeeReferenceData(workspaceId)).resolves.toEqual({
      locations: [{ id: answer.locations[0]!.id, name: "Kadikoy", archived: false, timezone: "America/New_York" }],
      jobs: [{ id: answer.jobs[0]!.id, name: "Server", archived: true }],
      inviteRoles: [{ id: answer.invite_roles[0]!.id, name: "Employee", systemKey: "employee", accessClass: "employee" }],
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(`http://api.test/v1/workspaces/${workspaceId}/employees/reference-data`);
  });

  it("passes the core's no on with its reason", async () => {
    respond(403, { error: "Not allowed", reason: "authz.out_of_scope", detail: "employee.references.read" });
    const failure = await loadEmployeeReferenceData(workspaceId).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RequestError);
    expect(failure).toMatchObject({ reason: "authz.out_of_scope", status: 403 });
  });
});
