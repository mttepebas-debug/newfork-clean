import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AccountSecurityService } from "./account-security-service";
import { registerAccountSecurityRoutes } from "./account-security-routes";
import { HttpError } from "../http-error.js";

const accessToken = "route-access-token";

function service(overrides: Partial<AccountSecurityService> = {}): AccountSecurityService {
  return {
    getNotificationPreferences: vi.fn(async () => ({ workspace_id: null, can_write: false, workspaces: [], catalog: [], preferences: [] })),
    getNotifications: vi.fn(async () => ({ workspace_id: null, unread_count: 0, next_cursor: null, notifications: [] })),
    actOnNotification: vi.fn(async () => ({ status: "saved" as const, affected: 1 })),
    getSecurityState: vi.fn(async () => ({
      email: "owner@example.test",
      pendingEmail: null,
      emailChangeSentAt: null,
      emailVerified: false,
    })),
    requestEmailChange: vi.fn(async () => ({
      email: "owner@example.test",
      pendingEmail: "next@example.test",
      emailChangeSentAt: null,
      emailVerified: false,
    })),
    resendEmailChange: vi.fn(async () => undefined),
    cancelEmailChange: vi.fn(async () => undefined),
    changePassword: vi.fn(async () => undefined),
    signOutOtherSessions: vi.fn(async () => undefined),
    getAccountDeletionBlockers: vi.fn(async () => []),
    requestAccountDeletion: vi.fn(async () => ({ status: "pending" })),
    restoreAccountDeletion: vi.fn(async () => ({
      status: "restored" as const,
      loginUrl: "/login",
    })),
    resendAccountDeletionRecovery: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function appWith(accountSecurityService: AccountSecurityService | null) {
  const app = Fastify();
  registerAccountSecurityRoutes(app, { service: accountSecurityService });
  await app.ready();
  return app;
}

describe("account security routes", () => {
  it("keeps account inbox independent of workspace or supplied actor IDs", async () => {
    const svc = service(); const app = await appWith(svc);
    const response = await app.inject({ method: "GET", url: "/v1/account/notifications?workspaceId=spoof&actorUserId=spoof", headers: { authorization: `Bearer ${accessToken}` } });
    expect(response.statusCode).toBe(200);
    expect(svc.getNotifications).toHaveBeenCalledWith(accessToken, { category: null, severity: null, readState: null, cursor: null, limit: 30 });
    expect((await app.inject({ method: "GET", url: "/v1/account/notifications" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/account/notifications?limit=1000", headers: { authorization: `Bearer ${accessToken}` } })).statusCode).toBe(400);
    await app.close();
  });

  it("requires a bearer session for account security state", async () => {
    const app = await appWith(service());
    const response = await app.inject({ method: "GET", url: "/v1/account/security" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Bearer token required" });
    await app.close();
  });

  it("validates password confirmation before changing a password", async () => {
    const changePassword = vi.fn(async () => undefined);
    const app = await appWith(service({ changePassword }));
    const response = await app.inject({
      method: "POST",
      url: "/v1/account/security/password",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        currentPassword: "old-password",
        newPassword: "new-password",
        confirmPassword: "different-password",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(changePassword).not.toHaveBeenCalled();
    await app.close();
  });

  it("answers a wrong current password with 403 and its machine key", async () => {
    const changePassword = vi.fn(async () => {
      throw new HttpError("Current password is incorrect", 403, {
        reason: "session.password_incorrect",
      });
    });
    const app = await appWith(service({ changePassword }));
    const response = await app.inject({
      method: "POST",
      url: "/v1/account/security/password",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        currentPassword: "wrong-password",
        newPassword: "new-password",
        confirmPassword: "new-password",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Current password is incorrect",
      reason: "session.password_incorrect",
    });
    await app.close();
  });

  it("requests deletion with current password only and ignores spoofed identity", async () => {
    const requestAccountDeletion = vi.fn(async () => ({ status: "pending" }));
    const app = await appWith(service({ requestAccountDeletion }));
    const response = await app.inject({
      method: "POST",
      url: "/v1/account/security/deletion",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        currentPassword: "current-password",
        actorUserId: "73000000-0000-4000-8000-000000000099",
        typedEmail: "spoof@example.test",
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(requestAccountDeletion).toHaveBeenCalledWith(
      accessToken,
      "current-password",
    );
    await app.close();
  });

  it("does not disclose recovery resend delivery or account existence", async () => {
    const resendAccountDeletionRecovery = vi.fn(async () => {
      throw new Error("delivery failed");
    });
    const app = await appWith(service({ resendAccountDeletionRecovery }));
    const response = await app.inject({
      method: "POST",
      url: "/v1/account/security/deletion/recovery/resend",
      payload: { email: "owner@example.test" },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "accepted" });
    await app.close();
  });

  it("returns the same generic error for every invalid recovery token", async () => {
    const restoreAccountDeletion = vi.fn(async () => {
      throw new Error("database details must stay private");
    });
    const app = await appWith(service({ restoreAccountDeletion }));
    const response = await app.inject({
      method: "POST",
      url: "/v1/account/security/deletion/recovery",
      payload: { token: "x".repeat(48) },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Valid recovery token required" });
    await app.close();
  });
});
