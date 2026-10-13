import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/communications/announcement-drawer.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, head]) => head!.trim().split(/\s*,\s*/).includes(selector))
    .map(([, , body]) => body!)
    .join(";");

// An error line under one box made its row taller, and the box beside it slid
// down to the middle: Starts no longer lined up with Ends (Mert 2026-10-13,
// desktop and phone).
describe("announcement drawer fields", () => {
  it("keep side-by-side boxes on one line when an error grows one of them", () => {
    expect(rule(".announcement-drawer .ad-when")).toMatch(/align-items\s*:\s*start/);
    expect(rule(".announcement-drawer .ad-field")).toMatch(/align-content\s*:\s*start/);
  });

  it("keep Message's label on its box while the box takes the room that is left", () => {
    expect(rule(".announcement-drawer .ad-field.ad-message")).toMatch(/grid-template-rows\s*:\s*auto minmax\(0, 1fr\)/);
  });
});
