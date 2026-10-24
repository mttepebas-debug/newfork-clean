import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// S-251 (variant A): jsdom lays nothing out, so these read the sheet.
const css = readFileSync("src/notifications/notifications.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ruleBody = (head: (selector: string) => boolean, sheet = css) =>
  [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector!.split(",").some((one) => head(one.replace(/\s+/g, " ").trim())))
    .map(([, , body]) => body)
    .join(";");
const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
/** A length in a rule's body, in px. */
const px = (body: string, property: string) => Number(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(-?\\d+)px`).exec(body)?.[1]);

describe("a notification row", () => {
  it("is the same height every time: 64 px, and 68 px on the phone", () => {
    expect(ruleBody((head) => head === ".ni-swipe")).toMatch(/height\s*:\s*64px/);
    expect(ruleBody((head) => head === ".ni-sheet .ni-swipe")).toMatch(/height\s*:\s*68px/);
    expect(ruleBody((head) => head === ".ni-row-text")).toMatch(/grid-template-rows\s*:\s*20px 20px/);
  });

  it("cuts each of its two lines at the end instead of wrapping", () => {
    for (const line of [".ni-row-title", ".ni-row-sub"]) {
      const body = ruleBody((head) => head === line);
      expect(body).toMatch(/white-space\s*:\s*nowrap/);
      expect(body).toMatch(/overflow\s*:\s*hidden/);
      expect(body).toMatch(/text-overflow\s*:\s*ellipsis/);
    }
  });

  // A 44 px square from the screen's edge would cover the tile's left side (it starts at 28 px), and a tap meant to
  // open the notice would read it; the box stops where the tile starts: 28 x 44, above WCAG 2.5.8's 24 px.
  it("has a dot to read it that is a 28 x 44 px target on the phone, ending where the tile starts, with a visible focus", () => {
    const dot = ruleBody((head) => head === ".ni-sheet .ni-dot");
    expect(dot).toMatch(/width\s*:\s*28px/);
    expect(dot).toMatch(/height\s*:\s*44px/);
    const swipe = ruleBody((head) => head === ".ni-swipe");
    const rowPadding = Number(/padding\s*:\s*0 14px 0 (\d+)px/.exec(swipe)?.[1]);
    const [dotColumn, tileColumn] = /grid-template-columns\s*:\s*(\d+)px (\d+)px/.exec(swipe)?.slice(1).map(Number) ?? [];
    const gap = Number(/gap\s*:\s*(\d+)px/.exec(swipe)?.[1]);
    expect(tileColumn).toBe(32);
    expect(rowPadding + px(dot, "margin-left") + px(dot, "width")).toBe(rowPadding + Number(dotColumn) + gap);
    // Inside its own box: the row cuts off whatever is outside it.
    expect(ruleBody((head) => head === "button.ni-dot:focus-visible")).toMatch(/outline\s*:\s*2px solid var\(--theme-focus\)/);
    expect(ruleBody((head) => head === "button.ni-dot:focus-visible")).toMatch(/outline-offset\s*:\s*-2px/);
  });

  // The phone's row starts at the screen's edge and cuts what is outside it: a dot box that starts left of it
  // was a 35 px target.
  it("keeps the phone's dot target whole inside the row, with the dot itself where variant A draws it", () => {
    const rowPadding = Number(/padding\s*:\s*0 14px 0 (\d+)px/.exec(ruleBody((head) => head === ".ni-swipe"))?.[1]);
    const dot = ruleBody((head) => head === ".ni-sheet .ni-dot");
    const start = rowPadding + px(dot, "margin-left");
    expect(start).toBe(0);
    // The 8 px dot's middle, 13 px from the row's edge.
    expect(dot).toMatch(/justify-items\s*:\s*start/);
    expect(start + px(dot, "padding-left") + 4).toBe(13);
  });

  // Only the dot's button sits above the row's own button: a read row's empty dot space opens the notice like the rest.
  it("lets a click on a read row's empty dot space open the notice", () => {
    for (const head of [".ni-dot", ".ni-sheet .ni-dot"]) expect(ruleBody((selector) => selector === head)).not.toMatch(/position|z-index/);
    expect(ruleBody((head) => head === "button.ni-dot")).toMatch(/position\s*:\s*relative/);
    expect(ruleBody((head) => head === "button.ni-dot")).toMatch(/z-index\s*:\s*1/);
  });

  // The row's surface is opaque and lies over the row: a ring drawn on the row itself does not show.
  it("draws the keyboard focus ring on its surface, not under it", () => {
    expect(ruleBody((head) => head === ".ni-row:has(.ni-row-title:focus-visible) .ni-swipe")).toMatch(/outline\s*:\s*2px solid var\(--theme-focus\)/);
    expect(ruleBody((head) => head === ".ni-row:has(.ni-row-title:focus-visible) .ni-swipe")).toMatch(/outline-offset\s*:\s*-2px/);
    expect(ruleBody((head) => head === ".ni-row:has(.ni-row-title:focus-visible)")).not.toMatch(/outline/);
  });

  it("slides sideways on the phone while the list still scrolls and zooms, and without motion when motion is reduced", () => {
    // pan-y alone also stops a pinch that touches a row; the plain pan-y stays for a browser that knows no pinch-zoom.
    expect(ruleBody((head) => head === ".ni-sheet .ni-row")).toMatch(/touch-action\s*:\s*pan-y\s*;/);
    expect(ruleBody((head) => head === ".ni-sheet .ni-row")).toMatch(/touch-action\s*:\s*pan-y pinch-zoom/);
    expect(ruleBody((head) => head === ".ni-swipe")).toMatch(/transition\s*:\s*transform/);
    expect(ruleBody((head) => head === ".ni-swipe", reducedMotion)).toMatch(/transition\s*:\s*none/);
  });

  // S-251 (variant A, frame.js): a read row slides to Unread on grey, a darker grey past half the row; Read stays green.
  it("shows Unread under a read row on grey, and Read under an unread one on green", () => {
    expect(ruleBody((head) => head === ".ni-row.is-slid")).toMatch(/background\s*:\s*var\(--theme-accent\)/);
    expect(ruleBody((head) => head === ".ni-row.is-full")).toMatch(/background\s*:\s*var\(--theme-accent-strong\)/);
    expect(ruleBody((head) => head === ".ni-row:not(.is-unread).is-dragging")).toMatch(/background\s*:\s*var\(--theme-muted-strong\)/);
    expect(ruleBody((head) => head === ".ni-row:not(.is-unread).is-slid")).toMatch(/background\s*:\s*var\(--theme-muted-strong\)/);
    expect(ruleBody((head) => head === ".ni-row:not(.is-unread).is-full")).toMatch(/background\s*:\s*var\(--theme-text-secondary\)/);
    // The full grey comes after the plain one: a row past half is still dragged.
    expect(css.indexOf(".ni-row:not(.is-unread).is-full")).toBeGreaterThan(css.indexOf(".ni-row:not(.is-unread).is-dragging"));
  });

  // A read notice with no link has a disabled title: the finger on it must still reach the row to slide it.
  it("lets a finger on a read row's disabled title slide the row on the phone", () => {
    expect(ruleBody((head) => head === ".ni-sheet .ni-row-title:disabled")).toMatch(/pointer-events\s*:\s*none/);
  });
});

// S-251 (Mert 2026-10-23, "Gökyüzü temasi ve bütünlüğü bozuluyor"): the header's buttons sit on the sky.
describe("the header's buttons", () => {
  it("get no grey plate on hover or tap; only the icon darkens", () => {
    // .ni-icon is only the panel's and the phone list's header buttons (settings, close, Back).
    for (const head of [".ni-icon:hover", ".ni-icon:active"]) {
      const body = ruleBody((selector) => selector === head);
      expect(body).toMatch(/background\s*:\s*transparent/);
      expect(body).toMatch(/color\s*:\s*var\(--theme-text\)/);
    }
  });
});
