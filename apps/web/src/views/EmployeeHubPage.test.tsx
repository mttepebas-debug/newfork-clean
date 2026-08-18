import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  EmployeeHubReadModel,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { EmployeeHubPage } from "./EmployeeHubPage";
import {
  captureEmployeeTimeEvent,
  getEmployeeHub,
  getEmployeeTimeTracking,
  requestEmployeeTimeCorrection,
  submitEmployeeShiftRequest,
  submitEmployeeTimeOff,
} from "../employee-hub/employee-hub-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const { context } = vi.hoisted(() => ({
  context: {
    userId: "98000000-0000-4000-8000-000000000001",
    workspace: { id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", name: "Meyhouse" },
    membership: {
      id: "98100000-0000-4000-8000-000000000001",
      userId: "98000000-0000-4000-8000-000000000001",
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      role: "employee",
      status: "active",
      allLocations: true,
    },
    permissions: ["workspace.read", "schedule.read"],
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
  employee: {
    id: "15000000-0000-4000-8000-000000000001",
    display_name: "Alex Kim",
  },
  locations: [
    { id: "11000000-0000-4000-8000-000000000001", name: "Main Dining" },
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
      id: "98200000-0000-4000-8000-000000000001",
      shift_id: "22000000-0000-4000-8000-000000000001",
      kind: "swap",
      status: "awaiting teammate",
      title: "Shift swap",
      detail: "Aug 24",
      revision: 1,
      created_at: "2026-08-17T12:00:00Z",
      can_cancel: true,
      can_respond: false,
    },
  ],
  availability: null,
  team: [
    {
      id: "15000000-0000-4000-8000-000000000002",
      display_name: "Jordy Lee",
      job_names: ["Bartender"],
      location_names: ["Main Dining"],
    },
  ],
  lineup: [],
} satisfies EmployeeHubReadModel;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../employee-hub/employee-hub-data", () => ({
  getEmployeeHub: vi.fn(),
  saveEmployeeAvailability: vi
    .fn()
    .mockResolvedValue({ status: "saved", revision: 2 }),
  submitEmployeeTimeOff: vi.fn().mockResolvedValue({
    status: "pending",
    request_id: "98300000-0000-4000-8000-000000000001",
    revision: 1,
  }),
  submitEmployeeShiftRequest: vi.fn().mockResolvedValue({
    status: "pending_manager_approval",
    request_id: "98300000-0000-4000-8000-000000000002",
    revision: 1,
  }),
  actOnEmployeeRequest: vi.fn(),
  getEmployeeTimeTracking: vi.fn(),
  captureEmployeeTimeEvent: vi.fn().mockResolvedValue({}),
  requestEmployeeTimeCorrection: vi.fn().mockResolvedValue({}),
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

describe("EmployeeHubPage", () => {
  it("keeps the landing focused on next shift and open actions", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Employee Hub" }),
    ).toBeTruthy();
    expect(screen.getByText("Next shift")).toBeTruthy();
    expect(screen.getByText("Open actions")).toBeTruthy();
    expect(screen.getByText("Shift swap")).toBeTruthy();
  });

  it("submits open shift pickup from Shift Hub", async () => {
    renderPage("/app/employee-hub/shift-hub");
    fireEvent.click(
      await screen.findByRole("button", { name: "Request shift" }),
    );
    await waitFor(() =>
      expect(submitEmployeeShiftRequest).toHaveBeenCalledWith(workspaceId, {
        action: "pickup",
        shift_id: "22000000-0000-4000-8000-000000000005",
        note: "",
      }),
    );
  });

  it("submits explicit date segments for time off", async () => {
    renderPage("/app/employee-hub/my-availability");
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
        dates: ["2026-08-30", "2026-08-31"],
      }),
    );
  });

  it("records clock in from the Time Tracking view", async () => {
    vi.mocked(getEmployeeTimeTracking).mockResolvedValue({
      workspace_id: workspaceId,
      employee: fixture.employee,
      locations: [
        {
          id: "11000000-0000-4000-8000-000000000001",
          name: "Main Dining",
          timezone: "America/Los_Angeles",
        },
      ],
      current_session: null,
      sessions: [],
    });
    renderPage("/app/employee-hub/time-tracking");
    fireEvent.click(await screen.findByRole("button", { name: "Clock in" }));
    await waitFor(() =>
      expect(captureEmployeeTimeEvent).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          location_id: "11000000-0000-4000-8000-000000000001",
          session_id: null,
          event_type: "clock_in",
        }),
        expect.any(String),
      ),
    );
  });

  it("shows only End break while a break is active", async () => {
    vi.mocked(getEmployeeTimeTracking).mockResolvedValue({
      workspace_id: workspaceId,
      employee: fixture.employee,
      locations: [
        {
          id: "11000000-0000-4000-8000-000000000001",
          name: "Main Dining",
          timezone: "America/Los_Angeles",
        },
      ],
      current_session: {
        id: "a6300000-0000-4000-8000-000000000001",
        workspace_id: workspaceId,
        employee_id: fixture.employee.id,
        location_id: "11000000-0000-4000-8000-000000000001",
        location_name: "Main Dining",
        capture_state: "on_break",
        review_state: "unreviewed",
        started_at: "2026-08-17T16:00:00.000Z",
        ended_at: null,
        effective_started_at: "2026-08-17T16:00:00.000Z",
        effective_ended_at: null,
        last_event_at: "2026-08-17T18:00:00.000Z",
        revision: 2,
        events: [],
        amendments: [],
        correction_requests: [],
      },
      sessions: [],
    });
    renderPage("/app/employee-hub/time-tracking");
    expect(
      await screen.findByRole("button", { name: "End break" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clock out" })).toBeNull();
  });

  it("submits a revision-guarded correction from completed history", async () => {
    vi.mocked(getEmployeeTimeTracking).mockResolvedValue({
      workspace_id: workspaceId,
      employee: fixture.employee,
      locations: [
        {
          id: "11000000-0000-4000-8000-000000000001",
          name: "Main Dining",
          timezone: "America/Los_Angeles",
        },
      ],
      current_session: null,
      sessions: [
        {
          id: "a6300000-0000-4000-8000-000000000002",
          workspace_id: workspaceId,
          employee_id: fixture.employee.id,
          location_id: "11000000-0000-4000-8000-000000000001",
          location_name: "Main Dining",
          capture_state: "complete",
          review_state: "unreviewed",
          started_at: "2026-08-17T16:00:00.000Z",
          ended_at: "2026-08-18T00:00:00.000Z",
          effective_started_at: "2026-08-17T16:00:00.000Z",
          effective_ended_at: "2026-08-18T00:00:00.000Z",
          last_event_at: "2026-08-18T00:00:00.000Z",
          revision: 1,
          events: [],
          amendments: [],
          correction_requests: [],
        },
      ],
    });
    renderPage("/app/employee-hub/time-tracking");
    fireEvent.click(
      await screen.findByRole("button", { name: "Request correction" }),
    );
    fireEvent.input(screen.getByLabelText("Requested start"), {
      target: { value: "2026-08-17T09:15" },
    });
    fireEvent.change(screen.getByLabelText("What should be corrected?"), {
      target: { value: "Clock-in was fifteen minutes later" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() =>
      expect(requestEmployeeTimeCorrection).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          session_id: "a6300000-0000-4000-8000-000000000002",
          expected_revision: 1,
          requested_started_at: "2026-08-17T16:15:00.000Z",
          reason: "Clock-in was fifteen minutes later",
        }),
        expect.any(String),
      ),
    );
  });
});
