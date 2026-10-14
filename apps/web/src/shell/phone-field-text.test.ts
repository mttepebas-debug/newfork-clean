import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// iPhone zooms the page into a text field whose text is under 16 px, so every
// phone text field, list and text area is 16 px (Mert 2026-10-14, "Evet, 16 piksel").
describe("phone field text", () => {
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const css = strip(readFileSync("src/styles.css", "utf8"));
  const phoneRules = [
    ...css.matchAll(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/g),
  ].flatMap(([, block]) =>
    [...block!.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, head, body]) => ({
      head: head!.split(/,(?![^(]*\))/).map((part) => part.trim()),
      body: body!,
    })),
  );
  const rule = phoneRules.find(
    ({ head }) => head.includes("textarea") && head.includes("select"),
  );

  it("sets text fields, lists and text areas to 16 px on a phone", () => {
    expect(rule?.body).toMatch(/font-size\s*:\s*16px\s*!important/);
    const field = rule!.head.find((part) => part.startsWith("input"));
    expect(field).toBeDefined();
    for (const type of [
      "text",
      "search",
      "email",
      "password",
      "number",
      "tel",
      "time",
      "date",
    ]) {
      expect(field).not.toContain(`[type="${type}"]`);
    }
  });

  it("leaves check boxes, radio buttons and sliders at their own size", () => {
    const field = rule!.head.find((part) => part.startsWith("input"))!;
    for (const type of ["checkbox", "radio", "range"]) {
      expect(field).toContain(`:not([type="${type}"])`);
    }
  });

  it("lets no other sheet force a field's text size", () => {
    const sheets: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".css")) sheets.push(path);
      }
    };
    walk("src");
    // Opening the @media blocks lets a phone-only rule inside one be seen too.
    const forced = sheets.flatMap((path) =>
      [
        ...strip(readFileSync(path, "utf8"))
          .replace(/@media[^{]*\{/g, "")
          .matchAll(/([^{}]+)\{([^}]*)\}/g),
      ]
        .filter(
          ([, head, body]) =>
            /font-size[^;]*!important/.test(body!) &&
            /\b(input|select|textarea)\b/.test(head!),
        )
        .map(([, head]) => `${path}: ${head!.trim()}`),
    );
    expect(
      forced.filter((entry) => !entry.startsWith("src/styles.css: input:not(")),
    ).toEqual([]);
  });
});
