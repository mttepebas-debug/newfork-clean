// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  emptyWeeklyPreference,
  type PreferenceShiftType,
  type WeeklyPreference,
} from "@newfork/shared";
import { DayEditor } from "./DayEditor";
import { noCopies, type Copies } from "./day-availability";

afterEach(cleanup);
// jsdom has no PointerEvent; the strip reads clientX and pointerId from one.
if (!("PointerEvent" in window))
  Object.assign(window, {
    PointerEvent: class extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
      }
    },
  });

const types: PreferenceShiftType[] = [
  ["Breakfast", "07:00", "11:00"],
  ["Lunch", "11:00", "16:00"],
  ["Dinner", "16:00", "22:00"],
  ["Close", "18:00", "23:30"],
].map(([name, start, end], index) => ({
  id: `ad440000-0000-4000-8000-00000000000${index + 1}`,
  name: name!,
  start_time: start!,
  end_time: end!,
  archived: false,
  selectable: true,
}));

let latest: WeeklyPreference;
function Harness({ start, weekday = 5, phone = false }: { start: WeeklyPreference; weekday?: number; phone?: boolean }) {
  const [week, setWeek] = useState(start);
  const [copies, setCopies] = useState<Copies>(noCopies);
  latest = week;
  return (
    <DayEditor
      week={week}
      weekday={weekday}
      copies={copies}
      onChange={(next, nextCopies) => {
        setWeek(next);
        setCopies(nextCopies);
      }}
      shiftTypes={types}
      timeFormat="12h"
      phone={phone}
    />
  );
}
const friday = () => latest.days[5]!;
const card = (name: RegExp) => screen.getByRole("radio", { name });

describe("the three cards", () => {
  it("are in the order Available, Unavailable, Some hours and show the day as it is", () => {
    render(<Harness start={emptyWeeklyPreference("time_range")} />);
    const radios = within(screen.getByRole("radiogroup", { name: "Friday" })).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "AvailableAll day",
      "UnavailableAll day",
      "Some hoursNot at certain hours",
    ]);
    expect(radios[0]!.getAttribute("aria-checked")).toBe("true");
    // Available: the strip is empty and says how to block hours.
    expect(screen.getByText("Drag across to block hours")).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("turns the whole day orange for Unavailable, and Some hours starts in the evening", () => {
    render(<Harness start={emptyWeeklyPreference("time_range")} />);
    fireEvent.click(card(/^Unavailable/));
    expect(friday().all_day).toBe(true);
    expect(card(/^Unavailable/).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("All day", { selector: ".dav-band span" })).toBeTruthy();
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    fireEvent.click(card(/^Some hours/));
    expect(friday()).toMatchObject({ all_day: false, ranges: [{ start: "18:00", end: "24:00" }] });
    expect(screen.getByText("After 6 PM", { selector: ".dav-band span" })).toBeTruthy();
    fireEvent.click(card(/^Available/));
    expect(friday()).toMatchObject({ all_day: false, ranges: [], shift_type_ids: [] });
  });

  it("move with the arrow keys like one radio group", () => {
    render(<Harness start={emptyWeeklyPreference("time_range")} />);
    const available = card(/^Available/);
    expect(available.tabIndex).toBe(0);
    expect(card(/^Unavailable/).tabIndex).toBe(-1);
    fireEvent.keyDown(available, { key: "ArrowDown" });
    expect(friday().all_day).toBe(true);
    expect(document.activeElement).toBe(card(/^Unavailable/));
  });
});

describe("the strip of hours", () => {
  const evening = () => {
    const week = emptyWeeklyPreference("time_range");
    week.days[5]!.ranges = [{ start: "18:00", end: "24:00" }];
    return week;
  };

  it("moves an end 30 minutes with the arrow keys, and Home / End to the ends", () => {
    render(<Harness start={evening()} />);
    const from = screen.getByRole("slider", { name: "Start of unavailable hours" });
    expect(from.getAttribute("aria-valuetext")).toBe("6:00 PM");
    fireEvent.keyDown(from, { key: "ArrowLeft" });
    expect(friday().ranges).toEqual([{ start: "17:30", end: "24:00" }]);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Start of unavailable hours" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Start of unavailable hours" }), { key: "ArrowRight" });
    expect(friday().ranges).toEqual([{ start: "18:30", end: "24:00" }]);
    const until = screen.getByRole("slider", { name: "End of unavailable hours" });
    expect(until.getAttribute("aria-valuetext")).toBe("End of day");
    fireEvent.keyDown(until, { key: "Home" });
    expect(friday().ranges).toEqual([{ start: "18:30", end: "19:00" }]);
    fireEvent.keyDown(screen.getByRole("slider", { name: "End of unavailable hours" }), { key: "End" });
    screen.getByRole("slider", { name: "Start of unavailable hours" }).focus();
    // The whole day blocked is Unavailable all day: the card follows.
    fireEvent.keyDown(screen.getByRole("slider", { name: "Start of unavailable hours" }), { key: "Home" });
    expect(friday()).toMatchObject({ all_day: true, ranges: [] });
    expect(card(/^Unavailable/).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("slider", { name: "Start of unavailable hours" }));
  });

  it("draws one range across an empty strip; a short tap blocks two hours", () => {
    render(<Harness start={emptyWeeklyPreference("time_range")} />);
    const track = screen.getByRole("group", { name: "Friday hours, 12 AM to 12 AM" });
    track.getBoundingClientRect = () => ({ left: 0, width: 1440, top: 0, height: 40, right: 1440, bottom: 40, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(track, { button: 0, clientX: 540, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 1020, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 1020, pointerId: 1 });
    expect(friday().ranges).toEqual([{ start: "09:00", end: "17:00" }]);
    expect(card(/^Some hours/).getAttribute("aria-checked")).toBe("true");
    // A tap beside the band brings its nearest end there; still one range.
    fireEvent.pointerDown(track, { button: 0, clientX: 1200, pointerId: 2 });
    fireEvent.pointerUp(track, { clientX: 1200, pointerId: 2 });
    expect(friday().ranges).toEqual([{ start: "09:00", end: "20:00" }]);
    // A tap on an empty strip blocks two hours around it.
    fireEvent.click(card(/^Available/));
    const again = screen.getByRole("group", { name: "Friday hours, 12 AM to 12 AM" });
    again.getBoundingClientRect = track.getBoundingClientRect;
    fireEvent.pointerDown(again, { button: 0, clientX: 600, pointerId: 3 });
    fireEvent.pointerUp(again, { clientX: 600, pointerId: 3 });
    expect(friday().ranges).toEqual([{ start: "09:00", end: "11:00" }]);
  });

  it("reads 12a to 12a under the strip", () => {
    render(<Harness start={evening()} />);
    const scale = document.querySelector(".dav-scale")!;
    expect([...scale.children].map((tick) => tick.textContent)).toEqual(["12a", "4a", "8a", "12p", "4p", "8p", "12a"]);
  });
});

