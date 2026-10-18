import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import { ConfirmDialog, useConfirmDialog } from "./ConfirmDialog";

// Requests → Time off: Deny opens a box with a note field inside the drawer (BL-656).
function DenyInDrawer({ onClose }: { onClose: () => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <CatalogDrawer label="Time off request" onClose={onClose}>
      <button type="button" onClick={() => setAsking(true)}>Deny</button>
      <ConfirmDialog
        open={asking}
        title="Deny this request?"
        confirmLabel="Deny"
        destructive
        onConfirm={() => setAsking(false)}
        onCancel={() => setAsking(false)}
      >
        <textarea aria-label="Note" autoFocus />
      </ConfirmDialog>
    </CatalogDrawer>
  );
}

function Asker({ onAnswer }: { onAnswer: (answer: boolean) => void }) {
  const { confirm, dialog } = useConfirmDialog();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void confirm({
            title: "Overwrite Week 40?",
            description: "This draft belongs to Ayşe.",
            confirmLabel: "Overwrite",
            destructive: true,
          }).then(onAnswer)
        }
      >
        Save
      </button>
      {dialog}
    </>
  );
}

describe("ConfirmDialog", () => {
  it("gives focus back to the button that opened it when a field took focus first, and Escape then closes the drawer (BL-656)", async () => {
    const onClose = vi.fn();
    render(<DenyInDrawer onClose={onClose} />);
    const deny = screen.getByRole("button", { name: "Deny" });
    deny.focus();

    fireEvent.click(deny);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Note" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(deny);

    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("answers true on the red button and false on Cancel or Escape, then returns focus", async () => {
    const onAnswer = vi.fn();
    render(<Asker onAnswer={onAnswer} />);
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();

    fireEvent.click(save);
    const box = screen.getByRole("alertdialog", { name: "Overwrite Week 40?" });
    expect(document.activeElement?.textContent).toBe("Cancel");
    expect(screen.getByRole("button", { name: "Overwrite" }).className).toContain("danger-button");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Overwrite" })));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    expect(box.isConnected).toBe(false);
    expect(document.activeElement).toBe(save);

    fireEvent.click(save);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(onAnswer).toHaveBeenLastCalledWith(false);

    fireEvent.click(save);
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps the answer disabled until the caller says it is ready", () => {
    render(
      <ConfirmDialog
        open
        title="Request changes to ID card?"
        confirmLabel="Request changes"
        confirmDisabled
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        <textarea aria-label="Note" autoFocus />
      </ConfirmDialog>,
    );
    expect(screen.getByRole("button", { name: "Request changes" })).toHaveProperty("disabled", true);
    expect(document.activeElement).toBe(screen.getByLabelText("Note"));
  });

  it("turns both buttons off while busy, as it always has, when no busy words are given", () => {
    render(<ConfirmDialog open busy title="Delete Week 40?" confirmLabel="Delete" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Delete" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", true);
  });

  // LINEUP-E-DESKTOP-EDIT (D2): a box whose answer works in place says so in its button and keeps the keyboard's
  // focus there; a second press, Cancel and Escape do nothing until it is done.
  it("works in its answer with busy words, keeping focus, and ignores presses until it is done", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open title="Edit Lunch lineup?" confirmLabel="Edit" busyLabel="Unpublishing…" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    const answer = screen.getByRole("button", { name: "Edit" });
    answer.focus();
    rerender(
      <ConfirmDialog open busy title="Edit Lunch lineup?" confirmLabel="Edit" busyLabel="Unpublishing…" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    const working = screen.getByRole("button", { name: "Unpublishing…" });
    expect(working).toBe(answer);
    expect(working).toHaveProperty("disabled", false);
    expect(working.getAttribute("aria-disabled")).toBe("true");
    expect(working.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(working);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(working);
    fireEvent.click(cancel);
    fireEvent.keyDown(working, { key: "Escape" });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    rerender(
      <ConfirmDialog open title="Edit Lunch lineup?" confirmLabel="Edit" busyLabel="Unpublishing…" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(working.getAttribute("aria-disabled")).toBeNull();
    expect(working.getAttribute("aria-busy")).toBeNull();
    fireEvent.click(working);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
