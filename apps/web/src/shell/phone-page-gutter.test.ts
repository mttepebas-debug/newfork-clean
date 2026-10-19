import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// On a phone the main pages reach both edges with the 16 px gutter (Mert
// 2026-10-13: Employees and Announcements first, then "evet tabiki" for
// Workspace, Availability and Requests).
describe("phone page gutter", () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const css = strip(readFileSync("src/styles.css", "utf8"));
  const rules = [...css.matchAll(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/g)].flatMap(([, block]) =>
    [...block!.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, head, body]) => ({
      head: head!.split(",").map((part) => part.trim()),
      body: body!,
    })),
  );

  it.each(["workspace-page", "availability-page", "requests-page"])(
    "runs %s to both edges with 16 px on each side",
    (page) => {
      const body = rules
        .filter(({ head }) => head.includes(`.${page}`))
        .map(({ body }) => body)
        .join(";");
      expect(body).toMatch(/width\s*:\s*auto/);
      expect(body).toMatch(/margin-inline\s*:\s*0/);
      expect(body).toMatch(/padding\s*:\s*16px 16px 34px/);
    },
  );

  // Every phone page has the same 16 px gutter (Mert 2026-10-19, S-186): the
  // employee's pages read theirs from one variable, never narrowed below it.
  it("gives the employee's pages the 16 px gutter at every phone width", () => {
    const set = [...css.matchAll(/--eh-gutter\s*:\s*([^;]+);/g)].map(([, value]) => value!.trim());
    expect(set).toEqual(["16px"]);
    const hub = rules
      .filter(({ head }) => head.includes(".employee-hub-page"))
      .map(({ body }) => body)
      .join(";");
    expect(hub).toMatch(/padding\s*:\s*16px var\(--eh-gutter\) 34px/);
    // A full-width strip bleeds by the gutter; its fallback is the same 16.
    const lineup = strip(readFileSync("src/employee-hub/employee-lineup.css", "utf8"));
    const fallbacks = [...lineup.matchAll(/var\(--eh-gutter,\s*([^)]+)\)/g)].map(([, value]) => value);
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks.every((value) => value === "16px")).toBe(true);
  });
});
