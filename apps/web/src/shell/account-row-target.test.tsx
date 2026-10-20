// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// The Account row's count is invitations and ownership transfers waiting for
// an answer; both are answered on Account → Workspaces, so that is where the
// row leads while something waits. Profile has nothing to answer.
const attention = vi.hoisted(() => ({ workspaces: 0 }));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "w", name: "Meyhouse" },
      userId: "u",
      membership: { access: { employee: false, management: "owner" } },
      permissions: ["workspace.read"],
      actions: ["workspace.read"],
    },
    account: { userId: "u", displayName: "Ali" },
    signOut: vi.fn(),
  }),
}));
vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  countAccountAttention: vi.fn(async () => ({ documents: 0, workspaces: attention.workspaces })),
}));
vi.mock("../account/AccountAvatar", () => ({
  AccountAvatar: () => null,
  CurrentUserAvatar: () => null,
}));
vi.mock("../employee-hub/shift-exchanges/useExchangeRealtime", () => ({
  useExchangeRealtime: vi.fn(),
}));

function mount(path = "/app") {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<h1>App home</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Account row", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    attention.workspaces = 0;
  });

  it("opens Workspaces while an invitation or transfer waits", async () => {
    attention.workspaces = 1;
    mount();
    const row = await screen.findByRole("link", { name: "Account, 1 waiting on you" });
    expect(row.getAttribute("href")).toBe("/account/workspaces");
  });

  it("opens Profile when nothing waits", async () => {
    mount();
    await Promise.resolve();
    const rows = screen
      .getAllByRole("link", { name: /^Account/ })
      .map((link) => link.getAttribute("href"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((href) => href === "/account/profile")).toBe(true);
  });
});
