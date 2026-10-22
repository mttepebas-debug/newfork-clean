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
  const read = (path: string) => readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleBody = (css: string, selector: string) =>
    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, head]) => head!.replace(/\s+/g, " ").trim() === selector)
      .map(([, , body]) => body)
      .join(";");
  // The main area's sky (styles.css .app-main[data-slot]) held where the top rests, on the page ground: at the
  // top it is the sky itself, and once the page moves it never turns grey (Mert 2026-10-21 ~18:45).
  // Longhands: the sky is several gradient layers, and a shorthand would size only the last one.
  const sky = (body: string) => {
    expect(body).toMatch(/background-color\s*:\s*var\(--theme-app-ground\)/);
    expect(body).toMatch(/background-image\s*:\s*var\(--dl-sky, none\)/);
    expect(body).toMatch(/background-size\s*:\s*100% 470px/);
    expect(body).toMatch(/background-repeat\s*:\s*no-repeat/);
    expect(body).toMatch(/background-position\s*:\s*0 0/);
    expect(body).not.toMatch(/background\s*:/);
  };

  it("matches the main area's sky size", () => {
    expect(ruleBody(read("src/styles.css"), ".app-main[data-slot]:not(:has(.dl-home))")).toMatch(
      /background-size\s*:\s*100% 470px/,
    );
  });

  it("carries the sky on the manager's phone Lineup, with no grey of its own", () => {
    const css = read("src/views/lineup-phone.css");
    const head = ruleBody(css, ".lineup-phone-page .lineup-phone-head");
    sky(head);
    expect(css).not.toMatch(/theme-app-ground\) 70%/);
    expect(ruleBody(css, ".lineup-phone-page.list-page .lineup-phone-head > .catalog-page-header")).not.toMatch(
      /background/,
    );
  });

  it("carries the sky on the employee's phone Lineup once the page moves", () => {
    const css = read("src/employee-hub/employee-lineup.css");
    // The phone rule sits after the base rule, so it is the one that holds on a phone.
    const pins = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, head]) => head!.trim() === ".employee-hub-page > .employee-lineup-pin")
      .map(([, , body]) => body!);
    const pin = pins.at(-1)!;
    sky(pin);
    expect(pin).toMatch(/backdrop-filter\s*:\s*none/);
  });
});
