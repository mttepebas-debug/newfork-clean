import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ActiveWorkspaceContext, TimeOffDeciderView, TimeOffRequestsPage } from "@newfork/shared";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleRequestsPage } from "./ScheduleRequestsPage";
import { PermissionRoute } from "../auth/PermissionRoute";
import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { RequestError, requestFailure } from "../lib/request-error";
import { plain } from "../employee-hub/device-zone.testing";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
// A request the core no longer hands back (BL-1024).
const missingCaseId = "97500000-0000-4000-8000-0000000000ff";
const requestId = "97200000-0000-4000-8000-000000000001";
const kadikoy = "11000000-0000-4000-8000-000000000001";
const besiktas = "11000000-0000-4000-8000-000000000002";
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
// Alex asks for two days off; the request waits until it starts (time off rebuild D6, D7).
const pending: TimeOffDeciderView = {
  id: requestId, kind: "leave", kind_of_leave: "personal", status: "pending",
  starts_at: "2035-01-15T00:00:00+00:00", ends_at: "2035-01-17T00:00:00+00:00", all_day: true, time_timezone: "UTC",
  start_date: "2035-01-15", end_date: "2035-01-16", start_time: null, end_time: null, note: "Family appointment", revision: 1,
  created_at: "2035-01-09T11:00:00+00:00", decided_at: null, decided_by_name: null, decision_note: null,
  ended_at: null, ended_note: null, cancels_id: null, ended_by_name: null, used_until: null, cancellation: null, added_by_name: null,
  employee_id: "15000000-0000-4000-8000-000000000001", employee_name: "Alex Kim", location_names: ["Kadıköy", "Beşiktaş"], shifts_opened: 0,
};
const fixture: TimeOffRequestsPage = {
  total: 1, waiting: 1, page: 1, page_size: 100, time_format: "12h",
  locations: [{ id: kadikoy, name: "Kadıköy" }, { id: besiktas, name: "Beşiktaş" }],
  requests: [pending],
};
let read: TimeOffRequestsPage = fixture;
let readFailure: { status: number; body: unknown } | null = null;

// Whole-repo runs share the cores with three other packages; Testing
// Library's 1 s default for findBy/waitFor is what ran out there (U19).
configure({ asyncUtilTimeout: 5000 });

