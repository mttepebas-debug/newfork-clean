import { describe, expect, it } from "vitest";
import { locationInputSchema, locationPhoneSchema, locationSchema, locationShortNameSchema, scheduleLocationSchema, suggestLocationShortName } from "./index";

describe("location short name contract", () => {
  it.each(["MRK", "A-2", "123456789012"])("accepts %s", value => {
    expect(locationShortNameSchema.parse(value)).toBe(value);
  });
  it.each(["", "A", "A B", "A/B", "A_B", "Şişli", "1234567890123"])("rejects %s", value => {
    expect(locationShortNameSchema.safeParse(value).success).toBe(false);
  });
  it("normalizes whitespace and case but requires a short name for writes", () => {
    expect(locationShortNameSchema.parse(" main ")).toBe("MAIN");
    expect(locationInputSchema.shape.short_name.safeParse(undefined).success).toBe(false);
    expect(locationInputSchema.shape.short_name.safeParse(null).success).toBe(false);
  });
  it("keeps legacy reads valid without inventing names", () => {
    for (const schema of [locationSchema.shape.short_name, scheduleLocationSchema.shape.short_name]) {
      expect(schema.parse(null)).toBeNull();
      expect(schema.parse(undefined)).toBeUndefined();
      expect(schema.parse("Şişli")).toBe("Şişli");
    }
  });
  it.each([
    ["Deniz", "DNZ"], ["Deni", "DN"], ["Deea", "DEA"], ["Ankara", "ANK"],
    ["Main Street", "MS"], ["Şişli", "SSL"], ["Store 2", "S2"], ["A", ""], ["  ", ""], ["Aa", ""],
  ])("suggests %s → %s", (name, expected) => {
    expect(suggestLocationShortName(name)).toBe(expected);
  });
});

describe("location phone contract", () => {
  it("accepts only 10-digit US numbers in E.164", () => {
    expect(locationPhoneSchema.parse("+14155550100")).toBe("+14155550100");
    for (const value of ["+442071234567", "+1415555010", "4155550100", "+10155550100"]) {
      expect(locationPhoneSchema.safeParse(value).success).toBe(false);
    }
  });
});
