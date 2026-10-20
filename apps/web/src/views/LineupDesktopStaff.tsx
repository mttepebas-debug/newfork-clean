import type { LineupCandidates } from "@newfork/shared";
import { ConfirmButton } from "@newfork/ui";
import { ArrowLeftRight, Search, UserPlus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { lineupRowRef, type LineupLocation, type LineupRow, type LineupShift } from "../schedule/lineup";
import { lineupEditMessage, useLineupCandidates, useLineupEdit, type LineupEdit } from "../schedule/lineup-data";
import { publishedAt } from "../schedule/LineupPublishWindow";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { WindowAlert } from "../shell/WindowAlert";
import { useWindowKeys, type LineupEditing } from "./LineupDesktopEdit";
import { LineupPersonCircle } from "./LineupPersonCircle";

// LINEUP-EDIT W3a (S-178 madde 5-7; the design's F, yapim/masaustu/desk.js outGroups, pickLayer, doPick, undoRep):
// on a draft that hasn't started, Call off and Call in, Add Staff from a department's heading, Replace from a name,
// and Undo. Call off takes two clicks (Mert 2026-10-20), as Add anyway does. The Schedule never changes.

function range(start: string, end: string, format: ScheduleTimeFormat): string {
  return `${formatTime(start, format, "long")} – ${formatTime(end, format, "long")}`;
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/**
 * One staff change: a refusal shows beside the button that sent it. A second press while one is on its way does
 * nothing; the button stays enabled, so the focus stays on it (and Escape still reaches the window).
 */
function useStaffEdit(editing: LineupEditing) {
  const edit = useLineupEdit(editing.workspaceId, editing.date);
  const [refused, setRefused] = useState<string | null>(null);
  const going = useRef(false);
  function run(change: LineupEdit, after?: () => void) {
    if (going.current) return;
    going.current = true;
    setRefused(null);
    edit
      .mutateAsync(change)
      .then(after, (error: unknown) => setRefused(lineupEditMessage(error)))
      .finally(() => (going.current = false));
  }
  return { run, refused };
}

function Refused({ message }: { readonly message: string | null }) {
  return message ? (
    <em className="lineup-edit-msg" role="alert">
      {message}
    </em>
  ) : null;
}

/** Call off, at the end of a row: two clicks; the person goes to Called off at the foot of the list. */
export function CallOffCell({
  row,
  shift,
  editing,
}: {
  readonly row: LineupRow;
  readonly shift: LineupShift;
  readonly editing: LineupEditing;
}) {
  const { run, refused } = useStaffEdit(editing);
  return (
    <span className="lineup-desk-cell lineup-staff-cell">
      <ConfirmButton
        unstyled
        className="lineup-staff-off"
        confirmLabel="Click again to call off"
        confirmName={`Click again to call off ${row.name}`}
        aria-label={`Call off ${row.name}`}
        onConfirm={() => run({ ...shift.publish.target, action: "call_off", row: lineupRowRef(row) } as LineupEdit)}
      >
        Call off
      </ConfirmButton>
      <Refused message={refused} />
    </span>
  );
}

/** The name of a row that can change: a click opens Replace. */
export function ReplaceName({ row, onReplace }: { readonly row: LineupRow; readonly onReplace: () => void }) {
  return (
    <button
      type="button"
      className="lineup-staff-name"
      aria-haspopup="dialog"
      title={`Replace ${row.name} with someone else`}
      onClick={onReplace}
    >
      {row.name}
    </button>
  );
}

/** Add Staff, at the right of a department's heading. */
export function AddStaffButton({ department, onAdd }: { readonly department: string; readonly onAdd: () => void }) {
  return (
    <button type="button" className="lineup-staff-add" aria-haspopup="dialog" aria-label={`Add Staff to ${department}`} onClick={onAdd}>
      <UserPlus size={16} aria-hidden />
      Add Staff
    </button>
  );
}

/** Called off, then Replaced, at the very foot of the list (Mert 2026-10-19 ~3:15 AM and ~3:30 AM). */
export function OutGroups({
  location,
  shift,
  timeFormat,
  editing,
}: {
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly timeFormat: ScheduleTimeFormat;
  readonly editing: LineupEditing | null;
}) {
  const { calledOff, replaced } = shift.out;
  return (
    <>
      {calledOff.length ? (
        <section className="lineup-phone-dept lineup-staff-out" aria-label="Called off">
          <h3>
            Called off<span>{calledOff.length}</span>
          </h3>
          <div className="lineup-phone-list">
            <ul aria-label="Called off">
              {calledOff.map((row) => (
                <li className="lineup-phone-row lineup-desk-row is-out" key={row.shiftId}>
                  <LineupPersonCircle name={row.name} />
                  <span className="lineup-desk-name">
                    <span className="lineup-phone-name">{row.name}</span>
                  </span>
                  <span className="lineup-desk-cell">{row.jobName}</span>
                  <span className="lineup-desk-cell">{row.labels.join(", ") || "—"}</span>
                  <span className="lineup-desk-cell is-muted">
                    Called off {publishedAt(row.calledOffAt, timeFormat, location.timezone)}
                  </span>
                  <span className="lineup-desk-cell">{row.sectionName || "—"}</span>
                  {editing ? (
                    <BackButton
                      editing={editing}
                      label="Call in"
                      name={`Call in ${row.name}`}
                      change={{ ...shift.publish.target, action: "call_in", row: lineupRowRef(row) } as LineupEdit}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
      {replaced.length ? (
        <section className="lineup-phone-dept lineup-staff-out" aria-label="Replaced">
          <h3>
            Replaced<span>{replaced.length}</span>
          </h3>
          <div className="lineup-phone-list">
            <ul aria-label="Replaced">
              {replaced.map(({ row, by }) => (
                <li className={`lineup-phone-row lineup-staff-rep${editing ? " is-edit" : ""}`} key={row.shiftId}>
                  <span className="lineup-staff-who">
                    <LineupPersonCircle name={row.name} />
                    <span className="lineup-phone-name">{row.name}</span>
                    <span className="lineup-staff-rep-ic" role="img" aria-label="replaced by">
                      <ArrowLeftRight size={18} aria-hidden />
                    </span>
                    {by ? (
                      <>
                        <LineupPersonCircle name={by.name} />
                        <span className="lineup-phone-name is-by">{by.name}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="lineup-desk-cell">
                    {row.jobName} · {range((by ?? row).startTime, (by ?? row).endTime, timeFormat)}
                  </span>
                  {editing && by?.rowId ? (
                    <BackButton
                      editing={editing}
                      label="Undo"
                      name={`Undo, put ${row.name} back`}
                      change={{ ...shift.publish.target, action: "undo_replace", row: { row_id: by.rowId } } as LineupEdit}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** Call in or Undo: one click, since each puts the person back. */
function BackButton({
  editing,
  label,
  name,
  change,
}: {
  readonly editing: LineupEditing;
  readonly label: string;
  readonly name: string;
  readonly change: LineupEdit;
}) {
  const { run, refused } = useStaffEdit(editing);
  return (
    <span className="lineup-desk-cell lineup-staff-cell">
      <button type="button" className="lineup-staff-back" aria-label={name} onClick={() => run(change)}>
        {label}
      </button>
      <Refused message={refused} />
    </span>
  );
}

/** Where the window adds someone: a department (Add Staff) or a person's place (Replace). */
export type StaffPlace =
  | { readonly kind: "add"; readonly department: { readonly id: string; readonly name: string } }
  | { readonly kind: "replace"; readonly row: LineupRow };

type Candidate = LineupCandidates["candidates"][number];

const GROUPS = [
  ["best_fit", "Best fit", "No shift today, assigned to {x}"],
  ["available", "Available", "Assigned to {x}, free for these hours"],
  ["consider", "Consider", "Free, but not assigned to {x}"],
  ["unavailable", "Unavailable", "Working somewhere else, or approved time off"],
] as const;

function span(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
}

/** Why the person is where she is, in the design's words. */
function why(candidate: Candidate, format: ScheduleTimeFormat): string {
  const reason = candidate.why;
  switch (reason.reason) {
    case "no_shift":
      return "No shift today";
    case "time_off":
      return "Approved time off";
    case "elsewhere":
      return `Working somewhere else · ${reason.location_name} ${reason.shift_name} · ${range(reason.start_time, reason.end_time, format)}`;
    case "overlap_here":
      return `${reason.shift_name} here · ${range(reason.start_time, reason.end_time, format)} · ${span(reason.overlap_minutes)} overlap`;
    case "other_shift":
      return `${reason.location_name ? `${reason.location_name} ${reason.shift_name}` : `${reason.shift_name} here`} · ${range(reason.start_time, reason.end_time, format)} · no overlap`;
  }
}

/**
 * Add Staff and Replace (S-178 madde 6-7; the design's pickLayer): the people who may fill the place, by the
 * server's score in four groups, with a search. Unavailable people take two clicks.
 */
export function StaffWindow({
  editing,
  location,
  shift,
  place,
  timeFormat,
  onClose,
}: {
  readonly editing: LineupEditing;
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly place: StaffPlace;
  readonly timeFormat: ScheduleTimeFormat;
  readonly onClose: () => void;
}) {
  const target = shift.publish.target;
  const query =
    place.kind === "add" ? { ...target, department_id: place.department.id } : { ...target, row: lineupRowRef(place.row) };
  const list = useLineupCandidates(editing.workspaceId, editing.date, query);
  const { run, refused } = useStaffEdit(editing);
  const [search, setSearch] = useState("");
  const titleId = useId();
  const { box, keys } = useWindowKeys(onClose);

  const what = place.kind === "add" ? place.department.name : place.row.jobName;
  const title = place.kind === "add" ? `Add Staff · ${place.department.name}` : `Replace ${place.row.name}`;
  const hours = list.data ? range(list.data.window.start_time, list.data.window.end_time, timeFormat) : null;
  const sub = [place.kind === "replace" ? place.row.jobName : null, location.name, shift.name, hours].filter(Boolean).join(" · ");
  const jobName = (id: string) => editing.catalog.jobs.find((job) => job.id === id)?.name ?? "Position";
  const words = search.trim().toLowerCase();
  const shown = (list.data?.candidates ?? []).filter((candidate) => !words || candidate.name.toLowerCase().includes(words));

  function pick(candidate: Candidate) {
    if (place.kind === "replace") {
      run({ ...target, action: "replace", row: lineupRowRef(place.row), person: { employee_id: candidate.employee_id } } as LineupEdit, onClose);
      return;
    }
    // Someone not assigned to the department joins as its first position; it changes on the row.
    const job =
      candidate.job_id ??
      editing.catalog.jobs
        .filter((item) => item.departmentId === place.department.id)
        .sort((a, b) => a.name.localeCompare(b.name, "en-US", { sensitivity: "base" }))[0]?.id;
    if (!job) return;
    run({ ...target, action: "add_person", person: { employee_id: candidate.employee_id, job_id: job } } as LineupEdit, onClose);
  }

  let body;
  if (list.isPending) body = <p className="lineup-edit-none">Loading people…</p>;
  else if (list.isError) body = <p className="lineup-edit-none">The list didn't load. Check your connection, then try again.</p>;
  else if (!shown.length) body = <p className="lineup-edit-none">No one matches.</p>;
  else
    body = GROUPS.map(([group, heading, hint]) => {
      const people = shown.filter((candidate) => candidate.group === group);
      if (!people.length) return null;
      return (
        <section className="lineup-staff-group" aria-label={heading} key={group}>
          <h3>
            {heading}
            <span>{people.length}</span>
            <small>{hint.replace("{x}", what)}</small>
          </h3>
          <ul>
            {people.map((candidate) => {
              const label = place.kind === "replace" ? "Replace" : "Add";
              return (
                <li className={`lineup-staff-cand${group === "unavailable" ? " is-u" : ""}`} key={candidate.employee_id}>
                  <LineupPersonCircle name={candidate.name} />
                  <span className="lineup-staff-cand-mid">
                    <b>{candidate.name}</b>
                    <span>
                      {candidate.job_ids.map((id, index) => (
                        <span key={id}>
                          {index ? ", " : ""}
                          {id === candidate.job_id && group !== "consider" ? <strong>{jobName(id)}</strong> : jobName(id)}
                        </span>
                      ))}
                      {candidate.job_ids.length ? " · " : ""}
                      {why(candidate, timeFormat)}
                    </span>
                  </span>
                  {group === "unavailable" ? (
                    <ConfirmButton
                      unstyled
                      className="lineup-staff-anyway"
                      confirmLabel={`Click again to ${label.toLowerCase()}`}
                      confirmName={`Click again to ${label.toLowerCase()} ${candidate.name}`}
                      aria-label={`${label} ${candidate.name} anyway`}
                      onConfirm={() => pick(candidate)}
                    >
                      {label} anyway
                    </ConfirmButton>
                  ) : (
                    <button
                      type="button"
                      className="nf-button lineup-staff-pick"
                      aria-label={`${label} ${candidate.name}`}
                      onClick={() => pick(candidate)}
                    >
                      {label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      );
    });

  return createPortal(
    <div className="lineup-edit-layer" role="presentation">
      <div className="lineup-edit-scrim" aria-hidden onClick={onClose} />
      <section
        ref={box}
        className="lineup-edit-dlg lineup-staff-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keys}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            <p>{sub}</p>
          </div>
          <button type="button" className="lineup-edit-x" aria-label="Close" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <label className="lineup-staff-search">
          <Search size={16} aria-hidden />
          <input placeholder="Search people" aria-label="Search people" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="lineup-edit-dlg-body">{body}</div>
        <footer>
          <WindowAlert message={refused} />
          <span className="lineup-staff-foot">
            {place.kind === "replace"
              ? `The new person takes ${firstName(place.row.name)}'s time, section and label. `
              : `People join as their position in ${place.department.name}; change it on the row. `}
            The Schedule doesn't change.
          </span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
