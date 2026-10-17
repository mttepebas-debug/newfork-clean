import Fastify from "fastify";
import {
  emptyWeeklyPreference,
  type ActiveWorkspaceContext,
} from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { replyWithError, rpcFailure } from "../http-error";
import { registerWeeklyPreferenceRoutes } from "./weekly-preferences-routes";

const workspace = "ad410000-0000-4000-8000-000000000001";
const employee = "ad410000-0000-4000-8000-000000000004";
const actor = "ad410000-0000-4000-8000-000000000003";
const key = "ad410000-0000-4000-8000-000000000010";
const command = {
  employee_id: employee,
  source: "employee",
  expected_revision: 0,
  settings_revision: 0,
  preference: emptyWeeklyPreference("time_range"),
};
function setup(permissions = ["availability.read", "settings.schedule_rules.manage"]) {
  const app = Fastify();
  app.setErrorHandler(replyWithError);
  const service = {
    readWeeklySettings: vi.fn(),
    saveWeeklySettings: vi.fn(),
    readWeekly: vi.fn(),
    readWeeklyTeam: vi.fn(),
    saveWeekly: vi.fn(),
    onboardingReadWeekly: vi.fn(),
    onboardingSaveWeekly: vi.fn(),
  };
  registerWeeklyPreferenceRoutes(app, {
    service,
    contextResolver: {
      resolve: async () =>
        ({
          userId: actor,
          permissions,
          workspace: { id: workspace },
          membership: { status: "active" },
          onboarding: { status: "complete" },
          documentAccess: { restricted: false },
        }) as ActiveWorkspaceContext,
    },
  });
  return { app, service };
}
describe("weekly preference routes", () => {
  it("authenticates team reads and never trusts a query actor", async () => {
    const { app, service } = setup();
    try {
      const url = `/v1/workspaces/${workspace}/availability/weekly/team?actor=${employee}`;
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
      expect(service.readWeeklyTeam).not.toHaveBeenCalled();
      service.readWeeklyTeam.mockResolvedValue({ employees: [] });
      expect(
        (
          await app.inject({
            method: "GET",
            url,
            headers: { authorization: "Bearer test" },
          })
        ).statusCode,
      ).toBe(200);
      expect(service.readWeeklyTeam).toHaveBeenCalledWith(actor, workspace);
    } finally {
      await app.close();
    }
  });
  it.each([
    ["42501", 403],
    ["XX000", 500],
  ] as const)(
    "maps team read %s without leaking internal errors",
    async (code, status) => {
      const { app, service } = setup();
      try {
        service.readWeeklyTeam.mockRejectedValue(
          rpcFailure({ message: "private database detail", code }),
        );
        const response = await app.inject({
          method: "GET",
          url: `/v1/workspaces/${workspace}/availability/weekly/team`,
          headers: { authorization: "Bearer test" },
        });
        expect(response.statusCode).toBe(status);
        if (status === 500)
          expect(response.body).not.toContain("private database detail");
      } finally {
        await app.close();
      }
    },
  );
  it("uses the validated actor and save key for organization settings", async () => {
    const { app, service } = setup();
    const settings = {
      input_mode: "shift_type",
      onboarding_required: true,
      expected_revision: 2,
    };
    const headers = { authorization: "Bearer test", "idempotency-key": key };
    try {
      service.readWeeklySettings.mockResolvedValue({ settings: {} });
      service.saveWeeklySettings.mockResolvedValue({ settings: {} });
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/v1/workspaces/${workspace}/availability/weekly/settings`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(service.readWeeklySettings).toHaveBeenCalledWith(actor, workspace);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/workspaces/${workspace}/availability/weekly/settings`,
            headers,
            payload: { ...settings, actor: "spoof", can_edit: true },
          })
        ).statusCode,
      ).toBe(200);
      expect(service.saveWeeklySettings).toHaveBeenCalledWith(
        actor,
        workspace,
        settings,
        key,
      );
    } finally {
      await app.close();
    }
  });
  it.each([
    ["42501", 403],
    ["40001", 409],
    ["22023", 400],
  ] as const)(
    "maps settings failure %s without accepting changes",
    async (code, status) => {
      const { app, service } = setup();
      service.saveWeeklySettings.mockRejectedValue(
        rpcFailure({ message: "Settings rejected", code }),
      );
      try {
        const result = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspace}/availability/weekly/settings`,
          headers: { authorization: "Bearer test", "idempotency-key": key },
          payload: {
            input_mode: "time_range",
            onboarding_required: false,
            expected_revision: 0,
          },
        });
        expect(result.statusCode).toBe(status);
      } finally {
        await app.close();
      }
    },
  );
  it("rejects a settings save without a key before invoking the service", async () => {
    const { app, service } = setup();
    try {
      const result = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/weekly/settings`,
        headers: { authorization: "Bearer test" },
        payload: {
          input_mode: "time_range",
          onboarding_required: false,
          expected_revision: 0,
        },
      });
      expect(result.statusCode).toBe(400);
      expect(service.saveWeeklySettings).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("uses the authenticated actor for reads and keyed saves", async () => {
    const { app, service } = setup();
    const headers = { authorization: "Bearer test", "idempotency-key": key };
    try {
      service.readWeekly.mockResolvedValue({});
      service.saveWeekly.mockResolvedValue({});
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/v1/workspaces/${workspace}/availability/weekly?employee_id=${employee}`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(service.readWeekly).toHaveBeenCalledWith(
        actor,
        workspace,
        employee,
      );
      // M5: there is nothing to preview before a save.
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/workspaces/${workspace}/availability/weekly/preview`,
            headers,
            payload: command,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/workspaces/${workspace}/availability/weekly`,
            headers,
            payload: { ...command, actor: "spoof" },
          })
        ).statusCode,
      ).toBe(200);
      expect(service.saveWeekly).toHaveBeenCalledWith(
        actor,
        workspace,
        command,
        key,
      );
    } finally {
      await app.close();
    }
  });
  it("requires authentication, matching workspace, valid command and idempotency key", async () => {
    const { app, service } = setup();
    try {
      const send = (
        payload: object,
        headers = { authorization: "Bearer test" },
      ) =>
        app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspace}/availability/weekly`,
          headers,
          payload,
        });
      expect((await send(command)).statusCode).toBe(400);
      expect((await send({ ...command, enabled: false })).statusCode).toBe(400);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/v1/workspaces/${workspace}/availability/weekly`,
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/v1/workspaces/${key}/availability/weekly`,
            headers: { authorization: "Bearer test" },
          })
        ).statusCode,
      ).toBe(404);
      expect(service.saveWeekly).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("refuses a week with two time ranges on a day before the database sees it", async () => {
    const { app, service } = setup();
    const preference = emptyWeeklyPreference("time_range");
    preference.days[5]!.ranges = [
      { start: "09:00", end: "12:00" },
      { start: "17:00", end: "24:00" },
    ];
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/weekly`,
        headers: { authorization: "Bearer test", "idempotency-key": key },
        payload: { ...command, preference },
      });
      expect(response.statusCode).toBe(400);
      expect(service.saveWeekly).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it.each([
    ["42501", 403],
    ["PT409", 409],
    ["40001", 409],
    ["22023", 400],
    ["23514", 400],
    ["XX000", 500],
  ])("maps %s errors without claiming success", async (code, status) => {
    const { app, service } = setup();
    service.saveWeekly.mockRejectedValue(
      rpcFailure({ message: "database-private-detail", code }),
    );
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/weekly`,
        headers: { authorization: "Bearer test", "idempotency-key": key },
        payload: command,
      });
      expect(response.statusCode).toBe(status);
      if (status === 500)
        expect(response.body).not.toContain("database-private-detail");
    } finally {
      await app.close();
    }
  });
  it("uses verified onboarding identity services, not a client workspace", async () => {
    const { app, service } = setup();
    const headers = {
      authorization: "Bearer employee-token",
      "idempotency-key": key,
    };
    try {
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/me/onboarding/availability/weekly",
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/me/onboarding/availability/weekly/preview",
            headers,
            payload: command,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/me/onboarding/availability/weekly",
            headers,
            payload: command,
          })
        ).statusCode,
      ).toBe(200);
      // No query: the default onboarding case is used.
      expect(service.onboardingReadWeekly).toHaveBeenCalledWith(
        "employee-token",
        undefined,
      );
      expect(service.onboardingSaveWeekly).toHaveBeenCalledWith(
        "employee-token",
        command,
        key,
        undefined,
      );
      expect(service.saveWeekly).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("forwards an optional onboarding workspace query", async () => {
    const { app, service } = setup();
    const workspaceId = "ad418000-0000-4000-8000-000000000009";
    const headers = { authorization: "Bearer employee-token" };
    try {
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/v1/me/onboarding/availability/weekly?workspaceId=${workspaceId}`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(service.onboardingReadWeekly).toHaveBeenCalledWith(
        "employee-token",
        workspaceId,
      );
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/me/onboarding/availability/weekly?workspaceId=nope",
            headers,
          })
        ).statusCode,
      ).toBe(400);
      expect(service.onboardingReadWeekly).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  // BL-1028: a week saved over a newer one says so with a key, so the form
  // offers Reload for that refusal and not for any other 409.
  it("passes the database's availability.changed key on with the 409", async () => {
    const { app, service } = setup();
    service.saveWeekly.mockRejectedValue(
      rpcFailure({ message: "Availability changed. Reload before saving; your draft has not been saved.", code: "PT409", hint: "availability.changed" }),
    );
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/weekly`,
        headers: { authorization: "Bearer test", "idempotency-key": key },
        payload: command,
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: "Availability changed. Reload before saving; your draft has not been saved.",
        reason: "availability.changed",
      });
    } finally {
      await app.close();
    }
  });
  // The "no" contract: not a member is 404, any other authz.* is 403.
  it.each([
    ["authz.not_member", 404],
    ["authz.rank", 403],
    ["authz.out_of_scope", 403],
    ["authz.missing_permission", 403],
  ] as const)("answers a core %s with %s", async (reason, status) => {
    const { app, service } = setup();
    service.saveWeekly.mockRejectedValue(rpcFailure({ message: "Not allowed", code: "42501", hint: reason }));
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/weekly`,
        headers: { authorization: "Bearer test", "idempotency-key": key },
        payload: command,
      });
      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({ reason });
    } finally {
      await app.close();
    }
  });
  it.each([
    ["GET", "/weekly"],
    ["POST", "/weekly"],
    ["GET", "/weekly/settings"],
    ["POST", "/weekly/settings"],
    ["GET", "/weekly/team"],
  ] as const)("hides a workspace the caller is not in: %s %s is 404", async (method, path) => {
    const { app, service } = setup();
    try {
      const response = await app.inject({
        method,
        url: `/v1/workspaces/${key}/availability${path}`,
        headers: { authorization: "Bearer test", "idempotency-key": key },
        payload: method === "POST" ? (path === "/weekly" ? command : { input_mode: "time_range", onboarding_required: false, expected_revision: 0 }) : undefined,
      });
      expect(response.statusCode).toBe(404);
      // BL-794: the one "not a member" answer, so the web reads it as no access.
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(Object.values(service).every((call) => call.mock.calls.length === 0)).toBe(true);
    } finally {
      await app.close();
    }
  });
  // The core decides the settings save (settings.availability.write), not the route.
  it("lets the core answer a settings save", async () => {
    const { app, service } = setup(["availability.read"]);
    service.saveWeeklySettings.mockRejectedValue(rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.missing_permission" }));
    try {
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/weekly/settings`,
        headers: { authorization: "Bearer test", "idempotency-key": key },
        payload: { input_mode: "time_range", onboarding_required: false, expected_revision: 0 },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.missing_permission" });
      expect(service.saveWeeklySettings).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
