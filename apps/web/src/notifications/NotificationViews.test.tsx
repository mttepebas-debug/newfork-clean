import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedPage, notice } from "./notification-fixtures.test-util";

// jsdom has no PointerEvent: a mouse event with a pointer id stands in for it.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
window.PointerEvent ??= TestPointerEvent as unknown as typeof PointerEvent;

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

vi.mock("../employee-hub/shift-exchanges/exchange-data", () => ({ refreshExchangeSurfaces: vi.fn(async () => undefined) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@newfork/ui", async (original) => ({ ...(await original<typeof import("@newfork/ui")>()), toast }));

const { NotificationBell, NotificationsPage, NotificationsPanel, NotificationsSheet } = await import("./NotificationViews");
const { NotificationList } = await import("./NotificationList");

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
    if (path.endsWith("/unread")) return { updated: 1, unread_count: 1 };
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

/** The last mounted view's cache: a test refreshes it as the live signal or another device would. */
let client: QueryClient;
const refresh = () => act(() => client.invalidateQueries({ queryKey: ["notifications", w] }));

function mount(ui: React.ReactNode, at = "/app/workspace") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => {
  cleanup();
  Object.assign(context, structuredClone(managerOnly));
});

describe("NotificationsPanel", () => {
  const published = notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", type: "schedule.published", area: "schedule", topic: "my_schedule",
    needs_action: false, title: "Your schedule for Oct 19–25 is out", body: "4 shifts · 26 hours.", url: "/app/employee-hub/schedule",
    subject_type: null, subject_id: null, seen_at: "2026-10-16T17:00:00Z", read_at: "2026-10-16T17:00:00Z", created_at: "2026-10-01T10:00:00Z" });
  const sections = (dialog: HTMLElement) =>
    [...dialog.querySelectorAll(".ni-group, .ni-row-title")].map((node) =>
      node.classList.contains("ni-group") ? `# ${node.textContent}` : node.textContent?.replace(/^Unread: /, ""),
    );

  // S-247 (2): what came since the list was last opened is New, the rest Earlier; the badge stays the unread count.
  it("puts what came since the last look under New and the rest under Earlier, with the tabs' counts", async () => {
    answer({ all: feedPage([notice(), published]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(await within(dialog).findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ })).toBeTruthy();
    expect(sections(dialog)).toEqual(["# New", "Time off request from Tom Becker", "# Earlier", "Your schedule for Oct 19–25 is out"]);
    expect(within(dialog).getByRole("tab", { name: "Needs action, 1" })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "Unread, 2" })).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /See all notifications/ }).getAttribute("href")).toBe("/app/notifications");
  });

  it("marks the list seen once it shows, and keeps New where it is while the list stays open", async () => {
    answer({ all: feedPage([notice(), published]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    await within(dialog).findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ });
    await waitFor(() => expect(calls("/seen")).toHaveLength(1));
    // The core now says it was seen; this opening still shows it as new.
    answer({ all: feedPage([notice({ seen_at: "2026-10-16T18:00:00Z" }), published]) });
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    await waitFor(() => expect(calls("filter=all").length).toBeGreaterThan(1));
    expect(sections(dialog)).toEqual(["# New", "Time off request from Tom Becker", "# Earlier", "Your schedule for Oct 19–25 is out"]);
    expect(calls("/seen")).toHaveLength(1);
  });

  // Within the app's 30 s staleTime a reopened list reads the cache: what the last opening showed is seen now.
  it("shows nothing as New when the list opens again right after", async () => {
    answer({ all: feedPage([notice(), published]) });
    function Toggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen((value) => !value)}>
            toggle
          </button>
          {open ? <NotificationsPanel workspaceId={w} onClose={() => undefined} /> : null}
        </>
      );
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/workspace"]}>
          <Toggle />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ });
    await waitFor(() => expect(calls("/seen")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    await within(dialog).findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ });
    expect(sections(dialog)).toEqual(["Time off request from Tom Becker", "Your schedule for Oct 19–25 is out"]);
    expect(calls("/seen")).toHaveLength(1);
  });

  it("has no headings when nothing is new", async () => {
    answer({ all: feedPage([published]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    await within(dialog).findByRole("button", { name: /Your schedule for Oct 19–25 is out$/ });
    expect(sections(dialog)).toEqual(["Your schedule for Oct 19–25 is out"]);
    expect(calls("/seen")).toHaveLength(0);
  });

  it("gives each time its full day, clock time and zone on hover", async () => {
    answer({ all: feedPage([published]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    await screen.findByRole("button", { name: /Your schedule for Oct 19–25 is out$/ });
    const time = document.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe(published.created_at);
    expect(time.getAttribute("title")).toMatch(/^\w+day, (September 30|October 1), 2026 at \d{1,2}:\d{2} (AM|PM) \S/);
  });

  it("keeps the rows it has when a refresh fails, with a retry", async () => {
    answer({ all: feedPage([notice()]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ });
    answer({ all: new Error("down") });
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(await screen.findByText("Couldn't refresh.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ })).toBeTruthy();
    answer({ all: feedPage([notice({ read_at: "2026-10-16T18:00:00Z" })]) });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Couldn't refresh.")).toBeNull());
  });

  it("opens a row's link and reads it", async () => {
    answer({ all: feedPage([notice({ needs_action: false, subject_id: null })]) });
    const onClose = vi.fn();
    mount(<NotificationsPanel workspaceId={w} onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ }));
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    expect(JSON.parse(String((calls("/read")[0]![2] as RequestInit).body))).toEqual({ ids: [notice().id] });
    expect(screen.getByTestId("where").textContent).toBe(`/app/schedule/requests?type=time_off&request=${requestId}`);
    expect(onClose).toHaveBeenCalled();
  });

  // S-251: no Review button; the row itself opens what waits on the reader.
  it("opens another open request from the row itself", async () => {
    answer({ all: feedPage([notice({ type: "people.onboarding_review_needed", area: "people", subject_type: "employee", url: "/app/employees" })]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ }));
    expect(screen.getByTestId("where").textContent).toBe("/app/employees");
    expect(screen.queryByRole("button", { name: "Review" })).toBeNull();
  });

  // Time off rebuild D3: the new time off's cards carry their own links; the person deciding reviews it in
  // Requests → Time off, the employee reads the answer in My Availability → Time off.
  it("opens the new time off's cards where each reader answers or reads them", async () => {
    const asked = `/app/schedule/requests?type=time_off&request=${requestId}`;
    answer({ all: feedPage([notice({ subject_type: "time_off", url: asked })]) });
    const first = mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ }));
    expect(screen.getByTestId("where").textContent).toBe(asked);
    first.unmount();
    answer({ all: feedPage([notice({ type: "time_off.decided", topic: "time_off", needs_action: false, subject_type: "time_off",
      title: "Your time off Oct 21 is approved", url: "/app/employee-hub/my-availability?section=time-off" })]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Your time off Oct 21 is approved$/ }));
    expect(screen.getByTestId("where").textContent).toBe("/app/employee-hub/my-availability?section=time-off");
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

// D7: the old inline verdict went with the old time off; an open time off card opens Requests → Time off's
// answer drawer, like every other open request. S-251: the row itself opens it; nothing in the row answers it.
describe("an open time off card", () => {
  it("opens the request where it is answered from the row, with nothing in the row to answer it", async () => {
    answer({ all: feedPage([notice()]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ }));
    expect(screen.getByTestId("where").textContent).toBe(`/app/schedule/requests?type=time_off&request=${requestId}`);
    for (const name of ["Review", "Approve", "Decline"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("says on its second line how a decided request closed, without a time", async () => {
    answer({ all: feedPage([notice({ resolved_at: "2026-10-16T17:00:00Z", resolution: "approved", resolved_by: me })]) });
    mount(<NotificationsPanel workspaceId={w} onClose={() => undefined} />);
    const row = (await screen.findByRole("button", { name: /^(Unread: )?Time off request from Tom Becker$/ })).closest("li")!;
    expect(row.querySelector(".ni-row-sub")!.textContent).toBe("You approved");
    expect(row.textContent).not.toContain("Jury duty summons");
    expect(screen.queryByRole("button", { name: "Review" })).toBeNull();
  });
});

const tom = /^(Unread: )?Time off request from Tom Becker$/;
const rowOf = async (name: RegExp) => (await screen.findByRole("button", { name })).closest("li")!;

// S-251 (variant A): every row is exactly two one-line lines, the same height, with no buttons in it but the
// unread dot; the row opens the notice.
describe("a row", () => {
  // Five minutes after the fixture's notice came.
  const at = new Date("2026-10-16T16:43:30Z");
  const list = (items: Parameters<typeof feedPage>[0]) => {
    answer({ all: feedPage(items) });
    return mount(<NotificationList workspaceId={w} viewerId={me} filter="all" panelId="list" now={at} />);
  };

  it("is the title, then the body with the short time at its right", async () => {
    list([notice()]);
    const row = await rowOf(tom);
    expect(row.querySelector(".ni-row-title")!.textContent).toBe("Unread: Time off request from Tom Becker");
    expect(row.querySelector(".ni-row-sub")!.textContent).toBe("Wed, Oct 21 · Jury duty summons.");
    const time = row.querySelector("time")!;
    expect(time.textContent).toBe("5m");
    expect(time.getAttribute("title")).toMatch(/^Friday, October 16, 2026 at \d{1,2}:38 (AM|PM) \S/);
    // The old meta line ("Needs action · Approvals · 5m ago") is gone.
    expect(row.textContent).not.toMatch(/Needs action|Approvals|ago/);
  });

  it("has no buttons but its unread dot and itself", async () => {
    list([notice(), notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", title: "Walk-in cooler repair on Tuesday", needs_action: false, read_at: "2026-10-16T16:40:00Z" })]);
    const unread = await rowOf(tom);
    expect(within(unread).getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent)).toEqual([
      "Mark as read: Time off request from Tom Becker",
      "Unread: Time off request from Tom Becker",
    ]);
    const read = await rowOf(/^Walk-in cooler repair on Tuesday$/);
    expect(within(read).getAllByRole("button").map((button) => button.textContent)).toEqual(["Walk-in cooler repair on Tuesday"]);
    expect(read.querySelector(".ni-dot")!.tagName).toBe("SPAN");
  });

  it("reads it with the unread dot, without opening it", async () => {
    list([notice()]);
    fireEvent.click(await screen.findByRole("button", { name: "Mark as read: Time off request from Tom Becker" }));
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    expect(JSON.parse(String((calls("/read")[0]![2] as RequestInit).body))).toEqual({ ids: [notice().id] });
    expect(screen.getByTestId("where").textContent).toBe("/app/workspace");
  });

  // The dot leaves the row once the notice is read: the focus on it stays in the list, so Tab goes on from there
  // and Escape still closes the panel.
  it("keeps the focus on the row once its dot reads it", async () => {
    list([notice()]);
    const row = await rowOf(tom);
    const dot = within(row).getByRole("button", { name: "Mark as read: Time off request from Tom Becker" });
    dot.focus();
    fireEvent.click(dot);
    // From here the core answers the row read.
    answer({ all: feedPage([notice({ read_at: "2026-10-16T16:44:00Z" })]) });
    await waitFor(() => expect(row.querySelector("button.ni-dot")).toBeNull());
    expect(document.activeElement).toBe(row.querySelector(".ni-row-title"));
  });

  it("moves the focus on to the next row when the row read opens nothing", async () => {
    const cooler = notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", title: "Walk-in cooler repair on Tuesday" });
    list([notice({ url: null }), cooler]);
    const row = await rowOf(tom);
    const dot = within(row).getByRole("button", { name: "Mark as read: Time off request from Tom Becker" });
    dot.focus();
    fireEvent.click(dot);
    answer({ all: feedPage([notice({ url: null, read_at: "2026-10-16T16:44:00Z" }), cooler]) });
    await waitFor(() => expect(row.querySelector("button.ni-dot")).toBeNull());
    expect(row.querySelector<HTMLButtonElement>(".ni-row-title")!.disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark as read: Walk-in cooler repair on Tuesday" }));
  });

  it("moves the focus on to the next row under Unread, which the row read leaves", async () => {
    answer({ unread: feedPage([notice(), notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", title: "Walk-in cooler repair on Tuesday" })]) });
    mount(<NotificationList workspaceId={w} viewerId={me} filter="unread" panelId="list" now={at} />);
    const dot = await screen.findByRole("button", { name: "Mark as read: Time off request from Tom Becker" });
    dot.focus();
    fireEvent.click(dot);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Mark as read: Walk-in cooler repair on Tuesday" }));
  });

  it("keeps an empty second line when the notice has no body", async () => {
    list([notice({ body: null })]);
    const row = await rowOf(tom);
    expect(row.querySelector(".ni-row-sub")!.textContent).toBe("");
    expect(row.querySelector(".ni-row-title")!.getAttribute("aria-describedby")).toBeNull();
  });

  it("keeps its arrival time on the right once the card closed", async () => {
    list([notice({ created_at: "2026-10-16T13:40:00Z", resolved_at: "2026-10-16T16:42:00Z", resolution: "approved", resolved_by: "a8200000-0000-4000-8000-000000000067", resolved_by_name: "Deniz P." })]);
    const row = await rowOf(tom);
    expect(row.querySelector(".ni-row-sub")!.textContent).toBe("Approved by Deniz P.");
    expect(row.querySelector("time")!.textContent).toBe("3h");
  });

  it("reads its second line to a screen reader with the row, and shows both lines whole on hover when one is cut", async () => {
    list([notice()]);
    const row = await rowOf(tom);
    const title = row.querySelector<HTMLButtonElement>(".ni-row-title")!;
    expect(document.getElementById(title.getAttribute("aria-describedby")!)!.textContent).toBe("Wed, Oct 21 · Jury duty summons.");
    fireEvent.pointerEnter(row);
    expect(title.getAttribute("title")).toBeNull();
    const line = row.querySelector(".ni-row-sub")!;
    Object.defineProperty(line, "scrollWidth", { configurable: true, value: 420 });
    Object.defineProperty(line, "clientWidth", { configurable: true, value: 300 });
    fireEvent.pointerLeave(row);
    fireEvent.pointerEnter(row);
    expect(title.getAttribute("title")).toBe("Time off request from Tom Becker\nWed, Oct 21 · Jury duty summons.");
  });

  it("draws its tile by what it is about", async () => {
    list([
      notice(),
      notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", type: "shift_changes.cover_asked", area: "shift_changes", topic: "shift_changes",
        title: "Ali P. asks you to take a shift", data: { kind: "cover", audience: "direct" } }),
      notice({ id: "a8200000-0000-4000-8000-000000000066", type: "shift_changes.approval_needed", area: "shift_changes", topic: "approvals",
        title: "Can K. wants to cover for Ali P.", data: { kind: "cover", audience: "direct" } }),
    ]);
    const tile = async (name: RegExp) => (await rowOf(name)).querySelector(".ni-tile")!;
    expect((await tile(tom)).className).toContain("ni-amber");
    expect((await tile(tom)).querySelector("svg")!.getAttribute("class")).toContain("lucide-calendar-x");
    expect((await tile(/^(Unread: )?Ali P\. asks you to take a shift$/)).querySelector("svg")!.getAttribute("class")).toContain("lucide-circle-help");
    // Waiting on the reader outside Approvals, amber all the same.
    expect((await tile(/^(Unread: )?Ali P\. asks you to take a shift$/)).className).toContain("ni-amber");
    expect((await tile(/^(Unread: )?Can K\. wants to cover for Ali P\.$/)).querySelector("svg")!.getAttribute("class")).toContain("steps-in");
  });
});

// S-251 (variant A, frame.js): on the phone an unread row slides either way to show Read under it.
describe("on the phone, a row", () => {
  // jsdom lays nothing out: every row is 390 px wide.
  let width: { mockRestore: () => void };
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    width = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 68, width: 390, height: 68, toJSON: () => ({}),
    } as DOMRect);
  });
  afterEach(() => width.mockRestore());

  const sheet = (items: Parameters<typeof feedPage>[0]) => {
    answer({ all: feedPage(items) });
    const onClose = vi.fn();
    mount(<NotificationsSheet workspaceId={w} onClose={onClose} />);
    return onClose;
  };
  const press = (node: Element) => fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  const drag = (node: Element, dx: number, dy = 0) => {
    press(node);
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 100 + dx / 2, clientY: 100 + dy / 2 });
    fireEvent.pointerMove(node, { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy });
    fireEvent.pointerUp(node, { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy });
  };
  const slid = (row: Element) => row.querySelector<HTMLElement>(".ni-swipe")!.style.transform;

  it("stays open on Read from 72 px, and Read reads it", async () => {
    sheet([notice()]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), 80);
    expect(slid(row)).toBe("translateX(96px)");
    const read = within(row).getByRole("button", { name: "Read" });
    expect(read.tabIndex).toBe(0);
    read.focus();
    fireEvent.click(read);
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    expect(JSON.parse(String((calls("/read")[0]![2] as RequestInit).body))).toEqual({ ids: [notice().id] });
    // Read leaves with the row closed; its focus stays on the row.
    expect(within(row).queryByRole("button", { name: "Read" })).toBeNull();
    expect(document.activeElement).toBe(row.querySelector(".ni-row-title"));
  });

  it("closes once its dot reads it while it is open", async () => {
    sheet([notice()]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), 80);
    fireEvent.click(within(row).getByRole("button", { name: "Mark as read: Time off request from Tom Becker" }));
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    expect(slid(row)).toBe("");
    expect(within(row).queryByRole("button", { name: "Read" })).toBeNull();
  });

  it("opens the other way the same", async () => {
    sheet([notice()]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), -90);
    expect(slid(row)).toBe("translateX(-96px)");
    expect(within(row).getByRole("button", { name: "Read" }).className).toContain("is-right");
  });

  it("springs back under 72 px", async () => {
    sheet([notice()]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), 60);
    expect(slid(row)).toBe("");
    expect(within(row).queryByRole("button", { name: "Read" })).toBeNull();
    expect(calls("/read")).toHaveLength(0);
  });

  it("reads it at once from half the row, either way", async () => {
    sheet([notice()]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), -200);
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    expect(slid(row)).toBe("");
  });

  it("lets the list scroll when the finger goes more up or down than sideways", async () => {
    sheet([notice()]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), 10, 80);
    expect(slid(row)).toBe("");
    expect(within(row).queryByRole("button", { name: "Read" })).toBeNull();
  });

  it("does not open the row with the click that ends a drag, but with the next tap", async () => {
    const onClose = sheet([notice()]);
    const title = within(await rowOf(tom)).getByRole("button", { name: tom });
    drag(title, 80);
    fireEvent.click(title);
    expect(screen.getByTestId("where").textContent).toBe("/app/workspace");
    expect(onClose).not.toHaveBeenCalled();
    press(title);
    fireEvent.pointerUp(title, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(title);
    expect(screen.getByTestId("where").textContent).toBe(`/app/schedule/requests?type=time_off&request=${requestId}`);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes an open row on a tap anywhere else", async () => {
    sheet([notice(), notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", title: "Walk-in cooler repair on Tuesday", needs_action: false })]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), 80);
    expect(within(row).getByRole("button", { name: "Read" })).toBeTruthy();
    press(await rowOf(/^(Unread: )?Walk-in cooler repair on Tuesday$/));
    expect(within(row).queryByRole("button", { name: "Read" })).toBeNull();
    expect(slid(row)).toBe("");
  });

  // S-251 (Mert 2026-10-24): "telefonda kaydırınca okundu, sağa da sola da; okunmuş satırda Unread".
  const readAt = "2026-10-16T17:00:00Z";
  const seenAt = "2026-10-16T16:50:00Z";
  const cooler = notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de", title: "Walk-in cooler repair on Tuesday", needs_action: false, seen_at: seenAt, read_at: readAt });
  const unreadBody = () => JSON.parse(String((calls("/unread")[0]![2] as RequestInit).body)) as unknown;

  it("once read, stays open on Unread from 72 px, and Unread marks it unread with the focus kept on the row", async () => {
    sheet([notice({ seen_at: seenAt, read_at: readAt })]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), 80);
    expect(slid(row)).toBe("translateX(96px)");
    expect(within(row).queryByRole("button", { name: "Read" })).toBeNull();
    const unread = within(row).getByRole("button", { name: "Unread" });
    expect(unread.className).toContain("is-left");
    expect(unread.querySelector("svg.lucide-mail")).not.toBeNull();
    expect(unread.tabIndex).toBe(0);
    unread.focus();
    fireEvent.click(unread);
    // From here the core answers the row unread.
    answer({ all: feedPage([notice({ seen_at: seenAt })]) });
    await waitFor(() => expect(calls("/unread")).toHaveLength(1));
    expect(unreadBody()).toEqual({ ids: [notice().id] });
    expect(calls("/read")).toHaveLength(0);
    // Unread leaves with the row closed; its focus stays on the row, and the dot comes back to read it again.
    expect(within(row).queryByRole("button", { name: "Unread" })).toBeNull();
    expect(slid(row)).toBe("");
    expect(document.activeElement).toBe(row.querySelector(".ni-row-title"));
    expect(await within(row).findByRole("button", { name: "Mark as read: Time off request from Tom Becker" })).toBeTruthy();
    // Its place under New or Earlier stays: it was seen before.
    expect(row.parentElement!.querySelector(".ni-group")).toBeNull();
  });

  it("once read, opens on Unread the other way the same, and is unread at once from half the row", async () => {
    sheet([notice({ seen_at: seenAt, read_at: readAt }), cooler]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), -90);
    expect(slid(row)).toBe("translateX(-96px)");
    expect(within(row).getByRole("button", { name: "Unread" }).className).toContain("is-right");
    const other = await rowOf(/^Walk-in cooler repair on Tuesday$/);
    drag(within(other).getByRole("button", { name: /^Walk-in cooler repair on Tuesday$/ }), 200);
    await waitFor(() => expect(calls("/unread")).toHaveLength(1));
    expect(unreadBody()).toEqual({ ids: [cooler.id] });
    expect(slid(other)).toBe("");
  });

  // A read notice with no link has nothing to open: the focus Unread had goes to the list, never out of it.
  it("keeps the focus in the list when the row Unread leaves has nothing to open", async () => {
    sheet([notice({ url: null, seen_at: seenAt, read_at: readAt })]);
    const row = await rowOf(tom);
    expect(row.querySelector<HTMLButtonElement>(".ni-row-title")!.disabled).toBe(true);
    drag(row.querySelector(".ni-tile")!, 80);
    const unread = within(row).getByRole("button", { name: "Unread" });
    unread.focus();
    fireEvent.click(unread);
    await waitFor(() => expect(calls("/unread")).toHaveLength(1));
    expect(document.activeElement).toBe(row.closest('[role="tabpanel"]'));
  });

  // A row left open closes once it turns read or unread: the action under it would be the other one.
  it("closes once a tap on it reads it, so Unread never shows under a row opened on Read", async () => {
    sheet([notice({ url: null, seen_at: seenAt })]);
    const row = await rowOf(tom);
    const title = within(row).getByRole("button", { name: tom });
    drag(title, 80);
    expect(within(row).getByRole("button", { name: "Read" })).toBeTruthy();
    // From here the core answers the row read.
    answer({ all: feedPage([notice({ url: null, seen_at: seenAt, read_at: readAt })]) });
    // A tap, not the click that ended the drag.
    press(title);
    fireEvent.pointerUp(title, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(title);
    await waitFor(() => expect(calls("/read")).toHaveLength(1));
    await waitFor(() => expect(row.className).not.toContain("is-unread"));
    expect(slid(row)).toBe("");
    expect(row.querySelector(".ni-under")).toBeNull();
  });

  it("closes when it turns read while open, as when another device read it", async () => {
    sheet([notice({ seen_at: seenAt })]);
    const row = await rowOf(tom);
    drag(within(row).getByRole("button", { name: tom }), 80);
    expect(within(row).getByRole("button", { name: "Read" })).toBeTruthy();
    answer({ all: feedPage([notice({ seen_at: seenAt, read_at: readAt })]) });
    await refresh();
    await waitFor(() => expect(row.className).not.toContain("is-unread"));
    expect(slid(row)).toBe("");
    expect(row.querySelector(".ni-under")).toBeNull();
    expect(calls("/read")).toHaveLength(0);
    expect(calls("/unread")).toHaveLength(0);
  });

  it("drops a drag when the row turns read under the finger, so letting go past half does not mark it unread", async () => {
    sheet([notice({ seen_at: seenAt })]);
    const row = await rowOf(tom);
    const title = within(row).getByRole("button", { name: tom });
    press(title);
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 160, clientY: 100 });
    expect(slid(row)).toBe("translateX(60px)");
    answer({ all: feedPage([notice({ seen_at: seenAt, read_at: readAt })]) });
    await refresh();
    await waitFor(() => expect(row.className).not.toContain("is-unread"));
    expect(slid(row)).toBe("");
    fireEvent.pointerMove(title, { pointerId: 1, clientX: 320, clientY: 100 });
    expect(slid(row)).toBe("");
    fireEvent.pointerUp(title, { pointerId: 1, clientX: 320, clientY: 100 });
    // The click the let-go sends does not open the row either.
    fireEvent.click(title);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(calls("/unread")).toHaveLength(0);
    expect(calls("/read")).toHaveLength(0);
    expect(screen.getByTestId("where").textContent).toBe("/app/workspace");
  });

  it("does not slide in the desktop panel nor on the See all page, read or unread", async () => {
    for (const view of [<NotificationsPanel workspaceId={w} onClose={() => undefined} />, <NotificationsPage />]) {
      answer({ all: feedPage([notice(), cooler]) });
      mount(view);
      for (const name of [tom, /^Walk-in cooler repair on Tuesday$/]) {
        const row = await rowOf(name);
        drag(within(row).getByRole("button", { name }), 120);
        expect(slid(row)).toBe("");
        expect(within(row).queryByRole("button", { name: /^(Read|Unread)$/ })).toBeNull();
        drag(within(row).getByRole("button", { name }), -250);
        expect(slid(row)).toBe("");
      }
      expect(calls("/read")).toHaveLength(0);
      expect(calls("/unread")).toHaveLength(0);
      cleanup();
    }
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

  // The full-screen list sits above the page, toasts included: it says the outcome itself.
  it("says inside the list that everything was marked read", async () => {
    answer({ all: feedPage([notice()]) }, { unseen_count: 0, unread_count: 1, needs_action_count: 1 });
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    mount(<NotificationBell workspaceId={w} />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    const readAll = await screen.findByRole("button", { name: "Mark all as read" });
    await waitFor(() => expect((readAll as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(readAll);
    await waitFor(() => expect(screen.getByText("All marked as read").getAttribute("role")).toBe("status"));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
