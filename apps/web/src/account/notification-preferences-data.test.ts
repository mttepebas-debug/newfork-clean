import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from "./notification-preferences-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

vi.mock("../lib/supabase", () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "session-token" } },
      }),
    },
  },
}));

afterEach(() => vi.unstubAllGlobals());

describe("notification preferences data", () => {
  it("reads personal preferences through the own-user API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          workspace_id: workspaceId,
          can_write: true,
          workspaces: [],
          catalog: [],
          preferences: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNotificationPreferences(workspaceId)).resolves.toMatchObject({
      workspace_id: workspaceId,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `/v1/workspaces/${workspaceId}/me/notification-preferences`,
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
      }),
    );
  });

  it("sends explicit user preference patches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "saved",
          preferences: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const patch = {
      updates: [
        {
          preference_scope: "type" as const,
          scope_key: "schedule.published",
          channel_preferences: { in_app: "disabled" as const },
          cadence: "daily_digest" as const,
          timezone: "America/Los_Angeles",
          quiet_hours: null,
          safe_preview_enabled: true,
          expected_version: 1,
        },
      ],
    };

    await saveNotificationPreferences(workspaceId, patch);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        `/v1/workspaces/${workspaceId}/me/notification-preferences`,
      ),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    );
  });
});
