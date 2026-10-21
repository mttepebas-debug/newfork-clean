import type {
  ScheduleEditableShift,
  ScheduleReadModel,
  ScheduleShift,
} from "@newfork/shared/schedule";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GhostShiftCard,
  ShiftCard,
  formatScheduleBadgeTime,
  formatScheduleBadgeTimeRange,
  formatScheduleShiftBadgeTitle,
} from "./ShiftCard";
import { isShiftNoteOpen } from "./ShiftNoteCorner";

const shiftType: ScheduleReadModel["shift_types"][number] = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Dinner",
  color: "#f97316",
  sort_order: 0,
  default_start_time: "17:00",
  default_end_time: "22:00",
};

const shift: ScheduleEditableShift = {
  id: "22222222-2222-4222-8222-222222222222",
  location_id: "33333333-3333-4333-8333-333333333333",
  employee_id: "44444444-4444-4444-8444-444444444444",
  job_id: "55555555-5555-4555-8555-555555555555",
  shift_type_id: shiftType.id,
  scheduled_date: "2026-08-17",
  start_time: "17:00",
  end_time: "22:30",
  crosses_midnight: false,
  unpaid_break_minutes: 30,
  hide_time_on_badge: false,
  label_ids: [],
  label_names: ["Trainer"],
  note: "",
  warning_codes: [],
  revision: 1,
};

function renderShiftCard(
  overrides: Partial<Parameters<typeof ShiftCard>[0]> = {},
) {
  const props: Parameters<typeof ShiftCard>[0] = {
    shift,
    job: "Server",
    type: shiftType,
    locationName: "Main",
    editing: true,
    showShiftType: true,
    showShiftLabels: true,
    showClockTimes: true,
    showJobColorDot: true,
    rowKey: "row-1",
    badgeHeight: 52,
    publicationState: null,
    ...overrides,
  };

  render(<ShiftCard {...props} />);
  return props;
}

