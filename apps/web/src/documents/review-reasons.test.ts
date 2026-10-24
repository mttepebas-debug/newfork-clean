import { describe, expect, it } from "vitest";
import { hasReason, quickReasons, toggleReason } from "./review-reasons";

// A2 Tur 6: a rejected file's common reasons are chips that fill its reason as whole sentences
// (artifacts/documents-drawer/page/tur2-a2.js:180-189, flow :261-271 and :641-650).
describe("quick reasons", () => {
  it("offers the five common reasons in the mockup's order", () => {
    expect(quickReasons).toEqual([
      "Blurry photo",
      "Wrong document",
      "Expired",
      "Name doesn't match",
      "A side is missing",
    ]);
  });

  it("counts a reason only as a whole sentence of the text", () => {
    expect(hasReason("Blurry photo.", "Blurry photo")).toBe(true);
    expect(hasReason("Blurry photo", "Blurry photo")).toBe(true);
    expect(hasReason("blurry photo.", "Blurry photo")).toBe(true);
    expect(hasReason("The number is cut off. Blurry photo.", "Blurry photo")).toBe(true);
    expect(hasReason("Cut off; Blurry photo", "Blurry photo")).toBe(true);
    expect(hasReason("The card expired in 2024", "Expired")).toBe(false);
    expect(hasReason("Blurry photos everywhere", "Blurry photo")).toBe(false);
    expect(hasReason("Blurry photo is the issue", "Blurry photo")).toBe(false);
    expect(hasReason("", "Blurry photo")).toBe(false);
  });

  it("adds a reason as its own sentence after what was typed", () => {
    expect(toggleReason("", "Blurry photo")).toBe("Blurry photo.");
    expect(toggleReason("Blurry photo. The number is cut off", "A side is missing")).toBe(
      "Blurry photo. The number is cut off. A side is missing.",
    );
    expect(toggleReason("The card expired in 2024", "Expired")).toBe("The card expired in 2024. Expired.");
    expect(toggleReason("Cut off;", "Expired")).toBe("Cut off. Expired.");
  });

  it("takes a pressed reason out again and keeps the rest as typed", () => {
    expect(toggleReason("Blurry photo. The number is cut off. A side is missing.", "A side is missing")).toBe(
      "Blurry photo. The number is cut off.",
    );
    expect(toggleReason("The card expired in 2024. Expired.", "Expired")).toBe("The card expired in 2024.");
    expect(toggleReason("Blurry photo.", "Blurry photo")).toBe("");
    expect(toggleReason("Blurry photo. Wrong document.", "Blurry photo")).toBe("Wrong document.");
  });
});
