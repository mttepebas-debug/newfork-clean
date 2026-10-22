import { describe, expect, it } from "vitest";
import {
  myTimeOffSchema,
  timeOffAskInputSchema,
  timeOffAskRefusal,
  timeOffDayCount,
} from "./time-off-requests";

const now = { date: "2026-10-22", time: "09:30" };
const allDay = (start_date: string, end_date: string) =>
  ({ start_date, end_date, all_day: true, start_time: null, end_time: null }) as const;
const hours = (start_date: string, start_time: string, end_date: string, end_time: string) =>
  ({ start_date, end_date, all_day: false, start_time, end_time }) as const;

describe("timeOffAskRefusal", () => {
  it("lets a future range through", () => {
    expect(timeOffAskRefusal(allDay("2026-10-23", "2026-10-25"), now)).toBeNull();
    expect(timeOffAskRefusal(hours("2026-10-22", "10:00", "2026-10-22", "24:00"), now)).toBeNull();
  });

  it("counts All day today as started, and a passed day or clock", () => {
    expect(timeOffAskRefusal(allDay("2026-10-22", "2026-10-22"), now)).toBe("time_off.started");
    expect(timeOffAskRefusal(allDay("2026-10-21", "2026-10-23"), now)).toBe("time_off.started");
    expect(timeOffAskRefusal(hours("2026-10-22", "09:30", "2026-10-22", "12:00"), now)).toBe("time_off.started");
  });

  it("refuses more than 31 days", () => {
    expect(timeOffAskRefusal(allDay("2026-11-01", "2026-12-01"), now)).toBeNull();
    expect(timeOffAskRefusal(allDay("2026-11-01", "2026-12-02"), now)).toBe("time_off.too_long");
    expect(timeOffAskRefusal(hours("2026-11-01", "09:00", "2026-12-02", "09:00"), now)).toBeNull();
    expect(timeOffAskRefusal(hours("2026-11-01", "09:00", "2026-12-02", "09:01"), now)).toBe("time_off.too_long");
  });

  it("refuses an end before the start", () => {
    expect(timeOffAskRefusal(allDay("2026-11-02", "2026-11-01"), now)).toBe("time_off.order");
    expect(timeOffAskRefusal(hours("2026-11-01", "15:00", "2026-11-01", "10:00"), now)).toBe("time_off.order");
    expect(timeOffAskRefusal(hours("2026-11-01", "15:00", "2026-11-01", "15:00"), now)).toBe("time_off.order");
  });

  it("counts days with both ends", () => {
    expect(timeOffDayCount("2026-10-30", "2026-11-01")).toBe(3);
    expect(timeOffDayCount("2026-03-07", "2026-03-09")).toBe(3);
  });
});

describe("timeOffAskInputSchema", () => {
  const base = {
    kind_of_leave: "vacation",
    start_date: "2026-10-30",
    end_date: "2026-11-01",
    all_day: true,
    start_time: null,
    end_time: null,
    note: null,
    expected_timezone: "America/Los_Angeles",
    client_key: "98020000-0000-4000-8000-000000000001",
  };

  it("takes All day without clocks and hours with both, 24:00 as an end", () => {
    expect(timeOffAskInputSchema.safeParse(base).success).toBe(true);
    expect(timeOffAskInputSchema.safeParse({ ...base, all_day: false, start_time: "18:00", end_time: "24:00" }).success).toBe(true);
  });

  it("refuses hours with a clock missing, 24:00 as a start, a fifth type and a long note", () => {
    expect(timeOffAskInputSchema.safeParse({ ...base, all_day: false, start_time: "18:00" }).success).toBe(false);
    expect(timeOffAskInputSchema.safeParse({ ...base, all_day: false, start_time: "24:00", end_time: "24:00" }).success).toBe(false);
    expect(timeOffAskInputSchema.safeParse({ ...base, kind_of_leave: "holiday" }).success).toBe(false);
    expect(timeOffAskInputSchema.safeParse({ ...base, note: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("myTimeOffSchema", () => {
  it("reads what my_time_off_service answers", () => {
    // A rolled-back `select public.my_time_off_service(...)::text` (D2 migration, test world fx, 2026-10-22).
    const read = {
      time_zone: "Europe/Istanbul",
      today: "2026-10-22",
      location_names: ["Kadikoy"],
      requests: [
        {
          id: "0500b11b-9cde-4b29-8920-f37cc9f5b268",
          kind: "leave",
          kind_of_leave: "personal",
          status: "pending",
          starts_at: "2026-10-28T15:00:00+00:00",
          ends_at: "2026-10-28T21:00:00+00:00",
          all_day: false,
          time_timezone: "Europe/Istanbul",
          start_date: "2026-10-28",
          end_date: "2026-10-28",
          start_time: "18:00",
          end_time: "24:00",
          note: null,
          revision: 1,
          created_at: "2026-10-22T11:08:06.533185+00:00",
          decided_at: null,
          decided_by_name: null,
          decision_note: null,
          ended_at: null,
          ended_note: null,
        },
      ],
    };
    expect(myTimeOffSchema.parse(read)).toEqual(read);
  });
});
