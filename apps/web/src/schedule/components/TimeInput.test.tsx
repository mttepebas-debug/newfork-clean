import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimeInput } from "./TimeInput";

afterEach(() => cleanup());

describe("TimeInput", () => {
  it("renders a 12h segmented time field", () => {
    const onChange = vi.fn();

    render(
      <TimeInput
        value="17:00"
        onChange={onChange}
        timeFormat="12h"
        ariaLabel="Shift start"
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    expect(input.value).toBe("05:00 PM");
    expect(getSegment(input, "hour")?.textContent).toBe("05");
    expect(getSegment(input, "minute")?.textContent).toBe("00");
    expect(getSegment(input, "period")?.textContent).toBe("PM");
  });

  it("emits canonical values for shorthand and AM/PM keyboard shortcuts", () => {
    const onChange = vi.fn();

    render(
      <TimeInput
        value=""
        onChange={onChange}
        timeFormat="12h"
        ariaLabel="Shift start"
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "630p" } });
    expect(onChange).toHaveBeenLastCalledWith("18:30");

    fireEvent.keyDown(input, { key: "a" });
    expect(onChange).toHaveBeenLastCalledWith("06:30");

    fireEvent.keyDown(input, { key: "p" });
    expect(onChange).toHaveBeenLastCalledWith("18:30");
  });

  it("supports segmented typing, arrows, and delete", () => {
    const onChange = vi.fn();

    render(
      <TimeInput
        value="12:30"
        onChange={onChange}
        timeFormat="12h"
        ariaLabel="Shift start"
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    act(() => input.focus());
    input.setSelectionRange(0, 0);
    fireEvent.click(input);

    expect(getSegment(input, "hour")?.dataset.active).toBe("true");

    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(getSegment(input, "minute")?.dataset.active).toBe("true");

    fireEvent.keyDown(input, { key: "Delete" });
    expect(getSegment(input, "minute")?.textContent).toBe("MM");
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("waits for the 12h period before auto-advancing typed shorthand", () => {
    const onChange = vi.fn();
    const onAutoAdvance = vi.fn();

    render(
      <TimeInput
        value=""
        onChange={onChange}
        timeFormat="12h"
        ariaLabel="Shift start"
        onAutoAdvance={onAutoAdvance}
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    expect(onChange).toHaveBeenLastCalledWith("09:00");
    expect(onAutoAdvance).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "930" } });
    expect(onChange).toHaveBeenLastCalledWith("09:30");
    expect(onAutoAdvance).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "p" });
    expect(onChange).toHaveBeenLastCalledWith("21:30");
    expect(onAutoAdvance).toHaveBeenCalledTimes(1);
  });

  it("moves the active segment with Tab and Shift+Tab before leaving the field", () => {
    const onChange = vi.fn();

    render(
      <TimeInput
        value=""
        onChange={onChange}
        timeFormat="12h"
        ariaLabel="Shift start"
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    act(() => input.focus());

    fireEvent.keyDown(input, { key: "Tab" });
    expect(getSegment(input, "minute")?.dataset.active).toBe("true");

    fireEvent.keyDown(input, { key: "Tab" });
    expect(getSegment(input, "period")?.dataset.active).toBe("true");

    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(getSegment(input, "minute")?.dataset.active).toBe("true");
  });

  // BL-199: at the field's edge Tab goes to the owner's handler, or, with
  // none, to the browser; fireEvent returns false when the key was kept.
  it("lets Tab leave at the last segment when nobody takes the focus", () => {
    render(<TimeInput value="16:00" onChange={vi.fn()} timeFormat="12h" ariaLabel="End time" />);
    const input = screen.getByLabelText("End time") as HTMLInputElement;
    act(() => input.focus());
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
    expect(getSegment(input, "period")?.dataset.active).toBe("true");
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(true);
  });

  it("still hands the last segment's Tab to onAutoAdvance when there is one", () => {
    const onAutoAdvance = vi.fn();
    render(
      <TimeInput
        value="16:00"
        onChange={vi.fn()}
        timeFormat="12h"
        ariaLabel="Start time"
        onAutoAdvance={onAutoAdvance}
      />,
    );
    const input = screen.getByLabelText("Start time") as HTMLInputElement;
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
    expect(onAutoAdvance).toHaveBeenCalledWith("tab");
  });

  it("lets Shift+Tab leave at the hour segment when nobody takes the focus", () => {
    render(<TimeInput value="16:00" onChange={vi.fn()} timeFormat="12h" ariaLabel="Start time" />);
    const input = screen.getByLabelText("Start time") as HTMLInputElement;
    act(() => input.focus());
    // Focus lands on the hour segment, the field's first.
    expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(true);
  });

  it("moves from the end hour segment back to the start AM/PM segment with Shift+Tab", () => {
    const onChange = vi.fn();

    render(
      <div>
        <TimeInput
          value="16:15"
          onChange={onChange}
          timeFormat="12h"
          ariaLabel="Default start time"
        />
        <TimeInput
          value="18:45"
          onChange={onChange}
          timeFormat="12h"
          ariaLabel="Default end time"
          onAutoRetreat={() => {
            const startInput = screen.getByLabelText(
              "Default start time",
            ) as HTMLInputElement;
            startInput.dataset.autoSelectSegment = "period";
            startInput.focus();
            fireEvent.focus(startInput);
          }}
        />
      </div>,
    );

    const startInput = screen.getByLabelText("Default start time");
    const endInput = screen.getByLabelText(
      "Default end time",
    ) as HTMLInputElement;
    endInput.dataset.autoSelectSegment = "hour";
    fireEvent.focus(endInput);

    expect(getSegment(endInput, "hour")?.dataset.active).toBe("true");
    fireEvent.keyDown(endInput, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(startInput);
    expect(getSegment(startInput, "period")?.dataset.active).toBe("true");
  });

  it("wraps active segments with mouse wheel scrolling", () => {
    const onChange = vi.fn();

    render(
      <TimeInput
        value="12:59"
        onChange={onChange}
        timeFormat="12h"
        ariaLabel="Shift start"
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    act(() => input.focus());
    input.setSelectionRange(0, 0);
    fireEvent.click(input);

    fireEvent.wheel(input, { deltaY: -100 });
    expect(getSegment(input, "hour")?.textContent).toBe("01");
    expect(input.value).toBe("01:59 PM");
    expect(onChange).toHaveBeenLastCalledWith("13:59");

    input.setSelectionRange(3, 3);
    fireEvent.click(input);
    fireEvent.wheel(input, { deltaY: -100 });
    expect(getSegment(input, "minute")?.textContent).toBe("60");
    expect(input.value).toBe("01:00 PM");
    expect(onChange).toHaveBeenLastCalledWith("13:00");

    input.setSelectionRange(6, 6);
    fireEvent.click(input);
    fireEvent.wheel(input, { deltaY: -100 });
    expect(getSegment(input, "period")?.textContent).toBe("AM");
    expect(input.value).toBe("01:00 AM");
    expect(onChange).toHaveBeenLastCalledWith("01:00");
  });

  it("blocks page wheel scrolling while a segment selection is active", () => {
    const onChange = vi.fn();

    render(
      <TimeInput
        value="16:15"
        onChange={onChange}
        timeFormat="12h"
        ariaLabel="Shift start"
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    act(() => input.focus());
    input.setSelectionRange(6, 6);
    fireEvent.click(input);

    const activeWheel = new WheelEvent("wheel", {
      deltaY: -100,
      cancelable: true,
      bubbles: true,
    });
    fireEvent(input, activeWheel);
    expect(activeWheel.defaultPrevented).toBe(true);

    fireEvent.blur(input);

    const inactiveWheel = new WheelEvent("wheel", {
      deltaY: -100,
      cancelable: true,
    });
    fireEvent(document, inactiveWheel);
    expect(inactiveWheel.defaultPrevented).toBe(false);
  });

  it("leaves the wheel to the page when the pointer is outside the time input's window", () => {
    const onChange = vi.fn();

    render(
      <>
        <section role="dialog" aria-label="Add shift">
          <TimeInput value="16:15" onChange={onChange} timeFormat="12h" ariaLabel="Shift start" />
        </section>
        <div data-testid="grid">Grid</div>
      </>,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    act(() => input.focus());
    input.setSelectionRange(0, 0);
    fireEvent.click(input);
    onChange.mockClear();

    const outsideWheel = new WheelEvent("wheel", { deltaY: -100, cancelable: true, bubbles: true });
    fireEvent(screen.getByTestId("grid"), outsideWheel);
    expect(outsideWheel.defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("04:15 PM");

    const insideWheel = new WheelEvent("wheel", { deltaY: -100, cancelable: true, bubbles: true });
    fireEvent(screen.getByRole("dialog"), insideWheel);
    expect(insideWheel.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it("renders 24h times without an AM/PM segment", () => {
    const onChange = vi.fn();

    render(
      <TimeInput
        value="17:00"
        onChange={onChange}
        timeFormat="24h"
        ariaLabel="Shift start"
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    expect(input.value).toBe("17:00");
    expect(getSegment(input, "hour")?.textContent).toBe("17");
    expect(getSegment(input, "minute")?.textContent).toBe("00");
    expect(getSegment(input, "period")).toBeNull();

    fireEvent.change(input, { target: { value: "0715" } });
    expect(onChange).toHaveBeenLastCalledWith("07:15");
  });

  // BL-613: in 24h, two hour digits used to move on before the minutes.
  it.each([
    ["two-digit hour", ["1", "4", "3", "0"], "14:30"],
    ["one-digit hour", ["9", "4", "5"], "09:45"],
  ])("waits for both minute digits before moving on in 24h (%s)", (_label, keys, expected) => {
    const onChange = vi.fn();
    const onAutoAdvance = vi.fn();

    render(
      <TimeInput
        value=""
        onChange={onChange}
        timeFormat="24h"
        ariaLabel="Shift start"
        onAutoAdvance={onAutoAdvance}
      />,
    );

    const input = screen.getByLabelText("Shift start") as HTMLInputElement;
    act(() => input.focus());
    for (const key of keys.slice(0, -1)) {
      fireEvent.keyDown(input, { key });
      expect(onAutoAdvance).not.toHaveBeenCalled();
    }
    expect(getSegment(input, "minute")?.dataset.active).toBe("true");

    fireEvent.keyDown(input, { key: keys.at(-1)! });
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expect(onAutoAdvance).toHaveBeenCalledTimes(1);
    expect(onAutoAdvance).toHaveBeenCalledWith("typing");
  });
});

function getSegment(
  input: HTMLElement,
  segment: "hour" | "minute" | "period",
): HTMLElement | null {
  return (
    input.parentElement?.querySelector(`[data-time-segment="${segment}"]`) ??
    null
  );
}

// AVAIL-002 e2e: a whole time arriving at once (paste, browser autofill)
// completes the field and moves on; leaving it must keep the new time, not
// write the old one back.
describe("TimeInput: a whole time at once, then auto-advance", () => {
  it("keeps the time it was given when it moves focus on", () => {
    const onChange = vi.fn();
    const next = document.createElement("input");
    document.body.append(next);
    render(
      <TimeInput
        ariaLabel="Start time"
        value="09:00"
        timeFormat="12h"
        onChange={onChange}
        onAutoAdvance={() => next.focus()}
      />,
    );
    const start = screen.getByLabelText("Start time") as HTMLInputElement;
    start.focus();
    fireEvent.change(start, { target: { value: "6:00 PM" } });
    expect(document.activeElement).toBe(next);
    expect(onChange).toHaveBeenLastCalledWith("18:00");
    expect(onChange).not.toHaveBeenCalledWith("09:00");
    next.remove();
  });
});
