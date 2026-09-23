import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleEditLockedDialog } from "./ScheduleEditLockedDialog";

describe("ScheduleEditLockedDialog", () => {
  it("renders lock ownership context and preserves actions", () => {
    const onViewSchedule = vi.fn();
    const onTryAgain = vi.fn();

    render(
      <ScheduleEditLockedDialog
        open
        holderName="Morgan Lee"
        scope="published"
        weekLabel="Aug 17 - Aug 23, 2026"
        lastHeartbeat={new Date().toISOString()}
        onViewSchedule={onViewSchedule}
        onTryAgain={onTryAgain}
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Schedule is being edited",
    });
    expect(dialog.className).toContain("schedule-edit-locked-dialog");
    expect(
      screen.getByText("Another manager currently holds the edit lock."),
    ).toBeTruthy();
    expect(
      screen.getByText(/Morgan Lee is editing the published schedule/),
    ).toBeTruthy();
    expect(screen.getByText("Last activity less than a minute ago.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onViewSchedule).toHaveBeenCalledTimes(1);
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Take over" })).toBeNull();
  });

  it("renders draft ownership context", () => {
    render(
      <ScheduleEditLockedDialog
        open
        holderName="Morgan Lee"
        scope="draft"
        draftName="Weekend edits"
        weekLabel="Aug 17 - Aug 23, 2026"
        lastHeartbeat={null}
        onViewSchedule={vi.fn()}
        onTryAgain={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Morgan Lee is editing "Weekend edits"/),
    ).toBeTruthy();
    expect(screen.queryByText(/Last activity/)).toBeNull();
  });

  it("names who holds each location and opens the free ones", () => {
    const onEditFreeLocations = vi.fn();
    render(
      <ScheduleEditLockedDialog
        open
        holderName="Ayse Person"
        scope="published"
        weekLabel="Aug 17 - Aug 23, 2026"
        lastHeartbeat={null}
        locks={[
          { locationName: "Kadikoy", holderName: "Ayse Person" },
          { locationName: "Moda", holderName: "Can Person" },
        ]}
        freeLocationNames={["Besiktas"]}
        onViewSchedule={vi.fn()}
        onTryAgain={vi.fn()}
        onEditFreeLocations={onEditFreeLocations}
      />,
    );

    expect(screen.getByText("Other managers are editing locations in this week.")).toBeTruthy();
    expect(screen.queryByText(/Ayse Person is editing/)).toBeNull();
    const holders = screen.getByRole("list", { name: "Locations being edited" });
    expect(holders.textContent).toContain("Kadikoy: Ayse Person");
    expect(holders.textContent).toContain("Moda: Can Person");
    fireEvent.click(screen.getByRole("button", { name: "Edit Besiktas" }));
    expect(onEditFreeLocations).toHaveBeenCalledOnce();
  });

  it("offers no free-location edit when every location is held", () => {
    render(
      <ScheduleEditLockedDialog
        open
        holderName="Ayse Person"
        scope="published"
        weekLabel="Aug 17 - Aug 23, 2026"
        lastHeartbeat={null}
        locks={[{ locationName: "Kadikoy", holderName: "Ayse Person" }]}
        freeLocationNames={[]}
        onViewSchedule={vi.fn()}
        onTryAgain={vi.fn()}
        onEditFreeLocations={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("list", { name: "Locations being edited" })).toBeNull();
  });

  it("does not render while closed", () => {
    render(
      <ScheduleEditLockedDialog
        open={false}
        holderName="Morgan Lee"
        scope="schedule"
        weekLabel="Aug 17 - Aug 23, 2026"
        lastHeartbeat="not-a-date"
        onViewSchedule={vi.fn()}
        onTryAgain={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
