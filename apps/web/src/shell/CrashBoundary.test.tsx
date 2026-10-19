import { act, fireEvent, render, screen } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppCrashBoundary, PageCrashBoundary } from "./CrashBoundary";

// BL-1075: a page that throws while it draws took the whole app off the
// screen and left it white. Now the page's area shows the error card, the
// menus stay, and moving to another page clears it.

function Broken(): never {
  throw new Error("page broke");
}

function Page({ name }: { readonly name: string }) {
  return (
    <>
      <h1>{name}</h1>
      <Link to="/app/broken">Open broken</Link>
      <Link to="/app/home">Open home</Link>
    </>
  );
}

function renderShell(start: string, reload = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[start]}>
      <nav aria-label="Menu">
        <Link to="/app/home">Home</Link>
      </nav>
      <PageCrashBoundary homeHref="/app/home" reload={reload}>
        <Routes>
          <Route path="/app/home" element={<Page name="Home page" />} />
          <Route path="/app/broken" element={<Broken />} />
        </Routes>
      </PageCrashBoundary>
    </MemoryRouter>,
  );
  return reload;
}

// What a swallowed chunk error gave React.lazy: a module that is undefined
// (Sentry JAVASCRIPT-REACT-G and -J, 2026-10-19).
const LazyWithoutModule = lazy(() =>
  Promise.resolve(undefined as unknown as { default: () => null }),
);

beforeEach(() => {
  // React logs every error it catches; the tests throw on purpose.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PageCrashBoundary", () => {
  it("shows the error card in the page's place and keeps the menus", () => {
    renderShell("/app/broken");

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Menu" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
    ).toBe("/app/home");
  });

  it("reloads the page from the green button", () => {
    const reload = renderShell("/app/broken");

    const button = screen.getByRole("button", { name: "Reload page" });
    expect(button.className).toBe("nf-button");
    fireEvent.click(button);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("leaves the card once the person moves to another page", () => {
    renderShell("/app/broken");

    fireEvent.click(screen.getByRole("link", { name: "Home" }));

    expect(
      screen.queryByRole("heading", { name: "Something went wrong" }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Home page" })).toBeTruthy();
  });

  it("catches a lazy page whose file came back empty", async () => {
    render(
      <MemoryRouter initialEntries={["/app/lazy"]}>
        <PageCrashBoundary homeHref="/app/home">
          <Suspense fallback={null}>
            <Routes>
              <Route path="/app/lazy" element={<LazyWithoutModule />} />
            </Routes>
          </Suspense>
        </PageCrashBoundary>
      </MemoryRouter>,
    );
    await act(async () => undefined);

    expect(
      await screen.findByRole("heading", { name: "Something went wrong" }),
    ).toBeTruthy();
  });
});

describe("AppCrashBoundary", () => {
  it("fills the screen with the card when nothing around the page is left", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <AppCrashBoundary>
          <Broken />
        </AppCrashBoundary>
      </MemoryRouter>,
    );

    const card = screen.getByRole("heading", { name: "Something went wrong" });
    expect(card.closest("main")?.className).toBe("app-crash");
    expect(
      screen.getByRole("link", { name: "Back to Home" }).getAttribute("href"),
    ).toBe("/app");
  });
});
