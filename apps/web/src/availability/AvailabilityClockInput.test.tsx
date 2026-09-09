import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvailabilityClockInput, formatAvailabilityClock } from "./AvailabilityClockInput";
afterEach(cleanup);
describe("availability clock input", () => {
  it.each([["10am", "10:00"], ["5 pm", "17:00"], ["12am", "00:00"], ["12 PM", "12:00"], [" 9:15:01am ", "09:15:01"]])("accepts explicit free-hour notation %s", (text, canonical) => {
    const change = vi.fn();
    render(<AvailabilityClockInput value="09:00" timeFormat="12h" label="Clock" onChange={change} />);
    fireEvent.change(screen.getByLabelText("Clock"), { target: { value: text } });
    expect(change).toHaveBeenLastCalledWith(canonical);
    fireEvent.blur(screen.getByLabelText("Clock"));
    expect((screen.getByLabelText("Clock") as HTMLInputElement).value).toBe(formatAvailabilityClock(canonical, "12h"));
  });
  it.each(["0am", "13pm", "24am", "10:99am", "10", "10:"])("rejects ambiguous or invalid notation %s", text => {
    const change = vi.fn();
    render(<AvailabilityClockInput value="09:00" timeFormat="12h" label="Clock" onChange={change} />);
    fireEvent.change(screen.getByLabelText("Clock"), { target: { value: text } });
    expect(change).toHaveBeenLastCalledWith("");
    expect(screen.getByLabelText("Clock").getAttribute("aria-invalid")).toBe("true");
  });
  it("follows the organization format and keeps nonzero seconds", () => {
    expect(formatAvailabilityClock("00:00", "12h")).toBe("12:00 AM");
    expect(formatAvailabilityClock("12:00", "12h")).toBe("12:00 PM");
    expect(formatAvailabilityClock("17:00:01", "12h")).toBe("5:00:01 PM");
    expect(formatAvailabilityClock("17:00:01", "24h")).toBe("17:00:01");
  });
  it("emits canonical clocks and invalidates the parent while incomplete text remains visible", () => {
    const change = vi.fn();
    const view = render(<AvailabilityClockInput value="09:00" timeFormat="12h" label="Clock" onChange={change} />);
    fireEvent.change(screen.getByLabelText("Clock"), { target: { value: "1:05:02 PM" } });
    expect(change).toHaveBeenLastCalledWith("13:05:02");
    fireEvent.change(screen.getByLabelText("Clock"), { target: { value: "1:" } });
    expect(change).toHaveBeenLastCalledWith("");
    view.rerender(<AvailabilityClockInput value="" timeFormat="12h" label="Clock" onChange={change} />);
    expect((screen.getByLabelText("Clock") as HTMLInputElement).value).toBe("1:");
    expect(screen.getByLabelText("Clock").getAttribute("aria-invalid")).toBe("true");
  });
  it("preserves the canonical value on format changes and applies explicit reloads", () => {
    const change = vi.fn();
    const view = render(<AvailabilityClockInput value="17:00" timeFormat="12h" label="Clock" onChange={change} />);
    view.rerender(<AvailabilityClockInput value="17:00" timeFormat="24h" label="Clock" onChange={change} />);
    expect((screen.getByLabelText("Clock") as HTMLInputElement).value).toBe("17:00");
    view.rerender(<AvailabilityClockInput value="18:30" timeFormat="24h" label="Clock" onChange={change} />);
    expect((screen.getByLabelText("Clock") as HTMLInputElement).value).toBe("18:30");
    expect(change).not.toHaveBeenCalled();
  });
});
