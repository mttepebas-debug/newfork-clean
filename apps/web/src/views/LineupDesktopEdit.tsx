import { Button, ConfirmButton } from "@newfork/ui";
import { Ban, Check, ClipboardCopy, GripVertical, MessageSquareText, Pencil, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { parseLineupTime, type LineupLocation, type LineupRow, type LineupShift } from "../schedule/lineup";
import { lineupEditMessage, useLineupEdit, useLineupSections, type LineupEdit } from "../schedule/lineup-data";
import { formatTime, type ScheduleTimeFormat } from "../schedule/lib/scheduleDateTime";
import { WindowAlert } from "../shell/WindowAlert";

// LINEUP-EDIT W2a (KARARLAR S-178 madde 1-4, ek 2-3, ek b; the design's F "after", yapim/masaustu/desk.js fRow,
// secCell, secLayer, notesPane): on a draft that hasn't started, a manager changes a row in place (Position, Label,
// In - Out, Section with "Other…" and Save to sections), the location's sections in the Sections window, and the notes.
// The Schedule never changes. Call off, Add Staff and Replace come with L3.

/** What the pickers offer: the workspace's positions and labels, and the positions each person is assigned to. */
export interface LineupEditCatalog {
  readonly jobs: readonly { readonly id: string; readonly name: string }[];
  readonly labels: readonly { readonly id: string; readonly name: string }[];
  readonly jobsOf: (employeeId: string) => readonly string[];
}

/** Editing, for someone who may change the day's lineups. */
export interface LineupEditing {
  readonly workspaceId: string | null;
  readonly date: string;
  readonly catalog: LineupEditCatalog;
}

const OTHER = "__other";
const MANAGE = "__manage";
const TYPED = "__typed";
const MANY = "__many";

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

/** One row, in place: Position, Label, In - Out and Section. A refusal shows under the field it is about. */
export function EditableRowCells({
  row,
  location,
  shift,
  editing,
  timeFormat,
  onManageSections,
  dot,
  children,
}: {
  readonly row: LineupRow;
  readonly location: LineupLocation;
  readonly shift: LineupShift;
  readonly editing: LineupEditing;
  readonly timeFormat: ScheduleTimeFormat;
  readonly onManageSections: () => void;
  /** The orange dot, right after Out. */
  readonly dot?: ReactNode;
  /** The hours change, under In - Out. */
  readonly children?: ReactNode;
}) {
  const edit = useLineupEdit(editing.workspaceId, editing.date);
  // A choice shows at once and holds until the day is read again (or the change is refused).
  const [shown, setShown] = useState<Partial<Record<"job" | "label" | "section", string>>>({});
  // Each field's refusal, under it: one change's answer never stands for another's.
  const [refused, setRefused] = useState<Partial<Record<string, string>>>({});
  const which = row.lineupOnly && row.rowId ? { row_id: row.rowId } : { source_shift_id: row.sourceShiftId ?? row.shiftId };
  // In and Out go together: the one not typed goes as last typed, until the day is read again with nothing on its
  // way (the review of 6ec3afb16: Out sent while In was on its way must not put the old In back).
  const latest = useRef(row);
  latest.current = row;
  const going = useRef(0);
  const times = useRef({ start: row.startTime, end: row.endTime });
  useEffect(() => {
    if (!going.current) times.current = { start: row.startTime, end: row.endTime };
  }, [row.startTime, row.endTime]);

  function send(field: string, fields: Record<string, unknown>, show?: { key: "job" | "label" | "section"; value: string }) {
    setRefused((now) => ({ ...now, [field]: undefined }));
    if (show) setShown((now) => ({ ...now, [show.key]: show.value }));
    going.current += 1;
    edit
      .mutateAsync({ ...shift.publish.target, action: "set_row", row: { ...which, ...fields } } as LineupEdit)
      .catch((error: unknown) => setRefused((now) => ({ ...now, [field]: lineupEditMessage(error) })))
      .finally(() => {
        going.current -= 1;
        if (show) setShown((now) => ({ ...now, [show.key]: undefined }));
        if (!going.current) times.current = { start: latest.current.startTime, end: latest.current.endTime };
      });
  }
  function sendTime(field: "start" | "end", time: string) {
    times.current = { ...times.current, [field]: time };
    send(field, { starts: times.current.start, ends: times.current.end });
  }

  const mine = new Set(editing.catalog.jobsOf(row.employeeId));
  const assigned = editing.catalog.jobs.filter((job) => mine.has(job.id));
  const others = editing.catalog.jobs.filter((job) => !mine.has(job.id));
  const job = shown.job ?? row.jobId ?? "";
  // More than one label (a Schedule shift can carry several): shown together, until one is chosen.
  const many = row.labelIds.length > 1;
  const label = shown.label ?? (many ? MANY : (row.labelIds[0] ?? ""));
  const note = (field: string) =>
    refused[field] ? (
      <em className="lineup-edit-msg" role="alert">
        {refused[field]}
      </em>
    ) : null;

  return (
    <>
      <span className="lineup-desk-cell lineup-edit-cell">
        <select
          className="lineup-edit-sel"
          aria-label={`Position, ${row.name}`}
          value={job}
          onChange={(event) => send("job", { job_id: event.target.value }, { key: "job", value: event.target.value })}
        >
          {job && !editing.catalog.jobs.some((item) => item.id === job) ? <option value={job}>{row.jobName}</option> : null}
          {assigned.length ? (
            <optgroup label={`Assigned to ${firstName(row.name)}`}>
              {assigned.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {others.length ? (
            <optgroup label="Other positions">
              {others.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        {note("job")}
      </span>
      <span className="lineup-desk-cell lineup-edit-cell">
        <select
          className="lineup-edit-sel"
          aria-label={`Label, ${row.name}`}
          value={label}
          onChange={(event) => {
            const choice = event.target.value;
            if (choice === MANY) return;
            send("label", { label_ids: choice ? [choice] : [] }, { key: "label", value: choice });
          }}
        >
          <option value="">None</option>
          {many ? <option value={MANY}>{row.labels.join(", ")}</option> : null}
          {label && label !== MANY && !editing.catalog.labels.some((item) => item.id === label) ? (
            <option value={label}>{row.labels[0] ?? "Label"}</option>
          ) : null}
          {editing.catalog.labels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {note("label")}
      </span>
      <span className="lineup-desk-cell lineup-desk-time lineup-edit-time">
        <span className="lineup-edit-tline">
          <TimeField
            row={row}
            field="start"
            timeFormat={timeFormat}
            refused={refused.start ?? null}
            onTime={(time) => sendTime("start", time)}
          />
          <span className="lineup-edit-dash">–</span>
          <TimeField
            row={row}
            field="end"
            timeFormat={timeFormat}
            refused={refused.end ?? null}
            onTime={(time) => sendTime("end", time)}
          />
          {dot}
        </span>
        {children}
      </span>
      <span className="lineup-desk-cell lineup-edit-cell">
        <SectionField
          row={row}
          location={location}
          shown={shown.section}
          onSection={(id) => send("section", { section_id: id }, { key: "section", value: id ?? "" })}
          onTyped={(name, save) => send("section", { section_name: name, save_section: save })}
          onManage={onManageSections}
        />
        {note("section")}
      </span>
    </>
  );
}

/** In or Out as typed: read on Enter or when it loses focus; what isn't a time says so under it and is not sent. */
function TimeField({
  row,
  field,
  timeFormat,
  refused,
  onTime,
}: {
  readonly row: LineupRow;
  readonly field: "start" | "end";
  readonly timeFormat: ScheduleTimeFormat;
  readonly refused: string | null;
  readonly onTime: (time: string) => void;
}) {
  const value = field === "start" ? row.startTime : row.endTime;
  const [text, setText] = useState(() => formatTime(value, timeFormat, "long"));
  const [wrong, setWrong] = useState(false);
  useEffect(() => {
    setText(formatTime(value, timeFormat, "long"));
    setWrong(false);
  }, [value, timeFormat]);
  function read() {
    const time = parseLineupTime(text, value);
    if (!time) {
      setWrong(true);
      return;
    }
    setWrong(false);
    setText(formatTime(time, timeFormat, "long"));
    if (time !== value) onTime(time);
  }
  const message = wrong ? "Use a time like 4:30 PM" : refused;
  return (
    <span className="lineup-edit-t1">
      <input
        className={`lineup-edit-inp${message ? " is-err" : ""}`}
        aria-label={`${field === "start" ? "In" : "Out"}, ${row.name}`}
        aria-invalid={message ? true : undefined}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={read}
        onKeyDown={(event) => {
          if (event.key === "Enter") read();
          if (event.key === "Escape") {
            setText(formatTime(value, timeFormat, "long"));
            setWrong(false);
          }
        }}
      />
      {message ? (
        <em className="lineup-edit-msg" role="alert">
          {message}
        </em>
      ) : null}
    </span>
  );
}

/** Section: the location's list, None, "Other…" (a name for this lineup only) and "Manage sections…". */
function SectionField({
  row,
  location,
  shown,
  onSection,
  onTyped,
  onManage,
}: {
  readonly row: LineupRow;
  readonly location: LineupLocation;
  readonly shown: string | undefined;
  readonly onSection: (id: string | null) => void;
  readonly onTyped: (name: string, save: boolean) => void;
  readonly onManage: () => void;
}) {
  const [other, setOther] = useState<{ readonly name: string; readonly save: boolean } | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (other) input.current?.focus();
  }, [other !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = !row.sectionId && row.sectionName ? row.sectionName : null;
  const value = shown ?? row.sectionId ?? (typed ? TYPED : "");

  if (other) {
    const name = other.name.trim();
    const use = () => {
      if (!name || name.length > 40) return;
      setOther(null);
      onTyped(name, other.save);
    };
    return (
      <span className="lineup-edit-other">
        <span className="lineup-edit-other-in">
          <input
            ref={input}
            className="lineup-edit-inp is-sec"
            placeholder="Section name"
            aria-label={`New section, ${row.name}`}
            maxLength={40}
            value={other.name}
            onChange={(event) => setOther({ ...other, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") use();
              if (event.key === "Escape") setOther(null);
            }}
          />
          <button type="button" className="lineup-edit-mini is-ok" aria-label="Use this section" disabled={!name} onClick={use}>
            <Check size={15} strokeWidth={2.4} aria-hidden />
          </button>
          <button type="button" className="lineup-edit-mini" aria-label="Cancel" onClick={() => setOther(null)}>
            <X size={15} aria-hidden />
          </button>
        </span>
        <label className="lineup-edit-save">
          <input type="checkbox" checked={other.save} onChange={(event) => setOther({ ...other, save: event.target.checked })} /> Save
          to sections
        </label>
      </span>
    );
  }
  return (
    <select
      className="lineup-edit-sel"
      aria-label={`Section, ${row.name}`}
      value={value}
      onChange={(event) => {
        const choice = event.target.value;
        if (choice === OTHER) setOther({ name: "", save: false });
        else if (choice === MANAGE) onManage();
        else if (choice !== TYPED) onSection(choice || null);
      }}
    >
      <option value="">None</option>
      {typed ? <option value={TYPED}>{typed} · today only</option> : null}
      {location.sections.map((section) => (
        <option key={section.id} value={section.id}>
          {section.name}
        </option>
      ))}
      <option value={OTHER}>Other…</option>
      <option disabled>──────────</option>
      <option value={MANAGE}>Manage sections…</option>
    </select>
  );
}

/** How many people the day's lineups at the location have on a section. */
function usedToday(location: LineupLocation, sectionId: string): number {
  return location.shifts.reduce(
    (sum, shift) =>
      sum +
      shift.departments.reduce(
        (inDepartment, department) =>
          inDepartment + department.jobs.reduce((inJob, job) => inJob + job.rows.filter((row) => row.sectionId === sectionId).length, 0),
        0,
      ),
    0,
  );
}

/**
 * The Sections window (S-178 madde 4, ek 3; the design's secLayer): the location's sections, renamed in place,
 * dragged (or Alt and an arrow key) into order, deleted with two clicks, and added at the foot.
 */
export function SectionsWindow({
  editing,
  location,
  onClose,
}: {
  readonly editing: LineupEditing;
  readonly location: LineupLocation;
  readonly onClose: () => void;
}) {
  const change = useLineupSections(editing.workspaceId, editing.date);
  const [refused, setRefused] = useState<string | null>(null);
  const [added, setAdded] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const titleId = useId();
  const box = useRef<HTMLElement | null>(null);
  const latest = useRef(onClose);
  latest.current = onClose;
  const sections = location.sections;

  // Focus goes in when it opens and back to what opened it (the gear) when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input")?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  // Its own keys, after the field's: Escape in a changed name puts the name back first; Tab stays inside.
  function keys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      latest.current();
      return;
    }
    if (event.key !== "Tab" || !box.current) return;
    const focusable = [...box.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function run(input: Parameters<typeof change.mutate>[0], after?: () => void) {
    setRefused(null);
    change.mutate(input, { onSuccess: after, onError: (error) => setRefused(lineupEditMessage(error)) });
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= sections.length || from === to) return;
    const ids = sections.map((section) => section.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id!);
    run({ action: "reorder", location_id: location.id, section_ids: ids });
  }
  function add() {
    const name = added.trim();
    if (!name) return;
    run({ action: "add", location_id: location.id, name }, () => setAdded(""));
  }

  return createPortal(
    <div className="lineup-edit-layer" role="presentation">
      <div className="lineup-edit-scrim" aria-hidden onClick={onClose} />
      {/* tabIndex -1: a click on its empty part keeps the focus in it, so its keys still work. */}
      <section
        ref={box}
        className="lineup-edit-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keys}
      >
        <header>
          <div>
            <h2 id={titleId}>Sections · {location.name}</h2>
            <p>
              The names in every Section list at {location.name}. Renaming changes today's lineups too. Deleting takes it off draft
              lineups; a published lineup keeps it until you Edit it.
            </p>
          </div>
          <button type="button" className="lineup-edit-x" aria-label="Close" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <div className="lineup-edit-dlg-body">
          {sections.length ? (
            <ul className="lineup-edit-secs">
              {sections.map((section, index) => (
                <li
                  key={section.id}
                  className={`lineup-edit-sec${dragged === index ? " is-drag" : ""}`}
                  draggable
                  onDragStart={() => setDragged(index)}
                  onDragEnd={() => setDragged(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragged !== null) move(dragged, index);
                    setDragged(null);
                  }}
                >
                  <button
                    type="button"
                    className="lineup-edit-grip"
                    aria-label={`Move ${section.name}. Alt and arrow keys`}
                    title="Drag to reorder"
                    onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                      event.preventDefault();
                      move(index, index + (event.key === "ArrowUp" ? -1 : 1));
                    }}
                  >
                    <GripVertical size={16} aria-hidden />
                  </button>
                  <SectionName
                    name={section.name}
                    onRename={(name) => run({ action: "rename", location_id: location.id, section_id: section.id, name })}
                  />
                  <span className="lineup-edit-use">
                    {(() => {
                      const used = usedToday(location, section.id);
                      return used ? `${used} ${used === 1 ? "person" : "people"} today` : "Not used today";
                    })()}
                  </span>
                  <ConfirmButton
                    unstyled
                    className="lineup-edit-del"
                    confirmLabel="Click again to delete"
                    confirmName={`Click again to delete ${section.name}`}
                    aria-label={`Delete ${section.name}`}
                    onConfirm={() => run({ action: "remove", location_id: location.id, section_id: section.id })}
                  >
                    Delete
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lineup-edit-none">No sections yet. Add the first one below.</p>
          )}
        </div>
        <div className="lineup-edit-sec-add">
          <input
            className="lineup-edit-box"
            placeholder="New section"
            aria-label="New section"
            maxLength={40}
            value={added}
            onChange={(event) => setAdded(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
            }}
          />
          <Button className="secondary-button" disabled={!added.trim()} onClick={add}>
            <Plus size={16} aria-hidden />
            Add
          </Button>
        </div>
        <footer>
          <span className="lineup-edit-dlg-alert">
            <WindowAlert message={refused} />
          </span>
          <Button onClick={onClose}>Done</Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/** A section's name, renamed on Enter or when it loses focus; Escape puts it back. */
function SectionName({ name, onRename }: { readonly name: string; readonly onRename: (name: string) => void }) {
  const [text, setText] = useState(name);
  useEffect(() => setText(name), [name]);
  const save = () => {
    const next = text.trim();
    if (!next || next === name) {
      setText(name);
      return;
    }
    onRename(next);
  };
  return (
    <input
      className="lineup-edit-box"
      aria-label="Section name"
      maxLength={40}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") save();
        // A changed name goes back; an unchanged one lets Escape close the window.
        if (event.key === "Escape" && text !== name) {
          event.stopPropagation();
          setText(name);
        }
      }}
    />
  );
}

const NOTE_FIELDS = [
  ["specials", "Specials", Sparkles, "Tonight's specials", 500],
  ["n86", "86s", Ban, "What's sold out", 500],
  ["shift_notes", "Shift notes", MessageSquareText, "Anything the team should know", 1000],
] as const;
type NoteKey = (typeof NOTE_FIELDS)[number][0];

/** Edit notes (S-178 ek b; the design's notesPane): the three notes in place; only the ones changed are sent. */
export function NotesEditor({
  editing,
  shift,
  onDone,
}: {
  readonly editing: LineupEditing;
  readonly shift: LineupShift;
  readonly onDone: () => void;
}) {
  const edit = useLineupEdit(editing.workspaceId, editing.date);
  const [values, setValues] = useState<Record<NoteKey, string>>(() => ({ ...shift.publish.notes }));
  const [refused, setRefused] = useState<string | null>(null);
  const first = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => first.current?.focus(), []);
  const changed = NOTE_FIELDS.filter(([key]) => values[key] !== shift.publish.notes[key]).map(([key]) => key);
  return (
    <section className="lineup-notes lineup-edit-notes" aria-label="Edit notes">
      {NOTE_FIELDS.map(([key, label, Icon, placeholder, max], index) => (
        <label className={`lineup-note is-${key}`} key={key}>
          <h3>
            <Icon aria-hidden />
            {label}
          </h3>
          <textarea
            ref={index === 0 ? first : undefined}
            className="lineup-edit-ta"
            rows={key === "shift_notes" ? 3 : 2}
            placeholder={placeholder}
            maxLength={max}
            value={values[key]}
            onChange={(event) => setValues({ ...values, [key]: event.target.value })}
          />
        </label>
      ))}
      <div className="lineup-edit-notes-acts">
        {refused ? (
          <span className="lineup-edit-msg" role="alert">
            {refused}
          </span>
        ) : (
          <span>Staff see the notes when you publish.</span>
        )}
        <Button className="secondary-button" disabled={edit.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={edit.isPending}
          onClick={() => {
            if (!changed.length) {
              onDone();
              return;
            }
            setRefused(null);
            edit.mutate(
              {
                ...shift.publish.target,
                action: "set_notes",
                notes: Object.fromEntries(changed.map((key) => [key, values[key]])),
              } as LineupEdit,
              { onSuccess: onDone, onError: (error) => setRefused(lineupEditMessage(error)) },
            );
          }}
        >
          {edit.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}

/** "Edit notes", over the notes of a lineup that can change. */
export function EditNotesButton({ onEdit }: { readonly onEdit: () => void }) {
  return (
    <div className="lineup-edit-notes-head">
      <button type="button" className="lineup-edit-add" onClick={onEdit}>
        <Pencil size={15} aria-hidden />
        Edit notes
      </button>
    </div>
  );
}

/** Copy as text (S-178 ek b): the lineup for the people without the app, on the clipboard; "Copied" for a moment. */
export function CopyTextButton({ text }: { readonly text: () => string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="lineup-edit-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text()).catch(() => undefined);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check size={14} aria-hidden /> : <ClipboardCopy size={14} aria-hidden />}
      {copied ? "Copied" : "Copy as text"}
    </button>
  );
}
