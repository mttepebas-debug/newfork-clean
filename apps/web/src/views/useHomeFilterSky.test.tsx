import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeFilterSky } from "./useHomeFilterSky";

// Home's location chips frosted grey once the page passed under them (Mert 2026-10-21 ~18:45, the same as
// every page's top). Once stuck they carry the part of Home's sky they rest on, so no card shows between them.

function Home() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useHomeFilterSky(root);
  return (
    <div className="dl-home mh-home" ref={setRoot}>
      <div className="dl-sky" />
      <div className="mh-head" />
      <div className="mh-filter" style={{ marginTop: 4 }} />
    </div>
  );
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

describe("Home's location chips", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".dl-sky")) return rect(240, 0, 1200, 470);
      if (this.matches(".mh-head")) return rect(393, 100, 880, 150);
      if (this.matches(".mh-filter")) return rect(393, 54, 880, 48);
      return rect(240, 0, 1200, 2000);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("learn where they rest in Home's sky, even while stuck", () => {
    const { container } = render(<Home />);
    const chips = container.querySelector<HTMLElement>(".mh-filter")!;
    expect(chips.style.getPropertyValue("--mh-sky-x")).toBe("153px");
    // Under the heading (bottom 250) and its margin, from the sky's top (0): not where it is stuck (54).
    expect(chips.style.getPropertyValue("--mh-sky-y")).toBe("254px");
    expect(chips.style.getPropertyValue("--mh-sky-w")).toBe("1200px");
  });

  it("carry that sky once the page passes under them, never a grey frost", () => {
    const css = readFileSync("src/views/manager-home.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const body = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, head]) => head!.trim() === ".mh-filter")
      .map(([, , b]) => b!)
      .join(";");
    expect(body).not.toMatch(/theme-page\) 90%/);
    expect(body).not.toMatch(/backdrop-filter\s*:\s*blur/);
    expect(body).toMatch(/background-color\s*:\s*var\(--theme-app-ground\)/);
    expect(body).toMatch(/background-image\s*:\s*linear-gradient\(90deg, var\(--theme-app-ground\) 0, transparent var\(--dl-sky-fade, 0px\)\), var\(--dl-sky\)/);
    expect(body).toMatch(/background-position\s*:\s*calc\(-1 \* var\(--mh-sky-x, 0px\)\) calc\(-1 \* var\(--mh-sky-y, 0px\)\)/);
    expect(body).toMatch(/background-size\s*:\s*var\(--mh-sky-w, 100%\) 470px/);
    expect(body).toMatch(/background-repeat\s*:\s*no-repeat/);
  });
});
