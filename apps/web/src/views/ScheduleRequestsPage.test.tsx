import { act, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ScheduleRequestsReadModel,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleRequestsPage } from "./ScheduleRequestsPage";
import { PermissionRoute } from "../auth/PermissionRoute";
import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { decideTimeOff, getScheduleRequests, previewTimeOffAssignment, shortenTimeOff } from "../schedule/requests-data";

import { RequestError } from "../lib/request-error";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspaceId,
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "schedule.read",
    "schedule.time_off_requests.read",
    "schedule.time_off_requests.manage",
    "schedule.shift_change_requests.read",
    "schedule.shift_change_requests.manage",
  ],
  actions: [
    "workspace.read",
    "schedule.read",
    "requests.read",
    "time_off.decide",
    "exchange.read",
    "exchange.approve",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;
let activeContext: ActiveWorkspaceContext = context;

const fixture = {
  workspace_id: workspaceId,
  locations: [
    { id: "11000000-0000-4000-8000-000000000001", name: "Main Dining" },
  ],
  time_off_pending_count: 1,
  time_off_next_cursor: null,
  time_off_requests: [
    {
      id: "97200000-0000-4000-8000-000000000001",
      employee_id: "15000000-0000-4000-8000-000000000001",
      employee_name: "Alex Kim",
      location_id: "11000000-0000-4000-8000-000000000001",
      location_name: "Main Dining",
      request_type: "time_off",
      reason: "Family appointment",
      status: "pending",
      start_date: "2026-08-17",
      end_date: "2026-08-18",
      revision: 1,
      viewed_at: "2026-08-17T12:00:00.000Z",
      created_at: "2026-08-17T11:00:00.000Z",
      conflict_count: 1,
      segments: [
        {
          id: "97300000-0000-4000-8000-000000000001",
          segment_date: "2026-08-17",
          start_time: "10:00:00",
          end_time: "14:00:00",
          status: "pending",
        },
        {
          id: "97300000-0000-4000-8000-000000000002",
          segment_date: "2026-08-18",
          start_time: null,
          end_time: null,
          status: "pending",
        },
      ],
      events: [],
    },
  ],
} satisfies ScheduleRequestsReadModel;

// Whole-repo runs share the cores with three other packages; Testing
// Library's 1 s default for findBy/waitFor is what ran out there (U19).
configure({ asyncUtilTimeout: 5000 });

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: activeContext }),
}));
vi.mock("../employee-hub/shift-exchanges/exchange-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../employee-hub/shift-exchanges/exchange-data")>()),
  getExchanges: vi.fn(),
}));
vi.mock("../schedule/requests-data", () => ({
  previewTimeOffAssignment: vi.fn(),
  getScheduleRequests: vi.fn().mockImplementation(async () => fixture),
  markTimeOffViewed: vi.fn().mockResolvedValue({
    status: "viewed",
    request_id: "97200000-0000-4000-8000-000000000001",
    revision: 1,
  }),
  decideTimeOff: vi.fn().mockResolvedValue({
    status: "partially_approved",
    request_id: "97200000-0000-4000-8000-000000000001",
    revision: 2,
  }),
  shortenTimeOff: vi.fn().mockResolvedValue({
    status: "partially_approved",
    request_id: "97200000-0000-4000-8000-000000000001",
    revision: 3,
  }),
}));

