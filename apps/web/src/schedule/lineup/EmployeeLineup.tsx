import { EmployeeLineupOffers } from "./LineupQueue";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Clock3, MapPin } from "lucide-react";
import { getEmployeeLineup, recordLineupReceipt } from "../lineup-data";
import type { EmployeeLineupSnapshot } from "@newfork/shared";
import { formatLineupInterval, parseLineupDate } from "./lineup-time";
import "./lineup.css";

export function EmployeeLineup({
  workspaceId,
  from,
  to,
  timeFormat,
}: {
  workspaceId: string;
  from: string;
  to: string;
  timeFormat: "12h" | "24h";
}) {
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const selectedDate = parseLineupDate(search.get("date"));
  const [draft, setDraft] = useState<{
    context: string | null;
    value: string;
  } | null>(null);
  // Keep an edit local to the applied day. Navigation can be interrupted by
  // browser Back before React commits it, so never eagerly copy its target.
  if (draft && draft.context !== selectedDate) setDraft(null);
  const dateDraft =
    draft?.context === selectedDate ? draft.value : (selectedDate ?? from);
  const rangeFrom = selectedDate ?? from;
  const rangeTo = selectedDate ?? to;
  function chooseDate(value: string | null) {
    setDraft(null);
    setSearch((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set("date", value);
      else next.delete("date");
      return next;
    });
  }
  const query = useQuery({
    queryKey: ["employee-lineup", workspaceId, rangeFrom, rangeTo],
    queryFn: () => getEmployeeLineup(workspaceId, rangeFrom, rangeTo),
    enabled: Boolean(workspaceId),
  });
  return (
    <section className="lu-employee">
      <header>
        <span className="lu-eyebrow">READY FOR YOUR DAY</span>
        <h2>Your Line Up</h2>
        <p>Your assignment and the details that matter for service.</p>
      </header>
      <form
        className="lu-employee-dates"
        aria-label="Choose Line Up date"
        onSubmit={(event) => {
          event.preventDefault();
          const day = parseLineupDate(dateDraft);
          if (day) chooseDate(day);
        }}
      >
        <label>
          <span>Line Up date</span>
          <input
            type="date"
            min="1000-01-01"
            max="9999-12-31"
            required
            value={dateDraft}
            onChange={(event) => {
              setDraft({ context: selectedDate, value: event.target.value });
            }}
          />
        </label>
        <button
          type="submit"
          className="nf-button lu-primary"
          disabled={!parseLineupDate(dateDraft)}
        >
          Show day
        </button>
        <button
          type="button"
          className="lu-upcoming"
          onClick={() => chooseDate(null)}
        >
          Upcoming
        </button>
        <p aria-live="polite">
          {selectedDate
            ? `Shared plans for ${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`))}`
            : "Upcoming shared plans · Choose a day to look further ahead."}
        </p>
      </form>
      <EmployeeLineupOffers workspaceId={workspaceId} timeFormat={timeFormat} />
      {query.isPending ? (
        <p role="status">Loading your shared plan…</p>
      ) : query.error ? (
        <div className="lu-error" role="alert">
          {query.error.message}
          <button onClick={() => void query.refetch()}>Retry</button>
        </div>
      ) : query.data.length ? (
        [...query.data]
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              Number(b.source_current !== false && b.entries.length > 0) -
                Number(a.source_current !== false && a.entries.length > 0),
          )
          .map((snapshot) => (
            <Snapshot
              key={snapshot.snapshot_id}
              snapshot={snapshot}
              workspaceId={workspaceId}
              timeFormat={timeFormat}
              refresh={async () => {
                await client.invalidateQueries({
                  queryKey: ["employee-lineup", workspaceId],
                });
              }}
            />
          ))
      ) : (
        <div className="lu-day-empty">
          <ClipboardList size={26} />
          <div>
            <h3>
              {selectedDate
                ? "No shared plan for this day."
                : "Your plan is on its way."}
            </h3>
            <p>
              {selectedDate
                ? "Choose another day or check Schedule for your published shifts."
                : "When your manager shares a Line Up, your assignment and daily brief will appear here."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
function Snapshot({
  snapshot,
  workspaceId,
  timeFormat,
  refresh,
}: {
  snapshot: EmployeeLineupSnapshot;
  workspaceId: string;
  timeFormat: "12h" | "24h";
  refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function record(action: "view" | "acknowledge") {
    setBusy(true);
    setError("");
    try {
      await recordLineupReceipt(workspaceId, snapshot.snapshot_id, action);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not record your response",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="lu-employee-plan">
      <header>
        <div>
          <span>{snapshot.date}</span>
          <h3>
            <MapPin size={15} /> {snapshot.location_name}
          </h3>
        </div>
        <span className="lu-badge">v{snapshot.version}</span>
      </header>
      {snapshot.source_current === false ? (
        <p className="lu-error">
          This is a historical shared plan. Schedule has been unpublished; check
          with your manager for the current plan.
        </p>
      ) : null}
      {snapshot.entries.map((entry) => (
        <div className="lu-personal-assignment" key={entry.id}>
          <span className="lu-eyebrow">
            YOUR ASSIGNMENT · {entry.shift_type_name.toUpperCase()}
          </span>
          <h3>
            {entry.job_name}{" "}
            <span>· {entry.section_name || "Section to be assigned"}</span>
          </h3>
          {entry.station ? <p>{entry.station}</p> : null}
          {entry.note ? <p>{entry.note}</p> : null}
          <strong>
            <Clock3 size={15} />{" "}
            {entry.start_time && entry.end_time
              ? formatLineupInterval(
                  entry,
                  timeFormat,
                  snapshot.date,
                  snapshot.timezone ?? "UTC",
                )
              : "Time to be confirmed"}
          </strong>
        </div>
      ))}
      {!snapshot.entries.length ? (
        <p>
          Your previous assignment has changed. Check Schedule for your current
          shifts.
        </p>
      ) : null}
      <button
        className="lu-employee-expand"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open && !snapshot.viewed_at) void record("view");
        }}
      >
        {open ? "Hide daily brief" : "View daily brief & changes"}
        <span>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="lu-employee-brief">
          {snapshot.changes ? (
            <section className="lu-personal-changes" aria-label="Your changes">
              <h4>Your changes</h4>
              <p>
                {snapshot.changes.previous_version === null
                  ? "This is your first shared plan for this day."
                  : `Since v${snapshot.changes.previous_version}`}
              </p>
              {snapshot.changes.assignment_changed ? (
                <>
                  <strong>
                    Your assignment changed. Your current plan is above.
                  </strong>
                  {snapshot.changes.previous_entries.length ? (
                    <div className="lu-previous-assignments">
                      <span className="lu-eyebrow">PREVIOUS ASSIGNMENT</span>
                      {snapshot.changes.previous_entries.map((entry) => (
                        <p key={entry.id}>
                          {entry.job_name} ·{" "}
                          {entry.section_name || "Unassigned"}
                          {entry.station ? ` · ${entry.station}` : ""}
                          {entry.start_time && entry.end_time
                            ? ` · ${formatLineupInterval(entry, timeFormat, snapshot.date, snapshot.timezone ?? "UTC")}`
                            : ""}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p>You have a new assignment in this plan.</p>
                  )}
                </>
              ) : null}
              {snapshot.changes.brief_changed ? (
                <p>
                  Your service notes or brief changed. Review the details below.
                </p>
              ) : null}
              {snapshot.changes.previous_version !== null &&
              !snapshot.changes.assignment_changed &&
              !snapshot.changes.brief_changed ? (
                <p>Your assignment and relevant brief are unchanged.</p>
              ) : null}
            </section>
          ) : null}
          {snapshot.notes.map((note) => (
            <div className="lu-note" key={note.id}>
              <div>
                <span>{note.category}</span>
                {note.pinned ? <span>Important</span> : null}
              </div>
              <p>{note.content}</p>
              {note.expires_at ? (
                <small>
                  {new Date(note.expires_at).getTime() <= Date.now()
                    ? "Expired instruction · "
                    : "Valid until "}
                  {new Date(note.expires_at).toLocaleString()}
                </small>
              ) : null}
            </div>
          ))}
          {snapshot.briefs.map((brief) => (
            <div key={brief.shift_type_id}>
              {[
                ["Specials", brief.specials],
                ["86 / out of stock", brief.out_of_stock],
                ["Pre-shift notes", brief.pre_shift_notes],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div className="lu-note" key={label}>
                    <div>
                      <span>{label}</span>
                    </div>
                    <p>{value}</p>
                  </div>
                ))}
            </div>
          ))}
          {!snapshot.notes.length && !snapshot.briefs.length ? (
            <p>No additional service notes.</p>
          ) : null}
          {snapshot.entries.some((entry) => entry.section_name) ? (
            <section className="lu-section-team" aria-label="Your section team">
              <h4>Your section team</h4>
              <p>From this shared plan · v{snapshot.version}</p>
              {snapshot.section_team?.length ? (
                snapshot.section_team.map((entry) => (
                  <div className="lu-teammate" key={entry.id}>
                    <span className="lu-avatar" aria-hidden="true">
                      {entry.employee_name
                        .split(/\s+/)
                        .map((name) => name[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <strong>{entry.employee_name}</strong>
                      <span>
                        {entry.job_name} · {entry.section_name} ·{" "}
                        {entry.shift_type_name}
                      </span>
                      {entry.station ? <span>{entry.station}</span> : null}
                      {entry.note ? <span>{entry.note}</span> : null}
                      {entry.start_time && entry.end_time ? (
                        <span>
                          {formatLineupInterval(
                            entry,
                            timeFormat,
                            snapshot.date,
                            snapshot.timezone ?? "UTC",
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p>
                  No other teammates are assigned to your section and service in
                  this plan.
                </p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="lu-error">
          {error}
        </p>
      ) : null}
      <footer>
        <span>
          Shared{" "}
          {new Date(snapshot.shared_at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            timeZone: snapshot.timezone,
            timeZoneName: "short",
          })}
        </span>
        <button
          className="nf-button lu-primary"
          disabled={
            busy ||
            snapshot.source_current === false ||
            Boolean(snapshot.acknowledged_at)
          }
          onClick={() => {
            setOpen(true);
            void record("acknowledge");
          }}
        >
          <Check size={16} />
          {snapshot.acknowledged_at
            ? "Acknowledged"
            : busy
              ? "Saving…"
              : "I've read this plan"}
        </button>
      </footer>
    </article>
  );
}
