import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleEditLockedDialog } from "./ScheduleEditLockedDialog";

describe("ScheduleEditLockedDialog", () => {
  it("names who is editing the draft and keeps both actions", () => {
    const onViewSchedule = vi.fn();
    const onTryAgain = vi.fn();

    render(
      <ScheduleEditLockedDialog
        open
        holderName="Morgan Lee"
        draftName="Weekend edits"
        lastHeartbeat={new Date().toISOString()}
        onViewSchedule={onViewSchedule}
        onTryAgain={onTryAgain}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Draft is being edited" });
    expect(dialog.className).toContain("schedule-edit-locked-dialog");
    expect(screen.getByText("Only one person edits a draft at a time.")).toBeTruthy();
    expect(screen.getByText(/Morgan Lee is editing "Weekend edits"/)).toBeTruthy();
    expect(screen.getByText("Last activity less than a minute ago.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onViewSchedule).toHaveBeenCalledTimes(1);
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Take over" })).toBeNull();
  });

  it("says this draft when the name is not known", () => {
    render(
      <ScheduleEditLockedDialog
        open
        holderName="Morgan Lee"
        draftName={null}
        lastHeartbeat={null}
        onViewSchedule={vi.fn()}
        onTryAgain={vi.fn()}
      />,
    );

    expect(screen.getByText(/Morgan Lee is editing this draft\./)).toBeTruthy();
    expect(screen.queryByText(/Last activity/)).toBeNull();
  });

  it("does not render while closed", () => {
    render(
      <ScheduleEditLockedDialog
        open={false}
        holderName="Morgan Lee"
        lastHeartbeat="not-a-date"
        onViewSchedule={vi.fn()}
        onTryAgain={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
