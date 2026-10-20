import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import {
  acceptEmployeeInvitation,
  acceptPendingEmployeeInvitation,
  declinePendingEmployeeInvitation,
  getEmployeeDetail,
  loadEmployeeReferenceData,
  prepareEmployeeInvitation,
  removeEmployeeFromLocation,
  saveOwnEmploymentContact,
  retryEmployeeInvitation,
  revokeEmployeeInvitation,
} from "./employee-data";
import { isNoAccess } from "../lib/no-access";
import { InvitationError } from "./invitation-error";
import { firstJobExceptOwner } from "./employee-create-flow";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  newforkApiUrl: "http://api.test",
  getApiAccessToken: async () => "session-token",
  getTabWorkspaceId: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

// Part of the owner's answer from read_employee_references_service on the "r"
// world of supabase/tests/employee_references_ask_the_core.test.sql, BL-218
// .3a applied (rolled back): Management with Owner under it, Kitchen with Old.
const answer = {
  jobs: [
    { id: "ae9f68ac-f2d1-46ad-b688-2cc2b25958cd", name: "Old", system_key: null, archived_at: "2026-09-29T01:34:58.259859+00:00", department_id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939" },
    { id: "285cb253-3c31-41c3-950a-74c93ded13fb", name: "Owner", system_key: "owner", archived_at: null, department_id: "893f064e-2952-49ae-80f7-cc5ab30e192a" },
  ],
  locations: [
    { id: "e92f96de-3eb0-4203-a15c-aff6edfd4c39", name: "Kadikoy", timezone: "Europe/Istanbul", archived_at: null },
  ],
  departments: [
    { id: "893f064e-2952-49ae-80f7-cc5ab30e192a", name: "Management", system_key: "management", archived_at: null },
    { id: "b2ab1ea5-1a32-4f1c-8da8-6d6422205939", name: "Kitchen", system_key: null, archived_at: null },
  ],
  invite_roles: [
    { id: "f8bd7763-1616-4cc2-bb47-d64f9053f106", name: "lead", system_key: null, access_class: "manager" },
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
      locations: [{ id: answer.locations[0]!.id, name: "Kadikoy", archived: false, timezone: "Europe/Istanbul" }],
      departments: [
        { id: answer.departments[0]!.id, name: "Management", archived: false, management: true },
        { id: answer.departments[1]!.id, name: "Kitchen", archived: false, management: false },
      ],
      jobs: [
        { id: answer.jobs[0]!.id, name: "Old", archived: true, departmentId: answer.departments[1]!.id, owner: false },
        { id: answer.jobs[1]!.id, name: "Owner", archived: false, departmentId: answer.departments[0]!.id, owner: true },
      ],
      inviteRoles: [{ id: answer.invite_roles[0]!.id, name: "lead", systemKey: null, accessClass: "manager" }],
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

// FB-6.2 .7a: the detail read's refusals reach the drawer as the API's "no"
// (isNoAccess), for somebody out of reach and for somebody not a member.
describe("Employee detail refusals", () => {
  const employeeId = "15000000-0000-4000-8000-000000000001";

  it.each([
    [403, "authz.out_of_scope"],
    [403, "authz.missing_permission"],
    [404, "authz.not_member"],
  ] as const)("passes %s %s on as the API's no", async (status, reason) => {
    respond(status, { error: status === 404 ? "Workspace not found" : "Not allowed", reason, requestId: "r1" });
    const failure = await getEmployeeDetail(workspaceId, employeeId).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RequestError);
    expect(failure).toMatchObject({ reason, status });
    expect(isNoAccess(failure)).toBe(true);
  });

  it("does not take a bare refusal without a reason for the API's no", async () => {
    respond(403, { error: "Employee read required" });
    const failure = await getEmployeeDetail(workspaceId, employeeId).catch((error: unknown) => error);
    expect(isNoAccess(failure)).toBe(false);
  });
});

describe("Invitation answers (SEC-003 #9)", () => {
  const invitationId = "1131ca31-392f-4ea0-bdc2-e1235e1496b1";
  const unconfirmed = {
    error: "Confirm your email address to answer this invitation",
    code: "email_unconfirmed",
  };

  it.each([
    ["the emailed link", () => acceptEmployeeInvitation("a".repeat(64))],
    ["Join on a pending row", () => acceptPendingEmployeeInvitation(invitationId)],
    ["Decline on a pending row", () => declinePendingEmployeeInvitation(invitationId)],
  ])("tells an unconfirmed email apart from a wrong account (%s)", async (_, answer) => {
    respond(403, unconfirmed);
    const failure = await answer().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(InvitationError);
    expect(failure).toMatchObject({ code: "email_unconfirmed" });
  });

  it("keeps a wrong account as invitation_email_mismatch on Decline", async () => {
    respond(403, { error: "This invitation is for a different account", code: "invitation_email_mismatch" });
    const failure = await declinePendingEmployeeInvitation(invitationId).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "invitation_email_mismatch" });
  });
});

