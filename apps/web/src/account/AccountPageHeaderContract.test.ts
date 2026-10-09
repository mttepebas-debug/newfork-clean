import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Account page header contract", () => {
  it("keeps Account pages aligned with the main app content rhythm", () => {
    const source = readFileSync("src/account/components.tsx", "utf8");
    const styles = readFileSync("src/styles.css", "utf8");

    expect(source).not.toContain("className=\"eyebrow\"");
    expect(source).not.toContain("account-heading-icon");
    expect(styles).toContain("width: min(100% - 64px, 1320px);");
    expect(styles).not.toContain("width: min(100% - 64px, 880px);");
    expect(styles).not.toContain("width: min(100% - 36px, 880px);");
  });
});
