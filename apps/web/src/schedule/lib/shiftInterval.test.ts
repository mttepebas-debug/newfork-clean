import { describe, expect, it } from "vitest";

import { toInterval } from "./shiftInterval";

describe("toInterval", () => {
  it("non-crossing shift on reference date", () => {
    expect(toInterval("09:00", "17:00", false, 0)).toEqual({ s: 540, e: 1020 });
  });
  it("crossing shift on reference date adds a day", () => {
    expect(toInterval("22:00", "02:00", true, 0)).toEqual({ s: 1320, e: 1560 });
  });
  it("non-crossing shift on next date offsets by 1440", () => {
    expect(toInterval("01:00", "09:00", false, 1)).toEqual({ s: 1500, e: 1980 });
  });
  it("throws on non-numeric input", () => {
    expect(() => toInterval("abc", "10:00", false, 0)).toThrow(
      /Invalid time string/,
    );
  });
  it("throws on missing colon", () => {
    expect(() => toInterval("0900", "10:00", false, 0)).toThrow();
  });
  it("throws on hour out of range", () => {
    expect(() => toInterval("25:00", "10:00", false, 0)).toThrow(
      /out of range/,
    );
  });
  it("throws on minute out of range", () => {
    expect(() => toInterval("09:60", "10:00", false, 0)).toThrow(
      /out of range/,
    );
  });
});
