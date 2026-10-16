import type {
  AnnouncementDetail,
  AnnouncementDay,
  AnnouncementDraft,
  AnnouncementImpactShift,
  AnnouncementList,
  AnnouncementPerson,
  AnnouncementPreview,
  AnnouncementShiftChange,
  AnnouncementShiftChoice,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { Check, MapPin, Plus, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AvailabilityClockInput } from "../availability/AvailabilityClockInput";
import {
  announcementCategories,
  closesNextDay,
  dayText,
  fitToHours,
  historyStep,
  hoursText,
  initials,
  locationImpact,
  momentText,
  nextYearDay,
  plural,
  repeatOptions,
  shiftReason,
  type TimeFormat,
} from "./announcement-model";

/** The message under a field, or nothing. */
export type ProblemAt = (field: string) => string | undefined;

type Update = (change: (draft: AnnouncementDraft) => AnnouncementDraft) => void;

export function FieldError({ id, message }: { id?: string; message?: string }) {
  return message ? (
    <span className="ad-error" role="alert" id={id}>
      {message}
    </span>
  ) : null;
}

function invalid(message: string | undefined, id: string) {
  return message ? { "aria-invalid": true as const, "aria-describedby": id } : {};
}

export function Flag({
  label,
  hint,
  checked,
  disabled,
  compact = false,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  /** Three in a row on Details: the hint is the box's tooltip and its screen-reader text. */
  compact?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="ad-flag" data-compact={compact || undefined} title={compact ? hint : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <b>{label}</b>
        <span className={compact ? "sr-only" : "ad-hint"}>{hint}</span>
      </span>
    </label>
  );
}

// ---------- Details ----------

export type WhereLocation = {
  id: string;
  name: string;
  canChangeHours: boolean;
};

/**
 * Details holds the whole post, as the Important Date drawer A + L1 does
 * (Mert, 2026-10-12): title, category and repeat, where it shows, when, the
 * locations with that day's hours, the publish time, and the message last,
 * filling what room is left.
 */
export function DetailsTab({
  idPrefix,
  draft,
  update,
  locked,
  started,
  canWriteDates,
  needsDate,
  today,
  problemAt,
  locations,
  preview,
  publishing,
  timeFormat,
}: {
  idPrefix: string;
  draft: AnnouncementDraft;
  update: Update;
  locked: boolean;
  started: boolean;
  canWriteDates: boolean;
  needsDate: boolean;
  today: string;
  problemAt: ProblemAt;
  locations: WhereLocation[];
  preview: AnnouncementPreview | undefined;
  /** The workspace's 12h or 24h clock (Settings → Schedule). */
  timeFormat: TimeFormat;
  /** Schedule for later, while it hasn't gone out. */
  publishing: ReactNode;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const titleError = problemAt("title");
  const otherError = problemAt("category_other");
  const startError = problemAt("starts_on");
  const endError = problemAt("ends_on");
  const untilError = problemAt("event_until");
  const repeats = repeatOptions(draft.starts_on);
  const nextDay =
    draft.recurrence !== "none" && draft.starts_on ? nextYearDay(draft.starts_on, draft.recurrence) : null;
  const frozen = locked || started;
  const allDay = draft.event_from === null;
  return (
    <>
      <div className="ad-field">
        <label htmlFor={id("title")}>Title</label>
        <input
          id={id("title")}
          className="ad-input"
          maxLength={120}
          placeholder="What is it about?"
          value={draft.title}
          disabled={locked}
          data-field="title"
          onChange={(event) => {
            const title = event.target.value;
            update((current) => ({ ...current, title }));
          }}
          {...invalid(titleError, id("title-error"))}
        />
        <FieldError id={id("title-error")} message={titleError} />
      </div>
      <div className="ad-two">
        <div className="ad-field">
          <label htmlFor={id("category")}>Category</label>
          <select
            id={id("category")}
            className="ad-input"
            value={draft.category}
            disabled={locked}
            onChange={(event) => {
              const category = event.target.value as AnnouncementDraft["category"];
              update((current) => ({ ...current, category }));
            }}
          >
            {announcementCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ad-field">
          <span className="ad-label-row">
            <label htmlFor={id("repeat")}>Repeats</label>
            {nextDay && <span className="ad-next">Next: {dayText(nextDay, true)}</span>}
          </span>
          <select
            id={id("repeat")}
            className="ad-input"
            value={draft.recurrence}
            disabled={frozen || !draft.starts_on}
            onChange={(event) => {
              const recurrence = event.target.value as AnnouncementDraft["recurrence"];
              update((current) => ({ ...current, recurrence }));
            }}
          >
            {repeats.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {draft.category === "other" && (
        <div className="ad-two">
          <div className="ad-field">
            <label htmlFor={id("other")}>Category name</label>
            <input
              id={id("other")}
              className="ad-input"
              maxLength={40}
              placeholder="Repair"
              value={draft.category_other ?? ""}
              disabled={locked}
              data-field="category_other"
              onChange={(event) => {
                const name = event.target.value;
                update((current) => ({ ...current, category_other: name || null }));
              }}
              {...invalid(otherError, id("other-error"))}
            />
            <FieldError id={id("other-error")} message={otherError} />
          </div>
        </div>
      )}
      <div className="ad-flags">
        <Flag
          compact
          label="Add to Important Dates"
          hint={canWriteDates ? "Lists it on the Important Dates page" : "Your role can't add to Important Dates"}
          checked={draft.on_important_dates}
          disabled={locked || !canWriteDates}
          onChange={(checked) =>
            update((current) => ({
              ...current,
              on_important_dates: checked,
              ...(checked ? { on_calendar: true, on_schedule: true } : {}),
            }))
          }
        />
        <Flag
          compact
          label="Add to Calendar"
          hint="Marks the day in the Schedule calendar"
          checked={draft.on_calendar}
          disabled={locked}
          onChange={(checked) => update((current) => ({ ...current, on_calendar: checked }))}
        />
        <Flag
          compact
          label="Show on the Schedule"
          hint="A chip on its day in the Schedule"
          checked={draft.on_schedule}
          disabled={locked}
          onChange={(checked) => update((current) => ({ ...current, on_schedule: checked }))}
        />
      </div>
      <div className="ad-when" data-focus="when" role="group" aria-label="When">
        <div className="ad-field">
          <span className="ad-label-row">
            <label htmlFor={id("starts")}>Starts</label>
            {!needsDate && <span className="ad-optional">Optional</span>}
          </span>
          <input
            id={id("starts")}
            type="date"
            className="ad-input"
            min={started ? undefined : today}
            value={draft.starts_on ?? ""}
            disabled={frozen}
            data-field="starts_on"
            onChange={(event) => {
              const starts = event.target.value || null;
              update((current) => {
                const ends = !current.ends_on || (starts && current.ends_on < starts) ? starts : current.ends_on;
                const recurrence = repeatOptions(starts).some((option) => option.value === current.recurrence)
                  ? current.recurrence
                  : "none";
                return { ...current, starts_on: starts, ends_on: ends, recurrence };
              });
            }}
            {...invalid(startError, id("starts-error"))}
          />
          <FieldError id={id("starts-error")} message={startError} />
        </div>
        <div className="ad-field">
          <span className="ad-label-row">
            <label htmlFor={id("ends")}>Ends</label>
            {/* Checked by default; the times open when it's cleared (Mert, 2026-10-12). */}
            <label className="ad-check">
              <input
                type="checkbox"
                checked={allDay}
                disabled={frozen}
                onChange={(event) => {
                  const whole = event.target.checked;
                  update((current) => ({
                    ...current,
                    event_from: whole ? null : "15:00",
                    event_until: whole ? null : "16:00",
                  }));
                }}
              />
              All day
            </label>
          </span>
          <input
            id={id("ends")}
            type="date"
            className="ad-input"
            min={started ? today : (draft.starts_on ?? today)}
            value={draft.ends_on ?? ""}
            disabled={locked}
            data-field="ends_on"
            onChange={(event) => {
              const ends = event.target.value || null;
              update((current) => ({ ...current, ends_on: ends }));
            }}
            {...invalid(endError, id("ends-error"))}
          />
          <FieldError id={id("ends-error")} message={endError} />
        </div>
        <div className="ad-field">
          <AvailabilityClockInput
            className="ad-input ad-clock"
            label="Start time"
            value={draft.event_from ?? ""}
            timeFormat={timeFormat}
            placeholder={allDay ? "" : undefined}
            disabled={frozen || allDay}
            onChange={(from) => {
              if (from) update((current) => ({ ...current, event_from: from }));
            }}
          />
        </div>
        <div className="ad-field">
          <AvailabilityClockInput
            className="ad-input ad-clock"
            label="End time"
            value={draft.event_until ?? ""}
            timeFormat={timeFormat}
            placeholder={allDay ? "" : undefined}
            disabled={frozen || allDay}
            field="event_until"
            invalid={Boolean(untilError)}
            describedBy={untilError ? id("until-error") : undefined}
            onChange={(until) => {
              if (until) update((current) => ({ ...current, event_until: until }));
            }}
          />
          <FieldError id={id("until-error")} message={untilError} />
        </div>
      </div>
      <LocationsTable
        idPrefix={idPrefix}
        draft={draft}
        update={update}
        frozen={frozen}
        locked={locked}
        locations={locations}
        preview={preview}
        problemAt={problemAt}
        timeFormat={timeFormat}
      />
      {publishing}
      <div className="ad-field ad-message">
        <label htmlFor={id("body")}>Message</label>
        <textarea
          id={id("body")}
          className="ad-input"
          maxLength={5000}
          placeholder="Share the details your team needs."
          value={draft.body}
          disabled={locked}
          onChange={(event) => {
            const body = event.target.value;
            update((current) => ({ ...current, body }));
          }}
        />
      </div>
    </>
  );
}

const dayOptions: { value: AnnouncementDay; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "short", label: "Short hours" },
  { value: "closed", label: "Closed" },
];

/** Open · Short hours · Closed, each with its coloured dot (the reference's L1 buttons). */
function DaySeg({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: AnnouncementDay | null;
  disabled: boolean;
  onChange: (day: AnnouncementDay) => void;
}) {
  return (
    <span className="ad-seg" role="group" aria-label={label}>
      {dayOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          data-day={option.value}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          <span className="ad-dot" aria-hidden />
          {option.label}
        </button>
      ))}
    </span>
  );
}

function LocationsTable({
  idPrefix,
  draft,
  update,
  frozen,
  locked,
  locations,
  preview,
  problemAt,
  timeFormat,
}: {
  idPrefix: string;
  draft: AnnouncementDraft;
  update: Update;
  frozen: boolean;
  locked: boolean;
  locations: WhereLocation[];
  preview: AnnouncementPreview | undefined;
  problemAt: ProblemAt;
  timeFormat: TimeFormat;
}) {
  const rows = new Map(draft.locations.map((row) => [row.location_id, row]));
  const allChecked = locations.length > 1 && locations.every((location) => rows.has(location.id));
  const someChecked = !allChecked && locations.some((location) => rows.has(location.id));
  const allDays = new Set(locations.map((location) => rows.get(location.id)?.day));
  const allDay = allDays.size === 1 ? ([...allDays][0] ?? null) : null;
  const hoursAnywhere = locations.every((location) => location.canChangeHours);
  const lockedHours = !locked && locations.some((location) => !location.canChangeHours);
  const setDay = (locationId: string, day: AnnouncementDay) =>
    update((current) => ({
      ...current,
      locations: current.locations.map((row) =>
        row.location_id === locationId ? withDay(row, day) : row,
      ),
    }));
  const listed = preview?.shifts ?? null;
  const labelId = `${idPrefix}-locations`;
  return (
    <div className="ad-field" data-focus="locs">
      <span className="ad-label" id={labelId}>
        Locations
      </span>
      <div className="ad-locs" role="table" aria-labelledby={labelId}>
        <div className="ad-loc-head" role="row">
          <span role="columnheader">
            {locations.length > 1 ? (
              <label className="ad-loc-name">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(element) => {
                    if (element) element.indeterminate = someChecked;
                  }}
                  disabled={frozen}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    update((current) => ({
                      ...current,
                      locations: checked
                        ? [
                            ...current.locations,
                            ...locations
                              .filter((location) => !rows.has(location.id))
                              .map((location) => ({
                                location_id: location.id,
                                day: "open" as const,
                                opens: null,
                                closes: null,
                              })),
                          ]
                        : current.locations.filter(
                            (row) => !locations.some((location) => location.id === row.location_id),
                          ),
                    }));
                  }}
                />
                All locations
              </label>
            ) : (
              "Location"
            )}
          </span>
          <span role="columnheader">
            {allChecked && !frozen && hoursAnywhere ? (
              <DaySeg
                label="All locations that day"
                value={allDay}
                disabled={false}
                onChange={(day) =>
                  update((current) => ({
                    ...current,
                    locations: current.locations.map((row) => withDay(row, day)),
                  }))
                }
              />
            ) : (
              "That day"
            )}
          </span>
          <span role="columnheader" className="ad-loc-impact">
            Shifts
          </span>
        </div>
        {locations.map((location) => {
          const row = rows.get(location.id);
          const error = problemAt(`location:${location.id}`);
          const impact = locationImpact(
            row ?? null,
            Boolean(draft.starts_on),
            listed && listed.filter((shift) => shift.location_id === location.id),
          );
          return (
            <div key={location.id} role="row" className="ad-loc" data-off={!row} data-bad={Boolean(error)}>
              <span role="cell">
                <label className="ad-loc-name">
                  <input
                    type="checkbox"
                    checked={Boolean(row)}
                    disabled={frozen}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      update((current) => ({
                        ...current,
                        locations: checked
                          ? [
                              ...current.locations,
                              { location_id: location.id, day: "open", opens: null, closes: null },
                            ]
                          : current.locations.filter((item) => item.location_id !== location.id),
                      }));
                    }}
                  />
                  {location.name}
                </label>
              </span>
              <span role="cell" className="ad-loc-day">
                <span className="ad-day-stack">
                  {row ? (
                    <DaySeg
                      label={`${location.name} that day`}
                      value={row.day}
                      disabled={frozen || !location.canChangeHours}
                      onChange={(day) => setDay(location.id, day)}
                    />
                  ) : (
                    <span className="ad-muted">Not included</span>
                  )}
                  {row?.day === "short" && (
                    <span className="ad-times">
                      <AvailabilityClockInput
                        label={`${location.name} opens`}
                        value={row.opens ?? ""}
                        timeFormat={timeFormat}
                        disabled={frozen || !location.canChangeHours}
                        onChange={(opens) => {
                          if (opens)
                            update((current) => ({
                              ...current,
                              locations: current.locations.map((item) =>
                                item.location_id === location.id ? { ...item, opens } : item,
                              ),
                            }));
                        }}
                      />
                      –
                      <AvailabilityClockInput
                        label={`${location.name} closes`}
                        value={row.closes ?? ""}
                        timeFormat={timeFormat}
                        disabled={frozen || !location.canChangeHours}
                        onChange={(closes) => {
                          if (closes)
                            update((current) => ({
                              ...current,
                              locations: current.locations.map((item) =>
                                item.location_id === location.id ? { ...item, closes } : item,
                              ),
                            }));
                        }}
                      />
                    </span>
                  )}
                </span>
                {row?.day === "short" && row.opens && row.closes && closesNextDay(row.opens, row.closes) && (
                  <span className="ad-next-day">next day</span>
                )}
              </span>
              <span role="cell" className="ad-loc-impact" data-tone={impact.tone}>
                {impact.text}
              </span>
              {error && (
                <span className="ad-loc-error">
                  <FieldError message={error} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {lockedHours && (
        <p className="ad-note">Your role can&apos;t change opening hours. Checked locations keep their usual hours.</p>
      )}
      {preview && preview.quiet_count > 0 && (
        <p className="ad-note">
          {plural(preview.quiet_count, "shift")} in a week that isn&apos;t published yet follow the same defaults,
          without a shift notice.
        </p>
      )}
    </div>
  );
}

function withDay(
  row: AnnouncementDraft["locations"][number],
  day: AnnouncementDay,
): AnnouncementDraft["locations"][number] {
  if (day === "short") return { ...row, day, opens: row.opens ?? "10:00", closes: row.closes ?? "15:00" };
  return { ...row, day, opens: null, closes: null };
}

/** Schedule for later: the box is always there and opens only when checked (Mert, 2026-10-12). */
export function PublishingRow({
  idPrefix,
  later,
  laterBlocked,
  publishWall,
  minWall,
  locked,
  problem,
  timeFormat,
  onLater,
  onWall,
}: {
  idPrefix: string;
  later: boolean;
  laterBlocked: boolean;
  /** "2026-11-26T09:00", or a half: "2026-11-26T" / "T09:00". */
  publishWall: string;
  minWall: string;
  locked: boolean;
  problem: string | undefined;
  timeFormat: TimeFormat;
  onLater: (later: boolean) => void;
  onWall: (wall: string) => void;
}) {
  const errorId = `${idPrefix}-publish-error`;
  // A day box and a clock box, so the time reads in the workspace's 12h or 24h clock.
  const [day = "", clock = ""] = publishWall.split("T");
  return (
    <div className="ad-flag ad-publish-row" data-focus="pub">
      <label className="ad-publish-label">
        <input
          type="checkbox"
          checked={later}
          disabled={locked || laterBlocked}
          onChange={(event) => onLater(event.target.checked)}
        />
        <b>Schedule for later</b>
      </label>
      <span className="ad-publish-at">
        <span className="ad-publish-boxes">
          <input
            type="date"
            className="ad-input"
            aria-label="Publish on"
            value={day}
            min={minWall.slice(0, 10)}
            disabled={locked || !later}
            data-field="publish_at"
            onChange={(event) => onWall(`${event.target.value}T${clock}`)}
            {...invalid(problem, errorId)}
          />
          <AvailabilityClockInput
            className="ad-input ad-clock"
            label="Publish at"
            value={clock}
            timeFormat={timeFormat}
            placeholder={later ? undefined : ""}
            disabled={locked || !later}
            invalid={Boolean(problem)}
            describedBy={problem ? errorId : undefined}
            onChange={(next) => onWall(`${day}T${next}`)}
          />
        </span>
        <FieldError id={errorId} message={problem} />
      </span>
      {laterBlocked && <span className="ad-hint">It starts today, so it goes out when you publish.</span>}
    </div>
  );
}

// ---------- Audience ----------

export type Acknowledgements = {
  people: NonNullable<AnnouncementDetail["acknowledgements"]>;
  zone: string;
  timeFormat: TimeFormat;
};

/** Audience is one list (Mert, 2026-10-12, variant C): who gets it, and "+ Add people" opens a search in its place.
 * Nobody is picked until checked; picks survive a new search. "Ask people to acknowledge" stays last. */
export function AudienceTab({
  draft,
  update,
  locked,
  list,
  people,
  me,
  checkedLocations,
  recipientCount,
  shiftPeople,
  problem,
  acks,
}: {
  draft: AnnouncementDraft;
  update: Update;
  locked: boolean;
  list: AnnouncementList;
  /** Everyone the drawer can name: the list's people and the post's own. */
  people: Map<string, AnnouncementPerson>;
  me: string | null;
  checkedLocations: { id: string; name: string; count: number | null }[];
  recipientCount: number;
  shiftPeople: { user_id: string; name: string; meta: string }[];
  problem: string | undefined;
  /** A published post that asks to acknowledge: who has and who hasn't (Mert, 2026-10-12). */
  acks?: Acknowledgements;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const checked = new Set(checkedLocations.map((location) => location.id));
  const atChecked = (person: AnnouncementPerson) => person.location_ids.some((id) => checked.has(id));
  const meta = (person: AnnouncementPerson) =>
    [person.job_name, person.location_name].filter(Boolean).join(" · ");
  const pool = list.people.filter(
    (person) => person.user_id !== me && !draft.people.includes(person.user_id) && !atChecked(person),
  );
  const words = query.trim().toLowerCase();
  const shown = pool.filter((person) => !words || `${person.name} ${meta(person)}`.toLowerCase().includes(words));
  const picked = pool.filter((person) => chosen.has(person.user_id));
  const allShownPicked = shown.length > 0 && shown.every((person) => chosen.has(person.user_id));
  const asked = acks?.people ?? [];
  const askedIds = new Set(asked.map((person) => person.user_id));
  // Someone asked to acknowledge reads under Not yet or Acknowledged instead.
  const added = draft.people
    .map((id) => people.get(id) ?? null)
    .filter(
      (person): person is AnnouncementPerson =>
        person !== null && !atChecked(person) && !askedIds.has(person.user_id),
    );
  const unknownAdded = draft.people.filter((id) => !people.has(id) && !askedIds.has(id)).length;
  const notYet = asked.filter((person) => !person.acknowledged_at);
  const done = asked.filter((person) => person.acknowledged_at);
  const share = asked.length ? Math.round((done.length / asked.length) * 100) : 0;

  const close = () => {
    setAdding(false);
    setQuery("");
    setChosen(new Set());
  };
  const choose = (ids: string[], on: boolean) => {
    const next = new Set(chosen);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setChosen(next);
  };
  const addPicked = () => {
    const ids = picked.map((person) => person.user_id);
    update((current) => ({ ...current, people: [...current.people, ...ids] }));
    close();
  };
  const row = (person: { user_id: string; name: string }, sub: string, end?: ReactNode) => (
    <div className="ad-row" key={person.user_id}>
      <span className="ad-avatar ad-av" aria-hidden>
        {initials(person.name)}
      </span>
      <span className="ad-row-text">
        <b>{person.name}</b>
        <small>{sub}</small>
      </span>
      {end}
      {!locked && draft.people.includes(person.user_id) && (
        <button
          type="button"
          className="ad-x"
          aria-label={`Remove ${person.name}`}
          onClick={() =>
            update((current) => ({ ...current, people: current.people.filter((id) => id !== person.user_id) }))
          }
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );

  return (
    <>
      <section className="ad-pane ad-who" aria-label="Who gets it">
        <div className="ad-who-head">
          <b>{adding ? "Add people" : "Who gets it"}</b>
          {!adding && <span className="ad-who-pill">{plural(recipientCount, "person", "people")}</span>}
          {!adding && !locked && (
            <Button type="button" className="secondary-button ad-add-open" onClick={() => setAdding(true)}>
              <Plus size={15} aria-hidden /> Add people
            </Button>
          )}
        </div>
        {adding ? (
          <>
            <label className="ad-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Search name, job or location"
                aria-label="Search people"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="ad-list">
              {shown.length ? (
                <label className="ad-row ad-row-all">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allShownPicked}
                    onChange={(event) => choose(shown.map((person) => person.user_id), event.target.checked)}
                  />
                  <span className="ad-row-text">
                    <b>Select all</b>
                  </span>
                  <span className="ad-count">{shown.length}</span>
                </label>
              ) : (
                <div className="ad-empty">{pool.length ? "Nobody matches." : "Everyone already gets it."}</div>
              )}
              {shown.map((person) => (
                <label className="ad-row" key={person.user_id}>
                  <input
                    type="checkbox"
                    checked={chosen.has(person.user_id)}
                    onChange={(event) => choose([person.user_id], event.target.checked)}
                  />
                  <span className="ad-avatar ad-av" aria-hidden>
                    {initials(person.name)}
                  </span>
                  <span className="ad-row-text">
                    <b>{person.name}</b>
                    <small>{meta(person)}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="ad-pick-foot">
              <span className="ad-muted">{picked.length ? `${picked.length} selected` : "Pick people to add"}</span>
              <Button type="button" className="secondary-button" onClick={close}>
                Cancel
              </Button>
              <Button type="button" disabled={!picked.length} onClick={addPicked}>
                {picked.length ? `Add ${plural(picked.length, "person", "people")}` : "Add"}
              </Button>
            </div>
          </>
        ) : (
          <div className="ad-list">
            {acks && (
              <div className="ad-ack-box">
                {/* No Remind until the new notification system brings it back (Mert, 2026-10-16; BILDIRIM-05). */}
                <div className="ad-ack-line">
                  <span>
                    <b>{done.length}</b> of {asked.length} acknowledged
                  </span>
                </div>
                <span className="ad-bar" aria-hidden>
                  <span style={{ width: `${share}%` }} />
                </span>
              </div>
            )}
            {problem && (
              <div className="ad-pane-error">
                <FieldError message={problem} />
              </div>
            )}
            {checkedLocations.length > 0 && (
              <>
                <div className="ad-group">From locations</div>
                {checkedLocations.map((location) => (
                  <div className="ad-row" key={location.id}>
                    <span className="ad-ico" aria-hidden>
                      <MapPin size={14} />
                    </span>
                    <span className="ad-row-text">
                      <b>{location.name}</b>
                      <small>
                        Everyone there{location.count !== null ? ` · ${plural(location.count, "person", "people")}` : ""}
                      </small>
                    </span>
                  </div>
                ))}
              </>
            )}
            {(added.length > 0 || unknownAdded > 0) && (
              <>
                <div className="ad-group">
                  Added here · {added.length + unknownAdded}
                  {!locked && (
                    <button type="button" className="ad-link" onClick={() => update((current) => ({ ...current, people: [] }))}>
                      Clear
                    </button>
                  )}
                </div>
                {added.map((person) => row(person, meta(person)))}
                {unknownAdded > 0 && (
                  <div className="ad-row">
                    <span className="ad-muted">{plural(unknownAdded, "other person", "other people")}</span>
                  </div>
                )}
              </>
            )}
            {shiftPeople.length > 0 && (
              <>
                <div className="ad-group">Their shift changes · {shiftPeople.length}</div>
                {shiftPeople.map((person) => row(person, person.meta))}
              </>
            )}
            {notYet.length > 0 && (
              <>
                <div className="ad-group" data-tone="amber">
                  Not yet · {notYet.length}
                </div>
                {notYet.map((person) => row(person, meta(person)))}
              </>
            )}
            {done.length > 0 && (
              <>
                <div className="ad-group" data-tone="green">
                  Acknowledged · {done.length}
                </div>
                {done.map((person) =>
                  row(
                    person,
                    meta(person),
                    <span className="ad-ack-when">
                      <Check size={13} aria-hidden />
                      {momentText(person.acknowledged_at!, acks!.zone, acks!.timeFormat)}
                    </span>,
                  ),
                )}
              </>
            )}
            {!checkedLocations.length && !added.length && !unknownAdded && !shiftPeople.length && !asked.length && !problem && (
              <div className="ad-empty">Nobody yet. Check a location on Details or add people.</div>
            )}
          </div>
        )}
      </section>
      <div className="ad-ack-flag">
        <Flag
          label="Ask people to acknowledge"
          hint="They see an Acknowledge button. You see who has and who hasn't."
          checked={draft.ask_ack}
          disabled={locked}
          onChange={(ask) => update((current) => ({ ...current, ask_ack: ask }))}
        />
      </div>
    </>
  );
}

// ---------- Shifts ----------

export function effectiveChoice(
  shift: AnnouncementImpactShift,
  choices: AnnouncementDraft["choices"],
): AnnouncementShiftChoice {
  if (shift.started) return { choice: "keep" };
  const local = choices[shift.source_id];
  if (local && !(local.choice === "remove" && shift.tied) && !(local.choice === "open" && !shift.employee_id))
    return local;
  if (shift.choice === "edit" && shift.from && shift.until)
    return { choice: "edit", from: shift.from, until: shift.until };
  return { choice: shift.choice === "edit" ? "keep" : shift.choice };
}

export function ShiftsTab({
  status,
  draft,
  update,
  locked,
  preview,
  changes,
  timeFormat,
  applyText,
  busy,
  onBringBack,
}: {
  status: string | null;
  draft: AnnouncementDraft;
  update: Update;
  locked: boolean;
  preview: AnnouncementPreview | undefined;
  /** A post the reader can't change: the shifts it changed, as they stand. */
  changes?: AnnouncementShiftChange[];
  timeFormat: TimeFormat;
  /** When the choices apply: "when it publishes", "when you save", or the scheduled moment. */
  applyText: string;
  busy: boolean;
  onBringBack: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const backRows = preview?.bring_back ?? [];
  // The tab shows only when a shift is reached (Mert, 2026-10-12), so each
  // branch below has something to list.
  if (changes) {
    const live = changes.filter((change) => !change.brought_back_at);
    return (
      <section className="ad-shift-group" aria-label="Changed shifts">
        <div className="ad-shift-group-head">
          <span className="ad-strong">Changed shifts</span>
          <span className="ad-shift-count">{plural(live.length, "shift")}</span>
        </div>
        {live.map((change) => (
          <div className="ad-back-row" key={change.id} data-locked="true">
            <span />
            <span className="ad-avatar" aria-hidden>
              {initials(change.employee_name)}
            </span>
            <span className="ad-back-name">
              <b>{change.employee_name ?? "Open shift"}</b>
              <span>
                {[dayText(change.scheduled_date), change.location_name, shiftTime(change, timeFormat), changeText(change, timeFormat)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </div>
        ))}
      </section>
    );
  }
  if (status === "unpublished")
    return (
      <BringBack
        rows={backRows}
        selected={draft.bring_back}
        update={update}
        locked={locked}
        standalone
        busy={busy}
        timeFormat={timeFormat}
        onBringBack={onBringBack}
      />
    );
  const hours = draft.locations.some((row) => row.day !== "open");
  const shifts = preview?.shifts ?? [];
  const counts = preview?.counts ?? { removed: 0, edited: 0, opened: 0, kept: 0, quiet: 0 };
  const groups: { key: string; items: AnnouncementImpactShift[] }[] = [];
  for (const shift of shifts) {
    const key = `${shift.scheduled_date}|${shift.location_id}`;
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1)!.items.push(shift);
  }
  const setChoice = (sourceId: string, choice: AnnouncementShiftChoice | null) =>
    update((current) => {
      const choices = { ...current.choices };
      if (choice) choices[sourceId] = choice;
      else delete choices[sourceId];
      return { ...current, choices };
    });
  return (
    <>
      {hours && (
        <>
          <div className="ad-sums">
            {(
              [
                ["removed", "Removed", "red"],
                ["edited", "Shortened", "blue"],
                ["opened", "Open shift", ""],
                ["kept", "Kept", ""],
              ] as const
            ).map(([key, label, tone]) => (
              <span key={key} className="ad-sum" data-tone={tone || undefined} data-zero={!counts[key]}>
                <b>{counts[key]}</b>
                {label}
              </span>
            ))}
          </div>
          <p className="ad-desc">
            Choices apply {applyText}. Until then this list follows the Schedule. Shifts inside the hours aren&apos;t
            listed.
          </p>
          {!shifts.length && <div className="ad-empty-tab">Every shift on these days fits the hours.</div>}
          {groups.map((group) => {
            const first = group.items[0]!;
            return (
              <section className="ad-shift-group" key={group.key} aria-label={`${dayText(first.scheduled_date)}, ${first.location_name}`}>
                <div className="ad-shift-group-head">
                  <span className="ad-strong">{dayText(first.scheduled_date)}</span>
                  <span className="ad-strong ad-dot-before">{first.location_name}</span>
                  <span className="ad-pill" data-tone={first.day === "closed" ? "red" : "amber"}>
                    {first.day === "closed" || !first.opens || !first.closes
                      ? "Closed"
                      : `Short hours ${hoursText(first.opens, first.closes, timeFormat)}`}
                  </span>
                  <span className="ad-shift-count">{plural(group.items.length, "shift")}</span>
                </div>
                {group.items.map((shift) => (
                  <ShiftRow
                    key={shift.source_id}
                    shift={shift}
                    choice={effectiveChoice(shift, draft.choices)}
                    locked={locked}
                    editing={editing === shift.source_id}
                    timeFormat={timeFormat}
                    onChoice={(choice) => setChoice(shift.source_id, choice)}
                    onEdit={(open) => setEditing(open ? shift.source_id : null)}
                  />
                ))}
              </section>
            );
          })}
        </>
      )}
      {backRows.length > 0 && (
        <BringBack
          rows={backRows}
          selected={draft.bring_back}
          update={update}
          locked={locked}
          standalone={false}
          busy={busy}
          timeFormat={timeFormat}
          onBringBack={onBringBack}
        />
      )}
    </>
  );
}

function ShiftRow({
  shift,
  choice,
  locked,
  editing,
  timeFormat,
  onChoice,
  onEdit,
}: {
  shift: AnnouncementImpactShift;
  choice: AnnouncementShiftChoice;
  locked: boolean;
  editing: boolean;
  timeFormat: TimeFormat;
  onChoice: (choice: AnnouncementShiftChoice | null) => void;
  onEdit: (open: boolean) => void;
}) {
  const name = shift.employee_name ?? "Open shift";
  const time = hoursText(shift.start_time, shift.end_time, timeFormat);
  const edited = choice.choice === "edit" ? choice : null;
  const fit = shift.reason === "over" ? fitToHours(shift) : null;
  // The chosen button wears its outcome: Remove red, Open shift amber, Keep green (Mert, 2026-10-12).
  const options: { value: "remove" | "open" | "keep"; label: string; tone: string }[] = [
    { value: "remove", label: "Remove", tone: "red" },
    ...(shift.employee_id ? [{ value: "open" as const, label: "Open shift", tone: "amber" }] : []),
    { value: "keep", label: "Keep", tone: "green" },
  ];
  const pressed = choice.choice === "edit" ? "keep" : choice.choice;
  return (
    <div className="ad-shift" data-locked={shift.started}>
      <span className="ad-avatar" aria-hidden>
        {initials(shift.employee_name)}
      </span>
      <div className="ad-shift-who">
        <b>{name}</b>
        <span>{shift.job_name}</span>
      </div>
      <div className="ad-shift-time">
        {edited ? (
          <>
            <b className="ad-strike">{time}</b>
            <span className="ad-chip" data-tone="blue">
              Now {hoursText(edited.from, edited.until, timeFormat)}
            </span>
          </>
        ) : (
          <b>{time}</b>
        )}
        {shift.started ? (
          <span className="ad-tag">Started · can&apos;t change</span>
        ) : shift.changed_in_schedule ? (
          <span className="ad-tag" data-tone="blue">
            Changed in Schedule
          </span>
        ) : shift.tied ? (
          <span className="ad-tag">Tied to time off or an offboarding · can&apos;t remove</span>
        ) : edited ? null : (
          <span className="ad-why">{shiftReason(shift)}</span>
        )}
      </div>
      <div className="ad-shift-acts">
        {!shift.started && (
          <span className="ad-seg" role="group" aria-label={`What happens to ${name}'s shift`}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                data-tone={option.tone}
                aria-pressed={pressed === option.value}
                disabled={locked || (option.value === "remove" && shift.tied)}
                onClick={() => onChoice({ choice: option.value })}
              >
                {option.label}
              </button>
            ))}
          </span>
        )}
        {!shift.started && shift.day === "short" && !locked && !editing && (
          <span className="ad-shift-more">
            {fit && (
              <button type="button" className="ad-link" onClick={() => onChoice({ choice: "edit", ...fit })}>
                Fit to hours
              </button>
            )}
            <button
              type="button"
              className="ad-link"
              onClick={() => {
                if (!edited) onChoice({ choice: "edit", from: shift.start_time, until: shift.end_time });
                onEdit(true);
              }}
            >
              Edit time
            </button>
          </span>
        )}
      </div>
      {editing && (
        <div className="ad-shift-edit">
          <label>
            <span>Starts</span>
            <AvailabilityClockInput
              label="New start"
              value={edited?.from ?? shift.start_time}
              timeFormat={timeFormat}
              onChange={(from) => {
                if (from) onChoice({ choice: "edit", from, until: edited?.until ?? shift.end_time });
              }}
            />
          </label>
          <label>
            <span>Ends</span>
            <AvailabilityClockInput
              label="New end"
              value={edited?.until ?? shift.end_time}
              timeFormat={timeFormat}
              onChange={(until) => {
                if (until) onChoice({ choice: "edit", from: edited?.from ?? shift.start_time, until });
              }}
            />
          </label>
          {fit && shift.opens && shift.closes && (
            <Button type="button" className="secondary-button" onClick={() => onChoice({ choice: "edit", ...fit })}>
              Fit to {hoursText(shift.opens, shift.closes, timeFormat)}
            </Button>
          )}
          <Button type="button" onClick={() => onEdit(false)}>
            Done
          </Button>
          {edited && (
            <button
              type="button"
              className="ad-link"
              data-tone="red"
              onClick={() => {
                onChoice(null);
                onEdit(false);
              }}
            >
              Undo edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function changeText(change: AnnouncementShiftChange, timeFormat: TimeFormat): string {
  if (change.outcome === "removed") return "Removed";
  if (change.outcome === "opened") return "Made an open shift";
  return change.after_start && change.after_end
    ? `Shortened to ${hoursText(change.after_start, change.after_end, timeFormat)}`
    : "Shortened";
}

function shiftTime(change: AnnouncementShiftChange, timeFormat: TimeFormat): string {
  return change.start_time && change.end_time ? hoursText(change.start_time, change.end_time, timeFormat) : "";
}

function BringBack({
  rows,
  selected,
  update,
  locked,
  standalone,
  busy,
  timeFormat,
  onBringBack,
}: {
  rows: AnnouncementShiftChange[];
  selected: string[];
  update: Update;
  locked: boolean;
  standalone: boolean;
  busy: boolean;
  timeFormat: TimeFormat;
  onBringBack: (ids: string[]) => void;
}) {
  if (!rows.length)
    return standalone ? <div className="ad-empty-tab">No shift to bring back.</div> : null;
  const free = rows.filter((row) => !row.lock);
  const chosen = free.filter((row) => selected.includes(row.id));
  const toggle = (id: string, on: boolean) =>
    update((current) => ({
      ...current,
      bring_back: on ? [...new Set([...current.bring_back, id])] : current.bring_back.filter((item) => item !== id),
    }));
  return (
    <section className="ad-back" data-focus="bring" aria-label="Bring back">
      <div className="ad-back-head">
        <div>
          <b>Bring back</b>
          <p className="ad-desc">
            {standalone
              ? "These shifts changed because of this post. Nothing comes back on its own: check the ones to put back on the Schedule. Bring back works on its own; publishing again sends the post as new."
              : "These shifts aren't affected anymore. Nothing comes back on its own: check the ones to put back. They come back when you save."}
          </p>
        </div>
        <button
          type="button"
          className="ad-link"
          disabled={locked || !free.length}
          onClick={() =>
            update((current) => ({
              ...current,
              bring_back: [...new Set([...current.bring_back, ...free.map((row) => row.id)])],
            }))
          }
        >
          Select all
        </button>
      </div>
      {rows.map((row) => (
        <label className="ad-back-row" key={row.id} data-locked={Boolean(row.lock)}>
          <input
            type="checkbox"
            checked={!row.lock && selected.includes(row.id)}
            disabled={Boolean(row.lock) || locked}
            onChange={(event) => toggle(row.id, event.target.checked)}
          />
          <span className="ad-avatar" aria-hidden>
            {initials(row.employee_name)}
          </span>
          <span className="ad-back-name">
            <b>{row.employee_name ?? "Open shift"}</b>
            <span>
              {[dayText(row.scheduled_date), row.location_name, shiftTime(row, timeFormat), changeText(row, timeFormat)]
                .filter(Boolean)
                .join(" · ")}
              {row.lock && <span className="ad-tag"> {row.lock}</span>}
            </span>
          </span>
        </label>
      ))}
      {standalone && (
        <div className="ad-back-foot">
          <Button
            type="button"
            disabled={!chosen.length || locked || busy}
            onClick={() => onBringBack(chosen.map((row) => row.id))}
          >
            {chosen.length ? `Bring back ${plural(chosen.length, "shift")}` : "Bring back"}
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------- History ----------

export function HistoryTab({
  record,
  zone,
  timeFormat,
}: {
  record: AnnouncementDetail;
  zone: string;
  timeFormat: TimeFormat;
}) {
  const entries = record.history ?? [];
  const lastPublished = entries.reduce((found, entry, index) => (entry.action === "published" ? index : found), -1);
  const changes = (record.changes ?? []).filter((change) => !change.brought_back_at);
  const ordered = entries.map((entry, index) => ({ entry, index })).reverse();
  if (!ordered.length) return <div className="ad-empty-tab">Nothing has happened yet.</div>;
  return (
    <ol className="ad-history">
      {ordered.map(({ entry, index }, position) => {
        const step = historyStep(entry, zone, timeFormat);
        const said = typeof entry.detail.shift_changes === "number" ? entry.detail.shift_changes : 0;
        return (
          <li key={entry.id} data-bad={step.bad} data-last={position === ordered.length - 1}>
            <span className="ad-history-dot" aria-hidden />
            <div>
              <strong>{step.head}</strong>
              <small>{momentText(entry.changed_at, zone, timeFormat)}</small>
              {step.more && <span className="ad-history-more">{step.more}</span>}
              {index === lastPublished && changes.length > 0 && (
                <details className="ad-history-changes">
                  <summary>
                    {said === changes.length
                      ? `Show the ${plural(changes.length, "shift change")}`
                      : `${plural(changes.length, "shift")} still changed · show`}
                  </summary>
                  <ul>
                    {changes.map((change) => (
                      <li key={change.id}>
                        {[
                          change.employee_name ?? "Open shift",
                          dayText(change.scheduled_date),
                          change.location_name,
                          shiftTime(change, timeFormat),
                          changeText(change, timeFormat).toLowerCase(),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {change.silent && " (week not published yet, no notice)"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
