import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contentHeldAtMenuEdge } from "./content-held";

describe("main-menu pages hold still when the menu collapses (Mert 2026-10-18)", () => {
  it.each([
    "/app/workspace",
    "/app/schedule/requests",
    "/app/schedule/lineup",
    "/app/employees",
    "/app/employees/documents",
    "/app/availability",
    "/app/announcements",
    "/app/announcements/important-dates",
    "/app/notifications",
    "/app/employee-hub",
    "/app/employee-hub/schedule",
    "/app/employee-hub/shift-hub",
  ])("holds %s", (path) => {
    expect(contentHeldAtMenuEdge(path)).toBe(true);
  });

  it.each(["/app/schedule", "/app/schedule/", "/app/schedule/export", "/app/schedule/templates", "/app/schedule-badge-lab", "/app/settings", "/app/settings/general", "/app/settings/scheduling/conflicts"])(
    "lets %s take the room",
    (path) => {
      expect(contentHeldAtMenuEdge(path)).toBe(false);
    },
  );

  it("keeps the menu's column and starts every page 32 px right of it", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(
      /\.app-shell\[data-content-held="true"\]\[data-sidebar-collapsed="true"\]\s*\{\s*grid-template-columns:\s*var\(--app-sidebar-width\) minmax\(0, 1fr\);/,
    );
    // 32 px from the menu, the same as the right side; the page's top room
    // goes, so the heading starts 32 px from the top (Mert 2026-10-19, drawn
    // on Requests).
    expect(css).toMatch(/--app-page-gutter-start:\s*32px;/);
    expect(css).toMatch(/margin-left:\s*var\(--app-page-gutter-start\);\s*padding-top:\s*0;/);
    expect(css).toMatch(/margin-left:\s*var\(--app-page-gutter-start\);/);
    // The open menu's column; the held column must match it.
    expect(css).toMatch(/\.app-shell \{\s*--app-sidebar-width: 224px;\s*display: grid;\s*grid-template-columns: var\(--app-sidebar-width\) minmax\(0, 1fr\);/);
  });

  // With no top room on the page, nothing pinned at its top reaches up over it
  // (the employee's Lineup header sat 30 px low).
  it("pins the employee's Lineup header at the page's top", () => {
    const css = readFileSync("src/employee-hub/employee-lineup.css", "utf8");
    const pin = css.match(/(^|\n)\.employee-hub-page > \.employee-lineup-pin \{([^}]*)\}/)?.[2] ?? "";
    expect(pin).toMatch(/position:\s*sticky/);
    expect(pin).not.toMatch(/margin-top:\s*-/);
  });

  // The open menu is 224 px (Mert 2026-10-19, drawn on Notifications); the
  // panels that open beside it start at its edge.
  it("opens the side panels at the open menu's edge", () => {
    const css = readFileSync("src/styles.css", "utf8") + readFileSync("src/notifications/notifications.css", "utf8");
    for (const panel of ["schedule-export-panel", "ni-panel"]) {
      const body = [...css.matchAll(new RegExp(`(^|})\\s*\\.${panel}\\s*\\{([^}]*)\\}`, "g"))].map((match) => match[2]).join(";");
      expect(body).toMatch(/left:\s*var\(--app-sidebar-width\);/);
    }
    expect(css).not.toMatch(/left:\s*288px/);
  });
});
