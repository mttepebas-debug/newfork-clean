import type { ScheduleReadModel } from "@newfork/shared/schedule";

export const scheduleMockReadModel = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-08-17",
  week_start_day: "monday",
  locations: [],
  departments: [],
  jobs: [],
  shift_types: [],
  shift_labels: [],
  employees: [],
  closures: [],
  important_dates: [],
  shifts: [],
  settings: {
    time_format: "12h",
  },
} satisfies ScheduleReadModel;
