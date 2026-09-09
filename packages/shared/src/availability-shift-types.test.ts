import { describe, expect, it } from "vitest";
import { availabilityDayInputSchema, weeklyAvailabilityInputSchema } from "./availability";
import { availabilityProposalSchema } from "./availability-lifecycle";
const id = "AF9D0000-0000-4000-8000-000000000003";
const day = { day: 1, mode: "unrestricted", windows: [], blocked_shift_type_ids: [id] };
describe("availability service restrictions", () => {
  it("keeps independent type restrictions and canonicalizes identities", () => {
    expect(availabilityDayInputSchema.parse(day)).toEqual({ ...day, blocked_shift_type_ids: [id.toLowerCase()] });
    const days = Array.from({ length: 7 }, (_, dayIndex) => ({ ...day, day: dayIndex }));
    expect(weeklyAvailabilityInputSchema.parse({ timezone: "UTC", days }).days[0]!.blocked_shift_type_ids).toEqual([id.toLowerCase()]);
    expect(availabilityProposalSchema.parse({ timezone: "UTC", days, effective_from: "2035-01-15", effective_until: null }).days[0]!.blocked_shift_type_ids).toEqual([id.toLowerCase()]);
  });
  it("rejects case-insensitive duplicate, invalid, and excessive identities", () => {
    for (const blocked_shift_type_ids of [[id, id.toLowerCase()], ["Lunch"], Array(65).fill(id)]) expect(availabilityDayInputSchema.safeParse({ ...day, blocked_shift_type_ids }).success).toBe(false);
  });
  it("retains old clock-only records without inventing a type rule", () => {
    const { blocked_shift_type_ids: _, ...clockOnly } = day;
    expect(availabilityDayInputSchema.parse(clockOnly)).toEqual(clockOnly);
  });
});
