import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import { settingsReadsService, type SettingsReadsService } from "./settings-reads-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const context = {
  userId,
  workspace: { id: workspaceId, name: "Meyhouse" },
  membership: { access: { employee: false, management: "manager" }, status: "active" },
  permissions: [],
  actions: [],
} as unknown as ActiveWorkspaceContext;
const location = {
  id: "10000000-0000-4000-8000-000000000001", workspace_id: workspaceId, name: "Kadikoy",
  short_name: "KDK", phone: null, street_address: null, city: null, region: null, postal_code: null,
  country_code: "US", timezone: "America/New_York", sort_order: 0, archived_at: null,
};

function app(service: SettingsReadsService, resolved: ActiveWorkspaceContext | null = context) {
  return buildApp({ settingsReadsService: service, contextResolver: { resolve: async () => resolved } });
}
function get(built: ReturnType<typeof app>, path: string) {
  return built.inject({ method: "GET", url: `/v1/workspaces/${path}`, headers: { authorization: "Bearer valid-token" } });
}
const refusal = (hint: string) =>
  rpcFailure({ code: "42501", message: "Not allowed", hint, details: "settings.locations.read" });

describe("Settings reads (FB-6.1.9)", () => {
  it("reads through the service as the signed-in person", async () => {
    const read = vi.fn(async () => [location]);
    const built = app({ read } as SettingsReadsService);
    const response = await get(built, `${workspaceId}/settings/locations?actor_user_id=11111111-1111-4111-8111-111111111111`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([location]);
    expect(read).toHaveBeenCalledExactlyOnceWith("locations", { actorUserId: userId, workspaceId });
    await built.close();
  });

  it("hands Settings → Jobs the system key that marks Management and the Owner job (BL-218) and each job's Lineup drawings (AVATAR-IKON)", async () => {
    const management = {
      id: "30000000-0000-4000-8000-000000000001", workspace_id: workspaceId, name: "Leadership",
      color: "#4478A8", archived_at: null, system_key: "management",
    };
    const owner = {
      ...management, id: "40000000-0000-4000-8000-000000000001", department_id: management.id,
      name: "Owner", system_key: "owner", lineup_icons: ["007-gm"],
    };
    const cook = {
      ...owner, id: "40000000-0000-4000-8000-000000000002", department_id: null, name: "Cook", system_key: null,
      lineup_icons: ["003-bartender", "001-server"],
    };
    const rpc = vi.fn(async () => ({ data: { departments: [management], jobs: [owner, cook] }, error: null }));
    const built = app(settingsReadsService({ rpc }));
    const response = await get(built, `${workspaceId}/settings/jobs`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ departments: [management], jobs: [owner, cook] });
    await built.close();
  });

  it("answers the core's no with 403 and its reason", async () => {
    const built = app({ read: vi.fn(async () => { throw refusal("authz.missing_permission"); }) } as SettingsReadsService);
    const response = await get(built, `${workspaceId}/settings/roles`);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.missing_permission", detail: "settings.locations.read" });
    await built.close();
  });

  it("answers somebody who is not a member with 404, from the resolver or the core", async () => {
    const read = vi.fn(async () => { throw refusal("authz.not_member"); });
    for (const built of [app({ read } as SettingsReadsService), app({ read } as SettingsReadsService, null)]) {
      const response = await get(built, `${workspaceId}/settings/jobs`);
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      await built.close();
    }
  });

  it("refuses an unknown page or workspace id before asking anybody", async () => {
    const read = vi.fn();
    const built = app({ read } as unknown as SettingsReadsService);
    for (const path of [`${workspaceId}/settings/payroll`, `not-a-uuid/settings/locations`])
      expect((await get(built, path)).statusCode).toBe(400);
    expect(read).not.toHaveBeenCalled();
    await built.close();
  });
});

describe("Settings reads service (FB-6.1.9)", () => {
  it("calls each page's own service function and parses the contract", async () => {
    const rpc = vi.fn(async () => ({ data: { departments: [], jobs: [] }, error: null }));
    expect(await settingsReadsService({ rpc }).read("jobs", { actorUserId: userId, workspaceId })).toEqual({ departments: [], jobs: [] });
    expect(rpc).toHaveBeenCalledWith("read_settings_jobs_service", { actor_user_id: userId, target_workspace_id: workspaceId });
  });

  it("turns the core's refusal into an HttpError carrying the reason", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "42501", message: "Not allowed", hint: "authz.out_of_scope", details: "settings.jobs.read" } }));
    await expect(settingsReadsService({ rpc }).read("jobs", { actorUserId: userId, workspaceId }))
      .rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
  });
});
