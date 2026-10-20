import { authzActionKeys, avatarReasons, type ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { createEmployeeDirectoryServiceWithClient } from "../employees/employee-directory-service";
import { createAvatarServiceWithClient } from "./avatar-service";

// AVATAR-IKON (design §4.3-4.5): a person reads and writes their own avatar in one workspace through
// the API; photos land in the workspace's private employee-profile-photos bucket under their own
// membership's place, and a manager reads or removes only a photo somebody uploaded. The database's
// authorization core answers every "no": a stranger 404, anyone else 403.

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const membershipId = "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4";
const otherMembershipId = "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e5";
const otherWorkspaceId = "16fe2550-8960-480c-9874-cbc76a8e56a9";
const employeeId = "15000000-0000-4000-8000-000000000001";
const objectId = "fe201916-aa0e-480b-9144-1e1c8da20a31";
const ownPhoto = `${workspaceId}/${membershipId}/${objectId}.png`;
const previousPhoto = `${workspaceId}/${membershipId}/fe201916-aa0e-480b-9144-1e1c8da20a32.jpg`;
const sourcePhoto = `${otherWorkspaceId}/${otherMembershipId}/fe201916-aa0e-480b-9144-1e1c8da20a33.webp`;
const ownPath = new RegExp(`^${workspaceId}/${membershipId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);

const context: ActiveWorkspaceContext = {
  userId,
  workspace: {
    id: workspaceId,
    name: "Meyhouse",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: { id: membershipId, userId, workspaceId, access: { employee: true, management: null }, status: "active" },
  permissions: [],
  actions: [...authzActionKeys],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: false, locationIds: [] },
};

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

type RpcAnswer = { data: unknown; error: { code?: string; message: string; hint?: string | null; details?: string | null } | null };

function world(options: {
  rpc?: Record<string, RpcAnswer | ((args: Record<string, unknown>) => RpcAnswer)>;
  download?: Blob | null;
  context?: ActiveWorkspaceContext | null;
  membership?: null;
  uploadError?: boolean;
  downloadError?: { message: string; status?: number; statusCode?: string };
} = {}) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const answer = options.rpc?.[name];
    if (!answer) return { data: null, error: null };
    return typeof answer === "function" ? answer(args) : answer;
  });
  const createSignedUrl = vi.fn(async (path: string, _ttl: number) => ({
    data: { signedUrl: `https://storage.test/signed/${path}` },
    error: null,
  }));
  const createSignedUploadUrl = vi.fn(async (path: string) =>
    options.uploadError
      ? { data: null, error: { message: "storage down" } }
      : { data: { signedUrl: `https://storage.test/upload/${path}`, token: "upload-token", path }, error: null },
  );
  const download = vi.fn(async (_path: string) =>
    options.download
      ? { data: options.download, error: null }
      : { data: null, error: options.downloadError ?? { message: "Object not found", status: 400, statusCode: "404" } },
  );
  const remove = vi.fn(async (_paths: string[]) => ({ data: [], error: null }));
  const copy = vi.fn(async (_from: string, to: string) => ({ data: { path: to }, error: null }));
  const from = vi.fn((_bucket: string) => ({ createSignedUrl, createSignedUploadUrl, download, remove, copy }));
  // The session names the person; the membership is read only after the core said yes (ownPlace).
  const getUser = vi.fn(async (token: string) => ({
    data: { user: token === "valid-token" ? ({ id: userId } as never) : null },
    error: null,
  }));
  const memberships = vi.fn((_table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: options.membership === null ? null : { id: membershipId }, error: null }),
    };
    return query;
  });
  const client = { rpc, auth: { getUser }, from: memberships, storage: { from } };
  const app = buildApp({
    contextResolver: { resolve: async () => (options.context === undefined ? context : options.context) },
    avatarService: createAvatarServiceWithClient(client),
    employeeDirectoryService: createEmployeeDirectoryServiceWithClient(client),
  });
  return { app, rpc, from, createSignedUrl, createSignedUploadUrl, download, remove, copy };
}

