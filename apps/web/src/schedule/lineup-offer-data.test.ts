import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLineupOperation,
  getLineupOffers,
  respondToLineupOffer,
} from "./lineup-data";

vi.mock("../lib/supabase", () => ({
  getTabWorkspaceId: () => null,
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));
afterEach(() => vi.unstubAllGlobals());

describe("Line Up offer availability transport", () => {
  it("carries direct manager confirmation outside the reviewed operation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "applied" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const operation = {
      kind: "assign" as const,
      source_entry_id: null,
      target_entry_id: null,
      employee_id: "employee",
      target: {
        date: "2030-01-07",
        location_id: "location",
        job_id: "job",
        shift_type_id: "type",
        start_time: "18:00",
        end_time: "22:00",
        section_id: null,
        station: "",
      },
      reason: "Cover dinner",
      travel_minutes: 0,
    };
    await applyLineupOperation(
      "workspace",
      operation,
      "a".repeat(64),
      "key",
      true,
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      operation,
      fingerprint: "a".repeat(64),
      idempotency_key: "key",
      confirm_availability: true,
    });
  });
  it("keeps the server token when parsing a pending offer", async () => {
    const warning = { fingerprint: "a".repeat(64) };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "10000000-0000-4000-8000-000000000001",
              status: "pending",
              date: "2030-01-07",
              location_name: "Main Dining",
              job_name: "Server",
              start_time: "18:00",
              end_time: "22:00",
              expires_at: "2030-01-07T16:00:00Z",
              availability_warning: warning,
            },
          ]),
          { status: 200 },
        ),
      ),
    );
    expect(
      (await getLineupOffers("workspace"))[0]?.availability_warning,
    ).toEqual(warning);
  });
  it.each(["accept", "decline"] as const)(
    "serializes the %s response without treating decline as acceptance",
    async (response) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: "saved" }), { status: 200 }),
        );
      vi.stubGlobal("fetch", fetchMock);
      await respondToLineupOffer(
        "workspace",
        "offer",
        response,
        "a".repeat(64),
      );
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/schedule/lineups/offers/respond");
      expect(new Headers(init.headers).get("X-Newfork-Workspace-Id")).toBe(
        "workspace",
      );
      expect(JSON.parse(init.body as string)).toEqual({
        id: "offer",
        response,
        ...(response === "accept"
          ? { availability_fingerprint: "a".repeat(64) }
          : {}),
      });
    },
  );
});
