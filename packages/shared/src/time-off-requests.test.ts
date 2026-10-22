import { describe, expect, it } from "vitest";
import {
  myTimeOffSchema,
  myTimeOffShiftsQuerySchema,
  myTimeOffShiftsSchema,
  timeOffAnswerInputSchema,
  timeOffAskInputSchema,
  timeOffAskRefusal,
  timeOffCancellationAnswerInputSchema,
  timeOffCancellationAskInputSchema,
  timeOffDayCount,
  timeOffDeciderViewSchema,
  timeOffEntryImpactQuerySchema,
  timeOffEntryImpactSchema,
  timeOffEntryInputSchema,
  timeOffEntryPeopleSchema,
  timeOffEntryRefusal,
  timeOffImpactSchema,
  timeOffRequestsPageSchema,
  timeOffRequestsQuerySchema,
  timeOffTakeBackInputSchema,
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
    // A rolled-back `select public.my_time_off_service(...)::text` (D4 migration, test world fx, 2026-10-22):
    // approved time off with a cancellation waiting.
    const read = {
      today: "2026-10-22",
      requests: [
        {
          id: "fb60a125-162c-4e43-ab04-a9109fd00d8f",
          kind: "leave",
          note: "Family visit",
          status: "approved",
          all_day: true,
          ends_at: "2028-09-20T21:00:00+00:00",
          end_date: "2028-09-20",
          end_time: null,
          ended_at: null,
          revision: 2,
          starts_at: "2028-09-18T21:00:00+00:00",
          cancels_id: null,
          created_at: "2026-10-22T12:50:12.019564+00:00",
          decided_at: "2026-10-22T12:50:12.019564+00:00",
          ended_note: null,
          start_date: "2028-09-19",
          start_time: null,
          used_until: null,
          cancellation: {
            id: "5252467c-2df4-4c04-aba5-816fa5bf1757",
            note: "Plans changed",
            status: "pending",
            revision: 1,
            created_at: "2026-10-22T12:50:12.019564+00:00",
            decided_at: null,
            decision_note: null,
            decided_by_name: null
          },
          decision_note: null,
          added_by_name: null,
          ended_by_name: null,
          kind_of_leave: "vacation",
          time_timezone: "Europe/Istanbul",
          decided_by_name: "Mk Person"
        }
      ],
      time_zone: "Europe/Istanbul",
      location_names: [
        "Kadikoy",
        "Besiktas"
      ]
    };
    expect(myTimeOffSchema.parse(read)).toEqual(read);
  });

  it("reads a D2 answer without the D4 fields as having none", () => {
    const { cancellation: _c, cancels_id: _i, used_until: _u, ended_by_name: _n, ...before } = {
      id: "fb60a125-162c-4e43-ab04-a9109fd00d8f",
      kind: "leave",
      note: "Family visit",
      status: "approved",
      all_day: true,
      ends_at: "2028-09-20T21:00:00+00:00",
      end_date: "2028-09-20",
      end_time: null,
      ended_at: null,
      revision: 2,
      starts_at: "2028-09-18T21:00:00+00:00",
      cancels_id: null,
      created_at: "2026-10-22T12:50:12.019564+00:00",
      decided_at: "2026-10-22T12:50:12.019564+00:00",
      ended_note: null,
      start_date: "2028-09-19",
      start_time: null,
      used_until: null,
      cancellation: {
        id: "5252467c-2df4-4c04-aba5-816fa5bf1757",
        note: "Plans changed",
        status: "pending",
        revision: 1,
        created_at: "2026-10-22T12:50:12.019564+00:00",
        decided_at: null,
        decision_note: null,
        decided_by_name: null
      },
      decision_note: null,
      ended_by_name: null,
      kind_of_leave: "vacation",
      time_timezone: "Europe/Istanbul",
      decided_by_name: "Mk Person"
    };
    expect(myTimeOffSchema.parse({ ...{"today": "2026-10-22", "time_zone": "Europe/Istanbul", "location_names": ["Kadikoy", "Besiktas"]}, requests: [before] }).requests[0]).toMatchObject({
      cancellation: null,
      cancels_id: null,
      used_until: null,
      ended_by_name: null,
    });
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
  // D4 (the same service's answer since 20261022160000).
  cancels_id: null,
  used_until: null,
  cancellation: null,
  added_by_name: null,
  ended_by_name: null,
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

// Time off rebuild D4: a cancellation as time_off_requests_service lists it (rolled back, world fx), and the
// shapes the employee and the answerer send.
describe("D4 cancellation and take back", () => {
  it("reads a cancellation waiting in the answerer's list", () => {
    const page = {
      page: 1,
      total: 1,
      waiting: 1,
      requests: [
        {
          id: "5252467c-2df4-4c04-aba5-816fa5bf1757",
          kind: "cancel",
          note: "Plans changed",
          status: "pending",
          all_day: true,
          ends_at: "2028-09-20T21:00:00+00:00",
          end_date: "2028-09-20",
          end_time: null,
          ended_at: null,
          revision: 1,
          starts_at: "2028-09-18T21:00:00+00:00",
          cancels_id: "fb60a125-162c-4e43-ab04-a9109fd00d8f",
          created_at: "2026-10-22T12:50:12.019564+00:00",
          decided_at: null,
          ended_note: null,
          start_date: "2028-09-19",
          start_time: null,
          used_until: null,
          employee_id: "ced859e3-8f2b-48a7-858f-88f5fba28246",
          cancellation: null,
          decision_note: null,
          employee_name: "Ali Person",
          added_by_name: null,
          ended_by_name: null,
          kind_of_leave: "vacation",
          shifts_opened: 0,
          time_timezone: "Europe/Istanbul",
          location_names: [
            "Kadikoy",
            "Besiktas"
          ],
          decided_by_name: null
        }
      ],
      page_size: 50
    };
    expect(timeOffRequestsPageSchema.parse(page)).toEqual(page);
  });

  it("asks to cancel with an optional note, on a revision and a key", () => {
    const ask = { note: null, expected_revision: 2, client_key: "98020000-0000-4000-8000-000000000001" };
    expect(timeOffCancellationAskInputSchema.safeParse(ask).success).toBe(true);
    expect(timeOffCancellationAskInputSchema.safeParse({ ...ask, note: "Plans changed" }).success).toBe(true);
    expect(timeOffCancellationAskInputSchema.safeParse({ ...ask, note: "x".repeat(1001) }).success).toBe(false);
    expect(timeOffCancellationAskInputSchema.safeParse({ ...ask, client_key: "nope" }).success).toBe(false);
    expect(timeOffCancellationAskInputSchema.safeParse({ ...ask, extra: 1 }).success).toBe(false);
  });

  it("answers a cancellation without a print", () => {
    expect(timeOffCancellationAnswerInputSchema.safeParse({ verdict: "approve", note: null, expected_revision: 1 }).success).toBe(true);
    expect(timeOffCancellationAnswerInputSchema.safeParse({ verdict: "decline", note: "Busy week", expected_revision: 1 }).success).toBe(true);
    expect(timeOffCancellationAnswerInputSchema.safeParse({ verdict: "maybe", note: null, expected_revision: 1 }).success).toBe(false);
  });

  it("takes time off back only with a note", () => {
    expect(timeOffTakeBackInputSchema.parse({ note: "  Short-staffed  ", expected_revision: 2 }).note).toBe("Short-staffed");
    expect(timeOffTakeBackInputSchema.safeParse({ note: "   ", expected_revision: 2 }).success).toBe(false);
    expect(timeOffTakeBackInputSchema.safeParse({ note: "x".repeat(1001), expected_revision: 2 }).success).toBe(false);
    expect(timeOffTakeBackInputSchema.safeParse({ expected_revision: 2 }).success).toBe(false);
  });
});

describe("D5 time off entered for somebody", () => {
  it("reads whom one may enter time off for", () => {
    const people = {
      people: [
        {
          name: "Ali Person",
          today: "2026-10-22",
          time_zone: "Europe/Istanbul",
          employee_id: "72d1cc0a-0a17-45a3-9f4e-22a02921391e",
          location_names: ["Kadikoy", "Besiktas"],
        },
      ],
    };
    expect(timeOffEntryPeopleSchema.parse(people)).toEqual(people);
  });

  it("reads what entering would open, with the zone and an overlap", () => {
    const impact = {
      overlap: null,
      locations: [
        {
          shifts: [
            {
              id: "341ad6e3-99dc-4d6a-87c4-d77d5a74c4f9",
              ends_at: "2028-09-19T12:00:00+00:00",
              end_time: "15:00",
              job_name: "Cook",
              timezone: "Europe/Istanbul",
              starts_at: "2028-09-19T06:00:00+00:00",
              start_time: "09:00",
              scheduled_date: "2028-09-19",
            },
          ],
          location_id: "2683661c-267e-4786-b272-3c25577e897f",
          location_name: "Kadikoy",
        },
      ],
      time_zone: "Europe/Istanbul",
      fingerprint: "99b79f028d99c773d76fa15d790a19fc",
      shift_count: 2,
      hidden_shift_count: 1,
    };
    expect(timeOffEntryImpactSchema.parse(impact)).toEqual(impact);
    expect(timeOffEntryImpactSchema.parse({ ...impact, overlap: "pending" }).overlap).toBe("pending");
    expect(timeOffEntryImpactSchema.safeParse({ ...impact, overlap: "maybe" }).success).toBe(false);
  });

  it("reads time off somebody else added", () => {
    const entered = {
      id: "97aa0ed9-ce45-4f4f-8236-c0a9410fb92a",
      kind: "leave",
      note: "Doctor said rest",
      status: "approved",
      all_day: true,
      ends_at: "2028-09-20T21:00:00+00:00",
      end_date: "2028-09-20",
      end_time: null,
      ended_at: null,
      revision: 1,
      starts_at: "2028-09-18T21:00:00+00:00",
      cancels_id: null,
      created_at: "2026-10-22T13:14:50.430957+00:00",
      decided_at: "2026-10-22T13:14:50.430957+00:00",
      ended_note: null,
      start_date: "2028-09-19",
      start_time: null,
      used_until: null,
      employee_id: "72d1cc0a-0a17-45a3-9f4e-22a02921391e",
      cancellation: null,
      added_by_name: "Mb Person",
      decision_note: null,
      employee_name: "Ali Person",
      ended_by_name: null,
      kind_of_leave: "vacation",
      shifts_opened: 2,
      time_timezone: "Europe/Istanbul",
      location_names: ["Kadikoy", "Besiktas"],
      decided_by_name: "Mb Person",
    };
    expect(timeOffDeciderViewSchema.parse(entered)).toEqual(entered);
    const { added_by_name: _added, ...older } = entered;
    expect(timeOffDeciderViewSchema.parse(older).added_by_name).toBeNull();
  });

  it("enters time off for one person, on the print read", () => {
    const entry = {
      employee_id: "72d1cc0a-0a17-45a3-9f4e-22a02921391e",
      kind_of_leave: "sick",
      start_date: "2026-10-22",
      end_date: "2026-10-22",
      all_day: true,
      start_time: null,
      end_time: null,
      note: null,
      expected_timezone: "America/Los_Angeles",
      expected_impact: "d41d8cd98f00b204e9800998ecf8427e",
      client_key: "98020000-0000-4000-8000-000000000002",
    };
    expect(timeOffEntryInputSchema.safeParse(entry).success).toBe(true);
    expect(timeOffEntryInputSchema.safeParse({ ...entry, all_day: false, start_time: "09:00", end_time: "24:00" }).success).toBe(true);
    expect(timeOffEntryInputSchema.safeParse({ ...entry, all_day: false }).success).toBe(false);
    expect(timeOffEntryInputSchema.safeParse({ ...entry, expected_impact: "" }).success).toBe(false);
    expect(timeOffEntryInputSchema.safeParse({ ...entry, employee_id: "nope" }).success).toBe(false);
    expect(timeOffEntryInputSchema.safeParse({ ...entry, extra: 1 }).success).toBe(false);
  });

  it("asks what entering would open for a person, the days and both hours or none", () => {
    const person = "72d1cc0a-0a17-45a3-9f4e-22a02921391e";
    expect(timeOffEntryImpactQuerySchema.safeParse({ employee_id: person, start: "2026-10-22", end: "2026-10-23" }).success).toBe(true);
    expect(
      timeOffEntryImpactQuerySchema.safeParse({ employee_id: person, start: "2026-10-22", end: "2026-10-22", from: "09:00", to: "24:00" }).success,
    ).toBe(true);
    expect(timeOffEntryImpactQuerySchema.safeParse({ employee_id: person, start: "2026-10-22", end: "2026-10-22", from: "09:00" }).success).toBe(false);
    expect(timeOffEntryImpactQuerySchema.safeParse({ start: "2026-10-22", end: "2026-10-22" }).success).toBe(false);
  });

  it("refuses a day that passed, but not today; and what asking refuses", () => {
    const today = "2026-10-22";
    expect(timeOffEntryRefusal(allDay("2026-10-22", "2026-10-22"), today)).toBeNull();
    expect(timeOffEntryRefusal(hours("2026-10-22", "06:00", "2026-10-22", "08:00"), today)).toBeNull();
    expect(timeOffEntryRefusal(allDay("2026-10-21", "2026-10-23"), today)).toBe("time_off.past");
    expect(timeOffEntryRefusal(allDay("2026-11-01", "2026-12-02"), today)).toBe("time_off.too_long");
    expect(timeOffEntryRefusal(allDay("2026-11-02", "2026-11-01"), today)).toBe("time_off.order");
    expect(timeOffEntryRefusal(hours("2026-11-01", "15:00", "2026-11-01", "10:00"), today)).toBe("time_off.order");
  });
});