describe("ShiftCard", () => {
  // Mert, 2026-10-12: while editing, a live shift says LIVE top right.
  it("marks a live shift LIVE while editing and with nothing while reading", () => {
    renderShiftCard({ publicationState: "locked" });
    const live = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(live.querySelector(".schedule-shift-badge-markers .schedule-shift-live-mark")?.textContent).toBe("Live");
    expect(live.querySelector(".schedule-shift-new-mark")).toBeNull();
    // Mert, 2026-10-21: LIVE sits beside the first line, not on a row of its own.
    expect(live.getAttribute("data-mark-row")).toBeNull();
    expect(live.style.getPropertyValue("--shift-card-lastline-right")).toBe("0px");
    // Both sides keep LIVE's room: 6 + 30 + 4 - 8.
    expect(live.style.getPropertyValue("--shift-card-side")).toBe("32px");
    expect(live.style.getPropertyValue("--shift-card-line1-right")).toBe("37px");
    document.body.innerHTML = "";
    renderShiftCard({ publicationState: "locked", editing: false });
    const read = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(read.querySelector(".schedule-shift-badge-markers")).toBeNull();
    expect(read.getAttribute("data-mark-row")).toBeNull();
    expect(read.style.getPropertyValue("--shift-card-side")).toBe("2px");
  });
  // Mert, 2026-10-12: an edited live shift says NEW like a new one, with no
  // stripe or pencil; a shift staged for removal carries no icon.
  it("shows \"New\" only while editing, on a new shift and on an edited live one", () => {
    renderShiftCard();
    expect(document.querySelector(".schedule-shift-new-mark")?.textContent).toBe("New");
    // NEW sits beside the last line, which keeps clear of it: 1 + 4 + 22.
    expect(document.querySelector<HTMLElement>("[data-shift-badge]")?.style.getPropertyValue("--shift-card-lastline-right")).toBe("27px");
    expect(document.querySelector(".schedule-shift-new-mark")?.getAttribute("title")).toBe(
      "Not published yet - goes live on next publish",
    );
    document.body.innerHTML = "";
    renderShiftCard({ editing: false });
    expect(document.querySelector(".schedule-shift-new-mark")).toBeNull();
    document.body.innerHTML = "";
    renderShiftCard({ publicationState: "unlocked-modified" });
    expect(document.querySelector(".schedule-shift-new-mark")?.getAttribute("title")).toBe(
      "Edited - updates the live shift on next publish",
    );
    expect(document.querySelector(".schedule-shift-live-mark")).toBeNull();
    expect(document.querySelector(".schedule-shift-badge svg")).toBeNull();
    document.body.innerHTML = "";
    renderShiftCard({ publicationState: "staged-removed" });
    expect(document.querySelector(".schedule-shift-new-mark")).toBeNull();
    expect(document.querySelector(".schedule-shift-badge-markers")).toBeNull();
    expect(document.querySelector(".schedule-shift-badge svg")).toBeNull();
  });
  it("keeps warning context without a warning icon", () => {
    renderShiftCard({ shift: { ...shift, warning_codes: ["overlap"] } });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(badge.querySelector(".schedule-shift-badge-markers")).toBeNull();
    // Editing, the sides keep the spinner's room and NEW's below: 4 + 22 + 4 - 8.
    expect(badge.style.getPropertyValue("--shift-card-side")).toBe("22px");
    expect(badge.getAttribute("aria-label")).toContain("conflicts with another shift");
  });
  it("says the person shows as unavailable with an orange \"!\" and its hours (BL-186, G14)", () => {
    renderShiftCard({
      shift: { ...shift, scheduled_date: "2026-10-20", start_time: "16:00", end_time: "22:00", warning_codes: ["availability"] },
      employeeName: "Ali Kaya",
      availabilityMark: { kind: "unavailable", windows: [{ from: 840, to: 1440 }] },
    });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(badge.getAttribute("aria-label")).toContain("Ali Kaya shows as unavailable for this shift");
    expect(badge.getAttribute("title")).toBeNull();
    expect(badge.getAttribute("data-availability-warning")).toBe("true");
    expect(badge.querySelector(".schedule-shift-badge-markers")).not.toBeNull();
    const mark = screen.getByRole("button", { name: "Ali Kaya: unavailable during this shift" });
    expect(mark.textContent).toBe("!");
    // A card is a button, so its "!" is a focusable span, never a nested button.
    expect(mark.tagName).toBe("SPAN");
    expect(badge.querySelector("button")).toBeNull();
    const description = badge.getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(description).toContain("Marked unavailable Tue, Oct 20 · After 2:00 PM");
  });
  // Mert, 2026-10-12: while editing, a live shift's "!" moves to the row's
  // name cell (ScheduleRow); the card still says why to a screen reader.
  it("keeps a live shift's \"!\" off its card while editing, and says it to a screen reader", () => {
    renderShiftCard({
      shift: { ...shift, scheduled_date: "2026-10-20", start_time: "16:00", end_time: "22:00", warning_codes: ["availability"] },
      employeeName: "Ali Kaya",
      availabilityMark: { kind: "unavailable", windows: [{ from: 840, to: 1440 }] },
      publicationState: "locked",
    });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(screen.queryByRole("button", { name: "Ali Kaya: unavailable during this shift" })).toBeNull();
    expect(badge.querySelector(".schedule-shift-live-mark")).not.toBeNull();
    const description = badge.getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(description).toContain("Marked unavailable Tue, Oct 20 · After 2:00 PM");
    document.body.innerHTML = "";
    renderShiftCard({
      shift: { ...shift, warning_codes: ["availability"] },
      employeeName: "Ali Kaya",
      publicationState: "locked",
      editing: false,
    });
    expect(screen.getByRole("button", { name: "Ali Kaya: unavailable during this shift" })).toBeTruthy();
  });
  it("says \"Changed after publishing\" on a mark that came after the first publish (M11)", () => {
    renderShiftCard({
      shift: { ...shift, scheduled_date: "2026-10-22", start_time: "11:00", end_time: "19:00", warning_codes: ["availability"], availability_changed_after_publish: true },
      employeeName: "Ali Kaya",
      availabilityMark: { kind: "unavailable", windows: [{ from: 840, to: 1440 }] },
    });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    const description = badge.getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(description).toContain("Changed after publishing");
    fireEvent.click(screen.getByRole("button", { name: "Ali Kaya: unavailable during this shift" }));
    expect(screen.getByRole("dialog").textContent).toBe("Marked unavailable Thu, Oct 22 · After 2:00 PMChanged after publishing");
  });
  it("opens the \"!\" window without the press reaching the card; Escape or a press outside only closes it (KARARLAR Schedule, 2026-10-06)", () => {
    const onSelect = vi.fn();
    const onFocus = vi.fn();
    const onEdit = vi.fn();
    const outsideClick = vi.fn();
    renderShiftCard({
      shift: { ...shift, scheduled_date: "2026-10-20", start_time: "16:00", end_time: "22:00", warning_codes: ["availability"] },
      employeeName: "Ali Kaya",
      availabilityMark: { kind: "unavailable", windows: [{ from: 840, to: 1440 }] },
      onSelect,
      onFocus,
      onEdit,
    });
    const mark = screen.getByRole("button", { name: "Ali Kaya: unavailable during this shift" });
    fireEvent.pointerDown(mark);
    fireEvent.click(mark);
    expect(screen.getByRole("dialog").textContent).toBe("Marked unavailable Tue, Oct 20 · After 2:00 PM");
    expect(mark.getAttribute("aria-expanded")).toBe("true");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(mark);

    fireEvent.keyDown(mark, { key: "Enter" });
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
    document.body.addEventListener("click", outsideClick);
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    document.body.removeEventListener("click", outsideClick);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outsideClick).not.toHaveBeenCalled();
  });
  it("shows no availability mark while the shift has none (the optimistic cell before saving)", () => {
    renderShiftCard({ shift: { ...shift, optimistic: true }, employeeName: "Ali Kaya" });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(badge.getAttribute("title")).toBeNull();
    expect(badge.getAttribute("data-availability-warning")).toBeNull();
  });
  // Mert, 2026-10-12: saving is a spinner in the top-right row, not a strip.
  it("shows saving feedback only on its optimistic badge", () => {
    renderShiftCard({ shift: { ...shift, optimistic: true, saving_state: "saving" } });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Saving");
    expect(status.closest(".schedule-shift-badge-markers")).not.toBeNull();
    expect(status.querySelector("svg")).not.toBeNull();
    expect(status.getAttribute("data-delayed")).toBeNull();
    expect(status.closest("button")?.disabled).toBe(true);
    expect(status.closest("button")?.getAttribute("aria-busy")).toBe("true");
    // An optimistic card is not yet a shift, so it says no NEW.
    expect(document.querySelector(".schedule-shift-new-mark")).toBeNull();
    document.body.innerHTML = "";
    renderShiftCard({ shift: { ...shift, optimistic: true, saving_state: "delayed" } });
    expect(screen.getByRole("status").textContent).toBe("Still saving, please wait");
    expect(screen.getByRole("status").getAttribute("data-delayed")).toBe("true");
    document.body.innerHTML = "";
    renderShiftCard();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("renders the schedule badge with title, labels, location, time, and sizing data", () => {
    renderShiftCard({ selected: true, focused: true });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(screen.getByText("Trainer")).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
    expect(screen.getByText("5:00 PM - 10:30 PM")).toBeTruthy();
    expect(badge.getAttribute("data-shift-badge")).toBe("true");
    expect(badge.getAttribute("data-selected")).toBe("true");
    expect(badge.getAttribute("data-focused")).toBe("true");
    expect(badge.getAttribute("aria-pressed")).toBe("true");
    expect(badge.getAttribute("draggable")).toBeNull();
    expect(badge.style.getPropertyValue("--schedule-row-badge-height")).toBe(
      "52px",
    );
    expect(screen.getByText("Trainer").closest(".schedule-shift-badge")).toBe(
      badge,
    );
    expect(screen.getByText("Dinner-Server")).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
    expect(
      document
        .querySelector("[data-shift-selection-ring='true']")
        ?.getAttribute("data-multi-selected"),
    ).toBe("true");
    expect(document.querySelector(".schedule-shift-color-dot")).toBeNull();
  });

  it("shows a cut title and place in full on hover (QA 50)", () => {
    renderShiftCard();

    expect(screen.getByText("Dinner-Server").getAttribute("title")).toBe("Dinner-Server");
    expect(screen.getByText("Main").getAttribute("title")).toBe("Main");
  });

  it("reads title, labels, then time, with no location pin", () => {
    renderShiftCard({ locationName: null });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    const parts = [...badge.querySelectorAll("[data-shift-badge-content] > *")].map(
      (node) => node.textContent,
    );
    expect(parts).toEqual(["Dinner-Server", "Trainer", "5:00 PM - 10:30 PM"]);
    expect(badge.querySelector(".schedule-ghost-location")).toBeNull();
    expect(screen.queryByRole("button", { name: "Location" })).toBeNull();
  });

  it("keeps focused shift semantics separate from multi-select pressed state", () => {
    renderShiftCard({ selected: false, focused: true });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(badge.getAttribute("data-focused")).toBe("true");
    expect(badge.getAttribute("aria-pressed")).toBe("false");
    expect(
      document
        .querySelector("[data-shift-selection-ring='true']")
        ?.getAttribute("data-multi-selected"),
    ).toBe("false");
    expect(document.querySelector(".schedule-shift-color-dot")).toBeNull();
  });

  it("focuses on normal click, multi-selects on modifier click, and copies from keyboard", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onSelect = vi.fn();
    const onCopy = vi.fn();
    renderShiftCard({ onFocus, onSelect, onCopy });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.click(badge);
    expect(onFocus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    fireEvent.click(badge, { ctrlKey: true });
    fireEvent.click(badge, { shiftKey: true });
    fireEvent.keyDown(badge, { key: "c", ctrlKey: true });

    expect(onFocus).toHaveBeenCalledWith(shift);
    expect(onSelect).toHaveBeenCalledWith(shift.id, true);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onCopy).toHaveBeenCalledWith(shift);
    vi.useRealTimers();
  });

  // BL-610: the drag start cancels the press, so the browser leaves focus where
  // it was; a clicked card takes it, and Enter and Ctrl+C then reach it.
  it("takes keyboard focus when clicked while editing", () => {
    const onEdit = vi.fn();
    const onCopy = vi.fn();
    renderShiftCard({ onEdit, onCopy });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });

    fireEvent.click(badge);
    expect(document.activeElement).toBe(badge);
    expect(badge.dataset.mouseFocus).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onEdit).toHaveBeenCalledWith(shift);
    fireEvent.keyDown(document.activeElement!, { key: "c", ctrlKey: true });
    expect(onCopy).toHaveBeenCalledWith(shift);

    // Leaving it ends the mouse mark: a later Tab back shows the keyboard ring.
    badge.blur();
    expect(badge.dataset.mouseFocus).toBeUndefined();
  });

  it("leaves focus alone when clicked outside editing (Employee view, preview)", () => {
    renderShiftCard({ editing: false });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });

    fireEvent.click(badge);
    expect(document.activeElement).not.toBe(badge);
    expect(badge.dataset.mouseFocus).toBeUndefined();
  });

  it("drops the keyboard ring when a card the keyboard reached is clicked", () => {
    renderShiftCard();
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    badge.focus();

    fireEvent.click(badge);
    expect(document.activeElement).toBe(badge);
    expect(badge.dataset.mouseFocus).toBe("true");
  });

  it("does not let an unpaired modifier pointerdown swallow the next normal click", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onSelect = vi.fn();
    renderShiftCard({ onFocus, onSelect });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.mouseDown(badge, { ctrlKey: true });
    fireEvent.mouseDown(badge);
    fireEvent.click(badge);
    vi.advanceTimersByTime(250);

    expect(onSelect).toHaveBeenCalledWith(shift.id, true);
    expect(onFocus).toHaveBeenCalledWith(shift);
    vi.useRealTimers();
  });

  it("opens editing once from a full double-click sequence without transient focus", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onEdit = vi.fn();
    renderShiftCard({ onEdit, onFocus, publicationState: "locked" });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.click(badge, { detail: 1, clientX: 10, clientY: 20 });
    fireEvent.click(badge, { detail: 2, clientX: 10, clientY: 20 });
    fireEvent.doubleClick(badge, { clientX: 10, clientY: 20 });
    vi.runAllTimers();

    expect(badge.getAttribute("data-publication-state")).toBe("locked");
    expect(onEdit).toHaveBeenCalledWith(shift, { x: 10, y: 20 });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onFocus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps an already-current badge current while opening it on double click", () => {
    vi.useFakeTimers();
    const onFocus = vi.fn();
    const onEdit = vi.fn();
    renderShiftCard({ focused: true, onEdit, onFocus });

    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    fireEvent.click(badge, { detail: 1 });
    fireEvent.click(badge, { detail: 2 });
    fireEvent.doubleClick(badge);
    vi.runAllTimers();

    expect(badge.getAttribute("data-current")).toBe("true");
    expect(onFocus).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("formats shift badge titles and times like the schedule grid", () => {
    expect(formatScheduleShiftBadgeTitle(shiftType, "Server", true)).toBe(
      "Dinner-Server",
    );
    expect(formatScheduleShiftBadgeTitle(shiftType, "Server", false)).toBe(
      "Server",
    );
    expect(formatScheduleBadgeTime("00:00")).toBe("12:00 AM");
    expect(formatScheduleBadgeTime("12:15")).toBe("12:15 PM");
    expect(formatScheduleBadgeTime("17:30", "24h")).toBe("17:30");
    expect(formatScheduleBadgeTimeRange("09:00", "17:00")).toBe(
      "9:00 AM - 5:00 PM",
    );
    expect(formatScheduleBadgeTimeRange("09:00", "17:00", "24h")).toBe(
      "09:00 - 17:00",
    );
  });

  it("renders badge clock text with the schedule time format", () => {
    renderShiftCard({ timeFormat: "24h" });

    expect(screen.getByText("17:00 - 22:30")).toBeTruthy();
    expect(screen.getByRole("button", { name: /17:00 - 22:30/i })).toBeTruthy();
  });

  it("shows every label without compacting the visible list", () => {
    renderShiftCard({
      shift: {
        ...shift,
        label_names: ["Training", "Lead Server", "Close"],
      },
    });

    const labels = screen.getByText("Training · Lead Server · Close");
    expect(labels.getAttribute("title")).toBe("Training · Lead Server · Close");
    expect(
      screen.getByRole("button", {
        name: /Training · Lead Server · Close/i,
      }),
    ).toBeTruthy();
  });
});

