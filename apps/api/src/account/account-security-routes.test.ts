import { createHash } from "node:crypto";
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

async function appWith(
  accountSecurityService: AccountSecurityService | null,
  recoveryResendFloorMs = 0,
  extra: {
    recoveryResendBudgetMs?: number;
    claimRecoveryResend?: (addressDigest: string) => Promise<boolean>;
  } = {},
) {
  const app = Fastify();
  registerAccountSecurityRoutes(app, {
    service: accountSecurityService,
    recoveryResendFloorMs,
    recoveryResendBudgetMs: extra.recoveryResendBudgetMs ?? 0,
    claimRecoveryResend: extra.claimRecoveryResend ?? (async () => true),
  });
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

  it.each([
    ["/v1/account/security/password", { currentPassword: "", newPassword: "new-password", confirmPassword: "new-password" }],
    ["/v1/account/security/sessions/sign-out-others", { currentPassword: "" }],
    ["/v1/account/security/deletion", {}],
  ])("answers an empty current password with 400 session.password_required (%s)", async (url, payload) => {
    const svc = service();
    const app = await appWith(svc);
    const response = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${accessToken}` },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Current password required",
      reason: "session.password_required",
    });
    expect(svc.changePassword).not.toHaveBeenCalled();
    expect(svc.signOutOtherSessions).not.toHaveBeenCalled();
    expect(svc.requestAccountDeletion).not.toHaveBeenCalled();
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

  it("answers a recovery resend no sooner than its floor, account or not (BL-279)", async () => {
    const app = await appWith(
      service({ resendAccountDeletionRecovery: vi.fn(async () => undefined) }),
      80,
    );
    const started = Date.now();
    const response = await app.inject({
      method: "POST",
      url: "/v1/account/security/deletion/recovery/resend",
      payload: { email: "nobody@example.test" },
    });
    expect(response.statusCode).toBe(202);
    expect(Date.now() - started).toBeGreaterThanOrEqual(75);
    await app.close();
  });

  it("cuts a slow resend at its budget, so an account with a pending deletion answers like any other (G5 review)", async () => {
    const signals: AbortSignal[] = [];
    const resendAccountDeletionRecovery = vi.fn(
      (email: string, signal?: AbortSignal) =>
        new Promise<void>((resolve) => {
          if (signal) signals.push(signal);
          // Only the pending account's send is slow; the unknown email returns at once.
          if (email === "unknown@example.test") resolve();
        }),
    );
    const app = await appWith(service({ resendAccountDeletionRecovery }), 120, {
      recoveryResendBudgetMs: 60,
    });
    const answers: { status: number; body: string; ms: number }[] = [];
    for (const email of ["pending@example.test", "unknown@example.test"]) {
      const started = Date.now();
      const response = await app.inject({
        method: "POST",
        url: "/v1/account/security/deletion/recovery/resend",
        payload: { email },
      });
      answers.push({ status: response.statusCode, body: response.body, ms: Date.now() - started });
    }
    expect(answers.map(({ status, body }) => ({ status, body }))).toEqual([
      { status: 202, body: JSON.stringify({ status: "accepted" }) },
      { status: 202, body: JSON.stringify({ status: "accepted" }) },
    ]);
    for (const { ms } of answers) {
      expect(ms).toBeGreaterThanOrEqual(115);
      expect(ms).toBeLessThan(400);
    }
    expect(signals[0]?.aborted).toBe(true);
    await app.close();
  });

  it("refuses a caller over its hourly resend limit without looking up the email", async () => {
    const resendAccountDeletionRecovery = vi.fn(async () => undefined);
    const claimRecoveryResend = vi.fn(async () => false);
    const app = await appWith(service({ resendAccountDeletionRecovery }), 0, {
      claimRecoveryResend,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/account/security/deletion/recovery/resend",
      headers: { "x-real-ip": "203.0.113.7" },
      payload: { email: "owner@example.test" },
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("3600");
    expect(claimRecoveryResend).toHaveBeenCalledWith(
      createHash("sha256").update("203.0.113.7").digest("hex"),
    );
    expect(resendAccountDeletionRecovery).not.toHaveBeenCalled();
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
