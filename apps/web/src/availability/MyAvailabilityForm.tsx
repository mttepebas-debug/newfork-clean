import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@newfork/ui";
import { Check, ChevronRight, Pencil, X } from "lucide-react";
import {
  emptyWeeklyPreference,
  weeklyPreferenceSaveSchema,
  type WeeklyPreference,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
} from "@newfork/shared";
import { DayEditor } from "./DayEditor";
import {
  DISPLAY_DAYS,
  WEEKDAY_NAMES,
  changedDays,
  dayState,
  dayStatusText,
  noCopies,
  type Copies,
} from "./day-availability";
import { useAvailabilityNavigationGuard } from "./availability-navigation";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { useListPhoneWidth } from "../lib/usePhoneWidth";

// The employee's own week: Employee Hub → My Availability and the onboarding
// step (M2: only the employee writes it). Desktop: the days on the left, the
// chosen day on the right, one Save for the week. Phone (720 px and below):
// the week as a list; a day opens in a sheet from the bottom and saves on its
// own (Mert 2026-10-16, "A · Alt sayfa"). In onboarding the sheet's Done keeps
// the day in the draft and the step's own button saves.

type Props = {
  model: WeeklyPreferenceRead;
  // M5: a save decides nothing about pending requests; nothing to review first.
  onSave: (command: WeeklyPreferenceSave) => Promise<WeeklyPreferenceRead>;
  /** The onboarding step. */
  wizard?: boolean;
  /** The step's way on ("Skip for now" / "Continue"), beside Save and continue. */
  extraAction?: ReactNode;
  /** BL-797: fetches the week someone saved first; Reload waits for it. */
  onReload?: () => Promise<WeeklyPreferenceRead | undefined>;
};

type Sheet = { weekday: number; base: WeeklyPreference; draft: WeeklyPreference; copies: Copies };

const weekOf = (model: WeeklyPreferenceRead) =>
  model.employee.preference ?? emptyWeeklyPreference(model.settings.input_mode);
const sharedOn = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

// Remount for another person: an unsaved week never follows to someone else.
export function MyAvailabilityForm(props: Props) {
  return <Form key={props.model.employee_id} {...props} />;
}

