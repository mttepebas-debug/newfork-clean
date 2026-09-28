import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import {
  acceptEmployeeInvitation,
  acceptPendingEmployeeInvitation,
  declinePendingEmployeeInvitation,
  InvitationError,
  loadEmployeeReferenceData,
} from "./employee-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  newforkApiUrl: "http://api.test",
  getApiAccessToken: async () => "session-token",
  getTabWorkspaceId: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

// Part of the owner's answer from read_employee_references_service on the "r"
// world of supabase/tests/employee_references_ask_the_core.test.sql (rolled back).
const answer = {
  jobs: [{ id: "4d10b47f-58a8-401d-a4bb-92fec24a1819", name: "Old", archived_at: "2026-09-28T05:03:02.777745+00:00" }],
  locations: [
    { id: "01793040-e611-47d7-8b30-e04663faac46", name: "Kadikoy", timezone: "Europe/Istanbul", archived_at: null },
  ],
  invite_roles: [
    { id: "1cf1ccb7-a238-4190-bb3a-41401f0f2f1d", name: "lead", system_key: null, access_class: "manager" },
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
      jobs: [{ id: answer.jobs[0]!.id, name: "Old", archived: true }],
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
