import { HttpError, rpcFailure } from "../http-error.js";
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
  // Sign-in is configured, and recognizes nobody.
  return buildApp({
    contextResolver: { resolve: async () => null },
    invitationService: service,
  });
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

  it.each([
    ["POST", "/v1/invitations/accept", { token }],
    ["POST", "/v1/invitations/1131ca31-392f-4ea0-bdc2-e1235e1496b1/accept", undefined],
    ["POST", "/v1/invitations/1131ca31-392f-4ea0-bdc2-e1235e1496b1/decline", undefined],
  ] as const)(
    "answers 403 email_unconfirmed when the account has not confirmed its email (%s %s)",
    async (method, url, payload) => {
      // The RPC's own error, through the same helper the service uses: the
      // hint has to survive the trip to tell this apart from "not yours".
      const response = await appWith(
        serviceThrowing(
          rpcFailure({
            message: "the account email address is not confirmed",
            code: "42501",
            hint: "authz.not_active",
          }),
        ),
      ).inject({
        method,
        url,
        headers: { authorization: "Bearer employee-token" },
        ...(payload ? { payload } : {}),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "Confirm your email address to answer this invitation",
        code: "email_unconfirmed",
      });
    },
  );

  it("still answers invitation_email_mismatch for a hint-less 42501 on decline", async () => {
    const response = await appWith(
      serviceThrowing(
        rpcFailure({ message: "invitation is for another account", code: "42501" }),
      ),
    ).inject({
      method: "POST",
      url: "/v1/invitations/1131ca31-392f-4ea0-bdc2-e1235e1496b1/decline",
      headers: { authorization: "Bearer employee-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("invitation_email_mismatch");
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

  // G11: a failure that is not the invitation's (a crash, an expired
  // session) used to come back as 409 "could not be answered".
  it.each(["/v1/invitations/accept", "/v1/invitations/pending"])(
    "answers a server failure on %s with 500 and nothing of it",
    async (url) => {
      const response = await appWith(
        serviceThrowing(new Error("connect ECONNREFUSED 10.0.0.4:5432")),
      ).inject({
        method: url.endsWith("pending") ? "GET" : "POST",
        url,
        headers: { authorization: "Bearer employee-token" },
        ...(url.endsWith("pending") ? {} : { payload: { token } }),
      });

      expect(response.statusCode).toBe(500);
      expect(response.payload).not.toContain("ECONNREFUSED");
    },
  );

  it("answers an expired session with 401, not 409", async () => {
    const response = await appWith(
      serviceThrowing(new HttpError("Valid authenticated account required", 401)),
    ).inject({
      method: "GET",
      url: "/v1/invitations/pending",
      headers: { authorization: "Bearer expired-token" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 401 for an admin link request with no credentials", async () => {
    const response = await appWith(serviceThrowing(new Error("unused"))).inject({
      method: "GET",
      url: "/v1/workspaces/1131ca31-392f-4ea0-bdc2-e1235e1496b1/employees/fe201916-aa0e-480b-9144-1e1c8da20a31/invitations/link",
    });

    expect(response.statusCode).toBe(401);
  });

  it("never takes the token in the address, where request logs keep it (BL-279)", async () => {
    const service = serviceThrowing(new Error("unused"));
    const response = await appWith({
      ...service,
      preview: async () => null,
    }).inject({ method: "GET", url: `/v1/invitations/preview?token=${token}` });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).not.toBe("invitation_not_found");
  });

  it("answers 404 for a token no invitation carries", async () => {
    const service = serviceThrowing(new Error("unused"));
    const response = await appWith({
      ...service,
      preview: async () => null,
    }).inject({ method: "POST", url: "/v1/invitations/preview", payload: { token } });

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
    }).inject({ method: "POST", url: "/v1/invitations/preview", payload: { token } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: "revoked",
      workspaceName: "Meyhouse",
      emailHint: "em***@example.test",
    });
  });
});
