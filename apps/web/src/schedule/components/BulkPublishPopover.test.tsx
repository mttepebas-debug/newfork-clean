import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BulkPublishPopover } from "./BulkPublishPopover";

describe("BulkPublishPopover", () => {
  it("confirms bulk publishing with location breakdown and default-deny focus", async () => {
    const onConfirm = vi.fn();

    render(
      <BulkPublishPopover
        count={3}
        locationBreakdown={
          new Map([
            ["Main Dining", 2],
            ["Patio", 1],
          ])
        }
        isPublishing={false}
        onConfirm={onConfirm}
        trigger={<button type="button">Publish selected</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish selected" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Confirm publish 3 drafts",
    });

    expect(within(dialog).getByText("Publish 3 drafts?")).toBeTruthy();
    expect(within(dialog).getByText("Main Dining 2 · Patio 1")).toBeTruthy();
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancelButton));

    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps disabled bulk publish triggers closed", () => {
    render(
      <BulkPublishPopover
        count={0}
        locationBreakdown={new Map()}
        isPublishing={false}
        onConfirm={vi.fn()}
        disabled
        trigger={<button type="button">Publish selected</button>}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Publish selected" });

    expect(trigger).toHaveProperty("disabled", true);
    fireEvent.click(trigger);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("uses the reference ellipsis while publishing", () => {
    render(
      <BulkPublishPopover
        count={1}
        locationBreakdown={new Map()}
        isPublishing
        onConfirm={vi.fn()}
        trigger={<button type="button">Publish selected</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish selected" }));

    expect(screen.getByRole("button", { name: "Publishing…" })).toBeTruthy();
  });
});
