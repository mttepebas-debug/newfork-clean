import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";

const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  getTabWorkspaceId: () => null,
}));

const {
  isStaleTimeOff,
  requestTimeOffCancellation,
  revokeTimeOff,
  submitTimeOff,
  timeOffKeys,
  useRevokeTimeOff,
  useSubmitTimeOff,
  useVoteOnTimeOff,
  voteOnTimeOff,
} = await import("./requests-data");

const w = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const rid = "98060000-0000-4000-8000-000000000001";
const key = "98060000-0000-4000-8000-000000000003";
const fingerprint = "0123456789abcdef0123456789abcdef";
const day = { segment_date: "2035-01-15", start_time: null, end_time: null, ends_next_day: false };

beforeEach(() => apiRequest.mockReset());

describe("time-off voting calls (FB-6.3.5)", () => {
  it("each posts to its endpoint and reads the answer through the shared schema", async () => {
    apiRequest.mockResolvedValueOnce({ status: "pending", request_id: rid, revision: 1, decide_by: null });
    expect((await submitTimeOff(w, { periods: [day], reason: "", expected_timezone: "America/New_York", operation_id: key })).status).toBe("pending");
    apiRequest.mockResolvedValueOnce({ status: "pending", request_id: key, revision: 1, decide_by: null });
    await requestTimeOffCancellation(w, rid, { expected_revision: 2, reason: "", operation_id: key,
      periods: [{ segment_id: key, starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T19:00:00Z" }] });
    apiRequest.mockResolvedValueOnce({ status: "approved", final: true, alone: true, remaining: 0, revision: 2, request_id: rid });
    expect((await voteOnTimeOff(w, rid, { verdict: "approve", note: "", expected_impact: fingerprint })).final).toBe(true);
    apiRequest.mockResolvedValueOnce({ status: "revoked", request_id: rid, revision: 3 });
    await revokeTimeOff(w, rid, { expected_revision: 2, reason: "Short staffed" });
    expect(apiRequest.mock.calls.map(([, path, init]) => [path, (init as RequestInit).method])).toEqual([
      [`/v1/workspaces/${w}/time-off`, "POST"],
      [`/v1/workspaces/${w}/time-off/${rid}/cancellation`, "POST"],
      [`/v1/workspaces/${w}/time-off/${rid}/verdict`, "POST"],
      [`/v1/workspaces/${w}/time-off/${rid}/revoke`, "POST"],
    ]);
  });

  it("refuses an answer that is not the contract", async () => {
    apiRequest.mockResolvedValueOnce({ status: "approved" });
    await expect(voteOnTimeOff(w, rid, { verdict: "approve", note: "", expected_impact: fingerprint })).rejects.toThrow();
  });

  it("tells a stale screen (409) from a refusal", () => {
    expect(isStaleTimeOff(new RequestError("This request is already closed", undefined, undefined, 409))).toBe(true);
    expect(isStaleTimeOff(new RequestError("Not allowed", "authz.rank", "time_off.decide", 403))).toBe(false);
    expect(isStaleTimeOff(new Error("boom"))).toBe(false);
  });
});

describe("time-off voting hooks (FB-6.3.5)", () => {
  function wrapper() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { Wrapper, invalidate };
  }

  it("a vote refreshes the Requests queue and Employee Hub, also when it was stale", async () => {
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useVoteOnTimeOff(w), { wrapper: Wrapper });
    apiRequest.mockRejectedValueOnce(new RequestError("The shifts this time off affects have changed. Review them again", undefined, undefined, 409));
    await act(async () => { await result.current.mutateAsync({ requestId: rid, verdict: { verdict: "approve", note: "", expected_impact: fingerprint } }).catch(() => undefined); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isStaleTimeOff(result.current.error)).toBe(true);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([timeOffKeys.requests(w), timeOffKeys.employeeHub(w)]);
  });

  it("asking and revoking refresh the same two lists", async () => {
    const { Wrapper, invalidate } = wrapper();
    const submit = renderHook(() => useSubmitTimeOff(w), { wrapper: Wrapper });
    apiRequest.mockResolvedValueOnce({ status: "pending", request_id: rid, revision: 1, decide_by: null });
    await act(async () => { await submit.result.current.mutateAsync({ periods: [day], reason: "", expected_timezone: "America/New_York", operation_id: key }); });
    const revoke = renderHook(() => useRevokeTimeOff(w), { wrapper: Wrapper });
    apiRequest.mockResolvedValueOnce({ status: "revoked", request_id: rid, revision: 3 });
    await act(async () => { await revoke.result.current.mutateAsync({ requestId: rid, revoke: { expected_revision: 2, reason: "Short staffed" } }); });
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      timeOffKeys.requests(w), timeOffKeys.employeeHub(w), timeOffKeys.requests(w), timeOffKeys.employeeHub(w),
    ]);
  });

  it("uses the keys the Requests page and Employee Hub already read under", () => {
    expect(timeOffKeys.requests(w)).toEqual(["schedule-requests", w]);
    expect(timeOffKeys.employeeHub(w)).toEqual(["employee-hub", w]);
  });
});
