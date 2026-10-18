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

  it.each(["/app/schedule", "/app/schedule/", "/app/settings", "/app/settings/general", "/app/settings/scheduling/conflicts"])(
    "lets %s take the room",
    (path) => {
      expect(contentHeldAtMenuEdge(path)).toBe(false);
    },
  );

  it("keeps the menu's column and starts every page 4 px right of it", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(
      /\.app-shell\[data-content-held="true"\]\[data-sidebar-collapsed="true"\]\s*\{\s*grid-template-columns:\s*288px minmax\(0, 1fr\);/,
    );
    expect(css).toMatch(/--app-page-gutter-start:\s*4px;/);
    expect(css).toMatch(/margin-left:\s*var\(--app-page-gutter-start\);/);
    // The open menu's column is 288 px; the held column must match it.
    expect(css).toMatch(/\.app-shell \{\s*display: grid;\s*grid-template-columns: 288px minmax\(0, 1fr\);/);
  });
});
