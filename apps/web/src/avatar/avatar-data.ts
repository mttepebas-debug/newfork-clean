import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  avatarReasons,
  avatarUploadResponseSchema,
  employeeProfilePhotoBucket,
  lastAvatarResponseSchema,
  ownAvatarResponseSchema,
  type AvatarChoice,
  type LastAvatarResponse,
  type OwnAvatarResponse,
} from "@newfork/shared";
import { apiRequest, supabaseClient } from "../lib/supabase";
import { RequestError, requestErrorText } from "../lib/request-error";

// AVATAR-IKON (design 4.3-4.4): one's own avatar in one workspace, read and written through the API.
// A photo goes from the browser straight to the workspace's private bucket at the place the API names
// (as documents do); the API reads it back before it becomes the avatar.

function client() {
  if (!supabaseClient) throw new Error("Avatar storage is not configured");
  return supabaseClient;
}
const me = (workspaceId: string) => `/v1/workspaces/${workspaceId}/me`;

/** Both keys start with a tenant-scoped prefix (auth/tenant-query-cache.ts): a workspace switch drops them. */
export const ownAvatarKey = (workspaceId: string | null | undefined) => ["own-avatar", workspaceId] as const;
export const lastAvatarKey = (workspaceId: string | null | undefined) => ["last-avatar", workspaceId] as const;

export async function getOwnAvatar(workspaceId: string): Promise<OwnAvatarResponse> {
  return ownAvatarResponseSchema.parse(await apiRequest(client(), `${me(workspaceId)}/avatar`));
}
export async function saveOwnAvatar(workspaceId: string, choice: AvatarChoice): Promise<void> {
  await apiRequest(client(), `${me(workspaceId)}/avatar`, { method: "PUT", body: JSON.stringify(choice) });
}
export async function removeOwnAvatar(workspaceId: string): Promise<void> {
  await apiRequest(client(), `${me(workspaceId)}/avatar`, { method: "DELETE" });
}
export async function getLastAvatar(workspaceId: string): Promise<LastAvatarResponse> {
  return lastAvatarResponseSchema.parse(await apiRequest(client(), `${me(workspaceId)}/last-avatar`));
}

/** Puts a photo in the workspace's private bucket; returns its path, for a save to name. */
export async function uploadAvatarPhoto(workspaceId: string, photo: Blob): Promise<string> {
  const storage = client();
  const place = avatarUploadResponseSchema.parse(
    await apiRequest(storage, `${me(workspaceId)}/avatar/upload`, {
      method: "POST",
      body: JSON.stringify({ content_type: photo.type }),
    }),
  );
  const { error } = await storage.storage
    .from(employeeProfilePhotoBucket)
    .uploadToSignedUrl(place.path, place.token, photo, { contentType: photo.type, upsert: false });
  // The photo was checked before (a JPG, PNG or WebP of at most 5 MB, cropped to 512 px): a refusal
  // here is storage's own, so it is told as photos being unavailable.
  if (error) throw new RequestError(error.message, undefined, undefined, 503);
  return place.path;
}

export const photoInvalidText = "This photo couldn't be used. Try a JPG, PNG or WebP under 5 MB.";
export const photosUnavailableText = "Photos are unavailable right now. Try again in a moment.";

/** What the avatar window says when a save or a removal failed. */
export function avatarErrorText(error: unknown): string {
  const { status, reason } = (error ?? {}) as { status?: unknown; reason?: unknown };
  if (reason === avatarReasons.photoInvalid) return photoInvalidText;
  if (status === 503) return photosUnavailableText;
  return requestErrorText(error);
}

const avatarRefreshMs = 240_000;

/** One's avatar here; a photo's signed address lives 5 minutes, so it is read again before it ends. */
export function useOwnAvatar(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ownAvatarKey(workspaceId),
    queryFn: () => getOwnAvatar(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: avatarRefreshMs,
    refetchInterval: avatarRefreshMs,
  });
}

/** The account's last avatar, offered in this workspace (onboarding). */
export function useLastAvatar(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: lastAvatarKey(workspaceId),
    queryFn: () => getLastAvatar(workspaceId!),
    enabled: Boolean(workspaceId),
    retry: false,
  });
}

/** Every circle that shows one's avatar here, and the last avatar a save or removal changed. */
async function refresh(cache: QueryClient, workspaceId: string) {
  await Promise.all([
    cache.invalidateQueries({ queryKey: ownAvatarKey(workspaceId) }),
    cache.invalidateQueries({ queryKey: ["last-avatar"] }),
  ]);
}

export function useSaveAvatar(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (choice: AvatarChoice) => saveOwnAvatar(workspaceId, choice),
    onSuccess: () => refresh(cache, workspaceId),
  });
}

export function useRemoveAvatar(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () => removeOwnAvatar(workspaceId),
    onSuccess: () => refresh(cache, workspaceId),
  });
}
