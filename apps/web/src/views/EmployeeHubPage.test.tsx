import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { requestAvailabilityNavigation } from "../availability/availability-navigation";
import { loadWeeklyPreferences, previewWeeklyPreferences, saveWeeklyPreferences } from "../availability/availability-data";
vi.mock("../availability/availability-data", () => ({ loadWeeklyPreferences: vi.fn(), previewWeeklyPreferences: vi.fn(), saveWeeklyPreferences: vi.fn() }));
import { changeExchange, getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
vi.mock("../employee-hub/shift-exchanges/exchange-data", () => ({
  getExchanges: vi.fn(), getExchangeCandidates: vi.fn(), getExchangePreview: vi.fn(),
  changeExchange: vi.fn(), refreshExchangeSurfaces: vi.fn(), ExchangeError: class extends Error {},
}));
import {
  getAnnouncements,
  getNotifications,
} from "../communications/communications-data";
import {
  actOnEmployeeRequest,
  getEmployeeHub,
  getEmployeeScheduleBoard,
  getEmployeePersonalTasks,
  changeEmployeePersonalTask,
  submitEmployeeTimeOff,
} from "../employee-hub/employee-hub-data";

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
      role: "employee",
      status: "active",
      allLocations: true,
    },
    permissions: ["workspace.read", "schedule.read"],
    actions: [],
    onboarding: { status: "complete", currentStep: 2 },
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
  settings: { time_format: "12h" },
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
      sort_order: 1,
      department_id: null,
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
  closures: [],
  important_dates: [],
} satisfies ScheduleReadModel;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../communications/communications-data", () => ({
  getAnnouncements: vi.fn(),
  getNotifications: vi.fn(),
}));
vi.mock("../employee-hub/employee-hub-data", () => ({
  getEmployeePersonalTasks: vi.fn().mockResolvedValue([]),
  changeEmployeePersonalTask: vi.fn().mockResolvedValue([]),
  getEmployeeHub: vi.fn(),
  getEmployeeScheduleBoard: vi.fn(),
  submitEmployeeTimeOff: vi.fn().mockResolvedValue({
    status: "pending",
    request_id: "98300000-0000-4000-8000-000000000001",
    revision: 1,
  }),
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
    settings: { input_mode: "time_range", onboarding_required: false, revision: 0 },
    employee: { revision: 0, submitted: false, updated_at: null, preference: emptyWeeklyPreference("time_range") },
  };
}

describe("EmployeeHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(weeklyModel());
    vi.mocked(previewWeeklyPreferences).mockResolvedValue({ items: [] });
    vi.mocked(saveWeeklyPreferences).mockImplementation(async (_workspace, command) => {
      const model = weeklyModel();
      model.employee = { ...model.employee, revision: 1, submitted: true, preference: command.preference };
      vi.mocked(loadWeeklyPreferences).mockResolvedValue(model);
      return { model, finalized: [], kept_count: 0, cancelled_count: 0, resolved_count: 0 };
    });
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: fixture.employee.id, cases: [], own_shifts: [], opportunities: [] });
    context.permissions = ["workspace.read", "schedule.read"];
    vi.mocked(getNotifications).mockResolvedValue({
      workspace_id: workspaceId,
      unread_count: 0,
      next_cursor: null,
      notifications: [],
    });
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId,
      can_manage: false,
      locations: [],
      announcements: [],
    });
    vi.mocked(getEmployeePersonalTasks).mockResolvedValue([]);
    vi.mocked(changeEmployeePersonalTask).mockResolvedValue([]);
  });
  it("lets the employee reach More without loading the schedule service", async () => {
    renderPage("/app/employee-hub/more");
    expect(
      await screen.findByRole("link", { name: /My account/ }),
    ).toBeTruthy();
    expect(getEmployeeHub).not.toHaveBeenCalled();
  });
  it("keeps the daily hub usable if both communication panels fail", async () => {
    context.permissions = [
      ...context.permissions,
      "notifications.read",
      "announcements.read",
    ];
    vi.mocked(getNotifications).mockRejectedValue(
      new Error("Updates unavailable"),
    );
    vi.mocked(getAnnouncements).mockRejectedValue(
      new Error("Notices unavailable"),
    );
    renderPage();
    await waitFor(() =>
      expect(
        screen.getAllByText("This section couldn’t be loaded."),
      ).toHaveLength(2),
    );
    expect(screen.getByRole("link", { name: /My schedule/ })).toBeTruthy();
    expect(screen.getByLabelText("New personal reminder")).toBeTruthy();
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
      await screen.findByText("This section couldn’t be loaded."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /My schedule/ })).toBeTruthy();
  });
  it("shows the published team board and narrows it to My Schedule", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage("/app/employee-hub/schedule?date=2026-08-24");

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
      "/app/employee-hub/schedule?date=2026-08-25&view=day&employees=15000000-0000-4000-8000-000000000001",
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

  it("opens the picked calendar day even from week view", async () => {
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(scheduleBoard);
    renderPage("/app/employee-hub/schedule?date=2026-08-24");

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
    renderPage("/app/employee-hub/schedule?date=2026-08-25&view=day");

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
    renderPage("/app/employee-hub/schedule?date=2026-08-24");

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

  it("greets the employee and separates waiting requests from required responses", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-24T12:00:00Z"));
    try {
      renderPage();
      expect(
        await screen.findByRole("heading", { name: /Good .*Alex/ }),
      ).toBeTruthy();
      expect(screen.getByText("TODAY’S SHIFT")).toBeTruthy();
      expect(screen.getByText("No requests need your response.")).toBeTruthy();
      expect(screen.getByText("1 request awaiting a response")).toBeTruthy();
      expect(
        screen
          .getByRole("link", { name: /^Request time off/ })
          .getAttribute("href"),
      ).toBe("/app/employee-hub/my-availability?section=time-off#time-off");
      expect(screen.getByRole("heading", { name: "Coming up" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("submits open shift pickup from Shift Hub", async () => {
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: fixture.employee.id, cases: [], own_shifts: [], opportunities: [{ case_id: null, eligibility: { status: "eligible", reasons: [] }, shift: {
      ...ownShift, id: "22000000-0000-4000-8000-000000000005", source_id: "22000000-0000-4000-8000-000000000005", employee_id: null, employee_name: null,
      job_id: "13000000-0000-4000-8000-000000000001", scheduled_date: "2030-01-01", timezone: "America/Los_Angeles", starts_at: "2030-01-01T17:00:00Z", ends_at: "2030-01-02T01:00:00Z",
    } }] });
    vi.mocked(changeExchange).mockResolvedValue({ case_id: "98200000-0000-4000-8000-000000000001", status: "open", revision: 2 });
    renderPage("/app/employee-hub/shift-hub?from=2030-01-01&to=2030-01-01");
    fireEvent.click(
      await screen.findByRole("button", { name: "Request to pick up" }),
    );
    await waitFor(() =>
      expect(changeExchange).toHaveBeenCalledWith(workspaceId, {
        action: "apply",
        shift_id: "22000000-0000-4000-8000-000000000005",
      }, expect.any(String)),
    );
  });

  it("opens the current weekly editor by default and saves without approval", async () => {
    renderPage("/app/employee-hub/my-availability");
    const day = await screen.findByRole("switch", { name: "Monday all day unavailable" });
    expect(screen.getByRole("tab", { name: "Availability" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByLabelText("Start")).toBeNull();
    expect(screen.queryByLabelText("Starts on")).toBeNull();
    expect(screen.getByText(/manager may miss the notification/)).toBeTruthy();
    fireEvent.click(day);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveWeeklyPreferences).toHaveBeenCalledWith(workspaceId,
      expect.objectContaining({ source: "employee", employee_id: fixture.employee.id, expected_revision: 0 }),
      expect.any(String), false));
    expect(submitEmployeeTimeOff).not.toHaveBeenCalled();
  });

  it("discards an unsaved weekly draft without a prompt but protects a time-off draft on tab changes", async () => {
    renderPage("/app/employee-hub/my-availability");
    fireEvent.click(await screen.findByRole("switch", { name: "Monday all day unavailable" }));
    fireEvent.click(screen.getByRole("tab", { name: "Time Off Requests" }));
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Availability" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Discard time off changes?");
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByLabelText("Start")).toHaveProperty("value", "2035-01-15");
    fireEvent.click(screen.getByRole("tab", { name: "Availability" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(await screen.findByRole("switch", { name: "Monday all day unavailable" })).toHaveProperty("checked", false);
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
    expect(submitEmployeeTimeOff).not.toHaveBeenCalled();
  });

  it("opens time-off request deep links and keeps time off usable when weekly data fails", async () => {
    vi.mocked(loadWeeklyPreferences).mockRejectedValue(new Error("Weekly unavailable"));
    renderPage("/app/employee-hub/my-availability#request-98200000-0000-4000-8000-000000000003");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitEmployeeTimeOff).toHaveBeenCalledOnce());
  });

  it("preserves time-off drafts before a programmatic departure", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"),{target:{value:"2035-01-15"}});
    fireEvent.change(screen.getByLabelText("Note"),{target:{value:"My leave note"}});
    const navigate = vi.fn();
    act(()=>requestAvailabilityNavigation(navigate));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button",{name:"Stay here"}));
    expect(screen.getByLabelText("Start")).toHaveProperty("value","2035-01-15");
    expect(screen.getByLabelText("Note")).toHaveProperty("value","My leave note");
    act(()=>requestAvailabilityNavigation(navigate));
    fireEvent.click(screen.getByRole("button",{name:"Discard and leave"}));
    expect(navigate).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Note")).toHaveProperty("value","");
    expect(screen.queryByLabelText("Starts on")).toBeNull();
    expect(submitEmployeeTimeOff).not.toHaveBeenCalled();
  });

  it("formats real timestamp values in leave submission and manager decision history", async () => {
    const approved = { ...fixture.requests.find(request => request.kind === "time_off")!, status: "approved" as const, can_cancel: false,
      created_at: "2026-08-18T12:00:00.953541+00:00", decision_events: [{ id: "af9c0000-0000-4000-8000-000000000001", action: "approved", note: "Approval history", created_at: "2026-08-19T12:00:00.441726+00:00", revision: 2 }] };
    renderPageWithFixture({ ...fixture, requests: [approved] }, "/app/employee-hub/my-availability?section=time-off");
    await screen.findByText(/Submitted Tue, Aug 18, 2026/);
    expect(screen.getByText(/Wed, Aug 19, 2026/)).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  it("retains an open cancellation when refreshed history omits its request and disables submission", async () => {
    const approved = {...fixture.requests.find(request=>request.kind === "time_off")!,status:"approved" as const,can_cancel:false,
      cancellation:{parent_request_id:null,parent_revision:null,pending_request_id:null,has_completed_cancellation:false,can_request:true},
      periods:[{id:"af9c0000-0000-4000-8000-000000000001",segment_date:"2035-01-15",start_time:"09:00",end_time:"17:00",status:"approved" as const,time_timezone:"UTC",time_source:"snapshot" as const,
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

  it("submits full-day, custom-hour, skipped and overnight dates in one exact request", async () => {
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
    fireEvent.click(screen.getByRole("button",{name:"Submit request"}));
    await waitFor(()=>expect(submitEmployeeTimeOff).toHaveBeenCalledWith(workspaceId,expect.objectContaining({
      expected_timezone:"America/Los_Angeles",periods:[
        {segment_date:"2035-01-15",start_time:null,end_time:null,ends_next_day:false},
        {segment_date:"2035-01-16",start_time:"10:00",end_time:"14:00",ends_next_day:false},
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
    expect(submitEmployeeTimeOff).not.toHaveBeenCalled();
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
    expect(submitEmployeeTimeOff).not.toHaveBeenCalled();
  });

  it("submits explicit date segments for time off", async () => {
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), {
      target: { value: "2026-08-30" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "2026-08-31" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit request" }).closest("form")!,
    );
    await waitFor(() =>
      expect(submitEmployeeTimeOff).toHaveBeenCalledWith(workspaceId, {
        location_id: "11000000-0000-4000-8000-000000000001",
        reason: "",
        request_id: expect.any(String),
        expected_timezone: "America/Los_Angeles",
        periods: [
          { segment_date: "2026-08-30", start_time: null, end_time: null, ends_next_day: false },
          { segment_date: "2026-08-31", start_time: null, end_time: null, ends_next_day: false },
        ],
      }),
    );
  });

  it("submits exact overnight hours and reuses the operation key after a network failure", async () => {
    vi.mocked(submitEmployeeTimeOff).mockRejectedValueOnce(new Error("Connection lost"));
    renderPage("/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    fireEvent.change(screen.getByLabelText("Requested time"), { target: { value: "hours" } });
    fireEvent.change(screen.getByLabelText("Time off start 1"), { target: { value: "11:00:01 PM" } });
    fireEvent.change(screen.getByLabelText("Time off end 1"), { target: { value: "2:00:02 AM" } });
    expect((screen.getByRole("button", { name: "Submit request" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Ends the next day (+1 day)"));
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await screen.findByText("Connection lost");
    const first = vi.mocked(submitEmployeeTimeOff).mock.calls.at(-1)?.[1];
    expect(first?.periods).toEqual([{ segment_date: "2035-01-15", start_time: "23:00:01", end_time: "02:00:02", ends_next_day: true }]);
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitEmployeeTimeOff).toHaveBeenCalledTimes(2));
    expect(vi.mocked(submitEmployeeTimeOff).mock.calls[1]?.[1].request_id).toBe(first?.request_id);
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
    expect(submitEmployeeTimeOff).not.toHaveBeenCalled();
  });

  it("preserves entered hours and requires review when the location time zone changes", async () => {
    const { client } = renderPageWithFixture(fixture, "/app/employee-hub/my-availability?section=time-off");
    fireEvent.change(await screen.findByLabelText("Start"), { target: { value: "2035-01-15" } });
    fireEvent.change(screen.getByLabelText("Requested time"), { target: { value: "hours" } });
    fireEvent.change(screen.getByLabelText("Time off start 1"), { target: { value: "10:15 AM" } });
    const updated = { ...fixture, locations: [{ ...fixture.locations[0]!, timezone: "America/New_York" }] };
    vi.mocked(getEmployeeHub).mockResolvedValue(updated);
    act(() => { client.setQueriesData({ queryKey: ["employee-hub", workspaceId] }, updated); });
    await screen.findByText(/The location time zone changed from America\/Los_Angeles to America\/New_York/);
    expect((screen.getByLabelText("Time off start 1") as HTMLInputElement).value).toBe("10:15 AM");
    expect((screen.getByRole("button", { name: "Submit request" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use current location time zone" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(submitEmployeeTimeOff).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
      expected_timezone: "America/New_York",
      periods: [{ segment_date: "2035-01-15", start_time: "10:15", end_time: "17:00", ends_next_day: false }],
    })));
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
    await waitFor(() => expect(submitEmployeeTimeOff).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
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
});
