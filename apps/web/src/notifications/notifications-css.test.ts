import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// S-251 (variant A): jsdom lays nothing out, so these read the sheet.
const css = readFileSync("src/notifications/notifications.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const ruleBody = (head: (selector: string) => boolean, sheet = css) =>
  [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector!.split(",").some((one) => head(one.replace(/\s+/g, " ").trim())))
    .map(([, , body]) => body)
    .join(";");

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

  it("has a dot to read it that is a 44 px target on the phone, with a visible focus", () => {
    expect(ruleBody((head) => head === ".ni-sheet .ni-dot")).toMatch(/width\s*:\s*44px[\s\S]*height\s*:\s*44px|height\s*:\s*44px[\s\S]*width\s*:\s*44px/);
    expect(ruleBody((head) => head === "button.ni-dot:focus-visible")).toMatch(/outline\s*:\s*2px solid var\(--theme-focus\)/);
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
