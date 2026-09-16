import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ExchangeReadModel, NotificationRecord } from "@newfork/shared";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "../views/NotificationsPage";
import { notificationExchangeTarget } from "./NotificationShiftDetails";
import {
  getExchanges,
  refreshExchangeSurfaces,
} from "../employee-hub/shift-exchanges/exchange-data";
import { getNotifications, actOnNotification } from "./communications-data";

vi.mock("./communications-data", () => ({
  getNotifications: vi.fn(),
  actOnNotification: vi.fn(),
}));
vi.mock(
  "../employee-hub/shift-exchanges/exchange-data",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../employee-hub/shift-exchanges/exchange-data")
    >()),
    getExchanges: vi.fn(),
  }),
);
const w = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const cid = "98080000-0000-4000-8000-000000000001";
const sid = "98020000-0000-4000-8000-000000000001";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd" },
    },
  }),
}));
const notification = (): NotificationRecord => ({
  id: cid,
  workspace_id: w,
  category: "request",
  type_key: "requests.shift_change.status_changed",
  severity: "info",
  title: "Shift change approved",
  body: "Your swap was approved. The assignment changed at that time.",
  safe_preview: "A shift request was updated.",
  action_url: `/app/employee-hub/shift-hub?case=${cid}&hub_view=requests`,
  source_type: "shift_exchange_cases",
  source_id: cid,
  created_at: "2026-09-07T12:00:00Z",
  read_at: null,
  visibility_state: "visible",
});
function model(): ExchangeReadModel {
  const shift = {
    id: sid,
    source_id: sid,
    location_id: w,
    location_name: "Dining",
    timezone: "America/Los_Angeles",
    job_id: w,
    job_name: "Server",
    scheduled_date: "2030-01-07",
    start_time: "09:00",
    end_time: "17:00",
    starts_at: "2030-01-07T17:00:00Z",
    ends_at: "2030-01-08T01:00:00Z",
    employee_id: sid,
    employee_name: "Blake QA",
  };
  return {
    enabled: true,
    employee_id: sid,
    own_shifts: [],
    opportunities: [],
    cases: [
      {
        id: cid,
        kind: "swap",
        audience: "direct",
        status: "completed",
        stage: "closed",
        revision: 3,
        created_at: "2026-09-07T12:00:00Z",
        expires_at: "2030-01-07T17:00:00Z",
        owner_id: w,
        owner_name: "Alex QA",
        shift,
        requested_shift: {
          ...shift,
          id: w,
          scheduled_date: "2030-01-08",
          location_name: "Patio",
          employee_id: w,
          employee_name: "Alex QA",
        },
        current_published: true,
        requested_current_published: true,
        applications: [
          {
            id: sid,
            employee_id: sid,
            employee_name: "Private candidate",
            status: "approved",
            created_at: "2026-09-07T12:00:00Z",
            reason: "PRIVATE CANDIDATE REASON",
            eligibility: null,
          },
        ],
        candidate_count: 0,
        can_manage: false,
        is_owner: true,
        private_note: "PRIVATE MANAGER NOTE",
        history: [],
      },
    ],
  };
}
function setup(items = [notification()]) {
  vi.mocked(getNotifications).mockResolvedValue({
    workspace_id: w,
    unread_count: items.length,
    next_cursor: null,
    notifications: items,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...rendered, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getExchanges).mockResolvedValue(model());
});

