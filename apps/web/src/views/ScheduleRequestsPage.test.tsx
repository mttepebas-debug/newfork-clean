import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ScheduleRequestsReadModel,
  TimeOffProgress,
  TimeOffRequest,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleRequestsPage } from "./ScheduleRequestsPage";
import { PermissionRoute } from "../auth/PermissionRoute";
import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { RequestError, requestFailure } from "../lib/request-error";
import { inDeviceZone, plain } from "../employee-hub/device-zone.testing";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
// A request the core no longer hands back (BL-1024).
const missingCaseId = "97500000-0000-4000-8000-0000000000ff";
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
    access: { employee: false, management: "owner" },
    status: "active",
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
// Each queue answers with its own requests: pending ones for needs_review,
// the rest for closed. A search narrows them by name, as the server does.
const fetchRequests = vi.fn(async (path: string) => {
  if (readFailure) throw requestFailure(readFailure.body, readFailure.status, "Workspace operation failed");
  const query = new URL(path, "http://x").searchParams;
  const closed = query.get("time_off_queue") === "closed";
  const search = (query.get("search") ?? "").toLowerCase();
  return { ...read, time_off_requests: read.time_off_requests.filter((request) =>
    (request.status === "pending") !== closed && request.employee_name.toLowerCase().includes(search)) };
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

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">{location.pathname + location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>Browser back</button>
      <button type="button" onClick={() => navigate(`/app/schedule/requests?case=${missingCaseId}`)}>Follow a request link</button>
    </>
  );
}
function renderPage(
  initialPath = "/app/schedule/requests",
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  before: string[] = [],
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[...before, initialPath]}>
        <Routes>
          <Route path="/app/schedule/requests" element={<ScheduleRequestsPage />} />
          <Route path="/app/availability" element={
            <PermissionRoute management anyOf={["schedule.read"]}>
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
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
  activeContext = context;
  read = fixture;
  readFailure = null;
  vi.clearAllMocks();
  vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, cases: [], opportunities: [], own_shifts: [] });
});

