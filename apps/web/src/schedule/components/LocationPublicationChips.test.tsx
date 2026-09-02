import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationPublicationChips } from "./LocationPublicationChips";

const statuses = [
  {
    id: "loc-1",
    name: "Main Dining",
    color: "#2563eb",
    status: "published" as const,
    reason: "live" as const,
    published_shift_count: 5,
  },
  {
    id: "loc-2",
    name: "Patio",
    color: "#16a34a",
    status: "unpublished" as const,
    reason: "worked_shifts_kept" as const,
    published_shift_count: 0,
    worked_shift_count: 2,
  },
];

describe("LocationPublicationChips", () => {
  it("renders live and worked-kept chips and forwards clicks", () => {
    const onLocationClick = vi.fn();

    render(
      <LocationPublicationChips
        statuses={statuses}
        selectedLocationIds={["loc-1"]}
        onLocationClick={onLocationClick}
      />,
    );

    const live = screen.getByRole("button", { name: "Main Dining live" });
    const historical = screen.getByRole("button", { name: "Patio worked kept" });

    expect(live.textContent).toContain("5");
    expect(live.getAttribute("data-active")).toBe("true");
    expect(historical.textContent).toContain("2");
    expect(historical.getAttribute("data-active")).toBe("false");

    fireEvent.click(live);
    expect(onLocationClick).toHaveBeenCalledWith("loc-1");
  });

  it("does not invent a zero count when worked count is unavailable", () => {
    render(
      <LocationPublicationChips
        statuses={[
          {
            id: "loc-3",
            name: "Bar",
            color: "#64748b",
            status: "unpublished",
            reason: "not_live",
            published_shift_count: 0,
          },
        ]}
        selectedLocationIds={[]}
        onLocationClick={vi.fn()}
      />,
    );

    const chip = screen.getByRole("button", { name: "Bar not live" });

    expect(chip.textContent).toBe("Bar");
  });
});
