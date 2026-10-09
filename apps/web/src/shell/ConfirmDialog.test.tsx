import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, useConfirmDialog } from "./ConfirmDialog";

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
});
