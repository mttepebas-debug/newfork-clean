// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { emptyWeeklyPreference } from "@newfork/shared";
import { WeekRead } from "./WeekRead";

afterEach(cleanup);

function marked() {
  const week = emptyWeeklyPreference();
  week.days[2]!.all_day = true;
  week.days[5]!.ranges = [{ start: "18:00", end: "24:00" }];
  return week;
}

describe("a person's week, read only (KARARLAR M2)", () => {
  it("says it is theirs to change, when they saved it, and the week in one sentence", () => {
    render(
      <WeekRead
        name="Maria Lopez"
        submitted
        updatedAt="2026-10-09T18:00:00.000Z"
        preference={marked()}
        timeFormat="12h"
        readOnlyBar
      />,
    );
    expect(screen.getByText("Read only. Only Maria can change this.")).toBeTruthy();
    expect(screen.getByText("Updated Oct 9")).toBeTruthy();
    expect(document.querySelector(".avr-sum")?.textContent).toBe(
      "Maria prefers not to work Tue all day and Fri after 6 PM.",
    );
    expect(
      screen.getByText(
        "A preference, not a rule. You can still schedule anyone; the Schedule shows an orange ! where a shift doesn't fit.",
      ),
    ).toBeTruthy();
    // Nothing to press: only Maria changes her week.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("draws seven day boxes Monday first: green when open, orange with the hours when not", () => {
    render(
      <WeekRead name="Maria Lopez" submitted updatedAt={null} preference={marked()} timeFormat="12h" />,
    );
    const week = screen.getByRole("list", { name: "Maria's week" });
    const boxes = within(week).getAllByRole("listitem");
    expect(boxes.map((box) => box.querySelector("b")?.textContent)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
    expect(boxes[0]!.textContent).toContain("Available all day");
    expect(boxes[0]!.className).toContain("is-free");
    expect(boxes[1]!.textContent).toContain("Unavailable all day");
    expect(boxes[1]!.className).toContain("is-blocked");
    expect(boxes[4]!.textContent).toContain("Unavailable after 6:00 PM");
    expect(boxes[4]!.className).toContain("is-blocked");
    // The mini strip marks the hours from 12 AM to 12 AM: Friday 6 PM on.
    const band = boxes[4]!.querySelector<HTMLElement>(".avr-rail > i")!;
    expect(band.style.left).toBe("75%");
    expect(band.style.width).toBe("25%");
    expect(boxes[0]!.querySelector(".avr-rail > i")).toBeNull();
    // No lock bar unless asked (the Availability page names the date itself).
    expect(screen.queryByText(/Read only/)).toBeNull();
  });

  it("says an open week plainly", () => {
    render(
      <WeekRead name="Maria Lopez" submitted updatedAt={null} preference={emptyWeeklyPreference()} timeFormat="12h" />,
    );
    expect(screen.getByText("Maria is open to work any time.")).toBeTruthy();
  });

  it("says a week never shared is optional, and every time counts as available", () => {
    render(
      <WeekRead
        name="Maria Lopez"
        submitted={false}
        updatedAt={null}
        preference={emptyWeeklyPreference()}
        timeFormat="12h"
        readOnlyBar
      />,
    );
    expect(screen.getByText("Maria hasn't shared availability yet.")).toBeTruthy();
    expect(screen.getByText("It's optional. Until then, every time counts as available.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText(/Read only/)).toBeNull();
  });
});
