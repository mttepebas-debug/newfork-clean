import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountProfileSchema } from "@newfork/shared";
import * as supabaseModule from "./supabase";
import {
  apiRequest,
  clearTabWorkspaceId,
  ensureSessionAlive,
  getTabWorkspaceId,
  initiateWorkspaceOwnershipTransfer,
  loadAccountProfile,
  loadAccountDeletionBlockers,
  requestAccountEmailChange,
  requestWorkspaceClosure,
  resolveWorkspaceContext,
  respondWorkspaceOwnershipTransfer,
  restoreAccountDeletionWithToken,
  saveAccountProfile,
  selectActiveWorkspace,
  setTabWorkspaceId,
  tabWorkspaceIdStorageKey,
} from "./supabase";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

function client(): SupabaseClient {
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "session-token" } },
      })),
      getUser: vi.fn(async () => ({ data: { user: {} }, error: null })),
    },
  } as unknown as SupabaseClient;
}

describe("ensureSessionAlive", () => {
  beforeEach(() => window.sessionStorage.clear());

  function authClient(session: unknown, userError: unknown) {
    const signOut = vi.fn(async () => ({ error: null }));
    return {
      signOut,
      client: {
        auth: {
          getSession: vi.fn(async () => ({ data: { session } })),
          getUser: vi.fn(async () => ({ data: { user: null }, error: userError })),
          signOut,
        },
      } as unknown as SupabaseClient,
    };
  }

  it("keeps a session the auth server still accepts", async () => {
    const { client: live, signOut } = authClient({ access_token: "t" }, null);
    expect(await ensureSessionAlive(live)).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out locally and leaves a note when the server ended the session", async () => {
    const { client: ended, signOut } = authClient(
      { access_token: "t" },
      { name: "AuthApiError", status: 403, message: "session not found" },
    );
    expect(await ensureSessionAlive(ended)).toBe(false);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(window.sessionStorage.getItem("newfork.sessionExpired")).toBe("1");
  });

  it("does not leave a second note once the session is already gone", async () => {
    const { client: gone, signOut } = authClient(null, { message: "missing" });
    expect(await ensureSessionAlive(gone)).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("newfork.sessionExpired")).toBeNull();
  });
});

describe("tab workspace context", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores a validated workspace id only for the current tab", () => {
    setTabWorkspaceId(workspaceId);

    expect(window.sessionStorage.getItem(tabWorkspaceIdStorageKey)).toBe(
      workspaceId,
    );
    expect(getTabWorkspaceId()).toBe(workspaceId);

    clearTabWorkspaceId();
    expect(getTabWorkspaceId()).toBeNull();
  });

  it("validates selected workspace context with the tab workspace header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(null), { status: 200 })),
    );

    await selectActiveWorkspace(client(), workspaceId);

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(
      new Headers((init as RequestInit).headers).get("X-Newfork-Workspace-Id"),
    ).toBe(workspaceId);
    expect(getTabWorkspaceId()).toBe(workspaceId);
  });

  it("sends the session's bearer token and the tab workspace with API requests", async () => {
    setTabWorkspaceId(workspaceId);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await expect(apiRequest(client(), "/v1/workspaces/test")).resolves.toEqual({
      ok: true,
    });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe("Bearer session-token");
    expect(headers.get("X-Newfork-Workspace-Id")).toBe(workspaceId);
  });

  it("keeps the status and reason of a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Forbidden", reason: "authz.out_of_scope" }), {
            status: 403,
          }),
      ),
    );

    await expect(apiRequest(client(), "/v1/workspaces/test")).rejects.toMatchObject({
      status: 403,
      reason: "authz.out_of_scope",
    });
  });

  it("clears stale tab context and retries the account default context", async () => {
    setTabWorkspaceId(workspaceId);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: "Invalid session or membership" }),
            { status: 401 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(null), { status: 200 }),
        ),
    );

    await expect(resolveWorkspaceContext(client())).resolves.toBeNull();

    expect(getTabWorkspaceId()).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const [, retryInit] = vi.mocked(fetch).mock.calls[1]!;
    expect(
      new Headers((retryInit as RequestInit).headers).has(
        "X-Newfork-Workspace-Id",
      ),
    ).toBe(false);
  });
});

