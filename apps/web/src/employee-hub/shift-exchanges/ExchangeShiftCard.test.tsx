import { cleanup, render, screen } from "@testing-library/react";
import type { ExchangeShift } from "@newfork/shared";
import { afterEach, describe, expect, it } from "vitest";
import { ExchangeShiftCard, shiftHours } from "./ExchangeShiftCard";
import { exchangeTimeDetails } from "./exchange-time-details";

afterEach(cleanup);
const shift: ExchangeShift = {
  id: "shift",
  source_id: "source",
  location_id: "location",
  location_name: "Dining",
  job_id: "job",
  job_name: "Server",
  timezone: "America/Los_Angeles",
  time_timezone: "America/Los_Angeles",
  scheduled_date: "2026-11-01",
  start_time: "00:30",
  end_time: "02:30",
  starts_at: "2026-11-01T07:30:00Z",
  ends_at: "2026-11-01T10:30:00Z",
  employee_id: "employee",
  employee_name: "Alex",
  time_basis: "explicit",
};
describe("Exchange shift physical time", () => {
  it("explains the autumn clock change and its three actual hours", () => {
    render(<ExchangeShiftCard shift={shift} />);
    expect(screen.getByText(/3 scheduled hours/)).toBeTruthy();
    expect(screen.getByText(/Clock change during this shift/)).toBeTruthy();
    expect(screen.getByText("12:30 AM UTC-07:00")).toBeTruthy();
    expect(screen.getByText("2:30 AM UTC-08:00")).toBeTruthy();
    expect(screen.queryByText(/Ends next day/)).toBeNull();
  });
  it("explains the spring jump without charging two hours for one elapsed hour", () => {
    const spring = {
      ...shift,
      scheduled_date: "2027-03-14",
      start_time: "01:30",
      end_time: "03:30",
      starts_at: "2027-03-14T09:30:00Z",
      ends_at: "2027-03-14T10:30:00Z",
    };
    render(<ExchangeShiftCard shift={spring} />);
    expect(shiftHours(spring)).toBe(1);
    expect(screen.getByText("1:30 AM UTC-08:00")).toBeTruthy();
    expect(screen.getByText("3:30 AM UTC-07:00")).toBeTruthy();
  });
  it("identifies the second repeated 1:30 even when both endpoints use the same offset", () => {
    render(
      <ExchangeShiftCard
        shift={{
          ...shift,
          start_time: "01:30",
          starts_at: "2026-11-01T09:30:00Z",
        }}
      />,
    );
    expect(screen.getByText(/uses a repeated clock time/)).toBeTruthy();
    expect(
      screen.getByText("1:30 AM UTC-08:00 · Second occurrence"),
    ).toBeTruthy();
  });
  it("distinguishes the first occurrence using the saved instant", () => {
    render(
      <ExchangeShiftCard
        shift={{
          ...shift,
          start_time: "01:30",
          starts_at: "2026-11-01T08:30:00Z",
        }}
      />,
    );
    expect(
      screen.getByText("1:30 AM UTC-07:00 · First occurrence"),
    ).toBeTruthy();
    expect(screen.getByText(/2 scheduled hours/)).toBeTruthy();
  });
  it("handles a thirty-minute repeated clock and the actual chosen occurrence", () => {
    const lordHowe = {
      ...shift,
      timezone: "Australia/Lord_Howe",
      time_timezone: "Australia/Lord_Howe",
      scheduled_date: "2027-04-04",
      start_time: "01:45",
      end_time: "02:15",
      starts_at: "2027-04-03T15:15:00Z",
      ends_at: "2027-04-03T15:45:00Z",
    };
    expect(exchangeTimeDetails(lordHowe)?.repeatedClock).toBe(true);
    expect(exchangeTimeDetails(lordHowe)?.startLabel).toBe("1:45 AM UTC+10:30");
    expect(shiftHours(lordHowe)).toBe(0.5);
  });
  it("keeps the saved timezone when location metadata changes", () => {
    render(
      <ExchangeShiftCard shift={{ ...shift, timezone: "America/New_York" }} />,
    );
    expect(screen.getByText("Pacific Time")).toBeTruthy();
    expect(screen.getByText("12:30 AM UTC-07:00")).toBeTruthy();
    expect(screen.queryByText(/New York/)).toBeNull();
  });
  it("marks ordinary overnight hours without a clock-change warning", () => {
    render(
      <ExchangeShiftCard
        shift={{
          ...shift,
          scheduled_date: "2026-12-01",
          start_time: "22:00",
          end_time: "02:00",
          starts_at: "2026-12-02T06:00:00Z",
          ends_at: "2026-12-02T10:00:00Z",
        }}
      />,
    );
    expect(screen.getByText(/Ends next day/)).toBeTruthy();
    expect(screen.getByText(/4 scheduled hours/)).toBeTruthy();
    expect(screen.queryByLabelText("Clock change details")).toBeNull();
  });
  it("does not invent clock details for invalid saved times", () => {
    expect(exchangeTimeDetails({ ...shift, starts_at: "invalid" })).toBeNull();
    expect(
      exchangeTimeDetails({ ...shift, time_timezone: "Unknown/Zone" }),
    ).toBeNull();
  });
});
