import type {
  SchedulePendingOp,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { buildEffectiveShifts } from "./useEffectiveShifts";

function shift(
  overrides: Partial<ScheduleShift> & Pick<ScheduleShift, "id">,
): ScheduleShift {
  return {
    location_id: "22222222-2222-4222-8222-222222222222",
    employee_id: "33333333-3333-4333-8333-333333333333",
    shift_type_id: "44444444-4444-4444-8444-444444444444",
    job_id: "55555555-5555-4555-8555-555555555555",
    scheduled_date: "2026-05-01",
    start_time: "09:00",
    end_time: "17:00",
    crosses_midnight: false,
    unpaid_break_minutes: 0,
    hide_time_on_badge: false,
    label_ids: [],
    label_names: [],
    note: "",
    warning_codes: [],
    ...overrides,
  };
}

function op(
  overrides: Partial<SchedulePendingOp> &
    Pick<SchedulePendingOp, "id" | "op_type">,
): SchedulePendingOp {
  return {
    location_id: "22222222-2222-4222-8222-222222222222",
    week_start: "2026-04-27",
    target_shift_id: null,
    target_draft_id: null,
    payload: {},
    created_by: "66666666-6666-4666-8666-666666666666",
    created_at: "2026-05-01T01:00:00Z",
    updated_at: "2026-05-01T01:00:00Z",
    ...overrides,
  };
}

describe("buildEffectiveShifts", () => {
  it("adds create ops as synthetic pending shifts", () => {
    const result = buildEffectiveShifts(
      [],
      [
        op({
          id: "77777777-7777-4777-8777-777777777777",
          op_type: "create",
          payload: {
            employee_id: null,
            job_id: "55555555-5555-4555-8555-555555555555",
            label_ids: ["88888888-8888-4888-8888-888888888888"],
            label_names: ["Training"],
            scheduled_date: "2026-05-02",
            start_time: "10:00",
            end_time: "14:00",
          },
        }),
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "pending:77777777-7777-4777-8777-777777777777",
      pending_op_id: "77777777-7777-4777-8777-777777777777",
      label_names: ["Training"],
      scheduled_date: "2026-05-02",
      start_time: "10:00",
    });
  });

  it("layers update payloads over canonical shifts", () => {
    const result = buildEffectiveShifts(
      [
        shift({
          id: "11111111-1111-4111-8111-111111111111",
          employee_id: "33333333-3333-4333-8333-333333333333",
          note: "",
        }),
      ],
      [
        op({
          id: "77777777-7777-4777-8777-777777777777",
          op_type: "update",
          target_shift_id: "11111111-1111-4111-8111-111111111111",
          payload: {
            employee_id: "99999999-9999-4999-8999-999999999999",
            label_names: ["Expo"],
            note: "Prep",
          },
        }),
      ],
    );

    expect(result[0]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      employee_id: "99999999-9999-4999-8999-999999999999",
      label_names: ["Expo"],
      note: "Prep",
      pending_op_id: "77777777-7777-4777-8777-777777777777",
    });
  });

  it("hides shifts targeted by delete ops", () => {
    const result = buildEffectiveShifts(
      [
        shift({ id: "11111111-1111-4111-8111-111111111111" }),
        shift({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      ],
      [
        op({
          id: "77777777-7777-4777-8777-777777777777",
          op_type: "delete",
          target_shift_id: "11111111-1111-4111-8111-111111111111",
        }),
      ],
    );

    expect(result.map((item) => item.id)).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
  });

  it("keeps live-backed delete ops visible as staged removals", () => {
    const result = buildEffectiveShifts(
      [
        shift({
          id: "11111111-1111-4111-8111-111111111111",
          source_published_shift_id: "live-1",
        } as Partial<ScheduleShift> & Pick<ScheduleShift, "id">),
        shift({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      ],
      [
        op({
          id: "77777777-7777-4777-8777-777777777777",
          op_type: "delete",
          target_shift_id: "11111111-1111-4111-8111-111111111111",
        }),
      ],
    );

    expect(result.map((item) => item.id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
    expect(result[0]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      pending_op_id: "77777777-7777-4777-8777-777777777777",
      pending_op_type: "delete",
      pending_deleted: true,
    });
  });
});
