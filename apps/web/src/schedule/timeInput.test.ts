import { describe, expect, it } from "vitest";

import { resolveTimeInputFormat } from "./timeInput";

// BL-055: the person's own 12h/24h choice (Account → Preferences) decides how
// they type a time; "System" leaves it to the workspace's Schedule setting.
describe("resolveTimeInputFormat", () => {
  it.each([
    ["12h", "24h", "12h"],
    ["24h", "12h", "24h"],
    ["system", "24h", "24h"],
    ["system", "12h", "12h"],
    [undefined, "24h", "24h"],
  ] as const)("personal %s over workspace %s → %s", (personal, workspace, expected) => {
    expect(resolveTimeInputFormat(personal, workspace)).toBe(expected);
  });
});
