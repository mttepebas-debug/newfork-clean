import { createClient } from "@supabase/supabase-js";
import {
  avatarReasons,
  avatarUploadResponseSchema,
  buildMemberAvatarPhotoPath,
  employeeProfilePhotoBucket,
  employeeProfilePhotoMaxBytes,
  employeeProfilePhotoSignedUrlTtlSeconds,
  isMemberAvatarPhotoPath,
  lastAvatarResponseSchema,
  lineupArtKeySchema,
  memberAvatarPhotoContentType,
  ownAvatarResponseSchema,
  type Avatar,
  type AvatarChoice,
  type AvatarUploadResponse,
  type EmployeeProfilePhotoMimeType,
  type LastAvatarResponse,
  type OwnAvatarResponse,
} from "@newfork/shared";
import { z } from "zod";
import { createUserVerifier } from "../auth/verify-user.js";
import { HttpError, rpcFailure } from "../http-error";

// AVATAR-IKON (design §4.3-4.5): one's own avatar in one workspace, read and written through the API.
// Every read and write asks the database's authorization core (avatar.self), which also says yes to
// somebody still onboarding there (5.1): no active workspace context is asked for. Storage is reached
// only with the service role, in the workspace's private employee-profile-photos bucket, and only at
// paths in the caller's own membership's place or paths the database handed back.

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}
/** The caller's own membership here, the one the core said yes to, never from the client. */
interface OwnPlace extends Actor {
  readonly membershipId: string;
}

export interface AvatarService {
  /** Whose session this is; null when the auth server does not know it. */
  actor(accessToken: string): Promise<string | null>;
  own(input: Actor): Promise<OwnAvatarResponse>;
  last(input: Actor): Promise<LastAvatarResponse>;
  prepareUpload(input: Actor & { readonly contentType: EmployeeProfilePhotoMimeType }): Promise<AvatarUploadResponse>;
  save(input: Actor & { readonly choice: AvatarChoice }): Promise<void>;
  remove(input: Actor): Promise<void>;
}

type RpcError = { message: string; code?: string; hint?: string | null; details?: string | null };
type StorageError = { message: string; status?: number; statusCode?: string; code?: string };
type StorageResult<T> = PromiseLike<{ data: T | null; error: StorageError | null }>;
interface AvatarBucket {
  createSignedUrl(path: string, expiresIn: number): StorageResult<{ signedUrl: string }>;
  createSignedUploadUrl(path: string): StorageResult<{ token: string }>;
  download(path: string): StorageResult<Blob>;
  remove(paths: string[]): StorageResult<unknown>;
  copy(fromPath: string, toPath: string): StorageResult<unknown>;
}
type OwnMembershipQuery = {
  eq(column: "workspace_id" | "user_id", value: string): OwnMembershipQuery;
  maybeSingle(): PromiseLike<{ data: { id: string; workspace_id: string } | null; error: RpcError | null }>;
};
export interface AvatarClient {
  auth: Parameters<typeof createUserVerifier>[0]["auth"];
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
  from(table: "workspace_memberships"): { select(columns: "id, workspace_id"): OwnMembershipQuery };
  storage: { from(bucket: string): AvatarBucket };
}

export function createAvatarService(options: { url: string; serviceRoleKey: string }): AvatarService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as AvatarClient;
  return createAvatarServiceWithClient(client);
}

export function avatarServiceFromEnvironment(): AvatarService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createAvatarService({ url, serviceRoleKey }) : null;
}

const ownRead = z.object({
  kind: z.enum(["photo", "art"]).nullable(),
  art_key: lineupArtKeySchema.nullable(),
  photo_path: z.string().nullable(),
  suggested: z.array(lineupArtKeySchema),
});
const lastRead = z
  .object({
    kind: z.enum(["photo", "art"]),
    art_key: lineupArtKeySchema.nullable(),
    source_photo_path: z.string().nullable(),
    from_workspace_name: z.string().nullable(),
  })
  .nullable();
const replaced = z.object({ previous_photo_path: z.string().nullable() });

