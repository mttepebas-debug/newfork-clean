import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationSettings,
  saveNotificationPolicy,
} from "./notification-settings-data";

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

describe("notification settings data", () => {
  it("reads and validates the workspace settings response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          workspace_id: workspaceId,
          can_write: true,
          catalog: [],
          policies: [],
          roles: [],
          locations: [],
          audit: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNotificationSettings(workspaceId)).resolves.toMatchObject({
      workspace_id: workspaceId,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/workspaces/${workspaceId}/notification-settings`),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
      }),
    );
  });

  it("surfaces the API conflict message for optimistic rollback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "notification policy stale version" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      saveNotificationPolicy(workspaceId, {
        type_key: "schedule.published",
        schema_version: 1,
        scope: { kind: "global", id: null },
        expected_version: null,
        enabled: false,
        allowed_channels: ["in_app"],
        cadence: "immediate",
        reason: "Pause schedule notices",
      }),
    ).rejects.toThrow("notification policy stale version");
  });
});
