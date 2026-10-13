import { readFileSync } from "node:fs";

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
    expect(locationDot?.style.backgroundColor).toBe("var(--theme-swatch-fallback)");
    expect(screen.getByText("3 live shifts will be removed")).toBeTruthy();
    expect(screen.queryByText("Patio")).toBeNull();
    expect(screen.queryByText("Chef Counter")).toBeNull();
    expect(screen.queryByText("Private Dining")).toBeNull();
    // C-D15: plain words, and no line that contradicts another: publishing
    // again brings the shifts back, so nothing says it cannot be undone.
    expect(screen.getByText("Employees stop seeing these shifts right away.")).toBeTruthy();
    expect(
      screen.getByText(
        "Active cover and swap requests for removed shifts will be closed.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No schedule-change notification is sent.")).toBeTruthy();
    expect(screen.getByText("Publish again to bring these shifts back.")).toBeTruthy();
    expect(screen.queryByText(/cannot be undone|unworked/)).toBeNull();

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
    fireEvent.click(screen.getByRole("button", { name: "Unpublish 1 location" }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm unpublish" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith([locations[0]!.id]),
    );
  });

  it("counts locations and live shifts in the singular and the plural (BL-311)", () => {
    render(
      <UnpublishScheduleDialog
        open
        weekLabel="Aug 17 - Aug 23, 2026"
        locations={locations}
        statuses={[
          statuses[0]!,
          { id: locations[2]!.id, status: "published" as const, published_shift_count: 1 },
        ]}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("3 live shifts will be removed")).toBeTruthy();
    expect(screen.getByText("1 live shift will be removed")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Main Dining/));
    expect(screen.getByRole("button", { name: "Unpublish 1 location" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Chef Counter/));
    expect(screen.getByRole("button", { name: "Unpublish 2 locations" })).toBeTruthy();
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

  // BL-305: the Week card was 24px narrower than the boxes under it, and the
  // four Schedule windows closed with an X in two sizes.
  it("lines the Week card up with the boxes below and closes like the other windows", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const padding = (selector: string) =>
      new RegExp(`\n${selector} \{[^}]*?padding: ([^;]+);`).exec(styles)?.[1];
    expect(padding("\.schedule-unpublish-dialog > header")).toBe("20px 24px");
    expect(padding("\.schedule-unpublish-body")).toBe("20px 24px");

    const closeSizes = ["UnpublishScheduleDialog", "SaveDraftDialog", "PublishScheduleDialog"].map(
      (file) => /<X size=\{(\d+)\}/.exec(readFileSync(`src/schedule/components/${file}.tsx`, "utf8"))?.[1],
    );
    expect(closeSizes).toEqual(["18", "18", "18"]);
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
    const hidden = screen.getByText("Employees stop seeing these shifts right away.").closest("div")!;
    expect(hidden.getAttribute("data-destructive")).toBe("true");
    const requests = screen
      .getByText("Active cover and swap requests for removed shifts will be closed.")
      .closest("div")!;
    expect(requests.querySelector(".lucide-triangle-alert")).toBeTruthy();
    // C-D15: publishing again is how it is undone, a note rather than a warning.
    const again = screen.getByText("Publish again to bring these shifts back.").closest("div")!;
    expect(again.getAttribute("data-destructive")).not.toBe("true");
    expect(again.querySelector(".lucide-triangle-alert")).toBeNull();
  });
});
