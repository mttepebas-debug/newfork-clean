import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const topLevelPages = [
  {
    label: "Workspace",
    path: "src/views/WorkspacePage.tsx",
    headerClassName: "workspace-header",
    forbidden: ["className=\"eyebrow\"", "<p>", "Operational time record"],
  },
  {
    label: "Availability",
    path: "src/views/AvailabilityPage.tsx",
    headerClassName: "page-header",
    forbidden: ["className=\"eyebrow\""],
  },
  {
    label: "Time Entries",
    path: "src/views/TimeEntriesPage.tsx",
    headerClassName: "time-entries-header",
    forbidden: ["className=\"eyebrow\"", "Operational time record"],
  },
  {
    label: "Important Dates",
    path: "src/settings/ImportantDatesSettingsPage.tsx",
    headerClassName: "page-header",
    forbidden: ["className=\"eyebrow\""],
  },
  {
    label: "Employees",
    path: "src/employees/EmployeesPage.tsx",
    headerClassName: "employees-header",
    forbidden: ["className=\"eyebrow\"", ">People<"],
  },
  {
    label: "Announcements",
    path: "src/views/AnnouncementsPage.tsx",
    headerClassName: "communications-header",
    forbidden: ["<p>Communication</p>", "className=\"eyebrow\""],
  },
  {
    label: "Notifications",
    path: "src/views/NotificationsPage.tsx",
    headerClassName: "communications-header",
    forbidden: ["<p>Inbox</p>", "className=\"eyebrow\""],
  },
  {
    label: "Schedule Requests",
    path: "src/views/ScheduleRequestsPage.tsx",
    headerClassName: "page-header",
    forbidden: ["<nav className=\"schedule-subnav\"", "className=\"eyebrow\""],
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
      const source = readFileSync(page.path, "utf8");
      const header = headerBlock(source, page.headerClassName);

      for (const forbidden of page.forbidden) {
        expect(header, `${page.label} should not render ${forbidden}`).not.toContain(
          forbidden,
        );
      }
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