describe("account profile persistence", () => {
  // AVATAR-IKON: the account keeps no avatar; each workspace has the person's own.
  it("loads the account phone and personal formats, and no avatar", async () => {
    const results = {
      user_profiles: {
        data: {
          display_name: "Alex Kim",
          phone_e164: "+13105550100",
        },
        error: null,
      },
      user_preferences: {
        data: {
          theme: "dark",
          time_format: "24h",
          date_format: "YYYY-MM-DD",
        },
        error: null,
      },
    } as const;
    const select = vi.fn();
    const from = vi.fn((table: keyof typeof results) => {
      const chain = {
        select: select.mockImplementation(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => results[table]),
      };
      return chain;
    });
    const storageFrom = vi.fn();
    const profile = await loadAccountProfile(
      {
        from,
        storage: { from: storageFrom },
      } as unknown as SupabaseClient,
      {
        id: workspaceId,
        email: "alex@example.test",
        user_metadata: {},
      } as never,
    );

    expect(profile).toMatchObject({
      phone: "+13105550100",
      timeFormat: "24h",
      dateFormat: "YYYY-MM-DD",
    });
    expect(profile).not.toHaveProperty("avatarUrl");
    expect(storageFrom).not.toHaveBeenCalled();
    // The account keeps one phone column (BL-969).
    expect(select).toHaveBeenCalledWith("display_name,phone_e164");
  });

  it("writes the canonical phone and display preferences, and no avatar", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    const profile = accountProfileSchema.parse({
      userId: workspaceId,
      email: "alex@example.test",
      displayName: "Alex Kim",
      phone: "+13105550100",
      theme: "dark",
      timeFormat: "24h",
      dateFormat: "YYYY-MM-DD",
    });

    await saveAccountProfile({ from } as unknown as SupabaseClient, profile);

    expect(upsert).toHaveBeenCalledWith({
      user_id: workspaceId,
      display_name: "Alex Kim",
      phone_e164: "+13105550100",
      updated_at: expect.any(String),
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "dark",
        time_format: "24h",
        date_format: "YYYY-MM-DD",
      }),
    );
  });

  // TEL-2: a workspace record refuses an emergency number equal to its own,
  // and the account's number reaches the record; the screen says it in words.
  it("says so when the new number is the emergency contact's somewhere", async () => {
    const upsert = vi.fn(async () => ({
      error: {
        code: "23514",
        message:
          'new row for relation "employee_private_profiles" violates check constraint "employee_private_profiles_emergency_is_not_own_phone"',
      },
    }));
    const from = vi.fn(() => ({ upsert }));
    const profile = accountProfileSchema.parse({
      userId: workspaceId,
      email: "alex@example.test",
      displayName: "Alex Kim",
      phone: "+13105550100",
      theme: "system",
      timeFormat: "12h",
      dateFormat: "system",
    });

    await expect(saveAccountProfile({ from } as unknown as SupabaseClient, profile)).rejects.toThrow(
      "This number is your emergency contact's in a workspace. Change that contact first.",
    );
  });

  // AVATAR-IKON: the browser no longer writes an account photo to storage; the avatar goes
  // through the API per workspace (src/avatar/avatar-data.ts).
  it("keeps no account photo helpers", () => {
    for (const gone of [
      "uploadAccountAvatar",
      "removeAccountAvatar",
      "accountProfileAvatarBucket",
      "getCurrentUserWorkspaceAvatar",
    ])
      expect(supabaseModule).not.toHaveProperty(gone);
  });
});

describe("account security API contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends authenticated email-change requests and reads deletion blockers", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              email: "owner@example.test",
              pendingEmail: "next@example.test",
              emailChangeSentAt: "2026-09-14T12:00:00.000Z",
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              blockers: [
                {
                  kind: "active_membership",
                  workspace_id: workspaceId,
                  workspace_name: "Newfork Cafe",
                  role_name: "Owner",
                  is_owner: true,
                },
              ],
            }),
            { status: 200 },
          ),
        ),
    );

    await expect(
      requestAccountEmailChange(client(), "next@example.test"),
    ).resolves.toMatchObject({ pendingEmail: "next@example.test" });
    await expect(loadAccountDeletionBlockers(client())).resolves.toHaveLength(1);

    const [emailUrl, emailInit] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(emailUrl)).toContain("/v1/account/security/email-change");
    expect(emailInit).toMatchObject({
      method: "POST",
      body: JSON.stringify({ newEmail: "next@example.test" }),
    });
    expect(new Headers((emailInit as RequestInit).headers).get("Authorization")).toBe(
      "Bearer session-token",
    );
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toContain(
      "/v1/account/security/deletion/blockers",
    );
  });

  it("restores with a public token without attaching an account session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ status: "restored", loginUrl: "/sign-in" }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      restoreAccountDeletionWithToken("one-time-recovery-token"),
    ).resolves.toEqual({ status: "restored", loginUrl: "/sign-in" });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("/v1/account/security/deletion/recovery");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ token: "one-time-recovery-token" }),
    });
    expect(new Headers((init as RequestInit).headers).has("Authorization")).toBe(false);
  });
});

// SEC-003: the password goes to the API, which signs in with it; the browser
// no longer signs in again to make its token look fresh.
describe("workspace lifecycle password", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the password with closing, handing over and accepting a workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    const transferId = "81000000-0000-4000-8000-000000000001";
    const targetUserId = "10000000-0000-4000-8000-000000000003";

    await requestWorkspaceClosure(client(), {
      workspaceId,
      mode: "immediate",
      typedWorkspaceName: "Meyhouse",
      password: "pass word ",
    });
    await initiateWorkspaceOwnershipTransfer(client(), {
      workspaceId,
      targetUserId,
      password: "pass word ",
    });
    await respondWorkspaceOwnershipTransfer(client(), {
      workspaceId,
      transferId,
      action: "accept",
      password: "pass word ",
    });
    await respondWorkspaceOwnershipTransfer(client(), {
      workspaceId,
      transferId,
      action: "reject",
    });

    const bodies = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    // Sent as typed: a password may end in a space.
    expect(bodies[0]).toMatchObject({ mode: "immediate", password: "pass word " });
    expect(bodies[1]).toEqual({ targetUserId, password: "pass word " });
    expect(bodies[2]).toEqual({ transferId, action: "accept", password: "pass word " });
    expect(bodies[3]).toEqual({ transferId, action: "reject" });
  });
});
