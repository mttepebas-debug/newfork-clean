import { afterEach, describe, expect, it, vi } from "vitest";
import { probeReaderLayout, readerLooksBroken, resetReaderProbe } from "./reader-layout-probe";

// Temporary (BILDIRIM-15): the iPhone's reader is measured once, from the phone only.
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

function phone(userAgent: string): Window {
  return Object.assign(Object.create(window), {
    navigator: { userAgent },
    document,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    getComputedStyle: window.getComputedStyle.bind(window),
    matchMedia: () => ({ matches: true }),
    innerWidth: 393,
    innerHeight: 852,
    scrollY: 0,
  }) as Window;
}

describe("reader layout probe", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetReaderProbe();
    document.body.innerHTML = "";
  });

  it("says the reader is broken when Close sits above the title's end or the title is off the screen", () => {
    expect(readerLooksBroken({ headTop: 0, headHeight: 80, footTop: 780 })).toBe(false);
    expect(readerLooksBroken({ headTop: -800, headHeight: 80, footTop: 0 })).toBe(true);
    expect(readerLooksBroken({ headTop: 0, headHeight: 0, footTop: 0 })).toBe(true);
    expect(readerLooksBroken({ headTop: null, headHeight: null, footTop: 0 })).toBe(true);
  });

  it("sends the layout once from an iPhone, sizes and places only", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div class="catalog-drawer-backdrop"><div role="dialog" class="announcement-reader"><div class="ad">
      <header class="ad-head">Walk-in closed</header><div class="ad-body">Use the reach-in</div><footer class="ad-foot">Close</footer></div></div></div>`;
    const report = vi.fn();
    probeReaderLayout(phone(iphone), report);
    probeReaderLayout(phone(iphone), report);
    vi.advanceTimersByTime(2_000);
    expect(report).toHaveBeenCalledTimes(1);
    const [message, context] = report.mock.calls[0]!;
    expect(message).toBe("announcement reader layout");
    expect(context.tags).toEqual({ probe: "reader-layout", broken: expect.any(String) });
    expect(context.extra).toMatchObject({ innerHeight: 852, headTop: expect.any(Number), footTop: expect.any(Number) });
    expect(JSON.stringify(context.extra)).not.toMatch(/Walk-in|reach-in/);
  });

  it("sends nothing from a computer", () => {
    vi.useFakeTimers();
    const report = vi.fn();
    probeReaderLayout(phone("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0"), report);
    vi.advanceTimersByTime(3_000);
    expect(report).not.toHaveBeenCalled();
  });
});
