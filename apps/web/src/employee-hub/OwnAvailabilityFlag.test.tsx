// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { OwnAvailabilityFlag } from "./OwnAvailabilityFlag";

afterEach(cleanup);

describe("the employee's own flag on a shift they marked unavailable", () => {
  it("says it plainly and offers the swap and the time off form", () => {
    render(<MemoryRouter><OwnAvailabilityFlag when="Mon after 6:00 PM" shiftId="shift-1" /></MemoryRouter>);
    const flag = screen.getByRole("note");
    expect(flag.textContent).toContain("You marked Mon after 6:00 PM unavailable.");
    expect(flag.textContent).toContain("You're scheduled, so the shift is yours.");
    expect(screen.getByRole("link", { name: "Swap or give up" }).getAttribute("href"))
      .toBe("/app/employee-hub/shift-hub?offer=shift-1");
    expect(screen.getByRole("link", { name: "Request time off" }).getAttribute("href"))
      .toBe("/app/employee-hub/my-availability?section=time-off");
  });
});
