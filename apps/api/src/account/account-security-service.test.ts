import { describe, expect, it, vi } from "vitest";
import {
  createAccountSecurityService,
  createAccountSecurityServiceWithClients,
  tokenDigest,
  createRecoveryEmailDelivery,
} from "./account-security-service";

const supabase = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  adminSignOut: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: supabase.rpc,
    auth: {
      getUser: supabase.getUser,
      signInWithPassword: supabase.signInWithPassword,
      signOut: supabase.signOut,
      admin: { signOut: supabase.adminSignOut },
    },
  }),
}));

const userId = "73000000-0000-4000-8000-000000000001";
const requestId = "73000000-0000-4000-8000-000000000002";
const accessToken = "access-token";

function authGateway(overrides: Record<string, unknown> = {}) {
  return {
    getUser: vi.fn(async () => ({
      id: userId,
      email: "OWNER@example.test",
      new_email: "next@example.test",
      email_change_sent_at: "2026-09-14T12:00:00.000Z",
    })),
    updateEmail: vi.fn(async (_token: string, email: string) => ({
      id: userId,
      email: "owner@example.test",
      new_email: email,
      email_change_sent_at: "2026-09-14T12:01:00.000Z",
    })),
    resendEmailChange: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    verifyPassword: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    setBan: vi.fn(async () => undefined),
    ...overrides,
  };
}

function serviceFixture(options: {
  blockers?: unknown[];
  resendResult?: unknown;
  authOverrides?: Record<string, unknown>;
} = {}) {
  const auth = authGateway(options.authOverrides);
  const deliverRecoveryEmail = vi.fn(async () => undefined);
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
    if (name === "get_account_deletion_blockers_service")
      return { data: options.blockers ?? [], error: null };
    if (name === "request_account_deletion_v2_service")
      return {
        data: {
          status: "pending",
          request_id: requestId,
          email: "owner@example.test",
          restore_until: "2026-09-28T12:00:00.000Z",
        },
        error: null,
      };
    if (name === "restore_account_deletion_by_token_service")
      return { data: { status: "restored", user_id: userId }, error: null };
    if (name === "prepare_account_deletion_recovery_resend_service")
      return { data: options.resendResult ?? null, error: null };
    return { data: null, error: null };
  });
  const service = createAccountSecurityServiceWithClients({
    rpcClient: { rpc },
    authGateway: auth,
    appUrl: "https://app.newfork.test",
    deliverRecoveryEmail,
  });
  return { service, auth, rpc, deliverRecoveryEmail };
}

