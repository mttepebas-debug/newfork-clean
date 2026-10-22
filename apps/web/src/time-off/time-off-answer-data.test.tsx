import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTenantScopedQueryKey } from "../auth/tenant-query-cache";
import {
  myTimeOffShiftsKey,
  timeOffImpactKey,
  timeOffToAnswerKey,
  useAnswerTimeOff,
  useMyTimeOffShifts,
  useTimeOffImpact,
  useTimeOffToAnswer,
} from "./time-off-data";

// Time off rebuild D3: the answerer's reads and the answer, through the API.

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
  // D4: what the API answers since 20261022160000.
  cancels_id: null, ended_by_name: null, used_until: null, cancellation: null,
  employee_id: "735032ec-0e98-4fb1-8005-c4ede5b1726b", employee_name: "Ali Person", location_names: ["Downtown"], shifts_opened: 0,
};
const page = { total: 1, waiting: 1, page: 1, page_size: 50, requests: [view] };
const impact = { request: view, fingerprint: "abc", shift_count: 0, hidden_shift_count: 0, locations: [] };
const shifts = { count: 1, shifts: [{ id: requestId, location_name: "Downtown", job_name: "Cook", scheduled_date: "2026-10-23", start_time: "09:00", end_time: "15:00" }] };
const base = `/v1/workspaces/${workspaceId}/time-off-requests`;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

describe("time off answer data", () => {
  beforeEach(() => api.apiRequest.mockReset());

  it("reads the list to answer with the question in the address, under keys that leave with the workspace", async () => {
    api.apiRequest.mockResolvedValue(page);
    const { Wrapper } = wrapper();
    const query = { view: "open" as const, search: "ali", sort: "starts" as const, page: 2, page_size: 25 as const, location_id: undefined };
    const { result } = renderHook(() => useTimeOffToAnswer(workspaceId, query), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(page));
    expect(api.apiRequest).toHaveBeenCalledWith({}, `${base}?view=open&search=ali&sort=starts&page=2&page_size=25`);
    expect(isTenantScopedQueryKey(timeOffToAnswerKey(workspaceId, query))).toBe(true);
    expect(isTenantScopedQueryKey(timeOffImpactKey(workspaceId, requestId))).toBe(true);
    expect(isTenantScopedQueryKey(myTimeOffShiftsKey(workspaceId, { start: "2026-10-23", end: "2026-10-23" }))).toBe(true);
  });

  it("reads what approving would open, only for a chosen request", async () => {
    api.apiRequest.mockResolvedValue(impact);
    const { Wrapper } = wrapper();
    const none = renderHook(() => useTimeOffImpact(workspaceId, null), { wrapper: Wrapper });
    expect(none.result.current.fetchStatus).toBe("idle");
    const { result } = renderHook(() => useTimeOffImpact(workspaceId, requestId), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual(impact));
    expect(api.apiRequest).toHaveBeenCalledWith({}, `${base}/${requestId}/impact`);
  });

  it("answers, then reads every time off list and what shows shifts again", async () => {
    api.apiRequest.mockResolvedValue({ ...view, status: "approved", revision: 2 });
    const { client, Wrapper } = wrapper();
    const refresh = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAnswerTimeOff(workspaceId), { wrapper: Wrapper });
    const answer = { verdict: "approve" as const, note: null, expected_revision: 1, expected_impact: "abc" };
    await act(() => result.current.mutateAsync({ requestId, answer }));
    expect(api.apiRequest).toHaveBeenLastCalledWith({}, `${base}/${requestId}/answer`, { method: "POST", body: JSON.stringify(answer) });
    expect(refresh).toHaveBeenCalledWith({ queryKey: ["time-off-requests", workspaceId] });
    expect(refresh.mock.calls.length).toBeGreaterThan(1);
  });

  it("reads the form's shifts for a range, with hours only when they are set", async () => {
    api.apiRequest.mockResolvedValue(shifts);
    const { Wrapper } = wrapper();
    const none = renderHook(() => useMyTimeOffShifts(workspaceId, null), { wrapper: Wrapper });
    expect(none.result.current.fetchStatus).toBe("idle");
    const { result } = renderHook(() => useMyTimeOffShifts(workspaceId, { start: "2026-10-23", end: "2026-10-24", from: "09:00", to: "24:00" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual(shifts));
    expect(api.apiRequest).toHaveBeenCalledWith({}, `${base}/my-shifts?start=2026-10-23&end=2026-10-24&from=09%3A00&to=24%3A00`);
  });
});
