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
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  announcementCategories,
  closesNextDay,
  dayText,
  fitToHours,
  historyStep,
  hoursText,
  initials,
  momentText,
  nextYearDay,
  plural,
  repeatOptions,
  shiftReason,
  shiftSummary,
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
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="ad-flag">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <b>{label}</b>
        <span className="ad-hint">{hint}</span>
      </span>
    </label>
  );
}

const dayOptions: { value: AnnouncementDay; label: string; tone: string }[] = [
  { value: "open", label: "Open", tone: "green" },
  { value: "closed", label: "Closed", tone: "red" },
  { value: "short", label: "Short hours", tone: "amber" },
];

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
          data-tone={option.tone}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

// ---------- Details ----------

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
        {draft.category === "other" && (
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
        )}
      </div>
      <div className="ad-field">
        <label htmlFor={id("body")}>Message</label>
        <textarea
          id={id("body")}
          className="ad-input"
          rows={3}
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
      <div className="ad-flags">
        <Flag
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
          label="Add to Calendar"
          hint="Marks the day in the Schedule calendar"
          checked={draft.on_calendar}
          disabled={locked}
          onChange={(checked) => update((current) => ({ ...current, on_calendar: checked }))}
        />
      </div>
      <section className="ad-section" data-focus="when" aria-label="When">
        <div className="ad-section-head">
          <span className="ad-when">
            <b>When</b>
            {!needsDate && <span className="ad-optional">Optional · after it ends it moves to Past</span>}
          </span>
          {!frozen &&
            (draft.event_from ? (
              <button
                type="button"
                className="ad-link"
                data-tone="red"
                onClick={() => update((current) => ({ ...current, event_from: null, event_until: null }))}
              >
                Remove time
              </button>
            ) : (
              <span className="ad-add-time">
                <span className="ad-muted">All day</span>
                <button
                  type="button"
                  className="ad-link"
                  onClick={() =>
                    update((current) => ({ ...current, event_from: "15:00", event_until: "16:00" }))
                  }
                >
                  + Add time
                </button>
              </span>
            ))}
        </div>
        <div className="ad-two">
          <div className="ad-field">
            <label htmlFor={id("starts")}>Starts</label>
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
            <label htmlFor={id("ends")}>Ends</label>
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
        </div>
        {draft.event_from !== null && (
          <div className="ad-two">
            <div className="ad-field">
              <label htmlFor={id("from")}>Start time</label>
              <input
                id={id("from")}
                type="time"
                className="ad-input"
                value={draft.event_from ?? ""}
                disabled={frozen}
                onChange={(event) => {
                  const from = event.target.value;
                  if (from) update((current) => ({ ...current, event_from: from }));
                }}
              />
            </div>
            <div className="ad-field">
              <label htmlFor={id("until")}>End time</label>
              <input
                id={id("until")}
                type="time"
                className="ad-input"
                value={draft.event_until ?? ""}
                disabled={frozen}
                data-field="event_until"
                onChange={(event) => {
                  const until = event.target.value;
                  if (until) update((current) => ({ ...current, event_until: until }));
                }}
                {...invalid(untilError, id("until-error"))}
              />
              <FieldError id={id("until-error")} message={untilError} />
            </div>
          </div>
        )}
        <div className="ad-field">
          <label htmlFor={id("repeat")}>Repeats</label>
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
          {nextDay && <span className="ad-next">Next: {dayText(nextDay, true)}</span>}
        </div>
      </section>
    </>
  );
}

// ---------- Locations & publishing ----------

export type WhereLocation = {
  id: string;
  name: string;
  canChangeHours: boolean;
};

