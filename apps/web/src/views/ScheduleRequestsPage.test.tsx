import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ScheduleRequestsReadModel,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ScheduleRequestsPage } from "./ScheduleRequestsPage";
import { decideTimeOff } from "../schedule/requests-data";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
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
    role: "owner",
    status: "active",
    allLocations: true,
  },
  permissions: [
    "workspace.read",
    "schedule.read",
    "schedule.time_off_requests.read",
    "schedule.time_off_requests.manage",
    "schedule.shift_change_requests.read",
    "schedule.shift_change_requests.manage",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const fixture = {
  workspace_id: workspaceId,
  locations: [
    { id: "11000000-0000-4000-8000-000000000001", name: "Main Dining" },
  ],
  time_off_pending_count: 1,
  shift_change_pending_count: 1,
  time_off_next_cursor: null,
  shift_change_next_cursor: null,
  time_off_requests: [
    {
      id: "97200000-0000-4000-8000-000000000001",
      employee_id: "15000000-0000-4000-8000-000000000001",
      employee_name: "Alex Kim",
      location_id: "11000000-0000-4000-8000-000000000001",
      location_name: "Main Dining",
      request_type: "time_off",
      reason: "Family appointment",
      status: "pending",
      start_date: "2026-08-17",
      end_date: "2026-08-18",
      revision: 1,
      viewed_at: "2026-08-17T12:00:00.000Z",
      created_at: "2026-08-17T11:00:00.000Z",
      conflict_count: 1,
      segments: [
        {
          id: "97300000-0000-4000-8000-000000000001",
          segment_date: "2026-08-17",
          start_time: null,
          end_time: null,
          status: "pending",
        },
        {
          id: "97300000-0000-4000-8000-000000000002",
          segment_date: "2026-08-18",
          start_time: null,
          end_time: null,
          status: "pending",
        },
      ],
      events: [],
    },
  ],
  shift_change_requests: [
    {
      id: "97400000-0000-4000-8000-000000000001",
      request_type: "direct_coverage",
      status: "pending_manager_approval",
      revision: 1,
      note: "Coverage request",
      created_at: "2026-08-17T11:00:00.000Z",
      offered_shift: {
        id: "22000000-0000-4000-8000-000000000005",
        location_id: "11000000-0000-4000-8000-000000000001",
        location_name: "Main Dining",
        scheduled_date: "2026-08-22",
        start_time: "18:00:00",
        end_time: "02:00:00",
        employee_id: null,
        employee_name: null,
        job_name: "Server",
      },
      requested_shift: null,
      participants: [
        {
          employee_id: "15000000-0000-4000-8000-000000000002",
          employee_name: "Jordy Lee",
          role: "requester",
        },
        {
          employee_id: "15000000-0000-4000-8000-000000000002",
          employee_name: "Jordy Lee",
          role: "receiver",
        },
      ],
      conflicts: [
        {
          code: "approved_time_off",
          severity: "hard",
          message: "The receiving employee has approved time off.",
        },
      ],
      events: [],
    },
  ],
} satisfies ScheduleRequestsReadModel;

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ context }),
}));
vi.mock("../schedule/requests-data", () => ({
  getScheduleRequests: vi.fn().mockImplementation(async () => fixture),
  markTimeOffViewed: vi.fn().mockResolvedValue({
    status: "viewed",
    request_id: "97200000-0000-4000-8000-000000000001",
    revision: 1,
  }),
  decideTimeOff: vi.fn().mockResolvedValue({
    status: "partially_approved",
    request_id: "97200000-0000-4000-8000-000000000001",
    revision: 2,
  }),
  decideShiftChange: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/schedule/requests"]}>
        <ScheduleRequestsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ScheduleRequestsPage", () => {
  it("submits explicit partial decisions and blocks hard-conflict approval", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Schedule Requests" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Partial" }));
    const segmentChoices = screen.getAllByRole("combobox");
    fireEvent.change(segmentChoices.at(-1)!, { target: { value: "denied" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save Partial Decision" }),
    );
    await waitFor(() =>
      expect(decideTimeOff).toHaveBeenCalledWith(
        workspaceId,
        "97200000-0000-4000-8000-000000000001",
        expect.objectContaining({
          expected_revision: 1,
          action: "partial_approve",
          segment_decisions: [
            {
              segment_id: "97300000-0000-4000-8000-000000000001",
              status: "approved",
            },
            {
              segment_id: "97300000-0000-4000-8000-000000000002",
              status: "denied",
            },
          ],
        }),
      ),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Shift changes/ }));
    expect(
      await screen.findByText("The receiving employee has approved time off."),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
