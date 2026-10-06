import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ScheduleRequestsReadModel,
  TimeOffProgress,
  TimeOffRequest,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleRequestsPage } from "./ScheduleRequestsPage";
import { PermissionRoute } from "../auth/PermissionRoute";
import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { RequestError, requestFailure } from "../lib/request-error";
import { inDeviceZone, plain } from "../employee-hub/device-zone.testing";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const requestId = "97200000-0000-4000-8000-000000000001";
const kadikoy = "11000000-0000-4000-8000-000000000001";
const besiktas = "11000000-0000-4000-8000-000000000002";
const fingerprint = "0123456789abcdef0123456789abcdef";
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
    "time_off.revoke",
    "exchange.read",
    "exchange.approve",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;
let activeContext: ActiveWorkspaceContext = context;

const shift = {
  id: "22000000-0000-4000-8000-000000000004", location_id: besiktas, location_name: "Beşiktaş",
  scheduled_date: "2035-01-15", start_time: "15:00", end_time: "23:00", timezone: "UTC", job_name: "Server",
  time_unknown: false, starts_at: "2035-01-15T15:00:00Z", ends_at: "2035-01-15T23:00:00Z",
};
// Ali works at Kadıköy and Beşiktaş; Ayşe approved Kadıköy, Beşiktaş waits.
const progress: TimeOffProgress = {
  remaining: 1, fallback: false, decide_by: "2035-01-14T09:00:00Z",
  can_vote: true, can_decide_alone: false, my_vote: null, my_approval_finalizes: true,
  locations: [
    { id: kadikoy, name: "Kadıköy", approved_by: "15000000-0000-4000-8000-000000000009", approved_by_name: "Ayşe Yılmaz", approved_at: "2035-01-10T14:15:00Z" },
    { id: besiktas, name: "Beşiktaş", approved_by: null, approved_by_name: null, approved_at: null },
  ],
  impact: { fingerprint, hidden_shift_count: 0, locations: {
    [kadikoy]: { fingerprint, shifts: [] },
    [besiktas]: { fingerprint, shifts: [shift] },
  } },
};
const pending: TimeOffRequest = {
  id: requestId,
  employee_id: "15000000-0000-4000-8000-000000000001",
  employee_name: "Alex Kim",
  request_type: "time_off",
  reason: "Family appointment",
  status: "pending",
  start_date: "2035-01-15",
  end_date: "2035-01-16",
  revision: 1,
  created_at: "2035-01-09T11:00:00.000Z",
  decide_by: "2035-01-14T09:00:00Z",
  conflict_count: 0,
  segments: [
    { id: "97300000-0000-4000-8000-000000000001", segment_date: "2035-01-15", start_time: null, end_time: null, status: "pending", time_timezone: "UTC" },
  ],
  events: [],
  progress,
};
const fixture = {
  workspace_id: workspaceId,
  locations: [{ id: kadikoy, name: "Kadıköy" }, { id: besiktas, name: "Beşiktaş" }],
  time_off_pending_count: 1,
  time_off_next_cursor: null,
  time_off_requests: [pending],
} satisfies ScheduleRequestsReadModel;
let read: ScheduleRequestsReadModel = fixture;
let readFailure: { status: number; body: unknown } | null = null;

// Whole-repo runs share the cores with three other packages; Testing
// Library's 1 s default for findBy/waitFor is what ran out there (U19).
configure({ asyncUtilTimeout: 5000 });

// The Requests read (GET .../schedule/requests); decisions go to apiRequest.
const fetchRequests = vi.fn(async (_path: string) => {
  if (readFailure) throw requestFailure(readFailure.body, readFailure.status, "Workspace operation failed");
  return read;
});
const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
  apiRequest: (client: unknown, path: string, init?: RequestInit) =>
    path.includes("/schedule/requests?") ? fetchRequests(path) : apiRequest(client, path, init),
  getTabWorkspaceId: () => null,
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context: activeContext }),
}));
// A decision that closes the drawer reports through the shared toast.
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@newfork/ui", async (original) => ({
  ...(await original<typeof import("@newfork/ui")>()),
  useToast: () => toast,
}));
vi.mock("../employee-hub/shift-exchanges/exchange-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../employee-hub/shift-exchanges/exchange-data")>()),
  getExchanges: vi.fn(),
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
function withRequest(change: Partial<TimeOffRequest>) {
  read = { ...fixture, time_off_requests: [{ ...pending, ...change }] };
}
async function openTimeOffRequest() {
  fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
  return screen.findByRole("dialog", { name: "Review request" });
}
const calls = () => apiRequest.mock.calls.map(([, path, init]) => [path, JSON.parse((init as RequestInit).body as string)]);
const verdict = (body: object) => ({ status: "pending", final: false, alone: false, remaining: 1, revision: 2, request_id: requestId, ...body });

