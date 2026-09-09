import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  apiRequest,
  clearTabWorkspaceId,
  developmentIdentityRoleStorageKey,
  getTabWorkspaceId,
  resolveWorkspaceContext,
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
    },
  } as unknown as SupabaseClient;
}

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

  it("uses development identity and tab workspace context for API requests", async () => {
    window.localStorage.setItem(developmentIdentityRoleStorageKey, "owner");
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
    expect(headers.get("Authorization")).toBe("Bearer development-owner-token");
    expect(headers.get("X-Newfork-Workspace-Id")).toBe(workspaceId);
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
