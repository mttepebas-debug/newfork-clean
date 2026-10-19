import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1]!.replace(/\s+/g, " ").trim(),
  body: match[2]!,
}));
const bodyOf = (selector: string) =>
  rules
    .filter((rule) => rule.selector.split(/,\s(?![^(]*\))/).includes(selector))
    .map((rule) => rule.body)
    .join("\n");

// The narrow rail's name boxes (RAIL-FLYOUT-FADE, Mert 2026-10-19 ~02:55 PT: "ipucu
// kutuları menü kapanırken anında kaybolsun, yalnız üzerine gelince solarak
// açılsın"). The menu narrowing turns every name into a box in the same frame;
// with the motion on the box itself, fifteen boxes faded out over the page.
describe("the narrow rail's name boxes", () => {
  it("carry no motion of their own, so the menu narrows and widens without them", () => {
    expect(bodyOf(".rail-flyout")).toContain("opacity: 0");
    expect(bodyOf(".rail-flyout")).not.toContain("transition");
  });

  it("fade and slide in only as the pointer or the keyboard reaches an icon", () => {
    for (const selector of [".rail-peek-item:hover .rail-flyout", ".rail-peek-item:focus-visible .rail-flyout"]) {
      const body = bodyOf(selector);
      expect(body).toContain("opacity: 1");
      expect(body).toMatch(/transition:[^;]*opacity[^;]*transform/);
    }
  });

  it("open at once when the person asks for less motion", () => {
    // Each reduced-motion block, up to its own closing brace.
    const reduced: string[] = [];
    for (const match of styles.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{/g)) {
      let depth = 1;
      let end = match.index + match[0].length;
      while (depth > 0 && end < styles.length) {
        if (styles[end] === "{") depth += 1;
        if (styles[end] === "}") depth -= 1;
        end += 1;
      }
      reduced.push(styles.slice(match.index, end));
    }
    expect(
      reduced.some(
        (block) =>
          block.includes(".rail-peek-item:hover .rail-flyout") &&
          block.includes(".rail-peek-item:focus-visible .rail-flyout") &&
          block.includes("transition: none"),
      ),
    ).toBe(true);
  });
});
