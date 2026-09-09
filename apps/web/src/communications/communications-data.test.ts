import { afterEach, describe, expect, it, vi } from "vitest";
import { getAnnouncements, getNotifications } from "./communications-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";

vi.mock("../lib/supabase", () => ({
  getApiAccessToken: vi.fn().mockResolvedValue("session-token"),
  getTabWorkspaceId: vi.fn(() => null),
  newforkApiUrl: "https://api.example.test",
  supabaseClient: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("communications data boundary", () => {
  it("rejects unsafe announcement action URLs before UI consumption", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            workspace_id: workspaceId,
            can_manage: false,
            locations: [],
            announcements: [
              {
                id: "a8200000-0000-4000-8000-000000000001",
                workspace_id: workspaceId,
                title: "Service briefing",
                body: "Doors open at four.",
                category: "operations",
                status: "published",
                audience_roles: ["employee"],
                location_ids: [],
                location_names: [],
                publish_at: null,
                published_at: "2026-09-05T12:00:00.000Z",
                expires_at: null,
                action_url: "https://outside.example/announcement",
                author_name: "Taylor",
                revision: 1,
                created_at: "2026-09-05T12:00:00.000Z",
                updated_at: "2026-09-05T12:00:00.000Z",
                read_at: null,
                can_edit: false,
                can_publish: false,
                can_cancel: false,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(getAnnouncements(workspaceId)).rejects.toThrow(
      "Action URL must stay inside the app",
    );
  });

  it("rejects unsafe notification action URLs before UI consumption", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            workspace_id: workspaceId,
            unread_count: 1,
            next_cursor: null,
            notifications: [
              {
                id: "a8300000-0000-4000-8000-000000000001",
                workspace_id: workspaceId,
                category: "schedule",
                type_key: "schedule.published",
                severity: "info",
                safe_preview: "Schedule updated",
                title: "Schedule published",
                body: "The weekly schedule is live.",
                action_url: "https://outside.example/schedule",
                group_key: "schedule:2026-09-07",
                source_type: "notification_event",
                source_id: "a8200000-0000-4000-8000-000000000001",
                created_at: "2026-09-02T12:00:00.000Z",
                seen_at: null,
                read_at: null,
                visibility_state: "visible",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(getNotifications(workspaceId)).rejects.toThrow(
      "Action URL must stay inside the app",
    );
  });
});
