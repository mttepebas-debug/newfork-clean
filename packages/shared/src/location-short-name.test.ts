import { describe, expect, it } from "vitest";
import { locationInputSchema, locationSchema, locationShortNameSchema, scheduleLocationSchema } from "./index";

describe("location short name contract", () => {
  it.each(["MRK", "Şişli", "A-2", "123456789012"])("accepts %s", value => {
    expect(locationShortNameSchema.parse(value)).toBe(value);
  });
  it.each(["", "A", "A B", "A/B", "A_B", "1234567890123"])("rejects %s", value => {
    expect(locationShortNameSchema.safeParse(value).success).toBe(false);
  });
  it("normalizes external whitespace but requires a short name for writes", () => {
    expect(locationShortNameSchema.parse(" MAIN ")).toBe("MAIN");
    expect(locationInputSchema.shape.short_name.safeParse(undefined).success).toBe(false);
    expect(locationInputSchema.shape.short_name.safeParse(null).success).toBe(false);
  });
  it("keeps legacy reads valid without inventing names", () => {
    for (const schema of [locationSchema.shape.short_name, scheduleLocationSchema.shape.short_name]) {
      expect(schema.parse(null)).toBeNull();
      expect(schema.parse(undefined)).toBeUndefined();
    }
  });
});