function LocationProbe() { const location = useLocation(); return <output aria-label="Current URL">{location.pathname + location.search}</output>; }
function renderPage(
  initialPath = "/app/schedule/requests",
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/app/schedule/requests" element={<ScheduleRequestsPage />} />
          <Route path="/app/availability" element={
            <PermissionRoute roles={["owner", "admin", "manager"]} anyOf={["schedule.read"]}>
              <h1>Team Availability</h1>
            </PermissionRoute>
          } />
          <Route path="/app/workspace" element={<h1>Workspace</h1>} />
          <Route path="/app/employee-hub" element={<h1>Employee Hub</h1>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openTimeOffRequest() {
  fireEvent.click(await screen.findByRole("button", { name: /Alex Kim/ }));
}

describe("ScheduleRequestsPage", () => {
  afterEach(() => vi.restoreAllMocks());
  it("keeps a requested tab change pending until an in-flight decision finishes", async () => {
    let finish!: (value:Awaited<ReturnType<typeof decideTimeOff>>) => void;
    vi.mocked(decideTimeOff).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    renderPage(); await openTimeOffRequest(); fireEvent.click(screen.getByRole("button",{name:"Partial"}));
    await waitFor(()=>expect(screen.getByRole("button",{name:"Save Partial Decision"})).toHaveProperty("disabled",false));
    fireEvent.click(screen.getByRole("button",{name:"Save Partial Decision"}));
    await waitFor(()=>expect(decideTimeOff).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("tab",{name:/Shift changes/}));
    expect(await screen.findByText("Saving request decision")).toBeTruthy();
    expect(screen.getByRole("button",{name:"Continue"})).toHaveProperty("disabled",true);
    await act(async()=>finish({status:"partially_approved",request_id:fixture.time_off_requests[0]!.id,revision:2}));
    await screen.findByText("Decision saved");
    fireEvent.click(screen.getByRole("button",{name:"Continue"}));
    await screen.findByRole("heading",{name:"Shift changes"});
    expect(decideTimeOff).toHaveBeenCalledOnce();
  });
  it("keeps a manager partial decision and note until closing is explicitly confirmed", async () => {
    renderPage(); await openTimeOffRequest(); fireEvent.click(screen.getByRole("button",{name:"Partial"}));
    fireEvent.change(screen.getByLabelText(`Decision for ${fixture.time_off_requests[0]!.segments[1]!.id}`),{target:{value:"denied"}});
    fireEvent.change(screen.getByLabelText(/Manager note/),{target:{value:"Preserve this partial decision"}});
    fireEvent.click(screen.getByRole("button",{name:"Close"}));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Stay here"}));
    expect(screen.getByLabelText(/Manager note/)).toHaveProperty("value","Preserve this partial decision");
    expect(screen.getByLabelText(`Decision for ${fixture.time_off_requests[0]!.segments[1]!.id}`)).toHaveProperty("value","denied");
    fireEvent.click(screen.getByRole("button",{name:"Close"}));
    fireEvent.click(screen.getByRole("button",{name:"Discard and leave"}));
    expect(screen.getByRole("dialog", { name: "Review request" })).toBeTruthy(); expect(decideTimeOff).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    activeContext = context;
    vi.clearAllMocks();
    vi.mocked(getScheduleRequests).mockResolvedValue(fixture);
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, cases: [], opportunities: [], own_shifts: [] });
    vi.mocked(previewTimeOffAssignment).mockResolvedValue({ request_id: fixture.time_off_requests[0]!.id, revision: 1, fingerprint: "a".repeat(64), restricted_count: 0, affected_shifts: [], approved_intervals: [] });
  });
  it.each(["owner", "admin", "manager"] as const)("redirects an old availability link for %s without loading an approval queue", async role => {
    activeContext = { ...context, membership: { ...context.membership, role }, permissions: ["workspace.read", "schedule.read"] };
    renderPage("/app/schedule/requests?tab=availability&request=old&legacy=1&case=old&offer=old");
    await screen.findByRole("heading", { name: "Team Availability" });
    expect(screen.getByLabelText("Current URL").textContent).toBe("/app/availability");
    expect(getScheduleRequests).not.toHaveBeenCalled();
    expect(getExchanges).not.toHaveBeenCalled();
  });
  it("preserves team access control for an employee following an old availability link", async () => {
    activeContext = { ...context, membership: { ...context.membership, role: "employee" }, permissions: ["workspace.read"] };
    renderPage("/app/schedule/requests?tab=availability");
    await screen.findByRole("heading", { name: "Employee Hub" });
    expect(getScheduleRequests).not.toHaveBeenCalled();
  });
  it("does not treat employee-record read permission as request queue access", async () => {
    activeContext = {...context, permissions:["workspace.read","employees.read"]};
    renderPage();
    await screen.findByRole("heading", { name: "Workspace" });
    expect(getScheduleRequests).not.toHaveBeenCalled();
  });
  it("keeps only Time off and Shift changes tabs and opens the manager Shift Hub", async () => {
    activeContext = { ...context, permissions: [...context.permissions, "employees.read"] };
    renderPage();
    await screen.findByText("Alex Kim");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "Availability" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Shift changes/ }));
    await screen.findByRole("heading", { name: "Shift changes" });
    expect(getExchanges).toHaveBeenCalledWith(workspaceId, true, expect.anything());
    expect(screen.getByRole("tab", { name: "Time off 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View earlier requests" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Availability" })).toBeNull();
  });
  it("lands a manager notification link on its Shift Hub case", async () => {
    const caseId = "97500000-0000-4000-8000-000000000001";
    renderPage(`/app/schedule/requests?tab=shift-changes&case=${caseId}`);
    await screen.findByRole("heading", { name: "Shift changes" });
    expect(screen.getByRole("tab", { name: "Shift changes" }).getAttribute("aria-selected")).toBe("true");
    expect(getExchanges).toHaveBeenCalledWith(workspaceId, true, expect.objectContaining({ caseId }));
  });
  it.each([
    ["schedule.time_off_requests.read", "requests.read"],
    ["schedule.shift_change_requests.read", "exchange.read"],
  ] as const)("keeps a request-only reader with %s inside their permitted queue", async (permission, action) => {
    activeContext = { ...context, permissions: ["workspace.read", permission], actions: ["workspace.read", action] };
    renderPage();
    await screen.findByRole("heading", { name: "Requests" });
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: "Availability" })).toBeNull();
  });
  it("shows no decision buttons to a reader the core does not let decide time off", async () => {
    // The manage permission is still listed; the core's action is not.
    activeContext = { ...context, actions: context.actions.filter(action => action !== "time_off.decide") };
    renderPage(); await openTimeOffRequest();
    expect(screen.getByRole("dialog", { name: "Review request" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Deny/ })).toBeNull();
  });
  it("hides the time off queue from someone the core does not let read it", async () => {
    activeContext = { ...context, actions: context.actions.filter(action => action !== "requests.read") };
    renderPage();
    await screen.findByRole("heading", { name: "Requests" });
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("tab", { name: /Time off/ })).toBeNull();
  });
  it("decides cancellation pieces without assignment-release preview or reassignment", async () => {
    vi.mocked(getScheduleRequests).mockResolvedValue({ ...fixture, time_off_requests: [{ ...fixture.time_off_requests[0]!, request_type: "time_off_cancellation" }] });
    renderPage(); await openTimeOffRequest(); fireEvent.click(screen.getByRole("button", { name: "Partial" }));
    expect(screen.getByRole("dialog").textContent).toContain("does not reassign any previously released shift");
    expect(screen.getAllByRole("option", { name: "Keep leave for entire period" })).toHaveLength(2);
    fireEvent.change(screen.getByLabelText(`Decision for ${fixture.time_off_requests[0]!.segments[1]!.id}`), { target: { value: "denied" } });
    fireEvent.click(screen.getByRole("button", { name: "Save cancellation decision" }));
    await waitFor(() => expect(decideTimeOff).toHaveBeenCalled());
    expect(previewTimeOffAssignment).not.toHaveBeenCalled();
    const body = vi.mocked(decideTimeOff).mock.calls[0]![2];
    expect(body.assignment_fingerprint).toBeUndefined(); expect(body.assignment_decisions).toBeUndefined();
    expect(body.segment_decisions[1]!.status).toBe("denied");
  });
  it("wraps drawer keyboard focus and defers Escape to the unsaved-decision alert", async () => {
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 1, height: 1 }] as unknown as DOMRectList);
    vi.mocked(getScheduleRequests).mockResolvedValue({ ...fixture, time_off_requests: [{ ...fixture.time_off_requests[0]!, request_type: "time_off_cancellation" }] });
    renderPage();
    await openTimeOffRequest();
    const opener = await screen.findByRole("button", { name: "Partial" });
    opener.focus(); fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Save cancellation decision" });
    const close = screen.getByRole("button", { name: "Close" });
    const save = screen.getByRole("button", { name: "Save cancellation decision" });
    expect(document.activeElement).toBe(screen.getByLabelText(/Manager note/));
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(save);
    fireEvent.keyDown(save, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.change(screen.getByLabelText(/Manager note/), { target: { value: "Keep the first period" } });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stay here" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.change(screen.getByLabelText(/Manager note/), { target: { value: "" } });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Review request" }).contains(document.activeElement)).toBe(true);
    expect(decideTimeOff).not.toHaveBeenCalled();
  });
  it("lets a manager give back hours of approved time off (BL-127)", async () => {
    const future = { start_at: "2099-08-17T14:00:00.000Z", end_at: "2099-08-17T18:00:00.000Z" };
    vi.mocked(getScheduleRequests).mockResolvedValue({ ...fixture, time_off_requests: [{ ...fixture.time_off_requests[0]!, status: "approved", revision: 2,
      segments: [{ ...fixture.time_off_requests[0]!.segments[0]!, status: "approved", time_timezone: "UTC", effective_intervals: [future] }] }] });
    renderPage(); await openTimeOffRequest();
    fireEvent.click(await screen.findByRole("button", { name: "Shorten time off" }));
    expect(screen.getByText(/This takes effect now/)).toBeTruthy();
    const send = screen.getByRole("button", { name: "Give back these hours" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Give back period 1" }));
    fireEvent.click(send);
    await waitFor(() => expect(shortenTimeOff).toHaveBeenCalledOnce());
    expect(vi.mocked(shortenTimeOff).mock.calls[0]!.slice(0, 2)).toEqual([workspaceId, "97200000-0000-4000-8000-000000000001"]);
    expect(vi.mocked(shortenTimeOff).mock.calls[0]![2]).toMatchObject({ expected_revision: 2,
      periods: [{ segment_id: "97300000-0000-4000-8000-000000000001", starts_at: future.start_at, ends_at: future.end_at }] });
    expect(await screen.findByText(/Alex Kim's time off is shorter/)).toBeTruthy();
  });
  it("names the manager's hour picker by what it does and by its visible labels (G9b QA D2)", async () => {
    const future = { start_at: "2099-08-17T14:00:00.000Z", end_at: "2099-08-17T18:00:00.000Z" };
    vi.mocked(getScheduleRequests).mockResolvedValue({ ...fixture, time_off_requests: [{ ...fixture.time_off_requests[0]!, status: "approved", revision: 2,
      segments: [{ ...fixture.time_off_requests[0]!.segments[0]!, status: "approved", time_timezone: "UTC", effective_intervals: [future] }] }] });
    renderPage(); await openTimeOffRequest();
    fireEvent.click(await screen.findByRole("button", { name: "Shorten time off" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose hours for period 1" }));
    expect(screen.getByRole("group", { name: /^Hours to give back for period 1/ })).toBeTruthy();
    for (const name of ["Starts on, period 1", "Start time, period 1", "Repeated time, start, period 1",
      "Ends on, period 1", "End time, period 1", "Repeated time, end, period 1"])
      expect(screen.getByLabelText(name)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Discard these edits for period 1" })).toBeTruthy();
    expect(screen.queryByText(/Cancellation hours/)).toBeNull();
  });
  it("offers no shortening while time off is still pending", async () => {
    renderPage(); await openTimeOffRequest();
    await screen.findByRole("button", { name: "Partial" });
    expect(screen.queryByRole("button", { name: "Shorten time off" })).toBeNull();
  });
  it("does not offer reopen or revoke for completed cancellations", async () => {
    vi.mocked(getScheduleRequests).mockResolvedValue({ ...fixture, time_off_requests: [{ ...fixture.time_off_requests[0]!, request_type: "time_off_cancellation", status: "approved" }] });
    renderPage(); await openTimeOffRequest(); await screen.findByText(/Cancellation of approved leave/);
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull(); expect(screen.queryByRole("button", { name: "Return to pending" })).toBeNull();
  });
  // BL-273: an approved leave can release shifts; Schedule and the dashboard must not stay stale.
  it("refreshes the Schedule grid and the workspace dashboard after a decision", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["schedule-read", workspaceId, "2026-10-05"], { shifts: [] });
    client.setQueryData(["workspace-dashboard", workspaceId], { pending: 1 });
    renderPage(undefined, client);
    await openTimeOffRequest();
    fireEvent.click(screen.getByRole("button", { name: "Partial" }));
    fireEvent.change(screen.getAllByRole("combobox").at(-1)!, { target: { value: "denied" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Save Partial Decision" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save Partial Decision" }));
    await waitFor(() => expect(decideTimeOff).toHaveBeenCalled());
    await waitFor(() => expect(client.getQueryState(["schedule-read", workspaceId, "2026-10-05"])?.isInvalidated).toBe(true));
    expect(client.getQueryState(["workspace-dashboard", workspaceId])?.isInvalidated).toBe(true);
  });
  it("submits explicit partial decisions", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Requests" }),
    ).toBeTruthy();
    await openTimeOffRequest();
    fireEvent.click(screen.getByRole("button", { name: "Partial" }));
    const decision = screen.getByRole("dialog", { name: /Save partial decision/i });
    expect(decision.textContent?.replace(/\s+/g, " ")).toContain("10:00 AM–2:00 PM");
    expect(decision.textContent).toContain("Full day");
    expect(decision.textContent).toContain("Published shifts remain assigned");
    const segmentChoices = screen.getAllByRole("combobox");
    fireEvent.change(segmentChoices.at(-1)!, { target: { value: "denied" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Save Partial Decision" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(
      screen.getByRole("button", { name: "Save Partial Decision" }),
    );
    await waitFor(() =>
      expect(decideTimeOff).toHaveBeenCalledWith(
        workspaceId,
        "97200000-0000-4000-8000-000000000001",
        expect.objectContaining({
          expected_revision: 1,
          action: "partial_approve",
          segment_decisions: [
            {
              segment_id: "97300000-0000-4000-8000-000000000001",
              status: "approved",
            },
            {
              segment_id: "97300000-0000-4000-8000-000000000002",
              status: "denied",
            },
          ],
        }),
      ),
    );
    await screen.findByText("Decision saved. The queue is current.");
  });

  it("splits a single requested period, retains a failed decision, and retries with the same key", async () => {
    const segment = { ...fixture.time_off_requests[0]!.segments[0]!, end_time: "17:00:00", starts_at: "2026-08-17T10:00:00Z", ends_at: "2026-08-17T17:00:00Z", time_timezone: "UTC", time_source: "snapshot" as const };
    vi.mocked(getScheduleRequests).mockResolvedValue({ ...fixture, time_format: "24h", time_off_requests: [{ ...fixture.time_off_requests[0]!, segments: [segment] }] });
    vi.mocked(decideTimeOff).mockRejectedValueOnce(new Error("Connection lost"));
    renderPage();
    await openTimeOffRequest();
    fireEvent.click(await screen.findByRole("button", { name: "Partial" }));
    expect(screen.getByRole("dialog").textContent).toContain("10:00–17:00");
    fireEvent.click(screen.getByRole("button", { name: "Split period" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Split date"));
    expect((screen.getByRole("button", { name: "Save Partial Decision" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Split time"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply split" }));
    await screen.findByText("Split strictly inside this requested period.");
    fireEvent.change(screen.getByLabelText("Split time"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply split" }));
    expect(document.activeElement).toBe(screen.getByLabelText(`Decision for ${segment.id}`));
    fireEvent.change(screen.getByLabelText(`Piece 2 decision for ${segment.id}`), { target: { value: "denied" } });
    fireEvent.change(screen.getByLabelText(/Manager note/), { target: { value: "Morning approved; afternoon declined." } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Save Partial Decision" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save Partial Decision" }));
    await screen.findByRole("alert");
    const first = vi.mocked(decideTimeOff).mock.calls[0]?.[2];
    expect(first).toEqual({
      expected_revision: 1, action: "partial_approve", operation_id: expect.any(String), note: "Morning approved; afternoon declined.",
      assignment_fingerprint: "a".repeat(64), assignment_decisions: [],
      segment_decisions: [{ segment_id: segment.id, pieces: [
        { starts_at: "2026-08-17T10:00:00Z", ends_at: "2026-08-17T12:00:00.000Z", status: "approved" },
        { starts_at: "2026-08-17T12:00:00.000Z", ends_at: "2026-08-17T17:00:00Z", status: "denied" },
      ] }],
    });
    expect((screen.getByLabelText(/Manager note/) as HTMLTextAreaElement).value).toBe("Morning approved; afternoon declined.");
    await waitFor(() => expect((screen.getByRole("button", { name: "Save Partial Decision" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save Partial Decision" }));
    await waitFor(() => expect(decideTimeOff).toHaveBeenCalledTimes(2));
    expect(vi.mocked(decideTimeOff).mock.calls[1]?.[2]).toEqual(first);
  });

  it("requires an explicit entire-shift release before approving overlapping published work", async () => {
    const shiftId = "22000000-0000-4000-8000-000000000004";
    vi.mocked(previewTimeOffAssignment).mockResolvedValue({ request_id: fixture.time_off_requests[0]!.id, revision: 1, fingerprint: "b".repeat(64), restricted_count: 0, approved_intervals: [], affected_shifts: [{
      id: shiftId, source_id: shiftId, publication_id: workspaceId, location_id: fixture.locations[0]!.id, location_name: "Main Dining", scheduled_date: "2035-01-15",
      start_time: "15:00", end_time: "23:00", timezone: "UTC", time_basis: "explicit", time_unknown: false, job_name: "Server", starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T23:00:00Z",
    }] });
    renderPage();
    await openTimeOffRequest();
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    const choice = await screen.findByRole("checkbox", { name: /Release entire shift/ });
    const save = screen.getAllByRole("button", { name: "Approve" }).at(-1)!;
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(decideTimeOff).not.toHaveBeenCalled();
    fireEvent.click(choice);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(decideTimeOff).toHaveBeenCalledWith(workspaceId, fixture.time_off_requests[0]!.id, expect.objectContaining({
      assignment_fingerprint: "b".repeat(64), assignment_decisions: [{ shift_id: shiftId, action: "release_entire_shift" }],
    })));
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses requests (FB-6.1.9)", async () => {
    vi.mocked(getScheduleRequests).mockRejectedValue(new RequestError("Forbidden", "authz.missing_permission", undefined, 403)); vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, cases: [], opportunities: [], own_shifts: [] });
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to requests" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});
