import { readFileSync } from "node:fs";
import { act, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFrozenTop } from "./useFrozenTop";

// The phone Lineup pins its own top (data-frozen-own), so the shell's frozen
// top has no piece there. The sky still needs to know when the page moves:
// the pinned top is clear over the sky at rest and frosts what passes under
// it once the page scrolls (Mert 2026-10-21, "lineup header'ı gökyüzü arka
// planına dahil olmamış").

function Area() {
  const [main, setMain] = useState<HTMLElement | null>(null);
  useFrozenTop(main);
  return (
    <main className="app-main" ref={setMain} style={{ overflowY: "auto" }}>
      <section className="lineup-phone-page">
        <div className="lineup-phone-head" data-frozen-own="">
          <header className="catalog-page-header">
            <h1>Lineup</h1>
          </header>
        </div>
      </section>
    </main>
  );
}

describe("useFrozenTop on a page that pins its own top", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 1;
    });
    // jsdom lays nothing out: give every box a height so the heading counts as shown.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 60,
      left: 0,
      right: 390,
      width: 390,
      height: 60,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("marks the area scrolled once the page moves, and clears it back at the top", () => {
    const { container } = render(<Area />);
    const main = container.querySelector<HTMLElement>(".app-main")!;
    expect(main.dataset.frozenScrolled).toBeUndefined();

    act(() => {
      main.scrollTop = 40;
      main.dispatchEvent(new Event("scroll"));
    });
    expect(main.dataset.frozenScrolled).toBe("");

    act(() => {
      main.scrollTop = 0;
      main.dispatchEvent(new Event("scroll"));
    });
    expect(main.dataset.frozenScrolled).toBeUndefined();
  });
});

describe("the phone Lineup's pinned top", () => {
  const css = readFileSync("src/views/lineup-phone.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleBody = (selector: string) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, head]) => head!.replace(/\s+/g, " ").trim() === selector)
      .map(([, , body]) => body)
      .join(";");

  it("paints no ground of its own at rest, so the sky shows through", () => {
    expect(ruleBody(".lineup-phone-page .lineup-phone-head")).not.toMatch(/background\s*:\s*var\(--theme-page\)/);
    expect(ruleBody(".lineup-phone-page.list-page .lineup-phone-head > .catalog-page-header")).not.toMatch(
      /background/,
    );
    expect(ruleBody(".app-main:not([data-frozen-scrolled]) > .lineup-phone-page .lineup-phone-head")).toMatch(
      /background\s*:\s*transparent/,
    );
  });

  it("frosts what passes under it once the page moves", () => {
    const head = ruleBody(".lineup-phone-page .lineup-phone-head");
    expect(head).toMatch(/background\s*:\s*color-mix\(in srgb, var\(--theme-app-ground\) 70%, transparent\)/);
    expect(head).toMatch(/backdrop-filter\s*:\s*saturate\(1\.6\) blur\(18px\)/);
  });
});