/** Detects obvious type mismatches; this is not malware scanning or conversion. */
function photoBytesMatch(bytes: Uint8Array, type: EmployeeProfilePhotoMimeType): boolean {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  return text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
}

/** Storage says the object is not there (the API answers 400 with a 404 status code inside, or 404). */
function notFound(error: StorageError): boolean {
  return error.status === 404 || error.statusCode === "404" || error.code === "NoSuchKey" || error.code === "not_found";
}

function outOfOwnPlace(): HttpError {
  // The same answer the database gives a path outside one's own place (save_own_avatar_service).
  return new HttpError("Not allowed", 403, { reason: "authz.out_of_scope", detail: "avatar.self" });
}

export function createAvatarServiceWithClient(client: AvatarClient): AvatarService {
  const bucket = () => client.storage.from(employeeProfilePhotoBucket);
  const verifyUser = createUserVerifier(client);

  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  const actorArgs = (input: Actor) => ({ actor_user_id: input.actorUserId, target_workspace_id: input.workspaceId });

  /**
   * One's own place here, asked before storage is reached: the core's yes first (avatar.self, the read
   * that authorizes it), then the membership it said yes to. One membership per person and workspace.
   * Both ids come from the database: a path built from the address could differ in case from the
   * folders the account deletion sweep lists.
   */
  async function ownPlace(input: Actor): Promise<OwnPlace> {
    await rpc("get_own_avatar_service", actorArgs(input));
    const { data, error } = await client
      .from("workspace_memberships")
      .select("id, workspace_id")
      .eq("workspace_id", input.workspaceId)
      .eq("user_id", input.actorUserId)
      .maybeSingle();
    if (error) throw rpcFailure(error);
    if (!data) throw new HttpError("Workspace not found", 404, { reason: "authz.not_member" });
    return { actorUserId: input.actorUserId, workspaceId: data.workspace_id, membershipId: data.id };
  }

  async function signed(path: string): Promise<string | null> {
    const result = await bucket().createSignedUrl(path, employeeProfilePhotoSignedUrlTtlSeconds);
    return result.error ? null : (result.data?.signedUrl ?? null);
  }

  // Best effort: the database already forgot the photo; a failed delete leaves an object nobody points at.
  async function deleteReplaced(path: string | null) {
    if (path) await bucket().remove([path]);
  }

  /**
   * Reads the stored object back before it becomes anybody's avatar: the size, the stored type and the
   * first bytes, never what the client said. A photo that fails is deleted (the bucket's own 5 MB and type
   * limits are the first fence; this is the second).
   */
  async function checkUploadedPhoto(path: string) {
    const type = memberAvatarPhotoContentType(path);
    const { data, error } = await bucket().download(path);
    // Storage that cannot answer is not the photo's fault: nothing is deleted and the person may try again.
    if (error && !notFound(error)) throw new HttpError("Private storage is unavailable", 503);
    if (error || !data || !type)
      throw new HttpError("Uploaded photo could not be verified", 400, { reason: avatarReasons.photoInvalid });
    const fits =
      data.size >= 1 &&
      data.size <= employeeProfilePhotoMaxBytes &&
      (!data.type || data.type === type) &&
      photoBytesMatch(new Uint8Array(await data.slice(0, 12).arrayBuffer()), type);
    if (!fits) {
      await bucket().remove([path]);
      throw new HttpError("A photo must be a JPG, PNG or WebP image of at most 5 MB", 400, {
        reason: avatarReasons.photoInvalid,
      });
    }
  }

  /**
   * A just-checked upload whose save was refused is deleted, unless it is the avatar already saved (a person
   * may send their current photo again). When that cannot be read, the object stays: the account deletion
   * sweep of the person's folders takes it at the latest.
   */
  async function deleteUnsaved(input: Actor, path: string) {
    try {
      const current = ownRead.parse(await rpc("get_own_avatar_service", actorArgs(input))).photo_path;
      if (current !== path) await bucket().remove([path]);
    } catch {
      // keep it; see above
    }
  }

  /** Saves the choice and hands back the photo it replaced, for the caller to delete. */
  async function saveChoice(input: Actor, choice: { art_key: string } | { photo_path: string }) {
    return replaced.parse(await rpc("save_own_avatar_service", { ...actorArgs(input), choice })).previous_photo_path;
  }

  return {
    async actor(accessToken) {
      return (await verifyUser(accessToken))?.id ?? null;
    },

    async own(input) {
      const read = ownRead.parse(await rpc("get_own_avatar_service", actorArgs(input)));
      let avatar: Avatar | null = null;
      if (read.kind === "photo" && read.photo_path) avatar = { kind: "photo", url: await signed(read.photo_path) };
      else if (read.kind === "art" && read.art_key) avatar = { kind: "art", art_key: read.art_key };
      return ownAvatarResponseSchema.parse({
        present: avatar !== null,
        url: avatar?.kind === "photo" ? avatar.url : null,
        avatar,
        suggested: read.suggested,
      });
    },

    async last(input) {
      const read = lastRead.parse(await rpc("get_last_avatar_service", actorArgs(input)));
      if (!read) return { avatar: null, from_workspace_name: null };
      let avatar: Avatar | null = null;
      if (read.kind === "photo" && read.source_photo_path)
        avatar = { kind: "photo", url: await signed(read.source_photo_path) };
      else if (read.kind === "art" && read.art_key) avatar = { kind: "art", art_key: read.art_key };
      return lastAvatarResponseSchema.parse({ avatar, from_workspace_name: avatar ? read.from_workspace_name : null });
    },

    async prepareUpload(request) {
      const input = { ...(await ownPlace(request)), contentType: request.contentType };
      const path = buildMemberAvatarPhotoPath({
        workspaceId: input.workspaceId,
        membershipId: input.membershipId,
        objectId: crypto.randomUUID(),
        contentType: input.contentType,
      });
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data) throw new HttpError("Private upload is unavailable", 503);
      return avatarUploadResponseSchema.parse({ path, token: data.token });
    },

    async save(input) {
      const { choice } = input;
      // A drawing touches no storage: the save asks the core itself.
      if ("art_key" in choice) return deleteReplaced(await saveChoice(input, { art_key: choice.art_key }));

      if ("photo_path" in choice) {
        // Never read or delete an object outside one's own place, whatever the client sent.
        if (!isMemberAvatarPhotoPath(choice.photo_path, await ownPlace(input))) throw outOfOwnPlace();
        await checkUploadedPhoto(choice.photo_path);
        let replacedPhoto: string | null;
        try {
          replacedPhoto = await saveChoice(input, { photo_path: choice.photo_path });
        } catch (error) {
          await deleteUnsaved(input, choice.photo_path);
          throw error;
        }
        return deleteReplaced(replacedPhoto);
      }

      // The last avatar: a drawing by its key; a photo copied from where it is into this workspace's place.
      const last = lastRead.parse(await rpc("get_last_avatar_service", actorArgs(input)));
      if (last?.kind === "art" && last.art_key) return deleteReplaced(await saveChoice(input, { art_key: last.art_key }));
      const type = last?.source_photo_path ? memberAvatarPhotoContentType(last.source_photo_path) : null;
      if (!last?.source_photo_path || !type)
        throw new HttpError("There is no last avatar to use", 409, { reason: avatarReasons.noLastAvatar });
      const place = await ownPlace(input);
      const copy = buildMemberAvatarPhotoPath({
        workspaceId: place.workspaceId,
        membershipId: place.membershipId,
        objectId: crypto.randomUUID(),
        contentType: type,
      });
      const copied = await bucket().copy(last.source_photo_path, copy);
      if (copied.error) throw new HttpError("The last photo could not be copied", 503);
      let previous: string | null;
      try {
        previous = await saveChoice(input, { photo_path: copy });
      } catch (error) {
        await bucket().remove([copy]);
        throw error;
      }
      await deleteReplaced(previous);
    },

    async remove(input) {
      const result = replaced.parse(await rpc("remove_own_avatar_service", actorArgs(input)));
      await deleteReplaced(result.previous_photo_path);
    },
  };
}
