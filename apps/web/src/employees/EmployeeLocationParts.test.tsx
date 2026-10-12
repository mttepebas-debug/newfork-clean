import type { EmployeeSummary } from "@newfork/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmployeeLocationCell, EmployeeLocationChips } from "./EmployeeLocationParts";

// FB-6.2.8 A: the Employees list says "No location" in a chip, in the location
// column and under the name on the phone. EMP-001: that is the only chip; a
// manager manages where they are assigned, which the column already says.

const kadikoy = { id: "11000000-0000-4000-8000-000000000001", name: "Kadikoy", primary: true };
const besiktas = { id: "11000000-0000-4000-8000-000000000002", name: "Besiktas", primary: false };
const moda = { id: "11000000-0000-4000-8000-000000000003", name: "Moda", primary: false };
const row = (patch: Partial<EmployeeSummary>) =>
  ({
    locations: [kadikoy],
    ...patch,
  }) as EmployeeSummary;
const nowhere = row({ locations: [] });

describe("the Employees list's location cell", () => {
  it("shows where they work, with the count of the others, and no chip", () => {
    const { container } = render(<EmployeeLocationCell employee={row({ locations: [kadikoy, besiktas, moda] })} />);
    expect(screen.getByText("Kadikoy")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
    expect(container.querySelectorAll(".employee-chip")).toHaveLength(0);
  });

  it("names the first location for somebody with no primary, the owner: Kadikoy +1, never Unassigned (BL-428, G3)", () => {
    const { container } = render(
      <EmployeeLocationCell employee={row({ locations: [{ ...besiktas }, { ...kadikoy, primary: false }] })} />,
    );
    expect(container.querySelector(".employee-location-name")?.textContent).toBe("Besiktas");
    expect(screen.getByText("+1")).toBeTruthy();
    expect(screen.queryByText("Unassigned")).toBeNull();
  });

  it("says No location for somebody assigned nowhere, and nothing else", () => {
    const { container } = render(<EmployeeLocationCell employee={nowhere} />);
    expect(screen.getByText("No location")).toBeTruthy();
    expect(container.querySelectorAll(".employee-chip")).toHaveLength(1);
  });
});

describe("the chips under the name (phone)", () => {
  it("are empty for somebody with a location", () => {
    const { container } = render(<EmployeeLocationChips employee={row({})} />);
    expect(container.textContent).toBe("");
  });

  it("repeat No location", () => {
    const { container } = render(<EmployeeLocationChips employee={nowhere} />);
    expect(container.textContent).toBe("No location");
  });
});