const auth = { authorization: "Bearer valid-token" };
const me = `/v1/workspaces/${workspaceId}/me/avatar`;
const ownRead = (avatar: Record<string, unknown>) => ({
  data: { suggested: ["001-server", "027-server-notepad"], ...avatar },
  error: null,
});
const refusal = (hint: string, code = "42501") => ({ data: null, error: { code, message: "Not allowed", hint, details: "avatar.self" } });

describe("GET /me/avatar", () => {
  it("answers a photo with a five-minute signed address, beside present and url", async () => {
    const w = world({ rpc: { get_own_avatar_service: ownRead({ kind: "photo", art_key: null, photo_path: ownPhoto }) } });
    const response = await w.app.inject({ method: "GET", url: `${me}?actor_user_id=someone-else`, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      present: true,
      url: `https://storage.test/signed/${ownPhoto}`,
      avatar: { kind: "photo", url: `https://storage.test/signed/${ownPhoto}` },
      suggested: ["001-server", "027-server-notepad"],
    });
    expect(w.rpc).toHaveBeenCalledWith("get_own_avatar_service", { actor_user_id: userId, target_workspace_id: workspaceId });
    expect(w.from).toHaveBeenCalledWith("employee-profile-photos");
    expect(w.createSignedUrl).toHaveBeenCalledWith(ownPhoto, 300);
  });

  it("answers a drawing by its key, with no url and no storage", async () => {
    const w = world({ rpc: { get_own_avatar_service: ownRead({ kind: "art", art_key: "003-bartender", photo_path: null }) } });
    const response = await w.app.inject({ method: "GET", url: me, headers: auth });
    expect(response.json()).toEqual({
      present: true,
      url: null,
      avatar: { kind: "art", art_key: "003-bartender" },
      suggested: ["001-server", "027-server-notepad"],
    });
    expect(w.createSignedUrl).not.toHaveBeenCalled();
  });

  it("answers no avatar as not present", async () => {
    const w = world({ rpc: { get_own_avatar_service: ownRead({ kind: null, art_key: null, photo_path: null, suggested: [] }) } });
    const response = await w.app.inject({ method: "GET", url: me, headers: auth });
    expect(response.json()).toEqual({ present: false, url: null, avatar: null, suggested: [] });
  });

  it("answers a stranger with the core's 404, and a signed-out caller or an unknown session with 401, asking nobody", async () => {
    const stranger = world({ rpc: { get_own_avatar_service: refusal("authz.not_member") } });
    const response = await stranger.app.inject({ method: "GET", url: me, headers: auth });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    const nobody = world();
    expect((await nobody.app.inject({ method: "GET", url: me })).statusCode).toBe(401);
    const unknown = await nobody.app.inject({ method: "GET", url: me, headers: { authorization: "Bearer expired-token" } });
    expect(unknown.statusCode).toBe(401);
    expect(nobody.rpc).not.toHaveBeenCalled();
  });

  it("answers the core's other refusals with 403 and their reason", async () => {
    const w = world({ rpc: { get_own_avatar_service: refusal("authz.not_active") } });
    const response = await w.app.inject({ method: "GET", url: me, headers: auth });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.not_active" });
  });

  it("answers the core's not_member with 404", async () => {
    const w = world({ rpc: { get_own_avatar_service: refusal("authz.not_member") } });
    const response = await w.app.inject({ method: "GET", url: me, headers: auth });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /me/avatar/upload", () => {
  const upload = `${me}/upload`;

  it("hands a signed upload into the member's own place, the type from the body and the place from the core's yes", async () => {
    const w = world();
    const response = await w.app.inject({
      method: "POST",
      url: upload,
      headers: auth,
      payload: { content_type: "image/png", membership_id: otherMembershipId, path: sourcePhoto, workspace_id: otherWorkspaceId },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { path: string; token: string };
    expect(body.token).toBe("upload-token");
    expect(body.path).toMatch(ownPath);
    expect(body.path.endsWith(".png")).toBe(true);
    expect(w.from).toHaveBeenCalledWith("employee-profile-photos");
    expect(w.createSignedUploadUrl).toHaveBeenCalledWith(body.path);
    // The core said yes (avatar.self) before storage was reached.
    expect(w.rpc).toHaveBeenCalledWith("get_own_avatar_service", { actor_user_id: userId, target_workspace_id: workspaceId });
  });

  it.each([["image/jpeg", ".jpg"], ["image/webp", ".webp"]])("names a %s upload %s", async (type, extension) => {
    const w = world();
    const response = await w.app.inject({ method: "POST", url: upload, headers: auth, payload: { content_type: type } });
    expect((response.json() as { path: string }).path.endsWith(extension)).toBe(true);
  });

  it("refuses an image that is not JPG, PNG or WebP before storage", async () => {
    const w = world();
    const response = await w.app.inject({ method: "POST", url: upload, headers: auth, payload: { content_type: "image/gif" } });
    expect(response.statusCode).toBe(400);
    expect(w.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses somebody the core does not let change their avatar here with 403, before storage", async () => {
    const w = world({ rpc: { get_own_avatar_service: refusal("authz.out_of_scope") } });
    const response = await w.app.inject({ method: "POST", url: upload, headers: auth, payload: { content_type: "image/png" } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "avatar.self" });
    expect(w.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("answers a stranger with 404", async () => {
    const w = world({ rpc: { get_own_avatar_service: refusal("authz.not_member") } });
    const response = await w.app.inject({ method: "POST", url: upload, headers: auth, payload: { content_type: "image/png" } });
    expect(response.statusCode).toBe(404);
    expect(w.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("answers 503 when private upload is unavailable", async () => {
    const w = world({ uploadError: true });
    const response = await w.app.inject({ method: "POST", url: upload, headers: auth, payload: { content_type: "image/png" } });
    expect(response.statusCode).toBe(503);
  });
});

describe("PUT /me/avatar", () => {
  const saved = (previous: string | null = null) => ({ data: { previous_photo_path: previous }, error: null });

  it("saves a drawing and deletes the photo it replaced", async () => {
    const w = world({ rpc: { save_own_avatar_service: saved(previousPhoto) } });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { art_key: "003-bartender" } });
    expect(response.statusCode).toBe(204);
    expect(w.rpc).toHaveBeenCalledWith("save_own_avatar_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      choice: { art_key: "003-bartender" },
    });
    expect(w.remove).toHaveBeenCalledWith([previousPhoto]);
  });

  it("deletes nothing when nothing was replaced", async () => {
    const w = world({ rpc: { save_own_avatar_service: saved(null) } });
    await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { art_key: "003-bartender" } });
    expect(w.remove).not.toHaveBeenCalled();
  });

  it("checks an uploaded photo in storage, then saves it and deletes the old one", async () => {
    const w = world({ rpc: { save_own_avatar_service: saved(previousPhoto) }, download: new Blob([png], { type: "image/png" }) });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(204);
    expect(w.download).toHaveBeenCalledWith(ownPhoto);
    expect(w.rpc).toHaveBeenCalledWith("save_own_avatar_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      choice: { photo_path: ownPhoto },
    });
    expect(w.remove).toHaveBeenCalledWith([previousPhoto]);
    expect(w.remove).not.toHaveBeenCalledWith([ownPhoto]);
  });

  it("refuses a photo over 5 MB with 400 and deletes it, saving nothing", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(png);
    const w = world({ download: new Blob([big], { type: "image/png" }) });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ reason: avatarReasons.photoInvalid });
    expect(w.remove).toHaveBeenCalledWith([ownPhoto]);
    expect(w.rpc).not.toHaveBeenCalledWith("save_own_avatar_service", expect.anything());
  });

  it("refuses a photo whose bytes are not its type with 400 and deletes it", async () => {
    const w = world({ download: new Blob([jpeg], { type: "image/png" }) });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(400);
    expect(w.remove).toHaveBeenCalledWith([ownPhoto]);
    expect(w.rpc).not.toHaveBeenCalledWith("save_own_avatar_service", expect.anything());
  });

  it("refuses a photo stored as another type with 400 and deletes it", async () => {
    const w = world({ download: new Blob([png], { type: "image/gif" }) });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(400);
    expect(w.remove).toHaveBeenCalledWith([ownPhoto]);
  });

  it("refuses a photo that is not in storage with 400", async () => {
    const w = world({ download: null });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ reason: avatarReasons.photoInvalid });
    expect(w.rpc).not.toHaveBeenCalledWith("save_own_avatar_service", expect.anything());
  });

  it("answers 503 when storage cannot be read, deleting nothing", async () => {
    const w = world({ download: null, downloadError: { message: "upstream timeout", status: 504, statusCode: "504" } });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(503);
    expect(w.remove).not.toHaveBeenCalled();
    expect(w.rpc).not.toHaveBeenCalledWith("save_own_avatar_service", expect.anything());
  });

  it("deletes the uploaded photo when the save is refused", async () => {
    const w = world({
      rpc: {
        save_own_avatar_service: refusal("authz.not_active"),
        get_own_avatar_service: ownRead({ kind: "photo", art_key: null, photo_path: previousPhoto }),
      },
      download: new Blob([png], { type: "image/png" }),
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(403);
    expect(w.remove).toHaveBeenCalledWith([ownPhoto]);
    expect(w.remove).not.toHaveBeenCalledWith([previousPhoto]);
  });

  it("keeps the photo when the refused save named the avatar already there", async () => {
    const w = world({
      rpc: {
        save_own_avatar_service: refusal("authz.out_of_scope"),
        get_own_avatar_service: ownRead({ kind: "photo", art_key: null, photo_path: ownPhoto }),
      },
      download: new Blob([png], { type: "image/png" }),
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(403);
    expect(w.remove).not.toHaveBeenCalled();
  });

  it("keeps the photo when it cannot tell whether it is the avatar already there", async () => {
    // The core's first read says yes (one's own place); the one after the refused save cannot be read.
    let reads = 0;
    const w = world({
      rpc: {
        save_own_avatar_service: refusal("authz.not_active"),
        get_own_avatar_service: () =>
          reads++ === 0 ? ownRead({ kind: null, art_key: null, photo_path: null }) : refusal("authz.not_active"),
      },
      download: new Blob([png], { type: "image/png" }),
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: ownPhoto } });
    expect(response.statusCode).toBe(403);
    expect(reads).toBe(2);
    expect(w.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["a drawing", { art_key: "003-bartender" }],
    ["a photo", { photo_path: ownPhoto }],
    ["the last avatar", { use_last: true }],
  ])("refuses %s from somebody the core does not let change their avatar here, before storage", async (_name, payload) => {
    const no = refusal("authz.out_of_scope");
    const w = world({
      rpc: { get_own_avatar_service: no, get_last_avatar_service: no, save_own_avatar_service: no },
      download: new Blob([png], { type: "image/png" }),
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "avatar.self" });
    expect(w.download).not.toHaveBeenCalled();
    expect(w.remove).not.toHaveBeenCalled();
    expect(w.copy).not.toHaveBeenCalled();
  });

  it.each([
    ["another member's place", `${workspaceId}/${otherMembershipId}/${objectId}.png`],
    ["another workspace", `${otherWorkspaceId}/${membershipId}/${objectId}.png`],
    ["a way out of one's own place", `${workspaceId}/${membershipId}/../${otherMembershipId}/${objectId}.png`],
    ["an extra folder", `${workspaceId}/${membershipId}/extra/${objectId}.png`],
  ])("refuses a photo path in %s with 403, touching no object", async (_name, path) => {
    const w = world({ download: new Blob([png], { type: "image/png" }) });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { photo_path: path } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "avatar.self" });
    expect(w.download).not.toHaveBeenCalled();
    expect(w.remove).not.toHaveBeenCalled();
    expect(w.rpc).not.toHaveBeenCalledWith("save_own_avatar_service", expect.anything());
  });

  it("uses a last drawing by saving its key", async () => {
    const w = world({
      rpc: {
        get_last_avatar_service: { data: { kind: "art", art_key: "001-server", source_photo_path: null, from_workspace_name: "Other" }, error: null },
        save_own_avatar_service: saved(null),
      },
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { use_last: true } });
    expect(response.statusCode).toBe(204);
    expect(w.rpc).toHaveBeenCalledWith("get_last_avatar_service", { actor_user_id: userId, target_workspace_id: workspaceId });
    expect(w.rpc).toHaveBeenCalledWith("save_own_avatar_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      choice: { art_key: "001-server" },
    });
    expect(w.copy).not.toHaveBeenCalled();
  });

  it("uses a last photo by copying it into this workspace's own place, then deletes the photo it replaced", async () => {
    const w = world({
      rpc: {
        get_last_avatar_service: { data: { kind: "photo", art_key: null, source_photo_path: sourcePhoto, from_workspace_name: "Other" }, error: null },
        save_own_avatar_service: saved(previousPhoto),
      },
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { use_last: true } });
    expect(response.statusCode).toBe(204);
    const [from, to] = w.copy.mock.calls[0]!;
    expect(from).toBe(sourcePhoto);
    expect(to).toMatch(ownPath);
    expect(to.endsWith(".webp")).toBe(true);
    expect(w.rpc).toHaveBeenCalledWith("save_own_avatar_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      choice: { photo_path: to },
    });
    expect(w.remove).toHaveBeenCalledWith([previousPhoto]);
    expect(w.remove).not.toHaveBeenCalledWith([sourcePhoto]);
  });

  it("deletes the copy when the save is refused", async () => {
    const w = world({
      rpc: {
        get_last_avatar_service: { data: { kind: "photo", art_key: null, source_photo_path: sourcePhoto, from_workspace_name: "Other" }, error: null },
        save_own_avatar_service: refusal("authz.not_active"),
      },
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { use_last: true } });
    expect(response.statusCode).toBe(403);
    const [, to] = w.copy.mock.calls[0]!;
    expect(w.remove).toHaveBeenCalledWith([to]);
  });

  it("answers 409 when there is no last avatar to use", async () => {
    const w = world({ rpc: { get_last_avatar_service: { data: null, error: null } } });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { use_last: true } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ reason: avatarReasons.noLastAvatar });
    expect(w.rpc).not.toHaveBeenCalledWith("save_own_avatar_service", expect.anything());
  });

  it("answers a drawing the database does not know (23503) with 400", async () => {
    const w = world({ rpc: { save_own_avatar_service: { data: null, error: { code: "23503", message: 'insert or update on table "member_avatars" violates foreign key constraint' } } } });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { art_key: "003-bartender" } });
    expect(response.statusCode).toBe(400);
    expect(response.payload).not.toContain("member_avatars");
  });

  it("refuses a choice that is none of the three with 400 before the database", async () => {
    const w = world();
    for (const payload of [{}, { art_key: "no-such-drawing" }, { use_last: false }]) {
      const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload });
      expect(response.statusCode).toBe(400);
    }
    expect(w.rpc).not.toHaveBeenCalled();
  });

  it("answers the core's not_member with 404 and its other refusals with 403", async () => {
    const stranger = world({ rpc: { save_own_avatar_service: refusal("authz.not_member") } });
    expect((await stranger.app.inject({ method: "PUT", url: me, headers: auth, payload: { art_key: "003-bartender" } })).statusCode).toBe(404);
    const suspended = world({ rpc: { save_own_avatar_service: refusal("authz.not_active") } });
    expect((await suspended.app.inject({ method: "PUT", url: me, headers: auth, payload: { art_key: "003-bartender" } })).statusCode).toBe(403);
  });
});

