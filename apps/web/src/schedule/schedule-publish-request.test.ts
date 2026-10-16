import { afterEach, describe, expect, it, vi } from "vitest";
import type { SchedulePublicationPreview } from "@newfork/shared/schedule";

import { publishScheduleDraft } from "./schedule-data";

vi.mock("../lib/supabase", () => ({
  supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
  getTabWorkspaceId: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

// BILDIRIM-02 (KARARLAR S-123, S-96): with notifications gone, publishing
// names no one to notify; the API then enqueues nothing.
describe("the publish request", () => {
  it("carries no list of people to notify", async () => {
    const fetchMock = vi.fn(async () => Response.json({}, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const preview = {
      draft_id: "99999999-9999-4999-8999-999999999999",
      week_start: "2026-10-19",
      draft_revision: 2,
      fingerprint: "a".repeat(64),
      locations: [{ location_id: "11111111-1111-4111-8111-111111111111" }],
    } as unknown as SchedulePublicationPreview;

    // The empty answer fails the result's shape; only the request matters here.
    await publishScheduleDraft("workspace", preview, []).catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/schedule\/publish$/);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.draft_id).toBe(preview.draft_id);
    expect(body).not.toHaveProperty("notify_employee_ids");
    expect(body).not.toHaveProperty("target_notify_employee_ids");
    expect(String(init.body)).not.toMatch(/notify/i);
  });
});
