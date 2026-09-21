import { HttpError } from "../http-error.js";
import type { EmployeeInvitationService } from "./invitation-service.js";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

/**
 * The invitation endpoints used to answer 409 with whatever sentence Postgres
 * raised, so a caller could not tell "not yours" from "gone" from "already in",
 * and the screen branched on English. These pin the status and the word.
 */
function serviceThrowing(error: unknown): EmployeeInvitationService {
  const fail = async (): Promise<never> => {
    throw error;
  };
  return {
    preview: fail,
    link: fail,
    prepare: fail,
    retry: fail,
    revoke: fail,
    accept: fail,
    listPending: fail,
    acceptPending: fail,
    declinePending: fail,
  };
}

function appWith(service: EmployeeInvitationService) {
  return buildApp({ contextResolver: null, invitationService: service });
}

const token = "a".repeat(64);

describe("invitation endpoints", () => {
  it("answers 401 when nobody is signed in", async () => {
    const response = await appWith(serviceThrowing(new Error("unused"))).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      payload: { token },
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 403 when the invitation belongs to a different address", async () => {
    const response = await appWith(
      serviceThrowing(
        new HttpError("invitation email does not match authenticated account", 403, {
          pgCode: "42501",
        }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: { token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("invitation_email_mismatch");
    // The server's own sentence never reaches the caller.
    expect(response.json().error).not.toContain("does not match");
  });

  it("answers 404 when no open invitation carries the token", async () => {
    const response = await appWith(
      serviceThrowing(
        new HttpError("active invitation not found", 404, { pgCode: "P0002" }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: { token },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("invitation_not_found");
  });

  it("answers 409 when the account is already a member", async () => {
    const response = await appWith(
      serviceThrowing(
        new HttpError("workspace membership already exists", 409, {
          pgCode: "23505",
        }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: { authorization: "Bearer employee-token" },
      payload: { token },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("already_member");
  });

  it("answers 401 for an admin link request with no credentials", async () => {
    const response = await appWith(serviceThrowing(new Error("unused"))).inject({
      method: "GET",
      url: "/v1/workspaces/1131ca31-392f-4ea0-bdc2-e1235e1496b1/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations/link",
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 404 for a token no invitation carries", async () => {
    const service = serviceThrowing(new Error("unused"));
    const response = await appWith({
      ...service,
      preview: async () => null,
    }).inject({ method: "GET", url: `/v1/invitations/preview?token=${token}` });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("invitation_not_found");
  });

  it("answers 200 and names the state of an invitation that is not open", async () => {
    const service = serviceThrowing(new Error("unused"));
    const response = await appWith({
      ...service,
      preview: async () => ({
        state: "revoked" as const,
        workspaceName: "Meyhouse",
        emailHint: "em***@example.test",
        expiresAt: "2026-08-24T12:00:00.000Z",
      }),
    }).inject({ method: "GET", url: `/v1/invitations/preview?token=${token}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: "revoked",
      workspaceName: "Meyhouse",
      emailHint: "em***@example.test",
    });
  });
});
