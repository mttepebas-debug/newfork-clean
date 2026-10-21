import { useEffect, useRef } from "react";

/** "Delete selected shifts?": the strip's Delete asks before removing the selection. */
export function ScheduleDeleteSelectionDialog({
  open,
  count,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean;
  readonly count: number;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (event.key !== "Escape" && event.key !== "Enter") return;
      // BL-706: Enter on one of the window's own buttons is that button's
      // press ("Keep shifts" keeps them); the page does not hear it.
      if (
        event.key === "Enter" &&
        event.target instanceof HTMLButtonElement &&
        dialogRef.current?.contains(event.target)
      ) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === "Escape") onCancel();
      else onConfirm();
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel, onConfirm, open]);

  return open ? (
    <div className="schedule-discard-layer" role="presentation">
      <button
        type="button"
        className="schedule-discard-backdrop"
        aria-label="Cancel shift deletion"
        onClick={onCancel}
      />
      <section
        ref={dialogRef}
        className="schedule-discard-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="schedule-delete-selection-title"
        aria-describedby="schedule-delete-selection-description"
      >
        <header>
          <h2 id="schedule-delete-selection-title">
            Delete selected shifts?
          </h2>
          <p id="schedule-delete-selection-description">
            {count === 1
              ? "This removes the selected shift from the edit session."
              : `This removes ${count} selected shifts from the edit session.`}
          </p>
        </header>
        <footer>
          <button type="button" onClick={onCancel} autoFocus>
            Keep shifts
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Delete
          </button>
        </footer>
      </section>
    </div>
  ) : null;
}
