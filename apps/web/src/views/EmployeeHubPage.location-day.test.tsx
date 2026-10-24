import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, EmployeeHubReadModel, ScheduleReadModel } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeHubPage } from "./EmployeeHubPage";
import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { getEmployeeHub, getEmployeeScheduleBoard } from "../employee-hub/employee-hub-data";
import { getAnnouncements } from "../communications/communications-data";
import { useMyLineups } from "../schedule/lineup-data";

// S-226: an employee's "today" is her primary location's day, whatever the device's clock reads.
const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const locationId = "11000000-0000-4000-8000-000000000001";
const employeeId = "15000000-0000-4000-8000-000000000001";
const { context } = vi.hoisted(() => ({
  context: {
    userId: "98000000-0000-4000-8000-000000000001",
    workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", name: "Meyhouse", logo_url: null, logo_file_name: null, logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 } },
    membership: { id: "98100000-0000-4000-8000-000000000001", userId: "98000000-0000-4000-8000-000000000001",
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", access: { employee: true, management: null }, status: "active" },
    permissions: ["workspace.read", "schedule.read"],
    actions: [],
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  } as ActiveWorkspaceContext,
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../availability/availability-data", () => ({ loadWeeklyPreferences: vi.fn(), saveWeeklyPreferences: vi.fn() }));
vi.mock("../employee-hub/shift-exchanges/exchange-data", () => ({
  getExchanges: vi.fn(), getExchangeCandidates: vi.fn(), getExchangePreview: vi.fn(),
  changeExchange: vi.fn(), refreshExchangeSurfaces: vi.fn(), ExchangeError: class extends Error {},
}));
vi.mock("../communications/communications-data", () => ({ getAnnouncements: vi.fn() }));
vi.mock("../employee-hub/employee-hub-data", () => ({
  getEmployeePersonalTasks: vi.fn().mockResolvedValue([]),
  changeEmployeePersonalTask: vi.fn().mockResolvedValue([]),
  getEmployeeHub: vi.fn(),
  getEmployeeScheduleBoard: vi.fn(),
}));
vi.mock("../schedule/lineup-data", async (original) => ({
  ...(await original<object>()),
  useMyLineups: vi.fn(() => ({ data: { lineups: [] }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() })),
}));

const istanbul = "Europe/Istanbul";
const hub = {
  workspace_id: workspaceId,
  settings: { time_format: "12h" },
  time_off_timezone: istanbul,
  employee: { id: employeeId, display_name: "Alex Kim" },
  locations: [{ id: locationId, name: "Kadikoy", timezone: istanbul }],
  shifts: [],
  open_shifts: [],
  team_shifts: [],
  team: [],
  leave_days: [],
} satisfies EmployeeHubReadModel;
const board = {
  workspace_id: workspaceId,
  week_start: "2026-08-24",
  week_start_day: "monday",
  settings: { time_format: "12h" },
  locations: [{ id: locationId, name: "Kadikoy", timezone: istanbul, sort_order: 1, publication_status: "published", published_at: "2026-08-20T12:00:00Z" }],
  departments: [],
  jobs: [],
  shift_types: [],
  shift_labels: [],
  employees: [{ id: employeeId, employee_code: "E-0001", display_name: "Alex Kim", location_ids: [locationId], job_ids: [] }],
  shifts: [],
  referenced_jobs: [],
  referenced_shift_types: [],
  closures: [],
  important_dates: [],
} satisfies ScheduleReadModel;

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <EmployeeHubPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const exchangesFrom = () => vi.mocked(getExchanges).mock.calls.map(([, , range]) => range?.from);

describe("Employee Hub's today on a device in another zone (S-226)", () => {
  const before = process.env.TZ;
  beforeEach(() => {
    vi.clearAllMocks();
    // 11:30 PM Tuesday in California is 9:30 AM Wednesday in Istanbul.
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-26T06:30:00Z"));
    vi.mocked(getEmployeeHub).mockResolvedValue(hub);
    vi.mocked(getEmployeeScheduleBoard).mockResolvedValue(board);
    vi.mocked(getExchanges).mockResolvedValue({ employee_id: employeeId, cases: [], own_shifts: [], opportunities: [] });
    vi.mocked(getAnnouncements).mockResolvedValue({
      workspace_id: workspaceId, can_manage: false, can_write_dates: false, can_read_dates: false, time_format: "12h",
      locations: [], people: [], departments: [], jobs: [], announcements: [],
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  });

  it("marks Wednesday as Today on My shifts and asks for Wednesday's week and pool", async () => {
    const view = renderAt("/app/employee-hub/schedule");
    const thisWeek = await screen.findByRole("tabpanel", { name: "This week" });
    expect(thisWeek.querySelector('[data-day="2026-08-26"]')?.classList.contains("today")).toBe(true);
    expect(thisWeek.querySelector('[data-day="2026-08-25"]')?.classList.contains("today")).toBe(false);
    expect(getEmployeeScheduleBoard).toHaveBeenCalledWith(workspaceId, "2026-08-26");
    expect(getEmployeeScheduleBoard).not.toHaveBeenCalledWith(workspaceId, "2026-08-25");
    await waitFor(() => expect(exchangesFrom()).toContain("2026-08-26"));
    expect(exchangesFrom()).not.toContain("2026-08-25");
    view.unmount();
  });

  // Only Home tells a device in another zone whose clock the pages keep; the pages under it say nothing
  // (Mert 2026-10-23, narrowing S-226 (3)).
  it.each(["schedule", "schedule/team", "schedule/lineup", "shift-hub", "my-availability"])(
    "says nothing about the zone on %s, though the device keeps another zone's clock",
    async (path) => {
      renderAt(`/app/employee-hub/${path}`);
      await waitFor(() => expect(document.getElementById("employee-hub-title")).not.toBeNull());
      expect(document.querySelector(".zone-note")).toBeNull();
      expect(screen.queryByText(/^Times in /)).toBeNull();
    },
  );

  it("says nothing about the zone on Home on a device that keeps the location's clock", async () => {
    vi.mocked(getEmployeeHub).mockResolvedValue({ ...hub, time_off_timezone: "America/Los_Angeles",
      locations: [{ ...hub.locations[0]!, timezone: "America/Los_Angeles" }] });
    renderAt("/app/employee-hub");
    await waitFor(() => expect(document.querySelector(".dl-hero")).not.toBeNull());
    expect(document.querySelector(".zone-note")).toBeNull();
  });

  it("opens Team schedule on Wednesday", async () => {
    renderAt("/app/employee-hub/schedule/team");
    await waitFor(() => expect(getEmployeeScheduleBoard).toHaveBeenCalled());
    expect(vi.mocked(getEmployeeScheduleBoard).mock.calls.map(([, date]) => date)).toEqual(["2026-08-26"]);
  });

  it("lists Shift Hub from Wednesday", async () => {
    renderAt("/app/employee-hub/shift-hub");
    await waitFor(() => expect(getExchanges).toHaveBeenCalled());
    expect(exchangesFrom()).toEqual(expect.arrayContaining(["2026-08-26"]));
    expect(exchangesFrom()).not.toContain("2026-08-25");
  });

  it("opens Lineup on Wednesday", async () => {
    renderAt("/app/employee-hub/schedule/lineup");
    await waitFor(() => expect(useMyLineups).toHaveBeenCalled());
    expect(vi.mocked(useMyLineups).mock.calls.map(([, date]) => date)).not.toContain("2026-08-25");
    expect(useMyLineups).toHaveBeenCalledWith(workspaceId, "2026-08-26");
  });

  it("asks Home's pick-up pool from Wednesday, the primary location's day, not the first location's", async () => {
    vi.mocked(getEmployeeHub).mockResolvedValue({
      ...hub,
      locations: [{ id: "11000000-0000-4000-8000-000000000002", name: "Santa Monica", timezone: "America/Los_Angeles" }, ...hub.locations],
    });
    renderAt("/app/employee-hub");
    await waitFor(() => expect(getExchanges).toHaveBeenCalled());
    expect(exchangesFrom().filter(Boolean)).toEqual(["2026-08-26"]);
    expect(document.querySelector(".dl-hero .zone-note")?.textContent).toMatch(/^Times in (Türkiye|Turkey)/);
  });
});
