import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScheduleLineupService } from "./schedule-lineup-service";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks }));
const workspace = "98010000-0000-4000-8000-000000000001";
const proposal = "98020000-0000-4000-8000-000000000001";
const event = "98030000-0000-4000-8000-000000000001";
const invoke = (action: string, payload: Record<string, unknown> = {}) =>
  createScheduleLineupService({
    url: "http://local.test",
    serviceRoleKey: "test",
  }).operations!({
    actorUserId: "actor",
    workspaceId: workspace,
    action,
    payload,
  });
beforeEach(() => {
  mocks.rpc.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
describe("post-commit staffing inbox", () => {
  it.each([
    ["propose", {}, { id: proposal, status: "pending" }, proposal, null],
    [
      "respond",
      { id: proposal, response: "accept" },
      { status: "accepted" },
      proposal,
      null,
    ],
    [
      "respond",
      { id: proposal, response: "decline" },
      { status: "declined" },
      proposal,
      null,
    ],
    [
      "proposal_action",
      { id: proposal, response: "cancel" },
      { status: "cancelled" },
      proposal,
      null,
    ],
    [
      "proposal_action",
      { id: proposal, response: "confirm" },
      { status: "applied", event_id: event },
      proposal,
      null,
    ],
    [
      "apply",
      { id: "unrelated" },
      { status: "applied", event_id: event },
      null,
      event,
    ],
  ] as const)(
    "scopes %s delivery after the domain result",
    async (action, payload, result, proposalId, eventId) => {
      let commit!: (value: unknown) => void;
      const abortSignal = vi
        .fn()
        .mockResolvedValue({ data: { processed: 1 }, error: null });
      mocks.rpc
        .mockReturnValueOnce(
          new Promise((resolve) => {
            commit = resolve;
          }),
        )
        .mockReturnValueOnce({ abortSignal });
      const pending = invoke(action, payload);
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      commit({ data: result, error: null });
      await expect(pending).resolves.toEqual(result);
      expect(mocks.rpc).toHaveBeenNthCalledWith(
        2,
        "flush_lineup_staffing_notifications_service",
        {
          target_workspace_id: workspace,
          target_proposal_id: proposalId,
          target_event_id: eventId,
        },
      );
      expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    },
  );
  it.each(["offers", "proposals", "preview", "proposal_action"])(
    "does not deliver from read/preview %s",
    async (action) => {
      mocks.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
      await invoke(action, { id: proposal, response: "preview" });
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it("does not flush an unauthorized or conflicting domain command", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "stale approval" },
    });
    await expect(
      invoke("proposal_action", { id: proposal, response: "confirm" }),
    ).rejects.toThrow("stale approval");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { error: { message: "offline" }, data: null },
    { error: null, data: { retried: 1 } },
    { error: null, data: { busy: true } },
    { error: null, data: { remaining: true, leased: 0 } },
  ])(
    "preserves committed success on deferred delivery %j",
    async (delivery) => {
      mocks.rpc
        .mockResolvedValueOnce({
          data: { id: proposal, status: "pending" },
          error: null,
        })
        .mockReturnValueOnce({
          abortSignal: vi.fn().mockResolvedValue(delivery),
        });
      await expect(invoke("propose")).resolves.toEqual({
        id: proposal,
        status: "pending",
      });
      expect(console.warn).toHaveBeenCalledWith(
        "Line Up staffing notification delivery deferred",
        { workspaceId: workspace, proposalId: proposal, eventId: null },
      );
    },
  );
  it("uses one total two-second signal across slices and preserves success on abort", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const first = vi
      .fn()
      .mockResolvedValue({ data: { leased: 1, remaining: true }, error: null });
    const second = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          }),
        ),
    );
    mocks.rpc
      .mockResolvedValueOnce({
        data: { status: "applied", event_id: event },
        error: null,
      })
      .mockReturnValueOnce({ abortSignal: first })
      .mockReturnValueOnce({ abortSignal: second });
    const pending = invoke("apply");
    await vi.waitFor(() => expect(second).toHaveBeenCalled());
    controller.abort();
    await expect(pending).resolves.toEqual({
      status: "applied",
      event_id: event,
    });
    expect(first.mock.calls[0]?.[0]).toBe(second.mock.calls[0]?.[0]);
    expect(timeout).toHaveBeenCalledWith(2000);
  });
});
