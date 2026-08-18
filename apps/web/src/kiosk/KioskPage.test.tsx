import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelKioskAction,
  captureKioskAction,
  getKioskActionState,
  getKioskDirectory,
  verifyKioskPin,
} from "./kiosk-data";
import KioskPage from "./KioskPage";

vi.mock("./kiosk-data", async (load) => {
  const actual = await load<typeof import("./kiosk-data")>();
  return {
    ...actual,
    getKioskDirectory: vi.fn(),
    exchangeKioskEnrollment: vi.fn(),
    verifyKioskPin: vi.fn(),
    getKioskActionState: vi.fn(),
    captureKioskAction: vi.fn(),
    cancelKioskAction: vi.fn().mockResolvedValue(undefined),
  };
});

const employeeId = "15000000-0000-4000-8000-000000000001";
const directory = {
  device: {
    id: "a8100000-0000-4000-8000-000000000001",
    label: "Front counter",
    workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
    workspace_name: "Meyhouse",
    location: {
      id: "11000000-0000-4000-8000-000000000001",
      name: "Main Dining",
      timezone: "America/Los_Angeles",
    },
  },
  employees: [
    { id: employeeId, display_name: "Ada Lovelace" },
    {
      id: "15000000-0000-4000-8000-000000000002",
      display_name: "Grace Hopper",
    },
  ],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <KioskPage />
    </QueryClientProvider>,
  );
}

describe("KioskPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKioskDirectory).mockResolvedValue(directory);
    vi.mocked(verifyKioskPin).mockResolvedValue({
      verified: true,
      expires_at: "2026-08-17T12:01:00.000Z",
    });
    vi.mocked(cancelKioskAction).mockResolvedValue(undefined);
  });

  it("moves from a neutral employee chooser through PIN to accepted capture", async () => {
    vi.mocked(getKioskActionState).mockResolvedValue({
      employee: { id: employeeId, display_name: "Ada Lovelace" },
      location: directory.device.location,
      current_session: null,
      expected_revision: 0,
      allowed_actions: ["clock_in"],
      blocked_reason: null,
      expires_at: "2026-08-17T12:01:00.000Z",
    });
    vi.mocked(captureKioskAction).mockResolvedValue({
      status: "accepted",
      session: {
        id: "a8200000-0000-4000-8000-000000000001",
        capture_state: "open",
        revision: 1,
        last_event_at: "2026-08-17T12:00:00.000Z",
      },
      events: [
        {
          id: "a8300000-0000-4000-8000-000000000001",
          event_type: "clock_in",
          occurred_at: "2026-08-17T12:00:00.000Z",
          received_at: "2026-08-17T12:00:01.000Z",
        },
      ],
      idempotent_replay: false,
    });

    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Choose your name" }),
    ).toBeTruthy();
    expect(screen.queryByText("6-digit PIN")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Ada Lovelace/ }));
    fireEvent.change(screen.getByLabelText("6-digit PIN"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("button", { name: "Clock in" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clock in" }));
    expect(
      await screen.findByRole("heading", { name: "Clock in recorded" }),
    ).toBeTruthy();
    expect(verifyKioskPin).toHaveBeenCalledWith(employeeId, "123456");
    expect(captureKioskAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "clock_in", expected_revision: 0 }),
    );
  });

  it("requires an explicit choice before clocking out during a break", async () => {
    vi.mocked(getKioskActionState).mockResolvedValue({
      employee: { id: employeeId, display_name: "Ada Lovelace" },
      location: directory.device.location,
      current_session: {
        id: "a8200000-0000-4000-8000-000000000001",
        capture_state: "on_break",
        started_at: "2026-08-17T08:00:00.000Z",
        revision: 2,
      },
      expected_revision: 2,
      allowed_actions: ["break_end", "end_break_and_clock_out"],
      blocked_reason: null,
      expires_at: "2026-08-17T12:01:00.000Z",
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /Ada Lovelace/ }),
    );
    fireEvent.change(screen.getByLabelText("6-digit PIN"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("button", { name: "End break" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "End break & clock out" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clock out" })).toBeNull();
  });

  it("filters the neutral directory without exposing time history", async () => {
    renderPage();
    await screen.findByText("Ada Lovelace");
    fireEvent.change(screen.getByPlaceholderText("Search by name"), {
      target: { value: "Grace" },
    });
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).toBeNull());
    expect(screen.getByText("Grace Hopper")).toBeTruthy();
    expect(screen.queryByText(/hours|shift|history/i)).toBeNull();
  });
});
