import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteScheduleDraft, isEditLeaseExpired, isEditSessionStale, listScheduleTemplates, ScheduleRequestError } from "./schedule-data";

vi.mock("../lib/supabase", () => ({
  supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
  getTabWorkspaceId: () => null,
}));

afterEach(() => vi.unstubAllGlobals());

async function failure(response: Response | Error): Promise<unknown> {
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }));
  return listScheduleTemplates("workspace").then(() => null, (error: unknown) => error);
}

// D-O6: a draft someone is editing cannot be deleted; the person reads why.
describe("deleting a draft someone is editing", () => {
  it("says the draft is being edited instead of the database's words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "draft is being edited", reason: "schedule.draft_being_edited" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )));
    const error = await deleteScheduleDraft("workspace", "draft").then(() => null, (failure: unknown) => failure);
    expect((error as Error).message).toBe("Someone is editing this draft. Try again when they finish.");
  });
});

describe("Schedule request failures read as plain sentences (D-O7)", () => {
  it("does not show the HTML of a 502 page or a JSON parse error", async () => {
    const error = await failure(new Response("<html><body>502 Bad Gateway</body></html>", {
      status: 502, headers: { "Content-Type": "text/html" },
    }));
    expect(error).toBeInstanceOf(ScheduleRequestError);
    expect((error as ScheduleRequestError).status).toBe(502);
    expect((error as Error).message).toBe("Newfork could not finish that. Try again in a moment.");
  });

  it("says the connection dropped instead of the browser's Failed to fetch", async () => {
    const error = await failure(new TypeError("Failed to fetch"));
    expect(error).toBeInstanceOf(ScheduleRequestError);
    expect((error as Error).message).toBe("Newfork could not be reached. Check your connection and try again.");
  });

  it("knows a lapsed lock and a stale edit by the API's code, whatever the sentence says", async () => {
    const lapsed = await failure(Response.json({ error: "anything", code: "edit_lease_expired" }, { status: 409 }));
    const stale = await failure(Response.json({ error: "anything", code: "edit_session_stale" }, { status: 409 }));
    const other = await failure(Response.json({ error: "edit lease expired" }, { status: 409 }));
    expect([isEditLeaseExpired(lapsed), isEditSessionStale(lapsed)]).toEqual([true, false]);
    expect([isEditLeaseExpired(stale), isEditSessionStale(stale)]).toEqual([false, true]);
    expect([isEditLeaseExpired(other), isEditSessionStale(other)]).toEqual([false, false]);
  });
});
