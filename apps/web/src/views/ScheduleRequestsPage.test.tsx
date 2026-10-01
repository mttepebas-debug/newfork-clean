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
import { RequestError } from "../lib/request-error";

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
    { id: "97300000-0000-4000-8000-000000000001", segment_date: "2035-01-15", start_time: null, end_time: null, status: "pending" },
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

const fetchRequests = vi.fn(async () =>
  readFailure
    ? new Response(JSON.stringify(readFailure.body), { status: readFailure.status })
    : new Response(JSON.stringify(read), { status: 200 }));
const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
  apiRequest: (...args: unknown[]) => apiRequest(...args),
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
  fireEvent.click(await screen.findByRole("button", { name: /Alex Kim/ }));
  return screen.findByRole("dialog", { name: "Review request" });
}
const calls = () => apiRequest.mock.calls.map(([, path, init]) => [path, JSON.parse((init as RequestInit).body as string)]);
const verdict = (body: object) => ({ status: "pending", final: false, alone: false, remaining: 1, revision: 2, request_id: requestId, ...body });

beforeEach(() => {
  activeContext = context;
  read = fixture;
  readFailure = null;
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchRequests);
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
  it("does not treat employee-record read permission as request queue access", async () => {
    activeContext = { ...context, permissions: ["workspace.read", "employees.read"] };
    renderPage();
    await screen.findByRole("heading", { name: "Workspace" });
    expect(fetchRequests).not.toHaveBeenCalled();
  });
  it("keeps only Time off and Shift changes tabs and opens the manager Shift Hub", async () => {
    renderPage();
    await screen.findByText("Alex Kim");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: /Shift changes/ }));
    await screen.findByRole("heading", { name: "Shift changes" });
    expect(getExchanges).toHaveBeenCalledWith(workspaceId, true, expect.anything());
    expect(screen.getByRole("tab", { name: "Time off 1" })).toBeTruthy();
  });
  it("lands a manager notification link on its Shift Hub case", async () => {
    const caseId = "97500000-0000-4000-8000-000000000001";
    renderPage(`/app/schedule/requests?tab=shift-changes&case=${caseId}`);
    await screen.findByRole("heading", { name: "Shift changes" });
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
  });
  it("hides the time off queue from someone the core does not let read it", async () => {
    activeContext = { ...context, actions: context.actions.filter(action => action !== "requests.read") };
    renderPage();
    await screen.findByRole("heading", { name: "Requests" });
    expect(screen.queryByRole("tab", { name: /Time off/ })).toBeNull();
  });

  it("lists a request with no location by its decide-by time and the shifts it would open", async () => {
    renderPage();
    const row = await screen.findByRole("button", { name: /Alex Kim/ });
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
    renderPage();
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
    renderPage();
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
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).queryByRole("button", { name: /Revoke/ })).toBeNull();
  });
  it("does not offer revoke on an approved cancellation", async () => {
    withRequest({ status: "approved", request_type: "time_off_cancellation", progress: null });
    renderPage();
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
    renderPage();
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
