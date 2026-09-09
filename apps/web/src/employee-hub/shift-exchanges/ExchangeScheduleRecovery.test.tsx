import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExchangeScheduleRecovery as Recovery } from "@newfork/shared";
import type { ScheduleEditSession } from "@newfork/shared/schedule";
import { ExchangeScheduleRecovery } from "./ExchangeScheduleRecovery";
import {
  ExchangeError,
  fetchExchangeScheduleRecovery,
  restoreExchangeSchedule,
} from "./exchange-data";
vi.mock("./exchange-data", async (original) => ({
  ...(await original<typeof import("./exchange-data")>()),
  fetchExchangeScheduleRecovery: vi.fn(),
  restoreExchangeSchedule: vi.fn(),
}));
const session = { id: "session", revision: 3 } as ScheduleEditSession;
const model = {
  session_id: "session",
  session_revision: 3,
  fingerprint: "comparison-1",
  changes: [
    {
      current: {
        id: "shift",
        scheduled_date: "2030-01-07",
        location_name: "Dining",
        employee_name: "Casey",
        start_time: "16:00",
        end_time: "22:00",
        job_name: "Server",
        timezone: "America/Los_Angeles",
        unpaid_break_minutes: 30,
      },
      edited_employee_name: "Alex",
      edited_start_time: "16:00",
      edited_end_time: "22:00",
      removed: false,
    },
  ],
} as Recovery;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchExchangeScheduleRecovery).mockResolvedValue(model);
});
afterEach(cleanup);
describe("Schedule recovery after an approved exchange", () => {
  it("shows the old and approved owner and adopts only after an explicit action", async () => {
    const next = { ...session, revision: 4 };
    vi.mocked(restoreExchangeSchedule).mockResolvedValue(next);
    const restored = vi.fn();
    const blocked = vi.fn();
    render(
      <ExchangeScheduleRecovery
        workspaceId="workspace"
        session={session}
        onRestored={restored}
        onBlockingChange={blocked}
      />,
    );
    await screen.findByText(/Your draft: Alex/);
    expect(screen.getByText(/Approved: Casey/)).toBeTruthy();
    expect(restoreExchangeSchedule).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenLastCalledWith(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Use approved assignments" }),
    );
    await waitFor(() => expect(restored).toHaveBeenCalledWith(next));
    expect(restoreExchangeSchedule).toHaveBeenCalledWith(
      "workspace",
      "session",
      "comparison-1",
      expect.any(String),
    );
  });
  it("reuses the same idempotency key after a lost response", async () => {
    vi.mocked(restoreExchangeSchedule)
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValue(session);
    render(
      <ExchangeScheduleRecovery
        workspaceId="workspace"
        session={session}
        onRestored={vi.fn()}
        onBlockingChange={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Use approved assignments" }),
    );
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Use approved assignments" }),
    );
    await waitFor(() =>
      expect(restoreExchangeSchedule).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(restoreExchangeSchedule).mock.calls[1]?.[3]).toBe(
      vi.mocked(restoreExchangeSchedule).mock.calls[0]?.[3],
    );
  });
  it("reloads a stale comparison without applying the new one automatically", async () => {
    vi.mocked(restoreExchangeSchedule).mockRejectedValue(
      new ExchangeError("Schedule changed", 409),
    );
    vi.mocked(fetchExchangeScheduleRecovery)
      .mockResolvedValueOnce(model)
      .mockResolvedValue({ ...model, fingerprint: "comparison-2" });
    render(
      <ExchangeScheduleRecovery
        workspaceId="workspace"
        session={session}
        onRestored={vi.fn()}
        onBlockingChange={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Use approved assignments" }),
    );
    await waitFor(() =>
      expect(fetchExchangeScheduleRecovery).toHaveBeenCalledTimes(2),
    );
    await screen.findByRole("button", { name: "Use approved assignments" });
    expect(restoreExchangeSchedule).toHaveBeenCalledTimes(1);
  });
  it("leaves normal save recovery available when there is no exchange conflict", async () => {
    vi.mocked(fetchExchangeScheduleRecovery).mockResolvedValue({
      ...model,
      changes: [],
    });
    const blocked = vi.fn();
    render(
      <ExchangeScheduleRecovery
        workspaceId="workspace"
        session={session}
        onRestored={vi.fn()}
        onBlockingChange={blocked}
      />,
    );
    await waitFor(() => expect(blocked).toHaveBeenLastCalledWith(false));
    expect(
      screen.queryByRole("button", { name: "Use approved assignments" }),
    ).toBeNull();
  });
});
