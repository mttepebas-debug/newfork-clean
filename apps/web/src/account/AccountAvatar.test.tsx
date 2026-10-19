import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnAvatarResponse } from "@newfork/shared";
import { MemberAvatar } from "../avatar/MemberAvatar";
import { AccountAvatar, CurrentUserAvatar } from "./AccountAvatar";
import { apiRequest } from "../lib/supabase";

// The drawings without the real ~370 KB chunk.
vi.mock("../lineup-art/useLineupArt", () => ({
  useLineupArtSvgs: () => ({ "003-bartender": '<svg data-art="003-bartender"></svg>' }),
  loadLineupArtSvgs: async () => ({}),
}));

vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: vi.fn() }));

let context: { userId: string; workspace: { id: string; name: string } } | null;
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account: { displayName: "Test User" }, context }),
}));

const workspaceId = "51000000-0000-4000-8000-000000000001";

function withQueries(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("MemberAvatar (AVATAR-IKON)", () => {
  it("shows a photo, falls back to the initials when it cannot load", () => {
    const view = render(
      <MemberAvatar avatar={{ kind: "photo", url: "https://example.test/me.png" }} name="Test User" size={36} />,
    );
    expect(view.container.querySelector("img")?.src).toBe("https://example.test/me.png");
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByText("TU")).toBeTruthy();
  });

  it("shows a drawing from the archive", () => {
    const view = render(<MemberAvatar avatar={{ kind: "art", art_key: "003-bartender" }} name="Test User" size={36} />);
    expect(view.container.querySelector("[data-art='003-bartender']")).not.toBeNull();
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.queryByText("TU")).toBeNull();
  });

  it("shows the initials with no avatar, or a photo with no address", () => {
    const view = render(<MemberAvatar avatar={null} name="Test User" size={36} className="account-avatar" />);
    expect(screen.getByText("TU")).toBeTruthy();
    expect(view.container.firstElementChild?.classList.contains("account-avatar")).toBe(true);
    view.rerender(<MemberAvatar avatar={{ kind: "photo", url: null }} name="Test User" size={36} />);
    expect(view.container.querySelector("img")).toBeNull();
    expect(screen.getByText("TU")).toBeTruthy();
  });
});

describe("AccountAvatar and CurrentUserAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context = { userId: "u-1", workspace: { id: workspaceId, name: "Meyhouse" } };
  });

  it("draw the avatar of the workspace the person is in", async () => {
    const own: OwnAvatarResponse = {
      present: true,
      url: null,
      avatar: { kind: "art", art_key: "003-bartender" },
      suggested: [],
    };
    vi.mocked(apiRequest).mockResolvedValue(own);
    const view = withQueries(
      <>
        <CurrentUserAvatar />
        <AccountAvatar className="account-avatar" size={36} />
      </>,
    );
    await waitFor(() => expect(view.container.querySelectorAll("[data-art='003-bartender']")).toHaveLength(2));
    expect(apiRequest).toHaveBeenCalledWith(expect.anything(), `/v1/workspaces/${workspaceId}/me/avatar`);
    expect(view.container.querySelector(".current-user-avatar")).not.toBeNull();
  });

  it("show the initials outside a workspace and ask nothing", () => {
    context = null;
    withQueries(<CurrentUserAvatar />);
    expect(screen.getByText("TU")).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
