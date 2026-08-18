import type { EmployeeTimeSessionDetail, TimeEventType } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleStop,
  Clock3,
  Coffee,
  History,
  LogIn,
  MapPin,
  MessageSquareWarning,
  Play,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  captureEmployeeTimeEvent,
  getEmployeeTimeTracking,
  requestEmployeeTimeCorrection,
} from "../employee-hub/employee-hub-data";

interface CaptureAttempt {
  eventType: TimeEventType;
  locationId: string;
  sessionId: string | null;
  occurredAt: string;
  idempotencyKey: string;
}

export function EmployeeTimeTrackingView({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [failedAttempt, setFailedAttempt] = useState<CaptureAttempt | null>(
    null,
  );
  const [correctionSession, setCorrectionSession] =
    useState<EmployeeTimeSessionDetail | null>(null);
  const online = useOnlineStatus();
  const query = useQuery({
    queryKey: ["employee-time-tracking", workspaceId],
    queryFn: () => getEmployeeTimeTracking(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: 60_000,
  });
  const model = query.data;
  const current = model?.current_session ?? null;
  const activeLocationId = current?.location_id ?? selectedLocationId;

  useEffect(() => {
    if (!selectedLocationId && model?.locations[0])
      setSelectedLocationId(model.locations[0].id);
  }, [model?.locations, selectedLocationId]);

  const mutation = useMutation({
    mutationFn: (attempt: CaptureAttempt) =>
      captureEmployeeTimeEvent(
        workspaceId,
        {
          location_id: attempt.locationId,
          session_id: attempt.sessionId,
          event_type: attempt.eventType,
          occurred_at: attempt.occurredAt,
        },
        attempt.idempotencyKey,
      ),
    retry: false,
    onSuccess: async () => {
      setFailedAttempt(null);
      await queryClient.invalidateQueries({
        queryKey: ["employee-time-tracking", workspaceId],
      });
    },
    onError: (_error, attempt) => setFailedAttempt(attempt),
  });
  const correctionMutation = useMutation({
    mutationFn: (attempt: {
      session: EmployeeTimeSessionDetail;
      startedAt: string;
      endedAt: string;
      reason: string;
      idempotencyKey: string;
      timezone: string;
    }) =>
      requestEmployeeTimeCorrection(
        workspaceId,
        {
          session_id: attempt.session.id,
          expected_revision: attempt.session.revision,
          requested_started_at: zonedInputToIso(
            attempt.startedAt,
            attempt.timezone,
          )!,
          requested_ended_at: zonedInputToIso(
            attempt.endedAt,
            attempt.timezone,
          )!,
          reason: attempt.reason,
        },
        attempt.idempotencyKey,
      ),
    retry: false,
    onSuccess: async () => {
      setCorrectionSession(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["employee-time-tracking", workspaceId],
        }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });

  function capture(eventType: TimeEventType) {
    if (!online || !activeLocationId || mutation.isPending) return;
    mutation.mutate({
      eventType,
      locationId: activeLocationId,
      sessionId: current?.id ?? null,
      occurredAt: new Date().toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });
  }

  if (query.isLoading)
    return <div className="time-tracking-loading" aria-label="Loading time" />;
  if (query.isError || !model)
    return (
      <section className="hub-panel time-tracking-error">
        <h2>Time Tracking is unavailable</h2>
        <p className="form-error" role="alert">
          {query.error instanceof Error ? query.error.message : "Try again."}
        </p>
        <button className="secondary-button" onClick={() => query.refetch()}>
          <RefreshCw size={16} />
          Retry
        </button>
      </section>
    );

  const location = model.locations.find((item) => item.id === activeLocationId);
  const timezone = location?.timezone ?? model.locations[0]?.timezone;

  return (
    <div className="time-tracking-layout">
      <section
        className="hub-panel time-clock-panel"
        aria-labelledby="time-clock-title"
      >
        <div className="time-clock-heading">
          <div>
            <p className="eyebrow">Current status</p>
            <h2 id="time-clock-title">{captureStateLabel(current)}</h2>
          </div>
          <span className={`connection-state ${online ? "online" : "offline"}`}>
            {online ? "Online" : "Offline"}
          </span>
        </div>

        {current ? (
          <div className="active-time-summary">
            <Clock3 size={22} />
            <strong>{formatDuration(current.effective_started_at)}</strong>
            <span>
              Since {formatTimestamp(current.effective_started_at, timezone)}
            </span>
            <small>
              <MapPin size={14} /> {current.location_name}
            </small>
          </div>
        ) : (
          <label className="time-location-field">
            <span>Location</span>
            <select
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
              disabled={mutation.isPending}
            >
              {model.locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="time-clock-actions">
          {!current ? (
            <button
              className="primary-button time-primary-action"
              disabled={!online || !activeLocationId || mutation.isPending}
              onClick={() => capture("clock_in")}
            >
              <LogIn size={18} />
              Clock in
            </button>
          ) : current.capture_state === "on_break" ? (
            <button
              className="primary-button time-primary-action"
              disabled={!online || mutation.isPending}
              onClick={() => capture("break_end")}
            >
              <Play size={18} />
              End break
            </button>
          ) : (
            <>
              <button
                className="secondary-button"
                disabled={!online || mutation.isPending}
                onClick={() => capture("break_start")}
              >
                <Coffee size={18} />
                Start break
              </button>
              <button
                className="primary-button time-primary-action"
                disabled={!online || mutation.isPending}
                onClick={() => capture("clock_out")}
              >
                <CircleStop size={18} />
                Clock out
              </button>
            </>
          )}
        </div>

        {mutation.isPending ? (
          <p className="time-action-status" role="status">
            Recording…
          </p>
        ) : mutation.isError ? (
          <div className="time-action-error" role="alert">
            <span>
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Time event was not recorded"}
            </span>
            {failedAttempt ? (
              <button
                className="secondary-button"
                disabled={!online}
                onClick={() => mutation.mutate(failedAttempt)}
              >
                <RefreshCw size={16} /> Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        className="hub-panel time-history-panel"
        aria-labelledby="time-history-title"
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Personal record</p>
            <h2 id="time-history-title">Recent activity</h2>
          </div>
          <History size={21} />
        </div>
        {model.sessions.length ? (
          <div className="time-history-list">
            {model.sessions.map((session) => (
              <TimeHistoryRow
                key={session.id}
                session={session}
                timezone={
                  model.locations.find(
                    (item) => item.id === session.location_id,
                  )?.timezone
                }
                onRequest={() => setCorrectionSession(session)}
              />
            ))}
          </div>
        ) : (
          <p className="muted empty-inline">No completed sessions.</p>
        )}
      </section>
      {correctionSession ? (
        <CorrectionDialog
          session={correctionSession}
          timezone={
            model.locations.find(
              (item) => item.id === correctionSession.location_id,
            )?.timezone ?? "UTC"
          }
          busy={correctionMutation.isPending}
          error={correctionMutation.error}
          onClose={() => setCorrectionSession(null)}
          onSubmit={(attempt) => correctionMutation.mutate(attempt)}
        />
      ) : null}
    </div>
  );
}

function TimeHistoryRow({
  session,
  timezone,
  onRequest,
}: {
  session: EmployeeTimeSessionDetail;
  timezone?: string;
  onRequest: () => void;
}) {
  const amended = session.amendments.length > 0;
  const duration = durationBetween(
    session.effective_started_at,
    session.effective_ended_at,
  );
  const latestCorrection = session.correction_requests.at(-1);
  return (
    <details className="time-history-row">
      <summary>
        <span>
          <strong>{formatDate(session.effective_started_at, timezone)}</strong>
          <small>{session.location_name}</small>
        </span>
        <span>
          <strong>{duration}</strong>
          <small>{amended ? "Amended" : "Recorded"}</small>
        </span>
      </summary>
      <div className="time-event-list">
        {session.events.map((event) => (
          <div key={event.id}>
            <span>{eventLabel(event.event_type)}</span>
            <time dateTime={event.occurred_at}>
              {formatTimestamp(event.occurred_at, timezone)}
            </time>
          </div>
        ))}
        {session.amendments.map((amendment) => (
          <div className="time-amendment" key={amendment.id}>
            <span>Amended</span>
            <small>{amendment.reason}</small>
          </div>
        ))}
        {latestCorrection ? (
          <div className={`time-correction-status ${latestCorrection.status}`}>
            <span>Correction {latestCorrection.status}</span>
            <small>{latestCorrection.reason}</small>
          </div>
        ) : (
          <button className="secondary-button" onClick={onRequest}>
            <MessageSquareWarning size={15} /> Request correction
          </button>
        )}
      </div>
    </details>
  );
}

function CorrectionDialog({
  session,
  timezone,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  session: EmployeeTimeSessionDetail;
  timezone: string;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSubmit: (attempt: {
    session: EmployeeTimeSessionDetail;
    startedAt: string;
    endedAt: string;
    reason: string;
    idempotencyKey: string;
    timezone: string;
  }) => void;
}) {
  const [startedAt, setStartedAt] = useState(() =>
    toZonedInput(session.effective_started_at, timezone),
  );
  const [endedAt, setEndedAt] = useState(() =>
    toZonedInput(session.effective_ended_at!, timezone),
  );
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const startIso = zonedInputToIso(startedAt, timezone);
  const endIso = zonedInputToIso(endedAt, timezone);
  const valid =
    Boolean(startIso && endIso) &&
    Date.parse(endIso!) > Date.parse(startIso!) &&
    reason.trim().length >= 3;
  const change = (action: () => void) => {
    action();
    setIdempotencyKey(crypto.randomUUID());
  };
  return (
    <div className="time-entry-dialog-backdrop" role="presentation">
      <form
        className="time-entry-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid)
            onSubmit({
              session,
              startedAt,
              endedAt,
              reason: reason.trim(),
              idempotencyKey,
              timezone,
            });
        }}
      >
        <header>
          <div>
            <p className="eyebrow">
              Current record · revision {session.revision}
            </p>
            <h2 id="correction-dialog-title">Request a correction</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="time-entry-form-grid">
          <label>
            <span>Requested start</span>
            <input
              type="datetime-local"
              value={startedAt}
              onInput={(event) =>
                change(() => setStartedAt(event.currentTarget.value))
              }
            />
          </label>
          <label>
            <span>Requested end</span>
            <input
              type="datetime-local"
              value={endedAt}
              onInput={(event) =>
                change(() => setEndedAt(event.currentTarget.value))
              }
            />
          </label>
          <label className="time-entry-reason">
            <span>What should be corrected?</span>
            <textarea
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(event) => change(() => setReason(event.target.value))}
            />
          </label>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error instanceof Error
              ? error.message
              : "Correction was not submitted"}
          </p>
        ) : null}
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={!valid || busy}
          >
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function toZonedInput(value: string, timezone: string) {
  const parts = dateTimeParts(new Date(value), timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function zonedInputToIso(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const localUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = localUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateTimeParts(new Date(instant), timezone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    instant = localUtc - (represented - instant);
  }
  const result = new Date(instant).toISOString();
  return toZonedInput(result, timezone) === value ? result : null;
}

function dateTimeParts(date: Date, timezone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function captureStateLabel(session: EmployeeTimeSessionDetail | null) {
  if (!session) return "Not clocked in";
  return session.capture_state === "on_break" ? "On break" : "Clocked in";
}

function eventLabel(event: TimeEventType) {
  return {
    clock_in: "Clock in",
    break_start: "Break start",
    break_end: "Break end",
    clock_out: "Clock out",
  }[event];
}

function formatTimestamp(value: string, timezone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDate(value: string, timezone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDuration(start: string) {
  return durationBetween(start, new Date().toISOString());
}

function durationBetween(start: string, end: string | null) {
  if (!end) return "Open";
  const totalMinutes = Math.max(
    0,
    Math.floor((Date.parse(end) - Date.parse(start)) / 60_000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
