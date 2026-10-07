import { afterEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  supabaseClient: {},
  getTabWorkspaceId: () => null,
}));

import { getScheduleRequests, getTimeOffQueue } from "./requests-data";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function page(ids: string[], next: string | null) {
  return {
    workspace_id: workspaceId, locations: [], time_off_pending_count: ids.length, time_off_next_cursor: next,
    time_off_requests: ids.map((id) => ({
      id, employee_id: "44444444-4444-4444-8444-444444444444", employee_name: "Ali Person", request_type: "time_off",
      reason: "", status: "pending", start_date: "2026-10-13", end_date: "2026-10-13", revision: 1,
      created_at: "2026-10-01T09:00:00Z", conflict_count: 0, segments: [], events: [],
    })),
  };
}

afterEach(() => apiRequest.mockReset());

// EKRAN-02 B1 (R2-21): Requests reads through the one route and the shared
// request helper, so a lost session signs out like everywhere else.
describe("getScheduleRequests", () => {
  it("reads the workspace's one Requests route", async () => {
    apiRequest.mockResolvedValue(page([], null));
    await getScheduleRequests(workspaceId, { timeOffQueue: "closed", locationId: "", search: "ali" });
    const [, path] = apiRequest.mock.calls[0] as [unknown, string];
    expect(path).toBe(`/v1/workspaces/${workspaceId}/schedule/requests?time_off_queue=closed&search=ali`);
  });

  // R2-10: 200 characters pasted into search ask for the first 120, never an error.
  it("asks for at most 120 characters of search", async () => {
    apiRequest.mockResolvedValue(page([], null));
    await getScheduleRequests(workspaceId, { timeOffQueue: "needs_review", locationId: "", search: "a".repeat(200) });
    const [, path] = apiRequest.mock.calls[0] as [unknown, string];
    expect(new URL(path, "http://x").searchParams.get("search")).toBe("a".repeat(120));
  });
});

describe("getTimeOffQueue", () => {
  it("reads every open time off request, page after page", async () => {
    apiRequest
      .mockResolvedValueOnce(page(["97200000-0000-4000-8000-000000000001"], "2026-10-01T09:00:00.000Z"))
      .mockResolvedValueOnce(page(["97200000-0000-4000-8000-000000000002"], null));
    const queue = await getTimeOffQueue(workspaceId, "needs_review", { locationId: "", search: "" });
    expect(queue.requests.map((row) => row.id)).toEqual(["97200000-0000-4000-8000-000000000001", "97200000-0000-4000-8000-000000000002"]);
    const second = new URL((apiRequest.mock.calls[1] as [unknown, string])[1], "http://x").searchParams;
    expect(second.get("time_off_cursor")).toBe("2026-10-01T09:00:00.000Z");
    expect(second.get("limit")).toBe("100");
  });

  // Ek 2026-10-07: Requests is one list, so closed time off is read whole too
  // until the one closed read (B3) pages it on the server.
  it("reads every closed time off request and keeps the first page's locations and time format", async () => {
    const kadikoy = { id: "22222222-2222-4222-8222-222222222222", name: "Kadikoy" };
    apiRequest
      .mockResolvedValueOnce({ ...page(["97200000-0000-4000-8000-000000000003"], "2026-09-01T09:00:00.000Z"), locations: [kadikoy], time_format: "24h" })
      .mockResolvedValueOnce(page(["97200000-0000-4000-8000-000000000004"], null));
    const queue = await getTimeOffQueue(workspaceId, "closed", { locationId: "", search: "" });
    expect(queue.requests).toHaveLength(2);
    expect(queue.locations).toEqual([kadikoy]);
    expect(queue.timeFormat).toBe("24h");
    const first = new URL((apiRequest.mock.calls[0] as [unknown, string])[1], "http://x").searchParams;
    expect(first.get("time_off_queue")).toBe("closed");
  });
});
