import { createClient } from "@supabase/supabase-js";
import {
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
import { HttpError, rpcFailure } from "../http-error";

// AVATAR-IKON (design §4.3-4.5): one's own avatar in one workspace, read and written through the API.
// Every read and write asks the database's authorization core (avatar.self); storage is reached only
// with the service role, in the workspace's private employee-profile-photos bucket, and only at paths
// in the caller's own membership's place or paths the database handed back.

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}
/** The caller's own membership here, from the workspace context the API resolved, never from the client. */
interface OwnPlace extends Actor {
  readonly membershipId: string;
}

export interface AvatarService {
  own(input: Actor): Promise<OwnAvatarResponse>;
  last(input: Actor): Promise<LastAvatarResponse>;
  prepareUpload(input: OwnPlace & { readonly contentType: EmployeeProfilePhotoMimeType }): Promise<AvatarUploadResponse>;
  save(input: OwnPlace & { readonly choice: AvatarChoice }): Promise<void>;
  remove(input: Actor): Promise<void>;
}

type RpcError = { message: string; code?: string; hint?: string | null; details?: string | null };
type StorageResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
interface AvatarBucket {
  createSignedUrl(path: string, expiresIn: number): StorageResult<{ signedUrl: string }>;
  createSignedUploadUrl(path: string): StorageResult<{ token: string }>;
  download(path: string): StorageResult<Blob>;
  remove(paths: string[]): StorageResult<unknown>;
  copy(fromPath: string, toPath: string): StorageResult<unknown>;
}
export interface AvatarClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
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

function outOfOwnPlace(): HttpError {
  // The same answer the database gives a path outside one's own place (save_own_avatar_service).
  return new HttpError("Not allowed", 403, { reason: "authz.out_of_scope", detail: "avatar.self" });
}

export function createAvatarServiceWithClient(client: AvatarClient): AvatarService {
  const bucket = () => client.storage.from(employeeProfilePhotoBucket);

  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  const actorArgs = (input: Actor) => ({ actor_user_id: input.actorUserId, target_workspace_id: input.workspaceId });

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
    if (error || !data || !type)
      throw new HttpError("Uploaded photo could not be verified", 400, { reason: "avatar.photo_invalid" });
    const fits =
      data.size >= 1 &&
      data.size <= employeeProfilePhotoMaxBytes &&
      (!data.type || data.type === type) &&
      photoBytesMatch(new Uint8Array(await data.slice(0, 12).arrayBuffer()), type);
    if (!fits) {
      await bucket().remove([path]);
      throw new HttpError("A photo must be a JPG, PNG or WebP image of at most 5 MB", 400, {
        reason: "avatar.photo_invalid",
      });
    }
  }

  /** Saves the choice and hands back the photo it replaced, for the caller to delete. */
  async function saveChoice(input: Actor, choice: { art_key: string } | { photo_path: string }) {
    return replaced.parse(await rpc("save_own_avatar_service", { ...actorArgs(input), choice })).previous_photo_path;
  }

  return {
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

    async prepareUpload(input) {
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
      if ("art_key" in choice) return deleteReplaced(await saveChoice(input, { art_key: choice.art_key }));

      if ("photo_path" in choice) {
        // Never read or delete an object outside one's own place, whatever the client sent.
        if (!isMemberAvatarPhotoPath(choice.photo_path, input)) throw outOfOwnPlace();
        await checkUploadedPhoto(choice.photo_path);
        return deleteReplaced(await saveChoice(input, { photo_path: choice.photo_path }));
      }

      // The last avatar: a drawing by its key; a photo copied from where it is into this workspace's place.
      const last = lastRead.parse(await rpc("get_last_avatar_service", actorArgs(input)));
      if (last?.kind === "art" && last.art_key) return deleteReplaced(await saveChoice(input, { art_key: last.art_key }));
      const type = last?.source_photo_path ? memberAvatarPhotoContentType(last.source_photo_path) : null;
      if (!last?.source_photo_path || !type)
        throw new HttpError("There is no last avatar to use", 409, { reason: "avatar.no_last_avatar" });
      const copy = buildMemberAvatarPhotoPath({
        workspaceId: input.workspaceId,
        membershipId: input.membershipId,
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
