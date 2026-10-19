import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  EmployeeHubReadModel,
  ScheduleReadModel,
  WeeklyPreferenceRead,
} from "@newfork/shared";
import { emptyWeeklyPreference } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeHubPage } from "./EmployeeHubPage";
import { requestAppNavigation } from "../shell/leave-guard";
import { loadWeeklyPreferences, saveWeeklyPreferences } from "../availability/availability-data";
vi.mock("../availability/availability-data", () => ({ loadWeeklyPreferences: vi.fn(), saveWeeklyPreferences: vi.fn() }));
import { changeExchange, getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
vi.mock("../employee-hub/shift-exchanges/exchange-data", () => ({
  getExchanges: vi.fn(), getExchangeCandidates: vi.fn(), getExchangePreview: vi.fn(),
  changeExchange: vi.fn(), refreshExchangeSurfaces: vi.fn(), ExchangeError: class extends Error {},
}));
import { getAnnouncements } from "../communications/communications-data";
import {
  actOnEmployeeRequest,
  getEmployeeHub,
  getEmployeeScheduleBoard,
  getEmployeePersonalTasks,
  changeEmployeePersonalTask,
} from "../employee-hub/employee-hub-data";

import { record } from "../communications/announcement-fixtures.test-util";
import { RequestError } from "../lib/request-error";
import { todayIn } from "../lib/today";
import { inDeviceZone, plain } from "../employee-hub/device-zone.testing";
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const { context } = vi.hoisted(() => ({
  context: {
    userId: "98000000-0000-4000-8000-000000000001",
    workspace: {
      id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      name: "Meyhouse",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "98100000-0000-4000-8000-000000000001",
      userId: "98000000-0000-4000-8000-000000000001",
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      access: { employee: true, management: null },
      status: "active",
    },
    permissions: ["workspace.read", "schedule.read"],
    actions: [],
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  } as ActiveWorkspaceContext,
}));

const ownShift = {
  id: "22000000-0000-4000-8000-000000000001",
  location_id: "11000000-0000-4000-8000-000000000001",
  location_name: "Main Dining",
  job_name: "Server",
  scheduled_date: "2026-08-24",
  start_time: "09:00",
  end_time: "17:00",
  note: "",
  employee_id: "15000000-0000-4000-8000-000000000001",
};
const fixture = {
  workspace_id: workspaceId,
  settings: { time_format: "12h", time_off_lead_hours: 24 },
  time_off_timezone: "America/Los_Angeles",
  employee: {
    id: "15000000-0000-4000-8000-000000000001",
    display_name: "Alex Kim",
  },
  locations: [
    { id: "11000000-0000-4000-8000-000000000001", name: "Main Dining", timezone: "America/Los_Angeles" },
  ],
  shifts: [ownShift],
  open_shifts: [
    {
      ...ownShift,
      id: "22000000-0000-4000-8000-000000000005",
      scheduled_date: "2026-08-28",
      employee_id: null,
    },
  ],
  team_shifts: [
    {
      ...ownShift,
      id: "22000000-0000-4000-8000-000000000002",
      scheduled_date: "2026-08-25",
      employee_id: "15000000-0000-4000-8000-000000000002",
      employee_name: "Jordy Lee",
    },
  ],
  requests: [
    {
      id: "98200000-0000-4000-8000-000000000003",
      kind: "time_off",
      status: "pending",
      title: "Time off",
      detail: "Aug 30 - Aug 31 · Main Dining",
      revision: 3,
      created_at: "2026-08-18T12:00:00Z",
      can_cancel: true,
    },
  ],
  team: [
    {
      id: "15000000-0000-4000-8000-000000000002",
      display_name: "Jordy Lee",
      job_names: ["Bartender"],
      location_names: ["Main Dining"],
    },
  ],
} satisfies EmployeeHubReadModel;

const scheduleBoard = {
  workspace_id: workspaceId,
  week_start: "2026-08-24",
  week_start_day: "monday",
  settings: { time_format: "12h" },
  locations: [
    {
      id: "11000000-0000-4000-8000-000000000001",
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      sort_order: 1,
      publication_status: "published",
      published_at: "2026-08-20T12:00:00Z",
    },
  ],
  departments: [],
  jobs: [
    {
      id: "13000000-0000-4000-8000-000000000001",
      name: "Server",
      color: "#2d8c64",
      
      department_id: null,
      system_key: null,
    },
  ],
  shift_types: [],
  shift_labels: [],
  employees: [
    {
      id: "15000000-0000-4000-8000-000000000001",
      employee_code: "E-0001",
      display_name: "Alex Kim",
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      job_ids: ["13000000-0000-4000-8000-000000000001"],
    },
    {
      id: "15000000-0000-4000-8000-000000000002",
      employee_code: "E-0002",
      display_name: "Jordy Lee",
      location_ids: ["11000000-0000-4000-8000-000000000001"],
      job_ids: ["13000000-0000-4000-8000-000000000001"],
    },
  ],
  shifts: [
    {
      id: "22000000-0000-4000-8000-000000000001",
      location_id: "11000000-0000-4000-8000-000000000001",
      employee_id: "15000000-0000-4000-8000-000000000001",
      job_id: "13000000-0000-4000-8000-000000000001",
      shift_type_id: null,
      scheduled_date: "2026-08-24",
      start_time: "09:00",
      end_time: "17:00",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      note: "",
      warning_codes: [],
    },
    {
      id: "22000000-0000-4000-8000-000000000002",
      location_id: "11000000-0000-4000-8000-000000000001",
      employee_id: "15000000-0000-4000-8000-000000000002",
      job_id: "13000000-0000-4000-8000-000000000001",
      shift_type_id: null,
      scheduled_date: "2026-08-25",
      start_time: "10:00",
      end_time: "18:00",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      note: "",
      warning_codes: [],
    },
  ],
  referenced_jobs: [],
  referenced_shift_types: [],
  closures: [],
  important_dates: [],
} satisfies ScheduleReadModel;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
// The real hook, its request swapped: what the form sends is what is checked.
const { submitTimeOff } = vi.hoisted(() => ({ submitTimeOff: vi.fn() }));
vi.mock("../schedule/requests-data", async (importOriginal) => {
  const { useMutation } = await import("@tanstack/react-query");
  return {
    ...(await importOriginal<typeof import("../schedule/requests-data")>()),
    useSubmitTimeOff: (workspace: string) => useMutation({ mutationFn: (request: unknown) => submitTimeOff(workspace, request) }),
  };
});
vi.mock("../communications/communications-data", () => ({
  getAnnouncements: vi.fn(),
}));
vi.mock("../employee-hub/employee-hub-data", () => ({
  getEmployeePersonalTasks: vi.fn().mockResolvedValue([]),
  changeEmployeePersonalTask: vi.fn().mockResolvedValue([]),
  getEmployeeHub: vi.fn(),
  getEmployeeScheduleBoard: vi.fn(),
  actOnEmployeeRequest: vi.fn(),
}));

function renderPage(path = "/app/employee-hub") {
  vi.mocked(getEmployeeHub).mockResolvedValue(fixture);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <EmployeeHubPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderPageWithFixture(
  model: EmployeeHubReadModel,
  path = "/app/employee-hub",
) {
  vi.mocked(getEmployeeHub).mockResolvedValue(model);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <EmployeeHubPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

function weeklyModel(): WeeklyPreferenceRead {
  return {
    employee_id: fixture.employee.id, employee_name: fixture.employee.display_name,
    can_edit_employee: true, can_manage: false, manager: null, shift_types: [], time_format: "12h",
    settings: { onboarding_required: false, revision: 0 },
    employee: { revision: 0, submitted: false, updated_at: null, preference: emptyWeeklyPreference() },
  };
}

describe("EmployeeHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submitTimeOff.mockResolvedValue({ status: "pending", request_id: "98300000-0000-4000-8000-000000000001", revision: 1, decide_by: null });
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(weeklyModel());
    vi.mocked(saveWeeklyPreferences).mockImplementation(async (_workspace, command) => {
      const model = weeklyModel();
      model.employee = { ...model.employee, revision: 1, submitted: true, preference: command.preference };
      vi.mocked(loadWeeklyPreferences).mockResolvedValue(model);
      return { model };
    });
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: fixture.employee.id, cases: [], own_shifts: [], opportunities: [] });
    context.permissions = ["workspace.read", "schedule.read"];
    context.actions = [];
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: false,
      can_write_dates: false,
      can_read_dates: false,
      time_format: "12h",
      locations: [],
      people: [],
      departments: [],
      jobs: [],
      announcements: [],
    });
    vi.mocked(getEmployeePersonalTasks).mockResolvedValue([]);
    vi.mocked(changeEmployeePersonalTask).mockResolvedValue([]);
  });
  // BILDIRIM-02 (KARARLAR S-123, S-96): no bell, no updates card, no
  // preferences link until the new notification system lands.
  it("shows Home without the old notification bell, updates card or preferences link", async () => {
    context.permissions = [...context.permissions, "notifications.read"];
    renderPage();
    expect(await screen.findByRole("link", { name: /Full schedule/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Notifications/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Latest updates" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Notification preferences/ })).toBeNull();
  });

  // CALISAN-MORE: More is a sheet over the page now; the old More page's
  // address, and any address the hub does not know, opens Home.
  it("opens Home for the old More address and for an unknown one", async () => {
    for (const path of ["/app/employee-hub/more", "/app/employee-hub/nothing-here"]) {
      renderPage(path);
      expect(await screen.findByRole("link", { name: /Full schedule/ })).toBeTruthy();
      expect(screen.queryByRole("link", { name: /My account/ })).toBeNull();
      cleanup();
    }
  });
  // LINEUP-PUBLISH: Schedule → Lineup is a page of the hub, not an unknown address.
  it("keeps Schedule → Lineup on its own page", async () => {
    renderPage("/app/employee-hub/schedule/lineup");
    expect(await screen.findByRole("heading", { level: 1, name: "Lineup" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Full schedule/ })).toBeNull();
  });
  // BL-278 (7): a failed request check must not read as "nothing waiting".
  it("does not say all caught up when the requests could not be checked", async () => {
    vi.mocked(getExchanges).mockRejectedValue(new Error("Offline"));
    renderPage();
    expect(await screen.findByText("Requests couldn’t be checked")).toBeTruthy();
    expect(screen.queryByText("You’re all caught up")).toBeNull();
  });

  it("keeps the daily hub usable if the notices panel fails", async () => {
    context.permissions = [...context.permissions, "announcements.read"];
    context.actions = ["announcement.read"];
    vi.mocked(getAnnouncements).mockRejectedValue(
      new Error("Notices unavailable"),
    );
    renderPage();
    expect(await screen.findByRole("heading", { name: "We couldn't load team notices" })).toBeTruthy();
    expect(screen.queryByText(/unavailable/)).toBeNull();
    expect(screen.getByRole("link", { name: /Full schedule/ })).toBeTruthy();
    expect(screen.getByLabelText("New personal reminder")).toBeTruthy();
  });

  // Loading and error in the "B" look (Mert 2026-10-14).
  it("keeps a card's last items and says so when its refresh fails", async () => {
    const task = {
      id: "98300000-0000-4000-8000-000000000010",
      title: "Bring notebook",
      completed: false,
      created_at: "2026-09-06T10:00:00Z",
    };
    vi.mocked(getEmployeePersonalTasks).mockResolvedValue([task]);
    const { client } = renderPageWithFixture(fixture);
    expect(await screen.findByRole("checkbox", { name: "Bring notebook" })).toBeTruthy();
    vi.mocked(getEmployeePersonalTasks).mockRejectedValueOnce(new Error("Unavailable"));
    await act(async () => {
      await client.refetchQueries({ predicate: (query) => query.queryKey.some((part) => typeof part === "string" && part.includes("task")) });
    });
    expect(
      await screen.findByText("Your reminders didn't refresh. These are the last ones that loaded."),
    ).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Bring notebook" })).toBeTruthy();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });

  it("keeps the notices card's last answer when its refresh fails", async () => {
    context.permissions = [...context.permissions, "announcements.read"];
    context.actions = ["announcement.read"];
    const { client } = renderPageWithFixture(fixture);
    expect(await screen.findByText("No new notices. Enjoy a little quiet.")).toBeTruthy();
    vi.mocked(getAnnouncements).mockRejectedValueOnce(new Error("Notices unavailable"));
    await act(async () => {
      await client.refetchQueries({ predicate: (query) => query.queryKey.includes("hub-preview") });
    });
    expect(await screen.findByText("Team notices didn't refresh. These are the last ones that loaded.")).toBeTruthy();
    expect(screen.getByText("No new notices. Enjoy a little quiet.")).toBeTruthy();
    expect(screen.queryByText(/unavailable/)).toBeNull();
  });

  it("shows the hub's outline, then a card with Try again instead of the server's sentence", async () => {
    vi.mocked(getEmployeeHub).mockReturnValueOnce(new Promise(() => {}) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/employee-hub"]}>
          <EmployeeHubPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getAllByRole("status").some((node) => node.textContent === "Loading Employee Hub")).toBe(true);
    expect(screen.queryByText("Getting your day ready…")).toBeNull();
    view.unmount();

    vi.mocked(getEmployeeHub).mockReset().mockRejectedValueOnce(new Error("hub service down")).mockResolvedValue(fixture);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/app/employee-hub"]}>
          <EmployeeHubPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load Employee Hub" })).toBeTruthy();
    expect(screen.queryByText("hub service down")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Full schedule/ })).toBeTruthy();
  });

  it("keeps the last day and says so when the hub's refresh fails", async () => {
    const { client } = renderPageWithFixture(fixture);
    expect(await screen.findByRole("link", { name: /Full schedule/ })).toBeTruthy();
    vi.mocked(getEmployeeHub).mockRejectedValueOnce(new Error("hub service down"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["employee-hub"] });
    });
    expect(
      await screen.findByText("Your day didn't refresh. This is the last schedule that loaded."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Full schedule/ })).toBeTruthy();
    expect(screen.queryByText("Your schedule may be out of date.")).toBeNull();
    expect(screen.queryByText("hub service down")).toBeNull();

    // While the retry is on its way the button says so and waits.
    let answer: (value: typeof fixture) => void = () => {};
    vi.mocked(getEmployeeHub).mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const waiting = await screen.findByRole("button", { name: "Trying again…" });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer(fixture));
    await waitFor(() =>
      expect(screen.queryByText("Your day didn't refresh. This is the last schedule that loaded.")).toBeNull(),
    );
  });
  // EKRAN-08: dated posts show under Coming up, for the person's own location; the rest stay Team notices.
  it("lists published Important Dates under Coming up and keeps them out of the team's notices", async () => {
    context.actions = ["announcement.read"];
    const thanksgiving = record({
      id: "a8200000-0000-4000-8000-000000000091",
      title: "Thanksgiving",
      category: "holiday",
      status: "published",
      display_status: "published",
      on_important_dates: true,
      starts_on: "2026-11-26",
      ends_on: "2026-11-26",
      locations: [
        {
          location_id: fixture.locations[0]!.id,
          name: "Main Dining",
          short_name: "Main Dining",
          timezone: "America/Los_Angeles",
          archived: false,
          day: "closed",
          opens: null,
          closes: null,
        },
      ],
    });
    const notice = record({
      id: "a8200000-0000-4000-8000-000000000092",
      title: "New coffee",
      body: "Try the oat latte.",
      status: "published",
      display_status: "published",
    });
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: false,
      can_write_dates: false,
      can_read_dates: true,
      time_format: "12h",
      locations: [],
      people: [],
      departments: [],
      jobs: [],
      announcements: [notice, thanksgiving],
    });
    renderPage();
    const line = await screen.findByText("Main Dining closed · Thu, Nov 26");
    expect(line.closest("a")?.getAttribute("href")).toBe(`/app/announcements/${thanksgiving.id}`);
    const notices = screen.getByRole("heading", { name: "From your team" }).closest("section")!;
    expect(notices.textContent).toContain("New coffee");
    expect(notices.textContent).not.toContain("Thanksgiving");
  });
  it("creates a persisted personal reminder and completes it only after server confirmation", async () => {
    const task = {
      id: "98300000-0000-4000-8000-000000000009",
      title: "Bring notebook",
      completed: false,
      created_at: "2026-09-06T10:00:00Z",
    };
    vi.mocked(changeEmployeePersonalTask)
      .mockResolvedValueOnce([task])
      .mockResolvedValueOnce([{ ...task, completed: true }]);
    renderPage();
    fireEvent.change(await screen.findByLabelText("New personal reminder"), {
      target: { value: "Bring notebook" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add reminder" }));
    const checkbox = await screen.findByRole("checkbox", {
      name: "Bring notebook",
    });
    expect(changeEmployeePersonalTask).toHaveBeenCalledWith(workspaceId, {
      action: "create",
      id: expect.any(String),
      title: "Bring notebook",
    });
    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(
        screen.queryByRole("checkbox", { name: "Bring notebook" }),
      ).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show completed" }));
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Bring notebook",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
  it("preserves reminder text and reuses the create id after an unconfirmed save", async () => {
    vi.mocked(changeEmployeePersonalTask).mockRejectedValueOnce(
      new Error("Connection interrupted"),
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText("New personal reminder"), {
      target: { value: "Call manager" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add reminder" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      (screen.getByLabelText("New personal reminder") as HTMLInputElement)
        .value,
    ).toBe("Call manager");
    fireEvent.click(screen.getByRole("button", { name: "Add reminder" }));
    await waitFor(() =>
      expect(changeEmployeePersonalTask).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(changeEmployeePersonalTask).mock.calls[0]![1]).toEqual(
      vi.mocked(changeEmployeePersonalTask).mock.calls[1]![1],
    );
  });
  it("keeps schedule access when the reminder panel fails", async () => {
    vi.mocked(getEmployeePersonalTasks).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "We couldn't load your reminders" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Full schedule/ })).toBeTruthy();
  });
  // CALISAN-SCHEDULE-LISTE (Mert 2026-10-17): Schedule opens on My shifts, the lab's "Zaman çizgisi" week list.
  it("opens Schedule on My shifts: one card per day, time off, open shifts, and the week from the switch", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-26T19:00:00Z"));
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    const approved = {
      ...fixture.requests[0]!,
      id: "98200000-0000-4000-8000-000000000009",
      status: "approved",
      periods: [{ id: "98210000-0000-4000-8000-000000000009", segment_date: "2026-08-27", start_time: null, end_time: null, status: "approved" as const }],
    };
    renderPageWithFixture({ ...fixture, requests: [approved] }, "/app/employee-hub/schedule");

    const tabs = await screen.findByRole("navigation", { name: "Schedule pages" });
    expect(within(tabs).getAllByRole("link").map((link) => link.textContent)).toEqual(["My shifts", "Team schedule", "Lineup"]);
    expect(within(tabs).getByRole("link", { name: "My shifts" }).getAttribute("aria-current")).toBe("page");

    const thisWeek = await screen.findByRole("tabpanel", { name: "This week" });
    expect(within(thisWeek).getByRole("link", { name: /9:00 AM – 5:00 PM/ })?.textContent).toContain("Main Dining · Server");
    expect(thisWeek.querySelector('[data-day="2026-08-26"]')?.classList.contains("today")).toBe(true);
    expect(thisWeek.querySelector('[data-day="2026-08-27"]')?.textContent).toContain("Time off · Approved");
    expect(within(thisWeek).getByRole("link", { name: "1 open shift to pick up" }).getAttribute("href")).toBe(
      "/app/employee-hub/shift-hub?hub_view=available&from=2026-08-28&to=2026-08-28",
    );
    expect(thisWeek.querySelector('[data-day="2026-08-30"]')?.textContent).toContain("Day off");
    // Each week on its own: the hub takes 62 days at most, and a far week stands beside This week.
    expect(getEmployeeHub).toHaveBeenCalledWith(workspaceId, "2026-08-24", "2026-08-30");
    expect(getEmployeeHub).toHaveBeenCalledWith(workspaceId, "2026-08-31", "2026-09-06");

    const next = screen.getByRole("tab", { name: "Next week" });
    expect(next.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(next);
    expect(next.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Next week", hidden: true }).querySelector('[data-day="2026-08-31"]')).not.toBeNull();
    vi.useRealTimers();
  });

  it("opens Your shift from a day card", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-26T19:00:00Z"));
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage("/app/employee-hub/schedule");
    fireEvent.click(await screen.findByRole("link", { name: /9:00 AM – 5:00 PM/ }));
    // jsdom has no showModal: the sheet is in the page, not "open".
    await waitFor(() => expect(document.querySelector("dialog.eh-sheet h2")?.textContent).toBe("Your shift"));
    expect(document.querySelector("dialog.eh-sheet")?.textContent).toContain("Main Dining · Server");
    vi.useRealTimers();
  });

  it("shows the published team board and narrows it to My Schedule", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage("/app/employee-hub/schedule/team?date=2026-08-24");

    const rowNames = () =>
      Array.from(
        document.querySelectorAll(".schedule-employee-name-button"),
      ).map((element) => element.textContent);

    await waitFor(() => expect(rowNames()).toContain("Jordy Lee"));
    expect(rowNames()).toContain("Alex Kim");

    fireEvent.click(screen.getByRole("button", { name: "My Schedule" }));

    await waitFor(() => expect(rowNames()).not.toContain("Jordy Lee"));
    expect(rowNames()).toContain("Alex Kim");
  });

  it("peels board layers in order: filters, then day view", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage(
      "/app/employee-hub/schedule/team?date=2026-08-25&view=day&employees=15000000-0000-4000-8000-000000000001",
    );
    const rowNames = () =>
      Array.from(
        document.querySelectorAll(".schedule-employee-name-button"),
      ).map((element) => element.textContent);

    await waitFor(() => expect(rowNames()).toContain("Alex Kim"));
    expect(rowNames()).not.toContain("Jordy Lee");
    expect(screen.getAllByText("Tuesday, August 25, 2026").length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: "Escape" });

    // Employee filter clears first; the day view survives this layer.
    await waitFor(() => expect(rowNames()).toContain("Jordy Lee"));
    expect(screen.getAllByText("Tuesday, August 25, 2026").length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.getAllByText(/Aug 30, 2026/).length).toBeGreaterThan(0),
    );
  });

  // Mert, 2026-10-12: Esc takes the newest filter off first. Changing the
  // employee filter makes it newer than the location filter set before it.
  it("takes the most recently changed board filter off first", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage(
      "/app/employee-hub/schedule/team?date=2026-08-24&employees=15000000-0000-4000-8000-000000000001,15000000-0000-4000-8000-000000000002&locations=11000000-0000-4000-8000-000000000001",
    );
    const rowNames = () =>
      Array.from(
        document.querySelectorAll(".schedule-employee-name-button"),
      ).map((element) => element.textContent);

    await waitFor(() => expect(rowNames()).toContain("Jordy Lee"));
    fireEvent.click(
      document.querySelector<HTMLElement>('[data-topbar-filter-trigger="employees"]')!,
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: "Jordy Lee" }));
    await waitFor(() => expect(rowNames()).not.toContain("Alex Kim"));

    // The first Escape closes the open filter menu, the second takes off the
    // employee filter (the newest), not the location filter.
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(rowNames()).toContain("Alex Kim"));
  });

  it("opens the picked calendar day even from week view", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage("/app/employee-hub/schedule/team?date=2026-08-24");

    fireEvent.click(
      await screen.findByRole("button", { name: "Open schedule calendar" }),
    );
    fireEvent.click(screen.getByRole("gridcell", { name: /^August 26, 2026/ }));

    await waitFor(() =>
      expect(
        screen.getAllByText("Wednesday, August 26, 2026").length,
      ).toBeGreaterThan(0),
    );
  });

  it("only toggles the calendar from its icon, even in day view", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage("/app/employee-hub/schedule/team?date=2026-08-25&view=day");

    const trigger = await screen.findByRole("button", {
      name: "Open schedule calendar",
    });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: "Schedule calendar" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Tuesday, August 25, 2026").length).toBeGreaterThan(0);
  });

  it("keeps the employee board free of scheduling tools", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage("/app/employee-hub/schedule/team?date=2026-08-24");

    await waitFor(() =>
      expect(
        document.querySelectorAll(".schedule-employee-name-button").length,
      ).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(
      screen.queryByText("Use default times for scheduling"),
    ).toBeNull();
    expect(screen.queryByText(/Preset badges/)).toBeNull();
    expect(screen.queryByText(/Unassigned Shifts Row/)).toBeNull();
  });

  // Daylight (Mert 2026-10-18): the greeting, the next shift's card and the day's sections.
  it("greets the employee with the next shift, the week and the sections", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    try {
      renderPage();
      expect(
        await screen.findByRole("heading", { level: 1, name: /Good morning,\s*Alex/ }),
      ).toBeTruthy();
      const card = screen.getByRole("link", { name: /^Open details for your today shift, 9:00 AM to/ });
      expect(card.textContent).toMatch(/Today · Starts in 4h/);
      expect(card.getAttribute("href")).toMatch(/\?shift=/);
      expect(screen.getByRole("group", { name: /Next 7 days/ }).querySelectorAll("button")).toHaveLength(7);
      expect(screen.getByText("You’re all caught up")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Your week" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "All open shifts" }).getAttribute("href")).toBe(
        "/app/employee-hub/shift-hub?hub_view=available",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // CALISAN-HOME-HIZA (Mert 2026-10-19): Updates, Your week and Pick up a shift
  // stay on Home with nothing in them, each with one quiet line.
  it("keeps Updates, Your week and Pick up a shift with a quiet line when they are empty", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    try {
      renderPageWithFixture({ ...fixture, shifts: [], open_shifts: [], requests: [] } as unknown as EmployeeHubReadModel);
      expect(await screen.findByRole("heading", { name: "Updates" })).toBeTruthy();
      expect(screen.getByText("Nothing new yet.")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Your week" })).toBeTruthy();
      expect(screen.getByText("scheduled in the next 7 days")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Pick up a shift" })).toBeTruthy();
      expect(screen.getByText("No open shifts right now.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  // CALISAN-HOME-HIZA (Mert 2026-10-19): the desktop bar holds only the bell and the profile;
  // the workspace's name lives at the top of the menu.
  it("keeps the workspace name and the private-space note out of Home's bar", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Your profile" })).toBeTruthy();
    expect(screen.queryByText("Your personal space")).toBeNull();
    expect(document.querySelector(".eh-workspace-link")).toBeNull();
  });

  // S-163 (7): a Management shift at the same place and time shows as "Manager on the floor"; none, no line.
  it("names the manager on the floor only when one works alongside", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    try {
      const manager = {
        ...ownShift,
        id: "22000000-0000-4000-8000-000000000009",
        job_name: "General Manager",
        start_time: "08:00",
        end_time: "16:00",
        employee_id: "15000000-0000-4000-8000-000000000009",
        employee_name: "Mina Park",
        is_management: true,
      };
      renderPageWithFixture({ ...fixture, team_shifts: [...fixture.team_shifts, manager] } as EmployeeHubReadModel);
      const card = await screen.findByRole("link", { name: /^Open details for your today shift/ });
      expect(card.textContent).toContain("Mina Park · Manager on the floor");
      cleanup();
      renderPageWithFixture({ ...fixture, team_shifts: [...fixture.team_shifts, { ...manager, is_management: false }] } as EmployeeHubReadModel);
      const plain = await screen.findByRole("link", { name: /^Open details for your today shift/ });
      expect(plain.textContent).not.toContain("Manager on the floor");
    } finally {
      vi.useRealTimers();
    }
  });

  // Spec "Kurallar" 5 (AVAIL-GUN-1): a shift on hours the employee marked carries a small note.
  it("marks a coming shift on hours the employee said they prefer not to work, and only that one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    try {
      const week = weeklyModel();
      week.employee = { ...week.employee, submitted: true, preference: { days: week.employee.preference.days.map((day) =>
        day.day === 1 ? { ...day, all_day: false, ranges: [{ start: "15:00", end: "24:00" }] } : day) } };
      vi.mocked(loadWeeklyPreferences).mockResolvedValue(week);
      renderPage();
      const flag = await screen.findByRole("note");
      expect(flag.textContent).toContain("You marked Mon after 3:00 PM unavailable.");
      expect(screen.getAllByRole("note")).toHaveLength(1);
      expect(within(flag).getByRole("link", { name: "Swap or give up" }).getAttribute("href"))
        .toBe(`/app/employee-hub/shift-hub?offer=${ownShift.id}`);
    } finally {
      vi.useRealTimers();
    }
  });

  // TAKAS-RELEASE: only a teammate's released shift is in the pool.
  it("asks for a teammate's released shift from Shift Hub", async () => {
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: fixture.employee.id, cases: [], own_shifts: [], opportunities: [{
      case_id: "98200000-0000-4000-8000-000000000001", note: "", eligibility: { status: "eligible", reasons: [] }, shift: {
      ...ownShift, id: "22000000-0000-4000-8000-000000000005", source_id: "22000000-0000-4000-8000-000000000005",
      employee_id: "51000000-0000-4000-8000-000000000009", employee_name: "Maria Lopez",
      job_id: "13000000-0000-4000-8000-000000000001", scheduled_date: "2030-01-01", timezone: "America/Los_Angeles", starts_at: "2030-01-01T17:00:00Z", ends_at: "2030-01-02T01:00:00Z",
    } }] });
    vi.mocked(changeExchange).mockResolvedValue({ case_id: "98200000-0000-4000-8000-000000000001", status: "open", revision: 2 });
    renderPage("/app/employee-hub/shift-hub?from=2030-01-01&to=2030-01-01");
    fireEvent.click(
      await screen.findByRole("button", { name: "I’ll take it" }),
    );
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(workspaceId, {
        action: "apply",
        shift_id: "22000000-0000-4000-8000-000000000005",
        case_id: "98200000-0000-4000-8000-000000000001",
      }, expect.any(String)),
    );
  });

  it("keeps My availability on screen and says so when the hub's refresh fails", async () => {
    const { client } = renderPageWithFixture(fixture, "/app/employee-hub/my-availability");
    expect(await screen.findByRole("radio", { name: /^Unavailable/ })).toBeTruthy();
    vi.mocked(getEmployeeHub).mockRejectedValueOnce(new Error("hub service down"));
    await act(async () => {
      await client.refetchQueries({ queryKey: ["employee-hub"] });
    });
    expect(
      await screen.findByText("Employee Hub didn't refresh. This is the last information that loaded."),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^Unavailable/ })).toBeTruthy();
    expect(screen.queryByText("hub service down")).toBeNull();
  });

  it("opens the current weekly editor by default and saves without approval", async () => {
    renderPage("/app/employee-hub/my-availability");
    const day = await screen.findByRole("radio", { name: /^Unavailable/ });
    expect(screen.getByRole("tab", { name: "Availability" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByLabelText("Start")).toBeNull();
    expect(screen.queryByLabelText("Starts on")).toBeNull();
    // Tur 2 (Mert 2026-10-16): no standing explainer box under the tabs.
    expect(screen.queryByText(/preference, not a guarantee/)).toBeNull();
    fireEvent.click(day);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveWeeklyPreferences).toHaveBeenCalledWith(workspaceId,
      expect.objectContaining({ source: "employee", employee_id: fixture.employee.id, expected_revision: 0 }),
      expect.any(String), false));
    expect(submitTimeOff).not.toHaveBeenCalled();
  });

  // C2.4: with nothing scheduled, Home's "Update availability" opens the Availability tab itself.
  it("opens the Availability tab from Home, without a dead anchor", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: "Update availability" });
    expect(link.getAttribute("href")).toMatch(/\/my-availability\?section=availability$/);
    fireEvent.click(link);
    expect(await screen.findByRole("tab", { name: "Availability" })).toHaveProperty("ariaSelected", "true");
  });

  // EKRAN-02 C2 #89: an open shift on Home lands on the Shift Hub's open shifts.
  it("opens the Shift Hub's available shifts from Home's open shifts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    try {
      renderPage();
      const row = await screen.findByRole("heading", { name: "Pick up a shift" });
      const card = row.closest("section")!.querySelector('[role="listitem"]')!;
      expect(card.getAttribute("href")).toBe("/app/employee-hub/shift-hub?hub_view=available");
    } finally {
      vi.useRealTimers();
    }
  });

  // C2.3, P26: both drafts ask before a tab change loses them.
  it("protects an unsaved weekly draft and a time-off draft on tab changes", async () => {
    renderPage("/app/employee-hub/my-availability");
    fireEvent.click(await screen.findByRole("radio", { name: /^Unavailable/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Time Off Requests" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Discard availability changes?");
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("radio", { name: /^Unavailable/ })).toHaveProperty("ariaChecked", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Time Off Requests" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Availability" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Discard time off changes?");
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByLabelText("Start")).toHaveProperty("value", "2035-01-15");
    fireEvent.click(screen.getByRole("tab", { name: "Availability" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(await screen.findByRole("radio", { name: /^Unavailable/ })).toHaveProperty("ariaChecked", "false");
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
    expect(submitTimeOff).not.toHaveBeenCalled();
  });

  // SEKME-KAYDIR (KARARLAR §1.5): on a phone a swipe changes the tab the way a tap does, so it asks first too.
  it("asks before a phone swipe to the other tab loses an unsaved time-off draft", async () => {
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      renderPage("/app/employee-hub/my-availability?section=time-off");
      fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
      const swipeRight = () => {
        const panel = screen.getByRole("tabpanel");
        fireEvent.touchStart(panel, { touches: [{ clientX: 100, clientY: 500 }] });
        fireEvent.touchEnd(panel, { touches: [], changedTouches: [{ clientX: 250, clientY: 505 }] });
      };
      swipeRight();
      expect(screen.getByRole("alertdialog").textContent).toContain("Discard time off changes?");
      fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
      expect(screen.getByRole("tab", { name: "Time Off Requests" })).toHaveProperty("ariaSelected", "true");
      expect(screen.getByLabelText("Start")).toHaveProperty("value", "2035-01-15");
      swipeRight();
      fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
      expect(await screen.findByRole("tab", { name: "Availability" })).toHaveProperty("ariaSelected", "true");
      expect(submitTimeOff).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = media;
    }
  });

  it("opens time-off request deep links and keeps time off usable when weekly data fails", async () => {
    vi.mocked(loadWeeklyPreferences).mockRejectedValue(new Error("Weekly unavailable"));
    renderPage("/app/employee-hub/my-availability#request-98200000-0000-4000-8000-000000000003");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitTimeOff).toHaveBeenCalledOnce());
  });

  it("preserves time-off drafts before a programmatic departure", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"),{target:{value:"2035-01-15"}});
    fireEvent.change(screen.getByLabelText("Note"),{target:{value:"My leave note"}});
    const navigate = vi.fn();
    act(()=>requestAppNavigation(navigate));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button",{name:"Stay here"}));
    expect(screen.getByLabelText("Start")).toHaveProperty("value","2035-01-15");
    expect(screen.getByLabelText("Note")).toHaveProperty("value","My leave note");
    act(()=>requestAppNavigation(navigate));
    fireEvent.click(screen.getByRole("button",{name:"Discard and leave"}));
    expect(navigate).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Note")).toHaveProperty("value","");
    expect(screen.queryByLabelText("Starts on")).toBeNull();
    expect(submitTimeOff).not.toHaveBeenCalled();
  });

  it("formats real timestamp values in leave submission and manager decision history", async () => {
    const approved = { ...fixture.requests.find(request => request.kind === "time_off")!, status: "approved" as const, can_cancel: false,
      created_at: "2026-08-18T12:00:00.953541+00:00", decision_events: [{ id: "af9c0000-0000-4000-8000-000000000001", action: "approved", note: "Approval history", created_at: "2026-08-19T12:00:00.441726+00:00", revision: 2 }] };
    renderPageWithFixture({ ...fixture, requests: [approved] }, "/app/employee-hub/my-availability?section=time-off");
    await screen.findByText(/Submitted Tue, Aug 18, 2026/);
    expect(screen.getByText(/Wed, Aug 19, 2026/)).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    // BL-512: the action reads as a word, not a code.
    expect(screen.getByRole("list", { name: "Manager decisions" }).textContent).toMatch(/^Approved · Wed, Aug 19, 2026/);
  });

  it("retains an open cancellation when refreshed history omits its request and disables submission", async () => {
    const approved = {...fixture.requests.find(request=>request.kind === "time_off")!,status:"approved" as const,can_cancel:false,
      cancellation:{parent_request_id:null,parent_revision:null,pending_request_id:null,has_completed_cancellation:false,can_request:true},
      periods:[{id:"af9c0000-0000-4000-8000-000000000001",segment_date:"2035-01-15",start_time:"09:00",end_time:"17:00",status:"approved" as const,time_timezone:"UTC",
        effective_intervals:[{start_at:"2035-01-15T09:00:00Z",end_at:"2035-01-15T17:00:00Z"}]}]};
    const model = {...fixture,requests:[approved]};
    const {client} = renderPageWithFixture(model,"/app/employee-hub/my-availability?section=time-off");
    fireEvent.click(await screen.findByRole("button",{name:"Request leave cancellation"}));
    fireEvent.change(screen.getByLabelText("Cancellation note"),{target:{value:"Keep this explanation"}});
    const changed = {...model,requests:[]}; vi.mocked(getEmployeeHub).mockResolvedValue(changed);
    act(()=>client.setQueriesData({queryKey:["employee-hub",workspaceId]},changed));
    await screen.findByText(/The approved leave changed. Close this form/);
    expect(screen.getByLabelText("Cancellation note")).toHaveProperty("value","Keep this explanation");
    expect(screen.getByRole("button",{name:"Send cancellation request"})).toHaveProperty("disabled",true);
    fireEvent.click(screen.getByRole("button",{name:"Keep approved leave"}));
    await screen.findByText("No time off requests submitted yet.");
    expect(actOnEmployeeRequest).not.toHaveBeenCalled();
  });

  it("submits full-day, custom-hour and overnight dates as one run of days", async () => {
    vi.mocked(loadWeeklyPreferences).mockResolvedValue({...(await loadWeeklyPreferences(workspaceId)),shift_types:[{id:"night",name:"Night",start_time:"23:00",end_time:"02:00",archived:false,selectable:true}]});
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"),{target:{value:"2035-01-15"}});
    fireEvent.change(screen.getByLabelText("End"),{target:{value:"2035-01-18"}});
    fireEvent.change(screen.getByLabelText("Requested time"),{target:{value:"per_date"}});
    fireEvent.change(screen.getByLabelText("Requested time on 2035-01-16"),{target:{value:"hours"}});
    fireEvent.change(screen.getByLabelText("Time off start 1 on 2035-01-16"),{target:{value:"10:00 AM"}});
    fireEvent.change(screen.getByLabelText("Time off end 1 on 2035-01-16"),{target:{value:"2:00 PM"}});
    fireEvent.change(screen.getByLabelText("Requested time on 2035-01-17"),{target:{value:"skip"}});
    fireEvent.change(screen.getByLabelText("Requested time on 2035-01-18"),{target:{value:"hours"}});
    fireEvent.change(screen.getByLabelText("Time off hours from shift type on 2035-01-18"),{target:{value:"night"}});
    // Rule 19: one run of days in a row; a skipped middle day breaks it.
    expect(screen.getByRole("alert").textContent).toBe("A request is one run of days in a row.");
    expect(screen.getByRole("button",{name:"Submit request"})).toHaveProperty("disabled",true);
    fireEvent.change(screen.getByLabelText("Requested time on 2035-01-17"),{target:{value:"full_day"}});
    fireEvent.click(screen.getByRole("button",{name:"Submit request"}));
    await waitFor(()=>expect(submitTimeOff).toHaveBeenCalledWith(workspaceId,expect.objectContaining({
      expected_timezone:"America/Los_Angeles",periods:[
        {segment_date:"2035-01-15",start_time:null,end_time:null,ends_next_day:false},
        {segment_date:"2035-01-16",start_time:"10:00",end_time:"14:00",ends_next_day:false},
        {segment_date:"2035-01-17",start_time:null,end_time:null,ends_next_day:false},
        {segment_date:"2035-01-18",start_time:"23:00",end_time:"02:00",ends_next_day:true},
      ],
    })));
  });

  it("keeps per-date edits when the date range or bulk time choice changes", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"),{target:{value:"2035-01-15"}});
    fireEvent.change(screen.getByLabelText("End"),{target:{value:"2035-01-16"}});
    fireEvent.change(screen.getByLabelText("Requested time"),{target:{value:"hours"}});
    fireEvent.change(screen.getByLabelText("Time off start 1"),{target:{value:"10:15 AM"}});
    fireEvent.change(screen.getByLabelText("Requested time"),{target:{value:"per_date"}});
    expect(screen.getByLabelText("Time off start 1 on 2035-01-16")).toHaveProperty("value","10:15 AM");
    fireEvent.change(screen.getByLabelText("Time off start 1 on 2035-01-15"),{target:{value:"11:30 AM"}});
    fireEvent.change(screen.getByLabelText("Requested time"),{target:{value:"full_day"}});
    expect(screen.getByText(/Your per-date edits are kept/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Requested time"),{target:{value:"per_date"}});
    fireEvent.change(screen.getByLabelText("Start"),{target:{value:"2035-01-16"}});
    expect(screen.getByText(/Some customized dates are outside this range/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Start"),{target:{value:"2035-01-15"}});
    expect(screen.getByLabelText("Time off start 1 on 2035-01-15")).toHaveProperty("value","11:30 AM");
    expect(screen.getByLabelText("Time off start 1 on 2035-01-16")).toHaveProperty("value","10:15 AM");
    expect(submitTimeOff).not.toHaveBeenCalled();
  });

  it("rejects an oversized range even when skipping one date would disguise truncation", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"),{target:{value:"2035-01-01"}});
    fireEvent.change(screen.getByLabelText("Requested time"),{target:{value:"per_date"}});
    fireEvent.change(screen.getByLabelText("Requested time on 2035-01-01"),{target:{value:"skip"}});
    expect(screen.getByRole("button",{name:"Submit request"})).toHaveProperty("disabled",true);
    fireEvent.change(screen.getByLabelText("End"),{target:{value:"2035-02-01"}});
    expect(screen.getByText(/No dates will be silently omitted/)).toBeTruthy();
    expect(screen.getByRole("button",{name:"Submit request"})).toHaveProperty("disabled",true);
    fireEvent.submit(screen.getByRole("button",{name:"Submit request"}).closest("form")!);
    await screen.findByText("Choose a date range of at most 31 calendar days.");
    expect(submitTimeOff).not.toHaveBeenCalled();
  });

  it("submits explicit date segments for time off", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), {
      target: { value: "2035-08-30" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "2035-08-31" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit request" }).closest("form")!,
    );
    await waitFor(() =>
      expect(submitTimeOff).toHaveBeenCalledWith(workspaceId, {
        reason: "",
        operation_id: expect.any(String),
        expected_timezone: "America/Los_Angeles",
        periods: [
          { segment_date: "2035-08-30", start_time: null, end_time: null, ends_next_day: false },
          { segment_date: "2035-08-31", start_time: null, end_time: null, ends_next_day: false },
        ],
      }),
    );
  });

  it("submits exact overnight hours and reuses the operation key after a network failure", async () => {
    vi.mocked(submitTimeOff).mockRejectedValueOnce(new Error("Connection lost"));
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    fireEvent.change(screen.getByLabelText("Requested time"), { target: { value: "hours" } });
    fireEvent.change(screen.getByLabelText("Time off start 1"), { target: { value: "11:00:01 PM" } });
    fireEvent.change(screen.getByLabelText("Time off end 1"), { target: { value: "2:00:02 AM" } });
    expect((screen.getByRole("button", { name: "Submit request" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Ends the next day (+1 day)"));
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await screen.findByText("Connection lost");
    const first = vi.mocked(submitTimeOff).mock.calls.at(-1)?.[1];
    expect(first?.periods).toEqual([{ segment_date: "2035-01-15", start_time: "23:00:01", end_time: "02:00:02", ends_next_day: true }]);
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitTimeOff).toHaveBeenCalledTimes(2));
    expect(vi.mocked(submitTimeOff).mock.calls[1]?.[1].operation_id).toBe(first?.operation_id);
  });

  it("does not submit a silently truncated date range or unfinished hours", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-01" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2035-02-01" } });
    expect((screen.getByRole("button", { name: "Submit request" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2035-01-01" } });
    fireEvent.change(screen.getByLabelText("Requested time"), { target: { value: "hours" } });
    fireEvent.change(screen.getByLabelText("Time off start 1"), { target: { value: "1:" } });
    expect((screen.getByRole("button", { name: "Submit request" }) as HTMLButtonElement).disabled).toBe(true);
    expect(submitTimeOff).not.toHaveBeenCalled();
  });

  it("asks for no location and sends the hours in the employee's zone (FB-6.3.6)", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    expect(screen.queryByLabelText("Location")).toBeNull();
    expect(screen.getByText("Hours use Los Angeles time.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitTimeOff).toHaveBeenCalledOnce());
    expect(vi.mocked(submitTimeOff).mock.calls[0]![1]).not.toHaveProperty("location_id");
    expect((await screen.findByRole("status")).textContent).toBe("Request sent.");
  });
  // UI-FIELDMSG-2 (Mert 2026-10-18): two reasons that hold at once are both said, none dropped.
  it("says both that the range is over 31 days and that the time off has already started", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    const today = todayIn("America/Los_Angeles");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: today } });
    const later = new Date(`${today}T12:00:00Z`);
    later.setUTCDate(later.getUTCDate() + 40);
    fireEvent.change(screen.getByLabelText("End"), { target: { value: later.toISOString().slice(0, 10) } });
    const note = document.getElementById("time-off-check-error")!;
    expect(note.textContent).toContain("Choose a date range of at most 31 calendar days. No dates will be silently omitted.");
    expect(note.textContent).toContain("This time off has already started. Talk to your manager directly.");
    expect(screen.getByRole("button", { name: "Submit request" })).toHaveProperty("disabled", true);
  });
  it("does not send time off that has already started (rule 19)", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: todayIn("America/Los_Angeles") } });
    expect(screen.getByRole("alert").textContent).toBe("This time off has already started. Talk to your manager directly.");
    expect(screen.getByRole("button", { name: "Submit request" })).toHaveProperty("disabled", true);
    fireEvent.submit(screen.getByRole("button", { name: "Submit request" }).closest("form")!);
    await waitFor(() => expect(screen.getAllByText(/already started/).length).toBe(2));
    expect(submitTimeOff).not.toHaveBeenCalled();
  });
  it("says only that the request was sent: the starts-soon warning comes before sending (rule 16)", async () => {
    // Decide-by equal to the start: midnight Jan 15 in Los Angeles.
    vi.mocked(submitTimeOff).mockResolvedValueOnce({ status: "pending", request_id: "98300000-0000-4000-8000-000000000001", revision: 1, decide_by: "2035-01-15T08:00:00Z" });
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(screen.getByText(/^Request sent/)).toBeTruthy());
    expect(screen.getByText(/^Request sent/).textContent).toBe("Request sent.");
  });
  it("asks in the primary location's zone the hub names", async () => {
    renderPageWithFixture({ ...fixture, time_off_timezone: "America/New_York" }, "/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    expect(screen.getByText("Hours use New York time.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitTimeOff).toHaveBeenCalledWith(workspaceId, expect.objectContaining({ expected_timezone: "America/New_York" })));
  });
  it("warns before sending time off that starts inside the decision window (rule 16)", async () => {
    renderPageWithFixture({ ...fixture, settings: { ...fixture.settings, time_off_lead_hours: 24 } }, "/app/employee-hub/my-availability?section=time-off");
    const tomorrow = new Date(Date.parse(todayIn("America/Los_Angeles") + "T12:00:00Z") + 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: tomorrow } });
    // A live region, so a screen reader hears the warning when it appears.
    expect(screen.getByText("This starts soon. Talk to your manager directly if it's urgent.").getAttribute("role")).toBe("status");
    expect(screen.getByRole("button", { name: "Submit request" })).toHaveProperty("disabled", false);
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2035-01-15" } });
    expect(screen.queryByText(/This starts soon/)).toBeNull();
  });
  it("shows a pending request as Pending with its decision time in the request's zone, named, on any device (FB-6.3.8d)", async () => {
    // Asked from Istanbul; the phone may be anywhere.
    const pending = { ...fixture.requests.find(request => request.kind === "time_off")!, status: "pending", display_status: "Pending", decide_by: "2035-01-14T17:00:00Z",
      periods: [{ id: "af9c0000-0000-4000-8000-000000000002", segment_date: "2035-01-15", start_time: null, end_time: null, status: "pending" as const, time_timezone: "Europe/Istanbul" }] };
    for (const device of ["America/Los_Angeles", "Asia/Tokyo"]) {
      await inDeviceZone(device, async () => {
        const view = renderPageWithFixture({ ...fixture, requests: [pending] }, "/app/employee-hub/my-availability?section=time-off");
        const line = await screen.findByText(/^Pending · Submitted .* · Decision by /);
        expect(plain(line.textContent)).toMatch(/ · Decision by Jan 14, 8:00 PM Istanbul time$/);
        view.unmount();
      });
    }
  });

  it("copies overnight shift-type hours into an explicit time-off period", async () => {
    vi.mocked(loadWeeklyPreferences).mockResolvedValue({
      ...(await loadWeeklyPreferences(workspaceId)),
      shift_types: [{ id: "night", name: "Night", start_time: "23:00", end_time: "02:00", archived: false, selectable: true }],
    });
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    fireEvent.change(screen.getByLabelText("Requested time"), { target: { value: "hours" } });
    fireEvent.change(await screen.findByLabelText("Time off hours from shift type"), { target: { value: "night" } });
    expect((screen.getByLabelText("Ends the next day (+1 day)") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitTimeOff).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
      periods: [{ segment_date: "2035-01-15", start_time: "23:00", end_time: "02:00", ends_next_day: true }],
    })));
  });

  it("shows submitted time off requests and sends revision-guarded cancel", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    expect(
      await screen.findByRole("heading", { name: "Time off requests" }),
    ).toBeTruthy();
    expect(screen.getByText("Aug 30 - Aug 31 · Main Dining")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    await waitFor(() =>
      expect(actOnEmployeeRequest).toHaveBeenCalledWith(workspaceId, {
        request_id: "98200000-0000-4000-8000-000000000003",
        kind: "time_off",
        action: "cancel",
        expected_revision: 3,
      }),
    );
  });

  // BL-1043: a request decided meanwhile says so in the page's words and
  // reloads, instead of the server's "stale time off request".
  it("reloads and says the request changed when the database says so", async () => {
    vi.mocked(actOnEmployeeRequest).mockRejectedValueOnce(new RequestError("stale time off request", "time_off.changed", undefined, 409));
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    const reads = vi.mocked(getEmployeeHub).mock.calls.length;
    expect((await screen.findByRole("alert")).textContent).toBe("This request changed. Review it again.");
    await waitFor(() => expect(vi.mocked(getEmployeeHub).mock.calls.length).toBeGreaterThan(reads));
  });
});

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses Employee Hub (FB-6.1.9)", async () => {
    vi.mocked(getEmployeeHub).mockRejectedValueOnce(new RequestError("Forbidden", "authz.missing_permission", undefined, 403));
    renderPage();
    expect(await screen.findByRole("heading", { name: "You don't have access to Employee Hub" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" })).toBeTruthy();
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});