describe("DELETE /me/avatar", () => {
  it("removes one's own avatar and deletes its photo", async () => {
    const w = world({ rpc: { remove_own_avatar_service: { data: { previous_photo_path: ownPhoto }, error: null } } });
    const response = await w.app.inject({ method: "DELETE", url: me, headers: auth });
    expect(response.statusCode).toBe(204);
    expect(w.rpc).toHaveBeenCalledWith("remove_own_avatar_service", { actor_user_id: userId, target_workspace_id: workspaceId });
    expect(w.remove).toHaveBeenCalledWith([ownPhoto]);
  });

  it("deletes no object when the avatar was a drawing", async () => {
    const w = world({ rpc: { remove_own_avatar_service: { data: { previous_photo_path: null }, error: null } } });
    expect((await w.app.inject({ method: "DELETE", url: me, headers: auth })).statusCode).toBe(204);
    expect(w.remove).not.toHaveBeenCalled();
  });

  it("answers the core's refusals with 404 or 403", async () => {
    const stranger = world({ rpc: { remove_own_avatar_service: refusal("authz.not_member") } });
    expect((await stranger.app.inject({ method: "DELETE", url: me, headers: auth })).statusCode).toBe(404);
    const closed = world({ rpc: { remove_own_avatar_service: refusal("authz.workspace_closed") } });
    expect((await closed.app.inject({ method: "DELETE", url: me, headers: auth })).statusCode).toBe(403);
  });
});

