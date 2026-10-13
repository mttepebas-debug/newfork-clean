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