describe("notification shift detail disclosure", () => {
  it("preserves the safe preview until explicit expansion and performs no mutation", async () => {
    setup();
    const toggle = await screen.findByRole("button", {
      name: "View shift details",
    });
    expect(screen.getByText("A shift request was updated.")).toBeTruthy();
    expect(screen.queryByText(notification().body)).toBeNull();
    expect(getExchanges).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(await screen.findByText("Current request")).toBeTruthy();
    expect(getExchanges).toHaveBeenCalledWith(w, false, { caseId: cid });
    expect(screen.getByText("First shift · 2030")).toBeTruthy();
    expect(screen.getByText("Second shift · 2030")).toBeTruthy();
    expect(screen.getByText("Blake QA")).toBeTruthy();
    expect(screen.getByText("Alex QA")).toBeTruthy();
    expect(screen.getByText(notification().body)).toBeTruthy();
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
    expect(screen.queryByText("Private candidate")).toBeNull();
    expect(actOnNotification).not.toHaveBeenCalled();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(
      screen.queryByRole("region", { name: "Shift request details" }),
    ).toBeNull();
  });
  it("shows current owners after a live refresh rather than inferring them from an old approved result", async () => {
    const { client } = setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    await screen.findByText("Blake QA");
    const next = model();
    next.cases[0]!.shift.employee_name = "Casey now assigned";
    vi.mocked(getExchanges).mockResolvedValue(next);
    await act(async () => {
      await refreshExchangeSurfaces(client, w);
    });
    expect(await screen.findByText("Casey now assigned")).toBeTruthy();
    expect(screen.queryByText("Blake QA")).toBeNull();
    expect(screen.getByText("Message when sent")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide shift details" }),
    ).toBeTruthy();
  });
  it("labels an unpublished counterpart as historical without naming a current owner", async () => {
    const data = model();
    data.cases[0]!.requested_current_published = false;
    vi.mocked(getExchanges).mockResolvedValue(data);
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    await screen.findByText("No longer published");
    expect(screen.getByText("Blake QA")).toBeTruthy();
    expect(screen.queryByText("Alex QA")).toBeNull();
    expect(screen.getAllByText("Currently responsible")).toHaveLength(1);
  });
  it("does not claim current responsibility when the server has no publication flag", async () => {
    const data = model();
    delete data.cases[0]!.current_published;
    delete data.cases[0]!.requested_current_published;
    vi.mocked(getExchanges).mockResolvedValue(data);
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    await screen.findAllByText("Check the published schedule");
    expect(screen.queryByText("Currently responsible")).toBeNull();
  });
  it("keeps denied details hidden and allows a fresh retry", async () => {
    vi.mocked(getExchanges).mockResolvedValueOnce({ ...model(), cases: [] });
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText(notification().body)).toBeNull();
    expect(screen.queryByText("Alex QA")).toBeNull();
    fireEvent.click(retry);
    expect(await screen.findByText("Blake QA")).toBeTruthy();
  });
  it("opens manager details through the scoped manager reader with correct schedule links", async () => {
    const item = notification();
    item.type_key = "requests.shift_change.submitted";
    item.action_url = `/app/schedule/requests?tab=shift-changes&case=${cid}`;
    setup([item]);
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    const panel = await screen.findByRole("region", {
      name: "Shift request details",
    });
    await within(panel).findByText("Blake QA");
    expect(getExchanges).toHaveBeenCalledWith(w, true, { caseId: cid });
    expect(
      within(panel)
        .getByRole("link", { name: /Open schedule · First shift/ })
        .getAttribute("href"),
    ).toBe(`/app/schedule?date=2030-01-07&view=day&locations=${w}`);
  });
  it("describes a true open shift without inventing a responsible owner", async () => {
    const data = model();
    const item = data.cases[0]!;
    item.kind = "open_pickup";
    item.status = "open";
    item.stage = "seeking_candidates";
    item.owner_id = null;
    item.is_owner = false;
    item.requested_shift = null;
    item.shift.employee_id = null;
    item.shift.employee_name = null;
    vi.mocked(getExchanges).mockResolvedValue(data);
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    expect(await screen.findByText("Awaiting volunteers")).toBeTruthy();
    expect(
      screen.getByText(
        "This open shift is assigned only after final manager approval.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Open shift · No assigned employee")).toBeTruthy();
    expect(screen.queryByText("Currently responsible")).toBeNull();
    expect(screen.queryByText("Second shift · 2030")).toBeNull();
  });
  it("keeps a cover request's current owner responsible while a manager decision is pending", async () => {
    const data = model();
    const item = data.cases[0]!;
    item.kind = "cover";
    item.status = "open";
    item.stage = "ready_for_manager";
    item.owner_id = item.shift.employee_id;
    item.requested_shift = null;
    vi.mocked(getExchanges).mockResolvedValue(data);
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    expect(await screen.findByText("Awaiting manager")).toBeTruthy();
    expect(
      screen.getByText(
        "The current owner remains responsible until final manager approval.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Blake QA")).toBeTruthy();
  });
  it("marks the notification read when its detailed request link is followed", async () => {
    vi.mocked(actOnNotification).mockResolvedValue({ ok: true } as never);
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "View shift details" }),
    );
    await screen.findByText("Blake QA");
    expect(actOnNotification).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Open request" }));
    await waitFor(() =>
      expect(actOnNotification).toHaveBeenCalledWith(w, {
        notification_id: cid,
        action: "read",
      }),
    );
  });
  it("opens only the selected row and rejects malformed or external notification targets", async () => {
    for (const action_url of [
      "https://example.test/app/employee-hub/shift-hub?case=" + cid,
      "/app/employee-hub/shift-hub?case=bad",
      "/app/announcements?case=" + cid,
    ])
      expect(
        notificationExchangeTarget({ ...notification(), action_url }),
      ).toBeNull();
    setup([notification(), { ...notification(), id: sid }]);
    const toggles = await screen.findAllByRole("button", {
      name: "View shift details",
    });
    fireEvent.click(toggles[0]!);
    await screen.findByText("Blake QA");
    fireEvent.click(toggles[1]!);
    await waitFor(() =>
      expect(
        screen.getAllByRole("region", { name: "Shift request details" }),
      ).toHaveLength(1),
    );
    expect(toggles[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(toggles[1]!.getAttribute("aria-expanded")).toBe("true");
  });
});
