import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocationTimezoneField } from "./LocationTimezoneField";
import { apiRequest } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({ supabaseClient: {}, apiRequest: vi.fn() }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(401); });
describe("Location timezone field", () => {
  it("preserves a saved timezone and never replaces it from the postal code", async () => {
    const onChange = vi.fn();
    render(<LocationTimezoneField country="US" postal="90012" value="America/New_York" onChange={onChange} />);
    await tick(); expect(apiRequest).not.toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled();
  });
  it("uses the suggestion for an empty location", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ timezone: "America/Los_Angeles", status: "suggested" });
    const onChange = vi.fn();
    render(<LocationTimezoneField country="US" postal="90012" value="" onChange={onChange} />);
    await tick(); expect(onChange).toHaveBeenCalledWith("America/Los_Angeles");
  });
  it("ignores a late response after manual selection", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(apiRequest).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const onChange = vi.fn();
    render(<LocationTimezoneField country="US" postal="90012" value="" onChange={onChange} />);
    await tick(); fireEvent.change(screen.getByRole("combobox"), { target: { value: "Europe/London" } });
    await act(async () => finish({ timezone: "America/Los_Angeles", status: "suggested" }));
    expect(onChange.mock.calls).toEqual([["Europe/London"]]);
  });
  it("ignores older postal requests and invalidates the previous automatic value", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(apiRequest).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({ timezone: "America/New_York", status: "suggested" });
    const onChange = vi.fn();
    const { rerender } = render(<LocationTimezoneField country="US" postal="90012" value="" onChange={onChange} />);
    await tick();
    rerender(<LocationTimezoneField country="US" postal="10001" value="" onChange={onChange} />);
    await tick();
    await act(async () => finish({ timezone: "America/Los_Angeles", status: "suggested" }));
    expect(onChange.mock.calls).toEqual([["America/New_York"]]);
    rerender(<LocationTimezoneField country="US" postal="1" value="America/New_York" onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith("");
  });
  it("keeps the selector usable when suggestion fails", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
    const onChange = vi.fn();
    render(<LocationTimezoneField country="US" postal="90012" value="" onChange={onChange} />);
    await tick(); expect(screen.getByRole("status").textContent).toContain("unavailable");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Europe/London" } });
    expect(onChange).toHaveBeenCalledWith("Europe/London");
  });
});
