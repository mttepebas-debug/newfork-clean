import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  "src/styles.css",
  "utf8",
);

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(styles)?.[1] ?? "";
}

describe("settings page alignment styles", () => {
  it("keeps Settings page width owned by the shared page frame", () => {
    expect(ruleBody(".settings-page")).toContain(
      "width: min(100% - 64px, 1320px)",
    );
    expect(ruleBody(".roles-page")).not.toContain("width:");
    expect(ruleBody(".acknowledgement-page")).not.toContain("width:");
    expect(ruleBody(".notification-settings")).not.toContain("max-width:");
    expect(ruleBody(".notification-settings")).not.toContain("width:");
  });
});