beforeEach(() => {
  activeContext = context;
  read = fixture;
  readFailure = null;
  vi.clearAllMocks();
  vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, cases: [], opportunities: [], own_shifts: [] });
});

describe("Requests > Time off (FB-6.3.6)", () => {
  it.each(["owner", "admin", "manager"] as const)("redirects an old availability link for %s without loading an approval queue", async role => {
    activeContext = { ...context, membership: { ...context.membership, role }, permissions: ["workspace.read", "schedule.read"] };
    renderPage("/app/schedule/requests?tab=availability&request=old&legacy=1&case=old&offer=old");
    await screen.findByRole("heading", { name: "Team Availability" });
    expect(screen.getByLabelText("Current URL").textContent).toBe("/app/availability");
    expect(fetchRequests).not.toHaveBeenCalled();
    expect(getExchanges).not.toHaveBeenCalled();
  });
  it("preserves team access control for an employee following an old availability link", async () => {
    activeContext = { ...context, membership: { ...context.membership, role: "employee" }, permissions: ["workspace.read"] };
    renderPage("/app/schedule/requests?tab=availability");
    await screen.findByRole("heading", { name: "Employee Hub" });
    expect(fetchRequests).not.toHaveBeenCalled();
  });
  // EKRAN-02 C1 (K-S8): one table; tabs follow the work, not the request type.
  it("lists time off and shift changes in one table under Needs review, In progress and Closed", async () => {
    renderPage();
    await screen.findByRole("row", { name: /Alex Kim/ });
    const tabs = screen.getByRole("group", { name: "Request status" });
    expect(within(tabs).getAllByRole("button").map((button) => button.textContent)).toEqual(["Needs review1", "In progress", "Closed"]);
    expect(within(tabs).getByRole("button", { name: /Needs review/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(getExchanges).toHaveBeenCalledWith(workspaceId, true);
    expect(screen.getByRole("group", { name: "Request type" })).toBeTruthy();
    for (const label of ["Time off", "Swap", "Cover", "Open shift"]) expect(screen.getByRole("checkbox", { name: label })).toBeTruthy();
  });
  it("keeps the request type choice in the address and moves along the tabs with the arrow keys (R2-48)", async () => {
    renderPage();
    await screen.findByRole("row", { name: /Alex Kim/ });
    fireEvent.click(screen.getByRole("checkbox", { name: "Time off" }));
    expect(screen.getByLabelText("Current URL").textContent).toContain("types=swap%2Ccover%2Copen_pickup");
    expect(screen.queryByRole("row", { name: /Alex Kim/ })).toBeNull();
    const needsReview = screen.getByRole("button", { name: /Needs review/ });
    needsReview.focus();
    fireEvent.keyDown(needsReview, { key: "ArrowRight" });
    expect(document.activeElement?.textContent).toBe("In progress");
  });
  it("lands a manager notification link on its Shift Hub case", async () => {
    const caseId = "97500000-0000-4000-8000-000000000001";
    renderPage(`/app/schedule/requests?case=${caseId}`);
    await screen.findByRole("heading", { name: "Shift changes" });
    expect(getExchanges).toHaveBeenCalledWith(workspaceId, true, expect.objectContaining({ caseId }));
  });
  it("keeps a time off reader to time off: no request type menu, no shift change list asked for", async () => {
    activeContext = { ...context, permissions: ["workspace.read", "schedule.time_off_requests.read"], actions: ["workspace.read", "requests.read"] };
    renderPage();
    await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.queryByRole("group", { name: "Request type" })).toBeNull();
    expect(getExchanges).not.toHaveBeenCalled();
  });
  it("keeps a shift change reader to shift changes: no Time off type, no time off list asked for", async () => {
    activeContext = { ...context, permissions: ["workspace.read", "schedule.shift_change_requests.read"], actions: ["workspace.read", "exchange.read"] };
    renderPage();
    await screen.findByRole("heading", { name: "Requests" });
    expect(screen.queryByRole("checkbox", { name: "Time off" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Swap" })).toBeTruthy();
    expect(fetchRequests).not.toHaveBeenCalled();
  });
  // EKRAN-02 B1: the page's door asks the core, like its tabs do.
  it("sends away someone whose role names a request permission the core does not grant here", async () => {
    activeContext = { ...context, actions: context.actions.filter(action => action !== "requests.read" && action !== "exchange.read") };
    renderPage();
    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
    expect(fetchRequests).not.toHaveBeenCalled();
  });
  it("hides the time off queue from someone the core does not let read it", async () => {
    activeContext = { ...context, actions: context.actions.filter(action => action !== "requests.read") };
    renderPage();
    await screen.findByRole("heading", { name: "Requests" });
    expect(screen.queryByRole("checkbox", { name: "Time off" })).toBeNull();
    expect(fetchRequests).not.toHaveBeenCalled();
  });

  it("lists a request with no location by its decide-by time and the shifts it would open", async () => {
    renderPage();
    const row = await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.getByRole("columnheader", { name: /Decide by/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /Location/ })).toBeNull();
    expect(row.textContent).toContain("Jan 14");
    expect(within(row).getByTitle("Shifts that become open").textContent).toBe("1");
  });

  it("shows who approved which location, what is left, the deadline and the shifts that open", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    const panel = within(drawer).getByRole("region", { name: "Approval progress" });
    expect(panel.textContent).toContain("1 of 2 locations approved");
    expect(panel.textContent).toContain("Decide by Jan 14");
    expect(panel.textContent).toContain("Ayşe Yılmaz");
    expect(panel.textContent).toContain("Waiting");
    expect(panel.textContent).toContain("Mon, Jan 15 · 3:00 PM–11:00 PM · Server");
  });
  it("writes the decide-by time in the request's zone and names it, on any device (FB-6.3.8d)", async () => {
    // Ali asked from Istanbul; a manager in Los Angeles or Tokyo reads the same deadline.
    withRequest({ segments: [{ ...pending.segments[0]!, time_timezone: "Europe/Istanbul" }] });
    for (const device of ["America/Los_Angeles", "Asia/Tokyo"]) {
      await inDeviceZone(device, async () => {
        const view = renderPage();
        const row = await screen.findByRole("row", { name: /Alex Kim/ });
        expect(plain(row.textContent)).toContain("Jan 14, 12:00 PM Istanbul time");
        const drawer = await openTimeOffRequest();
        const panel = within(drawer).getByRole("region", { name: "Approval progress" });
        expect(plain(panel.textContent)).toContain("Decide by Jan 14, 12:00 PM Istanbul time");
        view.unmount();
      });
    }
  });
  it("draws one progress layout whatever the address asks for (P04: checklist)", async () => {
    renderPage("/app/schedule/requests?progressVariant=c");
    const drawer = await openTimeOffRequest();
    const panel = within(drawer).getByRole("region", { name: "Approval progress" });
    expect(panel.className).toBe("tov");
    expect(panel.querySelector("[title]")).toBeNull();
  });
  it("titles the shifts that open like the drawer's other sections", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    const panel = within(drawer).getByRole("region", { name: "Approval progress" });
    expect(within(panel).getByRole("heading", { name: "Shifts that become open" }).tagName).toBe("H2");
  });
  it("does not repeat the request's pending state under every period", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).queryByText(/Awaiting decision/)).toBeNull();
  });
  it("says an admin or owner decides when no location manager can", async () => {
    withRequest({ progress: { ...progress, fallback: true, locations: [] } });
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(drawer.textContent).toContain("No location manager can decide. An admin or owner decides.");
  });

  it("shows no vote buttons when the core says this reader cannot vote", async () => {
    withRequest({ progress: { ...progress, can_vote: false, can_decide_alone: false } });
    renderPage("/app/schedule/requests?tab=in_progress");
    const drawer = await openTimeOffRequest();
    expect(within(drawer).queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(within(drawer).queryByRole("button", { name: /Deny/ })).toBeNull();
    expect(drawer.textContent).toContain("View-only access");
  });
  it("records a manager's approval that does not finish the request without a confirm box", async () => {
    withRequest({ progress: { ...progress, my_approval_finalizes: false, remaining: 2 } });
    apiRequest.mockResolvedValueOnce(verdict({ remaining: 1 }));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    // QA D1: the drawer stays open, so the word is said inside it, where the
    // reader is; the page behind the drawer is inert, and so is the toast there.
    expect((await within(drawer).findByRole("status")).textContent).toBe("Your approval is saved. 1 location still to approve.");
    expect(screen.getByRole("dialog", { name: "Review request" })).toBe(drawer);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(calls()).toEqual([[`/v1/workspaces/${workspaceId}/time-off/${requestId}/verdict`, { verdict: "approve", note: "", expected_impact: fingerprint }]]);
  });
  it("asks before the approval that opens published shifts", async () => {
    apiRequest.mockResolvedValueOnce(verdict({ status: "approved", final: true, remaining: 0 }));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    const box = await screen.findByRole("alertdialog", { name: "Approve time off?" });
    expect(box.textContent).toContain("1 published shift becomes an open shift.");
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(within(box).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off approved."));
    expect(calls()[0]![1]).toEqual({ verdict: "approve", note: "", expected_impact: fingerprint });
  });
  it("tells an admin or owner their approval takes effect now", async () => {
    withRequest({ progress: { ...progress, can_vote: false, can_decide_alone: true, my_approval_finalizes: true } });
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    const box = await screen.findByRole("alertdialog", { name: "Approve time off?" });
    expect(box.textContent).toContain("Takes effect now. Managers at Alex Kim's locations are notified. 1 published shift becomes an open shift.");
  });
  it("names no managers to notify when the request has no location (P21)", async () => {
    withRequest({ progress: { ...progress, fallback: true, locations: [], can_vote: false, can_decide_alone: true,
      impact: { fingerprint, hidden_shift_count: 0, locations: {} } } });
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    const box = await screen.findByRole("alertdialog", { name: "Approve time off?" });
    expect(box.textContent).toContain("Takes effect now.");
    expect(box.textContent).not.toContain("Managers at");
  });
  it("denies with an optional note", async () => {
    apiRequest.mockResolvedValueOnce(verdict({ status: "denied", final: true, remaining: 0 }));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: /Deny/ }));
    const box = await screen.findByRole("alertdialog", { name: "Deny time off?" });
    fireEvent.change(within(box).getByLabelText("Note for Alex Kim (optional)"), { target: { value: " I can approve Jan 15 only " } });
    fireEvent.click(within(box).getByRole("button", { name: "Deny" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off denied."));
    expect(calls()[0]![1]).toEqual({ verdict: "deny", note: "I can approve Jan 15 only", expected_impact: fingerprint });
  });
  it("closes the box and asks for a second look when the request changed meanwhile", async () => {
    apiRequest.mockRejectedValueOnce(new RequestError("The shifts this time off affects changed.", undefined, undefined, 409));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Approve" }));
    // QA D1: the request is still pending, so the drawer stays open and says it,
    // in the warning tone: nothing was saved.
    const changed = await within(drawer).findByRole("status");
    expect(changed.textContent).toBe("This request changed. Review it again.");
    expect(changed.className).toBe("request-drawer-notice warning");
    expect(screen.getByRole("dialog", { name: "Review request" })).toBe(drawer);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(fetchRequests.mock.calls.length).toBeGreaterThan(1));
  });
  it("keeps the box and its note open when the vote fails for another reason", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Connection lost"));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: /Deny/ }));
    const box = await screen.findByRole("alertdialog");
    fireEvent.change(within(box).getByRole("textbox"), { target: { value: "Short staffed" } });
    fireEvent.click(within(box).getByRole("button", { name: "Deny" }));
    const alert = await within(box).findByRole("alert");
    expect(alert.textContent).toBe("Connection lost");
    // QA D2: red like every other form error.
    expect(alert.className).toBe("form-error");
    expect((within(box).getByRole("textbox") as HTMLTextAreaElement).value).toBe("Short staffed");
  });
  it("offers no Partial or Return to pending any more", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).queryByRole("button", { name: "Partial" })).toBeNull();
    expect(within(drawer).queryByRole("button", { name: /Return to pending/ })).toBeNull();
  });

  it("revokes approved time off only with a reason", async () => {
    withRequest({ status: "approved", revision: 3, progress: null });
    apiRequest.mockResolvedValueOnce({ status: "revoked", request_id: requestId, revision: 4 });
    renderPage("/app/schedule/requests?tab=closed");
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: /Revoke/ }));
    const box = await screen.findByRole("alertdialog", { name: "Revoke time off?" });
    const confirm = within(box).getByRole("button", { name: "Revoke" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(box).getByLabelText("Reason"), { target: { value: "Inventory day" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off revoked."));
    expect(calls()).toEqual([[`/v1/workspaces/${workspaceId}/time-off/${requestId}/revoke`, { expected_revision: 3, reason: "Inventory day" }]]);
  });
  it("does not offer revoke without the core's revoke action", async () => {
    withRequest({ status: "approved", progress: null });
    activeContext = { ...context, actions: context.actions.filter(action => action !== "time_off.revoke") };
    renderPage("/app/schedule/requests?tab=closed");
    const drawer = await openTimeOffRequest();
    expect(within(drawer).queryByRole("button", { name: /Revoke/ })).toBeNull();
  });
  it("does not offer revoke on an approved cancellation", async () => {
    withRequest({ status: "approved", request_type: "time_off_cancellation", progress: null });
    renderPage("/app/schedule/requests?tab=closed");
    const drawer = await openTimeOffRequest();
    expect(within(drawer).queryByRole("button", { name: /Revoke/ })).toBeNull();
  });
  it("votes on a cancellation request with its own words", async () => {
    withRequest({ request_type: "time_off_cancellation", progress: { ...progress, impact: { fingerprint, hidden_shift_count: 0, locations: {} } } });
    apiRequest.mockResolvedValueOnce(verdict({ status: "denied", final: true, remaining: 0 }));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: /Decline/ }));
    const box = await screen.findByRole("alertdialog", { name: "Decline cancellation?" });
    expect(box.textContent).toContain("The time off stays in place.");
    fireEvent.click(within(box).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Cancellation declined."));
  });

  it("lets a manager give back hours of approved time off (BL-127)", async () => {
    const future = { start_at: "2099-08-17T14:00:00.000Z", end_at: "2099-08-17T18:00:00.000Z" };
    withRequest({ status: "approved", revision: 2, progress: null,
      segments: [{ ...pending.segments[0]!, start_time: "10:00:00", end_time: "14:00:00", status: "approved", time_timezone: "UTC", effective_intervals: [future] }] });
    apiRequest.mockResolvedValueOnce({ status: "approved", request_id: requestId, revision: 3 });
    renderPage("/app/schedule/requests?tab=closed");
    await openTimeOffRequest();
    fireEvent.click(await screen.findByRole("button", { name: "Shorten time off" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Give back period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Give back these hours" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    expect(calls()[0]![0]).toBe(`/v1/workspaces/${workspaceId}/time-off/${requestId}/shorten`);
    expect(calls()[0]![1]).toMatchObject({ expected_revision: 2,
      periods: [{ segment_id: pending.segments[0]!.id, starts_at: future.start_at, ends_at: future.end_at }] });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Alex Kim's time off is shorter/)));
  });
  it("offers no shortening while time off is still pending", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).queryByRole("button", { name: "Shorten time off" })).toBeNull();
  });
  // BL-273: an approval can open shifts; Schedule and the dashboard must not stay stale.
  it("refreshes the Schedule grid and the workspace dashboard after a decision", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["schedule-read", workspaceId, "2035-01-15"], { shifts: [] });
    client.setQueryData(["workspace-dashboard", workspaceId], { pending: 1 });
    apiRequest.mockResolvedValueOnce(verdict({ status: "approved", final: true, remaining: 0 }));
    renderPage(undefined, client);
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(client.getQueryState(["schedule-read", workspaceId, "2035-01-15"])?.isInvalidated).toBe(true));
    expect(client.getQueryState(["workspace-dashboard", workspaceId])?.isInvalidated).toBe(true);
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses requests (FB-6.1.9)", async () => {
    readFailure = { status: 403, body: { error: "Forbidden", reason: "authz.missing_permission" } };
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to requests" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});

// EKRAN-02 B1 (R2-10): search narrows the list in place.
describe("search", () => {
  it("keeps the list and the search box while the next rows load", async () => {
    renderPage();
    const box = await screen.findByLabelText("Search requests");
    await screen.findByRole("row", { name: /Alex Kim/ });
    let answer: (model: ScheduleRequestsReadModel) => void = () => undefined;
    fetchRequests.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    box.focus();
    fireEvent.change(box, { target: { value: "a".repeat(200) } });
    await waitFor(() => expect(fetchRequests.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText("Loading requests...")).toBeNull();
    expect(screen.getByRole("row", { name: /Alex Kim/ })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Search requests"));
    const asked = new URL(fetchRequests.mock.calls.at(-1)![0], "http://x").searchParams.get("search");
    expect(asked).toHaveLength(120);
    answer(read);
  });
});
