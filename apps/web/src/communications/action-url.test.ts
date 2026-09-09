import { describe, expect, it } from "vitest";
import { safeAppActionUrl } from "./action-url";

describe("safeAppActionUrl", () => {
  it("allows app-local paths including query strings and hashes", () => {
    expect(safeAppActionUrl("/app")).toBe("/app");
    expect(safeAppActionUrl("/app/notifications?filter=unread")).toBe(
      "/app/notifications?filter=unread",
    );
    expect(safeAppActionUrl("/app/announcements#today")).toBe(
      "/app/announcements#today",
    );
  });

  it("rejects external, protocol-relative and app-prefix lookalike paths", () => {
    expect(safeAppActionUrl("https://outside.example/app")).toBeNull();
    expect(safeAppActionUrl("//outside.example/app")).toBeNull();
    expect(safeAppActionUrl("/application/settings")).toBeNull();
    expect(safeAppActionUrl("/welcome/profile")).toBeNull();
    expect(safeAppActionUrl("app/notifications")).toBeNull();
  });
});
