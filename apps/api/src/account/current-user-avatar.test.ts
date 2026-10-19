import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { activeWorkspaceContextSchema } from "@newfork/shared";
import { registerAvatarRoutes } from "../avatars/avatar-routes";
import { createAvatarServiceWithClient } from "../avatars/avatar-service";

// The app shell's person circle reads this workspace's avatar of the signed-in person (AVATAR-IKON §4.3).
describe("current user avatar", () => {
  it("signs the service-validated private workspace photo for five minutes", async () => {
    const rpc = vi.fn(async () => ({
      data: { kind: "photo", art_key: null, photo_path: "workspace/membership/photo.png", suggested: [] },
      error: null,
    }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://example.test/signed" }, error: null }));
    const service = createAvatarServiceWithClient({ rpc, storage: { from: () => ({ createSignedUrl }) } } as never);
    expect(await service.own({ actorUserId: "self", workspaceId: "workspace" })).toEqual({
      present: true,
      url: "https://example.test/signed",
      avatar: { kind: "photo", url: "https://example.test/signed" },
      suggested: [],
    });
    expect(rpc).toHaveBeenCalledWith("get_own_avatar_service", { actor_user_id: "self", target_workspace_id: "workspace" });
    expect(createSignedUrl).toHaveBeenCalledWith("workspace/membership/photo.png", 300);
  });

  it("uses authenticated identity without directory read permission and rejects cross-workspace access", async () => {
    const userId = "75000000-0000-4000-8000-000000000001";
    const workspaceId = "75000000-0000-4000-8000-000000000102";
    const context = activeWorkspaceContextSchema.parse({
      userId,
      workspace: { id: workspaceId, name: "Self avatar" },
      permissions: [],
      locationScope: { allLocations: false, locationIds: [] },
      onboarding: { status: "complete", currentStep: 2 },
      documentAccess: { restricted: false },
      membership: {
        id: "75000000-0000-4000-8000-000000000201",
        userId,
        workspaceId,
        access: { employee: true, management: null },
        status: "active",
      },
    });
    const rpc = vi.fn(async () => ({ data: { kind: null, art_key: null, photo_path: null, suggested: [] }, error: null }));
    const app = Fastify();
    registerAvatarRoutes(app, {
      service: createAvatarServiceWithClient({ rpc, storage: { from: () => ({}) } } as never),
      contextResolver: { resolve: async () => ({ ...context, permissions: [] }) },
    });
    const result = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${context.workspace.id}/me/avatar?actor_user_id=someone-else`,
      headers: { authorization: "Bearer token" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ present: false, url: null, avatar: null, suggested: [] });
    expect(rpc).toHaveBeenCalledWith("get_own_avatar_service", {
      actor_user_id: context.userId,
      target_workspace_id: context.workspace.id,
    });
    const denied = await app.inject({
      method: "GET",
      url: "/v1/workspaces/75000000-0000-4000-8000-000000000101/me/avatar",
      headers: { authorization: "Bearer token" },
    });
    expect(denied.statusCode).toBe(404);
    const anonymous = await app.inject({ method: "GET", url: `/v1/workspaces/${context.workspace.id}/me/avatar` });
    expect(anonymous.statusCode).toBe(401);
    expect(rpc).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
