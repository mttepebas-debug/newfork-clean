import Fastify from "fastify";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { replyWithError, rpcFailure } from "../http-error";
import { registerAvailabilityRoutes } from "./availability-routes";

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employee = "ab910000-0000-4000-8000-000000000001";
const actor = "ab920000-0000-4000-8000-000000000001";
const key = "ab930000-0000-4000-8000-000000000001";
function setup(workspaceId = workspace) {
  const app = Fastify();
  app.setErrorHandler(replyWithError);
  const service = {
    readWeekly: vi.fn(), readWeeklyTeam: vi.fn(), previewWeekly: vi.fn(), saveWeekly: vi.fn(),
    readWeeklySettings: vi.fn(), saveWeeklySettings: vi.fn(),
    onboardingReadWeekly: vi.fn(), onboardingPreviewWeekly: vi.fn(), onboardingSaveWeekly: vi.fn(),
    assessShift: vi.fn(),
  };
  const context = {
    userId: actor,
    workspace: { id: workspaceId },
    membership: { status: "active" },
    onboarding: { status: "complete" },
    documentAccess: { restricted: false },
  } as ActiveWorkspaceContext;
  registerAvailabilityRoutes(app, {
    service,
    contextResolver: { resolve: async () => context },
  });
  return { app, service };
}
describe("availability routes", () => {
  it("mounts the weekly routes", async () => {
    const { app, service } = setup();
    try {
      service.readWeekly.mockResolvedValue({ employee_id: employee });
      const response = await app.inject({
        method: "GET", url: `/v1/workspaces/${workspace}/availability/weekly`,
        headers: { authorization: "Bearer test" },
      });
      expect(response.statusCode).toBe(200);
      expect(service.readWeekly).toHaveBeenCalledWith(actor, workspace, undefined);
    } finally { await app.close(); }
  });
  it("checks shift capacity with the authenticated actor and rejects a foreign workspace", async () => {
    const { app, service } = setup();
    const shift = {
      location_id: employee,
      employee_id: employee,
      job_id: key,
      shift_type_id: null,
      scheduled_date: "2035-01-01",
      start_time: "12:00",
      end_time: "16:00",
      note: "",
      time_basis: "explicit",
    };
    service.assessShift.mockResolvedValue({ operation: "blocked" });
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/shift-assessment`,
        headers: { authorization: "Bearer test" },
        payload: { shift, actor: "spoof", session_id: key },
      });
      expect(response.statusCode).toBe(200);
      expect(service.assessShift).toHaveBeenCalledWith(
        actor,
        workspace,
        expect.objectContaining(shift),
        undefined,
        key,
      );
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/workspaces/${key}/availability/shift-assessment`,
            headers: { authorization: "Bearer test" },
            payload: { shift },
          })
        ).statusCode,
      ).toBe(404);
      expect(service.assessShift).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  // BL-794 (E4-19): somebody else's workspace is simply not there.
  it("answers a workspace the caller is not in with 404 authz.not_member", async () => {
    const { app } = setup();
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${key}/availability/shift-assessment`,
        headers: { authorization: "Bearer test" },
        payload: {
          shift: {
            location_id: employee,
            employee_id: employee,
            job_id: key,
            shift_type_id: null,
            scheduled_date: "2035-01-01",
            start_time: "12:00",
            end_time: "16:00",
            note: "",
            time_basis: "explicit",
          },
        },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    } finally {
      await app.close();
    }
  });
  it("returns a scoped assessment denial without treating it as unknown capacity", async () => {
    const { app, service } = setup();
    service.assessShift.mockRejectedValue(
      rpcFailure({ message: "Schedule location access denied", code: "42501" }),
    );
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/shift-assessment`,
        headers: { authorization: "Bearer test" },
        payload: {
          shift: {
            location_id: employee,
            employee_id: employee,
            job_id: key,
            shift_type_id: null,
            scheduled_date: "2035-01-01",
            start_time: "12:00",
            end_time: "16:00",
            note: "",
          },
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "Schedule location access denied",
        requestId: expect.any(String),
      });
    } finally {
      await app.close();
    }
  });
});
