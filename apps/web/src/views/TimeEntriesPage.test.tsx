import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  ActiveWorkspaceContext,
  ManagerTimeEntriesReadModel,
} from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  amendManagerTimeEntry,
  createManagerManualTimeEntry,
  getManagerTimeEntries,
  decideTimeCorrection,
  approveTimeReviewWindow,
} from "../time-entries/time-entries-data";
import { TimeEntriesPage } from "./TimeEntriesPage";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const context = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: { id: workspaceId, name: "Meyhouse" },
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
    "time.read.location",
    "time.amend.location",
    "time.correction.review.location",
    "time.review.approve.location",
  ],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const session = {
  id: "b6200000-0000-4000-8000-000000000001",
  workspace_id: workspaceId,
  employee_id: "15000000-0000-4000-8000-000000000001",
  location_id: "11000000-0000-4000-8000-000000000001",
  capture_state: "complete",
  review_state: "unreviewed",
  started_at: "2026-08-17T16:00:00.000Z",
  ended_at: "2026-08-18T00:00:00.000Z",
  effective_started_at: "2026-08-17T16:15:00.000Z",
  effective_ended_at: "2026-08-18T00:00:00.000Z",
  last_event_at: "2026-08-18T00:00:00.000Z",
  revision: 2,
  employee_name: "Alex Kim",
  employee_code: "E-0002",
  location_name: "Main Dining",
  location_timezone: "America/Los_Angeles",
  attention_codes: ["amended"],
  events: [
    {
      id: "b6300000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      session_id: "b6200000-0000-4000-8000-000000000001",
      employee_id: "15000000-0000-4000-8000-000000000001",
      location_id: "11000000-0000-4000-8000-000000000001",
      event_type: "clock_in",
      occurred_at: "2026-08-17T16:00:00.000Z",
      received_at: "2026-08-17T16:00:01.000Z",
      actor_user_id: context.userId,
      source: "manager",
      idempotency_key: "b6400000-0000-4000-8000-000000000001",
    },
    {
      id: "b6300000-0000-4000-8000-000000000002",
      workspace_id: workspaceId,
      session_id: "b6200000-0000-4000-8000-000000000001",
      employee_id: "15000000-0000-4000-8000-000000000001",
      location_id: "11000000-0000-4000-8000-000000000001",
      event_type: "clock_out",
      occurred_at: "2026-08-18T00:00:00.000Z",
      received_at: "2026-08-18T00:00:01.000Z",
      actor_user_id: context.userId,
      source: "manager",
      idempotency_key: "b6400000-0000-4000-8000-000000000002",
    },
  ],
  amendments: [
    {
      id: "b6500000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      session_id: "b6200000-0000-4000-8000-000000000001",
      actor_user_id: context.userId,
      reason: "Corrected from written log",
      before_started_at: "2026-08-17T16:00:00.000Z",
      before_ended_at: "2026-08-18T00:00:00.000Z",
      after_started_at: "2026-08-17T16:15:00.000Z",
      after_ended_at: "2026-08-18T00:00:00.000Z",
      base_revision: 1,
      result_revision: 2,
      idempotency_key: "b6400000-0000-4000-8000-000000000003",
      created_at: "2026-08-18T01:00:00.000Z",
    },
  ],
  manual_entry: {
    id: "b6600000-0000-4000-8000-000000000001",
    session_id: "b6200000-0000-4000-8000-000000000001",
    actor_user_id: context.userId,
    reason: "Employee forgot to clock in",
    idempotency_key: "b6400000-0000-4000-8000-000000000004",
    created_at: "2026-08-18T00:05:00.000Z",
  },
  correction_requests: [],
} satisfies ManagerTimeEntriesReadModel["sessions"][number];