describe("account security service", () => {
  it("records safe observed events using the authenticated user, never email or credentials", async () => {
    const { service, rpc } = serviceFixture();
    await service.requestEmailChange(accessToken, "new@example.test");
    await service.changePassword(accessToken, "old-password", "new-password");
    await service.signOutOtherSessions(accessToken, "current-password");
    // BILDIRIM-01 (K4): the audit trail is written by its own entry point, not the notification wrapper
    // the notification teardown removes; each event once.
    expect(rpc).not.toHaveBeenCalledWith("record_account_security_notification_service", expect.anything());
    const calls = rpc.mock.calls.filter(([name]) => name === "record_account_security_event_service");
    expect(calls.map(([, args]) => args)).toEqual([
      { actor_user_id: userId, target_event: "account.email_change_requested" },
      { actor_user_id: userId, target_event: "account.password_changed" },
      { actor_user_id: userId, target_event: "account.sessions_revoked" },
      { actor_user_id: userId, target_event: "account.sessions_revoked" },
    ]);
  });
  it("does not emit password success when Auth rejects the operation", async () => {
    const { service, rpc } = serviceFixture({ authOverrides: { updatePassword: vi.fn(async () => { throw new Error("incorrect password"); }) } });
    await expect(service.changePassword(accessToken, "incorrect", "new-password")).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalledWith("record_account_security_event_service", expect.anything());
  });
  it("never marks an unconfigured local recovery sender as successful", async () => {
    await expect(createRecoveryEmailDelivery({ production: false })({ email: "fixture@example.test", recoveryUrl: "https://app.example.test/account-recovery", restoreUntil: "2026-10-01", kind: "initial", idempotencyKey: "fixture" })).rejects.toThrow("delivery is not configured");
  });

  it("projects pending email state and supports request, resend, and cancellation", async () => {
    const { service, auth, rpc } = serviceFixture();

    await expect(service.getSecurityState(accessToken)).resolves.toEqual({
      email: "owner@example.test",
      pendingEmail: "next@example.test",
      emailChangeSentAt: "2026-09-14T12:00:00.000Z",
      emailVerified: false,
    });
    await expect(
      service.requestEmailChange(accessToken, " NEW@example.test "),
    ).resolves.toMatchObject({ pendingEmail: "new@example.test" });
    await service.resendEmailChange(accessToken);
    await service.cancelEmailChange(accessToken);

    expect(auth.updateEmail).toHaveBeenCalledWith(accessToken, "new@example.test");
    expect(auth.resendEmailChange).toHaveBeenCalledWith("next@example.test");
    expect(rpc).toHaveBeenCalledWith("cancel_account_email_change_service", {
      actor_user_id: userId,
    });
  });

  it("changes the password and revokes only other sessions", async () => {
    const { service, auth } = serviceFixture();
    await service.changePassword(accessToken, "old-password", "new-password");
    expect(auth.verifyPassword).toHaveBeenCalledWith(
      userId,
      "old-password",
    );
    expect(auth.updatePassword).toHaveBeenCalledWith(
      accessToken,
      "old-password",
      "new-password",
    );
    expect(auth.signOut).toHaveBeenCalledWith(accessToken, "others");
  });

  it("keeps the password and every session when the current password is wrong", async () => {
    const { service, auth, rpc } = serviceFixture({
      authOverrides: {
        verifyPassword: vi.fn(async () => {
          throw new Error("Current password is incorrect");
        }),
      },
    });
    await expect(
      service.changePassword(accessToken, "wrong-password", "new-password"),
    ).rejects.toThrow("Current password is incorrect");
    expect(auth.updatePassword).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("verifies the current password before signing out other sessions", async () => {
    const { service, auth } = serviceFixture();
    await service.signOutOtherSessions(accessToken, "current-password");
    expect(auth.verifyPassword).toHaveBeenCalledWith(
      userId,
      "current-password",
    );
    expect(auth.signOut).toHaveBeenCalledWith(accessToken, "others");
  });

  it("returns concrete blockers without creating a deletion request", async () => {
    const blocker = {
      kind: "active_membership",
      workspace_id: "73000000-0000-4000-8000-000000000010",
      workspace_name: "Meyhouse",
      role_name: "Owner",
      is_owner: true,
    };
    const { service, auth, rpc, deliverRecoveryEmail } = serviceFixture({
      blockers: [blocker],
    });

    await expect(
      service.requestAccountDeletion(accessToken, "current-password"),
    ).rejects.toThrow("Account deletion blocked");
    expect(auth.verifyPassword).toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith(
      "request_account_deletion_v2_service",
      expect.anything(),
    );
    expect(deliverRecoveryEmail).not.toHaveBeenCalled();
    expect(auth.setBan).not.toHaveBeenCalled();
  });

  it("leaves the account untouched when deletion is asked with a wrong password", async () => {
    const { service, auth, rpc, deliverRecoveryEmail } = serviceFixture({
      authOverrides: {
        verifyPassword: vi.fn(async () => {
          throw new Error("Current password is incorrect");
        }),
      },
    });
    await expect(
      service.requestAccountDeletion(accessToken, "wrong-password"),
    ).rejects.toThrow("Current password is incorrect");
    expect(rpc).not.toHaveBeenCalledWith(
      "get_account_deletion_blockers_service",
      expect.anything(),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "request_account_deletion_v2_service",
      expect.anything(),
    );
    expect(deliverRecoveryEmail).not.toHaveBeenCalled();
    expect(auth.setBan).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("persists only a digest, locks the account and its sessions, then delivers the raw recovery link (BL-279)", async () => {
    const { service, auth, rpc, deliverRecoveryEmail } = serviceFixture();
    await expect(
      service.requestAccountDeletion(accessToken, "current-password"),
    ).resolves.toMatchObject({ status: "pending", request_id: requestId });

    const deliveryCall = deliverRecoveryEmail.mock.calls[0] as unknown as
      | [{ recoveryUrl: string }]
      | undefined;
    const recoveryUrl = String(deliveryCall?.[0].recoveryUrl);
    const rawToken = new URL(recoveryUrl).searchParams.get("token");
    expect(rawToken).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("request_account_deletion_v2_service", {
      actor_user_id: userId,
      recovery_token_digest: tokenDigest(String(rawToken)),
    });
    expect(rpc).toHaveBeenCalledWith("mark_account_deletion_email_sent_service", {
      target_request_id: requestId,
      delivery_kind: "initial",
    });
    expect(auth.setBan).toHaveBeenCalledWith(userId, "876000h");
    expect(auth.signOut).toHaveBeenCalledWith(accessToken, "global");
    const order = (mock: { mock: { invocationCallOrder: number[] } }) =>
      mock.mock.invocationCallOrder[0] ?? Infinity;
    expect(order(auth.setBan as never)).toBeLessThan(order(deliverRecoveryEmail));
    expect(order(auth.signOut as never)).toBeLessThan(order(deliverRecoveryEmail));
  });

  it("hands the route's cut-off signal to the resent recovery email (G5 review)", async () => {
    const { service, deliverRecoveryEmail } = serviceFixture({
      resendResult: {
        request_id: requestId,
        email: "owner@example.test",
        restore_until: "2026-10-13T12:00:00.000Z",
      },
    });
    const signal = new AbortController().signal;
    await service.resendAccountDeletionRecovery("Owner@Example.test", signal);
    expect(deliverRecoveryEmail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "resend", signal }),
    );
  });

  it("restores from a one-time token without creating a session", async () => {
    const { service, auth, rpc } = serviceFixture();
    await expect(service.restoreAccountDeletion("recovery-token-value")).resolves.toEqual({
      status: "restored",
      loginUrl: "https://app.newfork.test/sign-in",
    });
    expect(rpc).toHaveBeenCalledWith(
      "restore_account_deletion_by_token_service",
      { recovery_token_digest: tokenDigest("recovery-token-value") },
    );
    expect(auth.setBan).toHaveBeenCalledWith(userId, "none");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("keeps recovery resend enumeration-safe when no pending request exists", async () => {
    const { service, deliverRecoveryEmail } = serviceFixture();
    await expect(
      service.resendAccountDeletionRecovery("unknown@example.test"),
    ).resolves.toBeUndefined();
    expect(deliverRecoveryEmail).not.toHaveBeenCalled();
  });
});

describe("account security service against Supabase Auth", () => {
  it("refuses a wrong current password with 403 and its machine key before touching the password", async () => {
    supabase.getUser.mockResolvedValue({
      data: { user: { id: userId, email: "owner@example.test" } },
      error: null,
    });
    supabase.rpc.mockResolvedValue({ data: { result: "incorrect" }, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const service = createAccountSecurityService({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
      appUrl: "https://app.newfork.test",
    });

    await expect(
      service.changePassword(accessToken, "wrong-password", "new-password"),
    ).rejects.toMatchObject({
      message: "Current password is incorrect",
      statusCode: 403,
      reason: "session.password_incorrect",
    });
    // BL-283: the database checks it and counts the miss for this account.
    expect(supabase.rpc).toHaveBeenCalledWith("verify_account_password_service", {
      target_user_id: userId,
      candidate_password: "wrong-password",
    });
    expect(supabase.signInWithPassword).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(supabase.adminSignOut).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