describe("GET /me/last-avatar", () => {
  const last = `/v1/workspaces/${workspaceId}/me/last-avatar`;

  it("offers a last drawing with the workspace it came from", async () => {
    const w = world({
      rpc: { get_last_avatar_service: { data: { kind: "art", art_key: "001-server", source_photo_path: null, from_workspace_name: "Other" }, error: null } },
    });
    const response = await w.app.inject({ method: "GET", url: last, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ avatar: { kind: "art", art_key: "001-server" }, from_workspace_name: "Other" });
  });

  it("offers a last photo by a signed address, never its path", async () => {
    const w = world({
      rpc: { get_last_avatar_service: { data: { kind: "photo", art_key: null, source_photo_path: sourcePhoto, from_workspace_name: "Other" }, error: null } },
    });
    const response = await w.app.inject({ method: "GET", url: last, headers: auth });
    expect(response.json()).toEqual({
      avatar: { kind: "photo", url: `https://storage.test/signed/${sourcePhoto}` },
      from_workspace_name: "Other",
    });
    expect(w.createSignedUrl).toHaveBeenCalledWith(sourcePhoto, 300);
  });

  it("offers nothing when there is no last avatar", async () => {
    const w = world({ rpc: { get_last_avatar_service: { data: null, error: null } } });
    const response = await w.app.inject({ method: "GET", url: last, headers: auth });
    expect(response.json()).toEqual({ avatar: null, from_workspace_name: null });
  });

  it("answers a stranger with 404 and the core's other refusals with 403", async () => {
    const stranger = world({ rpc: { get_last_avatar_service: refusal("authz.not_member") } });
    expect((await stranger.app.inject({ method: "GET", url: last, headers: auth })).statusCode).toBe(404);
    const suspended = world({ rpc: { get_last_avatar_service: refusal("authz.not_active") } });
    expect((await suspended.app.inject({ method: "GET", url: last, headers: auth })).statusCode).toBe(403);
  });
});