describe("From and Until", () => {
  it("show a dash on an available day; picking a time starts the range", () => {
    render(<Harness start={emptyWeeklyPreference("time_range")} />);
    const from = screen.getByRole("combobox", { name: "From" }) as HTMLSelectElement;
    const until = screen.getByRole("combobox", { name: "Until" }) as HTMLSelectElement;
    expect(from.selectedOptions[0]!.textContent).toBe("—");
    expect(until.selectedOptions[0]!.textContent).toBe("—");
    fireEvent.change(from, { target: { value: "540" } });
    expect(friday().ranges).toEqual([{ start: "09:00", end: "24:00" }]);
    fireEvent.change(screen.getByRole("combobox", { name: "Until" }), { target: { value: "1020" } });
    expect(friday().ranges).toEqual([{ start: "09:00", end: "17:00" }]);
    // A start after the end pushes the end an hour later.
    fireEvent.change(screen.getByRole("combobox", { name: "From" }), { target: { value: "1080" } });
    expect(friday().ranges).toEqual([{ start: "18:00", end: "19:00" }]);
  });

  it("name the two ends of the day plainly, short on the phone", () => {
    const { unmount } = render(<Harness start={emptyWeeklyPreference("time_range")} />);
    const options = (name: string) =>
      [...(screen.getByRole("combobox", { name }) as HTMLSelectElement).options].map((option) => option.textContent);
    expect(options("From")[1]).toBe("Midnight (12 AM)");
    expect(options("Until").at(-1)).toBe("End of day (12 AM)");
    expect(options("From")).not.toContain("End of day (12 AM)");
    unmount();
    render(<Harness start={emptyWeeklyPreference("time_range")} phone />);
    expect(options("From")[1]).toBe("Midnight");
    expect(options("Until").at(-1)).toBe("End of day");
  });
});

describe("shift types", () => {
  it("are four live cards; Unavailable marks them all and one tap takes one off", () => {
    render(<Harness start={emptyWeeklyPreference("shift_type")} />);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(card(/^Some shifts/).textContent).toBe("Some shiftsNot certain shifts");
    const typeButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
    expect(types.map((type) => typeButton(type.name).getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false"]);
    fireEvent.click(card(/^Unavailable/));
    expect(types.map((type) => typeButton(type.name).getAttribute("aria-pressed"))).toEqual(["true", "true", "true", "true"]);
    fireEvent.click(typeButton("Lunch"));
    expect(friday()).toMatchObject({ all_day: false, shift_type_ids: [types[0]!.id, types[2]!.id, types[3]!.id] });
    expect(card(/^Some shifts/).getAttribute("aria-checked")).toBe("true");
    expect(typeButton("Breakfast").textContent).toContain("7 AM – 11 AM");
  });
});

describe("Copy <day> to", () => {
  it("leaves the edited day out, shows each day's state, and follows the edited day", () => {
    const week = emptyWeeklyPreference("time_range");
    week.days[2]!.all_day = true;
    render(<Harness start={week} />);
    const row = screen.getByRole("group", { name: "Copy Friday to" });
    const chips = within(row).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["Mon", "Tue", "Wed", "Thu", "Sat", "Sun"]);
    const tuesday = within(row).getByRole("button", { name: "Tuesday, now Unavailable all day" });
    fireEvent.click(card(/^Some hours/));
    fireEvent.click(tuesday);
    expect(within(row).getByRole("button", { name: "Tuesday, same as Friday" }).getAttribute("aria-pressed")).toBe("true");
    expect(latest.days[2]).toMatchObject({ all_day: false, ranges: [{ start: "18:00", end: "24:00" }] });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Start of unavailable hours" }), { key: "ArrowRight" });
    expect(latest.days[2]!.ranges).toEqual([{ start: "18:30", end: "24:00" }]);
    fireEvent.click(within(row).getByRole("button", { name: "Tuesday, same as Friday" }));
    expect(latest.days[2]).toMatchObject({ all_day: true, ranges: [] });
  });
});
