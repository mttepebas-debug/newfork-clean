import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTenantScopedQueryKey } from "../auth/tenant-query-cache";
import { myTimeOffKey, useAskTimeOff, useMyTimeOff, useWithdrawTimeOff } from "./time-off-data";
import { TIME_OFF_V2_KEY, timeOffV2Enabled } from "./time-off-flag";

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

describe("time off v2 flag", () => {
  it("is on only where this browser asked for it", () => {
    window.localStorage.removeItem(TIME_OFF_V2_KEY);
    expect(timeOffV2Enabled()).toBe(false);
    window.localStorage.setItem(TIME_OFF_V2_KEY, "1");
    expect(timeOffV2Enabled()).toBe(true);
    window.localStorage.setItem(TIME_OFF_V2_KEY, "true");
    expect(timeOffV2Enabled()).toBe(false);
    window.localStorage.removeItem(TIME_OFF_V2_KEY);
  });

  it("is off when the storage cannot be read", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(timeOffV2Enabled()).toBe(false);
    read.mockRestore();
  });
});
