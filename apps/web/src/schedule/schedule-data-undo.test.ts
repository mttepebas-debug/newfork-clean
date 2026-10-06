import type { ScheduleEditSession } from "@newfork/shared/schedule";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isNothingToUndo, undoScheduleEditSessionStep } from "./schedule-data";

vi.mock("../lib/supabase", () => ({
  supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
  getTabWorkspaceId: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

const session: ScheduleEditSession = {
  id: "77777777-7777-4777-8777-777777777777",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-08-17",
  source_kind: "draft",
  source_draft_id: "33333333-3333-4333-8333-333333333333",
  source_revision: 1,
  holder_user_id: "88888888-8888-4888-8888-888888888888",
  holder_name: "Ayse Yilmaz",
  revision: 4,
  dirty: true,
  last_heartbeat: "2026-08-17T12:00:00Z",
  expires_at: "2026-08-17T12:04:00Z",
  location_ids: ["22222222-2222-4222-8222-222222222222"],
  shifts: [],
  undo_depth: 2,
};

// S2 (KK-171): Undo goes back on the server, one step per press.
describe("undoScheduleEditSessionStep", () => {
  it("asks the server to take this edit's last step back, from the revision on screen", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ ...session, revision: 5, undo_depth: 1 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const next = await undoScheduleEditSessionStep(session.workspace_id, session);

    expect(next.undo_depth).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/schedule/edit-sessions/${session.id}/undo`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ expected_session_revision: 4 });
  });

  it("knows the server had nothing left to undo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "nothing to undo", reason: "schedule.nothing_to_undo" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )));

    const error = await undoScheduleEditSessionStep(session.workspace_id, session).then(() => null, (failure: unknown) => failure);

    expect(isNothingToUndo(error)).toBe(true);
  });
});
