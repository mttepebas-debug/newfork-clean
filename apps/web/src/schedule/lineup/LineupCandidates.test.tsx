import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lineupCandidateSchema, type LineupCandidate } from "@newfork/shared";
import { LineupCandidateList } from "./LineupCandidates";

afterEach(cleanup);
const base: LineupCandidate = {
  employee_id: "10000000-0000-4000-8000-000000000001",
  display_name: "Ada Employee",
  status: "eligible",
  reasons: ["No assignment blockers"],
  available_start: null,
  available_end: null,
};
function show(
  candidates: LineupCandidate[],
  selectedEmployeeId: string | null = null,
) {
  const onSelect = vi.fn();
  render(
    <LineupCandidateList
      candidates={candidates}
      selectedEmployeeId={selectedEmployeeId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

describe("Line Up candidate display groups", () => {
  it("uses all seven server groups in the approved display order, independently of status", () => {
    const ids = [
      "missing_job",
      "day_off",
      "working_here",
      "eligible",
      "missing_location",
      "working_elsewhere",
      "not_suitable",
    ] as const;
    show(
      ids.map((display_group, index) => ({
        ...base,
        employee_id: `${base.employee_id.slice(0, -1)}${index}`,
        display_group,
      })),
    );
    expect(
      screen
        .getAllByRole("region")
        .map((region) => region.getAttribute("aria-label")),
    ).toEqual([
      "Eligible",
      "Not suitable",
      "Working somewhere else",
      "Working here",
      "Day off",
      "Not assigned to this location",
      "Not assigned to this job",
    ]);
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("keeps an unavailable Day off candidate on one selectable amber row", () => {
    const candidate: LineupCandidate = {
      ...base,
      display_group: "day_off",
      has_availability_conflict: true,
    };
    const onSelect = show([candidate], base.employee_id);
    const row = within(
      screen.getByRole("region", { name: "Day off" }),
    ).getByRole("button");
    expect(row.hasAttribute("disabled")).toBe(false);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(
      within(row)
        .getByText("Availability conflict")
        .classList.contains("warning"),
    ).toBe(true);
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(candidate);
    expect(screen.getAllByText(base.display_name)).toHaveLength(1);
  });

  it("keeps actual blockers disabled even under a Day off display group", () => {
    const onSelect = show([
      {
        ...base,
        status: "ineligible",
        display_group: "day_off",
        reasons: ["Approved time off"],
      },
    ]);
    const row = screen.getByRole("button");
    expect(row.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Approved time off")).toBeTruthy();
    expect(screen.queryByText("Availability conflict")).toBeNull();
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("retains secondary work and employment labels without duplicating a candidate", () => {
    show([
      {
        ...base,
        display_group: "missing_location",
        status: "ineligible",
        has_availability_conflict: true,
        context_labels: [
          "Not assigned to this job",
          "Working somewhere else",
          "Working here as Server",
        ],
      },
    ]);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Working here as Server")).toBeTruthy();
    expect(screen.getByText("Availability conflict")).toBeTruthy();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  });

  it("preserves the existing reviewed-move action and does not unlock an unproven move", () => {
    const move: LineupCandidate = {
      ...base,
      status: "movable",
      display_group: "working_elsewhere",
      move_source: {
        entry_id: base.employee_id,
        location_id: base.employee_id,
        location_name: "East",
        date: "2035-01-15",
        timezone: "America/New_York",
        job_name: "Server",
        start_time: "18:00",
        end_time: "22:00",
      },
    };
    const onSelect = show([
      move,
      {
        ...move,
        employee_id: "10000000-0000-4000-8000-000000000002",
        display_name: "No move proof",
        move_source: undefined,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Ada Employee/ }));
    expect(onSelect).toHaveBeenCalledWith(move);
    expect(
      screen
        .getByRole("button", { name: /No move proof/ })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("handles legacy responses without fabricating a Day off classification", () => {
    show([
      base,
      {
        ...base,
        employee_id: "10000000-0000-4000-8000-000000000002",
        display_name: "Needs review",
        status: "verification_required",
      },
    ]);
    expect(screen.getByRole("region", { name: "Eligible" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Not suitable" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Day off" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /Needs review/ })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("preserves the server projection through response parsing and rejects unknown groups", () => {
    const candidate = {
      ...base,
      display_group: "working_here",
      context_labels: ["Working here as Server"],
      has_availability_conflict: false,
    };
    expect(lineupCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      lineupCandidateSchema.safeParse({ ...base, display_group: "approved" })
        .success,
    ).toBe(false);
    expect(lineupCandidateSchema.parse(base)).toEqual(base);
  });
});
