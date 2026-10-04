import { NotebookPen } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { formatAvailabilityMarkDay } from "../lib/scheduleAvailabilityMark";

export interface ScheduleNoteCell {
  readonly locationId: string;
  readonly employeeId: string;
  readonly date: string;
}

/**
 * A manager's note met while placing a shift (M12, S2 B): a card under the
 * cell that asks once, then leaves no trace on the grid.
 */
export function ScheduleNoteConfirm({ cell, employeeName, text, disabled = false, onPlace, onCancel }: {
  readonly cell: ScheduleNoteCell;
  readonly employeeName: string;
  readonly text: string;
  readonly disabled?: boolean;
  readonly onPlace: () => void;
  readonly onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Same keyboard as the rule box: focus on Cancel, Escape cancels.
  useEffect(() => cancelRef.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Caught on window's capture pass and spent here, like an open shift
      // note: the Schedule's own Escape never closes the editor behind it.
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);
  // The cell's own box, never the pointer: the card sits under the cell it is about.
  const rect = document
    .querySelector(`.schedule-cell[data-location-id="${cell.locationId}"][data-employee-id="${cell.employeeId}"][data-date="${cell.date}"]`)
    ?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.bottom + 8 : window.innerHeight / 2;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onPlace();
  };
  return createPortal(
    <form
      role="dialog"
      aria-label={`Manager note for ${employeeName}`}
      className="schedule-shift-note-card schedule-note-confirm"
      // Same exemptions as the rule box: a press here never dismisses the editor or the grid selection.
      data-schedule-conflict-toast-content
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{ left: Math.min(Math.max(x, 160), window.innerWidth - 160), top: Math.min(y, window.innerHeight - 200) }}
      onSubmit={submit}
    >
      <span className="schedule-shift-note-card-head">
        <NotebookPen size={12} aria-hidden /> Manager note · {formatAvailabilityMarkDay(cell.date)}
      </span>
      <p>{text || `A manager noted these hours for ${employeeName.trim().split(/\s+/)[0]}.`}</p>
      <footer>
        <button ref={cancelRef} type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={disabled}>Place shift</button>
      </footer>
    </form>,
    document.body,
  );
}
