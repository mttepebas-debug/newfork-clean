import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DayHeaderCell, schedulePostChipText } from "./DayHeaderCell";

const location = "10000000-0000-4000-8000-000000000001";
const post = (overrides: Partial<Parameters<typeof schedulePostChipText>[0]> = {}) => ({
  id: "70000000-0000-4000-8000-000000000001",
  location_id: location,
  title: "Labor Day",
  category: "holiday" as const,
  category_other: null,
  starts_on: "2026-09-07",
  ends_on: "2026-09-07",
  status: "published" as const,
  publish_at: null,
  day: "closed" as const,
  opens: null,
  closes: null,
  event_from: null,
  event_until: null,
  ...overrides,
});

describe("DayHeaderCell", () => {
  it("shades a Closed day and names the post on its chip (EKRAN-08)", () => {
    const onOpenPost = vi.fn();
    const onClick = vi.fn();
    render(
      <DayHeaderCell
        date="2026-09-07"
        closure={{
          id: "60000000-0000-4000-8000-000000000001",
          location_id: location,
          closed_date: "2026-09-07",
          title: "Labor Day",
          is_all_day: true,
          kind: "closed",
          opens: null,
          closes: null,
          status: "published",
        }}
        posts={[post()]}
        onClick={onClick}
        onOpenPost={onOpenPost}
      />,
    );

    const header = screen.getByRole("columnheader", { name: "View Mon Sep 7" });
    expect(header.getAttribute("data-closed")).toBe("true");
    expect(header.getAttribute("data-posts")).toBe("true");
    const chip = screen.getByRole("button", { name: "Closed · Labor Day" });
    expect(chip.getAttribute("data-day")).toBe("closed");
    fireEvent.click(chip);
    expect(onOpenPost).toHaveBeenCalledWith("70000000-0000-4000-8000-000000000001");
    // The chip opens the post, not the day.
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses the reference slate cue for today's date number", () => {
    render(<DayHeaderCell date="2026-08-18" isToday />);

    const header = screen.getByRole("columnheader", {
      name: "Tue Aug 18",
    });
    const dateNumber = screen.getByText("18");

    expect(header.getAttribute("data-today")).toBe("true");
    expect(header.getAttribute("data-posts")).toBe("false");
    expect(dateNumber.className).toContain("schedule-day-header-date");
  });

  it("shows the first post and counts the rest", () => {
    render(
      <DayHeaderCell
        date="2026-12-24"
        posts={[
          post({ title: "Christmas Eve", day: "short", opens: "10:00", closes: "15:00" }),
          post({ id: "70000000-0000-4000-8000-000000000002", title: "Staff dinner", day: "open" }),
        ]}
      />,
    );

    expect(screen.getByText("Short hours 10a–3p · Christmas Eve").getAttribute("data-day")).toBe("short");
    expect(screen.getByLabelText("1 more: Staff dinner").textContent).toBe("+1");
  });

  it("says when a scheduled post goes out, in the workspace's clock", () => {
    expect(
      schedulePostChipText(
        post({ status: "scheduled", publish_at: "2026-10-19T16:00:00Z", day: "short", opens: "16:00", closes: "02:00" }),
        "24h",
        "America/Los_Angeles",
      ),
    ).toBe("Short hours 16:00–02:00 · announces Oct 19");
    expect(schedulePostChipText(post({ status: "scheduled", publish_at: "2026-11-01T16:00:00Z", day: "open", title: "Deep clean" }))).toBe(
      "Deep clean · announces Nov 1",
    );
    expect(schedulePostChipText(post({ day: "open", title: "Restaurant Week" }))).toBe("Restaurant Week");
  });
});