const fixture = {
  workspace_id: workspaceId,
  from: "2026-08-17",
  to: "2026-08-23",
  locations: [
    {
      id: "11000000-0000-4000-8000-000000000001",
      name: "Main Dining",
      timezone: "America/Los_Angeles",
    },
  ],
  employees: [
    {
      id: "15000000-0000-4000-8000-000000000001",
      employee_code: "E-0002",
      display_name: "Alex Kim",
      location_ids: ["11000000-0000-4000-8000-000000000001"],
    },
  ],
  sessions: [session],
  review_windows: [],
} satisfies ManagerTimeEntriesReadModel;

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context }) }));
vi.mock("../time-entries/time-entries-data", () => ({
  getManagerTimeEntries: vi.fn(),
  createManagerManualTimeEntry: vi.fn().mockResolvedValue({}),
  amendManagerTimeEntry: vi.fn().mockResolvedValue({}),
  decideTimeCorrection: vi.fn().mockResolvedValue({}),
  approveTimeReviewWindow: vi.fn().mockResolvedValue({}),
}));

function renderPage(model: ManagerTimeEntriesReadModel = fixture) {
  vi.mocked(getManagerTimeEntries).mockResolvedValue(model);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/time-entries"]}>
        <TimeEntriesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TimeEntriesPage", () => {
  it("shows a scan-friendly manager record with raw and append-only provenance", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Time Entries" }),
    ).toBeTruthy();
    expect(screen.getByText("Raw time")).toBeTruthy();
    expect(screen.getByText("Employee forgot to clock in")).toBeTruthy();
    expect(
      screen.getByText("Corrected from written log", { exact: false }),
    ).toBeTruthy();
    expect(screen.getAllByText("Amended")).toHaveLength(2);
  });

  it("submits a reasoned manual entry with a client idempotency key", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add entry" }));
    const dialog = screen.getByRole("dialog", { name: "Add time entry" });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Employee forgot to clock out" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add entry" }));
    await waitFor(() =>
      expect(createManagerManualTimeEntry).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          employee_id: "15000000-0000-4000-8000-000000000001",
          location_id: "11000000-0000-4000-8000-000000000001",
          reason: "Employee forgot to clock out",
        }),
        expect.any(String),
      ),
    );
  });

  it("submits amendments with the selected session revision", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Amend" }));
    const dialog = screen.getByRole("dialog", { name: "Amend entry" });
    fireEvent.input(within(dialog).getByLabelText("Start"), {
      target: { value: "2026-08-17T10:00" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Corrected against signed manager note" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save amendment" }),
    );
    await waitFor(() =>
      expect(amendManagerTimeEntry).toHaveBeenCalledWith(
        workspaceId,
        session.id,
        expect.objectContaining({
          expected_revision: 2,
          effective_started_at: "2026-08-17T17:00:00.000Z",
          reason: "Corrected against signed manager note",
        }),
        expect.any(String),
      ),
    );
  });

  it("reviews pending corrections and submits the selected decision", async () => {
    const correction = {
      id: "b6800000-0000-4000-8000-000000000001",
      workspace_id: workspaceId,
      session_id: session.id,
      employee_id: session.employee_id,
      location_id: session.location_id,
      requested_started_at: "2026-08-17T16:30:00.000Z",
      requested_ended_at: "2026-08-18T00:00:00.000Z",
      reason: "Clock-in was later",
      base_revision: 2,
      status: "pending" as const,
      submitted_at: "2026-08-18T01:00:00.000Z",
      decided_by: null,
      decision_reason: null,
      decided_at: null,
      result_amendment_id: null,
    };
    renderPage({
      ...fixture,
      sessions: [
        {
          ...session,
          attention_codes: ["correction_pending"],
          correction_requests: [correction],
        },
      ],
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Review request" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "Written log confirms original time" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject correction" }));
    await waitFor(() =>
      expect(decideTimeCorrection).toHaveBeenCalledWith(
        workspaceId,
        correction.id,
        {
          expected_session_revision: 2,
          action: "reject",
          reason: "Written log confirms original time",
        },
        expect.any(String),
      ),
    );
  });

  it("approves an exact location review set", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText("Location"), {
      target: { value: session.location_id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve 1 reviewed" }));
    await waitFor(() =>
      expect(approveTimeReviewWindow).toHaveBeenCalledWith(
        workspaceId,
        expect.objectContaining({
          location_id: session.location_id,
          sessions: [{ session_id: session.id, expected_revision: 2 }],
        }),
        expect.any(String),
      ),
    );
  });
});
