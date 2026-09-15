import Fastify from "fastify";
import {
  emptyWeeklyPreference,
  type ActiveWorkspaceContext,
} from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
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
function setup() {
  const app = Fastify();
  const service = {
    readWeeklySettings: vi.fn(),
    saveWeeklySettings: vi.fn(),
    readWeekly: vi.fn(),
    readWeeklyTeam: vi.fn(),
    previewWeekly: vi.fn(),
    saveWeekly: vi.fn(),
    onboardingReadWeekly: vi.fn(),
    onboardingPreviewWeekly: vi.fn(),
    onboardingSaveWeekly: vi.fn(),
  };
  registerWeeklyPreferenceRoutes(app, {
    service,
    contextResolver: {
      resolve: async () =>
        ({
          userId: actor,
          permissions: ["availability.read", "settings.schedule_rules.manage"],
          workspace: { id: workspace },
          membership: { status: "active" },
          onboarding: { status: "complete" },
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
          Object.assign(new Error("private database detail"), { code }),
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
      warning_policy: "confirm",
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
    ["22023", 422],
  ] as const)(
    "maps settings failure %s without accepting changes",
    async (code, status) => {
      const { app, service } = setup();
      service.saveWeeklySettings.mockRejectedValue(
        Object.assign(new Error("Settings rejected"), { code }),
      );
      try {
        const result = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspace}/availability/weekly/settings`,
          headers: { authorization: "Bearer test", "idempotency-key": key },
          payload: {
            input_mode: "time_range",
            warning_policy: "warn",
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
  it("rejects missing keys and hard settings policy before invoking the service", async () => {
    const { app, service } = setup();
    try {
      const result = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspace}/availability/weekly/settings`,
        headers: { authorization: "Bearer test" },
        payload: {
          input_mode: "time_range",
          warning_policy: "hard",
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
  it("uses the authenticated actor for reads, previews and keyed saves", async () => {
    const { app, service } = setup();
    const headers = { authorization: "Bearer test", "idempotency-key": key };
    try {
      service.readWeekly.mockResolvedValue({});
      service.previewWeekly.mockResolvedValue({ items: [] });
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
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/workspaces/${workspace}/availability/weekly/preview`,
            headers,
            payload: { ...command, actor: "spoof" },
          })
        ).statusCode,
      ).toBe(200);
      expect(service.previewWeekly).toHaveBeenCalledWith(
        actor,
        workspace,
        command,
      );
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
      ).toBe(403);
      expect(service.saveWeekly).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it.each([
    ["42501", 403],
    ["PT409", 409],
    ["40001", 409],
    ["22023", 422],
    ["23514", 422],
    ["XX000", 500],
  ])("maps %s errors without claiming success", async (code, status) => {
    const { app, service } = setup();
    service.saveWeekly.mockRejectedValue(
      Object.assign(new Error("database-private-detail"), { code }),
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
            url: "/v1/me/onboarding/availability-lifecycle/weekly",
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/me/onboarding/availability-lifecycle/weekly/preview",
            headers,
            payload: command,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/me/onboarding/availability-lifecycle/weekly",
            headers,
            payload: command,
          })
        ).statusCode,
      ).toBe(200);
      expect(service.onboardingReadWeekly).toHaveBeenCalledWith(
        "employee-token",
      );
      expect(service.onboardingPreviewWeekly).toHaveBeenCalledWith(
        "employee-token",
        command,
      );
      expect(service.onboardingSaveWeekly).toHaveBeenCalledWith(
        "employee-token",
        command,
        key,
      );
      expect(service.saveWeekly).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