// AVATAR-IKON 5.1: somebody still onboarding here has no active workspace context (it opens once the
// onboarding is approved), yet avatar.self is theirs: the database's core answers for them as for anybody.
describe("somebody still onboarding here", () => {
  const onboarding = { context: null } as const;

  it("reads their avatar and the last one from another workspace", async () => {
    const w = world({
      ...onboarding,
      rpc: {
        get_own_avatar_service: ownRead({ kind: null, art_key: null, photo_path: null }),
        get_last_avatar_service: { data: { kind: "art", art_key: "001-server", source_photo_path: null, from_workspace_name: "Other" }, error: null },
      },
    });
    expect((await w.app.inject({ method: "GET", url: me, headers: auth })).statusCode).toBe(200);
    const last = await w.app.inject({ method: "GET", url: `${me.replace(/avatar$/, "last-avatar")}`, headers: auth });
    expect(last.statusCode).toBe(200);
    expect(last.json()).toEqual({ avatar: { kind: "art", art_key: "001-server" }, from_workspace_name: "Other" });
  });

  it("keeps the last avatar here", async () => {
    const w = world({
      ...onboarding,
      rpc: {
        get_last_avatar_service: { data: { kind: "photo", art_key: null, source_photo_path: sourcePhoto, from_workspace_name: "Other" }, error: null },
        save_own_avatar_service: { data: { previous_photo_path: null }, error: null },
      },
    });
    const response = await w.app.inject({ method: "PUT", url: me, headers: auth, payload: { use_last: true } });
    expect(response.statusCode).toBe(204);
    // The copy lands in their own membership's place, the one the core said yes to.
    expect(w.copy.mock.calls[0]![1]).toMatch(ownPath);
  });

  it("uploads a photo into their own place", async () => {
    const w = world(onboarding);
    const response = await w.app.inject({ method: "POST", url: `${me}/upload`, headers: auth, payload: { content_type: "image/png" } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { path: string }).path).toMatch(ownPath);
  });
});

