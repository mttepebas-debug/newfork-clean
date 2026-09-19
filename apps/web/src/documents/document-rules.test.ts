import { describe, expect, it } from "vitest";
import {
  acceptAttribute,
  isObligationClosed,
  sameSignerName,
} from "./document-rules";

describe("isObligationClosed", () => {
  it("closes removed, exempt and paused", () => {
    expect(isObligationClosed("removed")).toBe(true);
    expect(isObligationClosed("exempt")).toBe(true);
    expect(isObligationClosed("paused")).toBe(true);
  });
  it("leaves every other status open", () => {
    for (const status of [
      "missing",
      "grace",
      "pending_review",
      "rejected",
      "expired",
      "completed",
      "timezone_required",
    ] as const)
      expect(isObligationClosed(status)).toBe(false);
  });
});

describe("sameSignerName", () => {
  it("matches after trim, inner whitespace collapse and case fold", () => {
    expect(sameSignerName("  jane   DOE ", "Jane Doe")).toBe(true);
    expect(sameSignerName("Jane\tDoe", "Jane  Doe")).toBe(true);
  });
  it("rejects an empty, partial or joined name", () => {
    expect(sameSignerName("", "Jane Doe")).toBe(false);
    expect(sameSignerName("Jane Do", "Jane Doe")).toBe(false);
    expect(sameSignerName("JaneDoe", "Jane Doe")).toBe(false);
  });
});

describe("acceptAttribute", () => {
  it("expands jpeg to both spellings and dots every other format", () => {
    expect(acceptAttribute(["pdf", "jpeg", "png", "webp"])).toBe(
      ".pdf,.jpg,.jpeg,.png,.webp",
    );
  });
  it("is empty for no formats", () => {
    expect(acceptAttribute([])).toBe("");
  });
});
