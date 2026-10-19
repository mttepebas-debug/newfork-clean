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

  // Availability has no table: its list and its week each scroll in their own frame (below).
  it.each([...pages.filter((page) => page !== "availability-page"), "employee-documents-page"])("scrolls the list inside the table frame (%s)", (page) => {
    const body = bodyOf(
      (head) =>
        head.includes(`.${page}`) &&
        /(employee-table-wrap|job-catalog)/.test(head) &&
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

  // Shift catalog's list page sits in a shell and a tab panel: both pass the
  // height down, or the whole page scrolls again.
  it("passes the height through Shift catalog's shell and tab panel", () => {
    expect(bodyOf((head) => head.includes(".shift-catalog-shell") && head.includes(":has("))).toMatch(
      /height\s*:\s*100%/,
    );
    const panel = bodyOf((head) => head.endsWith(".shift-catalog-shell > .shift-catalog-panel"));
    expect(panel).toMatch(/display\s*:\s*flex/);
    expect(panel).toMatch(/flex\s*:\s*1 1 auto/);
    expect(panel).toMatch(/min-height\s*:\s*0/);
    expect(bodyOf((head) => head.startsWith(".shift-catalog-panel > .shift-catalog-settings-page"))).toMatch(
      /flex\s*:\s*1 1 auto/,
    );
  });

  // Announcements' Active and Past tables scroll in one body under the toolbar.
  it("scrolls Announcements' two tables in one body", () => {
    expect(readFileSync("src/views/AnnouncementsPage.tsx", "utf8")).toContain('className="list-frozen-body"');
    expect(bodyOf((head) => head.includes(".announcements-page") && head.includes(".list-frozen-body"))).toMatch(
      /overflow-y\s*:\s*auto/,
    );
  });

  // Every screen keeps its top in place (Mert 2026-10-16, "bütün ekranlarda"):
  // Lineup and Settings → Acknowledgements are lists, so they join the frame.
  it("fills the scrolling area on Lineup and Acknowledgements", () => {
    for (const page of ["lineup-page", "acknowledgement-page"]) {
      const body = bodyOf((head) => head.includes(`.${page}`) && !head.includes(">"));
      expect(body).toMatch(/display\s*:\s*flex/);
      expect(body).toMatch(/flex-direction\s*:\s*column/);
      expect(body).toMatch(/height\s*:\s*100%/);
    }
  });

  // The desktop Lineup (F, Mert 2026-10-19): its ticket and list fill what is left; the list under the ticket scrolls
  // in its own frame (lineup-desktop.css, LineupPage.test.tsx).
  it("gives the desktop Lineup's ticket and list the rest of the page", () => {
    expect(bodyOf((head) => head.includes(".lineup-page") && head.includes("> .lineup-desk"))).toMatch(/flex\s*:\s*1 1 auto/);
  });

  it.each([["acknowledgement-page", "job-catalog"]])("scrolls the list inside its frame (%s > .%s)", (page, frame) => {
    const body = bodyOf((head) => head.includes(`.${page}`) && head.includes(`> .${frame}`) && !head.includes(":focus"));
    expect(body).toMatch(/min-height\s*:\s*0/);
    expect(body).toMatch(/flex\s*:\s*0 1 auto/);
    expect(body).toMatch(/overflow-y\s*:\s*auto/);
    expect(body).toMatch(/position\s*:\s*relative/);
  });

  it("keeps Acknowledgements' column headings at the top of the frame", () => {
    for (const heading of [".job-catalog > .job-column-headings"]) {
      const body = bodyOf((head) => head.includes(heading));
      expect(body).toMatch(/position\s*:\s*sticky/);
      expect(body).toMatch(/top\s*:\s*0/);
    }
  });

  it("draws a focus ring inside the frame so its edge is not cut", () => {
    expect(bodyOf((head) => head.includes("> .job-catalog") && head.includes(":focus-visible"))).toMatch(
      /outline-offset\s*:\s*-2px/,
    );
  });

  it("pins the column headings to the top of the frame", () => {
    for (const heading of [".job-catalog > .catalog-column-headings"]) {
      const body = bodyOf((head) => head.includes(heading));
      expect(body).toMatch(/position\s*:\s*sticky/);
      expect(body).toMatch(/top\s*:\s*0/);
    }
  });

  // Availability's people list and the chosen week (AVAIL-GUN-3): the split
  // keeps the page's height, the list scrolls inside its own frame.
  it("keeps Availability's list in its own scrolling frame under a fixed top", () => {
    const team = readFileSync("src/availability/weekly-team.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const tall = team.slice(team.indexOf(media) + media.length);
    const teamRules = [...tall.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, head, body]) => ({ head: head!.replace(/\s+/g, " ").trim(), body: body! }));
    const teamBody = (match: (head: string) => boolean) => teamRules.filter(({ head }) => match(head)).map(({ body }) => body).join(";");
    const split = teamBody((head) => head.endsWith(".availability-page.list-page.list-page.list-page > .avt-split"));
    expect(split).toMatch(/flex\s*:\s*0 1 auto/);
    expect(split).toMatch(/grid-template-rows\s*:\s*minmax\(0, 1fr\)/);
    expect(split).toMatch(/overflow\s*:\s*hidden/);
    expect(teamBody((head) => head === ".avt-split > .avt-list")).toMatch(/max-height\s*:\s*100%/);
    const list = [...team.matchAll(/(^|})\s*\.avt-list\s*\{([^}]*)\}/g)].map((match) => match[2]).join(";");
    expect(list).toMatch(/overflow\s*:\s*hidden auto/);
  });

  // The frozen heading rests at --frozen-top, measured from the scrolling area
  // (useFrozenTop.ts). A list page that is its own scroll container counts its
  // top padding twice: Employees and Employees → Documents sat 30 px lower
  // than every other page (Mert 2026-10-18).
  it.each([...pages, "employee-documents-page"])("never becomes a scroll container of its own (%s)", (page) => {
    const sheets = ["src/styles.css", "src/views/list-page.css", "src/views/list-page-frozen.css"].map((file) =>
      readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""),
    );
    // A selector list split at its own commas, not those inside :is(…).
    const selectors = (head: string) => {
      const parts = [""];
      let depth = 0;
      for (const char of head) {
        depth += char === "(" ? 1 : char === ")" ? -1 : 0;
        if (char === "," && depth === 0) parts.push("");
        else parts[parts.length - 1] += char;
      }
      return parts.map((part) => part.trim());
    };
    const own = sheets
      .flatMap((sheet) => [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)])
      .filter(([, head]) => selectors(head!).some((selector) => new RegExp(`\\.${page}(?![\\w-])[^\\s>+~()]*$`).test(selector)))
      .map(([, , body]) => body!)
      .join(";");
    expect(own).not.toMatch(/overflow(-x|-y)?\s*:\s*[^;]*\b(hidden|auto|scroll)\b/);
  });
});
