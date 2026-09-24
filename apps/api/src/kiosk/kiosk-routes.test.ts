import type { ActiveWorkspaceContext, KioskDevice } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { KioskService } from "./kiosk-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const locationId = "11000000-0000-4000-8000-000000000001";
const employeeId = "15000000-0000-4000-8000-000000000001";
const deviceId = "a8100000-0000-4000-8000-000000000001";
const context: ActiveWorkspaceContext = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspaceId,
    role: "manager",
    status: "active",
    allLocations: false,
  },
  permissions: [
    "workspace.read",
    "kiosk.device.enroll.location",
    "kiosk.device.read.location",
    "kiosk.device.revoke.location",
    "kiosk.pin.reset.location",
    "kiosk.audit.read.location",
  ],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  locationScope: { allLocations: false, locationIds: [locationId] },
};
const device: KioskDevice = {
  id: deviceId,
  workspace_id: workspaceId,
  location_id: locationId,
  label: "Front counter",
  status: "active",
  credential_version: 1,
  created_at: "2026-08-17T12:00:00.000Z",
  last_seen_at: null,
  revoked_at: null,
};

describe("kiosk routes", () => {
  it("creates a location-scoped enrollment from authenticated actor context", async () => {
    const calls: unknown[] = [];
    const app = kioskApp(
      kioskService({
        createEnrollment: async (input) => {
          calls.push(input);
          return {
            id: "a8000000-0000-4000-8000-000000000001",
            workspace_id: workspaceId,
            location_id: locationId,
            label: "Front counter",
            code: "ABCDE-FGHIJ-KLMNO-PQRST",
            expires_at: "2026-08-17T12:10:00.000Z",
          };
        },
      }),
    );
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kiosk/enrollments`,
      headers: { authorization: "Bearer manager" },
      payload: {
        actorUserId: "11111111-1111-4111-8111-111111111111",
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        location_id: locationId,
        label: "Front counter",
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(calls).toEqual([
      {
        actorUserId: context.userId,
        workspaceId,
        locationId,
        label: "Front counter",
      },
    ]);
  });

  it("rejects enrollment outside the manager location scope", async () => {
    const app = kioskApp(kioskService());
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kiosk/enrollments`,
      headers: { authorization: "Bearer manager" },
      payload: {
        location_id: "11000000-0000-4000-8000-000000000002",
        label: "Other counter",
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("exchanges and rotates device credentials only through HTTP-only cookies", async () => {
    const seen: string[] = [];
    const app = kioskApp(
      kioskService({
        exchange: async () => ({ device, credential: "device-secret" }),
        rotate: async (credential) => {
          seen.push(credential);
          return {
            device: { ...device, credential_version: 2 },
            credential: "replacement-secret",
          };
        },
      }),
    );
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/kiosk/enrollments/exchange",
      headers: { origin: "http://127.0.0.1:5555" },
      payload: { code: "ABCDE-FGHIJ-KLMNO-PQRST" },
    });
    expect(exchange.statusCode, exchange.body).toBe(201);
    expect(exchange.json()).toEqual({ device });
    expect(exchange.headers["set-cookie"]).toContain(
      "newfork-kiosk-device=device-secret",
    );
    expect(exchange.headers["set-cookie"]).toContain("HttpOnly");
    expect(exchange.headers["cache-control"]).toBe("no-store");
    expect(exchange.headers["access-control-allow-credentials"]).toBe("true");
    expect(exchange.body).not.toContain("device-secret");

    const rotate = await app.inject({
      method: "POST",
      url: "/v1/kiosk/device/credentials/rotate",
      headers: { cookie: "newfork-kiosk-device=device-secret" },
    });
    expect(rotate.statusCode, rotate.body).toBe(200);
    expect(seen).toEqual(["device-secret"]);
    expect(rotate.headers["set-cookie"]).toContain("replacement-secret");
  });

  it("derives revocation and PIN reset provenance outside client payloads", async () => {
    const calls: unknown[] = [];
    const app = kioskApp(
      kioskService({
        revoke: async (input) => {
          calls.push(input);
        },
        setPin: async (input) => {
          calls.push(input);
          return {
            employee_id: employeeId,
            workspace_id: workspaceId,
            location_id: locationId,
            updated_at: "2026-08-17T12:00:00.000Z",
          };
        },
      }),
    );
    const pin = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/kiosk/employees/${employeeId}/pin`,
      headers: { authorization: "Bearer manager" },
      payload: {
        actorUserId: "11111111-1111-4111-8111-111111111111",
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        employeeId: "11111111-1111-4111-8111-111111111111",
        employee_id: "11111111-1111-4111-8111-111111111111",
        location_id: locationId,
        pin: "123456",
      },
    });
    const revoke = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/kiosk/devices/${deviceId}`,
      headers: { authorization: "Bearer manager" },
    });
    expect(pin.statusCode, pin.body).toBe(200);
    expect(revoke.statusCode, revoke.body).toBe(204);
    expect(calls).toEqual([
      {
        actorUserId: context.userId,
        workspaceId,
        locationId,
        employeeId,
        pin: "123456",
      },
      { actorUserId: context.userId, workspaceId, deviceId },
    ]);
  });

  it("rejects malformed PINs before calling the service", async () => {
    const app = kioskApp(kioskService());
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/kiosk/employees/${employeeId}/pin`,
      headers: { authorization: "Bearer manager" },
      payload: { location_id: locationId, pin: "12345" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns generic verification failures and a short action cookie on success", async () => {
    const invalidApp = kioskApp(
      kioskService({ verify: async () => ({ status: "invalid" }) }),
    );
    const invalid = await invalidApp.inject({
      method: "POST",
      url: "/v1/kiosk/verify",
      headers: { cookie: "newfork-kiosk-device=device-secret" },
      payload: { employee_id: employeeId, pin: "000000" },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json()).toEqual({ error: "Kiosk verification failed" });

    const successApp = kioskApp(
      kioskService({
        verify: async () => ({
          status: "verified",
          actionToken: "one-action-secret",
          expiresAt: "2026-08-17T12:01:00.000Z",
        }),
      }),
    );
    const success = await successApp.inject({
      method: "POST",
      url: "/v1/kiosk/verify",
      headers: { cookie: "newfork-kiosk-device=device-secret" },
      payload: { employee_id: employeeId, pin: "123456" },
    });
    expect(success.statusCode, success.body).toBe(200);
    expect(success.json()).toEqual({
      verified: true,
      expires_at: "2026-08-17T12:01:00.000Z",
    });
    expect(success.headers["set-cookie"]).toContain(
      "newfork-kiosk-action=one-action-secret",
    );
    expect(success.headers["set-cookie"]).toContain("Max-Age=60");
    expect(success.body).not.toContain("one-action-secret");
  });

  it("serves the minimal directory and consumes a cookie-bound time action", async () => {
    const calls: unknown[] = [];
    const app = kioskApp(
      kioskService({
        getDirectory: async (credential) => {
          calls.push(["directory", credential]);
          return {
            device: {
              id: deviceId,
              label: "Front counter",
              workspace_id: workspaceId,
              workspace_name: "Meyhouse",
              location: {
                id: locationId,
                name: "Main Dining",
                timezone: "America/Los_Angeles",
              },
            },
            employees: [{ id: employeeId, display_name: "Ada Lovelace" }],
          };
        },
        getActionState: async (credential, actionToken) => {
          calls.push(["state", credential, actionToken]);
          return {
            employee: { id: employeeId, display_name: "Ada Lovelace" },
            location: {
              id: locationId,
              name: "Main Dining",
              timezone: "America/Los_Angeles",
            },
            current_session: null,
            expected_revision: 0,
            allowed_actions: ["clock_in"],
            blocked_reason: null,
            expires_at: "2026-08-17T12:01:00.000Z",
          };
        },
        capture: async (credential, actionToken, input) => {
          calls.push(["capture", credential, actionToken, input]);
          return {
            status: "accepted",
            session: {
              id: "a8200000-0000-4000-8000-000000000001",
              capture_state: "open",
              revision: 1,
              last_event_at: input.occurred_at,
            },
            events: [
              {
                id: "a8300000-0000-4000-8000-000000000001",
                event_type: "clock_in",
                occurred_at: input.occurred_at,
                received_at: "2026-08-17T12:00:01.000Z",
              },
            ],
            idempotent_replay: false,
          };
        },
      }),
    );
    const cookie =
      "newfork-kiosk-device=device-secret; newfork-kiosk-action=action-secret";
    const directory = await app.inject({
      method: "GET",
      url: "/v1/kiosk",
      headers: { cookie },
    });
    const state = await app.inject({
      method: "GET",
      url: "/v1/kiosk/action",
      headers: { cookie },
    });
    const capture = await app.inject({
      method: "POST",
      url: "/v1/kiosk/actions",
      headers: { cookie },
      payload: {
        action: "clock_in",
        expected_revision: 0,
        occurred_at: "2026-08-17T12:00:00.000Z",
        idempotency_key: "a8400000-0000-4000-8000-000000000001",
      },
    });
    expect(directory.statusCode, directory.body).toBe(200);
    expect(directory.body).not.toContain("pin");
    expect(state.statusCode, state.body).toBe(200);
    expect(capture.statusCode, capture.body).toBe(200);
    expect(capture.json().status).toBe("accepted");
    expect(capture.headers["set-cookie"]).toContain("newfork-kiosk-action=;");
    expect(calls).toEqual([
      ["directory", "device-secret"],
      ["state", "device-secret", "action-secret"],
      [
        "capture",
        "device-secret",
        "action-secret",
        {
          action: "clock_in",
          expected_revision: 0,
          occurred_at: "2026-08-17T12:00:00.000Z",
          idempotency_key: "a8400000-0000-4000-8000-000000000001",
        },
      ],
    ]);
  });

  it("maps stale kiosk state to conflict and clears action authority", async () => {
    const app = kioskApp(
      kioskService({
        capture: async () => ({
          status: "conflict",
          reason: "stale_state",
        }),
      }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/kiosk/actions",
      headers: {
        cookie:
          "newfork-kiosk-device=device-secret; newfork-kiosk-action=action-secret",
      },
      payload: {
        action: "break_end",
        expected_revision: 1,
        occurred_at: "2026-08-17T12:00:00.000Z",
        idempotency_key: "a8400000-0000-4000-8000-000000000002",
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      status: "conflict",
      reason: "stale_state",
    });
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
  });

  it("serves manager controls and derives mutation provenance from context", async () => {
    const calls: unknown[] = [];
    const app = kioskApp(
      kioskService({
        getManagement: async (input) => {
          calls.push(["read", input]);
          return {
            workspace_id: workspaceId,
            locations: [
              {
                id: locationId,
                name: "Main Dining",
                timezone: "America/Los_Angeles",
                can_enroll: true,
                can_reset_pin: true,
              },
            ],
            devices: [{ ...device, location_name: "Main Dining" }],
            employees: [
              {
                id: employeeId,
                display_name: "Ada Lovelace",
                employee_code: "E-0001",
                location_ids: [locationId],
                pin_configured: true,
              },
            ],
            events: [],
          };
        },
        updateLabel: async (input) => {
          calls.push(["label", input]);
          return { ...device, label: input.label };
        },
        createReenrollment: async (input) => {
          calls.push(["replace", input]);
          return {
            id: "a8500000-0000-4000-8000-000000000001",
            workspace_id: workspaceId,
            location_id: locationId,
            label: "Front counter",
            code: "ABCDE-FGHIJ-KLMNO-PQRST",
            expires_at: "2026-08-17T12:10:00.000Z",
          };
        },
      }),
    );
    const headers = { authorization: "Bearer manager" };
    const read = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/kiosk/management`,
      headers,
    });
    const label = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/kiosk/devices/${deviceId}`,
      headers,
      payload: {
        actorUserId: "11111111-1111-4111-8111-111111111111",
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        deviceId: "11111111-1111-4111-8111-111111111111",
        device_id: "11111111-1111-4111-8111-111111111111",
        label: "Host stand",
      },
    });
    const replace = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kiosk/devices/${deviceId}/re-enrollment`,
      headers,
    });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.body).not.toContain("credential_hash");
    expect(read.body).not.toContain("code_hash");
    expect(read.body).not.toContain("pin_hash");
    expect(label.statusCode, label.body).toBe(200);
    expect(replace.statusCode, replace.body).toBe(201);
    expect(calls).toEqual([
      ["read", { actorUserId: context.userId, workspaceId }],
      [
        "label",
        {
          actorUserId: context.userId,
          workspaceId,
          deviceId,
          label: "Host stand",
        },
      ],
      ["replace", { actorUserId: context.userId, workspaceId, deviceId }],
    ]);
  });

  it("requires both enrollment and revoke authority for replacement", async () => {
    const limitedContext = {
      ...context,
      permissions: context.permissions.filter(
        (permission) => permission !== "kiosk.device.revoke.location",
      ),
    };
    const app = buildApp({
      contextResolver: { resolve: async () => limitedContext },
      kioskService: kioskService(),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kiosk/devices/${deviceId}/re-enrollment`,
      headers: { authorization: "Bearer limited" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("returns a generic not found for every manager route when the active workspace mismatches the path", async () => {
    const service = kioskService({
      createEnrollment: vi.fn(),
      getManagement: vi.fn(),
      updateLabel: vi.fn(),
      createReenrollment: vi.fn(),
      revoke: vi.fn(),
      setPin: vi.fn(),
    });
    const app = buildApp({
      contextResolver: {
        resolve: async () => ({
          ...context,
          workspace: { ...context.workspace, id: otherWorkspaceId },
          membership: { ...context.membership, workspaceId: otherWorkspaceId },
        }),
      },
      kioskService: service,
    });
    const routes = [
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/kiosk/enrollments`,
        payload: { location_id: locationId, label: "Front counter" },
        serviceMethod: "createEnrollment",
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/kiosk/management`,
        serviceMethod: "getManagement",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/kiosk/devices/${deviceId}`,
        payload: { label: "Host stand" },
        serviceMethod: "updateLabel",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/kiosk/devices/${deviceId}/re-enrollment`,
        serviceMethod: "createReenrollment",
      },
      {
        method: "DELETE",
        url: `/v1/workspaces/${workspaceId}/kiosk/devices/${deviceId}`,
        serviceMethod: "revoke",
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/kiosk/employees/${employeeId}/pin`,
        payload: { location_id: locationId, pin: "123456" },
        serviceMethod: "setPin",
      },
    ] as const;

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: "Bearer manager" },
        payload: "payload" in route ? route.payload : undefined,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Workspace not found" });
      expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    }
  });
});

function kioskApp(service: KioskService) {
  return buildApp({
    contextResolver: { resolve: async () => context },
    kioskService: service,
  });
}

function kioskService(overrides: Partial<KioskService> = {}): KioskService {
  return {
    getManagement: async () => {
      throw new Error("not used");
    },
    updateLabel: async () => {
      throw new Error("not used");
    },
    createReenrollment: async () => {
      throw new Error("not used");
    },
    getDirectory: async () => {
      throw new Error("not used");
    },
    getActionState: async () => {
      throw new Error("not used");
    },
    capture: async () => {
      throw new Error("not used");
    },
    cancel: async () => {
      throw new Error("not used");
    },
    createEnrollment: async () => {
      throw new Error("not used");
    },
    exchange: async () => {
      throw new Error("not used");
    },
    rotate: async () => {
      throw new Error("not used");
    },
    revoke: async () => {
      throw new Error("not used");
    },
    setPin: async () => {
      throw new Error("not used");
    },
    verify: async () => {
      throw new Error("not used");
    },
    ...overrides,
  };
}