function Form({ model, onSave, wizard = false, extraAction, onReload }: Props) {
  const phone = useListPhoneWidth();
  const [baseline, setBaseline] = useState(model);
  const [week, setWeek] = useState(() => weekOf(model));
  const [selected, setSelected] = useState(1);
  const [copies, setCopies] = useState<Copies>(noCopies);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [flash, setFlash] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // BL-797: a refused save because someone saved first; Reload takes theirs.
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const inFlight = useRef(false);
  const canEdit = model.can_edit_employee;
  const saved = weekOf(baseline);
  const changed = changedDays(saved, week);
  const dirty = changed.length > 0;
  const submitted = baseline.employee.submitted;
  const hasChanges = dirty || !submitted;
  const latestModel =
    model.employee.revision < baseline.employee.revision ||
    model.settings.revision < baseline.settings.revision
      ? baseline
      : model;
  const shiftTypes = model.shift_types;
  const timeFormat = model.time_format;

  function reset(next: WeeklyPreferenceRead) {
    setBaseline(next);
    setWeek(weekOf(next));
    setCopies(noCopies);
    setError("");
    setConflict(false);
  }
  useEffect(() => {
    if (!dirty && !inFlight.current) reset(latestModel);
    // Keyed on `model` only: the revision the first edit read must survive
    // re-renders for optimistic concurrency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);
  useEffect(() => {
    if (!flash.length) return;
    const timer = window.setTimeout(() => setFlash([]), 1700);
    return () => window.clearTimeout(timer);
  }, [flash]);

  async function submit(next: WeeklyPreference) {
    if (inFlight.current || !canEdit) return false;
    const parsed = weeklyPreferenceSaveSchema.safeParse({
      employee_id: model.employee_id,
      source: "employee",
      expected_revision: baseline.employee.revision,
      settings_revision: baseline.settings.revision,
      preference: next,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the unavailable hours.");
      return false;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      reset(await onSave(parsed.data));
      return true;
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
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  // P26, C2.3: leaving with unsaved days asks first (the shared ConfirmDialog).
  const leaveDialog = useAvailabilityNavigationGuard({
    dirty,
    busy: saving,
    onDiscard: () => reset(baseline),
  });

  const sheetChanges = sheet ? changedDays(sheet.base, sheet.draft) : [];
  async function closeSheet(keep: boolean) {
    if (!sheet) return;
    if (!keep || !sheetChanges.length) return setSheet(null);
    // Only the days the sheet changed are written over the week.
    const next: WeeklyPreference = {
      ...week,
      days: week.days.map((day) => (sheetChanges.includes(day.day) ? sheet.draft.days.find((item) => item.day === day.day)! : day)),
    };
    if (wizard) setWeek(next);
    else if (!(await submit(next))) return;
    setSheet(null);
    setFlash(sheetChanges);
  }

  const error_ = error ? (
    <p className="dav-error" role="alert">
      {error}
      {conflict && (
        <>
          {" "}
          <button
            type="button"
            className="dav-link"
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

  const status = dirty ? (
    <span className="dav-status is-warn">
      <i aria-hidden />
      Unsaved changes
    </span>
  ) : submitted ? (
    <span className="dav-status">
      <i aria-hidden />
      Shared with your managers{baseline.employee.updated_at ? ` · ${sharedOn(baseline.employee.updated_at)}` : ""}
    </span>
  ) : (
    <span className="dav-status is-off">
      <i aria-hidden />
      Not shared yet
    </span>
  );

  const row = (weekday: number, onClick: () => void, current?: boolean) => {
    const day = week.days.find((item) => item.day === weekday)!;
    return (
      <button
        key={weekday}
        type="button"
        data-weekday={weekday}
        className={`dav-row is-${dayState(day)}${flash.includes(weekday) ? " is-flash" : ""}`}
        aria-current={current === undefined ? undefined : current}
        onClick={onClick}
      >
        <i className="dav-row-dot" aria-hidden />
        <span className="dav-row-text">
          <b>{WEEKDAY_NAMES[weekday]}</b>
          <small>{dayStatusText(day, shiftTypes, timeFormat)}</small>
        </span>
        <ChevronRight size={phone ? 16 : 15} aria-hidden />
      </button>
    );
  };

  const foot = wizard ? (
    <div className="dav-onboard-foot">
      {!phone && <span>You can change this anytime in My Availability.</span>}
      {extraAction}
      <Button disabled={!hasChanges || saving || !canEdit} onClick={() => void submit(week)}>
        {saving ? "Saving..." : "Save and continue"}
      </Button>
    </div>
  ) : null;

  return (
    <section className={`dav-panel${phone ? " is-phone" : ""}`} aria-label="Weekly availability">
      {leaveDialog}
      {phone ? (
        <>
          <div className="dav-list">
            {DISPLAY_DAYS.map((weekday) =>
              row(weekday, () => {
                if (!canEdit) return;
                setError("");
                setSheet({ weekday, base: week, draft: week, copies: noCopies });
              }),
            )}
          </div>
          {!sheet && error_}
          {foot}
          {sheet && (
            <DaySheet
              title={WEEKDAY_NAMES[sheet.weekday]!}
              trigger={sheet.weekday}
              onCancel={() => void closeSheet(false)}
              footer={
                <>
                  {error_}
                  <div className="dav-sheet-actions">
                    <Button className="secondary-button" disabled={saving} onClick={() => void closeSheet(false)}>
                      Cancel
                    </Button>
                    <Button disabled={!sheetChanges.length || saving} onClick={() => void closeSheet(true)}>
                      {wizard ? "Done" : saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </>
              }
            >
              <DayEditor
                week={sheet.draft}
                weekday={sheet.weekday}
                copies={sheet.copies}
                onChange={(draft, nextCopies) => setSheet({ ...sheet, draft, copies: nextCopies })}
                shiftTypes={shiftTypes}
                timeFormat={timeFormat}
                disabled={saving}
                phone
              />
            </DaySheet>
          )}
        </>
      ) : (
        <>
          <section className="dav-frame" aria-labelledby="dav-frame-title">
            <header className="dav-frame-head">
              <h2 id="dav-frame-title">Weekly availability</h2>
              {status}
            </header>
            <div className="dav-week">
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
              <section className="dav-detail" aria-labelledby="dav-detail-title">
                <h3 id="dav-detail-title">{WEEKDAY_NAMES[selected]}</h3>
                <DayEditor
                  week={week}
                  weekday={selected}
                  copies={copies}
                  onChange={(next, nextCopies) => {
                    setWeek(next);
                    setCopies(nextCopies);
                    setError("");
                  }}
                  shiftTypes={shiftTypes}
                  timeFormat={timeFormat}
                  disabled={saving || !canEdit}
                />
              </section>
            </div>
          </section>
          {error_}
          {foot}
          {!wizard && hasChanges && canEdit && (
            <div className="dav-savebar" role="region" aria-label="Unsaved changes">
              <Pencil size={15} aria-hidden />
              <span>
                {dirty
                  ? `${changed.length} ${changed.length === 1 ? "day" : "days"} changed. Your managers see it after you save.`
                  : "Your week isn't shared yet. Your managers see it after you save."}
              </span>
              <button
                type="button"
                className="dav-savebar-ghost"
                disabled={!dirty || saving}
                onClick={() => reset(latestModel)}
              >
                Discard
              </button>
              <button
                type="button"
                className="dav-savebar-go"
                disabled={saving}
                onClick={() => void submit(week)}
              >
                <Check size={15} aria-hidden />
                {saving ? "Saving..." : "Save availability"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** A day of the week in a sheet from the bottom: a modal <dialog>, so the page behind is inert, Esc closes, focus goes in and comes back. */
function DaySheet({
  title,
  trigger,
  onCancel,
  footer,
  children,
}: {
  title: string;
  trigger: number;
  onCancel: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal?.();
    dialog?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    return () => {
      dialog?.close?.();
      // Back to the day's row, which stays on the page.
      queueMicrotask(() =>
        document.querySelector<HTMLElement>(`.dav-list [data-weekday="${trigger}"]`)?.focus({ preventScroll: true }),
      );
    };
  }, [trigger]);
  return createPortal(
    <dialog
      ref={ref}
      className="dav-sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        // A tap on the dimmed page above the sheet closes it, like Cancel.
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dav-sheet-inner">
        <div className="dav-sheet-head">
          <h2 id={titleId} tabIndex={-1}>
            {title}
          </h2>
          <button type="button" className="dav-sheet-close" aria-label="Close" onClick={onCancel}>
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </dialog>,
    document.body,
  );
}
