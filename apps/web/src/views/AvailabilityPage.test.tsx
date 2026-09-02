import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActiveWorkspaceContext, ScheduleReadModel } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AvailabilityPage } from "./AvailabilityPage";
import { getScheduleReadModel } from "../schedule/schedule-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const mainLocationId = "11000000-0000-4000-8000-000000000001";
const patioLocationId = "11000000-0000-4000-8000-000000000002";
const alexId = "15000000-0000-4000-8000-000000000001";
const jordanId = "15000000-0000-4000-8000-000000000002";

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
    role: "manager",
    status: "active",
    allLocations: true,
  },
  permissions: ["workspace.read", "schedule.read"],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const fixture = {
  workspace_id: workspaceId,
  week_start: "2026-08-17",
  week_start_day: "monday",
  settings: {
    time_format: "12h",
  },
  locations: [
    {
      id: mainLocationId,
      name: "Main Dining",
      timezone: "America/Los_Angeles",
      sort_order: 0,
      publication_status: "published",
      published_at: "2026-08-17T12:00:00.000Z",
    },
    {
      id: patioLocationId,
      name: "Patio",
      timezone: "America/Los_Angeles",
      sort_order: 1,
      publication_status: "published",
      published_at: "2026-08-17T12:00:00.000Z",
    },
  ],
  departments: [],
  jobs: [],
  shift_types: [],
  shift_labels: [],
  employees: [
    {
      id: alexId,
      employee_code: "E-001",
      display_name: "Alex Kim",
      location_ids: [mainLocationId],
      job_ids: [],
      availability: [
        { day: 0, mode: "unrestricted", windows: [] },
        { day: 1, mode: "windows", windows: [{ start: "09:00", end: "17:00" }] },
        { day: 2, mode: "unavailable", windows: [] },
        { day: 3, mode: "unrestricted", windows: [] },
        { day: 4, mode: "unrestricted", windows: [] },
        { day: 5, mode: "unrestricted", windows: [] },
        { day: 6, mode: "unrestricted", windows: [] },
      ],
    },
    {
      id: jordanId,
      employee_code: "E-002",
      display_name: "Jordan Lee",
      location_ids: [patioLocationId],
      job_ids: [],
      availability: null,
    },
  ],
  shifts: [
    {
      id: "22000000-0000-4000-8000-000000000001",
      location_id: mainLocationId,
      employee_id: alexId,
      job_id: "33000000-0000-4000-8000-000000000001",
      shift_type_id: null,
      scheduled_date: "2026-08-18",
      start_time: "10:00",
      end_time: "18:00",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: [],
      note: "",
      warning_codes: ["availability"],
    },
    {
      id: "22000000-0000-4000-8000-000000000002",
      location_id: patioLocationId,
      employee_id: jordanId,
      job_id: "33000000-0000-4000-8000-000000000002",
      shift_type_id: null,
      scheduled_date: "2026-08-19",
      start_time: "12:00",
      end_time: "16:00",
      crosses_midnight: false,
      unpaid_break_minutes: 0,
      hide_time_on_badge: false,
      label_ids: [],
      note: "",
      warning_codes: [],
    },
  ],
  closures: [],
  important_dates: [],
} satisfies ScheduleReadModel;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../schedule/schedule-data", () => ({
  getScheduleReadModel: vi.fn(),
}));

function renderPage(path = "/app/availability?date=2026-08-17") {
  vi.mocked(getScheduleReadModel).mockResolvedValue(fixture);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AvailabilityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AvailabilityPage", () => {
  it("shows manager availability coverage and schedule conflicts", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Availability" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(getScheduleReadModel).toHaveBeenCalledWith(
        workspaceId,
        "2026-08-17",
        "week",
      ),
    );
    expect(await screen.findByText("Alex Kim")).toBeTruthy();
    expect(screen.getByText("Jordan Lee")).toBeTruthy();
    expect(screen.getByText("Missing availability")).toBeTruthy();
    expect(screen.getByText("Schedule conflicts")).toBeTruthy();
    expect(screen.getByText("1 scheduled conflict")).toBeTruthy();
    expect(screen.getByText("Availability not submitted")).toBeTruthy();
  });

  it("filters the board by location", async () => {
    renderPage();
    expect(await screen.findByText("Alex Kim")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location"), {
      target: { value: patioLocationId },
    });
    expect(screen.queryByText("Alex Kim")).toBeNull();
    expect(screen.getByText("Jordan Lee")).toBeTruthy();
  });
});