describe("the manager's photo read and removal keep their paths and shape", () => {
  const photo = `/v1/workspaces/${workspaceId}/employees/${employeeId}/avatar`;

  it("reads a person's uploaded photo as present with a five-minute signed address", async () => {
    const w = world({ rpc: { get_member_avatar_service: { data: ownPhoto, error: null } } });
    const response = await w.app.inject({ method: "GET", url: photo, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ present: true, url: `https://storage.test/signed/${ownPhoto}` });
    expect(w.rpc).toHaveBeenCalledWith("get_member_avatar_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_employee_id: employeeId,
    });
    expect(w.createSignedUrl).toHaveBeenCalledWith(ownPhoto, 300);
  });

  it("reads a drawing or no avatar as no photo", async () => {
    const w = world({ rpc: { get_member_avatar_service: { data: null, error: null } } });
    const response = await w.app.inject({ method: "GET", url: photo, headers: auth });
    expect(response.json()).toEqual({ present: false, url: null });
  });

  it("removes the photo and deletes its object", async () => {
    const w = world({ rpc: { remove_member_photo_service: { data: ownPhoto, error: null } } });
    const response = await w.app.inject({ method: "DELETE", url: photo, headers: auth });
    expect(response.statusCode).toBe(204);
    expect(w.rpc).toHaveBeenCalledWith("remove_member_photo_service", {
      actor_user_id: userId,
      target_workspace_id: workspaceId,
      target_employee_id: employeeId,
    });
    expect(w.from).toHaveBeenCalledWith("employee-profile-photos");
    expect(w.remove).toHaveBeenCalledWith([ownPhoto]);
  });

  it("answers a drawing or no avatar (PT409 avatar.not_photo) with 409", async () => {
    const w = world({ rpc: { remove_member_photo_service: { data: null, error: { code: "PT409", message: "Not a photo", hint: "avatar.not_photo" } } } });
    const response = await w.app.inject({ method: "DELETE", url: photo, headers: auth });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ reason: avatarReasons.notPhoto });
    expect(w.remove).not.toHaveBeenCalled();
  });
});