describe("Requests > Time off (FB-6.3.6)", () => {
  it.each(["owner", "admin", "manager"] as const)("redirects an old availability link for %s without loading an approval queue", async role => {
    activeContext = { ...context, membership: { ...context.membership, access: { employee: false, management: role } }, permissions: ["workspace.read", "schedule.read"] };
    renderPage("/app/schedule/requests?tab=availability&request=old&legacy=1&case=old&offer=old");
    await screen.findByRole("heading", { name: "Team Availability" });
    expect(screen.getByLabelText("Current URL").textContent).toBe("/app/availability");
    expect(fetchRequests).not.toHaveBeenCalled();
    expect(getExchanges).not.toHaveBeenCalled();
  });
  it("preserves team access control for an employee following an old availability link", async () => {
    activeContext = { ...context, membership: { ...context.membership, access: { employee: true, management: null } }, permissions: ["workspace.read"], actions: ["workspace.read", "employee_hub.read"] };
    renderPage("/app/schedule/requests?tab=availability");
    // The old link opens team Availability, which shows the card in place,
    // not a silent trip home (Mert 2026-10-14).
    await screen.findByRole("heading", { name: "You don't have access to Availability" });
    expect(screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")).toBe("/app/employee-hub");
    expect(fetchRequests).not.toHaveBeenCalled();
  });
  // KARARLAR Schedule → Requests, Ek 2026-10-07: the tabs are request types,
  // each with what is still open; the filter row is Location and search.
  it("lists time off and shift changes in one table under the request type tabs", async () => {
    renderPage();
    await screen.findByRole("row", { name: /Alex Kim/ });
    const tabs = screen.getByRole("group", { name: "Request type" });
    expect(within(tabs).getAllByRole("button").map((button) => button.textContent)).toEqual(["All1", "Time off1", "Shift changes"]);
    expect(within(tabs).getByRole("button", { name: /All/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("group", { name: "Request status" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(getExchanges).toHaveBeenCalledWith(workspaceId, true);
  });
  it("keeps the request type tab in the address and moves along the tabs with the arrow keys (R2-48)", async () => {
    renderPage();
    await screen.findByRole("row", { name: /Alex Kim/ });
    fireEvent.click(screen.getByRole("button", { name: /^Shift changes/ }));
    expect(screen.getByLabelText("Current URL").textContent).toContain("type=shift_changes");
    expect(screen.queryByRole("row", { name: /Alex Kim/ })).toBeNull();
    const all = screen.getByRole("button", { name: /^All/ });
    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(document.activeElement?.textContent).toBe("Time off1");
  });
  // P09: a closed request stays in the one list, under the open ones.
  it("lists a closed request under the open ones in the same table", async () => {
    const approved: TimeOffRequest = {
      ...pending, id: "97200000-0000-4000-8000-000000000002", employee_name: "Deniz Acar", status: "approved", progress: null,
      events: [{ id: "97400000-0000-4000-8000-000000000001", action: "approved", actor_name: "Ayşe Yılmaz", note: "", created_at: "2035-01-10T09:00:00Z" }],
    };
    read = { ...fixture, time_off_requests: [pending, approved] };
    renderPage();
    const closed = await screen.findByRole("row", { name: /Deniz Acar/ });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.getAttribute("aria-label")?.match(/^Time off: (\S+ \S+)/)?.[1])).toEqual(["Alex Kim", "Deniz Acar"]);
    expect(within(closed).getByText("Approved")).toBeTruthy();
    expect(within(rows[0]!).getByText("Needs decision")).toBeTruthy();
    expect(fetchRequests.mock.calls.some(([path]) => path.includes("time_off_queue=closed"))).toBe(true);
  });
  // EKRAN-02 #67 (KARARLAR Genel, telefonda kart satırı); TAKAS-RELEASE (Mert,
  // 2026-10-17): the phone shows a card per request: the kind's icon, the
  // sentence, then Status and Expires, Expires only while the request is open.
  it("gives each request a phone card: the sentence, Status, Expires only while open", async () => {
    const approved: TimeOffRequest = {
      ...pending, id: "97200000-0000-4000-8000-000000000002", employee_name: "Deniz Acar", status: "approved", progress: null,
      events: [{ id: "97400000-0000-4000-8000-000000000001", action: "approved", actor_name: "Ayşe Yılmaz", note: "", created_at: "2035-01-10T09:00:00Z" }],
    };
    read = { ...fixture, time_off_requests: [pending, approved] };
    renderPage();
    const cards = await screen.findByRole("list", { name: "Requests" });
    const open = await within(cards).findByRole("button", { name: /^Time off: Alex Kim/ });
    expect(open.getAttribute("aria-label")).toContain("Needs decision");
    expect(plain(open.querySelector(".request-sentence")!.textContent)).toBe("Alex Kim asked for time off Mon, Jan 15 – Tue, Jan 16. 1 shift becomes open.");
    expect(plain(open.querySelector(".request-card-foot")!.textContent)).toBe("Needs decisionExpires Jan 14, 9:00 AM UTC");
    const closed = within(cards).getByRole("button", { name: /^Time off: Deniz Acar/ });
    expect(closed.querySelector(".request-card-foot")!.textContent).toBe("Approved");
    fireEvent.click(open);
    expect(await screen.findByRole("dialog", { name: "Review request" })).toBeTruthy();
  });
  // A tab row wider than a phone scrolls, and a faded edge says so.
  it("fades the tab row's edge where more tabs wait, and brings the chosen tab into view", async () => {
    const shown: string[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { shown.push(this.textContent ?? ""); };
    renderPage("/app/schedule/requests?type=cover");
    const tabs = await screen.findByRole("group", { name: "Request type" });
    await waitFor(() => expect(shown).toContain("Shift changes"));
    const row = tabs.parentElement!;
    Object.defineProperty(row, "scrollWidth", { configurable: true, value: 380 });
    Object.defineProperty(row, "clientWidth", { configurable: true, value: 298 });
    row.scrollLeft = 0;
    fireEvent.scroll(row);
    expect(row.getAttribute("data-more")).toBe("right");
    row.scrollLeft = 40;
    fireEvent.scroll(row);
    expect(row.getAttribute("data-more")).toBe("both");
    row.scrollLeft = 82;
    fireEvent.scroll(row);
    expect(row.getAttribute("data-more")).toBe("left");
  });
  // One list from three reads: it is drawn once all of them answered, so rows
  // never jump as a late read slots its requests in between.
  it("draws the list once every read has answered", async () => {
    let answer: (value: Awaited<ReturnType<typeof getExchanges>>) => void = () => undefined;
    vi.mocked(getExchanges).mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    renderPage();
    await waitFor(() => expect(fetchRequests.mock.calls.length).toBeGreaterThanOrEqual(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("row", { name: /Alex Kim/ })).toBeNull();
    expect(screen.getByText("Loading requests")).toBeTruthy();
    answer({ employee_id: null, cases: [], opportunities: [], own_shifts: [] });
    expect(await screen.findByRole("row", { name: /Alex Kim/ })).toBeTruthy();
  });
  // P09: a closed swap stays in the one list with its outcome.
  it("lists a closed shift change under the open requests with its outcome", async () => {
    const closedSwap = {
      id: "97500000-0000-4000-8000-000000000009", kind: "swap", audience: "eligible_pool", status: "completed", stage: "closed",
      revision: 3, created_at: "2035-01-02T09:00:00Z", expires_at: "2035-01-05T09:00:00Z", owner_id: "15000000-0000-4000-8000-0000000000e1", owner_name: "Emre Person",
      shift, requested_shift: null, applications: [], candidate_count: 0, can_manage: true, is_owner: false,
      history: [{ id: "97600000-0000-4000-8000-000000000001", action: "completed", created_at: "2035-01-04T09:00:00Z", message: "" }],
    };
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, cases: [closedSwap], opportunities: [], own_shifts: [] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage();
    const swap = await screen.findByRole("row", { name: /^Shift swap: Emre Person/ });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.indexOf(swap)).toBe(1);
    expect(within(swap).getByText("Approved")).toBeTruthy();
  });
  // Opening a shift change is a step the browser's Back undoes.
  it("goes back from a shift change to the list with the browser's Back", async () => {
    const caseId = "97500000-0000-4000-8000-000000000002";
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [{
      id: caseId, kind: "cover", audience: "eligible_pool", status: "open", stage: "ready_for_manager", revision: 1,
      created_at: "2035-01-02T09:00:00Z", expires_at: "2035-01-12T09:00:00Z", owner_id: "15000000-0000-4000-8000-0000000000e1", owner_name: "Emre Person",
      shift, requested_shift: null, applications: [], candidate_count: 1, can_manage: true, is_owner: false, history: [],
    }] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage(undefined, undefined, ["/app/workspace"]);
    fireEvent.click(await screen.findByRole("row", { name: /^Shift pickup: .*Emre Person/ }));
    expect(screen.getByLabelText("Current URL").textContent).toContain(`case=${caseId}`);
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByLabelText("Current URL").textContent).toBe("/app/schedule/requests");
  });
  // Mert, 2026-10-11: a cover or an open shift opens its drawer over the list.
  const coverCase = {
    id: "97500000-0000-4000-8000-000000000007", kind: "cover", audience: "eligible_pool", status: "open", stage: "ready_for_manager", revision: 1,
    created_at: "2035-01-02T09:00:00Z", expires_at: "2035-01-12T09:00:00Z", owner_id: "15000000-0000-4000-8000-0000000000e1", owner_name: "Emre Person",
    shift, requested_shift: null, applications: [], candidate_count: 0, can_manage: true, is_owner: false, history: [],
  };
  it("opens a cover in its drawer over the list, and closes it", async () => {
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [coverCase] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage();
    fireEvent.click(await screen.findByRole("row", { name: /^Shift pickup: .*Emre Person/ }));
    const drawer = await screen.findByRole("dialog", { name: "Review shift change" });
    expect(within(drawer).getByRole("heading", { level: 2 }).textContent).toContain("Shift pickup");
    expect(screen.getByLabelText("Current URL").textContent).toContain(`case=${coverCase.id}`);
    fireEvent.click(within(drawer).getByRole("button", { name: "Close details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review shift change" })).toBeNull());
    expect(screen.getByLabelText("Current URL").textContent).toBe("/app/schedule/requests");
  });
  it("leaves no extra history step behind a closed cover drawer", async () => {
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [coverCase] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage("/app/schedule/requests", undefined, ["/app/workspace"]);
    fireEvent.click(await screen.findByRole("row", { name: /^Shift pickup: .*Emre Person/ }));
    const drawer = await screen.findByRole("dialog", { name: "Review shift change" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close details" }));
    await waitFor(() => expect(screen.getByLabelText("Current URL").textContent).toBe("/app/schedule/requests"));
    // One Back leaves Requests, as it would have before the drawer opened.
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
  });
  it("lands a manager link for a listed cover on its drawer, not on Shift Hub", async () => {
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [coverCase] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage(`/app/schedule/requests?case=${coverCase.id}`);
    expect(await screen.findByRole("dialog", { name: "Review shift change" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Shift changes" })).toBeNull();
  });
  it("reads a linked cover the list does not carry and opens its drawer", async () => {
    vi.mocked(getExchanges).mockImplementation(async (_workspace, _manager, range) =>
      ({ employee_id: null, opportunities: [], own_shifts: [], cases: range?.caseId === coverCase.id ? [coverCase] : [] }) as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage(`/app/schedule/requests?case=${coverCase.id}`);
    expect(await screen.findByRole("dialog", { name: "Review shift change" })).toBeTruthy();
    expect(getExchanges).toHaveBeenCalledWith(workspaceId, true, { caseId: coverCase.id });
  });
  it("lands a manager link for a listed swap on its review window", async () => {
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [{
      ...coverCase, kind: "swap", requested_shift: { ...shift, id: "22000000-0000-4000-8000-000000000007", employee_name: "Deniz Acar" },
    }] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage(`/app/schedule/requests?case=${coverCase.id}`);
    expect(await screen.findByRole("dialog", { name: "Swap request" })).toBeTruthy();
    // The window opens in the same effect that drops ?case=; the router commits
    // the new URL a tick later, which a loaded CI runner can show (train 2026-10-11).
    await waitFor(() => expect(screen.getByLabelText("Current URL").textContent).toBe("/app/schedule/requests"));
  });
  // EKRAN-02 C2 (H2): a swap opens its review window over the list, not Shift Hub.
  it("opens a swap in its review window over the list", async () => {
    const swapId = "97500000-0000-4000-8000-000000000003";
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [{
      id: swapId, kind: "swap", audience: "direct", status: "open", stage: "ready_for_manager", revision: 1,
      created_at: "2035-01-02T09:00:00Z", expires_at: "2035-01-12T09:00:00Z", owner_id: "15000000-0000-4000-8000-0000000000e1", owner_name: "Emre Person",
      shift, requested_shift: { ...shift, id: "22000000-0000-4000-8000-000000000005", employee_name: "Deniz Acar" },
      applications: [{ id: "97600000-0000-4000-8000-000000000003", employee_id: "15000000-0000-4000-8000-000000000003", employee_name: "Deniz Acar",
        status: "pending_manager", created_at: "2035-01-02T10:00:00Z", reason: "", eligibility: null }],
      candidate_count: 1, can_manage: true, is_owner: false, history: [],
    }] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage();
    fireEvent.click(await screen.findByRole("row", { name: /^Shift swap: Emre Person/ }));
    const review = await screen.findByRole("dialog", { name: "Swap request" });
    expect(review.textContent).toContain("Emre Person ⇄ Deniz Acar");
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("case=");
    fireEvent.click(within(review).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Swap request" })).toBeNull());
  });
  // Another manager closes the case while Ayse reads it: a refresh that no
  // longer lists it must not pull the window from under her.
  it("keeps a swap's review window open when a refresh no longer lists the swap", async () => {
    const swapId = "97500000-0000-4000-8000-000000000004";
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [{
      id: swapId, kind: "swap", audience: "direct", status: "open", stage: "ready_for_manager", revision: 1,
      created_at: "2035-01-02T09:00:00Z", expires_at: "2035-01-12T09:00:00Z", owner_id: "15000000-0000-4000-8000-0000000000e1", owner_name: "Emre Person",
      shift, requested_shift: { ...shift, id: "22000000-0000-4000-8000-000000000006", employee_name: "Deniz Acar" },
      applications: [{ id: "97600000-0000-4000-8000-000000000004", employee_id: "15000000-0000-4000-8000-000000000003", employee_name: "Deniz Acar",
        status: "pending_manager", created_at: "2035-01-02T10:00:00Z", reason: "", eligibility: null }],
      candidate_count: 1, can_manage: true, is_owner: false, history: [],
    }] } as unknown as Awaited<ReturnType<typeof getExchanges>>);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderPage(undefined, client);
    fireEvent.click(await screen.findByRole("row", { name: /^Shift swap: Emre Person/ }));
    await screen.findByRole("dialog", { name: "Swap request" });
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: null, opportunities: [], own_shifts: [], cases: [] });
    await client.invalidateQueries({ queryKey: ["shift-exchanges"] });
    await waitFor(() => expect(screen.queryByRole("row", { name: /^Shift swap: Emre Person/ })).toBeNull());
    expect(screen.getByRole("dialog", { name: "Swap request" }).textContent).toContain("Emre Person ⇄ Deniz Acar");
  });
  // BL-1024: the old Shift Hub manager screen is gone; a stray ?offer= is
  // only the employee's form (Employee Hub), so Requests stays the list.
  it("keeps the Requests list for an old ?offer= link, not the old Shift Hub screen", async () => {
    renderPage("/app/schedule/requests?offer=22000000-0000-4000-8000-000000000004");
    await screen.findByRole("group", { name: "Request type" });
    expect(screen.queryByRole("heading", { name: "Shift changes" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Shift change queues" })).toBeNull();
  });
  // A link to a case the core no longer hands this manager (a
  // closed location, a narrower scope): Requests says so in its own empty
  // state, where the table was, and one button brings the list back (BL-1024;
  // Mert, 2026-10-12: variant D and its sentence).
  it("says a request is no longer available in place of the table, then brings the list back", async () => {
    const caseId = "97500000-0000-4000-8000-000000000001";
    const empty = { employee_id: null, cases: [], opportunities: [], own_shifts: [] };
    let answer: (value: typeof empty) => void = () => {};
    const listed = vi.mocked(getExchanges).getMockImplementation();
    vi.mocked(getExchanges).mockImplementation((workspace, manager, range) =>
      range?.caseId ? new Promise((resolve) => { answer = resolve; }) : listed!(workspace, manager, range));
    renderPage(`/app/schedule/requests?case=${caseId}`);
    await waitFor(() => expect(getExchanges).toHaveBeenCalledWith(workspaceId, true, expect.objectContaining({ caseId })));
    // Reading the linked request: the list does not flash in first.
    await screen.findByText("Loading request");
    expect(screen.queryByRole("row", { name: /Alex Kim/ })).toBeNull();
    answer(empty);
    await screen.findByRole("heading", { name: "Request unavailable" });
    expect(screen.getByText("This request is no longer available.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Shift changes" })).toBeNull();
    // Tabs and filters stay: the page is still Requests.
    expect(screen.getByRole("group", { name: "Request type" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all requests" }));
    await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.queryByRole("heading", { name: "Request unavailable" })).toBeNull();
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("case=");
    // The button is gone, so focus lands on the list that took its place.
    await waitFor(() => expect(document.activeElement?.classList.contains("requests-table-wrap")).toBe(true));
  });
  // A failed read is not a missing request: it says so and reads again.
  it("offers to read a linked request again when reading it failed, without calling it unavailable", async () => {
    const caseId = "97500000-0000-4000-8000-000000000001";
    const empty = { employee_id: null, cases: [], opportunities: [], own_shifts: [] };
    vi.mocked(getExchanges).mockImplementation(async (_workspace, _manager, range) => {
      if (range?.caseId) throw new Error("Network down");
      return empty;
    });
    renderPage(`/app/schedule/requests?case=${caseId}`);
    await screen.findByRole("heading", { name: "We couldn't load this request" });
    expect(screen.queryByRole("heading", { name: "Request unavailable" })).toBeNull();
    expect(screen.queryByText("This request is no longer available.")).toBeNull();
    let answer: (value: typeof empty) => void = () => {};
    vi.mocked(getExchanges).mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    // While it reads again it says so, and the list does not flash in between.
    await screen.findByText("Loading request");
    expect(screen.queryByRole("heading", { name: "We couldn't load this request" })).toBeNull();
    expect(screen.queryByRole("row", { name: /Alex Kim/ })).toBeNull();
    answer(empty);
    await screen.findByRole("heading", { name: "Request unavailable" });
  });
  // A link the API refuses outright (a garbled id answers 400) is gone for
  // good: trying again cannot help, so it is unavailable, not an outage.
  it("calls a request the API refuses unavailable, not a connection problem", async () => {
    const empty = { employee_id: null, cases: [], opportunities: [], own_shifts: [] };
    vi.mocked(getExchanges).mockImplementation(async (_workspace, _manager, range) => {
      if (range?.caseId) throw new RequestError("Invalid query", undefined, undefined, 400);
      return empty;
    });
    renderPage("/app/schedule/requests?case=97500000-0000");
    await screen.findByRole("heading", { name: "Request unavailable" });
    expect(screen.queryByRole("heading", { name: "We couldn't load this request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
  // The message stands where the table was; the tabs, filters and search
  // beside it still work, and using one brings the list back.
  it("brings the list back when a tab is used while a request is unavailable", async () => {
    renderPage(`/app/schedule/requests?case=${missingCaseId}`);
    await screen.findByRole("heading", { name: "Request unavailable" });
    fireEvent.click(within(screen.getByRole("group", { name: "Request type" })).getByRole("button", { name: /Time off/ }));
    await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.queryByRole("heading", { name: "Request unavailable" })).toBeNull();
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("case=");
  });
  it("brings the list back when the search is used while a request is unavailable", async () => {
    renderPage(`/app/schedule/requests?case=${missingCaseId}`);
    await screen.findByRole("heading", { name: "Request unavailable" });
    fireEvent.change(screen.getByPlaceholderText("Search employee or note"), { target: { value: "Alex" } });
    await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("case=");
  });
  // A drawer closed with the browser's Back leaves no step behind for "Show
  // all requests" to undo: the button clears the link where it stands.
  it("clears an unavailable request in place after a drawer was closed with the browser's Back", async () => {
    vi.mocked(getExchanges).mockImplementation(async (_workspace, _manager, range) =>
      ({ employee_id: null, opportunities: [], own_shifts: [], cases: range?.caseId ? [] : [coverCase] }) as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage("/app/schedule/requests", undefined, ["/app/workspace"]);
    fireEvent.click(await screen.findByRole("row", { name: /^Shift pickup: .*Emre Person/ }));
    await screen.findByRole("dialog", { name: "Review shift change" });
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review shift change" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Follow a request link" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show all requests" }));
    await waitFor(() => expect(screen.getByLabelText("Current URL").textContent).toBe("/app/schedule/requests"));
    // The link's own step became the list: one Back is still Requests, not Workspace.
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByLabelText("Current URL").textContent).toBe("/app/schedule/requests");
    expect(screen.queryByRole("heading", { name: "Workspace" })).toBeNull();
  });
  // Offline, the one-case read waits: the page says it is reading, never a
  // bare list that ignores the link.
  it("says it is reading a linked request while offline, not the bare list", async () => {
    onlineManager.setOnline(false);
    try {
      vi.mocked(getExchanges).mockImplementation(async () =>
        ({ employee_id: null, opportunities: [], own_shifts: [], cases: [] }) as unknown as Awaited<ReturnType<typeof getExchanges>>);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: "always" } } });
      // Only the one-case read waits for the network, as every read does by default.
      client.setQueryDefaults(["shift-exchanges", workspaceId, "manager-case"], { networkMode: "online" });
      renderPage(`/app/schedule/requests?case=${missingCaseId}`, client);
      await screen.findByText("Loading request");
      expect(screen.queryByRole("row", { name: /Alex Kim/ })).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });
  // An answer kept from an earlier visit is not this visit's answer: while it
  // is read again the page says it is reading, never "no longer available".
  it("does not call a request unavailable from an earlier visit's answer while it reads it again", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["shift-exchanges", workspaceId, "manager-case", coverCase.id], { employee_id: null, opportunities: [], own_shifts: [], cases: [] });
    let answer: (value: unknown) => void = () => {};
    vi.mocked(getExchanges).mockImplementation((_workspace, _manager, range) =>
      range?.caseId
        ? new Promise((resolve) => { answer = resolve as (value: unknown) => void; })
        : Promise.resolve({ employee_id: null, opportunities: [], own_shifts: [], cases: [] }) as never);
    renderPage(`/app/schedule/requests?case=${coverCase.id}`, client);
    await screen.findByText("Loading request");
    expect(screen.queryByRole("heading", { name: "Request unavailable" })).toBeNull();
    answer({ employee_id: null, opportunities: [], own_shifts: [], cases: [coverCase] });
    expect(await screen.findByRole("dialog", { name: "Review shift change" })).toBeTruthy();
  });
  it("does not call a request unavailable from an earlier visit's answer while offline", async () => {
    onlineManager.setOnline(false);
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: "always" } } });
      client.setQueryDefaults(["shift-exchanges", workspaceId, "manager-case"], { networkMode: "online" });
      client.setQueryData(["shift-exchanges", workspaceId, "manager-case", missingCaseId], { employee_id: null, opportunities: [], own_shifts: [], cases: [] });
      renderPage(`/app/schedule/requests?case=${missingCaseId}`, client);
      await screen.findByText("Loading request");
      expect(screen.queryByRole("heading", { name: "Request unavailable" })).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });
  it("reads a linked request again even when an earlier visit's answer is still fresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["shift-exchanges", workspaceId, "manager-case", coverCase.id], { employee_id: null, opportunities: [], own_shifts: [], cases: [] });
    vi.mocked(getExchanges).mockImplementation(async (_workspace, _manager, range) =>
      ({ employee_id: null, opportunities: [], own_shifts: [], cases: range?.caseId ? [coverCase] : [] }) as unknown as Awaited<ReturnType<typeof getExchanges>>);
    renderPage(`/app/schedule/requests?case=${coverCase.id}`, client);
    expect(await screen.findByRole("dialog", { name: "Review shift change" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Request unavailable" })).toBeNull();
  });
  it.each([403, 404])("calls a request the API refuses with %i unavailable", async (status) => {
    vi.mocked(getExchanges).mockImplementation(async (_workspace, _manager, range) => {
      if (range?.caseId) throw new RequestError("Refused", "authz.out_of_scope", undefined, status);
      return { employee_id: null, cases: [], opportunities: [], own_shifts: [] } as unknown as Awaited<ReturnType<typeof getExchanges>>;
    });
    renderPage(`/app/schedule/requests?case=${missingCaseId}`);
    await screen.findByRole("heading", { name: "Request unavailable" });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
  // The message is the page's answer to the link: focus goes to it, and it is
  // not read out as a live region with its button inside.
  it("moves focus to the message about a linked request", async () => {
    renderPage(`/app/schedule/requests?case=${missingCaseId}`);
    const heading = await screen.findByRole("heading", { name: "Request unavailable" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.closest("[role=status], [role=alert]")).toBeNull();
  });
  it("moves focus to the message when a linked request could not load", async () => {
    vi.mocked(getExchanges).mockImplementation(async (_workspace, _manager, range) => {
      if (range?.caseId) throw new Error("Network down");
      return { employee_id: null, cases: [], opportunities: [], own_shifts: [] } as unknown as Awaited<ReturnType<typeof getExchanges>>;
    });
    renderPage(`/app/schedule/requests?case=${missingCaseId}`);
    const heading = await screen.findByRole("heading", { name: "We couldn't load this request" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.closest("[role=status], [role=alert]")).toBeNull();
  });
  it("never says a request is unavailable to a time off reader who follows a shift change link", async () => {
    activeContext = { ...context, permissions: ["workspace.read", "schedule.time_off_requests.read"], actions: ["workspace.read", "requests.read"] };
    renderPage("/app/schedule/requests?case=97500000-0000-4000-8000-000000000001");
    await screen.findByRole("row", { name: /Alex Kim/ });
    expect(getExchanges).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Request unavailable" })).toBeNull();
  });
  it("keeps a time off reader to time off: no request type tabs, no shift change list asked for", async () => {
    activeContext = { ...context, permissions: ["workspace.read", "schedule.time_off_requests.read"], actions: ["workspace.read", "requests.read"] };
    renderPage();
    await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.queryByRole("group", { name: "Request type" })).toBeNull();
    expect(getExchanges).not.toHaveBeenCalled();
  });
  // One tab to read needs no tabs: All would say the same thing.
  it("keeps a shift change reader to shift changes: no tabs, no time off list asked for", async () => {
    activeContext = { ...context, permissions: ["workspace.read", "schedule.shift_change_requests.read"], actions: ["workspace.read", "exchange.read"] };
    renderPage();
    await waitFor(() => expect(getExchanges).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Request type" })).toBeNull();
    expect(fetchRequests).not.toHaveBeenCalled();
  });
  // EKRAN-02 B1: the page's door asks the core, like its tabs do.
  // The card in place, not a silent trip home (Mert 2026-10-14).
  it("shows the no-access card to someone whose role names a request permission the core does not grant here", async () => {
    activeContext = { ...context, actions: context.actions.filter(action => action !== "requests.read" && action !== "exchange.read") };
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to Requests" })).toBeTruthy();
    expect(screen.getByLabelText("Current URL").textContent).toBe("/app/schedule/requests");
    expect(fetchRequests).not.toHaveBeenCalled();
  });
  it("hides the time off queue from someone the core does not let read it", async () => {
    activeContext = { ...context, actions: context.actions.filter(action => action !== "requests.read") };
    renderPage();
    await waitFor(() => expect(getExchanges).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Request type" })).toBeNull();
    expect(fetchRequests).not.toHaveBeenCalled();
  });

  it("lists a request with no location by when it expires and the shifts it would open", async () => {
    renderPage();
    const row = await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.getByRole("columnheader", { name: /Expires/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /Location/ })).toBeNull();
    expect(row.textContent).toContain("Jan 14");
    expect(row.textContent).toContain("1 shift becomes open.");
  });

  // Mert, 2026-10-11: the drawer speaks the Important Dates drawer's language:
  // a header with type and status, Details · Shifts · Activity tabs.
  it("heads the drawer with the person, the type, the status and the deadline", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    const head = within(drawer).getByRole("heading", { level: 2 });
    expect(head.textContent).toBe("Alex Kim Time off Needs review");
    expect(drawer.textContent).toContain("Decide by Jan 14");
    expect(within(drawer).getByRole("link", { name: /Open in Schedule/ }).getAttribute("href")).toBe("/app/schedule?date=2035-01-15&view=week");
    expect(within(drawer).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Details", "Shifts1", "Activity"]);
    expect(within(drawer).getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true");
  });
  it("shows the dates, the note, who approved which location and what is left", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).getByText("Starts").parentElement!.textContent).toBe("StartsMon, Jan 15Full day");
    expect(within(drawer).getByText("Ends").parentElement!.textContent).toBe("EndsTue, Jan 16Full day · 2 days");
    expect(within(drawer).getByText("Note from Alex").parentElement!.textContent).toContain("Family appointment");
    const approvals = within(drawer).getByRole("region", { name: "Approvals" });
    expect(approvals.textContent).toContain("1 of 2 locations");
    const rows = within(approvals).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows[0]).toMatch(/^Kadıköy.*Approved.*Ayşe Yılmaz/);
    expect(rows[1]).toMatch(/^Beşiktaş.*Waiting/);
    expect(within(drawer).getByRole("region", { name: "On the Schedule" }).textContent).toContain("1 shift becomes open if you approve.");
  });
  it("lists the shifts that open on their own tab, by location", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "See 1 shift" }));
    expect(within(drawer).getByRole("tab", { name: /^Shifts/ }).getAttribute("aria-selected")).toBe("true");
    const shifts = within(drawer).getByRole("region", { name: "Shifts that become open" });
    expect(shifts.textContent).toContain("Beşiktaş");
    expect(shifts.textContent).toContain("Mon, Jan 15 · 3:00 PM – 11:00 PM");
    expect(shifts.textContent).toContain("Server");
    expect(shifts.textContent).toContain("Becomes open");
  });
  it("says who else already has approved time off on those days", async () => {
    read = { ...fixture, time_off_requests: [pending, {
      ...pending, id: "97200000-0000-4000-8000-000000000002", employee_id: "15000000-0000-4000-8000-000000000002",
      employee_name: "Maria Lopez", status: "approved", start_date: "2035-01-16", end_date: "2035-01-20", progress: null,
    }] };
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).getByText("Also off these days").parentElement!.textContent).toContain("Maria Lopez (Jan 16)");
  });
  it("still says who else is off while the list is searched for one person", async () => {
    read = { ...fixture, time_off_requests: [pending, {
      ...pending, id: "97200000-0000-4000-8000-000000000002", employee_id: "15000000-0000-4000-8000-000000000002",
      employee_name: "Maria Lopez", status: "approved", start_date: "2035-01-16", end_date: "2035-01-20", progress: null,
    }] };
    renderPage();
    await screen.findByRole("row", { name: /Alex Kim/ });
    fireEvent.change(screen.getByLabelText("Search requests"), { target: { value: "Alex" } });
    await waitFor(() => expect(fetchRequests.mock.calls.some(([path]) => path.includes("search=Alex"))).toBe(true));
    const drawer = await openTimeOffRequest();
    await waitFor(() =>
      expect(within(drawer).getByText("Also off these days").parentElement!.textContent).toContain("Maria Lopez (Jan 16)"));
  });
  it("shows the request's history on the Activity tab", async () => {
    withRequest({ events: [{ id: "98000000-0000-4000-8000-000000000001", action: "submitted", actor_name: "Alex Kim", note: "", created_at: "2035-01-09T11:00:00Z" }] });
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("tab", { name: "Activity" }));
    expect(within(drawer).getByRole("tabpanel").textContent).toContain("Submitted");
    expect(within(drawer).getByRole("tabpanel").textContent).toContain("Alex Kim");
  });
  it("writes the decide-by time in the request's zone and names it, on any device (FB-6.3.8d)", async () => {
    // Ali asked from Istanbul; a manager in Los Angeles or Tokyo reads the same deadline.
    withRequest({ segments: [{ ...pending.segments[0]!, time_timezone: "Europe/Istanbul" }] });
    for (const device of ["America/Los_Angeles", "Asia/Tokyo"]) {
      await inDeviceZone(device, async () => {
        const view = renderPage();
        const row = await screen.findByRole("row", { name: /Alex Kim/ });
        expect(plain(within(row).getByText(/^Jan 14, 12:00 PM$/).textContent)).toBe("Jan 14, 12:00 PM");
        expect(within(row).getByText(/^(Türkiye|Turkey)( Standard)? Time$/)).toBeTruthy();
        const drawer = await openTimeOffRequest();
        expect(plain(drawer.textContent)).toMatch(/Decide by Jan 14, 12:00 PM (Türkiye|Turkey)( Standard)? Time/);
        view.unmount();
      });
    }
  });
  it("draws one progress layout whatever the address asks for (P04: checklist)", async () => {
    renderPage("/app/schedule/requests?progressVariant=c");
    const drawer = await openTimeOffRequest();
    const panel = within(drawer).getByRole("region", { name: "Approvals" });
    expect(panel.className).toBe("rd-sec");
    expect(panel.querySelector("[title]")).toBeNull();
  });
  it("titles the shifts that open like the drawer's other sections", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).getByRole("heading", { name: "Approvals" }).tagName).toBe("H3");
    fireEvent.click(within(drawer).getByRole("tab", { name: /Shifts/ }));
    expect(within(drawer).getByRole("heading", { name: "Shifts that become open" }).tagName).toBe("H3");
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
    // BILDIRIM-02: no notification is promised while there is none (KARARLAR S-96).
    expect(box.textContent).toContain("Takes effect now. 1 published shift becomes an open shift.");
    expect(box.textContent).not.toContain("notified");
  });
  it("names no managers when the request has no location (P21)", async () => {
    withRequest({ progress: { ...progress, fallback: true, locations: [], can_vote: false, can_decide_alone: true,
      impact: { fingerprint, hidden_shift_count: 0, locations: {} } } });
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    const box = await screen.findByRole("alertdialog", { name: "Approve time off?" });
    expect(box.textContent).toContain("Takes effect now.");
    expect(box.textContent).not.toContain("Managers at");
  });
  // Mert, 2026-10-11: Deny asks its reason in the drawer's footer; only the employee reads it.
  it("denies with a reason written in the drawer", async () => {
    apiRequest.mockResolvedValueOnce(verdict({ status: "denied", final: true, remaining: 0 }));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny" }));
    const reason = within(drawer).getByLabelText("Reason for Alex");
    expect(reason.getAttribute("placeholder")).toBe("Optional. Only Alex reads this.");
    fireEvent.change(reason, { target: { value: " I can approve Jan 15 only " } });
    // Red, two clicks (CLAUDE.md §3.A.7).
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny request" }));
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm deny" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off denied."));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(calls()[0]![1]).toEqual({ verdict: "deny", note: "I can approve Jan 15 only", expected_impact: fingerprint });
  });
  it("denies without a reason, as the core allows", async () => {
    apiRequest.mockResolvedValueOnce(verdict({ status: "denied", final: true, remaining: 0 }));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny request" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm deny" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off denied."));
    expect(calls()[0]![1]).toEqual({ verdict: "deny", note: "", expected_impact: fingerprint });
  });
  it("goes back from a reason on Escape, keeps it, and keeps the drawer open", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny" }));
    const reason = within(drawer).getByLabelText("Reason for Alex");
    fireEvent.change(reason, { target: { value: "Short staffed" } });
    fireEvent.keyDown(reason, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Review request" })).toBe(drawer);
    expect(within(drawer).queryByLabelText("Reason for Alex")).toBeNull();
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny" }));
    expect((within(drawer).getByLabelText("Reason for Alex") as HTMLTextAreaElement).value).toBe("Short staffed");
  });
  it("goes back from the reason to the decision without sending anything", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Back" }));
    expect(within(drawer).getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("closes the box and asks for a second look when the request changed meanwhile", async () => {
    apiRequest.mockRejectedValueOnce(new RequestError("The shifts this time off affects changed.", "time_off.changed", undefined, 409));
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
  // BL-1043: a deadline gone by is a 409 too, but no second look answers it.
  it("says the request was not decided in time instead of asking for a second look", async () => {
    apiRequest.mockRejectedValueOnce(new RequestError("This request was not decided in time", "time_off.not_decided_in_time", undefined, 409));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Approve" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Approve" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This request was not decided in time");
    expect(within(drawer).queryByText("This request changed. Review it again.")).toBeNull();
  });
  it("keeps the reason open when the vote fails for another reason", async () => {
    apiRequest.mockRejectedValueOnce(new Error("Connection lost"));
    renderPage();
    const drawer = await openTimeOffRequest();
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny" }));
    fireEvent.change(within(drawer).getByLabelText("Reason for Alex"), { target: { value: "Short staffed" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Deny request" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm deny" }));
    const alert = await within(drawer).findByRole("alert");
    expect(alert.textContent).toBe("Connection lost");
    // QA D2: red like every other window error, in the shared band (UI-FIELDMSG).
    expect(alert.className).toBe("window-alert");
    expect((within(drawer).getByLabelText("Reason for Alex") as HTMLTextAreaElement).value).toBe("Short staffed");
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
    expect(within(drawer).getByRole("heading", { level: 2 }).textContent).toContain("Cancellation");
    fireEvent.click(within(drawer).getByRole("button", { name: "Decline" }));
    expect(drawer.textContent).toContain("The time off stays in place.");
    fireEvent.change(within(drawer).getByLabelText("Reason for Alex"), { target: { value: "Busy week" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Decline cancellation" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Confirm decline" }));
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
    // BILDIRIM-05 (KARARLAR S-96): no notification goes out, so none is promised.
    expect(screen.getByText(/This takes effect now\.$/)).toBeTruthy();
    expect(screen.queryByText(/told/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Give back period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Give back these hours" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    expect(calls()[0]![0]).toBe(`/v1/workspaces/${workspaceId}/time-off/${requestId}/shorten`);
    expect(calls()[0]![1]).toMatchObject({ expected_revision: 2,
      periods: [{ segment_id: pending.segments[0]!.id, starts_at: future.start_at, ends_at: future.end_at }] });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Alex Kim's time off is shorter."));
  });
  // BL-1043: the database's key, not the server's "stale approved leave".
  it("says a shortened leave changed meanwhile in the page's words and reloads it", async () => {
    const future = { start_at: "2099-08-17T14:00:00.000Z", end_at: "2099-08-17T18:00:00.000Z" };
    withRequest({ status: "approved", revision: 2, progress: null,
      segments: [{ ...pending.segments[0]!, start_time: "10:00:00", end_time: "14:00:00", status: "approved", time_timezone: "UTC", effective_intervals: [future] }] });
    apiRequest.mockRejectedValueOnce(new RequestError("stale approved leave; refresh before shortening it", "time_off.changed", undefined, 409));
    renderPage();
    await openTimeOffRequest();
    const reads = fetchRequests.mock.calls.length;
    fireEvent.click(await screen.findByRole("button", { name: "Shorten time off" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Give back period 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Give back these hours" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("This request changed. Review it again.");
    // The server's sentence is the drawer's: in its band, not in the form (UI-FIELDMSG-2).
    expect(alert.classList.contains("window-alert")).toBe(true);
    expect(alert.closest(".time-off-cancellation")).toBeNull();
    await waitFor(() => expect(fetchRequests.mock.calls.length).toBeGreaterThan(reads));
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

describe("a list that did not load (R2-11)", () => {
  it("says so in words and asks again on Try again", async () => {
    readFailure = { status: 500, body: { error: "boom" } };
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't load requests");
    expect(screen.queryByText("boom")).toBeNull();
    const asked = fetchRequests.mock.calls.length;
    readFailure = null;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("row", { name: /Alex Kim/ })).toBeTruthy();
    expect(fetchRequests.mock.calls.length).toBeGreaterThan(asked);
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses requests (FB-6.1.9)", async () => {
    readFailure = { status: 403, body: { error: "Forbidden", reason: "authz.missing_permission" } };
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to Requests" })).toBeTruthy();
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
    expect(screen.queryByText("Loading requests")).toBeNull();
    expect(screen.getByRole("row", { name: /Alex Kim/ })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Search requests"));
    const asked = new URL(fetchRequests.mock.calls.at(-1)![0], "http://x").searchParams.get("search");
    expect(asked).toHaveLength(120);
    answer(read);
  });
});

// Time off rebuild D3: behind the time-off-v2 flag, the Time off tab lists the new table's requests and
// opens the new answer drawer; the other tabs and the flag-off page stay as they are.
describe("Time off tab with the new time off", () => {
  const newRequest = {
    id: "98020000-0000-4000-8000-000000000001", kind: "leave", kind_of_leave: "vacation", status: "pending",
    starts_at: "2035-01-15T00:00:00+00:00", ends_at: "2035-01-17T00:00:00+00:00", all_day: true, time_timezone: "UTC",
    start_date: "2035-01-15", end_date: "2035-01-16", start_time: null, end_time: null, note: null, revision: 1,
    created_at: "2035-01-09T11:00:00+00:00", decided_at: null, decided_by_name: null, decision_note: null, ended_at: null,
    ended_note: null, employee_id: "15000000-0000-4000-8000-000000000002", employee_name: "Jo Park", location_names: ["Kadıköy"],
    shifts_opened: 0,
  };
  beforeEach(() => {
    window.localStorage.setItem("newfork:time-off-v2", "1");
    apiRequest.mockImplementation(async (_client: unknown, path: string) => {
      if (String(path).includes("/time-off-requests/") && String(path).endsWith("/impact"))
        return { request: newRequest, fingerprint: "x", shift_count: 0, hidden_shift_count: 0, locations: [] };
      if (String(path).includes("/time-off-requests")) return { total: 1, waiting: 1, page: 1, page_size: 50, requests: [newRequest] };
      throw new Error(`unexpected ${path}`);
    });
  });
  afterEach(() => window.localStorage.removeItem("newfork:time-off-v2"));

  it("lists the new requests on the Time off tab and opens the answer drawer from a link", async () => {
    renderPage(`/app/schedule/requests?type=time_off&request=${newRequest.id}`);
    expect(await screen.findByRole("dialog", { name: "Review time off" })).toBeTruthy();
    expect(screen.getByRole("row", { name: /Jo Park asks for vacation/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /Alex Kim/ })).toBeNull();
    expect(String(apiRequest.mock.calls[0]![1])).toContain(`/v1/workspaces/${workspaceId}/time-off-requests?`);
  });

  it("keeps the All tab as it is", async () => {
    renderPage();
    expect(await screen.findByRole("row", { name: /Alex Kim/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /Jo Park/ })).toBeNull();
  });
});
