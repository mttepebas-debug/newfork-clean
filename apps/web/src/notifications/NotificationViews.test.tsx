import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedPage, notice } from "./notification-fixtures.test-util";

const w = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const me = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const requestId = "98020000-0000-4000-8000-000000000001";

const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  getTabWorkspaceId: () => null,
}));
const context: {
  userId: string;
  workspace: { id: string; name: string };
  membership: { access: { employee: boolean; management: string | null } };
  permissions: string[];
  actions: string[];
} = {
  userId: me,
  workspace: { id: w, name: "Harbor & Vine" },
  membership: { access: { employee: false, management: "manager" } },
  permissions: [],
  actions: ["notifications.read_own"],
};
const managerOnly = structuredClone(context);
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context, account: { userId: me } }) }));

const getTimeOffQueue = vi.fn();
const vote = vi.fn();
vi.mock("../schedule/requests-data", () => ({
  getTimeOffQueue: (...args: unknown[]) => getTimeOffQueue(...args),
  useVoteOnTimeOff: () => ({ mutateAsync: vote }),
  isStaleTimeOff: (error: unknown) => (error as { reason?: string })?.reason === "time_off.changed",
}));
vi.mock("../employee-hub/shift-exchanges/exchange-data", () => ({ refreshExchangeSurfaces: vi.fn(async () => undefined) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@newfork/ui", async (original) => ({ ...(await original<typeof import("@newfork/ui")>()), toast }));

const { NotificationBell, NotificationsPage, NotificationsPanel } = await import("./NotificationViews");

/** Answers the API by path: the list per filter (an older page when a cursor is sent), counts, seen and read. */
function answer(
  pages: Partial<Record<"all" | "unread" | "needs_action", unknown>>,
  counts = { unseen_count: 3, unread_count: 2, needs_action_count: 1 },
  older: unknown = feedPage([]),
) {
  apiRequest.mockImplementation(async (_client: unknown, path: string) => {
    if (path.endsWith("/count")) return counts;
    if (path.endsWith("/seen")) return { unseen_count: 0 };
    if (path.endsWith("/read")) return { updated: 1, unread_count: 0 };
    const query = new URLSearchParams(path.split("?")[1]);
    if (query.has("before")) return older;
    const filter = query.get("filter") as "all";
    const page = pages[filter];
    if (page instanceof Error) throw page;
    return page ?? feedPage([]);
  });
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function mount(ui: React.ReactNode, at = "/app/workspace") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="*" element={<>{ui}<Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const calls = (suffix: string) => apiRequest.mock.calls.filter(([, path]) => String(path).includes(suffix));

beforeEach(() => {
  apiRequest.mockReset();
  getTimeOffQueue.mockReset();
  vote.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => {
  cleanup();
  Object.assign(context, structuredClone(managerOnly));
});

describe("NotificationsPanel", () => {
  it("lists the rows by day with their counts and leaves the badge on opening", async () => {
    answer({
      all: feedPage([
        notice(),
        notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", type: "schedule.published", area: "schedule", topic: "my_schedule",
          needs_action: false, title: "Your schedule for Oct 19–25 is out", body: "4 shifts · 26 hours.", url: "/app/employee-hub/schedule",
          subject_type: null, subject_id: null, read_at: "2026-10-16T17:00:00Z", created_at: "2026-10-01T10:00:00Z" }),
      ]),
    });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(await within(dialog).findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ })).toBeTruthy();
    expect(within(dialog).getByText("Earlier")).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "Needs action, 1" })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "Unread, 2" })).toBeTruthy();
    expect(calls("/seen")).toHaveLength(0);
    expect(within(dialog).getByRole("link", { name: /See all notifications/ }).getAttribute("href")).toBe("/app/notifications");
  });

  it("opens a row's link and reads it", async () => {
    answer({ all: feedPage([notice({ needs_action: false, subject_id: null })]) });
    const onClose = vi.fn();
    mount(<NotificationsPanel workspaceId={w} onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ }));
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    expect(JSON.parse(String((calls("/read")[0]![2] as RequestInit).body))).toEqual({ ids: [notice().id] });
    expect(screen.getByTestId("where").textContent).toBe(`/app/schedule/requests?tab=time-off&request=${requestId}`);
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Review on another open request", async () => {
    answer({ all: feedPage([notice({ type: "people.onboarding_review_needed", area: "people", subject_type: "employee", url: "/app/employees" })]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByTestId("where").textContent).toBe("/app/employees");
  });

  it("marks everything read", async () => {
    answer({ all: feedPage([notice()]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    const readAll = screen.getByRole("button", { name: "Mark all as read" });
    await waitFor(() => expect((readAll as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(readAll);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("All marked as read"));
    expect(JSON.parse(String((calls("/read")[0]![2] as RequestInit).body))).toEqual({ all: true });
  });

  it("switches tabs with the arrow keys and says when nothing needs the person", async () => {
    answer({ all: feedPage([notice({ needs_action: false })]), needs_action: feedPage([]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    const all = screen.getByRole("tab", { name: "All" });
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /Needs action/ }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("Nothing needs you right now")).toBeTruthy();
  });

  it("shows a failed read with a retry", async () => {
    answer({ all: new Error("down") });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "We couldn't load your notifications" })).toBeTruthy();
    answer({ all: feedPage([notice()]) });
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ })).toBeTruthy();
  });

  it("closes on Escape", async () => {
    answer({ all: feedPage([]) });
    const onClose = vi.fn();
    mount(<NotificationsPanel workspaceId={w} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Notifications" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

// A notice carries one address, the management page's; it opens where the person is (NOTICE-VIEW).
describe("a notice opens in the person's view", () => {
  const post = "a8200000-0000-4000-8000-000000000065";
  const announcement = (url: string) =>
    notice({ type: "announcements.published", area: "announcements", needs_action: false, subject_type: "announcement", subject_id: post, title: "Uniform policy", url });
  const bothAccesses = () =>
    Object.assign(context, {
      membership: { access: { employee: true, management: "manager" } },
      actions: ["notifications.read_own", "employee_hub.read", "settings.important_dates.read"],
    });

  it("in the employee view an announcement opens in the employee view", async () => {
    bothAccesses();
    answer({ all: feedPage([announcement(`/app/announcements/${post}`)]) });
    mount(<NotificationsPanel workspaceId={w} onClose={vi.fn()} />, "/app/employee-hub");
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Uniform policy$/ }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(`/app/employee-hub/announcements/${post}`));
  });

  it("an Important Date opens in the employee view as the post, not the Important Dates page", async () => {
    bothAccesses();
    answer({ all: feedPage([announcement(`/app/announcements/important-dates/${post}`)]) });
    mount(<NotificationsPanel workspaceId={w} onClose={vi.fn()} />, "/app/employee-hub/schedule");
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Uniform policy$/ }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(`/app/employee-hub/announcements/${post}`));
  });

  it("in the management view an Important Date opens on Important Dates for whoever reads them", async () => {
    bothAccesses();
    answer({ all: feedPage([announcement(`/app/announcements/important-dates/${post}`)]) });
    mount(<NotificationsPanel workspaceId={w} onClose={vi.fn()} />, "/app/schedule");
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Uniform policy$/ }));
    await waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe(`/app/announcements/important-dates/${post}`),
    );
  });

  it("a manager who cannot read Important Dates gets the post itself", async () => {
    answer({ all: feedPage([announcement(`/app/announcements/important-dates/${post}`)]) });
    mount(<NotificationsPanel workspaceId={w} onClose={vi.fn()} />, "/app/schedule");
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Uniform policy$/ }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe(`/app/announcements/${post}`));
  });

  it("See all notifications stays in the employee view", async () => {
    bothAccesses();
    answer({ all: feedPage([]) });
    mount(<NotificationsPanel workspaceId={w} onClose={vi.fn()} />, "/app/employee-hub");
    expect(screen.getByRole("link", { name: /See all notifications/ }).getAttribute("href")).toBe(
      "/app/employee-hub/notifications",
    );
  });
});

