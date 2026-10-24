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

function SkyArea() {
  const [main, setMain] = useState<HTMLElement | null>(null);
  useFrozenTop(main);
  return (
    <main className="app-main" data-slot="night" ref={setMain} style={{ overflowY: "auto" }}>
      <section className="requests-page">
        <header className="catalog-page-header">
          <h1>Requests</h1>
        </header>
      </section>
    </main>
  );
}

// Every page's frozen top kept the sky only at rest: once the page moved it took the flat page ground, grey
// against the sky (Mert 2026-10-21 ~18:45, the same on Requests, Announcements, Settings …). A piece now learns
// where it rests inside the main area's sky, and carries that part of it.
describe("a frozen top under the sky", () => {
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
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("gives each piece its place in the main area's sky", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const header = this.matches(".catalog-page-header");
      const left = header ? 16 : 0;
      const top = header ? 56 : 56;
      return { top, bottom: top + 60, left, right: 390, width: 390 - left, height: 60, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 390 });
    const { container } = render(<SkyArea />);
    const header = container.querySelector<HTMLElement>(".catalog-page-header")!;
    expect(header.dataset.frozenPiece).toBe("");
    expect(header.style.getPropertyValue("--frozen-sky-x")).toBe("16px");
    expect(header.style.getPropertyValue("--frozen-sky-y")).toBe("0px");
    expect(header.style.getPropertyValue("--frozen-sky-w")).toBe("390px");
    // @ts-expect-error put the prototype back
    delete HTMLElement.prototype.clientWidth;
  });

  it("paints the sky on a stuck piece in layers, and on the gap above it, never the flat ground alone", () => {
    const css = readFileSync("src/shell/frozen-top.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const body = (selector: string) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, head]) => head!.replace(/\s+/g, " ").trim() === selector)
        .map(([, , b]) => b!)
        .join(";");
    expect(body(".app-main[data-slot]:not(:has(.dl-home)) [data-frozen-piece][data-frozen-piece]")).toMatch(
      /box-shadow\s*:\s*none/,
    );
    // Behind the piece's content, across the main area's width and over the gap above it.
    const sky = body(".app-main[data-slot]:not(:has(.dl-home)) [data-frozen-piece][data-frozen-piece]::before");
    expect(sky).toMatch(/z-index\s*:\s*-1/);
    expect(sky).toMatch(/top\s*:\s*calc\(-1 \* var\(--frozen-gap, 0px\)\)/);
    expect(sky).toMatch(/left\s*:\s*calc\(-1 \* var\(--frozen-sky-x, 0px\)\)/);
    expect(sky).toMatch(/width\s*:\s*var\(--frozen-sky-w, 100%\)/);
    expect(sky).toMatch(/background-color\s*:\s*var\(--frozen-bg\)/);
    expect(sky).toMatch(/background-image\s*:\s*var\(--page-sky, none\)/);
    expect(sky).toMatch(/background-position\s*:\s*0 calc\(var\(--frozen-gap, 0px\) - var\(--frozen-sky-y, 0px\)\)/);
    expect(sky).toMatch(/background-size\s*:\s*100% 470px/);
    expect(sky).toMatch(/background-repeat\s*:\s*no-repeat/);
    // The page's sky is one value for the main area and its pieces, the desktop's edge fade included.
    const styles = readFileSync("src/styles.css", "utf8");
    expect(styles).toMatch(/--page-sky\s*:\s*var\(--dl-sky\)/);
    expect(styles).toMatch(/--page-sky\s*:\s*linear-gradient\(90deg, var\(--theme-app-ground\) 0, transparent 96px\), var\(--dl-sky\)/);
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

// A sheet over the page (Your shift) holds the main area still with overflow: hidden. The area still scrolls
// its page; read as the document scrolling, the heading was measured from the window and stuck 56 px down, over
// the tabs, even after the sheet closed (Mert 2026-10-24).
function HeldArea() {
  const [main, setMain] = useState<HTMLElement | null>(null);
  useFrozenTop(main);
  return (
    <main className="app-main" ref={setMain} style={{ overflowY: "hidden" }}>
      <section className="employee-hub-page">
        <header className="catalog-page-header">
          <h1>Schedule</h1>
        </header>
      </section>
    </main>
  );
}

describe("useFrozenTop under a sheet that holds the page still", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 1;
    });
    // The main area starts under the 56 px app bar, and the heading rests at its top.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 56,
      bottom: 116,
      left: 0,
      right: 390,
      width: 390,
      height: 60,
      x: 0,
      y: 56,
      toJSON: () => ({}),
    } as DOMRect);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("measures the heading from the area, not the window", () => {
    const { container } = render(<HeldArea />);
    const heading = container.querySelector<HTMLElement>(".catalog-page-header")!;
    expect(heading.style.getPropertyValue("--frozen-top")).toBe("0px");
  });
});
