import { describe, expect, it } from "vitest";
import type { ScheduleLineupReadModel } from "@newfork/shared/schedule";
import { buildLineupShareText, formatLineupShareDate } from "./lineup-share";

const model = {
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  date: "2026-05-15",
  source: "published",
  settings: { time_format: "12h" },
  locations: [
    {
      id: "11000000-0000-4000-8000-000000000001",
      name: "Meyhouse",
      timezone: "America/Los_Angeles",
      lineup_id: "97000000-0000-4000-8000-000000000001",
      revision: 1,
      shared_at: null,
      share_version: 0,
      entries: [
        {
          id: "98000000-0000-4000-8000-000000000001",
          overlay_id: null,
          source_shift_id: "98000000-0000-4000-8000-000000000001",
          is_manual: false,
          orphaned: false,
          employee_id: "15000000-0000-4000-8000-000000000001",
          employee_name: "Ada Server",
          job_id: "33000000-0000-4000-8000-000000000001",
          job_name: "Server",
          shift_type_id: "55000000-0000-4000-8000-000000000001",
          shift_type_name: "Dinner",
          start_time: "11:00",
          end_time: "17:00",
          section_id: "96000000-0000-4000-8000-000000000001",
          section_name: "Patio",
          station: "Bar 2",
          call_off: false,
          hidden: false,
          display_order: 1,
          revision: null,
        },
        {
          id: "98000000-0000-4000-8000-000000000002",
          overlay_id: null,
          source_shift_id: "98000000-0000-4000-8000-000000000002",
          is_manual: false,
          orphaned: false,
          employee_id: "15000000-0000-4000-8000-000000000002",
          employee_name: "Call Off",
          job_id: "33000000-0000-4000-8000-000000000001",
          job_name: "Server",
          shift_type_id: "55000000-0000-4000-8000-000000000001",
          shift_type_name: "Dinner",
          start_time: "10:00",
          end_time: "16:00",
          section_id: null,
          section_name: "",
          station: "",
          call_off: true,
          hidden: false,
          display_order: 0,
          revision: null,
        },
      ],
      briefs: [
        {
          shift_type_id: "55000000-0000-4000-8000-000000000001",
          out_of_stock: "86 salmon",
          specials: "Lamb ragu",
          pre_shift_notes: "Push patio covers.",
          revision: 1,
        },
      ],
      summary: { active_entries: 2, open_rows: 0, called_off: 1 },
    },
  ],
  sections: [],
  jobs: [
    {
      id: "33000000-0000-4000-8000-000000000001",
      name: "Server",
      color: "#4478A8",
      sort_order: 0,
      department_id: null,
    },
  ],
  shift_types: [
    {
      id: "55000000-0000-4000-8000-000000000001",
      name: "Dinner",
      color: "#4E8B72",
      sort_order: 0,
      default_start_time: "17:00",
      default_end_time: "22:00",
    },
  ],
  employees: [],
} satisfies ScheduleLineupReadModel;

describe("lineup share text", () => {
  it("exports the saved assignment note alongside its assignment", () => {
    const withNote: ScheduleLineupReadModel = structuredClone(model);
    withNote.locations[0]!.entries[0]!.note =
      "Cover the private dining entrance";
    expect(buildLineupShareText(withNote)).toContain(
      "\n  Cover the private dining entrance",
    );
  });
  it("keeps open coverage and its instruction in the shared export", () => {
    const open: ScheduleLineupReadModel = structuredClone(model);
    Object.assign(open.locations[0]!.entries[0]!, {
      employee_id: null,
      employee_name: "",
      note: "Cover the private dining entrance",
    });
    const text = buildLineupShareText(open);
    expect(text).toContain("Open position - Patio - Bar 2");
    expect(text).toContain("Cover the private dining entrance");
  });
  it("includes the actual shared timestamp in the location timezone", () => {
    const shared: ScheduleLineupReadModel = structuredClone(model);
    shared.locations[0]!.share_version = 4;
    shared.locations[0]!.shared_at = "2026-05-15T17:30:00Z";
    const text = buildLineupShareText(shared, true);
    expect(text).toContain("SHARED · v4");
    expect(text).toContain("Shared May 15, 2026");
    expect(text).toContain("10:30");
    expect(text).toContain("PDT");
  });

  it("formats Line-up dates as MM/DD/YYYY weekday", () => {
    expect(formatLineupShareDate("2026-05-31")).toBe("05/31/2026 Sunday");
  });

  it("builds a share-ready Line-up text and excludes call-offs", () => {
    const text = buildLineupShareText(model);

    expect(text).toContain("Meyhouse - 05/15/2026 Friday");
    expect(text).toContain("Dinner");
    expect(text).toContain("86: 86 salmon");
    expect(text).toContain("Specials: Lamb ragu");
    expect(text).toContain("Pre-shift: Push patio covers.");
    expect(text).toContain("Server");
    expect(text).toContain("11:00 AM–5:00 PM Ada Server - Patio - Bar 2");
    expect(text).not.toContain("Call Off");
  });

  it("labels immutable exports with their shared version", () => {
    expect(buildLineupShareText(model, true)).toContain(
      `SHARED · v${model.locations[0]!.share_version}`,
    );
    expect(buildLineupShareText(model, true)).not.toContain("DRAFT");
  });

  it("uses the schedule 24-hour setting in Line-up share text", () => {
    const text = buildLineupShareText({
      ...model,
      settings: { time_format: "24h" },
    });

    expect(text).toContain("11:00–17:00 Ada Server - Patio - Bar 2");
    expect(text).not.toContain("11:00 AM Ada Server");
  });
});
