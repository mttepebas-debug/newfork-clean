import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeHubReadModel } from "@newfork/shared";
import { TimeOffCancellation } from "./TimeOffCancellation";
import { TimeOffPeriods } from "./TimeOffPeriods";
import { requestTimeOffCancellation } from "../schedule/requests-data";
import { requestAvailabilityNavigation } from "../availability/availability-navigation";
vi.mock("../schedule/requests-data", () => ({ requestTimeOffCancellation: vi.fn() }));
const id = "af9c0000-0000-4000-8000-000000000001";
const request: EmployeeHubReadModel["requests"][number] = {
  id, kind: "time_off", status: "partially_approved", title: "Time off", detail: "", revision: 2, created_at: "2035-01-01T00:00:00Z", can_cancel: false,
  cancellation: { parent_request_id: null, parent_revision: null, pending_request_id: null, has_completed_cancellation: false, can_request: true },
  periods: [{ id, segment_date: "2035-01-15", start_time: "09:00", end_time: "17:00", status: "approved", time_timezone: "UTC", time_source: "snapshot",
    effective_intervals: [{ start_at: "2035-01-15T09:00:00Z", end_at: "2035-01-15T12:00:00Z" }, { start_at: "2035-01-15T14:00:00Z", end_at: "2035-01-15T17:00:00Z" }] }],
};
const changed = vi.fn();
function setup(value = request) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = (current: typeof request) => <QueryClientProvider client={client}><TimeOffCancellation request={current} workspaceId={id} timeFormat="24h" onChanged={changed} /></QueryClientProvider>;
  return { ...render(view(value)), view };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requestTimeOffCancellation).mockResolvedValue({ status: "pending", request_id: id, revision: 1 }); });