// BL-199: the manager-note corner. jsdom has no PointerEvent, so events are
// built by hand with a pointer type. React reads enter/leave from the "out"
// event of the element the pointer came from, as a browser sends it.
function pointerEvent(
  element: Element,
  type: "pointerover" | "pointerout" | "pointerdown" | "pointermove",
  pointerType: string,
  relatedTarget: Element | null,
  buttons = 0,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    relatedTarget: { value: relatedTarget },
    buttons: { value: buttons },
  });
  fireEvent(element, event);
}
function move(from: Element | null, to: Element | null, pointerType = "mouse", buttons = 0) {
  if (from) pointerEvent(from, "pointerout", pointerType, to, buttons);
  if (to) pointerEvent(to, "pointerover", pointerType, from, buttons);
}

describe("ShiftCard manager note (BL-199)", () => {
  afterEach(() => vi.useRealTimers());
  const note = "Private party of 40 in the back room from 7 PM.";
  const noted = () => {
    vi.useFakeTimers();
    renderShiftCard({ shift: { ...shift, note: `  ${note} ` } });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    const corner = badge.querySelector("[data-shift-note-marker]")!;
    return { badge, corner };
  };
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
  const noteCard = () => document.querySelector(".schedule-shift-note-card");
  const openNote = (badge: Element, corner: Element) => {
    move(null, badge);
    move(badge, corner);
    wait(300);
    return noteCard()!;
  };

  it("marks only a shift with a note, and says so to a screen reader", () => {
    const { badge, corner } = noted();
    expect(corner).not.toBeNull();
    expect(badge.getAttribute("data-has-note")).toBe("true");
    expect(badge.getAttribute("aria-label")).toMatch(/, has a manager note$/);
    expect(screen.getByRole("button", { description: note })).toBe(badge);
  });

  it("puts no corner and no note wording on a shift without a note", () => {
    renderShiftCard({ shift: { ...shift, note: "   " } });
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(badge.querySelector("[data-shift-note-marker]")).toBeNull();
    expect(badge.getAttribute("aria-label")).not.toContain("manager note");
    expect(badge.getAttribute("aria-describedby")).toBeNull();
  });

  it("opens the note only for a mouse resting on the corner", () => {
    const { badge, corner } = noted();
    move(null, badge.querySelector("strong"));
    wait(400);
    expect(noteCard()).toBeNull();
    fireEvent.focus(badge);
    wait(400);
    expect(noteCard()).toBeNull();
    move(badge.querySelector("strong"), corner, "touch");
    wait(400);
    expect(noteCard()).toBeNull();
    move(corner, badge, "touch");

    move(badge, corner);
    wait(100);
    expect(noteCard()).toBeNull();
    wait(200);
    expect(noteCard()?.textContent).toBe(`Manager note${note}`);
    expect(noteCard()?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stays open while the pointer moves onto the note, then closes when it leaves both", () => {
    const { badge, corner } = noted();
    const card = openNote(badge, corner);
    expect(card).not.toBeNull();
    move(corner, card);
    wait(400);
    expect(noteCard()).not.toBeNull();
    move(card, document.body);
    wait(200);
    expect(noteCard()).toBeNull();
  });

  it("keeps the note while the pointer crosses its card to a note below, closing when it leaves both", () => {
    const { badge, corner } = noted();
    const card = openNote(badge, corner);
    expect(card.getAttribute("data-side")).toBe("below");
    const body = badge.querySelector("strong")!;
    // Corner, then down across the card: the card is the bridge.
    move(corner, body);
    wait(400);
    expect(noteCard()).not.toBeNull();
    move(body, card);
    wait(400);
    expect(noteCard()).not.toBeNull();
    // Back onto the card, then away from both.
    move(card, body);
    move(body, document.body);
    wait(200);
    expect(noteCard()).toBeNull();
  });

  it("does not open when the pointer only passes the corner on its way into the card", () => {
    const { badge, corner } = noted();
    move(null, badge);
    move(badge, corner);
    wait(100);
    move(corner, badge.querySelector("strong"));
    wait(400);
    expect(noteCard()).toBeNull();
  });

  it("stays shut while any card is being dragged across the corner", () => {
    const { badge, corner } = noted();
    // Another card's drag: the button is held down as the pointer passes.
    move(null, badge, "mouse", 1);
    move(badge, corner, "mouse", 1);
    wait(400);
    expect(noteCard()).toBeNull();
    // A press that turns into a drag after the pointer arrived cancels the wait.
    move(corner, badge);
    move(badge, corner);
    wait(100);
    pointerEvent(corner, "pointermove", "mouse", null, 1);
    wait(400);
    expect(noteCard()).toBeNull();
  });

  it("does not open on a card being dragged, and closes when its drag starts", () => {
    vi.useFakeTimers();
    const props: Parameters<typeof ShiftCard>[0] = {
      shift: { ...shift, note },
      job: "Server",
      type: shiftType,
      locationName: "Main",
      editing: true,
      showShiftType: true,
      showShiftLabels: true,
      showClockTimes: true,
      showJobColorDot: true,
      rowKey: "row-1",
      badgeHeight: 52,
      publicationState: null,
    };
    const { rerender } = render(<ShiftCard {...props} dragging />);
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    const corner = badge.querySelector("[data-shift-note-marker]")!;
    move(null, badge);
    move(badge, corner);
    wait(400);
    expect(noteCard()).toBeNull();

    rerender(<ShiftCard {...props} dragging={false} />);
    move(corner, badge);
    move(badge, corner);
    wait(300);
    expect(noteCard()).not.toBeNull();
    rerender(<ShiftCard {...props} dragging />);
    expect(noteCard()).toBeNull();
  });

  it("spends Escape on the note alone, so the Schedule keeps its filters and week", () => {
    const { badge, corner } = noted();
    const scheduleEscape = vi.fn();
    window.addEventListener("keydown", scheduleEscape);
    document.addEventListener("keydown", scheduleEscape, true);
    try {
      expect(openNote(badge, corner)).not.toBeNull();
      act(() => { fireEvent.keyDown(document.body, { key: "Escape" }); });
      expect(noteCard()).toBeNull();
      expect(scheduleEscape).not.toHaveBeenCalled();
      // With the note shut, Escape reaches the Schedule again.
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(scheduleEscape).toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", scheduleEscape);
      document.removeEventListener("keydown", scheduleEscape, true);
    }
  });

  it("lets Escape through once the note it showed is gone", () => {
    vi.useFakeTimers();
    const props: Parameters<typeof ShiftCard>[0] = {
      shift: { ...shift, note },
      job: "Server",
      type: shiftType,
      showShiftType: true,
      showShiftLabels: true,
      showClockTimes: true,
      showJobColorDot: true,
      rowKey: "row-1",
      badgeHeight: 52,
      publicationState: null,
    };
    const { rerender } = render(<ShiftCard {...props} />);
    const badge = screen.getByRole("button", { name: /Dinner-Server/i });
    expect(openNote(badge, badge.querySelector("[data-shift-note-marker]")!)).not.toBeNull();
    // Someone clears the note (the editor saves it blank) while it is open.
    rerender(<ShiftCard {...props} shift={{ ...shift, note: "" }} />);
    expect(noteCard()).toBeNull();
    expect(isShiftNoteOpen()).toBe(false);
    const scheduleEscape = vi.fn();
    window.addEventListener("keydown", scheduleEscape);
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(scheduleEscape).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("keydown", scheduleEscape);
    }
  });

  it.each([
    ["a click or the start of a drag", (badge: Element) => pointerEvent(badge, "pointerdown", "mouse", null)],
    ["Escape", () => fireEvent.keyDown(document, { key: "Escape" })],
    ["a scroll", () => fireEvent.scroll(window)],
  ] as const)("closes on %s", (_, close) => {
    const { badge, corner } = noted();
    expect(openNote(badge, corner)).not.toBeNull();
    act(() => close(badge));
    expect(noteCard()).toBeNull();
  });
});

