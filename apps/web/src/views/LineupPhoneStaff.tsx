import { ConfirmButton } from "@newfork/ui";
import { ArrowLeftRight, X } from "lucide-react";
import { useId } from "react";
import { createPortal } from "react-dom";

import { lineupRowRef, type LineupLocation, type LineupRow, type LineupShift } from "../schedule/lineup";
import type { LineupEdit } from "../schedule/lineup-data";
import type { ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { WindowAlert } from "../shell/WindowAlert";
import { HoursChange } from "./LineupDesktop";
import { EditableRowCells, useWindowKeys, type LineupEditing } from "./LineupDesktopEdit";
import { useStaffEdit } from "./LineupDesktopStaff";
import { LineupPersonCircle } from "./LineupPersonCircle";

// LINEUP-EDIT W3b: the phone's person panel (the design's phone E, personLayer, frame.css .ph-acts): a tap on a row of
// a draft that hasn't started opens it as a sheet from the bottom. Replace… opens the same list as a name on the
// desktop; Call off takes two taps (Mert 2026-10-20). W2b: the desktop row's fields, two by two, each change sent at once.

/** One person on the lineup, from a tap on her row: who she is, her row's fields, and Replace…, Call off and Done. */
export function PersonSheet({
  row,
  location,
  shift,
  editing,
  timeFormat,
  onReplace,
  onManageSections,
  onClose,
}: {
  /** As the day read has her now: each change shows once the day is read again. */
  readonly row: LineupRow;
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly editing: LineupEditing;
  readonly timeFormat: ScheduleTimeFormat;
  readonly onReplace: () => void;
  /** "Manage sections…" in the Section list: the Sections sheet over this one. */
  readonly onManageSections: () => void;
  readonly onClose: () => void;
}) {
  const { run, refused } = useStaffEdit(editing);
  const titleId = useId();
  // The panel itself takes the focus: In, its first field, would bring up the keyboard.
  const { box, keys } = useWindowKeys(onClose, { toField: false });
  return createPortal(
    <div className="lineup-edit-layer is-sheet" role="presentation">
      <div className="lineup-edit-scrim" aria-hidden onClick={onClose} />
      <section
        ref={box}
        className="lineup-edit-dlg is-sheet lineup-person-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keys}
      >
        <header>
          <div className="lineup-person-who">
            <LineupPersonCircle name={row.name} artKey={row.artKey} />
            <div>
              <h2 id={titleId}>{row.name}</h2>
              <p>{[row.jobName, shift.name, location.name].join(" · ")}</p>
            </div>
          </div>
          <button type="button" className="lineup-edit-x" aria-label="Close" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <div className="lineup-edit-dlg-body lineup-person-body">
          <EditableRowCells
            row={row}
            location={location}
            shift={shift}
            editing={editing}
            timeFormat={timeFormat}
            onManageSections={onManageSections}
            panel
          >
            {row.changed.length ? (
              <p className="lineup-person-chg">
                <i className="lineup-phone-changed" aria-hidden />
                <span>Changed in this lineup only. The Schedule doesn't change.</span>
                <HoursChange row={row} timeFormat={timeFormat} />
              </p>
            ) : null}
          </EditableRowCells>
        </div>
        <footer className="lineup-person-acts">
          <WindowAlert message={refused} />
          <button type="button" className="lineup-person-repl" aria-haspopup="dialog" onClick={onReplace}>
            <ArrowLeftRight size={16} aria-hidden />
            Replace…
          </button>
          <ConfirmButton
            unstyled
            className="lineup-staff-off"
            confirmLabel="Click again to call off"
            confirmName={`Click again to call off ${row.name}`}
            aria-label={`Call off ${row.name}`}
            onConfirm={() => run({ ...shift.publish.target, action: "call_off", row: lineupRowRef(row) } as LineupEdit, onClose)}
          >
            Call off
          </ConfirmButton>
          <button type="button" className="nf-button lineup-person-done" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