export function WhereTab({
  draft,
  update,
  locked,
  started,
  locations,
  preview,
  problemAt,
  publishing,
  onShowShifts,
}: {
  draft: AnnouncementDraft;
  update: Update;
  locked: boolean;
  started: boolean;
  locations: WhereLocation[];
  preview: AnnouncementPreview | undefined;
  problemAt: ProblemAt;
  publishing: ReactNode;
  onShowShifts: () => void;
}) {
  const frozen = locked || started;
  const rows = new Map(draft.locations.map((row) => [row.location_id, row]));
  const allChecked = locations.length > 1 && locations.every((location) => rows.has(location.id));
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
  const listed = preview?.shifts ?? [];
  return (
    <>
      <section className="ad-section ad-section-first" data-focus="locs" aria-label="Locations and hours">
        <div className="ad-section-head">
          <b>Locations &amp; hours</b>
        </div>
        <p className="ad-desc">
          Pick the locations this is about. If it changes their opening hours, set them here and shifts follow.
          The time on Details is only the event&apos;s own time.
        </p>
        <div className="ad-locs" role="table" aria-label="Locations">
          <div className="ad-loc-head" role="row">
            <span role="columnheader">
              {locations.length > 1 ? (
                <label className="ad-loc-name">
                  <input
                    type="checkbox"
                    checked={allChecked}
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
            const here = listed.filter((shift) => shift.location_id === location.id);
            const counts = { removed: 0, edited: 0, opened: 0, kept: 0 };
            for (const shift of here) counts[shift.outcome] += 1;
            const bits = [
              counts.removed && `${counts.removed} removed`,
              counts.edited && `${counts.edited} shortened`,
              counts.opened && `${counts.opened} open`,
              counts.kept && `${counts.kept} kept`,
            ].filter(Boolean);
            const impact = !row
              ? ""
              : row.day === "open"
                ? "Usual hours"
                : !draft.starts_on
                  ? "Pick a day"
                  : !preview
                    ? ""
                    : bits.length
                      ? bits.join(" · ")
                      : "No shifts change";
            return (
              <div
                key={location.id}
                role="row"
                className="ad-loc"
                data-off={!row}
                data-bad={Boolean(error)}
              >
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
                        <input
                          type="time"
                          aria-label={`${location.name} opens`}
                          value={row.opens ?? ""}
                          disabled={frozen || !location.canChangeHours}
                          onChange={(event) => {
                            const opens = event.target.value;
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
                        <input
                          type="time"
                          aria-label={`${location.name} closes`}
                          value={row.closes ?? ""}
                          disabled={frozen || !location.canChangeHours}
                          onChange={(event) => {
                            const closes = event.target.value;
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
                <span role="cell" className="ad-loc-impact" data-tone={counts.removed ? "red" : undefined}>
                  {impact}
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
        {listed.length > 0 && !locked && (
          <p className="ad-note" data-tone="warn">
            {shiftSummary(preview!.counts)}. Review them in the{" "}
            <button type="button" className="ad-link" onClick={onShowShifts}>
              Shifts
            </button>{" "}
            tab.
          </p>
        )}
      </section>
      {publishing}
    </>
  );
}

function withDay(
  row: AnnouncementDraft["locations"][number],
  day: AnnouncementDay,
): AnnouncementDraft["locations"][number] {
  if (day === "short") return { ...row, day, opens: row.opens ?? "10:00", closes: row.closes ?? "15:00" };
  return { ...row, day, opens: null, closes: null };
}

export function PublishingSection({
  idPrefix,
  status,
  publishedText,
  later,
  laterBlocked,
  publishWall,
  minWall,
  locked,
  problem,
  onSchedule,
  onLater,
  onWall,
  onOnSchedule,
}: {
  idPrefix: string;
  status: string | null;
  publishedText: string | null;
  later: boolean;
  laterBlocked: boolean;
  publishWall: string;
  minWall: string;
  locked: boolean;
  problem: string | undefined;
  onSchedule: boolean;
  onLater: (later: boolean) => void;
  onWall: (wall: string) => void;
  onOnSchedule: (checked: boolean) => void;
}) {
  const errorId = `${idPrefix}-publish-error`;
  return (
    <section className="ad-section" data-focus="pub" aria-label="Publishing">
      <div className="ad-section-head">
        <b>Publishing</b>
      </div>
      {status === "published" || status === "past" ? (
        <p className="ad-desc">{publishedText ? `Published ${publishedText}.` : "Published."}</p>
      ) : (
        <>
          <div className="ad-flag ad-publish-row">
            <label className="ad-publish-label">
              <input
                type="checkbox"
                checked={later}
                disabled={locked || laterBlocked}
                onChange={(event) => onLater(event.target.checked)}
              />
              <b>Schedule for later</b>
            </label>
            {later ? (
              <span className="ad-publish-at">
                <input
                  type="datetime-local"
                  className="ad-input"
                  aria-label="Publish on"
                  value={publishWall}
                  min={minWall}
                  disabled={locked}
                  data-field="publish_at"
                  onChange={(event) => onWall(event.target.value)}
                  {...invalid(problem, errorId)}
                />
                <FieldError id={errorId} message={problem} />
              </span>
            ) : (
              <span className="ad-hint">
                {laterBlocked ? "It starts today, so it goes out when you publish." : "Off: it goes out when you publish."}
              </span>
            )}
          </div>
          {!later && <FieldError id={errorId} message={problem} />}
        </>
      )}
      <Flag
        label="Show on the Schedule"
        hint="A chip on its day in the Schedule"
        checked={onSchedule}
        disabled={locked}
        onChange={onOnSchedule}
      />
    </section>
  );
}

// ---------- Audience ----------

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
}) {
  const [filter, setFilter] = useState({ location: "", department: "", job: "" });
  const [unpicked, setUnpicked] = useState<Set<string>>(new Set());
  const checked = new Set(checkedLocations.map((location) => location.id));
  const atChecked = (person: AnnouncementPerson) => person.location_ids.some((id) => checked.has(id));
  const pool = list.people.filter(
    (person) => person.user_id !== me && !draft.people.includes(person.user_id) && !atChecked(person),
  );
  const byLocation = pool.filter((person) => !filter.location || person.location_ids.includes(filter.location));
  const departments = list.departments.filter((department) =>
    byLocation.some((person) => person.department_ids.includes(department.id)),
  );
  const department = departments.some((item) => item.id === filter.department) ? filter.department : "";
  const byDepartment = byLocation.filter((person) => !department || person.department_ids.includes(department));
  const jobs = list.jobs.filter((job) => byDepartment.some((person) => person.job_ids.includes(job.id)));
  const job = jobs.some((item) => item.id === filter.job) ? filter.job : "";
  const shown = byDepartment.filter((person) => !job || person.job_ids.includes(job));
  const picked = shown.filter((person) => !unpicked.has(person.user_id));
  const locationOptions = list.locations.filter((location) =>
    pool.some((person) => person.location_ids.includes(location.id)),
  );
  const added = draft.people
    .map((id) => people.get(id) ?? null)
    .filter((person): person is AnnouncementPerson => person !== null && !atChecked(person));
  const unknownAdded = draft.people.filter((id) => !people.has(id)).length;
  const meta = (person: AnnouncementPerson) =>
    [person.job_name, person.location_name].filter(Boolean).join(" · ");
  const reset = (next: typeof filter) => {
    setFilter(next);
    setUnpicked(new Set());
  };
  return (
    <>
      <p className="ad-desc">Everyone at a checked location gets it. Add anyone else here.</p>
      <div className="ad-audience">
        <section className="ad-pane" aria-label="Add people">
          <div className="ad-pane-head">
            <b>Add people</b>
            <div className="ad-filters">
              <select
                aria-label="Location"
                value={filter.location}
                disabled={locked}
                onChange={(event) => reset({ ...filter, location: event.target.value })}
              >
                <option value="">All locations</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Department"
                value={department}
                disabled={locked}
                onChange={(event) => reset({ ...filter, department: event.target.value })}
              >
                <option value="">All departments</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Job"
                value={job}
                disabled={locked}
                onChange={(event) => reset({ ...filter, job: event.target.value })}
              >
                <option value="">All jobs</option>
                {jobs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ad-people">
            {shown.length ? (
              <label className="ad-person ad-person-all">
                <input
                  type="checkbox"
                  checked={picked.length === shown.length}
                  disabled={locked}
                  onChange={(event) =>
                    setUnpicked(event.target.checked ? new Set() : new Set(shown.map((person) => person.user_id)))
                  }
                />
                <span>All {shown.length} shown</span>
              </label>
            ) : (
              <div className="ad-empty">{pool.length ? "Nobody matches these filters." : "Everyone already gets it."}</div>
            )}
            {shown.map((person) => (
              <label className="ad-person" key={person.user_id}>
                <input
                  type="checkbox"
                  checked={!unpicked.has(person.user_id)}
                  disabled={locked}
                  onChange={(event) => {
                    const next = new Set(unpicked);
                    if (event.target.checked) next.delete(person.user_id);
                    else next.add(person.user_id);
                    setUnpicked(next);
                  }}
                />
                <span>
                  {person.name}
                  <span className="ad-meta">{meta(person)}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="ad-pane-foot">
            <Button
              type="button"
              disabled={locked || !picked.length}
              onClick={() => {
                const ids = picked.map((person) => person.user_id);
                update((current) => ({ ...current, people: [...current.people, ...ids] }));
                reset({ location: "", department: "", job: "" });
              }}
            >
              {picked.length ? `Add ${plural(picked.length, "person", "people")}` : "Add people"}
            </Button>
          </div>
        </section>
        <section className="ad-pane" aria-label="Who gets it">
          <div className="ad-pane-head">
            <b>Who gets it · {recipientCount}</b>
          </div>
          <div className="ad-people">
            {problem && (
              <div className="ad-pane-error">
                <FieldError message={problem} />
              </div>
            )}
            {checkedLocations.length > 0 && (
              <>
                <div className="ad-group">
                  <span>From Locations</span>
                </div>
                {checkedLocations.map((location) => (
                  <div className="ad-person" key={location.id}>
                    <span>
                      Everyone at {location.name}
                      {location.count !== null && (
                        <span className="ad-meta">{plural(location.count, "person", "people")}</span>
                      )}
                    </span>
                  </div>
                ))}
              </>
            )}
            {(added.length > 0 || unknownAdded > 0) && (
              <>
                <div className="ad-group">
                  <span>Added here</span>
                  {!locked && (
                    <button
                      type="button"
                      className="ad-link"
                      onClick={() => update((current) => ({ ...current, people: [] }))}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {added.map((person) => (
                  <div className="ad-person" key={person.user_id}>
                    <span>
                      {person.name}
                      <span className="ad-meta">{meta(person)}</span>
                    </span>
                    {!locked && (
                      <button
                        type="button"
                        className="ad-remove"
                        aria-label={`Remove ${person.name}`}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            people: current.people.filter((id) => id !== person.user_id),
                          }))
                        }
                      >
                        <X size={14} aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
                {unknownAdded > 0 && (
                  <div className="ad-person">
                    <span className="ad-muted">{plural(unknownAdded, "other person", "other people")}</span>
                  </div>
                )}
              </>
            )}
            {shiftPeople.length > 0 && (
              <>
                <div className="ad-group">
                  <span>Their shift changes</span>
                </div>
                {shiftPeople.map((person) => (
                  <div className="ad-person" key={person.user_id}>
                    <span>
                      {person.name}
                      <span className="ad-meta">{person.meta}</span>
                    </span>
                  </div>
                ))}
              </>
            )}
            {!checkedLocations.length && !added.length && !unknownAdded && !shiftPeople.length && !problem && (
              <div className="ad-empty">
                Nobody yet. Add people on the left, or check a location on Locations &amp; publishing.
              </div>
            )}
          </div>
        </section>
      </div>
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
  if (status === "past")
    return <div className="ad-empty-tab">This is over. Its shifts don&apos;t change anymore.</div>;
  if (changes) {
    const live = changes.filter((change) => !change.brought_back_at);
    if (!live.length) return <div className="ad-empty-tab">No shifts changed.</div>;
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
  if (!hours && !backRows.length)
    return (
      <div className="ad-empty-tab">
        No hours change, so no shifts change.
        <span>Set Closed or Short hours on Locations &amp; publishing to change shifts.</span>
      </div>
    );
  if (hours && !draft.starts_on)
    return <div className="ad-empty-tab">Pick the day on Details to see the shifts.</div>;
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
  const options: { value: "remove" | "open" | "keep"; label: string; tone?: string }[] = [
    { value: "remove", label: "Remove", tone: "red" },
    ...(shift.employee_id ? [{ value: "open" as const, label: "Open shift" }] : []),
    { value: "keep", label: "Keep" },
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
            <input
              type="time"
              aria-label="New start"
              value={edited?.from ?? shift.start_time}
              onChange={(event) => {
                const from = event.target.value;
                if (from) onChoice({ choice: "edit", from, until: edited?.until ?? shift.end_time });
              }}
            />
          </label>
          <label>
            <span>Ends</span>
            <input
              type="time"
              aria-label="New end"
              value={edited?.until ?? shift.end_time}
              onChange={(event) => {
                const until = event.target.value;
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

// ---------- Acknowledged ----------

export function AcknowledgedTab({
  record,
  zone,
  timeFormat,
  busy,
  onRemind,
}: {
  record: AnnouncementDetail;
  zone: string;
  timeFormat: TimeFormat;
  busy: boolean;
  onRemind: () => void;
}) {
  const people = record.acknowledgements ?? [];
  const yes = people.filter((person) => person.acknowledged_at);
  const no = people.filter((person) => !person.acknowledged_at);
  return (
    <>
      <div className="ad-ack-sum">
        <div>
          <div className="ad-big">
            {yes.length} of {people.length}
          </div>
          <div className="ad-muted">acknowledged</div>
        </div>
        <Button type="button" className="secondary-button" disabled={!no.length || busy} onClick={onRemind}>
          {no.length ? `Remind ${plural(no.length, "person", "people")}` : "Everyone acknowledged"}
        </Button>
      </div>
      <div className="ad-table" role="table" aria-label="Who acknowledged">
        <div className="ad-tr" role="row" data-head>
          <span role="columnheader">Person</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" className="ad-tr-third">
            Location
          </span>
        </div>
        {[...no, ...yes].map((person) => (
          <div className="ad-tr" role="row" key={person.user_id}>
            <span role="cell">
              {person.name}
              {person.job_name && <span className="ad-meta">{person.job_name}</span>}
            </span>
            <span role="cell">
              {person.acknowledged_at ? (
                <>
                  <span className="ad-ok">✓ Acknowledged</span>
                  <span className="ad-meta">{momentText(person.acknowledged_at, zone, timeFormat)}</span>
                </>
              ) : (
                <span className="ad-not-yet">Not yet</span>
              )}
            </span>
            <span role="cell" className="ad-tr-third ad-muted">
              {person.location_name ?? ""}
            </span>
          </div>
        ))}
      </div>
    </>
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
