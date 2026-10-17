import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Mert's phone notes (2026-10-17, "Mobil Tarayıcı Bug Notları").
const css = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rulesFor = (selector: RegExp) =>
  [...css.matchAll(/(?:^|\})\s*([^{}]+?)\s*\{([^}]*)\}/gm)]
    .filter((match) => selector.test(match[1]!))
    .map((match) => match[2]!);

describe("a phone page holds still", () => {
  // #2: pulled past its end the whole page stretched, taking the top bar and
  // the bottom bar with it and opening white space under them.
  // Only on a phone: a desktop keeps the touchpad's swipe back and forward.
  it("lets no pull stretch the page past its ends", () => {
    const phone = css.match(/@media \(max-width: 720px\)\s*\{\s*html,\s*body\s*\{([^}]*)\}/);
    expect(phone?.[1]).toMatch(/overscroll-behavior-y\s*:\s*none/);
    expect(rulesFor(/^html,\s*body$/).some((body) => /overscroll-behavior/.test(body))).toBe(false);
  });
});

describe("focus rings under a finger", () => {
  // #3: a sheet that takes focus as it opens (More's X, a day's name in My
  // Availability) showed a green ring under a tap. A keyboard still gets it.
  it("draws no ring on focus a tap or the app gave, fields keep their look", () => {
    const bodies = rulesFor(/^:root\[data-touch-input="true"\] :focus-visible:not\(input, textarea, select, \[contenteditable\]\)$/);
    expect(bodies.some((body) => /outline\s*:\s*none\s*!important/.test(body))).toBe(true);
  });
});
