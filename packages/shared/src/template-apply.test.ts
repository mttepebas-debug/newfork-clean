import { describe, expect, it } from "vitest";
import { scheduleTemplateApplyResultSchema } from "./index";

// Verbatim from a real run of apply_schedule_template_service() (migration
// 20260927140000, the template_apply_leaves_archived_labels.test.sql world,
// rolled back): "Standard week" puts two shifts tagged Standby on the draft
// after Standby was archived in Settings > Shift labels.
const leftOff = {"mode": "merge", "status": "applied", "session": {"id": "5fcdb17c-6782-44f9-b1de-5ff57d8e9d86", "dirty": true, "shifts": [{"id": "493b3bd6-7629-4ce7-a360-0308f5caa3c4", "note": "", "job_id": "0fa432e2-9746-4a72-83bd-bbcf00caac59", "locked": false, "end_time": "15:00", "revision": 1, "label_ids": ["d123f2f7-ae36-4600-83e3-3726774136a1"], "start_time": "09:00", "time_basis": "explicit", "employee_id": null, "label_names": ["Opener"], "location_id": "bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "shift_type_id": null, "time_snapshot": null, "time_timezone": "Europe/Istanbul", "warning_codes": [], "scheduled_date": "2028-09-05", "pending_op_type": null, "crosses_midnight": false, "hide_time_on_badge": false, "unpaid_break_minutes": 0, "source_published_shift_id": null}, {"id": "3bc439a0-45be-4cec-959a-ee3efc11721f", "note": "", "job_id": "0fa432e2-9746-4a72-83bd-bbcf00caac59", "locked": false, "end_time": "15:00", "revision": 1, "label_ids": [], "start_time": "09:00", "time_basis": "explicit", "employee_id": null, "label_names": [], "location_id": "bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "shift_type_id": null, "time_snapshot": null, "time_timezone": "Europe/Istanbul", "warning_codes": [], "scheduled_date": "2028-09-06", "pending_op_type": null, "crosses_midnight": false, "hide_time_on_badge": false, "unpaid_break_minutes": 0, "source_published_shift_id": null}], "revision": 2, "expires_at": "2026-09-28T01:31:50.366372+00:00", "week_start": "2028-09-04", "holder_name": "Olcay Owner", "source_kind": "blank", "location_ids": ["bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "cfc71385-03e2-46a0-9d26-824e077da40e"], "workspace_id": "08b697b2-76e2-405b-a102-0b5d12089288", "holder_user_id": "d72cbff6-f055-48b1-920b-64b88a1e1c2f", "last_heartbeat": "2026-09-28T01:27:50.366372+00:00", "source_draft_id": null, "source_revision": 0}, "skipped": [{"kind": "archived_label", "name": "Standby", "shift_count": 2}], "applied_shift_count": 2, "converted_open_count": 0};
// The same template applied again with every label active.
const nothingLeftOff = {"mode": "merge", "status": "applied", "session": {"id": "b483a054-302e-474b-80c0-9b34c522e6af", "dirty": true, "shifts": [{"id": "4d4e6880-b947-47fc-b983-53e616e89259", "note": "", "job_id": "0fa432e2-9746-4a72-83bd-bbcf00caac59", "locked": false, "end_time": "15:00", "revision": 1, "label_ids": ["5af02f7d-008e-485c-96f7-40b2bac389d3", "d123f2f7-ae36-4600-83e3-3726774136a1"], "start_time": "09:00", "time_basis": "explicit", "employee_id": null, "label_names": ["Standby", "Opener"], "location_id": "bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "shift_type_id": null, "time_snapshot": null, "time_timezone": "Europe/Istanbul", "warning_codes": [], "scheduled_date": "2028-09-12", "pending_op_type": null, "crosses_midnight": false, "hide_time_on_badge": false, "unpaid_break_minutes": 0, "source_published_shift_id": null}, {"id": "289db21f-8781-461e-8775-f10bc6ed839a", "note": "", "job_id": "0fa432e2-9746-4a72-83bd-bbcf00caac59", "locked": false, "end_time": "15:00", "revision": 1, "label_ids": ["5af02f7d-008e-485c-96f7-40b2bac389d3"], "start_time": "09:00", "time_basis": "explicit", "employee_id": null, "label_names": ["Standby"], "location_id": "bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "shift_type_id": null, "time_snapshot": null, "time_timezone": "Europe/Istanbul", "warning_codes": [], "scheduled_date": "2028-09-13", "pending_op_type": null, "crosses_midnight": false, "hide_time_on_badge": false, "unpaid_break_minutes": 0, "source_published_shift_id": null}], "revision": 2, "expires_at": "2026-09-28T01:31:50.366372+00:00", "week_start": "2028-09-11", "holder_name": "Olcay Owner", "source_kind": "blank", "location_ids": ["bcf27afe-a1c1-4c2b-9741-5955be7a69ae", "cfc71385-03e2-46a0-9d26-824e077da40e"], "workspace_id": "08b697b2-76e2-405b-a102-0b5d12089288", "holder_user_id": "d72cbff6-f055-48b1-920b-64b88a1e1c2f", "last_heartbeat": "2026-09-28T01:27:50.366372+00:00", "source_draft_id": null, "source_revision": 0}, "skipped": [], "applied_shift_count": 2, "converted_open_count": 0};

describe("template apply answer: labels left off (BL-197)", () => {
  it("keeps the labels the template could not apply", () => {
    expect(scheduleTemplateApplyResultSchema.parse(leftOff).skipped).toEqual([
      { kind: "archived_label", name: "Standby", shift_count: 2 },
    ]);
  });

  it("keeps an empty list when nothing was left off", () => {
    expect(scheduleTemplateApplyResultSchema.parse(nothingLeftOff).skipped).toEqual([]);
  });

  it("refuses an answer without the list", () => {
    const { skipped: _skipped, ...withoutList } = leftOff;
    expect(scheduleTemplateApplyResultSchema.safeParse(withoutList).success).toBe(false);
  });
});
