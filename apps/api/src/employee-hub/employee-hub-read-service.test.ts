import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployeeHubService } from "./employee-hub-service";

const { rpc, from, maybeSingle, locationRead } = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), maybeSingle: vi.fn(), locationRead: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc, from }) }));
const workspace = "ad418000-0000-4000-8000-000000000003";
const employee = "ad418000-0000-4000-8000-000000000002";
const actor = "ad418000-0000-4000-8000-000000000001";
const service = createEmployeeHubService({ url: "http://localhost:55321", serviceRoleKey: "test-only" });
const input = { actorUserId: actor, workspaceId: workspace, from: "2035-01-01", to: "2035-01-07" };
// The old request list the database still sends until the old tables go (time off rebuild D8); the read drops it.
const leave = {
  id: actor, kind: "time_off", status: "pending", title: "Time off",
  detail: "Appointment", revision: 1, created_at: "2035-01-01T00:00:00Z",
  can_cancel: true, periods: [], decision_events: [], request_type: "time_off",
};
const model = {
  workspace_id: workspace, employee: { id: employee, display_name: "QA Employee" },
  locations: [{ id: workspace, name: "Dining" }], shifts: [], open_shifts: [], team_shifts: [],
  requests: [leave], team: [],
};
// From get_employee_hub_service for Alex on the "ws" world of supabase/tests/employee_hub_week_strip.test.sql,
// migration 20261024113847_employee_hub_week_strip applied and rolled back (Home's week strip).
const weekStrip = {
  shifts: [
    { id: "3032309b-e744-49d9-bd02-8234a3cc9b03", note: "", end_time: "13:00", job_name: "Cook", start_time: "09:00", time_basis: "explicit", employee_id: "e56cad12-fc6f-4845-ad98-35ecd6b52bf8", location_id: "8d06a05b-0583-45f7-b63f-c2f97dd37ebd", location_name: "Kadikoy", time_snapshot: null, time_timezone: "Europe/Istanbul", scheduled_date: "2028-09-25", shift_type_name: null, shift_type_color: null, shift_type_end_time: null, shift_type_start_time: null },
    { id: "5e7987d6-1968-4533-bf5a-ac070975f139", note: "", end_time: "22:00", job_name: "Cook", start_time: "18:00", time_basis: "explicit", employee_id: "e56cad12-fc6f-4845-ad98-35ecd6b52bf8", location_id: "8d06a05b-0583-45f7-b63f-c2f97dd37ebd", location_name: "Kadikoy", time_snapshot: null, time_timezone: "Europe/Istanbul", scheduled_date: "2028-09-26", shift_type_name: "Dinner", shift_type_color: "#176954", shift_type_end_time: "23:00", shift_type_start_time: "17:00" },
  ],
  posted_days: ["2028-09-25", "2028-09-26", "2028-09-27", "2028-09-28", "2028-09-29", "2028-09-30", "2028-10-01"],
};
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: model, error: null });
  maybeSingle.mockResolvedValue({ data: { time_format: "24h" }, error: null });
  locationRead.mockResolvedValue({ data: [{ id: workspace, timezone: "America/Los_Angeles" }], error: null });
  from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle, in: locationRead }) }) });
});
describe("employee hub weekly read boundary", () => {
  it("keeps the days off and local clock settings", async () => {
    const result = await service.get(input);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_employee_hub_service", {
      actor_user_id: actor, target_workspace_id: workspace,
      target_from: input.from, target_to: input.to,
    });
    expect(result).not.toHaveProperty("requests");
    expect(result.leave_days).toEqual([]);
    expect(result.settings.time_format).toBe("24h");
    expect(result.locations[0]?.timezone).toBe("America/Los_Angeles");
  });
  it("passes the time-off zone the database adds and leaves out the old decision window (D7)", async () => {
    rpc.mockResolvedValue({ data: { ...model, time_off_timezone: "America/New_York", settings: { time_off_lead_hours: 48 } }, error: null });
    const added = await service.get(input);
    expect(added.time_off_timezone).toBe("America/New_York");
    expect(added.settings).toEqual({ time_format: "24h" });
    rpc.mockResolvedValue({ data: model, error: null });
    const today = await service.get(input);
    expect(today).not.toHaveProperty("time_off_timezone");
    expect(today.settings).toEqual({ time_format: "24h" });
  });
  it("passes Home's week strip: the posted days and each own shift's type colour and times", async () => {
    rpc.mockResolvedValue({ data: { ...model, ...weekStrip }, error: null });
    const result = await service.get(input);
    expect(result.posted_days).toEqual(weekStrip.posted_days);
    expect(result.shifts.map(({ shift_type_color, shift_type_start_time, shift_type_end_time }) =>
      ({ shift_type_color, shift_type_start_time, shift_type_end_time }))).toEqual(
      weekStrip.shifts.map(({ shift_type_color, shift_type_start_time, shift_type_end_time }) =>
        ({ shift_type_color, shift_type_start_time, shift_type_end_time })),
    );
    rpc.mockResolvedValue({ data: model, error: null });
    expect(await service.get(input)).not.toHaveProperty("posted_days");
  });
  it("does not hide errors in the canonical employee read", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Employee access denied", code: "42501" } });
    await expect(service.get(input)).rejects.toMatchObject({ statusCode: 403, message: "Employee access denied" });
  });
  it("rejects malformed data", async () => {
    rpc.mockResolvedValue({ data: { ...model, leave_days: ["Jan 15"] }, error: null });
    await expect(service.get(input)).rejects.toThrow();
  });
});

