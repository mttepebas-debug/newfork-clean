import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
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

  // The session names the person, never the query; another workspace is the core's to refuse (5.1: no
  // active workspace context is asked for, so somebody still onboarding reads theirs too).
  it("uses authenticated identity without directory read permission and rejects cross-workspace access", async () => {
    const userId = "75000000-0000-4000-8000-000000000001";
    const workspaceId = "75000000-0000-4000-8000-000000000102";
    const otherWorkspaceId = "75000000-0000-4000-8000-000000000101";
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) =>
      args.target_workspace_id === workspaceId
        ? { data: { kind: null, art_key: null, photo_path: null, suggested: [] }, error: null }
        : { data: null, error: { code: "42501", message: "Not allowed", hint: "authz.not_member", details: "avatar.self" } },
    );
    const getUser = vi.fn(async (token: string) => ({
      data: { user: token === "token" ? { id: userId } : null },
      error: null,
    }));
    const app = Fastify();
    registerAvatarRoutes(app, {
      service: createAvatarServiceWithClient({ rpc, auth: { getUser }, storage: { from: () => ({}) } } as never),
    });
    const result = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/me/avatar?actor_user_id=someone-else`,
      headers: { authorization: "Bearer token" },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ present: false, url: null, avatar: null, suggested: [] });
    expect(rpc).toHaveBeenCalledWith("get_own_avatar_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
    });
    const denied = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${otherWorkspaceId}/me/avatar`,
      headers: { authorization: "Bearer token" },
    });
    expect(denied.statusCode).toBe(404);
    const anonymous = await app.inject({ method: "GET", url: `/v1/workspaces/${workspaceId}/me/avatar` });
    expect(anonymous.statusCode).toBe(401);
    expect(rpc).toHaveBeenCalledTimes(2);
    await app.close();
  });
});