describe("GhostShiftCard", () => {
  it("renders duplicate-location ghost badges with warning context", () => {
    const ghostShift = {
      ...shift,
      warning_codes: ["overlap"],
      ghost: true,
      ghost_location_name: "Patio",
    } as ScheduleShift & {
      readonly ghost: boolean;
      readonly ghost_location_name: string;
    };

    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Server"
        type={shiftType}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const badge = screen.getByTestId("ghost-shift-badge");
    expect(badge.getAttribute("data-ghost")).toBe("true");
    // The location pin takes the top-right corner; both sides keep its room
    // (6 + 17 + 4 - 8), so the words keep clear of it.
    expect(badge.getAttribute("data-mark-row")).toBe("true");
    expect(badge.style.getPropertyValue("--shift-card-side")).toBe("19px");
    expect(document.querySelector(".schedule-shift-color-dot")).toBeNull();
    // The place is behind the pin, not on its own line.
    // Not written on the card: the pin's bubble and its hidden description carry it.
    expect(screen.queryByText("Patio", { ignore: "[hidden]" })).toBeNull();
    expect(screen.getByRole("button", { name: "Location: Patio", description: "Patio" })).toBeTruthy();
    expect(badge.querySelector("[data-shift-badge-location]")).toBeNull();
    expect(screen.getByRole("button", { name: "Location: Patio" })).toBeTruthy();
    expect(screen.getByText("5:00 PM - 10:30 PM")).toBeTruthy();
    expect(badge.getAttribute("aria-label")).toContain(
      "also scheduled at Patio",
    );
    // Mert, 2026-10-13 (ghost look I): the real card at half strength, in
    // its own type color.
    expect(badge.style.getPropertyValue("--shift-color")).toBe(shiftType.color);
    // Mert, 2026-10-12 (the card look he chose): the location pin 17px.
    const pin = screen.getByRole("button", { name: "Location: Patio" }).querySelector("svg");
    expect(pin?.getAttribute("width")).toBe("17");
  });

  it("falls back to the real card's color when the type has none", () => {
    render(
      <GhostShiftCard
        shift={{ ...shift, ghost: true } as ScheduleShift}
        job="Server"
        type={undefined}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );
    expect(screen.getByTestId("ghost-shift-badge").style.getPropertyValue("--shift-color")).toBe("#54736a");
  });

  it("names the place in a tooltip on keyboard focus and hides it on Escape", async () => {
    const ghostShift = {
      ...shift,
      ghost: true,
      ghost_location_name: "Besiktas",
    } as ScheduleShift;
    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Server"
        type={shiftType}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const pin = screen.getByRole("button", { name: "Location: Besiktas" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(pin);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("Besiktas");
    expect(pin.getAttribute("aria-describedby")).toBe(tooltip.id);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(pin);
    expect(screen.getByRole("tooltip").textContent).toBe("Besiktas");
    fireEvent.mouseLeave(pin);
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });

  it("titles an out-of-scope ghost with the job, type and labels it carries", () => {
    // Besiktas is outside the reader's scope: its job and type are not in the model's lists.
    const ghostShift = {
      ...shift,
      job_id: "55555555-5555-4555-8555-555555555599",
      shift_type_id: "11111111-1111-4111-8111-111111111199",
      label_names: ["On call"],
      note: "",
      ghost: true,
      ghost_location_name: "Besiktas",
      ghost_job_name: "Bartender",
      ghost_shift_type_name: "Late",
    } as ScheduleShift;

    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Shift"
        type={undefined}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const badge = screen.getByTestId("ghost-shift-badge");
    const parts = [...badge.querySelectorAll("[data-shift-badge-content] > *")].map(
      (node) => node.textContent,
    );
    // Same lines, same order as the real card: title, labels as text, time.
    expect(parts).toEqual(["Late-Bartender", "On call", "5:00 PM - 10:30 PM"]);
    expect(badge.getAttribute("aria-label")).toContain("Late-Bartender");
  });

  it("falls back to Shift when the ghost carries no job or type name", () => {
    const ghostShift = {
      ...shift,
      label_names: [],
      ghost: true,
      ghost_location_name: "Besiktas",
      ghost_job_name: "  ",
      ghost_shift_type_name: null,
    } as ScheduleShift;

    render(
      <GhostShiftCard
        shift={ghostShift}
        job="Shift"
        type={undefined}
        showShiftType
        showShiftLabels
        showClockTimes
        showJobColorDot
        rowKey="row-1"
        badgeHeight={52}
      />,
    );

    const badge = screen.getByTestId("ghost-shift-badge");
    expect(badge.querySelector("strong")?.textContent).toBe("Shift");
  });
});