describe("employee team board read (BL-218)", () => {
  // From get_employee_schedule_board_service for Emre on the "r" world of
  // supabase/tests/employee_references_ask_the_core.test.sql, BL-218
  // migrations 070000-090000 applied and rolled back; shifts and catalog
  // lists left empty.
  const board = {
    jobs: [
      { id: "29173f20-8534-4650-a445-362954990e7e", name: "Owner", color: "#4478A8", system_key: "owner", department_id: "4a942fbd-77f0-47ca-8fc9-98863b5730ec" },
      { id: "a6e9c461-82fb-48a3-a7b6-cf92fc1911d5", name: "Cook", color: "#D39A36", system_key: null, department_id: "f3a14873-2fa4-455d-97e3-8ec992dd9e50" },
    ],
    settings: { time_format: "12h" },
    employees: [
      { id: "f7667db2-d98f-4ca1-8c6b-5a29fc225bc7", job_ids: ["29173f20-8534-4650-a445-362954990e7e"], display_name: "Olcay Owner", location_ids: ["a237a14a-76c9-441f-bc45-5eae2b13f5e0"], employee_code: "E-0001", primary_job_id: null },
      { id: "c121ff27-f58c-4254-93ce-255a68d77b02", job_ids: ["a6e9c461-82fb-48a3-a7b6-cf92fc1911d5"], display_name: "Emre Person", location_ids: ["a237a14a-76c9-441f-bc45-5eae2b13f5e0"], employee_code: "E-0004", primary_job_id: "a6e9c461-82fb-48a3-a7b6-cf92fc1911d5" },
    ],
    locations: [{ id: "a237a14a-76c9-441f-bc45-5eae2b13f5e0", name: "Kadikoy", timezone: "Europe/Istanbul", sort_order: 0, published_at: null, publication_status: "unpublished" }],
    week_start: "2026-09-28",
    departments: [
      { id: "4a942fbd-77f0-47ca-8fc9-98863b5730ec", name: "Management", color: "#3C7A68", system_key: "management" },
      { id: "f3a14873-2fa4-455d-97e3-8ec992dd9e50", name: "Kitchen", color: "#3C7A68", system_key: null },
    ],
    workspace_id: "085697c9-c2c4-47bd-8c3d-0a6673e4c3e1",
    week_start_day: "monday",
    referenced_jobs: [],
    referenced_shift_types: [],
    shift_types: [],
    shifts: [],
    closures: [],
  };

  it("loads the board with Management's and Owner's keys and the stored primary job", async () => {
    rpc.mockResolvedValue({ data: board, error: null });
    const result = await service.getScheduleBoard({ actorUserId: actor, workspaceId: workspace, targetDate: "2026-09-29" });
    expect(result.departments).toEqual(board.departments);
    expect(result.jobs).toEqual(board.jobs);
    expect(result.employees.map((person) => person.primary_job_id)).toEqual([null, board.jobs[1]!.id]);
  });
});
