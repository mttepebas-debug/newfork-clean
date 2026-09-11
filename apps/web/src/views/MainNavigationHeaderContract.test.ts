import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const topLevelPages = [
  {
    label: "Workspace",
    path: "src/views/WorkspacePage.tsx",
    headerClassName: "workspace-header",
    forbidden: ['className="eyebrow"', "<p>", "Operational time record"],
  },
  {
    label: "Availability",
    path: "src/views/AvailabilityPage.tsx",
    headerClassName: "catalog-page-header",
    catalogTitle: "Availability",
  },
  {
    label: "Time Entries",
    path: "src/views/TimeEntriesPage.tsx",
    headerClassName: "time-entries-header",
    forbidden: ['className="eyebrow"', "Operational time record"],
  },
  {
    label: "Important Dates",
    path: "src/settings/ImportantDatesSettingsPage.tsx",
    headerClassName: "catalog-page-header",
    catalogTitle: "Important Dates",
  },
  {
    label: "Employees",
    path: "src/employees/EmployeesPage.tsx",
    headerClassName: "catalog-page-header",
    catalogTitle: "Employees",
  },
  {
    label: "Announcements",
    path: "src/views/AnnouncementsPage.tsx",
    headerClassName: "catalog-page-header",
    catalogTitle: "Announcements",
  },
  {
    label: "Notifications",
    path: "src/views/NotificationsPage.tsx",
    headerClassName: "communications-header",
    forbidden: ["<p>Inbox</p>", 'className="eyebrow"'],
  },
  {
    label: "Schedule Requests",
    path: "src/views/ScheduleRequestsPage.tsx",
    headerClassName: "catalog-page-header",
    catalogTitle: "Requests",
  },
] as const;

describe("main navigation header contract", () => {
  it("uses one shared top-level page container contract", () => {
    const styles = readFileSync("src/styles.css", "utf8").replace(/\s+/g, " ");

    expect(styles).toContain(
      ".workspace-page, .availability-page, .time-entries-page, .important-dates-page, .employees-page, .announcements-page, .notifications-page, .requests-page {",
    );
    expect(styles).toContain("width: min(100% - 64px, 1320px);");
    expect(styles).toContain("padding: 30px 0 44px;");
  });

  it("keeps top-level app pages free of eyebrow/category rows", () => {
    for (const page of topLevelPages) {
      if ("catalogTitle" in page) continue;
      const source = readFileSync(page.path, "utf8");
      const header = headerBlock(source, page.headerClassName);

      for (const forbidden of page.forbidden) {
        expect(
          header,
          `${page.label} should not render ${forbidden}`,
        ).not.toContain(forbidden);
      }
    }
  });

  it("uses the shared catalog header on catalog-style top-level pages", () => {
    const headerSource = readFileSync(
      "src/views/CatalogPageHeader.tsx",
      "utf8",
    );
    expect(headerSource).toContain('className="catalog-page-header"');
    expect(headerSource).toContain('className="catalog-page-eyebrow"');

    for (const page of topLevelPages) {
      if (!("catalogTitle" in page)) continue;
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

function headerBlock(source: string, className: string): string {
  const start = source.indexOf(`<header className="${className}"`);
  expect(start, `missing header ${className}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("</header>", start);
  expect(end, `missing closing header ${className}`).toBeGreaterThan(start);
  return source.slice(start, end);
}
