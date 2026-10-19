import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { employeeProfilePhotoBucket } from "@newfork/shared";
import { apiRequest, supabaseClient } from "../lib/supabase";
import { RequestError } from "../lib/request-error";
import {
  avatarErrorText,
  ownAvatarKey,
  uploadAvatarPhoto,
  useRemoveAvatar,
  useSaveAvatar,
} from "./avatar-data";

const uploadToSignedUrl = vi.fn();
const storageFrom = vi.fn((_bucket: string) => ({ uploadToSignedUrl }));
vi.mock("../lib/supabase", () => ({
  supabaseClient: { storage: { from: (bucket: string) => storageFrom(bucket) } },
  apiRequest: vi.fn(),
}));

const workspaceId = "51000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  uploadToSignedUrl.mockResolvedValue({ data: {}, error: null });
});

describe("avatar data (AVATAR-IKON)", () => {
  it("uploads a photo to the place the API names, in the workspace's private bucket", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ path: `${workspaceId}/m-1/p.png`, token: "t-1" });
    const photo = new File(["png"], "profile.png", { type: "image/png" });
    await expect(uploadAvatarPhoto(workspaceId, photo)).resolves.toBe(`${workspaceId}/m-1/p.png`);
    expect(apiRequest).toHaveBeenCalledWith(supabaseClient, `/v1/workspaces/${workspaceId}/me/avatar/upload`, {
      method: "POST",
      body: JSON.stringify({ content_type: "image/png" }),
    });
    expect(storageFrom).toHaveBeenCalledWith(employeeProfilePhotoBucket);
    expect(uploadToSignedUrl).toHaveBeenCalledWith(`${workspaceId}/m-1/p.png`, "t-1", photo, {
      contentType: "image/png",
      upsert: false,
    });
  });

  it("tells storage's refusal as photos being unavailable", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ path: "p", token: "t" });
    uploadToSignedUrl.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });
    const failure = await uploadAvatarPhoto(workspaceId, new Blob(["x"], { type: "image/png" })).catch((e) => e);
    expect(avatarErrorText(failure)).toBe("Photos are unavailable right now. Try again in a moment.");
  });

  it("words the refusals the window shows", () => {
    expect(avatarErrorText(new RequestError("x", "avatar.photo_invalid", undefined, 400))).toBe(
      "This photo couldn't be used. Try a JPG, PNG or WebP under 5 MB.",
    );
    expect(avatarErrorText(new RequestError("x", undefined, undefined, 503))).toBe(
      "Photos are unavailable right now. Try again in a moment.",
    );
    expect(avatarErrorText(new RequestError("Workspace not found", "authz.not_member", undefined, 404))).toBe(
      "Workspace not found",
    );
  });

  it("reads one's avatar here again after a save and a removal", async () => {
    vi.mocked(apiRequest).mockResolvedValue(null);
    const cache = new QueryClient();
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: cache }, children);
    const save = renderHook(() => useSaveAvatar(workspaceId), { wrapper });
    await act(() => save.result.current.mutateAsync({ art_key: "001-server" }));
    expect(apiRequest).toHaveBeenCalledWith(supabaseClient, `/v1/workspaces/${workspaceId}/me/avatar`, {
      method: "PUT",
      body: JSON.stringify({ art_key: "001-server" }),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownAvatarKey(workspaceId) });
    invalidate.mockClear();
    const remove = renderHook(() => useRemoveAvatar(workspaceId), { wrapper });
    await act(() => remove.result.current.mutateAsync());
    expect(apiRequest).toHaveBeenCalledWith(supabaseClient, `/v1/workspaces/${workspaceId}/me/avatar`, {
      method: "DELETE",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ownAvatarKey(workspaceId) });
  });
});
