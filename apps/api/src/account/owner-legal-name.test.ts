import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error.js";
import {
  createWorkspaceAccountServiceWithClients,
  type WorkspaceAccountService,
} from "./workspace-account-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const accessToken = "valid-token";
const url = `/v1/account/workspaces/${workspaceId}/legal-name`;
const headers = { authorization: `Bearer ${accessToken}` };
const name = { firstName: "Ayla", middleName: "", lastName: "Demir" };

function appWith(service: Partial<WorkspaceAccountService>) {
  return buildApp({
    workspaceAccountService: service as WorkspaceAccountService,
  });
}

describe("owner legal name routes (BL-080)", () => {
  it("reads the caller's own legal name for the workspace in the path", async () => {
    const getOwnLegalName = vi.fn(async () => name);
    const response = await appWith({ getOwnLegalName }).inject({
      method: "GET",
      url: `${url}?actorUserId=spoofed`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ legalName: name });
    expect(getOwnLegalName).toHaveBeenCalledWith(accessToken, workspaceId);
  });

  it("says plainly when no legal name is on file", async () => {
    const response = await appWith({
      getOwnLegalName: vi.fn(async () => null),
    }).inject({ method: "GET", url, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ legalName: null });
  });

  it("saves the legal name with the path workspace and nothing from the body's identity", async () => {
    const saveOwnLegalName = vi.fn(async () => undefined);
    const response = await appWith({ saveOwnLegalName }).inject({
      method: "PUT",
      url,
      headers,
      payload: { ...name, firstName: "  Ayla ", workspaceId: "spoofed" },
    });
    expect(response.statusCode).toBe(204);
    expect(saveOwnLegalName).toHaveBeenCalledWith(accessToken, workspaceId, name);
  });

  it.each([
    [{ firstName: "", middleName: "", lastName: "Demir" }],
    [{ firstName: "Ayla", middleName: "", lastName: "   " }],
    // KARARLAR "Form ve girdi kuralları (ABD)" (BL-503).
    [{ firstName: "Ayşe", middleName: "", lastName: "Demir" }],
    [{ firstName: "Mert", middleName: "", lastName: "Tepebaş" }],
    [{ firstName: "A".repeat(81), middleName: "", lastName: "Demir" }],
    [{ firstName: "Ayla", lastName: "Demir" }],
  ])("refuses an incomplete name before the database sees it: %j", async (payload) => {
    const saveOwnLegalName = vi.fn(async () => undefined);
    const response = await appWith({ saveOwnLegalName }).inject({
      method: "PUT",
      url,
      headers,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(saveOwnLegalName).not.toHaveBeenCalled();
  });

  it("refuses a malformed workspace id and a missing session", async () => {
    const getOwnLegalName = vi.fn();
    const app = appWith({ getOwnLegalName });
    const bad = await app.inject({
      method: "GET",
      url: "/v1/account/workspaces/nope/legal-name",
      headers,
    });
    expect(bad.statusCode).toBe(400);
    const anonymous = await app.inject({ method: "GET", url });
    expect(anonymous.statusCode).toBe(401);
    expect(getOwnLegalName).not.toHaveBeenCalled();
  });

  it.each([
    ["authz.owner_only", "42501", 403],
    ["authz.workspace_closed", "42501", 403],
    ["authz.not_member", "42501", 404],
  ])("answers the core's %s with %s -> %i", async (hint, code, status) => {
    const refuse = vi.fn(async () => {
      throw rpcFailure({ message: "not allowed", code, hint });
    });
    const app = appWith({ getOwnLegalName: refuse, saveOwnLegalName: refuse });
    for (const method of ["GET", "PUT"] as const) {
      const response = await app.inject({
        method,
        url,
        headers,
        ...(method === "PUT" ? { payload: name } : {}),
      });
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: "not allowed", reason: hint, requestId: expect.any(String) });
    }
  });

  it("maps a missing record to 404 and the database's own validation to 400", async () => {
    const missing = vi.fn(async () => {
      throw rpcFailure({ message: "employee not found", code: "P0002" });
    });
    const invalid = vi.fn(async () => {
      throw rpcFailure({
        message: "a legal name needs a first and a last name",
        code: "22023",
      });
    });
    const notFound = await appWith({ saveOwnLegalName: missing }).inject({
      method: "PUT",
      url,
      headers,
      payload: name,
    });
    expect(notFound.statusCode).toBe(404);
    const refused = await appWith({ saveOwnLegalName: invalid }).inject({
      method: "PUT",
      url,
      headers,
      payload: name,
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({
      error: "a legal name needs a first and a last name",
      requestId: expect.any(String),
    });
  });
});

describe("ownership transfer to somebody without a legal name (BL-080)", () => {
  it("passes the refusal's key to the screen", async () => {
    const initiateOwnershipTransfer = vi.fn(async () => {
      throw rpcFailure({
        message: "the new owner has no legal name on file yet",
        code: "23514",
        hint: "transfer.target_legal_name_missing",
      });
    });
    const verifyPassword = vi.fn(async () => undefined);
    const response = await appWith({ initiateOwnershipTransfer, verifyPassword }).inject({
      method: "POST",
      url: `/v1/account/workspaces/${workspaceId}/ownership-transfer`,
      headers,
      payload: { targetUserId: userId, password: "correct horse battery staple" },
    });
    // 23514 is a 400 in statusForPostgresCode; the screen keys on the reason.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "the new owner has no legal name on file yet",
      reason: "transfer.target_legal_name_missing",
      requestId: expect.any(String),
    });
  });
});

describe("owner legal name service (BL-080)", () => {
  it("reads through get_own_legal_name_service with the verified actor", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { legal_first_name: "Ayla", legal_middle_name: "", legal_last_name: "Demir" },
      ],
      error: null,
    }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });
    await expect(service.getOwnLegalName(accessToken, workspaceId)).resolves.toEqual(
      name,
    );
    expect(rpc).toHaveBeenCalledWith("get_own_legal_name_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
    });
  });

  it("returns null when the one row it always answers holds no name", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { legal_first_name: null, legal_middle_name: null, legal_last_name: null },
      ],
      error: null,
    }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });
    await expect(service.getOwnLegalName(accessToken, workspaceId)).resolves.toBeNull();
  });

  it("saves through save_owner_legal_name_service", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });
    await service.saveOwnLegalName(accessToken, workspaceId, name);
    expect(rpc).toHaveBeenCalledWith("save_owner_legal_name_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      legal_first_name: "Ayla",
      legal_middle_name: "",
      legal_last_name: "Demir",
    });
  });

  it("carries the core's refusal key out of the service", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "owner only", code: "42501", hint: "authz.owner_only" },
    }));
    const service = createWorkspaceAccountServiceWithClients({
      rpcClient: { rpc },
      resolveActorUserId: async () => userId,
    });
    await expect(
      service.saveOwnLegalName(accessToken, workspaceId, name),
    ).rejects.toMatchObject({ statusCode: 403, reason: "authz.owner_only" });
  });
});
