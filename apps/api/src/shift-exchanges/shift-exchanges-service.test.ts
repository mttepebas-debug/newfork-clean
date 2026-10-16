import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShiftExchangesService } from "./shift-exchanges-service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks }));
const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const caseId = "98020000-0000-4000-8000-000000000001";
const actor = "98000000-0000-4000-8000-000000000001";
const result = { case_id: caseId, status: "completed", revision: 4 };
const service = () =>
  createShiftExchangesService({
    url: "http://localhost",
    serviceRoleKey: "test-only",
  });
const command = () =>
  service().command(
    actor,
    workspace,
    {
      action: "close",
      case_id: caseId,
      expected_revision: 3,
      reason: "I will work my shift.",
      private_note: "",
    },
    actor,
  );
beforeEach(() => {
  mocks.rpc.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("shift exchange commands", () => {
  // BILDIRIM-03: the old notification system is torn down, so a command no longer flushes
  // shift exchange notifications after it commits.
  it("returns the committed result without a notification follow-up", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null });
    await expect(command()).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("shift_exchanges_command_service", {
      actor,
      w: workspace,
      command: expect.objectContaining({ action: "close", case_id: caseId }),
      idempotency_key: actor,
    });
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("passes on a command rejected by the authority boundary", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "Changed assignment" },
    });
    await expect(command()).rejects.toMatchObject({ statusCode: 409, pgCode: "PT409" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("approved time off in an exchange (BL-995)", () => {
  it("carries the time-off blocker to the screen", async () => {
    const eligibility = {
      status: "ineligible",
      reasons: ["Approved time off overlaps this shift"],
      blockers: [{ code: "approved_time_off", message: "Approved time off overlaps this shift" }],
    };
    mocks.rpc.mockResolvedValueOnce({
      data: {
        allowed: false,
        fingerprint: "abc",
        reasons: ["The receiving employee is not eligible for the full shift"],
        receiver: eligibility,
        giver: null,
        requires_other_manager: false,
        other_applications: 0,
      },
      error: null,
    });
    const preview = await service().preview(actor, workspace, caseId, caseId);
    expect(preview.receiver.blockers).toEqual([
      { code: "approved_time_off", message: "Approved time off overlaps this shift" },
    ]);
    expect(preview.receiver).not.toHaveProperty("shortens_time_off");
  });
});
