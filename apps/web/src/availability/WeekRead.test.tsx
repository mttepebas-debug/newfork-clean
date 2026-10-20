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

  // Mert 2026-10-17 (AVAIL-GUN-S3): the phone's person page starts with the boxes.
  it("leaves out the lock line and the sentence without a header, keeping the boxes and the note under them", () => {
    render(
      <WeekRead
        name="Maria Lopez"
        submitted
        updatedAt="2026-10-09T18:00:00.000Z"
        preference={marked()}
        timeFormat="12h"
        readOnlyBar
        header={false}
      />,
    );
    expect(screen.queryByText("Read only. Only Maria can change this.")).toBeNull();
    expect(screen.queryByText("Updated Oct 9")).toBeNull();
    expect(document.querySelector(".avr-sum")).toBeNull();
    expect(document.querySelector(".avr-week")?.firstElementChild?.className).toBe("avr-tiles");
    expect(document.querySelector(".avr-mgr-note")).toBeTruthy();
  });

  // Mert 2026-10-20: a week never shared counts as open every day, so it reads
  // as seven green days, not as a message.
  it("draws a week never shared as seven open days, without a header too", () => {
    render(
      <WeekRead
        name="Maria Lopez"
        submitted={false}
        updatedAt={null}
        preference={emptyWeeklyPreference()}
        timeFormat="12h"
        readOnlyBar
        header={false}
      />,
    );
    const boxes = within(screen.getByRole("list", { name: "Maria's week" })).getAllByRole("listitem");
    expect(boxes.map((box) => box.querySelector("b")?.textContent)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
    boxes.forEach((box) => {
      expect(box.textContent).toContain("Available all day");
      expect(box.className).toContain("is-free");
    });
    expect(screen.queryByText(/hasn't shared/)).toBeNull();
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
    // Two fixed lines in a box: the state word, then the hours in the short clock, one line each.
    const lines = (box: HTMLElement) => [box.querySelector(".avr-tile-state")?.textContent, box.querySelector(".avr-tile-hours")?.textContent];
    expect(lines(boxes[0]!)).toEqual(["Available", "All day"]);
    expect(lines(boxes[1]!)).toEqual(["Unavailable", "All day"]);
    expect(lines(boxes[4]!)).toEqual(["Unavailable", "After 6 PM"]);
    // A row (the drawer, the phone) keeps the full clock: "Unavailable after 6:00 PM".
    const row = (box: HTMLElement) =>
      `${box.querySelector(".avr-tile-state")?.textContent} ${box.querySelector(".avr-tile-detail")?.textContent}`;
    expect(row(boxes[0]!)).toBe("Available all day");
    expect(row(boxes[4]!)).toBe("Unavailable after 6:00 PM");
    // The mini strip marks the hours from 12 AM to 12 AM: Friday 6 PM on.
    const band = boxes[4]!.querySelector<HTMLElement>(".avr-rail > i")!;
    expect(band.style.left).toBe("75%");
    expect(band.style.width).toBe("25%");
    expect(boxes[0]!.querySelector(".avr-rail > i")).toBeNull();
    // No lock bar unless asked (the Availability page names the date itself).
    expect(screen.queryByText(/Read only/)).toBeNull();
  });

  it("says a box's hours in the short clock, minutes only when they are not :00", () => {
    const week = emptyWeeklyPreference();
    week.days[1]!.ranges = [{ start: "00:00", end: "11:00" }];
    week.days[2]!.ranges = [{ start: "15:00", end: "22:00" }];
    week.days[3]!.ranges = [{ start: "15:30", end: "22:00" }];
    render(<WeekRead name="Maria Lopez" submitted updatedAt={null} preference={week} timeFormat="12h" />);
    const boxes = within(screen.getByRole("list", { name: "Maria's week" })).getAllByRole("listitem");
    const hours = (box: HTMLElement) => box.querySelector(".avr-tile-hours")?.textContent;
    const full = (box: HTMLElement) => box.querySelector(".avr-tile-detail")?.textContent;
    expect([hours(boxes[0]!), full(boxes[0]!)]).toEqual(["Before 11 AM", "before 11:00 AM"]);
    expect([hours(boxes[1]!), full(boxes[1]!)]).toEqual(["3 PM – 10 PM", "3:00 PM – 10:00 PM"]);
    expect([hours(boxes[2]!), full(boxes[2]!)]).toEqual(["3:30 PM – 10 PM", "3:30 PM – 10:00 PM"]);
  });

  it("says an open week plainly", () => {
    render(
      <WeekRead name="Maria Lopez" submitted updatedAt={null} preference={emptyWeeklyPreference()} timeFormat="12h" />,
    );
    expect(screen.getByText("Maria is open to work any time.")).toBeTruthy();
  });

  it("draws a week never shared as open even when the saved week says otherwise", () => {
    const week = emptyWeeklyPreference();
    week.days[1]!.ranges = [{ start: "00:00", end: "11:00" }];
    render(
      <WeekRead name="Maria Lopez" submitted={false} updatedAt={null} preference={week} timeFormat="12h" readOnlyBar />,
    );
    const boxes = within(screen.getByRole("list", { name: "Maria's week" })).getAllByRole("listitem");
    expect(boxes.every((box) => box.className.includes("is-free"))).toBe(true);
    expect(screen.getByText("Maria is open to work any time.")).toBeTruthy();
    // No save date: nothing was saved.
    expect(screen.queryByText(/Updated/)).toBeNull();
  });
});