// The time off reads (GET .../time-off-requests); answers go to apiRequest. The list answers with the
// requests the search names, as the server does; a request's impact with its shifts.
const fetchRequests = vi.fn(async (path: string) => {
  if (readFailure) throw requestFailure(readFailure.body, readFailure.status, "Workspace operation failed");
  const url = new URL(path, "http://x");
  const impact = url.pathname.match(/time-off-requests\/([^/]+)\/impact$/);
  if (impact) {
    const request = read.requests.find((item) => item.id === impact[1]) ?? pending;
    return { request, fingerprint: "0123456789abcdef0123456789abcdef", shift_count: 1, hidden_shift_count: 0,
      locations: [{ id: besiktas, name: "Beşiktaş", shifts: [shift] }] };
  }
  const search = (url.searchParams.get("search") ?? "").toLowerCase();
  const requests = read.requests.filter((request) => request.employee_name.toLowerCase().includes(search));
  return { ...read, total: requests.length, requests };
});
const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: { auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } },
  apiRequest: (client: unknown, path: string, init?: RequestInit) =>
    path.includes("/time-off-requests") && !init?.method ? fetchRequests(path) : apiRequest(client, path, init),
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
async function openTimeOffRequest() {
  fireEvent.click(await screen.findByRole("row", { name: /Alex Kim/ }));
  return screen.findByRole("dialog", { name: "Review time off" });
}

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
    const approved: TimeOffDeciderView = {
      ...pending, id: "97200000-0000-4000-8000-000000000002", employee_name: "Deniz Acar", status: "approved",
      decided_at: "2035-01-10T09:00:00Z", decided_by_name: "Ayşe Yılmaz",
    };
    read = { ...fixture, total: 2, requests: [pending, approved] };
    renderPage();
    const closed = await screen.findByRole("row", { name: /Deniz Acar/ });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.getAttribute("aria-label")?.match(/^Time off: (\S+ \S+)/)?.[1])).toEqual(["Alex Kim", "Deniz Acar"]);
    expect(within(closed).getByText("Approved")).toBeTruthy();
    expect(within(rows[0]!).getByText("Needs decision")).toBeTruthy();
    // One read of every request one answers, open and closed (D7).
    expect(fetchRequests.mock.calls.every(([path]) => path.includes("view=all"))).toBe(true);
  });
  // EKRAN-02 #67 (KARARLAR Genel, telefonda kart satırı); TAKAS-RELEASE (Mert,
  // 2026-10-17): the phone shows a card per request: the kind's icon, the
  // sentence, then Status and Expires, Expires only while the request is open.
  it("gives each request a phone card: the sentence, Status, Expires only while open", async () => {
    const approved: TimeOffDeciderView = {
      ...pending, id: "97200000-0000-4000-8000-000000000002", employee_name: "Deniz Acar", status: "approved",
      decided_at: "2035-01-10T09:00:00Z", decided_by_name: "Ayşe Yılmaz",
    };
    read = { ...fixture, total: 2, requests: [pending, approved] };
    renderPage();
    const cards = await screen.findByRole("list", { name: "Requests" });
    const open = await within(cards).findByRole("button", { name: /^Time off: Alex Kim/ });
    expect(open.getAttribute("aria-label")).toContain("Needs decision");
    expect(plain(open.querySelector(".request-sentence")!.textContent)).toMatch(/^Alex Kim asks for .*Jan 15/);
    expect(plain(open.querySelector(".request-card-foot")!.textContent)).toBe("Needs decisionExpires Jan 15, 12:00 AM UTC");
    const closed = within(cards).getByRole("button", { name: /^Time off: Deniz Acar/ });
    expect(closed.querySelector(".request-card-foot")!.textContent).toBe("Approved");
    fireEvent.click(open);
    expect(await screen.findByRole("dialog", { name: "Review time off" })).toBeTruthy();
  });
  // Tabs wider than a phone scroll, and a faded edge says so. The tabs scroll and fade in their own strip, so
  // the phone's Add beside them in the row never does (KARARLAR S-254).
  it("fades the tab strip's edge where more tabs wait, and brings the chosen tab into view", async () => {
    const shown: string[] = [];
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { shown.push(this.textContent ?? ""); };
    renderPage("/app/schedule/requests?type=cover");
    const tabs = await screen.findByRole("group", { name: "Request type" });
    await waitFor(() => expect(shown).toContain("Shift changes"));
    const row = tabs;
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
    await waitFor(() => expect(fetchRequests).toHaveBeenCalled());
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

  it("lists a request by when it expires, with no Location column", async () => {
    renderPage();
    const row = await screen.findByRole("row", { name: /Alex Kim/ });
    expect(screen.getByRole("columnheader", { name: /Expires/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: /Location/ })).toBeNull();
    expect(row.textContent).toContain("Jan 15");
  });

  // D7: a time off row of the All tab opens the Time off tab's answer drawer, with the shifts an approval opens.
  it("opens a time off row of the All tab in the answer drawer, and closes it", async () => {
    renderPage();
    const drawer = await openTimeOffRequest();
    expect(within(drawer).getAllByText(/Alex Kim/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Current URL").textContent).toContain(`request=${requestId}`);
    await waitFor(() => expect(fetchRequests.mock.calls.some(([path]) => path.endsWith(`/${requestId}/impact`))).toBe(true));
    fireEvent.click(within(drawer).getByRole("button", { name: "Close details" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review time off" })).toBeNull());
    expect(screen.getByLabelText("Current URL").textContent).not.toContain("request=");
  });

  // Home's old link (?request=) and its new one (?type=time_off&request=) both land on the request.
  it("lands Home's links to a time off request on its answer drawer", async () => {
    renderPage(`/app/schedule/requests?request=${requestId}`);
    expect(await screen.findByRole("dialog", { name: "Review time off" })).toBeTruthy();
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
    let answer: (model: TimeOffRequestsPage) => void = () => undefined;
    fetchRequests.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    box.focus();
    fireEvent.change(box, { target: { value: "a".repeat(250) } });
    await waitFor(() => expect(fetchRequests.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText("Loading requests")).toBeNull();
    expect(screen.getByRole("row", { name: /Alex Kim/ })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Search requests"));
    const asked = new URL(fetchRequests.mock.calls.at(-1)![0], "http://x").searchParams.get("search");
    // The API takes 200 characters; a longer search is cut, not refused (D7).
    expect(asked).toHaveLength(200);
    answer(read);
  });
});

// Time off rebuild D3, D7: the Time off tab lists the new table's requests and opens the answer drawer.
describe("Time off tab", () => {
  it("lists the requests on the Time off tab and opens the answer drawer from a link", async () => {
    renderPage(`/app/schedule/requests?type=time_off&request=${requestId}`);
    expect(await screen.findByRole("dialog", { name: "Review time off" })).toBeTruthy();
    expect(screen.getByRole("row", { name: /Alex Kim asks for/ })).toBeTruthy();
    expect(fetchRequests.mock.calls.some(([path]) => path.includes(`/v1/workspaces/${workspaceId}/time-off-requests?`))).toBe(true);
  });

  it("adds time off from the filter row on the Time off tab (D5)", async () => {
    renderPage("/app/schedule/requests?type=time_off");
    await screen.findByRole("row", { name: /Alex Kim asks for/ });
    expect(screen.getByRole("button", { name: "Add time off" })).toBeTruthy();
  });

  // KARARLAR S-254 (Mert 2026-10-23), Requests' one exception to S-253: on a phone Add stands at the right end
  // of the tab row (All · Time off · Shift changes), beside the tab strip and outside it, so it never scrolls
  // or fades with the tabs; the location list is the first box, the search under it. On a computer it stays at
  // the filter row's end.
  it("puts Add at the tab row's right end on a phone, outside the tab strip, short label Add", async () => {
    const before = window.matchMedia;
    window.matchMedia = ((media: string) => ({
      matches: media === "(max-width: 720px)",
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      renderPage("/app/schedule/requests?type=time_off");
      await screen.findByRole("row", { name: /Alex Kim asks for/ });
      const add = screen.getByRole("button", { name: "Add time off" });
      const row = add.closest(".catalog-toolbar-status-row");
      expect(row).not.toBeNull();
      expect(row!.lastElementChild).toBe(add);
      const strip = screen.getByRole("group", { name: "Request type" });
      expect(strip.parentElement).toBe(row);
      expect(strip.contains(add)).toBe(false);
      expect(screen.getAllByRole("button", { name: "Add time off" })).toHaveLength(1);
      expect(screen.getByRole("combobox", { name: "Filter by location" }).nextElementSibling).toBe(
        screen.getByRole("searchbox", { name: "Search requests" }).closest("label"),
      );
      expect(add.querySelector(".list-add-short")?.textContent).toBe("Add");
    } finally {
      window.matchMedia = before;
    }
  });

  it("keeps the tab row without Add on a phone where Add is not offered (All)", async () => {
    const before = window.matchMedia;
    window.matchMedia = ((media: string) => ({
      matches: media === "(max-width: 720px)",
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      renderPage();
      await screen.findByRole("list", { name: "Requests" });
      expect(screen.queryByRole("button", { name: "Add time off" })).toBeNull();
      const strip = screen.getByRole("group", { name: "Request type" });
      expect(strip.parentElement!.lastElementChild).toBe(strip);
    } finally {
      window.matchMedia = before;
    }
  });

  it("keeps Add at the filter row's end on a computer", async () => {
    renderPage("/app/schedule/requests?type=time_off");
    await screen.findByRole("row", { name: /Alex Kim asks for/ });
    const locations = screen.getByRole("combobox", { name: "Filter by location" });
    expect(locations.parentElement!.lastElementChild).toBe(screen.getByRole("button", { name: "Add time off" }));
  });

  it("offers no Add time off on the All tab", async () => {
    renderPage();
    expect(await screen.findByRole("row", { name: /Alex Kim/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add time off" })).toBeNull();
  });
});
