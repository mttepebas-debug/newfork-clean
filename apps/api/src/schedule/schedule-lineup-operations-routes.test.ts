import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { registerScheduleLineupRoutes } from "./schedule-lineup-routes";
import type { ScheduleLineupService } from "./schedule-lineup-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const actor = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const locationId = "11000000-0000-4000-8000-000000000001";
const context = {
  userId: actor,
  workspace: { id: workspaceId },
  membership: { role: "owner", status: "active" },
  permissions: ["schedule.lineup.read", "schedule.lineup.manage"],
} as ActiveWorkspaceContext;
function setup(value = context) {
  const app = Fastify();
  const operations = vi.fn().mockResolvedValue({
    notes: [],
    receipts: [],
    events: [],
    unpublished_changes: false,
  });
  const resolve = vi.fn().mockResolvedValue(value);
  registerScheduleLineupRoutes(app, {
    service: { operations } as unknown as ScheduleLineupService,
    contextResolver: { resolve },
  });
  return { app, operations, resolve };
}
const headers = {
  authorization: "Bearer test-token",
  "x-newfork-workspace-id": workspaceId,
};
describe("Line Up operation authorization", () => {
  it("strips internal offer consent markers from direct assignment payloads", async () => {
    const { app, operations } = setup();
    const operation = {
      kind: "assign",
      source_entry_id: locationId,
      target_entry_id: null,
      employee_id: actor,
      reason: "Cover this shift",
      travel_minutes: 0,
      target: {
        date: "2030-01-07",
        location_id: locationId,
        job_id: locationId,
        shift_type_id: locationId,
        start_time: "18:00",
        end_time: "22:00",
        section_id: null,
        station: "",
      },
    };
    const payload = {
      operation,
      fingerprint: "a".repeat(64),
      idempotency_key: locationId,
      confirm_availability: true,
    };
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/operations",
      headers,
      payload: {
        ...payload,
        operation: {
          ...operation,
          _weekly_offer_id: locationId,
          target: {
            ...operation.target,
            _weekly_offer_id: locationId,
            _weekly_manager_fingerprint: "b".repeat(64),
          },
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(operations).toHaveBeenCalledWith({
      actorUserId: actor,
      workspaceId,
      action: "apply",
      payload,
    });
    await app.close();
  });
  it("forwards the employee's availability token but never a supplied actor or acceptance record", async () => {
    const { app, operations } = setup({
      ...context,
      membership: { ...context.membership, role: "employee" },
      permissions: [],
    });
    const payload = {
      id: locationId,
      response: "accept",
      availability_fingerprint: "a".repeat(64),
    };
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/offers/respond",
      headers,
      payload: {
        ...payload,
        actor_user_id: locationId,
        employee_acceptance: { actor_user_id: locationId },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(operations).toHaveBeenCalledWith({
      actorUserId: actor,
      workspaceId,
      action: "respond",
      payload,
    });
    await app.close();
  });
  it("rejects a malformed employee availability token", async () => {
    const { app, operations } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/offers/respond",
      headers,
      payload: {
        id: locationId,
        response: "accept",
        availability_fingerprint: "not-a-token",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(operations).not.toHaveBeenCalled();
    await app.close();
  });
  it("requires share permission before sending an acknowledgement reminder", async () => {
    const { app, operations } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/notifications/remind",
      headers,
      payload: {
        date: "2030-01-07",
        location_id: locationId,
        snapshot_id: locationId,
      },
    });
    expect(response.statusCode).toBe(403);
    expect(operations).not.toHaveBeenCalled();
    await app.close();
  });
  it("binds reminders to the authenticated actor and reviewed snapshot", async () => {
    const { app, operations } = setup({
      ...context,
      permissions: [...context.permissions, "schedule.lineup.share"],
    });
    const payload = {
      date: "2030-01-07",
      location_id: locationId,
      snapshot_id: locationId,
    };
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/notifications/remind",
      headers,
      payload: { ...payload, actor_user_id: locationId },
    });
    expect(response.statusCode).toBe(200);
    expect(operations).toHaveBeenCalledWith({
      actorUserId: actor,
      workspaceId,
      action: "remind_unacknowledged",
      payload,
    });
    await app.close();
  });
  it("requires a current preview for an atomic placement commit", async () => {
    const { app, operations } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/placements",
      headers,
      payload: { date: "2030-01-07", location_id: locationId, entries: [] },
    });
    expect(response.statusCode).toBe(400);
    expect(operations).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the transfer decision but strips private scope and assignment markers", async () => {
    const { app, operations } = setup();
    const payload = {
      id: locationId,
      response: "confirm",
      fingerprint: "a".repeat(64),
      confirm_availability: true,
    };
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/proposals/action",
      headers,
      payload: {
        ...payload,
        actor_user_id: locationId,
        _weekly_transfer_id: locationId,
        _weekly_manager_fingerprint: "b".repeat(64),
      },
    });
    expect(response.statusCode).toBe(200);
    expect(operations).toHaveBeenCalledWith({
      actorUserId: actor,
      workspaceId,
      action: "proposal_action",
      payload,
    });
    await app.close();
  });

  it("binds operations to the authenticated actor and explicit workspace", async () => {
    const { app, operations, resolve } = setup();
    const response = await app.inject({
      method: "GET",
      url: `/schedule/lineups/operations?date=2030-01-07&location_id=${locationId}`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(resolve).toHaveBeenCalledWith("test-token", workspaceId);
    expect(operations).toHaveBeenCalledWith({
      actorUserId: actor,
      workspaceId,
      action: "state",
      payload: { date: "2030-01-07", location_id: locationId },
    });
    await app.close();
  });
  it("rejects a resolved workspace mismatch", async () => {
    const { app, operations } = setup({
      ...context,
      workspace: { ...context.workspace, id: locationId },
    });
    const response = await app.inject({
      method: "GET",
      url: `/schedule/lineups/operations?date=2030-01-07&location_id=${locationId}`,
      headers,
    });
    expect(response.statusCode).toBe(403);
    expect(operations).not.toHaveBeenCalled();
    await app.close();
  });
  it("requires an explicit workspace on mutation", async () => {
    const { app, operations } = setup();
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/receipt",
      headers: { authorization: "Bearer test-token" },
      payload: { snapshot_id: locationId, action: "acknowledge" },
    });
    expect(response.statusCode).toBe(403);
    expect(operations).not.toHaveBeenCalled();
    await app.close();
  });
  it("denies manager operations to an employee even with malformed elevated permissions", async () => {
    const { app, operations } = setup({
      ...context,
      membership: { ...context.membership, role: "employee" },
    });
    const response = await app.inject({
      method: "GET",
      url: `/schedule/lineups/operations?date=2030-01-07&location_id=${locationId}`,
      headers,
    });
    expect(response.statusCode).toBe(403);
    expect(operations).not.toHaveBeenCalled();
    await app.close();
  });
  it("allows self-service acknowledgement and discards a caller-supplied actor", async () => {
    const { app, operations } = setup({
      ...context,
      membership: { ...context.membership, role: "employee" },
      permissions: [],
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/lineups/receipt",
      headers,
      payload: {
        snapshot_id: locationId,
        action: "acknowledge",
        actor_user_id: locationId,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(operations).toHaveBeenCalledWith({
      actorUserId: actor,
      workspaceId,
      action: "receipt",
      payload: { snapshot_id: locationId, action: "acknowledge" },
    });
    await app.close();
  });
});