describe("the primary job a picker falls back to (EMP-001 C)", () => {
  it("is the first picked job, a Management job too, and never the Owner job", () => {
    expect(firstJobExceptOwner(["manager", "cook"], "owner")).toBe("manager");
    expect(firstJobExceptOwner(["owner", "cook"], "owner")).toBe("cook");
    expect(firstJobExceptOwner(["owner"], "owner")).toBeNull();
    expect(firstJobExceptOwner([], "owner")).toBeNull();
    // Locations, and a job list with no Owner job in it.
    expect(firstJobExceptOwner(["cook"], undefined)).toBe("cook");
  });
});

// FB-6.2 .7b (BL-414): the core decides who may invite; its "no" reaches the
// drawer with its reason, so isNoAccess() and the screen can tell it apart.
describe("Invitations the core refuses", () => {
  const employeeId = "15000000-0000-4000-8000-000000000001";
  it.each([
    ["sending", () => prepareEmployeeInvitation(workspaceId, employeeId, "pat@example.test", { employee_role_id: null, management_role_id: null, managed_location_ids: [] })],
    ["resending", () => retryEmployeeInvitation(workspaceId, employeeId)],
    ["cancelling", () => revokeEmployeeInvitation(workspaceId, employeeId)],
  ] as const)("passes the core's no on %s with its reason", async (_name, call) => {
    respond(403, { error: "Not allowed", reason: "authz.rank", detail: "employee.invite" });
    const failure = await call().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RequestError);
    expect(failure).toMatchObject({ reason: "authz.rank", detail: "employee.invite", status: 403 });
    expect(isNoAccess(failure)).toBe(true);
  });
});

// EMP-001 (BL-443, BL-444): the core answers for one own emergency contact.
// The screen keeps its own sentence and learns why from the reason.
describe("saving one own emergency contact", () => {
  const employeeId = "15000000-0000-4000-8000-000000000001";
  const contact = { name: "Ayla Kim", relationship: "Sister", phone: "555 010 2030", email: "" };

  it("passes the refusal on with its reason and status, and not the server sentence", async () => {
    respond(403, { error: "Not allowed", reason: "authz.not_active", detail: "employee.save_own_contact" });
    const failure = await saveOwnEmploymentContact(workspaceId, employeeId, contact).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RequestError);
    expect(failure).toMatchObject({
      message: "Emergency contact could not be saved",
      reason: "authz.not_active",
      status: 403,
    });
    expect(isNoAccess(failure)).toBe(true);
  });
});

// FB-6.2 S1: taking somebody off one location.
describe("Locations a person is taken off", () => {
  const employeeId = "15000000-0000-4000-8000-000000000001";
  const locationId = "11000000-0000-4000-8000-000000000001";

  it("takes somebody off one location and says what is left", async () => {
    const fetchMock = respond(200, { releasedShiftCount: 2, locationsLeft: 0 });
    await expect(removeEmployeeFromLocation(workspaceId, employeeId, locationId)).resolves.toEqual({
      releasedShiftCount: 2,
      locationsLeft: 0,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `http://api.test/v1/workspaces/${workspaceId}/employees/${employeeId}/locations/${locationId}`,
    );
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "DELETE" });
  });

  it("passes the core's no on a removal with its reason", async () => {
    respond(403, { error: "Not allowed", reason: "authz.out_of_scope", detail: "employee.remove_from_location" });
    const failure = await removeEmployeeFromLocation(workspaceId, employeeId, locationId).catch((error: unknown) => error);
    expect(failure).toMatchObject({ reason: "authz.out_of_scope", status: 403 });
    expect(isNoAccess(failure)).toBe(true);
  });

});
