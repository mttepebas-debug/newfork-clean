import type { EmployeeSummary } from "@newfork/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmployeeLocationCell, EmployeeLocationChips } from "./EmployeeLocationParts";

// FB-6.2.8 A: the Employees list says "No location" and "Manages <location>"
// in one chip shape, in the location column and under the name on the phone.

const row = (patch: Partial<EmployeeSummary>) =>
  ({
    primary_location_name: "Kadikoy",
    location_count: 1,
    managed_location_names: [],
    ...patch,
  }) as EmployeeSummary;

describe("the Employees list's location cell", () => {
  it("shows where they work, with the count of the others", () => {
    render(<EmployeeLocationCell employee={row({ location_count: 3 })} />);
    expect(screen.getByText("Kadikoy")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.queryByText("No location")).toBeNull();
  });

  it("says No location for somebody who works and manages nowhere", () => {
    render(<EmployeeLocationCell employee={row({ primary_location_name: null, location_count: 0 })} />);
    expect(screen.getByText("No location")).toBeTruthy();
  });

  it("says Manages for a location they only manage, and no No location then", () => {
    render(
      <EmployeeLocationCell
        employee={row({ primary_location_name: null, location_count: 0, managed_location_names: ["Besiktas"] })}
      />,
    );
    expect(screen.getByText("Manages Besiktas")).toBeTruthy();
    expect(screen.queryByText("No location")).toBeNull();
  });

  it("puts Manages next to where they work", () => {
    render(<EmployeeLocationCell employee={row({ managed_location_names: ["Besiktas"] })} />);
    expect(screen.getByText("Kadikoy")).toBeTruthy();
    expect(screen.getByText("Manages Besiktas")).toBeTruthy();
  });
});

describe("the chips under the name (phone)", () => {
  it("are empty for somebody with a location and nothing managed", () => {
    const { container } = render(<EmployeeLocationChips employee={row({})} />);
    expect(container.textContent).toBe("");
  });

  it("repeat No location and Manages", () => {
    const { unmount } = render(
      <EmployeeLocationChips employee={row({ primary_location_name: null, location_count: 0 })} />,
    );
    expect(screen.getByText("No location")).toBeTruthy();
    unmount();
    render(<EmployeeLocationChips employee={row({ managed_location_names: ["Besiktas"] })} />);
    expect(screen.getByText("Manages Besiktas")).toBeTruthy();
  });
});