afterEach(() => vi.restoreAllMocks());
describe("approved leave cancellation", () => {
  it("moves focus into the cancellation form and restores it when keeping leave", () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    expect(document.activeElement?.textContent).toBe("Cancel approved leave");
    fireEvent.click(screen.getByRole("button", { name: "Keep approved leave" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Request leave cancellation" }));
    expect(requestTimeOffCancellation).not.toHaveBeenCalled();
  });
  it("submits a shortened piece with seconds while keeping the original approved bounds", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cancel period 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose hours for period 1" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Starts on, period 1"));
    fireEvent.change(screen.getByLabelText("Start time, period 1"), { target: { value: "10:30:01" } });
    fireEvent.change(screen.getByLabelText("End time, period 1"), { target: { value: "11:30:02" } });
    expect(screen.getByRole("button", { name: "Send cancellation request" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Choose hours for period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(requestTimeOffCancellation).toHaveBeenCalledOnce());
    expect(vi.mocked(requestTimeOffCancellation).mock.calls[0]?.[2]).toMatchObject({ periods: [{ segment_id: id, starts_at: "2035-01-15T10:30:01.000Z", ends_at: "2035-01-15T11:30:02.000Z" }] });
    expect(request.periods![0]!.effective_intervals![0]!.start_at).toBe("2035-01-15T09:00:00Z");
  });
  it("rejects crossing an unapproved gap and keeps unfinished edits out of submission", () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose hours for period 1" }));
    fireEvent.change(screen.getByLabelText("End time, period 1"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    expect(screen.getByText(/Denied or already cancelled hours cannot be included/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send cancellation request" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("End time, period 1"), { target: { value: "11:" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    expect(screen.getByText("Enter the cancellation date and time.")).toBeTruthy();
    expect(requestTimeOffCancellation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard these edits for period 1" }));
    expect(screen.getByRole("button", { name: "Send cancellation request" })).toHaveProperty("disabled", false);
  });
  it("supports separate cancellation pieces in one approved interval and blocks overlapping selections", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cancel period 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose hours for period 1" }));
    fireEvent.change(screen.getByLabelText("End time, period 1"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another period within approved hours 1" }));
    expect(screen.getByText(/Selected cancellation periods overlap/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send cancellation request" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Start time, period 3"), { target: { value: "11:00" } });
    fireEvent.change(screen.getByLabelText("End time, period 3"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(requestTimeOffCancellation).toHaveBeenCalledOnce());
    expect(vi.mocked(requestTimeOffCancellation).mock.calls[0]?.[2]).toMatchObject({ periods: [
      { segment_id: id, starts_at: "2035-01-15T09:00:00Z", ends_at: "2035-01-15T10:00:00.000Z" },
      { segment_id: id, starts_at: "2035-01-15T11:00:00.000Z", ends_at: "2035-01-15T12:00:00.000Z" },
    ] });
  });
  it("lets an employee select a future subset of leave already in progress", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2035-01-15T10:00:00Z"));
    setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    expect(screen.getByRole("checkbox", { name: "Cancel period 1" })).toHaveProperty("checked", false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cancel period 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose hours for period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    expect(screen.getByText(/Hours already taken cannot be cancelled/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Start time, period 1"), { target: { value: "11:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cancel period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(requestTimeOffCancellation).toHaveBeenCalledOnce());
    expect(vi.mocked(requestTimeOffCancellation).mock.calls[0]?.[2]).toMatchObject({ periods: [{ segment_id: id, starts_at: "2035-01-15T11:00:00.000Z", ends_at: "2035-01-15T12:00:00Z" }] });
  });
  it("preserves an uncertain operation retry even after its requested hours start", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2035-01-15T08:00:00Z"));
    vi.mocked(requestTimeOffCancellation).mockRejectedValueOnce(new Error("Connection lost"));
    const ui = setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cancel period 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await screen.findByText("Connection lost");
    const first = vi.mocked(requestTimeOffCancellation).mock.calls[0]?.[2];
    now.mockReturnValue(Date.parse("2035-01-15T10:00:00Z")); ui.rerender(ui.view(request));
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(requestTimeOffCancellation).toHaveBeenCalledTimes(2));
    expect(vi.mocked(requestTimeOffCancellation).mock.calls[1]?.[2]).toEqual(first);
  });
  it("requires explicit DST occurrences for edited repeated clocks", async () => {
    setup({ ...request, periods: [{ ...request.periods![0]!, segment_date: "2035-11-04", time_timezone: "America/New_York",
      effective_intervals: [{ start_at: "2035-11-04T04:00:00Z", end_at: "2035-11-05T05:00:00Z" }] }] });
    fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose hours for period 1" }));
    fireEvent.change(screen.getByLabelText("Start time, period 1"), { target: { value: "01:10" } });
    fireEvent.change(screen.getByLabelText("Ends on, period 1"), { target: { value: "2035-11-04" } });
    fireEvent.change(screen.getByLabelText("End time, period 1"), { target: { value: "01:40" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    expect(screen.getByText(/This time repeats/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Repeated time, start, period 1"), { target: { value: "earlier" } });
    fireEvent.change(screen.getByLabelText("Repeated time, end, period 1"), { target: { value: "later" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply hours for period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(requestTimeOffCancellation).toHaveBeenCalledOnce());
    expect(vi.mocked(requestTimeOffCancellation).mock.calls[0]?.[2]).toMatchObject({ periods: [{ segment_id: id, starts_at: "2035-11-04T05:10:00.000Z", ends_at: "2035-11-04T06:40:00.000Z" }] });
  });
  it("retains an edit but cannot send it for a different request identity", () => {
    const ui = setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    ui.rerender(ui.view({ ...request, id: "af9c0000-0000-4000-8000-000000000002" }));
    expect(screen.getByRole("alert").textContent).toContain("approved leave changed");
    expect(screen.getByRole("button", { name: "Send cancellation request" })).toHaveProperty("disabled", true);
  });
  it("removes the waiting-for-approval success message once the parent decision changes", async () => {
    const ui = setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await screen.findByRole("status");
    ui.rerender(ui.view({ ...request, revision: 3 }));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("keeps a cancellation note on Stay and clears the whole draft only on discard", () => {
    setup();
    fireEvent.click(screen.getByRole("button",{name:"Request leave cancellation"}));
    fireEvent.change(screen.getByLabelText("Cancellation note"),{target:{value:"Keep my cancellation draft"}});
    const navigate = vi.fn();
    act(()=>requestAvailabilityNavigation(navigate));
    fireEvent.click(screen.getByRole("button",{name:"Stay here"}));
    expect(screen.getByLabelText("Cancellation note")).toHaveProperty("value","Keep my cancellation draft");
    expect(navigate).not.toHaveBeenCalled();
    act(()=>requestAvailabilityNavigation(navigate));
    fireEvent.click(screen.getByRole("button",{name:"Discard and leave"}));
    expect(screen.queryByLabelText("Cancellation note")).toBeNull();
    expect(navigate).toHaveBeenCalledOnce(); expect(requestTimeOffCancellation).not.toHaveBeenCalled();
  });
  it("submits only selected approved pieces and preserves note and operation identity after a network failure", async () => {
    vi.mocked(requestTimeOffCancellation).mockRejectedValueOnce(new Error("Connection lost"));
    setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.change(screen.getByLabelText("Cancellation note"), { target: { value: "Plans changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await screen.findByText("Connection lost");
    const first = vi.mocked(requestTimeOffCancellation).mock.calls[0]?.[2];
    expect(first).toEqual({ expected_revision: 2, operation_id: expect.any(String), reason: "Plans changed",
      periods: [{ segment_id: id, starts_at: "2035-01-15T09:00:00Z", ends_at: "2035-01-15T12:00:00Z" }] });
    expect((screen.getByLabelText("Cancellation note") as HTMLTextAreaElement).value).toBe("Plans changed");
    fireEvent.click(screen.getByRole("button", { name: "Send cancellation request" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(vi.mocked(requestTimeOffCancellation).mock.calls[1]?.[2]).toEqual(first);
    expect(screen.getByRole("status").textContent).toContain("approved leave stays in effect");
  });
  it("retains a local draft but blocks submission after the approved leave changes", () => {
    const ui = setup(); fireEvent.click(screen.getByRole("button", { name: "Request leave cancellation" }));
    fireEvent.change(screen.getByLabelText("Cancellation note"), { target: { value: "My draft" } });
    ui.rerender(ui.view({ ...request, revision: 3 }));
    expect(screen.getByRole("alert").textContent).toContain("approved leave changed");
    expect((screen.getByRole("button", { name: "Send cancellation request" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Cancellation note") as HTMLTextAreaElement).value).toBe("My draft");
    expect(requestTimeOffCancellation).not.toHaveBeenCalled();
  });
  it("shows pending cancellation without offering another request", () => {
    setup({ ...request, cancellation: { ...request.cancellation!, pending_request_id: id, can_request: false } });
    expect(screen.getByText(/Cancellation awaiting manager review/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request leave cancellation" })).toBeNull();
  });
  it("distinguishes historical approval, cancelled hours, and remaining approved leave", () => {
    render(<TimeOffPeriods periods={[{ ...request.periods![0]!, cancelled_intervals: [{ start_at: "2035-01-15T12:00:00Z", end_at: "2035-01-15T14:00:00Z" }],
      decision_pieces: [{ id, starts_at: "2035-01-15T09:00:00Z", ends_at: "2035-01-15T17:00:00Z", time_timezone: "UTC", status: "approved" }] }]} timeFormat="24h" requestStatus="partially_approved" />);
    expect(screen.getByText("Previously approved")).toBeTruthy(); expect(screen.getByText("Cancelled leave")).toBeTruthy();
    expect(screen.getAllByText("Still approved")).toHaveLength(2);
  });
});
