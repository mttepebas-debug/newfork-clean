import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ScheduleLineupEntry,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import { LineupPlacements } from "./LineupPlacements";
import { applyLineupPlacements, previewLineupPlacements } from "../lineup-data";
import { lineupCounts } from "./LineupBoard";
import { projectLineupEntries } from "./lineup-helpers";
vi.mock("../lineup-data", () => ({
  applyLineupPlacements: vi.fn(),
  previewLineupPlacements: vi.fn(),
}));
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function () {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function () {
    this.removeAttribute("open");
  },
});
const row: ScheduleLineupEntry = {
  id: "10000000-0000-4000-8000-000000000001",
  overlay_id: null,
  source_shift_id: "10000000-0000-4000-8000-000000000001",
  is_manual: false,
  orphaned: false,
  employee_id: "10000000-0000-4000-8000-000000000002",
  employee_name: "Alex Kim",
  job_id: "10000000-0000-4000-8000-000000000003",
  job_name: "Server",
  shift_type_id: "10000000-0000-4000-8000-000000000004",
  shift_type_name: "Dinner",
  start_time: "17:00",
  end_time: "23:00",
  section_id: null,
  section_name: "",
  station: "",
  call_off: false,
  hidden: false,
  display_order: 0,
  revision: null,
};
const location = {
  id: "10000000-0000-4000-8000-000000000005",
  name: "Main Dining",
  timezone: "America/Los_Angeles",
  lineup_id: null,
  revision: null,
  shared_at: null,
  share_version: 0,
  entries: [row],
  briefs: [],
  summary: { active_entries: 1, open_rows: 0, called_off: 0 },
};
const model: ScheduleLineupReadModel = {
  workspace_id: "10000000-0000-4000-8000-000000000020",
  date: "2030-01-07",
  source: "published",
  jobs: [],
  shift_types: [],
  employees: [],
  locations: [location],
  settings: { time_format: "24h" },
  sections: [
    {
      id: "10000000-0000-4000-8000-000000000006",
      workspace_id: "10000000-0000-4000-8000-000000000020",
      name: "Patio",
      color: "#999999",
      sort_order: 0,
      revision: 1,
    },
  ],
};
const ready = {
  fingerprint: "a".repeat(64),
  allowed: true,
  rows: [
    {
      entry_id: row.id,
      employee_name: row.employee_name,
      allowed: true,
      effects: ["Dining loses coverage from 18:00–22:00"],
      blockers: [],
    },
  ],
};
const refresh = vi.fn().mockResolvedValue(undefined);
function show() {
  render(
    <LineupPlacements
      workspaceId="workspace"
      date="2030-01-07"
      location={location}
      model={model}
      rows={[row]}
      initialIds={[row.id]}
      onClose={vi.fn()}
      refresh={refresh}
    />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewLineupPlacements).mockResolvedValue(ready);
  vi.mocked(applyLineupPlacements).mockResolvedValue({
    entries: [
      { entry_id: "10000000-0000-4000-8000-000000000007", entry_revision: 1 },
    ],
  });
});
afterEach(cleanup);
describe("section placement review", () => {
  it("requires a preview before saving and retains a validated undo", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Destination section"), {
      target: { value: model.sections[0]!.id },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review section coverage" }),
    );
    await screen.findByText("Dining loses coverage from 18:00–22:00");
    expect(applyLineupPlacements).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm section placements" }),
    );
    await screen.findByText("Section placements saved");
    expect(refresh).toHaveBeenCalledOnce();
    fireEvent.click(
      screen.getByRole("button", { name: "Undo section placements" }),
    );
    await waitFor(() => expect(applyLineupPlacements).toHaveBeenCalledTimes(2));
    expect(
      vi.mocked(previewLineupPlacements).mock.calls[1]?.[1].entries[0],
    ).toEqual(
      expect.objectContaining({
        id: "10000000-0000-4000-8000-000000000007",
        expected_revision: 1,
        entry: expect.objectContaining({
          section_id: null,
          placement_segments: [],
        }),
      }),
    );
  });
  it("separates conflicting rows and preserves selections for correction", async () => {
    vi.mocked(previewLineupPlacements).mockResolvedValue({
      ...ready,
      allowed: false,
      rows: [
        {
          ...ready.rows[0]!,
          allowed: false,
          blockers: ["Interval exceeds this shift"],
        },
      ],
    });
    show();
    fireEvent.click(
      screen.getByRole("button", { name: "Review section coverage" }),
    );
    await screen.findByText("Interval exceeds this shift");
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm section placements",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(applyLineupPlacements).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit choices" }));
    expect(screen.getByText("1 selected")).toBeTruthy();
  });
  it("sends a partial placement without changing canonical shift times", async () => {
    show();
    fireEvent.click(screen.getByLabelText("Only part of each shift"));
    fireEvent.change(screen.getByLabelText("Placement starts"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("Placement ends"), {
      target: { value: "22:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review section coverage" }),
    );
    await waitFor(() => expect(previewLineupPlacements).toHaveBeenCalled());
    expect(
      vi.mocked(previewLineupPlacements).mock.calls[0]?.[1].entries[0]?.entry,
    ).toEqual(
      expect.objectContaining({
        start_time: "17:00",
        end_time: "23:00",
        placement_range: { start_time: "18:00", end_time: "22:00" },
      }),
    );
  });
  it("renders multiple sections while counting the employee once", () => {
    const segments = [
      {
        id: "10000000-0000-4000-8000-000000000008",
        start_at: "2030-01-08T01:00:00Z",
        end_at: "2030-01-08T02:00:00Z",
        section_id: null,
        station: "",
      },
      {
        id: "10000000-0000-4000-8000-000000000009",
        start_at: "2030-01-08T02:00:00Z",
        end_at: "2030-01-08T07:00:00Z",
        section_id: model.sections[0]!.id,
        section_name: "Patio",
        station: "Tables 1–8",
      },
    ];
    const source = { ...row, placement_segments: segments };
    const projected = projectLineupEntries([source], location.timezone);
    expect(
      projected.map((item) => [
        item.start_time,
        item.end_time,
        item.section_name,
      ]),
    ).toEqual([
      ["17:00", "18:00", ""],
      ["18:00", "23:00", "Patio"],
    ]);
    expect(lineupCounts(projected).people).toBe(1);
    expect(lineupCounts([source]).unassigned).toBe(1);
    expect(projected.every((item) => item.placement_parent_id === row.id)).toBe(
      true,
    );
  });
});
