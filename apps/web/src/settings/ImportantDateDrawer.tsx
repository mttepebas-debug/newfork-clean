import {
  importantDateInputSchema,
  type ImportantDate,
  type ImportantDateClosurePreviewInput,
  type ImportantDateClosureShift,
  type ImportantDateInput,
  type ImportantDateLocationDays,
  type ImportantDateSaved,
  type ImportantDateShiftChoice,
  type ImportantDateType,
  type Location,
} from "@newfork/shared";
import { Button, useConfirmClick } from "@newfork/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Lock, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { importantDateTypeLabels } from "../lib/importantDateTypes";
import { todayIn } from "../lib/today";
import { CatalogDrawer } from "./CatalogDrawer";
import {
  choiceOf,
  clockLabel,
  dayFor,
  drawerErrorText,
  historyHeading,
  historyLines,
  impactPhrase,
  locationImpact,
  shortHoursTag,
  statusOf,
  tally,
  type LocationStatus,
} from "./important-date-drawer-model";
import {
  getImportantDateHistory,
  previewImportantDateClosure,
  saveImportantDate,
  setImportantDateState,
} from "./organization-data";
import "./important-date-drawer.css";

type Tab = "details" | "shifts" | "history";

/** The drawer's own form; `ids` is the explicit choice when the date is not the whole workspace's. */
type Form = {
  title: string;
  type: ImportantDateType;
  recurrence: ImportantDateInput["recurrence"];
  starts_on: string;
  ends_on: string;
  note: string;
  all_day: boolean;
  start_time: string;
  end_time: string;
  whole: boolean;
  ids: string[];
  days: ImportantDateLocationDays;
};

type Row = { id: string; name: string; live: boolean };

const STATUSES: readonly [LocationStatus, string][] = [
  ["open", "Open"],
  ["short", "Short hours"],
  ["closed", "Closed"],
];
const CHOICES: readonly [ImportantDateShiftChoice, string][] = [
  ["remove", "Remove"],
  ["open", "Open shift"],
  ["keep", "Keep"],
];

function formOf(item: ImportantDate | "new", defaultIds: string[]): Form {
  if (item === "new") {
    const today = todayIn();
    return {
      title: "",
      type: "event",
      recurrence: "none",
      starts_on: today,
      ends_on: today,
      note: "",
      all_day: true,
      start_time: "09:00",
      end_time: "17:00",
      whole: defaultIds.length === 0,
      ids: defaultIds,
      days: {},
    };
  }
  const ids = item.location_ids ?? (item.location_id ? [item.location_id] : []);
  return {
    title: item.title,
    type: item.type,
    recurrence: item.recurrence,
    starts_on: item.starts_on,
    ends_on: item.ends_on,
    note: item.note,
    all_day: item.all_day,
    start_time: item.start_time ?? "09:00",
    end_time: item.end_time ?? "17:00",
    whole: ids.length === 0,
    ids: [...ids].sort(),
    days: item.location_days ?? {},
  };
}

