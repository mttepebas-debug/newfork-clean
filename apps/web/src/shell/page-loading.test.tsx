// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

// A page's code arrives on first visit. While it does, the menu stays and the
// page area shows the loading outline; the whole screen used to go blank.
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
  supabaseClient: null,
  countAccountAttention: vi.fn(),
}));
vi.mock("../account/AccountAvatar", () => ({
  AccountAvatar: () => null,
  CurrentUserAvatar: () => null,
}));
vi.mock("../employee-hub/shift-exchanges/useExchangeRealtime", () => ({
  useExchangeRealtime: vi.fn(),
}));

const NeverArrives = lazy(() => new Promise<never>(() => undefined));

describe("a page on its way", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the menu and shows the loading outline in the page area", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/app"]}>
          <Suspense fallback={<p>Whole screen blank</p>}>
            <Routes>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<NeverArrives />} />
              </Route>
            </Routes>
          </Suspense>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByText("Whole screen blank")).toBeNull();
    expect(screen.getAllByRole("link", { name: /^Account/ }).length).toBeGreaterThan(0);
    const outline = screen.getByRole("status");
    expect(outline.textContent).toBe("Loading page");
    expect(outline.closest("main")?.className).toBe("app-main");
  });
});
