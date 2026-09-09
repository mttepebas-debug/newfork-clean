import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeOffPeriods } from "./TimeOffPeriods";

describe("TimeOffPeriods", () => {
  it("shows exact requested hours, decisions and their saved time zone", () => {
    render(<TimeOffPeriods timeFormat="12h" periods={[
      { id: "10000000-0000-4000-8000-000000000001", segment_date: "2035-11-04", start_time: "23:00:01", end_time: "02:00:02", ends_next_day: true, status: "approved", time_timezone: "America/New_York", time_source: "snapshot", fold_choices: { end_fold: "later" } },
      { id: "10000000-0000-4000-8000-000000000002", segment_date: "2035-11-05", start_time: null, end_time: null, status: "denied", time_timezone: "UTC", time_source: "legacy_location" },
    ]} />);
    expect(screen.getByText("2035-11-04 · 11:00:01 PM–2:00:02 AM (+1 day)")).toBeTruthy();
    expect(screen.getByText("Approved · America/New_York")).toBeTruthy();
    expect(screen.getByText("End: second occurrence.")).toBeTruthy();
    expect(screen.getByText("2035-11-05 · Full day")).toBeTruthy();
    expect(screen.getByText("Declined · UTC")).toBeTruthy();
    expect(screen.getByText(/no original time-zone snapshot was recorded/)).toBeTruthy();
  });
  it("distinguishes partial leave from revoked historical approvals", () => {
    const periods = [{ id: "10000000-0000-4000-8000-000000000001", segment_date: "2035-01-15", start_time: "10:00", end_time: "17:00", status: "approved" as const, time_timezone: "UTC", decision_pieces: [
      { id: "10000000-0000-4000-8000-000000000002", starts_at: "2035-01-15T10:00:00Z", ends_at: "2035-01-15T12:00:00Z", status: "approved" as const, time_timezone: "UTC" },
      { id: "10000000-0000-4000-8000-000000000003", starts_at: "2035-01-15T12:00:00Z", ends_at: "2035-01-15T17:00:00Z", status: "denied" as const, time_timezone: "UTC" },
    ] }];
    const view = render(<TimeOffPeriods periods={periods} timeFormat="24h" requestStatus="partially_approved" />);
    expect(screen.getByText("Partially approved · UTC")).toBeTruthy();
    expect(screen.getByLabelText("Decision pieces for 2035-01-15").children).toHaveLength(2);
    view.rerender(<TimeOffPeriods periods={periods} timeFormat="24h" requestStatus="revoked" />);
    expect(screen.getByText("Revoked · No longer approved leave · UTC")).toBeTruthy();
    expect(screen.getByText("Previously approved")).toBeTruthy();
  });
});
