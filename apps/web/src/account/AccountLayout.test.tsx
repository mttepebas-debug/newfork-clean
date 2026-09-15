import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountLayout from "./AccountLayout";

const signOut = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: {
      userId: "user-1",
      email: "owner@example.test",
      displayName: "Owner User",
      avatarUrl: null,
    },
    context: null,
    signOut,
  }),
}));

vi.mock("./AccountAvatar", () => ({
  AccountAvatar: () => <span aria-hidden />,
}));

describe("AccountLayout mobile navigation", () => {
  const scrolledLabels: string[] = [];

  beforeEach(() => {
    scrolledLabels.length = 0;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    HTMLElement.prototype.scrollIntoView = function () {
      scrolledLabels.push(this.textContent?.trim() ?? "");
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("brings the active tab into view on direct load and route changes", async () => {
    render(
      <MemoryRouter initialEntries={["/account/workspaces"]}>
        <Routes>
          <Route element={<AccountLayout />}>
            <Route path="/account/profile" element={<p>Profile content</p>} />
            <Route path="/account/workspaces" element={<p>Workspace content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(scrolledLabels).toContain("Workspaces"));
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    await waitFor(() => expect(scrolledLabels.at(-1)).toBe("Profile"));
  });
});
