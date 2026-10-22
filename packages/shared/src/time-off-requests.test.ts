import { describe, expect, it } from "vitest";
import {
  myTimeOffSchema,
  myTimeOffShiftsQuerySchema,
  myTimeOffShiftsSchema,
  timeOffAnswerInputSchema,
  timeOffAskInputSchema,
  timeOffAskRefusal,
  timeOffDayCount,
  timeOffImpactSchema,
  timeOffRequestsPageSchema,
  timeOffRequestsQuerySchema,
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

// Time off rebuild D3: real answers of the database, from a rolled-back transaction (world fx).
const deciderView = {
  id: "e0f676c1-5683-4b2d-9027-186e01391231",
  kind: "leave",
  note: "Family visit",
  status: "pending",
  all_day: true,
  ends_at: "2028-09-20T21:00:00+00:00",
  end_date: "2028-09-20",
  end_time: null,
  ended_at: null,
  revision: 1,
  starts_at: "2028-09-18T21:00:00+00:00",
  created_at: "2026-10-22T11:46:48.965226+00:00",
  decided_at: null,
  ended_note: null,
  start_date: "2028-09-19",
  start_time: null,
  employee_id: "735032ec-0e98-4fb1-8005-c4ede5b1726b",
  decision_note: null,
  employee_name: "Ali Person",
  kind_of_leave: "vacation",
  shifts_opened: 0,
  time_timezone: "Europe/Istanbul",
  location_names: ["Kadikoy", "Besiktas"],
  decided_by_name: null,
} as const;

describe("the answer's shapes", () => {
  it("reads what the database answers", () => {
    const impact = {
      request: deciderView,
      locations: [
        {
          shifts: [
            {
              id: "7167d145-e686-4a7f-be0a-f667fc84e830",
              ends_at: "2028-09-19T12:00:00+00:00",
              end_time: "15:00",
              job_name: "Cook",
              timezone: "Europe/Istanbul",
              starts_at: "2028-09-19T06:00:00+00:00",
              start_time: "09:00",
              scheduled_date: "2028-09-19",
            },
          ],
          location_id: "fd234463-4d76-48ad-8401-a14a28638dca",
          location_name: "Kadikoy",
        },
      ],
      fingerprint: "11611d0e7f9542616aa542c39e615471",
      shift_count: 2,
      hidden_shift_count: 1,
    };
    expect(timeOffImpactSchema.parse(impact)).toEqual(impact);
    const page = { page: 1, total: 1, waiting: 1, requests: [deciderView], page_size: 50 };
    expect(timeOffRequestsPageSchema.parse(page)).toEqual(page);
    const shifts = {
      count: 2,
      shifts: [
        {
          id: "7167d145-e686-4a7f-be0a-f667fc84e830",
          end_time: "15:00",
          job_name: "Cook",
          start_time: "09:00",
          location_name: "Kadikoy",
          scheduled_date: "2028-09-19",
        },
      ],
    };
    expect(myTimeOffShiftsSchema.parse(shifts)).toEqual(shifts);
  });

  it("asks an approval for the shifts it opens, a decline for nothing", () => {
    expect(timeOffAnswerInputSchema.safeParse({ verdict: "approve", note: null, expected_revision: 1, expected_impact: null }).success).toBe(false);
    expect(timeOffAnswerInputSchema.safeParse({ verdict: "approve", note: "Enjoy", expected_revision: 1, expected_impact: "abc" }).success).toBe(true);
    expect(timeOffAnswerInputSchema.safeParse({ verdict: "decline", note: null, expected_revision: 1, expected_impact: null }).success).toBe(true);
    expect(timeOffAnswerInputSchema.safeParse({ verdict: "maybe", note: null, expected_revision: 1, expected_impact: null }).success).toBe(false);
    expect(timeOffAnswerInputSchema.safeParse({ verdict: "decline", note: "x".repeat(1001), expected_revision: 1, expected_impact: null }).success).toBe(false);
  });

  it("reads a list question from an address, with its defaults", () => {
    expect(timeOffRequestsQuerySchema.parse({})).toEqual({ view: "all", search: "", sort: "needs_decision", page: 1, page_size: 50 });
    expect(timeOffRequestsQuerySchema.parse({ page: "2", page_size: "25", sort: "starts" })).toMatchObject({ page: 2, page_size: 25 });
    expect(timeOffRequestsQuerySchema.safeParse({ page_size: "30" }).success).toBe(false);
    expect(timeOffRequestsQuerySchema.safeParse({ sort: "name" }).success).toBe(false);
  });

  it("asks the form's shifts with both hours or none", () => {
    expect(myTimeOffShiftsQuerySchema.safeParse({ start: "2028-09-19", end: "2028-09-20" }).success).toBe(true);
    expect(myTimeOffShiftsQuerySchema.safeParse({ start: "2028-09-19", end: "2028-09-19", from: "08:00", to: "24:00" }).success).toBe(true);
    expect(myTimeOffShiftsQuerySchema.safeParse({ start: "2028-09-19", end: "2028-09-19", from: "08:00" }).success).toBe(false);
  });
});