describe("inline time off decision", () => {
  const pending = (progress: Record<string, unknown>) => ({
    requests: [{ id: requestId, status: "pending", request_type: "time_off", progress: {
      can_vote: true, can_decide_alone: false, my_approval_finalizes: false,
      impact: { fingerprint: "0123456789abcdef0123456789abcdef", locations: {}, hidden_shift_count: 0 }, ...progress } }],
    locations: [], timeFormat: "12h",
  });

  it("approves with the impact the request shows now", async () => {
    answer({ all: feedPage([notice()]) });
    getTimeOffQueue.mockResolvedValue(pending({ my_approval_finalizes: true }));
    vote.mockResolvedValue({ status: "approved", final: true, alone: false, remaining: 0, revision: 2, request_id: requestId });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off approved."));
    expect(getTimeOffQueue).toHaveBeenCalledWith(w, "needs_review", { locationId: "", search: "" });
    expect(vote).toHaveBeenCalledWith({ requestId, verdict: { verdict: "approve", note: "", expected_impact: "0123456789abcdef0123456789abcdef" } });
  });

  it("declines on the second click", async () => {
    answer({ all: feedPage([notice()]) });
    getTimeOffQueue.mockResolvedValue(pending({}));
    vote.mockResolvedValue({ status: "denied", final: true, alone: false, remaining: 0, revision: 2, request_id: requestId });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(vote).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off declined."));
    expect(vote.mock.calls[0]?.[0]).toMatchObject({ verdict: { verdict: "deny" } });
  });

  it("opens Requests where Requests would ask first: an approval that opens shifts", async () => {
    answer({ all: feedPage([notice()]) });
    getTimeOffQueue.mockResolvedValue(pending({
      my_approval_finalizes: true,
      impact: { fingerprint: "0123456789abcdef0123456789abcdef", locations: {}, hidden_shift_count: 2 },
    }));
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("/app/schedule/requests"));
    expect(vote).not.toHaveBeenCalled();
  });

  it("opens Requests for a decision alone", async () => {
    answer({ all: feedPage([notice()]) });
    getTimeOffQueue.mockResolvedValue(pending({ can_vote: false, can_decide_alone: true }));
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("/app/schedule/requests"));
    expect(vote).not.toHaveBeenCalled();
  });

  it("declines here for a decision alone, as Requests does (the reason is optional)", async () => {
    answer({ all: feedPage([notice()]) });
    getTimeOffQueue.mockResolvedValue(pending({ can_vote: false, can_decide_alone: true }));
    vote.mockResolvedValue({ status: "denied", final: true, alone: true, remaining: 0, revision: 2, request_id: requestId });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Decline" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm decline" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Time off declined."));
    expect(screen.getByTestId("where").textContent).toBe("/app/workspace");
  });

  it("says when the request was decided meanwhile", async () => {
    answer({ all: feedPage([notice()]) });
    getTimeOffQueue.mockResolvedValue({ requests: [], locations: [], timeFormat: "12h" });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("This request was already decided."));
    expect(vote).not.toHaveBeenCalled();
  });

  it("says a stale request changed", async () => {
    answer({ all: feedPage([notice()]) });
    getTimeOffQueue.mockResolvedValue(pending({}));
    vote.mockRejectedValue({ reason: "time_off.changed" });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This request changed. Review it again."));
  });

  it("shows how a decided request closed instead of the buttons", async () => {
    answer({ all: feedPage([notice({ resolved_at: "2026-10-16T17:00:00Z", resolution: "approved", resolved_by: me })]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    expect(await screen.findByText("You approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("NotificationsPage", () => {
  it("is the full list with its own heading and actions", async () => {
    answer(
      { all: feedPage([notice()], { has_more: true, next_cursor: "eyJ0IjoiMjAyNi0xMC0xNiJ9" }) },
      undefined,
      feedPage([notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", title: "Walk-in cooler repair on Tuesday", needs_action: false })]),
    );
    mount(<NotificationsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Notifications" })).toBeTruthy();
    expect(screen.getByText(/Everything sent to you in Harbor & Vine/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Settings/ }).getAttribute("href")).toBe("/account/preferences/notifications");
    fireEvent.click(await screen.findByRole("button", { name: "Show older" }));
    expect(await screen.findByRole("button", { name: /^(Unread: )?Walk-in cooler repair on Tuesday$/ })).toBeTruthy();
    expect(apiRequest.mock.calls.some(([, path]) => String(path).includes("before=eyJ0IjoiMjAyNi0xMC0xNiJ9"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Show older" })).toBeNull();
  });
});

describe("NotificationBell", () => {
  it("shows the unread count and opens the full-screen list", async () => {
    answer({ all: feedPage([notice()]) }, { unseen_count: 0, unread_count: 4, needs_action_count: 1 });
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    mount(<NotificationBell workspaceId={w} />);
    const bell = await screen.findByRole("button", { name: "Notifications, 4 unread" });
    fireEvent.click(bell);
    expect(await screen.findByRole("heading", { name: "Notifications" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Notifications" })).toBeNull());
  });
});
