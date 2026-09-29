import type { EmployeeDetail, EmployeeSummary } from "@newfork/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { v8 } from "../dev/fb628-variants";
import {
  FooterRemoveGroup,
  LocationCellVariant,
  ManagedLocationsVariant,
  WorkLocationCards,
} from "./Fb628Variants";

// FB-6.2.8 DEV variants: the switch stays off unless asked, and each variant
// says what the rules need said (a manager's Terminate is there but off).

const kadikoy = { id: "b100aaae-89a2-4adc-a99f-d04e5982ed04", name: "Kadikoy", removable: true };
const emre = {
  first_name: "Emre",
  preferred_name: "",
  primary_location_id: kadikoy.id,
  archived_at: null,
  locations: [kadikoy],
  managed_locations: [],
  allowed: { terminate: false },
} as unknown as EmployeeDetail;

const row = (patch: Partial<EmployeeSummary>) =>
  ({
    primary_location_name: "Kadikoy",
    location_count: 1,
    managed_location_names: [],
    ...patch,
  }) as EmployeeSummary;

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

describe("v8 switch", () => {
  it("is off without the param and remembers a letter for the tab", () => {
    expect(v8()).toBeNull();
    window.history.replaceState(null, "", "/?v8=b");
    expect(v8()).toBe("b");
    window.history.replaceState(null, "", "/app/employee-hub");
    expect(v8()).toBe("b");
    window.history.replaceState(null, "", "/?v8=off");
    expect(v8()).toBeNull();
  });
});

describe("Remove from a location", () => {
  it("C: arms on the first click, removes on the second, Terminate stays off", () => {
    const onRemove = vi.fn();
    render(<WorkLocationCards detail={emre} removingLocationId={null} onRemove={onRemove} />);
    const terminate = screen.getByRole("button", { name: "Terminate employee" }) as HTMLButtonElement;
    expect(terminate.disabled).toBe(true);
    expect(screen.getByText(/Only an admin or the owner can terminate/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Kadikoy" }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove from Kadikoy" }));
    expect(onRemove).toHaveBeenCalledWith(kadikoy.id);
  });

  it("B: the bottom bar offers only the locations the reader may take them off", () => {
    const detail = {
      ...emre,
      locations: [kadikoy, { id: "0dac2422-83a5-49b6-9d3f-80c66e08bda3", name: "Besiktas", removable: false }],
    } as EmployeeDetail;
    render(<FooterRemoveGroup detail={detail} removingLocationId={null} onRemove={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Remove from Kadikoy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove from Besiktas" })).toBeNull();
  });
});

describe("Manages and No location in the list", () => {
  it.each(["a", "b", "c"] as const)("%s: says No location and Manages", (variant) => {
    const { unmount } = render(
      <LocationCellVariant variant={variant} employee={row({ primary_location_name: null, location_count: 0 })} />,
    );
    expect(screen.getAllByText(/No location/).length).toBeGreaterThan(0);
    unmount();
    render(
      <LocationCellVariant variant={variant} employee={row({ primary_location_name: "Besiktas", managed_location_names: ["Kadikoy"] })} />,
    );
    expect(screen.getByText("Besiktas")).toBeTruthy();
    expect(screen.queryByText(/No location/)).toBeNull();
  });
});

describe("the admin's managed-locations field", () => {
  it.each(["a", "c"] as const)("%s: Save waits for a change and sends the whole list", (variant) => {
    const onSave = vi.fn();
    render(
      <ManagedLocationsVariant
        variant={variant}
        managed={[]}
        options={[{ id: kadikoy.id, name: "Kadikoy" }]}
        editable
        saving={false}
        onSave={onSave}
      />,
    );
    if (variant === "a") {
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(screen.getByRole("checkbox", { name: "Kadikoy" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith([kadikoy.id]);
  });

  it("b: adds from the menu and takes off with the chip's button", () => {
    const onSave = vi.fn();
    render(
      <ManagedLocationsVariant
        variant="b"
        managed={[{ id: kadikoy.id, name: "Kadikoy" }] as EmployeeDetail["managed_locations"]}
        options={[{ id: kadikoy.id, name: "Kadikoy" }]}
        editable
        saving={false}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop managing Kadikoy" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith([]);
  });
});
