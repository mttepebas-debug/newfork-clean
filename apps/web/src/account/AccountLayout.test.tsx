import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountLayout from "./AccountLayout";
import { countAccountAttention } from "../lib/supabase";

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

// The nav counts what is waiting on the person; this file is about the nav.
vi.mock("../lib/supabase", () => ({
  countAccountAttention: vi.fn(),
  supabaseClient: {},
}));
vi.mock("./AccountAvatar", () => ({
  AccountAvatar: () => <span aria-hidden />,
}));

// A window as wide as `phone` says; the layout listens for rotation.
const media = (phone: boolean) => vi.fn(() => ({ matches: phone, addEventListener: () => undefined, removeEventListener: () => undefined }));

function renderLayout(profile = <p>Profile content</p>, workspaces = <p>Workspace content</p>) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/account/workspaces"]}>
        <Routes>
          <Route element={<AccountLayout />}>
            <Route path="/account/profile" element={profile} />
            <Route path="/account/workspaces" element={workspaces} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AccountLayout mobile navigation", () => {
  const scrolledLabels: string[] = [];

  beforeEach(() => {
    scrolledLabels.length = 0;
    vi.mocked(countAccountAttention).mockResolvedValue({
      documents: 0,
      workspaces: 0,
    });
    vi.stubGlobal("matchMedia", media(true));
    HTMLElement.prototype.scrollIntoView = function () {
      scrolledLabels.push(this.textContent?.trim() ?? "");
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("brings the active tab into view on direct load and route changes", async () => {
    renderLayout();

    await waitFor(() => expect(scrolledLabels).toContain("Workspaces"));
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    await waitFor(() => expect(scrolledLabels.at(-1)).toBe("Profile"));
  });

  // MOBIL-BASLIK (Mert 2026-10-17): on a phone the menu sits under the page
  // heading's line; Back and Sign out stay in the bar above it.
  it("puts the menu under the page heading on a phone", async () => {
    renderLayout(
      <header className="account-page-header">
        <div>
          <h1>Profile</h1>
        </div>
      </header>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    const heading = await screen.findByRole("banner");
    await waitFor(() => expect(heading.querySelector('nav[aria-label="Account"]')).not.toBeNull());
    const bar = screen.getByRole("complementary", { name: "Account navigation" });
    expect(bar.querySelector("nav")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" }).closest("aside")).toBe(bar);
  });

  // Two different pages, so the heading (and the menu's box in it) is a new
  // one: the link that was chosen is gone, and focus goes to the new page's
  // active link instead of falling to the page body.
  it("keeps focus on the menu when a phone moves to another page", async () => {
    function ProfileHeading() {
      return (
        <header className="account-page-header">
          <div>
            <h1>Profile</h1>
          </div>
        </header>
      );
    }
    function WorkspacesHeading() {
      return (
        <header className="account-page-header">
          <div>
            <h1>Workspaces</h1>
          </div>
        </header>
      );
    }
    renderLayout(<ProfileHeading />, <WorkspacesHeading />);
    const menu = () => screen.getByRole("banner").querySelector<HTMLElement>('nav[aria-label="Account"]');
    await waitFor(() => expect(menu()).not.toBeNull());
    const profile = within(menu()!).getByRole("link", { name: "Profile" });
    profile.focus();
    fireEvent.click(profile);
    await screen.findByRole("heading", { name: "Profile" });
    await waitFor(() => {
      const active = within(menu()!).getByRole("link", { name: "Profile" });
      expect(active.getAttribute("aria-current")).toBe("page");
      expect(document.activeElement).toBe(active);
    });
  });

  // Focus that left the menu (a tap on an empty spot drops it to the page
  // body) is not pulled back to the menu by a later page change that moves no
  // focus itself (a link tapped on iOS, a redirect after saving).
  it("leaves focus alone once it has left the menu", async () => {
    function ProfileHeading() {
      return (
        <header className="account-page-header">
          <div>
            <h1>Profile</h1>
          </div>
        </header>
      );
    }
    function WorkspacesHeading() {
      return (
        <>
          <header className="account-page-header">
            <div>
              <h1>Workspaces</h1>
            </div>
          </header>
          <Link to="/account/profile">Your profile</Link>
        </>
      );
    }
    renderLayout(<ProfileHeading />, <WorkspacesHeading />);
    const menu = () => screen.getByRole("banner").querySelector<HTMLElement>('nav[aria-label="Account"]');
    await waitFor(() => expect(menu()).not.toBeNull());
    const workspaces = within(menu()!).getByRole("link", { name: "Workspaces" });
    workspaces.focus();
    // A tap on an empty spot of the page.
    fireEvent.pointerDown(document.body);
    workspaces.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("link", { name: "Your profile" }));
    await screen.findByRole("heading", { name: "Profile" });
    await waitFor(() => expect(within(menu()!).getByRole("link", { name: "Profile" }).getAttribute("aria-current")).toBe("page"));
    // The menu would take focus within a few frames.
    await new Promise((done) => setTimeout(done, 200));
    expect(document.activeElement).toBe(document.body);
  });
});

describe("AccountLayout counts", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", media(false));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Until now nothing said which tab wanted anything. Documents left Account
  // for a page of its own (MY-DOCUMENTS, Mert 2026-10-19): no tab for it here.
  it("puts the count on the tab that is waiting, and on no other", async () => {
    vi.mocked(countAccountAttention).mockResolvedValue({
      documents: 2,
      workspaces: 1,
    });
    renderLayout();

    expect(
      await screen.findByRole("link", { name: "Workspaces, 1 waiting on you" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Documents/ })).toBeNull();
    // Nothing is ever waiting on a person in these, so they carry no number.
    expect(screen.getByRole("link", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Security" })).toBeTruthy();
  });

  it("leaves the tab plain when nothing is waiting", async () => {
    vi.mocked(countAccountAttention).mockResolvedValue({
      documents: 0,
      workspaces: 0,
    });
    renderLayout();

    expect(await screen.findByRole("link", { name: "Workspaces" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /waiting on you/ })).toBeNull();
  });
});
