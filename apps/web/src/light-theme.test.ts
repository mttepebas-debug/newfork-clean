import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The dark theme is retired (THEME-001); the app always renders light.
describe("light-only appearance", () => {
  it("pins the document to light before the app bundle loads", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toMatch(/<html[^>]*data-theme="light"[^>]*style="color-scheme: light"/);
    expect(html).not.toMatch(/<script>/);
  });

  it("ships no dark-only styles", () => {
    const offenders = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".css"))
      .filter((file) => /data-theme="?dark|prefers-color-scheme:\s*dark/.test(readFileSync(join("src", file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
