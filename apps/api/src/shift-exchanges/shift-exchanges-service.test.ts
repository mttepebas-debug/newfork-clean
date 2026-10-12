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

describe("post-commit shift exchange inbox delivery", () => {
  it("waits for the committed result and scopes delivery to the returned case", async () => {
    let commit!: (value: unknown) => void;
    const abortSignal = vi
      .fn()
      .mockResolvedValue({ data: { processed: 4 }, error: null });
    mocks.rpc
      .mockReturnValueOnce(
        new Promise((resolve) => {
          commit = resolve;
        }),
      )
      .mockReturnValueOnce({ abortSignal });
    const pending = command();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    commit({ data: result, error: null });
    await expect(pending).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "flush_shift_exchange_notifications_service",
      { target_workspace_id: workspace, target_case_id: caseId },
    );
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("never delivers a command rejected by the authority boundary", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "Changed assignment" },
    });
    await expect(command()).rejects.toMatchObject({ statusCode: 409, pgCode: "PT409" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { error: { message: "delivery unavailable" }, data: null },
    { error: null, data: { retried: 1 } },
    { error: null, data: { busy: true } },
    { error: null, data: { invalidation_deferred: 1 } },
    { error: null, data: { remaining: true, leased: 0 } },
  ])(
    "returns the durable result when delivery is deferred: %j",
    async (delivery) => {
      mocks.rpc
        .mockResolvedValueOnce({ data: result, error: null })
        .mockReturnValueOnce({
          abortSignal: vi.fn().mockResolvedValue(delivery),
        });
      await expect(command()).resolves.toEqual(result);
      expect(console.warn).toHaveBeenCalledWith(
        "Shift exchange notification delivery deferred",
        { workspaceId: workspace, caseId },
      );
    },
  );
  it("drains another available slice using the same overall timeout signal", async () => {
    const first = vi.fn().mockResolvedValue({ error: null, data: { leased: 3, processed: 3, remaining: true } });
    const last = vi.fn().mockResolvedValue({ error: null, data: { leased: 1, processed: 1, remaining: false } });
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null })
      .mockReturnValueOnce({ abortSignal: first }).mockReturnValueOnce({ abortSignal: last });
    await expect(command()).resolves.toEqual(result);
    expect(first.mock.calls[0]?.[0]).toBe(last.mock.calls[0]?.[0]);
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("bounds the follow-up request and retains success when its signal aborts", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const abortSignal = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("Timed out")),
            { once: true },
          );
        }),
    );
    mocks.rpc
      .mockResolvedValueOnce({ data: result, error: null })
      .mockReturnValueOnce({ abortSignal });
    const pending = command();
    await vi.waitFor(() => expect(abortSignal).toHaveBeenCalled());
    controller.abort();
    await expect(pending).resolves.toEqual(result);
    expect(timeout).toHaveBeenCalledWith(2_000);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
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
