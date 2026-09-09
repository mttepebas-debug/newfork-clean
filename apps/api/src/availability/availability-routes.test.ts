import Fastify from "fastify";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { registerAvailabilityRoutes } from "./availability-routes";

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const employee = "ab910000-0000-4000-8000-000000000001";
const actor = "ab920000-0000-4000-8000-000000000001";
const key = "ab930000-0000-4000-8000-000000000001";
const command = {
  action: "submit",
  employee_id: employee,
  expected_revision: 0,
  proposal: {
    timezone: "UTC",
    effective_from: "2035-01-01",
    effective_until: null,
    days: Array.from({ length: 7 }, (_, day) => ({
      day,
      mode: "unrestricted",
      windows: [],
    })),
  },
};
function setup(workspaceId = workspace) {
  const app = Fastify();
  const service = {
    readWeekly: vi.fn(), readWeeklyTeam: vi.fn(), previewWeekly: vi.fn(), saveWeekly: vi.fn(),
    readWeeklySettings: vi.fn(), saveWeeklySettings: vi.fn(),
    onboardingReadWeekly: vi.fn(), onboardingPreviewWeekly: vi.fn(), onboardingSaveWeekly: vi.fn(),
    compareCalendar: vi.fn(),
    onboardingCompareCalendar: vi.fn(),
    calendar: vi.fn(),
    onboardingCalendar: vi.fn(),
    impact: vi.fn(),
    requests: vi.fn(),
    assessShift: vi.fn(),
    read: vi.fn(),
    command: vi.fn(),
    onboardingRead: vi.fn(),
    onboardingCommand: vi.fn(),
  };
  const context = {
    userId: actor,
    workspace: { id: workspaceId },
    membership: { status: "active" },
    onboarding: { status: "complete" },
  } as ActiveWorkspaceContext;
  registerAvailabilityRoutes(app, {
    service,
    contextResolver: { resolve: async () => context },
  });
  return { app, service };
}
describe("availability routes", () => {
  it.each([
    ["GET", ""], ["POST", ""], ["GET", "/requests"], ["POST", "/impact"],
    ["POST", "/calendar"], ["POST", "/calendar-comparison"],
  ] as const)("retires legacy workspace %s %s without reading or writing old records", async (method, path) => {
    const { app, service } = setup();
    try {
      const url = `/v1/workspaces/${workspace}/availability${path}`;
      expect((await app.inject({ method, url })).statusCode).toBe(403);
      const response = await app.inject({
        method, url, headers: { authorization: "Bearer test", "idempotency-key": key },
        ...(method === "POST" ? { payload: command } : {}),
      });
      expect(response.statusCode).toBe(410);
      expect(response.json()).toEqual({
        code: "availability_model_retired",
        error: expect.stringContaining("Reload the page"),
      });
      expect((await app.inject({
        method, url: `/v1/workspaces/${key}/availability${path}`,
        headers: { authorization: "Bearer test" },
      })).statusCode).toBe(403);
      for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it.each([
    ["GET", ""], ["POST", ""], ["POST", "/calendar"], ["POST", "/calendar-comparison"],
  ] as const)("retires legacy onboarding %s %s without invoking the lifecycle", async (method, path) => {
    const { app, service } = setup();
    try {
      const url = `/v1/me/onboarding/availability-lifecycle${path}`;
      expect((await app.inject({ method, url })).statusCode).toBe(401);
      const response = await app.inject({
        method, url, headers: { authorization: "Bearer pending", "idempotency-key": key },
        ...(method === "POST" ? { payload: { ...command, onboarding_revision: 3 } } : {}),
      });
      expect(response.statusCode).toBe(410);
      expect(response.json().code).toBe("availability_model_retired");
      for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it.each(["submit", "approve", "reject", "cancel", "request_changes", "override"])(
    "rejects stale %s commands even with a retry key", async action => {
      const { app, service } = setup();
      try {
        const response = await app.inject({
          method: "POST", url: `/v1/workspaces/${workspace}/availability`,
          headers: { authorization: "Bearer test", "idempotency-key": key },
          payload: { ...command, action },
        });
        expect(response.statusCode).toBe(410);
        expect(service.command).not.toHaveBeenCalled();
      } finally { await app.close(); }
    },
  );
  it("keeps weekly routes mounted beside the retired endpoints", async () => {
    const { app, service } = setup();
    try {
      service.readWeekly.mockResolvedValue({ employee_id: employee });
      const response = await app.inject({
        method: "GET", url: `/v1/workspaces/${workspace}/availability/weekly`,
        headers: { authorization: "Bearer test" },
      });
      expect(response.statusCode).toBe(200);
      expect(service.readWeekly).toHaveBeenCalledWith(actor, workspace, undefined);
      expect(service.read).not.toHaveBeenCalled();
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
      service_classification_note: "Inventory work independent of any service.",
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
      ).toBe(403);
      expect(service.assessShift).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  it("returns a scoped assessment denial without treating it as unknown capacity", async () => {
    const { app, service } = setup();
    service.assessShift.mockRejectedValue(
      Object.assign(new Error("Schedule location access denied"), {
        code: "42501",
      }),
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
      });
    } finally {
      await app.close();
    }
  });
});
