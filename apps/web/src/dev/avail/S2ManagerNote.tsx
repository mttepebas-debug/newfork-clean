import { NotebookPen, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ScheduleConflictSheet } from "../../schedule/components/ScheduleConflictSheet";
import { jobs, people, scheduleModel, seedShifts, shift, week, type LabShift } from "./fixtures";
import { LabBanner, useVariant, type LabSet, type Variant } from "./lab";
import { ScheduleStage } from "./ScheduleStage";

export const s2Set: LabSet = {
  id: "s2",
  title: "Manager note while placing a shift",
  screen: "Schedule → edit → a shift on a day and hour a manager wrote a note for",
  variants: {
    a: { name: "Rule box", hint: "The same small box as the Warn rule, bottom centre, in the blue ink the app already uses for manager notes." },
    b: { name: "Note at the cell", hint: "The note card the grid already opens beside a shift, here beside the cell, with Cancel / Place shift." },
    c: { name: "Dialog", hint: "A small Schedule dialog in the middle of the screen. The most interrupting of the three." },
  },
};

const note = {
  person: "KadıköyGarson1",
  employeeId: people.garson1,
  day: week[2]!,
  when: "Wed after 6:00 PM",
  text: "Picks up her daughter from school on Wednesdays. Ask her before a closing shift.",
  by: "KadıköyMüdür1",
  on: "Sep 28",
};

// Only two cells ask: the note's cell, and an orange cell (the real Warn box, for contrast).
const warnCell = { employeeId: people.garson2, day: week[5]!, line: "KadıköyGarson2 is unavailable all day." };

type Pending = { readonly kind: "note" | "warn"; readonly employeeId: string; readonly day: string; readonly x: number; readonly y: number };

export function S2ManagerNote() {
  const variant = useVariant(s2Set);
  const [shifts, setShifts] = useState<LabShift[]>(() => seedShifts());
  const [pending, setPending] = useState<Pending | null>(null);
  const model = useMemo(() => scheduleModel(shifts), [shifts]);
  const place = (employeeId: string, day: string, warn = false) => {
    const job = employeeId === people.garson1 || employeeId === people.garson2 ? jobs.server : jobs.cook;
    setShifts((current) => [...current, shift(employeeId, job, day, "16:00", "23:00", warn)]);
    setPending(null);
  };
  return (
    <>
      <LabBanner set={s2Set} variant={variant}>
        <p>
          Try it: press + in <b>KadıköyGarson1 · Wed 21</b> (the note covers {note.when}; the cell shows nothing, M12).
          For contrast, + in <b>KadıköyGarson2 · Sat 24</b> opens today's Warn box. Elsewhere + places the shift at once.
          In the app the shift editor opens first; here + places a Dinner shift (4:00 – 11:00 PM) to reach the box.
        </p>
      </LabBanner>
      <ScheduleStage
        model={model}
        onCreate={(employeeId, day, point) => {
          if (!employeeId || pending) return;
          // The note card sits under the cell itself, wherever the press landed.
          const rect = document.querySelector(`.schedule-cell[data-employee-id="${employeeId}"][data-date="${day}"]`)?.getBoundingClientRect();
          const x = rect ? rect.left + rect.width / 2 : point?.x ?? window.innerWidth / 2;
          const y = rect ? rect.bottom - 18 : point?.y ?? window.innerHeight / 2;
          if (employeeId === note.employeeId && day === note.day) setPending({ kind: "note", employeeId, day, x, y });
          else if (employeeId === warnCell.employeeId && day === warnCell.day) setPending({ kind: "warn", employeeId, day, x, y });
          else place(employeeId, day);
        }}
      >
        {pending?.kind === "warn" ? (
          <ScheduleConflictSheet
            open
            tone="warning"
            messages={[warnCell.line]}
            description="Review these scheduling conflicts before placing the shift."
            submitLabel="Place shift"
            onSubmit={() => place(pending.employeeId, pending.day, true)}
            onDismiss={() => setPending(null)}
          />
        ) : null}
        {pending?.kind === "note" ? (
          <NoteConfirm variant={variant} at={pending} onPlace={() => place(pending.employeeId, pending.day)} onCancel={() => setPending(null)} />
        ) : null}
      </ScheduleStage>
    </>
  );
}

function NoteConfirm({ variant, at, onPlace, onCancel }: {
  readonly variant: Variant;
  readonly at: Pending;
  readonly onPlace: () => void;
  readonly onCancel: () => void;
}) {
  const footer = (
    <>
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="submit" className="primary">Place shift</button>
    </>
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onPlace();
  };
  if (variant === "a")
    return createPortal(
      <form role="dialog" aria-label="Manager note" className="schedule-conflict-sheet avail-note-sheet" onSubmit={submit}>
        <span className="schedule-conflict-sheet-accent" aria-hidden />
        <div className="schedule-conflict-sheet-body">
          <span className="schedule-conflict-sheet-icon" aria-hidden>
            <NotebookPen size={14} />
          </span>
          <div className="schedule-conflict-sheet-copy">
            <strong>Manager note</strong>
            <small>{note.person} · {note.when}</small>
            <p>{note.text}</p>
            <small>{note.by} · {note.on}</small>
            <footer>{footer}</footer>
          </div>
          <button type="button" className="schedule-conflict-sheet-close" aria-label="Close" onClick={onCancel}>
            <X size={13} aria-hidden />
          </button>
        </div>
      </form>,
      document.body,
    );
  if (variant === "b")
    return createPortal(
      <form
        role="dialog"
        aria-label="Manager note"
        className="schedule-shift-note-card avail-note-card"
        style={{ left: Math.min(Math.max(at.x, 160), window.innerWidth - 160), top: Math.min(at.y + 18, window.innerHeight - 200) }}
        onSubmit={submit}
      >
        <span className="schedule-shift-note-card-head">
          <NotebookPen size={12} aria-hidden /> Manager note · {note.when}
        </span>
        <p>{note.text}</p>
        <small className="avail-note-card-by">{note.by} · {note.on}</small>
        <footer className="avail-note-card-footer">{footer}</footer>
      </form>,
      document.body,
    );
  return createPortal(
    <div className="schedule-dialog-layer" role="presentation" data-schedule-quiet-dialog>
      <button type="button" className="schedule-dialog-backdrop" aria-label="Close dialog" onClick={onCancel} />
      <form className="schedule-dialog avail-note-dialog" role="dialog" aria-modal="true" aria-labelledby="avail-note-title" onSubmit={submit}>
        <header>
          <div className="schedule-quiet-dialog-heading">
            <h2 id="avail-note-title">Manager note for {note.person}</h2>
            <p>{note.when} · written by {note.by} on {note.on}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>
        <div className="schedule-publication-form">
          <blockquote className="avail-note-quote">{note.text}</blockquote>
          <div className="schedule-dialog-actions">
            <span className="schedule-publication-footer-summary">Wed, Oct 21 · 4:00 PM – 11:00 PM</span>
            {footer}
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
}
