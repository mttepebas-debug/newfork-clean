import { NotebookPen } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";

export interface ScheduleNoteCell {
  readonly locationId: string;
  readonly employeeId: string;
  readonly date: string;
}

/**
 * A manager's note met while placing a shift (M12, S2 B): a card under the
 * cell that asks once, then leaves no trace on the grid.
 */
const CARD_HALF = 150; // .schedule-note-confirm is 300px wide, centred on `left`.
const GAP = 8;

/**
 * Where the card's centre goes: under its cell, clamped to the screen; when
 * that would cover the open editor, beside it on whichever side has room
 * (left first). A phone's editor leaves no side free: the card stays put.
 */
export function noteCardCentreX(cellCentre: number, editor: DOMRect | undefined, viewport: number): number {
  const x = Math.min(Math.max(cellCentre, CARD_HALF + 10), viewport - CARD_HALF - 10);
  if (!editor || x + CARD_HALF <= editor.left || x - CARD_HALF >= editor.right) return x;
  const left = editor.left - GAP - CARD_HALF;
  if (left - CARD_HALF >= GAP) return left;
  const right = editor.right + GAP + CARD_HALF;
  if (right + CARD_HALF <= viewport - GAP) return right;
  return x;
}

export function ScheduleNoteConfirm({ cell, when, by = null, employeeName, text, disabled = false, onPlace, onCancel }: {
  readonly cell: ScheduleNoteCell;
  /** "Wed after 6:00 PM" (formatNoteWhen). */
  readonly when: string;
  /** "KadıköyMüdür1 · Sep 28" (formatNoteBy); no line without it. */
  readonly by?: string | null;
  readonly employeeName: string;
  readonly text: string;
  readonly disabled?: boolean;
  readonly onPlace: () => void;
  readonly onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Same keyboard as the rule box: focus on Cancel and back when the card
  // closes, Escape cancels.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  // From the moment the card is drawn, as the rule box (BL-757).
  useLayoutEffect(() => {
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
  const editor = document.querySelector("[data-shift-quick-editor-content]")?.getBoundingClientRect();
  const x = noteCardCentreX(rect ? rect.left + rect.width / 2 : window.innerWidth / 2, editor, window.innerWidth);
  const y = rect ? rect.bottom + GAP : window.innerHeight / 2;
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
      style={{ left: x, top: Math.min(y, window.innerHeight - 200) }}
      onSubmit={submit}
    >
      <span className="schedule-shift-note-card-head">
        <NotebookPen size={12} aria-hidden /> Manager note · {when}
      </span>
      <p>{text || `A manager noted these hours for ${employeeName.trim().split(/\s+/)[0]}.`}</p>
      {by ? <small className="schedule-note-confirm-by">{by}</small> : null}
      <footer>
        <button ref={cancelRef} type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={disabled}>Place shift</button>
      </footer>
    </form>,
    document.body,
  );
}
