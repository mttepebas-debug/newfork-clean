import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountProfileSchema } from "@newfork/shared";
import {
  accountProfileAvatarBucket,
  apiRequest,
  clearTabWorkspaceId,
  ensureSessionAlive,
  getTabWorkspaceId,
  loadAccountProfile,
  loadAccountDeletionBlockers,
  removeAccountAvatar,
  requestAccountEmailChange,
  resolveWorkspaceContext,
  restoreAccountDeletionWithToken,
  saveAccountProfile,
  selectActiveWorkspace,
  setTabWorkspaceId,
  tabWorkspaceIdStorageKey,
  uploadAccountAvatar,
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
  it("loads normalized legacy phone, personal formats and a signed private avatar", async () => {
    const avatarPath = `${workspaceId}/profile/fe201916-aa0e-480b-9144-1e1c8da20a31.jpg`;
    const results = {
      user_profiles: {
        data: {
          display_name: "Alex Kim",
          phone: "3105550100",
          phone_e164: null,
          avatar_object_path: avatarPath,
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
    const from = vi.fn((table: keyof typeof results) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => results[table]),
      };
      return chain;
    });
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://storage.example.test/signed-avatar" },
      error: null,
    }));
    const profile = await loadAccountProfile(
      {
        from,
        storage: {
          from: vi.fn(() => ({ createSignedUrl })),
        },
      } as unknown as SupabaseClient,
      {
        id: workspaceId,
        email: "alex@example.test",
        user_metadata: {},
      } as never,
    );

    expect(profile).toMatchObject({
      phone: "+13105550100",
      avatarObjectPath: avatarPath,
      avatarUrl: "https://storage.example.test/signed-avatar",
      timeFormat: "24h",
      dateFormat: "YYYY-MM-DD",
    });
    expect(createSignedUrl).toHaveBeenCalledWith(avatarPath, 3600);
  });

  it("writes the canonical phone, private avatar path and display preferences", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    const profile = accountProfileSchema.parse({
      userId: workspaceId,
      email: "alex@example.test",
      displayName: "Alex Kim",
      phone: "+13105550100",
      avatarObjectPath: `${workspaceId}/profile/fe201916-aa0e-480b-9144-1e1c8da20a31.jpg`,
      avatarUrl: "https://storage.example.test/signed-avatar",
      theme: "dark",
      timeFormat: "24h",
      dateFormat: "YYYY-MM-DD",
    });

    await saveAccountProfile({ from } as unknown as SupabaseClient, profile);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+13105550100",
        phone_e164: "+13105550100",
        avatar_object_path: profile.avatarObjectPath,
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "dark",
        time_format: "24h",
        date_format: "YYYY-MM-DD",
      }),
    );
  });

  it("uploads only supported private avatars and rejects cross-account removal", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "fe201916-aa0e-480b-9144-1e1c8da20a31",
    );
    const upload = vi.fn(async () => ({ data: {}, error: null }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://storage.example.test/signed-avatar" },
      error: null,
    }));
    const remove = vi.fn(async () => ({ data: {}, error: null }));
    const storageFrom = vi.fn(() => ({ upload, createSignedUrl, remove }));
    const storageClient = {
      storage: { from: storageFrom },
    } as unknown as SupabaseClient;

    await expect(
      uploadAccountAvatar(
        storageClient,
        workspaceId,
        new File(["avatar"], "avatar.png", { type: "image/png" }),
      ),
    ).resolves.toEqual({
      avatarObjectPath: `${workspaceId}/profile/fe201916-aa0e-480b-9144-1e1c8da20a31.png`,
      avatarUrl: "https://storage.example.test/signed-avatar",
    });
    expect(storageFrom).toHaveBeenCalledWith(accountProfileAvatarBucket);

    await expect(
      removeAccountAvatar(
        storageClient,
        workspaceId,
        "fe201916-aa0e-480b-9144-1e1c8da20a31/profile/fe201916-aa0e-480b-9144-1e1c8da20a31.png",
      ),
    ).rejects.toThrow("must belong to the account");
    expect(remove).not.toHaveBeenCalled();
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
