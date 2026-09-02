import { describe, expect, it } from "vitest";

import { intervalsOverlap, timeToBucket, toInterval } from "./minutes.js";

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
});

describe("intervalsOverlap", () => {
  it("returns true for overlapping intervals", () => {
    expect(intervalsOverlap({ s: 100, e: 200 }, { s: 150, e: 250 })).toBe(true);
  });
  it("returns false for touching intervals (half-open)", () => {
    expect(intervalsOverlap({ s: 100, e: 200 }, { s: 200, e: 300 })).toBe(false);
  });
  it("returns false for disjoint intervals", () => {
    expect(intervalsOverlap({ s: 100, e: 200 }, { s: 300, e: 400 })).toBe(false);
  });
});

describe("timeToBucket", () => {
  it("classifies 06:00 as morning", () => expect(timeToBucket("06:00")).toBe("morning"));
  it("classifies 12:00 as evening", () => expect(timeToBucket("12:00")).toBe("evening"));
  it("classifies 23:00 as night", () => expect(timeToBucket("23:00")).toBe("night"));
  it("classifies 04:00 as night", () => expect(timeToBucket("04:00")).toBe("night"));
});

describe("parseMin via toInterval (input validation)", () => {
  it("throws on non-numeric input", () => {
    expect(() => toInterval("abc", "10:00", false, 0)).toThrow(/Invalid time string/);
  });
  it("throws on missing colon", () => {
    expect(() => toInterval("0900", "10:00", false, 0)).toThrow();
  });
  it("throws on hour out of range", () => {
    expect(() => toInterval("25:00", "10:00", false, 0)).toThrow(/out of range/);
  });
  it("throws on minute out of range", () => {
    expect(() => toInterval("09:60", "10:00", false, 0)).toThrow(/out of range/);
  });
});

describe("timeToBucket boundaries", () => {
  it("04:59 is night", () => expect(timeToBucket("04:59")).toBe("night"));
  it("05:00 is morning", () => expect(timeToBucket("05:00")).toBe("morning"));
  it("11:59 is morning", () => expect(timeToBucket("11:59")).toBe("morning"));
  it("12:00 is evening", () => expect(timeToBucket("12:00")).toBe("evening"));
  it("17:59 is evening", () => expect(timeToBucket("17:59")).toBe("evening"));
  it("18:00 is night", () => expect(timeToBucket("18:00")).toBe("night"));
});
