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

  // A bar sat under the status tabs that did not fit (Mert 2026-10-13, Employees).
  it("scrolls status tabs without a scrollbar", () => {
    expect(body(".list-page.list-page .catalog-toolbar-status-row")).toMatch(/scrollbar-width\s*:\s*none/);
    expect(body(".list-page.list-page .catalog-toolbar-status-row::-webkit-scrollbar")).toMatch(/display\s*:\s*none/);
  });

  // The table scrolled sideways and up and down at once (Mert 2026-10-13).
  it("swaps the Employees table for its cards, scrolling only up and down (G2)", () => {
    const wrap = ".employees-page.list-page.list-page .employee-people-wrap";
    expect(body(wrap)).toMatch(/overflow-x\s*:\s*hidden/);
    expect(body(wrap)).toMatch(/overflow-y\s*:\s*auto/);
    // Empty too: the table's wide header would scroll sideways.
    expect(body(`${wrap} > .employee-table`)).toMatch(/display\s*:\s*none/);
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
