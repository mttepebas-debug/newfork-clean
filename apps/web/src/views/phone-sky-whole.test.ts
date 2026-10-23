import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Mert 2026-10-23 (KARARLAR S-252): nothing paints a grey patch over the page's sky on a phone - a button's
// backing, a count, a switch - and a page with nothing to show draws the S-250 line with its icon and words
// under it, no card. jsdom loads no CSS, so the sheets are read.

type Rule = { media: string; selector: string; body: string };

/** Every innermost rule of a sheet, with the @media it sits in ("" at the top). */
function rules(path: string): Rule[] {
  const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const open: string[] = [];
  let text = "";
  for (const ch of css) {
    if (ch === "{") {
      open.push(text.trim());
      text = "";
    } else if (ch === "}") {
      const selector = open.pop() ?? "";
      if (text.trim()) out.push({ media: open.find((s) => s.startsWith("@media")) ?? "", selector, body: text });
      text = "";
    } else {
      text += ch;
    }
  }
  return out;
}

const phone = "@media (max-width: 720px)";
function body(path: string, selector: string, media = "") {
  return rules(path)
    .filter((r) => r.selector.replace(/\s+/g, " ") === selector && (media ? r.media === media : true))
    .map((r) => r.body)
    .join(";");
}

describe("the sky stays whole on a phone", () => {
  // The add button left the tab row altogether (KARARLAR S-253), and with it the grey backing behind it.
  it("keeps no add button, and so no backing, in the tab row", () => {
    expect(readFileSync("src/views/list-page.css", "utf8")).not.toMatch(/catalog-tab-add/);
  });

  // KARARLAR S-254: Requests is the one page whose Add stands in the tab row on a phone - with no backing of
  // its own, 32 high and 8 px above the row's bottom, in the list pages' shape (below), the row's line under it.
  it("stands Requests' Add in its tab row with no backing, 32 high, 8 px above the line", () => {
    const add = body("src/views/requests-catalog.css", ".requests-page.list-page.list-page .catalog-toolbar-status-row > .list-add-button.list-add-button", phone);
    expect(add).toMatch(/height\s*:\s*32px/);
    expect(add).toMatch(/min-height\s*:\s*32px/);
    expect(add).toMatch(/margin-top\s*:\s*4px/);
    expect(add).toMatch(/flex\s*:\s*0 0 auto/);
    expect(add).not.toMatch(/background/);
    const row = body("src/views/requests-catalog.css", ".requests-page.list-page.list-page .catalog-toolbar-status-row", phone);
    expect(row).toMatch(/box-shadow\s*:\s*inset 0 -1px 0 var\(--theme-border\)/);
    expect(row).not.toMatch(/background/);
  });

  it("gives Requests' add button the list pages' shape, as on Employees", () => {
    const add = body("src/views/requests-catalog.css", ".requests-catalog-page .list-add-button.list-add-button");
    expect(add).toMatch(/border-radius\s*:\s*7px/);
    expect(add).toMatch(/font-size\s*:\s*13px/);
    expect(add).toMatch(/padding\s*:\s*0 14px/);
  });

  it("writes a section's count as plain text, not a grey chip (Announcements)", () => {
    const count = body("src/views/announcements-catalog.css", ".announcement-list-heading > span");
    expect(count).toMatch(/background\s*:\s*none/);
    expect(count).not.toMatch(/surface-muted/);
  });

  it("lets a department's heading row show the sky (Jobs)", () => {
    expect(body("src/settings/jobs-settings.css", ".jobs-catalog-page .jobs-group-row", phone)).toMatch(/background\s*:\s*transparent/);
  });

  it("draws the week switch and its arrows as outlines, not grey wells (employee Schedule)", () => {
    for (const selector of [".ems-step", ".ems-seg"]) {
      const rule = body("src/employee-hub/employee-my-shifts.css", selector);
      expect(rule).toMatch(/background\s*:\s*transparent/);
      expect(rule).toMatch(/var\(--theme-border-control\)/);
      expect(rule).not.toMatch(/surface-muted/);
    }
  });

  it("draws My documents' status switch as an outline, not a grey well", () => {
    const tabs = body("src/documents/documents.css", ".my-documents-page .catalog-status-tabs");
    expect(tabs).toMatch(/background\s*:\s*transparent/);
    expect(tabs).toMatch(/var\(--theme-border-control\)/);
  });
});

describe("an empty page draws the line, then its icon and words, no card (S-250)", () => {
  it.each([
    ["src/employee-hub/shift-exchanges/shift-release.css", ".sx-deck-empty"],
    ["src/time-off/time-off-requests.css", ".tor-empty"],
  ])("%s %s", (path, selector) => {
    const rule = body(path, selector);
    expect(rule).toMatch(/border-top\s*:\s*1px solid var\(--theme-border\)/);
    expect(rule).not.toMatch(/dashed/);
    expect(rule).toMatch(/text-align\s*:\s*center/);
  });

  // My documents has no filters when nothing was asked: the tab row's own line is the line above it.
  it("centres My documents' empty words under its icon, no card", () => {
    const rule = body("src/documents/documents.css", ".employee-documents-none");
    expect(rule).toMatch(/text-align\s*:\s*center/);
    expect(rule).not.toMatch(/border\s*:|background\s*:/);
  });
});
