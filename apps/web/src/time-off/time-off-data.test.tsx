import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTenantScopedQueryKey } from "../auth/tenant-query-cache";
import { loadAllTimeOffToAnswer, myTimeOffKey, useAskTimeOff, useMyTimeOff, useWithdrawTimeOff } from "./time-off-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const requestId = "98020000-0000-4000-8000-000000000001";
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: api.apiRequest }));

const view = {
  id: requestId, kind: "leave", kind_of_leave: "sick", status: "pending",
  starts_at: "2026-10-23T07:00:00+00:00", ends_at: "2026-10-24T07:00:00+00:00", all_day: true,
  time_timezone: "America/Los_Angeles", start_date: "2026-10-23", end_date: "2026-10-23", start_time: null, end_time: null,
  note: null, revision: 1, created_at: "2026-10-22T16:30:00+00:00", decided_at: null, decided_by_name: null,
  decision_note: null, ended_at: null, ended_note: null,
  // D4: what the API answers since 20261023033810.
  cancels_id: null, ended_by_name: null, used_until: null, cancellation: null, added_by_name: null,
};
const mine = { time_zone: "America/Los_Angeles", today: "2026-10-22", location_names: ["Downtown"], requests: [view] };

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

describe("time off data", () => {
  beforeEach(() => api.apiRequest.mockReset());

  it("reads the employee's own list, under a key that leaves with the workspace", async () => {
    api.apiRequest.mockResolvedValue(mine);
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useMyTimeOff(workspaceId), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(mine));
    expect(api.apiRequest).toHaveBeenCalledWith({}, `/v1/workspaces/${workspaceId}/time-off-requests/mine`);
    expect(isTenantScopedQueryKey(myTimeOffKey(workspaceId))).toBe(true);
  });

  it("asks and withdraws through the API, then reads the list again", async () => {
    api.apiRequest.mockResolvedValue(view);
    const { client, Wrapper } = wrapper();
    const refresh = vi.spyOn(client, "invalidateQueries");
    const ask = renderHook(() => useAskTimeOff(workspaceId), { wrapper: Wrapper });
    const input = {
      kind_of_leave: "sick" as const, start_date: "2026-10-23", end_date: "2026-10-23", all_day: true,
      start_time: null, end_time: null, note: null, expected_timezone: "America/Los_Angeles", client_key: requestId,
    };
    await act(() => ask.result.current.mutateAsync(input));
    expect(api.apiRequest).toHaveBeenLastCalledWith({}, `/v1/workspaces/${workspaceId}/time-off-requests`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const withdraw = renderHook(() => useWithdrawTimeOff(workspaceId), { wrapper: Wrapper });
    await act(() => withdraw.result.current.mutateAsync({ id: requestId, revision: 3 }));
    expect(api.apiRequest).toHaveBeenLastCalledWith({}, `/v1/workspaces/${workspaceId}/time-off-requests/${requestId}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ expected_revision: 3 }),
    });
    expect(refresh).toHaveBeenCalledWith({ queryKey: myTimeOffKey(workspaceId) });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

// D7: Requests' All tab reads every request one answers, page after page.
describe("loadAllTimeOffToAnswer", () => {
  beforeEach(() => api.apiRequest.mockReset());
  const row = (n: number) => ({ ...view, id: `98020000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, employee_id: requestId,
    employee_name: "Ali Person", location_names: ["Downtown"], shifts_opened: 0 });
  it("reads the pages until it has them all, with the first page's time format and locations", async () => {
    api.apiRequest
      .mockResolvedValueOnce({ total: 3, waiting: 1, page: 1, page_size: 100, time_format: "24h", locations: [{ id: requestId, name: "Downtown" }], requests: [row(1), row(2)] })
      .mockResolvedValueOnce({ total: 3, waiting: 1, page: 2, page_size: 100, time_format: "24h", locations: [{ id: requestId, name: "Downtown" }], requests: [row(3)] });
    const all = await loadAllTimeOffToAnswer(workspaceId, { location_id: requestId, search: "ali" });
    expect(all.requests.map((request) => request.id)).toEqual([row(1).id, row(2).id, row(3).id]);
    expect(all.time_format).toBe("24h");
    expect(all.locations).toEqual([{ id: requestId, name: "Downtown" }]);
    expect(api.apiRequest.mock.calls.map((call) => call[1])).toEqual([
      `/v1/workspaces/${workspaceId}/time-off-requests?view=all&sort=needs_decision&page_size=100&location_id=${requestId}&search=ali&page=1`,
      `/v1/workspaces/${workspaceId}/time-off-requests?view=all&sort=needs_decision&page_size=100&location_id=${requestId}&search=ali&page=2`,
    ]);
  });
  it("stops when a page comes back empty", async () => {
    api.apiRequest
      .mockResolvedValueOnce({ total: 5, waiting: 0, page: 1, page_size: 100, requests: [row(1)] })
      .mockResolvedValueOnce({ total: 5, waiting: 0, page: 2, page_size: 100, requests: [] });
    expect((await loadAllTimeOffToAnswer(workspaceId, { search: "" })).requests).toHaveLength(1);
    expect(api.apiRequest).toHaveBeenCalledTimes(2);
  });
});
