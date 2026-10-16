import { afterEach, describe, expect, it, vi } from "vitest";
import { record } from "./announcement-fixtures.test-util";
import { getAnnouncements } from "./communications-data";

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
  // EKRAN-08: one announcement record; a row in another shape never reaches a screen.
  it("reads the one announcement record and rejects a status it doesn't know", async () => {
    const list = (status: string) => ({
      workspace_id: workspaceId,
      can_manage: false,
      can_write_dates: false,
      can_read_dates: true,
      time_format: "12h",
      locations: [],
      people: [],
      departments: [],
      jobs: [],
      announcements: [
        record({ id: "a8200000-0000-4000-8000-000000000001", status: "published", display_status: status as "published" }),
      ],
    });
    const respond = (body: unknown) =>
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
        ),
      );
    respond(list("past"));
    expect((await getAnnouncements(workspaceId)).announcements[0]!.display_status).toBe("past");
    respond(list("expired"));
    await expect(getAnnouncements(workspaceId)).rejects.toThrow();
  });
});
