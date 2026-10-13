import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The page scrolls inside .app-main. Without a containing block there, an
// absolutely placed label far down a list (.sr-only) lengthened the document:
// the window scrolled and took the phone's bottom bar with it (Mert 2026-10-13,
// Announcements; Settings › Notifications and Schedule rules had it too).
describe("app shell scrolling", () => {
  it("keeps absolutely placed page content inside the scrolling main area", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const rules = [...css.matchAll(/(?:^|\}|\*\/)\s*\.app-main\s*\{([^}]*)\}/gm)].map((match) => match[1]!);
    expect(rules.some((body) => /position\s*:\s*relative/.test(body))).toBe(true);
  });
});
