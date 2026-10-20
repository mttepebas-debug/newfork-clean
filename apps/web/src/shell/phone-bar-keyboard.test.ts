import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The bottom bar steps aside only for a field that brings up the on-screen
// keyboard. A select opens the phone's own picker and a checkbox nothing at all:
// hiding the bar for them grew the page by the bar's height, and the Rows per
// page bar under Employees jumped as soon as it was tapped (Mert 2026-10-20).
describe("phone bottom bar and focused fields", () => {
  const css = readFileSync("src/shell/phone-nav.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const hide = [...css.matchAll(/\.app-shell:has\(([\s\S]*?)\)\s*\.phone-bar\s*\{([^}]*)\}/g)].find(([, , body]) =>
    /display\s*:\s*none/.test(body!),
  );
  const fields = hide![1]!;

  it("hides for text fields and text areas", () => {
    expect(fields).toMatch(/\binput\b/);
    expect(fields).toMatch(/\btextarea:focus\b/);
  });

  it("stays for a select, a checkbox and a radio button", () => {
    expect(fields).not.toMatch(/\bselect\b/);
    expect(fields).toMatch(/:not\(\[type="checkbox"\]\)/);
    expect(fields).toMatch(/:not\(\[type="radio"\]\)/);
  });
});
