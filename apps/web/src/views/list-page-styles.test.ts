import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sheets = ["src/views/list-page.css", "src/settings/jobs-settings.css"].map(
  (path) => [path, readFileSync(path, "utf8")] as const,
);

describe("list page table frame", () => {
  // A row's "⋯" menu opens below its button; a clipping frame hid the menu of
  // the last rows behind the table's edge (Mert 2026-10-12, Shift catalog).
  it.each(sheets)("never clips a list table's row menus (%s)", (_path, css) => {
    const clipping = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
      ([, selector, body]) =>
        /\.job-catalog(?![\w-])/.test(selector!) &&
        !/catalog-table-empty/.test(selector!) &&
        /overflow\s*:\s*(hidden|clip)/.test(body!),
    );
    expect(clipping.map(([, selector]) => selector!.trim())).toEqual([]);
  });
});

describe("list pages on a phone", () => {
  const css = readFileSync("src/views/list-page.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const media = "@media (max-width: 720px) {";
  const phone = css.slice(css.indexOf(media) + media.length);
  const body = (selector: string) =>
    [...phone.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, head]) => head!.trim() === selector)
      .map(([, , rule]) => rule!)
      .join(";");

  // A bar sat under the status tabs, and one at the right of every phone
  // page (Mert 2026-10-13: "bütün mobil tasarımlarımız"). One shared rule.
  it("shows no scrollbar anywhere on a phone", () => {
    const shared = readFileSync("src/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const phoneRule = /@media \(max-width: 720px\) \{\s*\*\s*\{\s*scrollbar-width:\s*none !important;\s*\}\s*\*::-webkit-scrollbar\s*\{\s*display:\s*none !important;\s*\}\s*\}/;
    expect(shared).toMatch(phoneRule);
  });

  // The table scrolled sideways and up and down at once (Mert 2026-10-13).
  it("swaps the Employees table for its cards, scrolling only up and down (G2)", () => {
    const wrap = ".employees-page.list-page.list-page .employee-people-wrap";
    expect(body(wrap)).toMatch(/overflow-x\s*:\s*hidden/);
    expect(body(wrap)).toMatch(/overflow-y\s*:\s*auto/);
    // Empty too: the table's wide header would scroll sideways.
    expect(body(`${wrap} > .employee-table`)).toMatch(/display\s*:\s*none/);
  });

  // The empty note took the desktop table's soft ground as a card, a grey box over the page's sky
  // (Mert 2026-10-23). It sits on the sky under a line, which a full list does not draw (KARARLAR S-250).
  it("sets an empty list's note on the sky under a line, with no card", () => {
    const note = body(":is(.list-page.list-page, .list-page.list-page :is(.job-catalog, .employee-table-wrap)) > :is(.announcement-list-empty, .catalog-table-empty)");
    expect(note).toMatch(/background\s*:\s*transparent/);
    expect(note).toMatch(/box-shadow\s*:\s*none/);
    expect(note).toMatch(/border-radius\s*:\s*0/);
    expect(note).toMatch(/border-top\s*:\s*1px solid var\(--theme-border\)/);
    // A table kept on a phone hides its heading row while empty, so no grey bar sits over the sky.
    expect(body(".list-page.list-page .employee-table-wrap:has(> .catalog-table-empty) > table,\n  .list-page.list-page .job-catalog:has(> .catalog-table-empty) > .job-column-headings")).toMatch(/display\s*:\s*none/);
  });

  it("runs Employees to both edges and swaps in the short add label", () => {
    expect(body(".employees-page.list-page.list-page")).toMatch(/padding-inline\s*:\s*16px/);
    expect(body(".employees-page.list-page.list-page")).toMatch(/margin-inline\s*:\s*0/);
    expect(body(".list-add-button .list-add-long")).toMatch(/display\s*:\s*none/);
    expect(body(".list-add-button .list-add-short")).toMatch(/display\s*:\s*inline/);
  });
});

describe("Employees location cell", () => {
  // The name dropped under its pin on a narrow column (Mert 2026-10-13).
  it("keeps the pin and the name on one line", () => {
    const css = readFileSync("src/employees/employee-location-parts.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (selector: string) => new RegExp(`(^|\\})\\s*${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? "";
    expect(rule(".employee-location-cell")).toMatch(/flex-wrap\s*:\s*nowrap/);
    expect(rule(".employee-location-name")).toMatch(/white-space\s*:\s*nowrap/);
  });
});

// Mert 2026-10-23 (requests-add-top): every list page's search box and location list wear one frame.
describe("one filter frame on every list page", () => {
  const rules = (path: string) =>
    [...readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      ([, head, body]) => [head!.trim().replace(/\s+/g, " "), body!] as const,
    );

  // Requests drew its own box, thinner on a phone (36 px, 12 px text) than Important Dates' (44 px).
  it("lets Requests' search box take the shared frame", () => {
    const own = rules("src/views/requests-catalog.css")
      .filter(([head]) => /toolbar-search|requests-search/.test(head) && !/ input$/.test(head))
      .map(([head]) => head);
    expect(own).toEqual([]);
  });

  it("frames Shift Hub's location list and search like the list pages", () => {
    const all = rules("src/employee-hub/shift-exchanges/shift-exchanges.css");
    const body = (selector: string) => all.filter(([head]) => head === selector).map(([, rule]) => rule).join(";");
    for (const box of [".sx-root .sx-filters select", ".sx-root .sx-filters .sx-filter-search"]) {
      expect(body(box)).toMatch(/height\s*:\s*36px/);
      expect(body(box)).toMatch(/border\s*:\s*1px solid var\(--theme-border-control\)/);
      expect(body(box)).toMatch(/border-radius\s*:\s*6px/);
      expect(body(box)).toMatch(/font-size\s*:\s*13px/);
    }
    expect(body(".sx-root .sx-filters .sx-filter-search input")).toMatch(/border\s*:\s*0/);
    expect(body(".sx-root .sx-filters select, .sx-root .sx-filters .sx-filter-search")).toMatch(/height\s*:\s*44px/);
  });
});
