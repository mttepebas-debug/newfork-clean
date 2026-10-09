import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleTopBarFilter } from "./ScheduleTopBarFilter";

const items = [
  { id: "server", label: "Server", color: "#4478A8" },
  { id: "bartender", label: "Bartender", color: "#7A5DA8" },
  { id: "cook", label: "Line Cook", color: "#A85D4A" },
];

describe("ScheduleTopBarFilter", () => {
  it("matches the reference filter selection behavior with simple menu rows", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ScheduleTopBarFilter
        filterId="jobs"
        allLabel="All jobs"
        singularLabel="job"
        pluralLabel="jobs"
        icon={null}
        items={items}
        selectedIds={[]}
        onChange={onChange}
        open
        onOpenChange={vi.fn()}
      />,
    );

    const server = screen.getByRole("checkbox", { name: "Server" });
    expect(server.className).toContain("schedule-topbar-filter-item");

    fireEvent.click(server);
    expect(onChange).toHaveBeenLastCalledWith(["server"]);

    rerender(
      <ScheduleTopBarFilter
        filterId="jobs"
        allLabel="All jobs"
        singularLabel="job"
        pluralLabel="jobs"
        icon={null}
        items={items}
        selectedIds={["server"]}
        onChange={onChange}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Bartender" }));
    expect(onChange).toHaveBeenLastCalledWith(["server", "bartender"]);

    rerender(
      <ScheduleTopBarFilter
        filterId="jobs"
        allLabel="All jobs"
        singularLabel="job"
        pluralLabel="jobs"
        icon={null}
        items={items}
        selectedIds={["server", "bartender"]}
        onChange={onChange}
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Line Cook" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("exposes grouped filter sections with reference group semantics", () => {
    const onChange = vi.fn();
    render(
      <ScheduleTopBarFilter
        filterId="jobs"
        allLabel="All jobs"
        singularLabel="job"
        pluralLabel="jobs"
        icon={null}
        items={items}
        groups={[
          { id: "front", label: "Front of house", items: items.slice(0, 2) },
          { id: "kitchen", label: "Kitchen", items: items.slice(2) },
        ]}
        selectedIds={["server"]}
        onChange={onChange}
        open
        onOpenChange={vi.fn()}
      />,
    );

    const frontGroup = screen.getByRole("group", { name: "Front of house" });
    const kitchenGroup = screen.getByRole("group", { name: "Kitchen" });

    expect(frontGroup).toBeTruthy();
    expect(kitchenGroup).toBeTruthy();
    expect(
      screen
        .getByRole("checkbox", { name: "Front of house" })
        .getAttribute("aria-checked"),
    ).toBe("mixed");

    fireEvent.click(screen.getByRole("checkbox", { name: "Front of house" }));

    expect(onChange).toHaveBeenLastCalledWith(["server", "bartender"]);
  });
});
