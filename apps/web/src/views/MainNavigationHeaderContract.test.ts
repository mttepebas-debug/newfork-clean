import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Home (/app/workspace) is not here: like the employee's Home it opens with
// the Daylight greeting, which folds into the bar (Mert 2026-10-19, KARARLAR S-210).
const topLevelPages = [
  {
    label: "Availability",
    path: "src/views/AvailabilityPage.tsx",
    catalogTitle: "Availability",
  },
  {
    label: "Important Dates",
    path: "src/views/ImportantDatesPage.tsx",
    catalogTitle: "Important Dates",
  },
  {
    label: "Employees",
    path: "src/employees/EmployeesPage.tsx",
    catalogTitle: "Employees",
  },
  {
    label: "Announcements",
    path: "src/views/AnnouncementsPage.tsx",
    catalogTitle: "Announcements",
  },
  {
    label: "Schedule Requests",
    path: "src/views/ScheduleRequestsPage.tsx",
    catalogTitle: "Requests",
  },
] as const;

describe("main navigation header contract", () => {
  it("uses one shared top-level page container contract", () => {
    const styles = readFileSync("src/styles.css", "utf8").replace(/\s+/g, " ");

    expect(styles).toContain(
      ".workspace-page, .availability-page, .important-dates-page, .employees-page, .announcements-page, .requests-page {",
    );
    expect(styles).toContain("width: min(100% - 64px, 1320px);");
    expect(styles).toContain("padding: 30px 0 44px;");
  });

  it("uses the shared catalog header on catalog-style top-level pages", () => {
    const headerSource = readFileSync(
      "src/views/CatalogPageHeader.tsx",
      "utf8",
    );
    expect(headerSource).toContain('className="catalog-page-header"');
    expect(headerSource).toContain('className="catalog-page-eyebrow"');

    for (const page of topLevelPages) {
      const source = readFileSync(page.path, "utf8");
      expect(source, `${page.label} should use CatalogPageHeader`).toContain(
        "<CatalogPageHeader",
      );
      expect(source, `${page.label} should keep the shared title`).toContain(
        `title="${page.catalogTitle}"`,
      );
      expect(
        source,
        `${page.label} should not use legacy page headers`,
      ).not.toContain('className="employees-header"');
      expect(
        source,
        `${page.label} should not use legacy page headers`,
      ).not.toContain('className="page-header"');
      expect(
        source,
        `${page.label} should not use settings header`,
      ).not.toContain("<SettingsHeader");
    }
  });
});
