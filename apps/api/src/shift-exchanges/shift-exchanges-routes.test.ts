import Fastify from "fastify";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { replyWithError, rpcFailure } from "../http-error";
import { registerShiftExchangesRoutes } from "./shift-exchanges-routes";
import type { ShiftExchangesService } from "./shift-exchanges-service";

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const actor = "98000000-0000-4000-8000-000000000001";
const shift = "98020000-0000-4000-8000-000000000001";
const key = "98030000-0000-4000-8000-000000000001";
const context = {
  userId: actor,
  workspace: { id: workspace },
  membership: { status: "active" },
  onboarding: { status: "complete" },
  documentAccess: { restricted: false },
} as ActiveWorkspaceContext;
function setup(resolved: ActiveWorkspaceContext | null = context) {
  const app = Fastify();
  app.setErrorHandler(replyWithError);
  const service: ShiftExchangesService = {
    recoverSchedule: vi.fn().mockResolvedValue({ changes: [] }),
    read: vi.fn().mockResolvedValue({ cases: [] }),
    candidates: vi.fn(),
    preview: vi.fn(),
    command: vi.fn().mockResolvedValue({ status: "open" }),
  };
  const resolver = { resolve: vi.fn().mockResolvedValue(resolved) };
  registerShiftExchangesRoutes(app, { service, contextResolver: resolver });
  return { app, service, resolver };
}
describe("Shift exchange authorization boundary", () => {
  it.each([
    { action: "apply", shift_id: shift },
    {
      action: "create",
      kind: "swap",
      shift_id: shift,
      requested_shift_id: key,
    },
    {
      action: "accept",
      case_id: shift,
      application_id: key,
      expected_revision: 1,
    },
  ])(
    "preserves the checked own-availability token for $action",
    async (command) => {
      const { app, service } = setup();
      const fingerprint = "a".repeat(64);
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/shift-exchanges`,
        headers: { authorization: "Bearer token", "idempotency-key": key },
        payload: {
          ...command,
          availability_fingerprint: fingerprint,
          availability_accepted: true,
          actor: "spoofed",
        },
      });
      expect(response.statusCode).toBe(200);
      expect(service.command).toHaveBeenCalledWith(
        actor,
        workspace,
        expect.objectContaining({
          ...command,
          availability_fingerprint: fingerprint,
        }),
        key,
      );
      const forwarded = vi.mocked(service.command).mock.calls[0]![2];
      expect(forwarded).not.toHaveProperty("availability_accepted");
      expect(forwarded).not.toHaveProperty("actor");
      await app.close();
    },
  );
  it("rejects a malformed own-availability token before the database command", async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspace}/shift-exchanges`,
      headers: { authorization: "Bearer token", "idempotency-key": key },
      payload: {
        action: "apply",
        shift_id: shift,
        availability_fingerprint: "yes",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(service.command).not.toHaveBeenCalled();
    await app.close();
  });
  it("returns unavailable without executing a command when identity verification is temporarily down", async () => {
    const { app, service, resolver } = setup();
    resolver.resolve.mockRejectedValue(
      Object.assign(
        new Error("Workspace access could not be checked. Please try again."),
        { statusCode: 503 },
      ),
    );
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspace}/shift-exchanges`,
      headers: { authorization: "Bearer token", "idempotency-key": key },
      payload: { action: "create", kind: "cover", shift_id: shift },
    });
    expect(response.statusCode).toBe(503);
    expect(service.command).not.toHaveBeenCalled();
    await app.close();
  });
  it("binds schedule recovery to the verified actor and requires a comparison/key", async () => {
    const { app, service } = setup();
    const url = `/v1/workspaces/${workspace}/shift-exchanges/schedule-recovery/${shift}`;
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          payload: { fingerprint: "reviewed" },
        })
      ).statusCode,
    ).toBe(400);
    expect(service.recoverSchedule).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { authorization: "Bearer token", "idempotency-key": key },
          payload: { fingerprint: "reviewed", actor: "spoofed" },
        })
      ).statusCode,
    ).toBe(200);
    expect(service.recoverSchedule).toHaveBeenCalledWith(
      actor,
      workspace,
      shift,
      "reviewed",
      key,
    );
    await app.close();
  });
  it("binds actor and workspace from the verified context", async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspace}/shift-exchanges`,
      headers: { authorization: "Bearer real-token", "idempotency-key": key },
      payload: {
        action: "create",
        kind: "cover",
        shift_id: shift,
        actor: "attacker",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(service.command).toHaveBeenCalledWith(
      actor,
      workspace,
      { action: "create", kind: "cover", shift_id: shift, note: "" },
      key,
    );
    await app.close();
  });
  it("rejects a resolver context for a different workspace", async () => {
    const { app, service } = setup({
      ...context,
      workspace: { ...context.workspace, id: shift },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspace}/shift-exchanges`,
      headers: { authorization: "Bearer token" },
    });
    expect(response.statusCode).toBe(403);
    expect(service.read).not.toHaveBeenCalled();
    await app.close();
  });
  it("requires an idempotency key before performing any mutation", async () => {
    const { app, service } = setup();
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspace}/shift-exchanges`,
      headers: { authorization: "Bearer token" },
      payload: { action: "apply", shift_id: shift },
    });
    expect(response.statusCode).toBe(400);
    expect(service.command).not.toHaveBeenCalled();
    await app.close();
  });
  it("returns conflict for a stale decision and does not report success", async () => {
    const { app, service } = setup();
    vi.mocked(service.command).mockRejectedValue(
      rpcFailure({ message: "Review the latest details", code: "40001" }),
    );
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspace}/shift-exchanges`,
      headers: { authorization: "Bearer token", "idempotency-key": key },
      payload: { action: "approve", case_id: shift, expected_revision: 3 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("Review the latest details");
    await app.close();
  });
});
