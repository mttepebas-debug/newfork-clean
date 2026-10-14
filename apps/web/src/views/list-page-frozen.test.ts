import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// List pages keep their heading, tabs, filters and column headings in place;
// only the list scrolls, inside the table frame (Mert 2026-10-13: Availability,
// then "Hepsinde sabit" for every list page).
describe("frozen list pages", () => {
  const css = readFileSync("src/views/list-page-frozen.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const media = "@media (min-height: 560px) {";
  const start = css.indexOf(media);
  const block = start < 0 ? "" : css.slice(start + media.length);
  const rules = [...block.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, head, body]) => ({
    head: head!.replace(/\s+/g, " ").trim(),
    body: body!,
  }));
  const bodyOf = (match: (head: string) => boolean) =>
    rules
      .filter(({ head }) => match(head))
      .map(({ body }) => body)
      .join(";");
  const pages = [
    "availability-page",
    "employees-page",
    "requests-page",
    "notifications-page",
    "announcements-page",
    "document-catalog-settings-page",
    // Settings → Jobs joined the shared list look on 2026-10-14 (Mert's
    // comment on its page: "sadece liste scroll up down olsun").
    "jobs-catalog-page",
    // Locations, Shift catalog and Shift labels too (Mert 2026-10-14, card
    // "Hepsinde sabit").
    "locations-catalog-settings-page",
    "shift-catalog-settings-page",
  ];

  it("is loaded with the shared list look", () => {
    expect(readFileSync("src/views/CatalogPageHeader.tsx", "utf8")).toContain('import "./list-page-frozen.css";');
  });

  it.each(pages)("fills the scrolling area so the page itself never scrolls (%s)", (page) => {
    const body = bodyOf((head) => head.includes(`.${page}`) && head.endsWith(").list-page.list-page"));
    expect(body).toMatch(/display\s*:\s*flex/);
    expect(body).toMatch(/flex-direction\s*:\s*column/);
    expect(body).toMatch(/height\s*:\s*100%/);
  });

  it.each([...pages, "employee-documents-page"])("scrolls the list inside the table frame (%s)", (page) => {
    const body = bodyOf(
      (head) =>
        head.includes(`.${page}`) &&
        /(weekly-team-scroll|employee-table-wrap|job-catalog)/.test(head) &&
        !head.includes("> *") &&
        !head.includes("column-headings") &&
        !head.includes("popover"),
    );
    expect(body).toMatch(/min-height\s*:\s*0/);
    expect(body).toMatch(/flex\s*:\s*0 1 auto/);
    expect(body).toMatch(/overflow(-y)?\s*:\s*auto/);
    // An absolutely placed label inside the list scrolls with it instead of
    // lengthening the page (Announcements' .sr-only labels did).
    expect(body).toMatch(/position\s*:\s*relative/);
  });

  // Announcements' Active and Past tables scroll in one body under the toolbar.
  it("scrolls Announcements' two tables in one body", () => {
    expect(readFileSync("src/views/AnnouncementsPage.tsx", "utf8")).toContain('className="list-frozen-body"');
    expect(bodyOf((head) => head.includes(".announcements-page") && head.includes(".list-frozen-body"))).toMatch(
      /overflow-y\s*:\s*auto/,
    );
  });

  it("pins the column headings to the top of the frame", () => {
    for (const heading of [".weekly-team-table thead th", ".job-catalog > .catalog-column-headings"]) {
      const body = bodyOf((head) => head.includes(heading));
      expect(body).toMatch(/position\s*:\s*sticky/);
      expect(body).toMatch(/top\s*:\s*0/);
    }
  });
});
