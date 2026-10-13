import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// On a phone the main pages reach both edges with the 16 px gutter (Mert
// 2026-10-13: Employees and Announcements first, then "evet tabiki" for
// Workspace, Availability, Notifications and Requests).
describe("phone page gutter", () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const css = strip(readFileSync("src/styles.css", "utf8"));
  const rules = [...css.matchAll(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/g)].flatMap(([, block]) =>
    [...block!.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, head, body]) => ({
      head: head!.split(",").map((part) => part.trim()),
      body: body!,
    })),
  );

  it.each(["workspace-page", "availability-page", "notifications-page", "requests-page"])(
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

  it("lets no page sheet narrow the Notifications gutter again", () => {
    const sheet = strip(readFileSync("src/communications/notification-shift-details.css", "utf8")).replace(
      /@media[^{]*\{/g,
      "",
    );
    const own = [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, head]) => head!.trim() === ".notifications-page");
    expect(own.map(([, , body]) => body!).join(";")).not.toMatch(/padding|width/);
  });
});