/** What the server is sent: the hours only when not all day, the days only of chosen locations. */
function inputOf(form: Form, rows: readonly Row[]): ImportantDateInput {
  const ids = form.whole ? [] : [...form.ids].sort();
  const chosen = form.whole ? rows.filter((row) => row.live).map((row) => row.id) : ids;
  return {
    location_ids: ids,
    location_id: ids.length === 1 ? ids[0]! : null,
    title: form.title,
    type: form.type,
    starts_on: form.starts_on,
    ends_on: form.ends_on,
    recurrence: form.recurrence,
    note: form.note,
    all_day: form.all_day,
    start_time: form.all_day ? null : form.start_time,
    end_time: form.all_day ? null : form.end_time,
    location_days: Object.fromEntries(
      Object.entries(form.days)
        .filter(([id]) => chosen.includes(id))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timeout);
    // The key stands for the value: a new object with the same content waits for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);
  return settled;
}

/**
 * The Important Date drawer, A + L1 (KARARLAR "Important Dates çekmecesi A
 * (Stacked)"): Details, Shifts and History; each location Open, Short hours or
 * Closed; every published shift a closing or short hours reaches is removed,
 * opened or kept before the date is saved (K13, B12).
 */
export function ImportantDateDrawer({
  workspaceId,
  editing,
  locations,
  canTargetWorkspace,
  mayManageLocations,
  republish = false,
  onClose,
  onSaved,
}: {
  readonly workspaceId: string;
  readonly editing: ImportantDate | "new";
  /** Opened to publish an unpublished date again: its shifts are reviewed first (K13). */
  readonly republish?: boolean;
  readonly locations: readonly Location[];
  readonly canTargetWorkspace: boolean;
  readonly mayManageLocations: (ids: readonly string[]) => boolean;
  readonly onClose: () => void;
  readonly onSaved: (result: ImportantDateSaved, action: "save" | "archive" | "republish") => Promise<void>;
}) {
  const live = locations.filter((location) => !location.archived_at);
  // A manager writes for one location (K1): theirs, if they have one.
  const defaultIds = !canTargetWorkspace && live.length === 1 ? [live[0]!.id] : [];
  const [form, setForm] = useState<Form>(() => formOf(editing, defaultIds));
  const baseline = useRef(form);
  const [tab, setTab] = useState<Tab>(republish ? "shifts" : "details");
  const [choices, setChoices] = useState<Record<string, ImportantDateShiftChoice>>({});
  const [error, setError] = useState<string | null>(null);

  const recordIds = editing === "new" ? [] : (editing.location_ids ?? []);
  const rows: Row[] = [
    ...locations
      .filter((location) => !location.archived_at || recordIds.includes(location.id))
      .map((location) => ({ id: location.id, name: location.name, live: !location.archived_at })),
    ...recordIds
      .filter((id) => !locations.some((location) => location.id === id))
      .map((id) => ({ id, name: "Archived location", live: false })),
  ];
  const liveRows = rows.filter((row) => row.live);
  const canPick = canTargetWorkspace || liveRows.length > 1;
  const isChosen = (id: string) => (form.whole ? rows.some((row) => row.id === id && row.live) : form.ids.includes(id));
  const chosenRows = rows.filter((row) => isChosen(row.id));
  const noneChosen = chosenRows.length === 0;

  const input = inputOf(form, rows);
  const parsed = importantDateInputSchema.safeParse(input);
  const dirty = JSON.stringify(input) !== JSON.stringify(inputOf(baseline.current, rows));
  const published = republish || editing === "new" || (editing.status !== "unpublished" && !editing.archived_at);
  const changesDays = Object.keys(input.location_days).length > 0;

  // K13: what the date would land on, asked again once the form settles.
  const previewInput: ImportantDateClosurePreviewInput | null =
    published && changesDays && parsed.success
      ? {
          important_date_id: editing === "new" ? null : editing.id,
          starts_on: input.starts_on,
          ends_on: input.ends_on,
          recurrence: input.recurrence,
          location_ids: input.location_ids ?? [],
          all_day: input.all_day,
          start_time: input.start_time,
          end_time: input.end_time,
          location_days: input.location_days,
        }
      : null;
  const settledPreview = useSettled(previewInput, 300);
  const preview = useQuery({
    queryKey: ["important-dates", workspaceId, "closure-preview", settledPreview],
    queryFn: () => previewImportantDateClosure(workspaceId, settledPreview!),
    enabled: Boolean(settledPreview),
  });
  const previewCurrent =
    previewInput !== null && JSON.stringify(settledPreview) === JSON.stringify(previewInput) && preview.isSuccess;
  const checking = previewInput !== null && !previewCurrent && !preview.isError;
  const shifts: readonly ImportantDateClosureShift[] = previewCurrent ? preview.data.shifts : [];
  const counts = tally(shifts, choices);

  const history = useQuery({
    queryKey: ["important-dates", workspaceId, "history", editing === "new" ? null : editing.id],
    queryFn: () => getImportantDateHistory(workspaceId, (editing as ImportantDate).id),
    enabled: tab === "history" && editing !== "new",
  });

  const save = useMutation({
    mutationFn: () => {
      const listed = new Set(shifts.map((shift) => shift.id));
      const closure = {
        shift_choices: Object.fromEntries(Object.entries(choices).filter(([id]) => listed.has(id))),
        expected_fingerprint: previewCurrent ? preview.data.fingerprint : null,
      };
      if (republish) return setImportantDateState(workspaceId, (editing as ImportantDate).id, "republish", closure);
      return saveImportantDate(
        workspaceId,
        parsed.data!,
        editing === "new" ? undefined : editing.id,
        editing === "new" ? undefined : editing.revision,
        closure,
      );
    },
    onSuccess: (result) => onSaved(result, republish ? "republish" : "save"),
    onError: (failure) => {
      setError(drawerErrorText(failure));
      void preview.refetch();
    },
  });
  const archive = useMutation({
    mutationFn: () => setImportantDateState(workspaceId, (editing as ImportantDate).id, "archive"),
    onSuccess: (result) => onSaved(result, "archive"),
    onError: (failure) => setError(drawerErrorText(failure)),
  });
  const busy = save.isPending || archive.isPending;
  const archiveClick = useConfirmClick(() => archive.mutate());

  const canSave =
    (dirty || republish) && parsed.success && !noneChosen && !busy && !checking && !preview.isError &&
    mayManageLocations(input.location_ids ?? []);

  const update = (patch: Partial<Form>) => {
    setError(null);
    setForm((current) => ({ ...current, ...patch }));
  };
  const setStatus = (id: string, status: LocationStatus) =>
    setForm((current) => {
      const day = dayFor(status, current.days[id]);
      const days = { ...current.days };
      if (day) days[id] = day;
      else delete days[id];
      return { ...current, days };
    });
  const setHours = (id: string, key: "opens" | "closes", value: string) =>
    setForm((current) => {
      const day = current.days[id];
      if (day?.status !== "short") return current;
      return { ...current, days: { ...current.days, [id]: { ...day, [key]: value } } };
    });
  const toggleRow = (id: string) =>
    setForm((current) => {
      const chosen = current.whole ? liveRows.map((row) => row.id) : current.ids;
      const ids = chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id];
      const days = { ...current.days };
      if (!ids.includes(id)) delete days[id];
      return { ...current, whole: false, ids, days };
    });
  const toggleAll = () =>
    setForm((current) => {
      const everything = current.whole || liveRows.every((row) => current.ids.includes(row.id));
      return everything ? { ...current, whole: false, ids: [], days: {} } : { ...current, whole: true, ids: [] };
    });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setError(null);
    save.mutate();
  };

  const title = editing === "new" ? "New important date" : form.title.trim() || "Untitled date";
  const label = editing === "new" ? "Add important date" : `Edit ${editing.title}`;
  const dateLine = [
    importantDateTypeLabels[form.type],
    form.starts_on === form.ends_on ? longDate(form.starts_on) : `${longDate(form.starts_on)} – ${longDate(form.ends_on)}`,
    form.recurrence === "annual" ? "Every year" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CatalogDrawer label={label} className="important-date-drawer" onClose={onClose} busy={busy}>
      <form className="idd" onSubmit={submit} aria-label={label}>
        <div className="idd-head">
          <div className="idd-hrow">
            <h2 className="idd-title">{title}</h2>
            {editing !== "new" ? (
              <span className="list-chip" data-tone={editing.status === "unpublished" ? "gray" : "green"}>
                {editing.status === "unpublished" ? "Unpublished" : "Published"}
              </span>
            ) : null}
            <button
              type="button"
              className="idd-icon"
              aria-label="Close important date editor"
              title="Close"
              disabled={busy}
              onClick={onClose}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <p className="idd-sub">{dateLine}</p>
          <div className="idd-tabs" role="tablist" aria-label="Important date">
            {(
              [
                ["details", "Details"],
                ["shifts", "Shifts"],
                ...(editing === "new" ? [] : [["history", "History"]]),
              ] as [Tab, string][]
            ).map(([key, name]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`idd-tab-${key}`}
                aria-selected={tab === key}
                aria-controls="idd-panel"
                className="idd-tab"
                onClick={() => setTab(key)}
              >
                {name}
                {key === "shifts" && previewCurrent ? (
                  <span className="idd-count" data-warn={counts.remove + counts.open > 0}>
                    {counts.listed}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="idd-body" id="idd-panel" role="tabpanel" aria-labelledby={`idd-tab-${tab}`} data-tab={tab}>
          {tab === "details" ? (
            <fieldset className="idd-details" disabled={busy || republish}>
              <label className="idd-field">
                <span>Title</span>
                <input value={form.title} maxLength={120} required onChange={(event) => update({ title: event.target.value })} />
              </label>
              <div className="idd-two">
                <label className="idd-field">
                  <span>Type</span>
                  <select value={form.type} onChange={(event) => update({ type: event.target.value as ImportantDateType })}>
                    {(Object.entries(importantDateTypeLabels) as [ImportantDateType, string][]).map(([value, name]) => (
                      <option key={value} value={value}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="idd-field">
                  <span>Repeats</span>
                  <select
                    value={form.recurrence}
                    onChange={(event) => update({ recurrence: event.target.value as Form["recurrence"] })}
                  >
                    <option value="none">Does not repeat</option>
                    <option value="annual">Every year</option>
                  </select>
                </label>
              </div>
              <div className="idd-when">
                <label className="idd-field">
                  <span>Starts</span>
                  <input
                    type="date"
                    value={form.starts_on}
                    required
                    onChange={(event) =>
                      update({
                        starts_on: event.target.value,
                        ends_on: form.ends_on < event.target.value ? event.target.value : form.ends_on,
                      })
                    }
                  />
                </label>
                <div className="idd-field">
                  <div className="idd-label-row">
                    <label htmlFor="idd-ends">Ends</label>
                    <label className="idd-check">
                      <input type="checkbox" checked={form.all_day} onChange={(event) => update({ all_day: event.target.checked })} />
                      All day
                    </label>
                  </div>
                  <input id="idd-ends" type="date" value={form.ends_on} required onChange={(event) => update({ ends_on: event.target.value })} />
                </div>
                <input
                  type="time"
                  step={900}
                  aria-label="Start time"
                  value={form.start_time}
                  disabled={form.all_day}
                  onChange={(event) => update({ start_time: event.target.value })}
                />
                <input
                  type="time"
                  step={900}
                  aria-label="End time"
                  value={form.end_time}
                  disabled={form.all_day}
                  onChange={(event) => update({ end_time: event.target.value })}
                />
              </div>
              {!parsed.success && !form.all_day && form.starts_on === form.ends_on && form.end_time <= form.start_time ? (
                <p className="idd-hint" data-error="true">End time must be after the start time.</p>
              ) : null}

              <div className="idd-field">
                <span>Locations</span>
                <div className="idd-locations" role="table" aria-label="Locations">
                  <div className="idd-lrow idd-lhead" role="row">
                    {canTargetWorkspace ? (
                      <label className="idd-lcheck-label idd-lfirst" role="columnheader">
                        <input
                          type="checkbox"
                          className="idd-lcheck"
                          checked={!noneChosen && chosenRows.length === liveRows.length}
                          ref={(box) => {
                            if (box) box.indeterminate = !noneChosen && chosenRows.length < liveRows.length;
                          }}
                          onChange={toggleAll}
                        />
                        All locations
                      </label>
                    ) : (
                      <span className="idd-lfirst" role="columnheader">Location</span>
                    )}
                    <span className="idd-lmid" role="columnheader">That day</span>
                    <span className="idd-limp" role="columnheader">Shifts</span>
                  </div>
                  {rows
                    .filter((row) => row.live || isChosen(row.id))
                    .map((row) => {
                      const chosen = isChosen(row.id);
                      const status = statusOf(form.days, row.id);
                      const day = form.days[row.id];
                      const impact = locationImpact(
                        status,
                        tally(
                          shifts.filter((shift) => shift.location_id === row.id),
                          choices,
                        ),
                      );
                      return (
                        <div className="idd-lrow" role="row" key={row.id} data-off={!chosen}>
                          <input
                            type="checkbox"
                            className="idd-lcheck"
                            aria-label={row.name}
                            checked={chosen}
                            disabled={!canPick}
                            onChange={() => toggleRow(row.id)}
                          />
                          <span className="idd-lname" title={row.name}>
                            {row.name}
                          </span>
                          {chosen ? (
                            <div className="idd-seg" role="radiogroup" aria-label={`${row.name} that day`}>
                              {STATUSES.map(([key, name]) => (
                                <button
                                  key={key}
                                  type="button"
                                  role="radio"
                                  aria-checked={status === key}
                                  onClick={() => setStatus(row.id, key)}
                                >
                                  <span className="idd-dot" data-status={key} aria-hidden />
                                  {name}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="idd-off">Not included</span>
                          )}
                          <span className="idd-limp" data-tone={chosen ? impact.tone : "quiet"}>
                            {!chosen ? "—" : status !== "open" && checking ? "Checking…" : published ? impact.text : status === "open" ? "Usual hours" : ""}
                          </span>
                          {chosen && day?.status === "short" ? (
                            <div className="idd-hours">
                              <span>Opens</span>
                              <input
                                type="time"
                                step={900}
                                aria-label={`${row.name} opens`}
                                value={day.opens}
                                onChange={(event) => setHours(row.id, "opens", event.target.value)}
                              />
                              <span>Closes</span>
                              <input
                                type="time"
                                step={900}
                                aria-label={`${row.name} closes`}
                                value={day.closes === "24:00" ? "00:00" : day.closes}
                                onChange={(event) => setHours(row.id, "closes", event.target.value === "00:00" ? "24:00" : event.target.value)}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
                {!canTargetWorkspace ? (
                  <p className="idd-hint">
                    <Lock size={14} aria-hidden />
                    Dates for more than one location are set by an admin or owner.
                  </p>
                ) : null}
              </div>

              <label className="idd-field idd-note">
                <span>Note</span>
                <textarea value={form.note} maxLength={500} onChange={(event) => update({ note: event.target.value })} />
              </label>
            </fieldset>
          ) : tab === "shifts" ? (
            <ShiftsPanel
              published={published}
              changesDays={changesDays}
              checking={checking}
              failed={preview.isError}
              shifts={shifts}
              hidden={previewCurrent ? preview.data.hidden_shift_count : 0}
              drafts={previewCurrent ? preview.data.draft_shift_count : 0}
              choices={choices}
              busy={busy}
              onChoose={(id, choice) => {
                setError(null);
                setChoices((current) => ({ ...current, [id]: choice }));
              }}
            />
          ) : (
            <HistoryPanel
              loading={history.isLoading}
              failed={history.isError}
              changes={history.data?.changes ?? []}
              locationName={(id) =>
                locations.find((location) => location.id === id)?.name ??
                (editing !== "new" && editing.location_ids?.length === 1 && editing.location_ids[0] === id
                  ? (editing.location_name ?? "Another location")
                  : "Another location")
              }
            />
          )}
        </div>

        <div className="idd-foot">
          <ImpactLine
            error={error}
            noneChosen={noneChosen}
            published={published}
            changesDays={changesDays}
            checking={checking}
            failed={preview.isError}
            counts={counts}
            showReview={tab !== "shifts"}
            onReview={() => setTab("shifts")}
          />
          <div className="idd-actions">
            {editing !== "new" && editing.can_archive && !republish ? (
              <button
                type="button"
                className={archiveClick.armed ? "idd-archive" : "idd-archive-text"}
                disabled={busy}
                {...archiveClick.confirmProps}
              >
                {archiveClick.armed ? "Confirm archive" : "Archive"}
              </button>
            ) : (
              <span />
            )}
            <div className="idd-right">
              <Button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave}>
                {save.isPending ? "Saving" : republish ? "Republish" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </CatalogDrawer>
  );
}

function ImpactLine({
  error,
  noneChosen,
  published,
  changesDays,
  checking,
  failed,
  counts,
  showReview,
  onReview,
}: {
  readonly error: string | null;
  readonly noneChosen: boolean;
  readonly published: boolean;
  readonly changesDays: boolean;
  readonly checking: boolean;
  readonly failed: boolean;
  readonly counts: ReturnType<typeof tally>;
  readonly showReview: boolean;
  readonly onReview: () => void;
}) {
  if (error) {
    return (
      <div className="idd-impact" data-tone="error" role="alert">
        <AlertTriangle size={16} aria-hidden />
        <span>{error}</span>
      </div>
    );
  }
  let tone = "calm";
  let icon = <Info size={16} aria-hidden />;
  let text: string;
  let review = false;
  if (noneChosen) text = "Choose at least one location.";
  else if (!changesDays) {
    icon = <CheckCircle2 size={16} aria-hidden />;
    text = "Shifts stay as scheduled.";
  } else if (!published) text = "Its shifts are reviewed when the date is published again.";
  else if (failed) {
    tone = "error";
    text = "The shifts on this date could not be checked. Try again.";
  } else if (checking) text = "Checking the shifts on this date…";
  else if (!counts.listed) {
    tone = "ok";
    icon = <CheckCircle2 size={16} aria-hidden />;
    text = "All shifts fit the new hours.";
  } else if (!counts.remove && !counts.open) {
    tone = "ok";
    icon = <CheckCircle2 size={16} aria-hidden />;
    text = `No shift changes · ${counts.keep} kept`;
    review = true;
  } else {
    tone = "warn";
    icon = <AlertTriangle size={16} aria-hidden />;
    text = impactPhrase(counts);
    review = true;
  }
  return (
    <div className="idd-impact" data-tone={tone} role="status">
      {icon}
      <span>{text}</span>
      {review && showReview ? (
        <button type="button" className="idd-review" onClick={onReview}>
          Review shifts
        </button>
      ) : null}
    </div>
  );
}

function ShiftsPanel({
  published,
  changesDays,
  checking,
  failed,
  shifts,
  hidden,
  drafts,
  choices,
  busy,
  onChoose,
}: {
  readonly published: boolean;
  readonly changesDays: boolean;
  readonly checking: boolean;
  readonly failed: boolean;
  readonly shifts: readonly ImportantDateClosureShift[];
  readonly hidden: number;
  readonly drafts: number;
  readonly choices: Readonly<Record<string, ImportantDateShiftChoice>>;
  readonly busy: boolean;
  readonly onChoose: (id: string, choice: ImportantDateShiftChoice) => void;
}) {
  const calm = (text: string) => (
    <div className="idd-calm">
      <Info size={16} aria-hidden />
      <span>{text}</span>
    </div>
  );
  if (!changesDays) return calm("No location closes or shortens its hours on this date. Nothing changes on the Schedule.");
  if (!published) return calm("This date is unpublished. Its shifts are reviewed when you publish it again.");
  if (failed) return calm("The shifts on this date could not be checked. Try again.");
  if (checking) return calm("Checking the shifts on this date…");
  const groups = [...new Set(shifts.map((shift) => `${shift.location_id}|${shift.scheduled_date}`))].map((key) => {
    const items = shifts.filter((shift) => `${shift.location_id}|${shift.scheduled_date}` === key);
    return { key, items, first: items[0]! };
  });
  const notes = [
    hidden ? `${hidden} more ${hidden === 1 ? "shift is" : "shifts are"} at locations whose Schedule you can't see; ${hidden === 1 ? "it takes" : "they take"} the default.` : "",
    drafts ? `${drafts} draft ${drafts === 1 ? "shift" : "shifts"} on these days ${drafts === 1 ? "becomes an open shift" : "become open shifts"}.` : "",
  ].filter(Boolean);
  return (
    <>
      {groups.length ? (
        <>
          <div className="idd-legend">
            <span>
              <b>Remove</b> deletes the shift; the person is told.
            </span>
            <span>
              <b>Open shift</b> keeps the shift without a person; anyone at the location can pick it up.
            </span>
            <span>
              <b>Keep</b> leaves it as it is.
            </span>
          </div>
          <div className="idd-shifts">
            {groups.map((group) => (
              <div key={group.key} role="group" aria-label={`${group.first.location_name} · ${shortDate(group.first.scheduled_date)}`}>
                <div className="idd-sloc">
                  <span>
                    {group.first.location_name} · {shortDate(group.first.scheduled_date)}
                  </span>
                  <span>
                    {group.items.length} {group.items.length === 1 ? "shift" : "shifts"}
                  </span>
                </div>
                {group.items.map((shift) => {
                  const name = shift.employee_name ?? "Someone";
                  const tag = shortHoursTag(shift);
                  const current = choiceOf(shift, choices);
                  return (
                    <div className="idd-srow" key={shift.id}>
                      <span className="idd-avatar" aria-hidden>
                        {initials(name)}
                      </span>
                      <div className="idd-swho">
                        <div className="idd-sname">{name}</div>
                        <div className="idd-smeta">
                          {shift.start_time && shift.end_time
                            ? `${clockLabel(shift.start_time)} – ${clockLabel(shift.end_time)}`
                            : "All day"}{" "}
                          · {shift.job_name}
                          {tag ? (
                            <>
                              {" "}
                              · <span className="idd-stag">{tag}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="idd-pick" role="group" aria-label={`${name}'s shift`}>
                        {CHOICES.map(([choice, word]) => (
                          <button
                            key={choice}
                            type="button"
                            data-choice={choice}
                            aria-pressed={current === choice}
                            disabled={busy}
                            onClick={() => onChoose(shift.id, choice)}
                          >
                            {word}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : (
        calm("All published shifts on this date fit the new hours.")
      )}
      {notes.map((note) => (
        <p className="idd-hint" key={note}>
          <Info size={14} aria-hidden />
          {note}
        </p>
      ))}
    </>
  );
}

function HistoryPanel({
  loading,
  failed,
  changes,
  locationName,
}: {
  readonly loading: boolean;
  readonly failed: boolean;
  readonly changes: Parameters<typeof historyLines>[0][];
  readonly locationName: (id: string) => string;
}) {
  if (loading) return <p className="idd-hint">Loading history…</p>;
  if (failed) return <p className="idd-hint" data-error="true">The history could not be loaded. Try again.</p>;
  if (!changes.length) return <p className="idd-hint">No changes yet.</p>;
  return (
    <ol className="idd-history">
      {changes.map((change) => {
        const hidden = !change.changed_at;
        return (
          <li key={change.id} data-hidden={hidden}>
            <div className="idd-hhead">{historyHeading(change)}</div>
            <div className="idd-hwhen">{hidden ? "At a location you don't manage" : stamp(change.changed_at!)}</div>
            {historyLines(change, locationName).map((line) => (
              <div className="idd-hline" key={line.label}>
                {line.label}: <s>{line.before || "—"}</s> → {line.after || "—"}
              </div>
            ))}
          </li>
        );
      })}
    </ol>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function longDate(value: string): string {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(value: string): string {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function stamp(value: string): string {
  const at = new Date(value);
  return `${at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
