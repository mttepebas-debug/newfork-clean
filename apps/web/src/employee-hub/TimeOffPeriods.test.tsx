import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeOffPeriods } from "./TimeOffPeriods";

describe("TimeOffPeriods", () => {
  it("shows exact requested hours, decisions and their saved time zone, by name (BL-512)", () => {
    render(<TimeOffPeriods timeFormat="12h" periods={[
      { id: "10000000-0000-4000-8000-000000000001", segment_date: "2035-11-04", start_time: "23:00:01", end_time: "02:00:02", ends_next_day: true, status: "approved", time_timezone: "America/New_York", fold_choices: { end_fold: "later" } },
      { id: "10000000-0000-4000-8000-000000000002", segment_date: "2035-11-05", start_time: null, end_time: null, status: "denied", time_timezone: "UTC" },
    ]} />);
    expect(screen.getByText("Sun, Nov 4 · 11:00:01 PM–2:00:02 AM (+1 day)")).toBeTruthy();
    expect(screen.getByText("Approved · Eastern Time")).toBeTruthy();
    expect(screen.getByText("End: second occurrence.")).toBeTruthy();
    expect(screen.getByText("Mon, Nov 5 · Full day")).toBeTruthy();
    expect(screen.getByText("Declined · UTC")).toBeTruthy();
  });
  it("names an approval that was later revoked, with no partial approval left (FB-6.3.7)", () => {
    const periods = [{ id: "10000000-0000-4000-8000-000000000001", segment_date: "2035-01-15", start_time: "10:00", end_time: "17:00", status: "approved" as const, time_timezone: "UTC" }];
    const view = render(<TimeOffPeriods periods={periods} timeFormat="24h" requestStatus="approved" />);
    expect(screen.getByText("Approved · UTC")).toBeTruthy();
    view.rerender(<TimeOffPeriods periods={periods} timeFormat="24h" requestStatus="revoked" />);
    expect(screen.getByText("Revoked · No longer approved leave · UTC")).toBeTruthy();
    expect(screen.queryByText(/Partially approved/)).toBeNull();
  });
});
