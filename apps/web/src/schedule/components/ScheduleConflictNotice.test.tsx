import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScheduleConflictNotice } from "./ScheduleConflictNotice";

describe("ScheduleConflictNotice", () => {
  it("renders normalized blocker copy with an accessible alert", () => {
    render(
      <ScheduleConflictNotice
        description="This assignment cannot be saved."
        messages={[
          "Employee is not assigned to this location",
          "Shift type needs default times before it can be used",
        ]}
        actionHint="Add a manager reason to override."
      />,
    );

    const notice = screen.getByRole("alert", { name: "Shift conflict" });
    expect(notice.className).toContain("schedule-conflict-notice");
    expect(notice.getAttribute("data-tone")).toBe("blocker");
    expect(
      within(notice).getByText("This assignment cannot be saved."),
    ).toBeTruthy();
    expect(
      within(notice).getByText("Employee is not assigned to this location."),
    ).toBeTruthy();
    expect(
      within(notice).getByText(
        "This preset needs default times before scheduling.",
      ),
    ).toBeTruthy();
    expect(
      within(notice).getByText("Add a manager reason to override."),
    ).toBeTruthy();
  });

  it("supports warning status notices", () => {
    render(
      <ScheduleConflictNotice
        role="status"
        tone="warning"
        description="Manager review is required."
        messages={["Availability is advisory for this visible row."]}
      />,
    );

    const notice = screen.getByRole("status", { name: "Shift conflict" });
    expect(notice.getAttribute("data-tone")).toBe("warning");
    expect(within(notice).getByText("Manager review is required.")).toBeTruthy();
  });
});
