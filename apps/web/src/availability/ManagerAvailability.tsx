import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@newfork/ui";
import { ChevronRight, Copy, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import {
  emptyWeeklyPreference,
  preferenceIsEmpty,
  weeklyPreferenceSaveSchema,
  type WeeklyPreference,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
} from "@newfork/shared";
import { DayEditor } from "./DayEditor";
import { DaySheet } from "./DaySheet";
import { WeekRead } from "./WeekRead";
import {
  DISPLAY_DAYS,
  WEEKDAY_NAMES,
  changedDays,
  dayState,
  dayTone,
  firstName,
  noCopies,
  type Copies,
} from "./day-availability";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import "./manager-availability.css";

// Employees → drawer → Availability, and a person's page on the Availability
// page's phone view. Two tabs (KARARLAR "Müsaitlik tercih" 2): the employee's
// week, read only (M2: only they change it), and the manager's own notes. The
// notes keep today's four parts (Mert 2026-10-16, "işlev aynen"): the
// manager's own hours, On / Off, copying the employee's week and a note a day
// up to 1000 characters; one Save writes them. A person who is not an employee
// has no notes (KARARLAR "Müsaitlik notu yalnız çalışan için"). The drawer
// never asks before leaving (K7).

type Props = {
  model: WeeklyPreferenceRead;
  // M5: a save decides nothing about pending requests; nothing to review first.
  onSave: (command: WeeklyPreferenceSave) => Promise<WeeklyPreferenceRead>;
  /** BL-797: fetches the week someone saved first; Reload waits for it. */
  onReload?: () => Promise<WeeklyPreferenceRead | undefined>;
  /** The Availability page's phone view: "Availability" / "Manager notes". */
  short?: boolean;
};

type Tab = "employee" | "manager";

// Remount for another person, or when the notes go away: a private draft never
// follows the drawer to someone else.
export function ManagerAvailability(props: Props) {
  return <Tabs key={`${props.model.employee_id}:${props.model.manager != null}`} {...props} />;
}

function Tabs({ model, onSave, onReload, short = false }: Props) {
  const [tab, setTab] = useState<Tab>("employee");
  const [busy, setBusy] = useState(false);
  const tabId = useId();
  const hasNotes = model.manager != null;
  const noteCount = model.manager?.notes.filter((note) => note.trim()).length ?? 0;
  const week = (
    <WeekRead
      name={model.employee_name}
      submitted={model.employee.submitted}
      updatedAt={model.employee.updated_at}
      preference={model.employee.preference}
      timeFormat={model.time_format}
      readOnlyBar
    />
  );
  if (!hasNotes)
    return (
      <section className="avm-panel" aria-label="Employee availability">
        <div className="avm-body">{week}</div>
      </section>
    );
  const switchTab = (next: Tab) => {
    if (busy || tab === next) return;
    setTab(next);
  };
  const label = (item: Tab) => (item === "employee" ? (short ? "Availability" : "Employee availability") : "Manager notes");
  return (
    <section className="avm-panel" aria-label="Employee availability and manager notes">
      <div
        role="tablist"
        aria-label="Availability"
        className="avm-tabs"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next: Tab =
            event.key === "Home" ? "employee" : event.key === "End" ? "manager" : tab === "employee" ? "manager" : "employee";
          switchTab(next);
          document.getElementById(`${tabId}-${next}`)?.focus();
        }}
      >
        {(["employee", "manager"] as const).map((item) => (
          <button
            type="button"
            role="tab"
            key={item}
            id={`${tabId}-${item}`}
            aria-controls={`${tabId}-panel`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            disabled={busy}
            onClick={() => switchTab(item)}
          >
            {label(item)}
            {item === "manager" && noteCount > 0 && (
              <span className="avm-count" aria-hidden>
                {noteCount}
              </span>
            )}
          </button>
        ))}
      </div>
      <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`} className="avm-tabpanel">
        {tab === "employee" ? (
          <div className="avm-body">{week}</div>
        ) : (
          <ManagerNotes model={model} onSave={onSave} onReload={onReload} onBusy={setBusy} />
        )}
      </div>
    </section>
  );
}

type Sheet = { weekday: number; base: WeeklyPreference; draft: WeeklyPreference; copies: Copies };
const blankNotes = () => Array<string>(7).fill("");

function ManagerNotes({
  model,
  onSave,
  onReload,
  onBusy,
}: Omit<Props, "short"> & { onBusy: (busy: boolean) => void }) {
  const phone = useListPhoneWidth();
  const who = firstName(model.employee_name);
  const [baseline, setBaseline] = useState(model);
  const [preference, setPreference] = useState(() => model.manager?.preference ?? emptyWeeklyPreference());
  const [enabled, setEnabled] = useState(model.manager?.enabled ?? true);
  const [notes, setNotes] = useState(() => model.manager?.notes ?? blankNotes());
  const [dirty, setDirty] = useState(false);
  const [copyRevision, setCopyRevision] = useState<number>();
  const [selected, setSelected] = useState(1);
  const [copies, setCopies] = useState<Copies>(noCopies);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [editing, setEditing] = useState<{ weekday: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // BL-797: a refused save because someone saved first; Reload takes theirs.
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const inFlight = useRef(false);
  const canEdit = model.can_manage && model.manager != null;
  const current = baseline.manager;
  const hasChanges = dirty || !current?.submitted;
  const latestModel =
    (model.manager?.revision ?? 0) < (current?.revision ?? 0) || model.settings.revision < baseline.settings.revision
      ? baseline
      : model;
  const locked = saving || !canEdit || !enabled;
  const timeFormat = model.time_format;

  function reset(next: WeeklyPreferenceRead) {
    setBaseline(next);
    setPreference(next.manager?.preference ?? emptyWeeklyPreference());
    setNotes(next.manager?.notes ?? blankNotes());
    setEnabled(next.manager?.enabled ?? true);
    setDirty(false);
    setCopyRevision(undefined);
    setCopies(noCopies);
    setEditing(null);
    setError("");
    setConflict(false);
  }
  useEffect(() => {
    if (!dirty && !inFlight.current) reset(latestModel);
    // Keyed on `model` only: the revision the first edit read must survive
    // re-renders for optimistic concurrency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  function changed(week = false) {
    setDirty(true);
    if (week) setCopyRevision(undefined);
    setSaved(false);
    setError("");
  }

  async function save() {
    if (inFlight.current || !hasChanges || !canEdit) return;
    const parsed = weeklyPreferenceSaveSchema.safeParse({
      employee_id: model.employee_id,
      source: "manager",
      expected_revision: current?.revision ?? 0,
      settings_revision: baseline.settings.revision,
      preference,
      enabled,
      notes,
      ...(copyRevision !== undefined ? { copy_employee_revision: copyRevision } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the hours and notes.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      reset(await onSave(parsed.data));
      setSaved(true);
    } catch (cause) {
      // BL-1028: only "the week or its settings changed meanwhile" has a
      // newer week to reload; the database says so with its key.
      setConflict(cause instanceof RequestError && cause.status === 409 && cause.reason === "availability.changed");
      setError(
        isNoAccess(cause)
          ? "You don't have access to change this availability."
          : cause instanceof Error
            ? cause.message
            : "Changes could not be saved. Your draft is still here.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
      onBusy(false);
    }
  }

  const sheetChanges = sheet ? changedDays(sheet.base, sheet.draft) : [];
  function closeSheet(keep: boolean) {
    if (sheet && keep && sheetChanges.length) {
      setPreference({
        ...preference,
        days: preference.days.map((day) =>
          sheetChanges.includes(day.day) ? sheet.draft.days.find((item) => item.day === day.day)! : day,
        ),
      });
      changed(true);
    }
    setSheet(null);
  }

  const row = (weekday: number, onClick: () => void, currentDay?: boolean) => {
    const day = preference.days.find((item) => item.day === weekday)!;
    const tone = dayTone(day, timeFormat);
    return (
      <button
        key={weekday}
        type="button"
        data-weekday={weekday}
        className={`dav-row ${tone.className} is-${dayState(day)}`}
        aria-current={currentDay === undefined ? undefined : currentDay}
        disabled={phone && locked}
        onClick={onClick}
      >
        <i className="dav-row-dot" aria-hidden />
        <span className="dav-row-text">
          <b>{WEEKDAY_NAMES[weekday]}</b>
          <small>{tone.label}</small>
        </span>
        <ChevronRight size={phone ? 16 : 15} aria-hidden />
      </button>
    );
  };

  const copyAllowed = model.employee.submitted;
  const noteLine = (weekday: number) => {
    const text = notes[weekday] ?? "";
    const name = WEEKDAY_NAMES[weekday]!;
    if (editing?.weekday === weekday)
      return (
        <li key={weekday} className="avm-note is-editing">
          <b>{name}</b>
          <div className="avm-note-edit">
            <textarea
              aria-label={`${name} note`}
              maxLength={1000}
              rows={3}
              autoFocus
              placeholder="e.g. Prefers closing shifts"
              value={editing.text}
              onChange={(event) => setEditing({ weekday, text: event.target.value })}
            />
            <div className="avm-note-actions">
              <span className="avm-note-count">{editing.text.length} / 1000</span>
              {text && (
                <button
                  type="button"
                  className="avm-link"
                  onClick={() => {
                    setNotes(notes.map((note, index) => (index === weekday ? "" : note)));
                    setEditing(null);
                    changed();
                  }}
                >
                  Delete note
                </button>
              )}
              <Button className="secondary-button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const next = editing.text.trim();
                  if (next !== text) {
                    setNotes(notes.map((note, index) => (index === weekday ? next : note)));
                    changed();
                  }
                  setEditing(null);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </li>
      );
    return (
      <li key={weekday} className="avm-note">
        <b>{name}</b>
        {text ? <p>{text}</p> : <span className="avm-note-empty">No note</span>}
        <button
          type="button"
          className="avm-note-button"
          aria-label={`${text ? "Edit" : "Add"} ${name} note`}
          disabled={locked || editing !== null}
          onClick={() => setEditing({ weekday, text })}
        >
          {text ? <Pencil size={13} aria-hidden /> : <Plus size={13} aria-hidden />}
          {text ? "Edit" : "Add"}
        </button>
      </li>
    );
  };

  const errorLine = error ? (
    <p className="avm-error" role="alert">
      {error}
      {conflict && (
        <>
          {" "}
          <button
            type="button"
            className="avm-link"
            disabled={reloading}
            onClick={async () => {
              setReloading(true);
              try {
                if (!onReload) reset(model);
                else {
                  // A failed fetch keeps the warning: resetting to the old
                  // week would only be refused again.
                  const latest = await onReload();
                  if (latest) reset(latest);
                }
              } finally {
                setReloading(false);
              }
            }}
          >
            Reload
          </button>
        </>
      )}
    </p>
  ) : null;

  return (
    <div className={`avm-notes dav-panel${phone ? " is-phone" : ""}`}>
      <div className="avm-body">
        <div className="avm-notes-head">
          <p className="avm-ro-line">
            <EyeOff size={14} aria-hidden />
            Only managers see these notes. {who} doesn't.
          </p>
          <label className="avm-switch">
            <span>{enabled ? "On" : "Off"}</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Manager notes"
              checked={enabled}
              disabled={saving || !canEdit}
              onChange={(event) => {
                setEnabled(event.target.checked);
                setEditing(null);
                changed();
              }}
            />
          </label>
        </div>
        {!enabled && <p className="avm-notice">Manager notes are off. Saved hours and notes are kept.</p>}

        <section className="avm-section" aria-labelledby={`${model.employee_id}-hours`}>
          <header className="avm-section-head">
            <h3 id={`${model.employee_id}-hours`}>Hours to keep in mind</h3>
            <button
              type="button"
              className="avm-tool"
              disabled={locked || !copyAllowed}
              title={copyAllowed ? "Replace the hours with the employee's week; keep the notes" : "No employee preferences submitted"}
              onClick={() => {
                setPreference(structuredClone(model.employee.preference));
                setCopies(noCopies);
                changed(true);
                setCopyRevision(model.employee.revision);
              }}
            >
              <Copy size={14} aria-hidden />
              Use employee preferences
            </button>
            <button
              type="button"
              className="avm-tool avm-tool-icon"
              aria-label="Clear all hours"
              title="Clear the hours; keep the notes"
              disabled={locked || preferenceIsEmpty(preference)}
              onClick={() => {
                setPreference(emptyWeeklyPreference());
                setCopies(noCopies);
                changed(true);
              }}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </header>
          {phone ? (
            <div className="dav-list avm-week">
              {DISPLAY_DAYS.map((weekday) =>
                row(weekday, () => setSheet({ weekday, base: preference, draft: preference, copies: noCopies })),
              )}
            </div>
          ) : (
            <div className="dav-week avm-week">
              <nav className="dav-days" aria-label="Days">
                {DISPLAY_DAYS.map((weekday) =>
                  row(
                    weekday,
                    () => {
                      setSelected(weekday);
                      setCopies(noCopies);
                    },
                    weekday === selected,
                  ),
                )}
              </nav>
              <section className="dav-detail" aria-labelledby={`${model.employee_id}-day`}>
                <h4 id={`${model.employee_id}-day`}>{WEEKDAY_NAMES[selected]}</h4>
                <DayEditor
                  week={preference}
                  weekday={selected}
                  copies={copies}
                  onChange={(next, nextCopies) => {
                    setPreference(next);
                    setCopies(nextCopies);
                    changed(true);
                  }}
                  timeFormat={timeFormat}
                  disabled={locked}
                  // The drawer's column is narrow: the cards stand one under the other.
                  phone
                />
              </section>
            </div>
          )}
        </section>

        <section className="avm-section" aria-labelledby={`${model.employee_id}-notes`}>
          <header className="avm-section-head">
            <h3 id={`${model.employee_id}-notes`}>Day notes</h3>
          </header>
          <ul className="avm-note-list" aria-label="Day notes">
            {DISPLAY_DAYS.map(noteLine)}
          </ul>
        </section>
      </div>
      <footer className="avm-footer">
        {errorLine}
        <div className="avm-actions">
          <span role="status">{saving ? "Saving..." : saved ? "Saved" : dirty ? "Unsaved changes" : ""}</span>
          <Button
            className="secondary-button"
            disabled={!dirty || saving}
            onClick={() => {
              reset(latestModel);
              setSaved(false);
            }}
          >
            Discard
          </Button>
          <Button disabled={!hasChanges || saving || !canEdit} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </footer>
      {sheet && (
        <DaySheet
          title={WEEKDAY_NAMES[sheet.weekday]!}
          returnTo={`.avm-week [data-weekday="${sheet.weekday}"]`}
          onCancel={() => closeSheet(false)}
          footer={
            <div className="dav-sheet-actions">
              <Button className="secondary-button" onClick={() => closeSheet(false)}>
                Cancel
              </Button>
              <Button disabled={!sheetChanges.length} onClick={() => closeSheet(true)}>
                Done
              </Button>
            </div>
          }
        >
          <DayEditor
            week={sheet.draft}
            weekday={sheet.weekday}
            copies={sheet.copies}
            onChange={(draft, nextCopies) => setSheet({ ...sheet, draft, copies: nextCopies })}
            timeFormat={timeFormat}
            phone
          />
        </DaySheet>
      )}
    </div>
  );
}
