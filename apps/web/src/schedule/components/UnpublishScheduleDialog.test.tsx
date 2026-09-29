import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnpublishScheduleDialog } from "./UnpublishScheduleDialog";

const locations = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Main Dining",
    timezone: "America/Los_Angeles",
    sort_order: 0,
    publication_status: "published" as const,
    published_at: "2026-08-17T12:00:00Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Patio",
    timezone: "America/Los_Angeles",
    sort_order: 1,
    publication_status: "unpublished" as const,
    published_at: null,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Chef Counter",
    timezone: "America/Los_Angeles",
    sort_order: 2,
    publication_status: "published" as const,
    published_at: "2026-08-17T12:00:00Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Private Dining",
    timezone: "America/Los_Angeles",
    sort_order: 3,
    publication_status: "published" as const,
    published_at: "2026-08-17T12:00:00Z",
  },
];
const statuses = [
  {
    id: locations[0]!.id,
    status: "published" as const,
    published_shift_count: 3,
  },
  {
    id: locations[2]!.id,
    status: "unpublished" as const,
    published_shift_count: 0,
  },
];

describe("UnpublishScheduleDialog", () => {
  it("renders the reference-style destructive confirmation", async () => {
    render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={statuses}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Unpublish schedule" });
    expect(dialog.className).toContain("schedule-unpublish-dialog");
    expect(screen.getByText("Live access")).toBeTruthy();
    expect(screen.getByText("Current live schedule")).toBeTruthy();
    expect(screen.getByText("Aug 17 - Aug 23, 2026")).toBeTruthy();
    expect(screen.getByText("Main Dining")).toBeTruthy();
    const locationDot = screen
      .getByText("Main Dining")
      .querySelector(".schedule-unpublish-location-dot") as HTMLElement | null;
    expect(locationDot).toBeTruthy();
    expect(locationDot?.style.backgroundColor).toBe("rgb(100, 116, 139)");
    expect(screen.getByText("3 live shifts will be removed")).toBeTruthy();
    expect(screen.queryByText("Patio")).toBeNull();
    expect(screen.queryByText("Chef Counter")).toBeNull();
    expect(screen.queryByText("Private Dining")).toBeNull();
    expect(
      screen.getByText("Employee visibility for unworked shifts stops immediately."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Active cover and swap requests for removed shifts will be closed.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No schedule-change notification is sent.")).toBeTruthy();
    expect(screen.getByText("This cannot be undone. Republish to restore.")).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
  });

  it("keeps cancel and confirm actions wired", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={statuses}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Unpublish 0 locations" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByLabelText(/Main Dining/));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish 1 locations" }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm unpublish" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith([locations[0]!.id]),
    );
  });

  it("stays open while an unpublish is sending (BL-301)", () => {
    const onOpenChange = vi.fn();
    render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={statuses}
        isUnpublishing
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Close unpublish dialog" }),
    );
    fireEvent.keyDown(screen.getByLabelText(/Main Dining/), { key: "Escape" });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on Escape even when a location checkbox has focus (BL-329)", () => {
    const onOpenChange = vi.fn();
    render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={statuses}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
      />,
    );

    const checkbox = screen.getByLabelText(/Main Dining/);
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the reference fallback action when no live status picker is available", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={[]}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.queryByText("Main Dining")).toBeNull();
    const confirm = screen.getByRole("button", { name: "Unpublish" });
    expect(confirm).toHaveProperty("disabled", false);

    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: "Confirm unpublish" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([]));
  });

  it("asks twice before unpublishing; Escape on the armed button disarms it (BL-306)", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={[]}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    const armed = screen.getByRole("button", { name: "Confirm unpublish" });
    fireEvent.keyDown(armed, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Unpublish" })).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("marks the consequences as warnings, not as green checks (BL-306)", () => {
    const { container } = render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={statuses}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const effects = container.querySelector(".schedule-unpublish-effects")!;
    expect(effects.querySelector(".lucide-circle-check")).toBeNull();
    const undo = screen
      .getByText("This cannot be undone. Republish to restore.")
      .closest("div")!;
    expect(undo.getAttribute("data-destructive")).toBe("true");
    expect(undo.querySelector(".lucide-triangle-alert")).toBeTruthy();
  });
});
