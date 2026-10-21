import { useEffect, useRef, useState } from "react";
import type { ExchangeScheduleRecovery as Recovery } from "@newfork/shared";
import type { ScheduleEditSession } from "@newfork/shared/schedule";
import {
  ExchangeError,
  fetchExchangeScheduleRecovery,
  restoreExchangeSchedule,
} from "./exchange-data";
import "./shift-exchanges.css";
import { FieldNote } from "../../shell/FieldNote";
import { zoneName } from "../../lib/today";

export function ExchangeScheduleRecovery({
  workspaceId,
  session,
  onRestored,
  onBlockingChange,
}: {
  workspaceId: string;
  session: ScheduleEditSession;
  onRestored: (session: ScheduleEditSession) => void;
  onBlockingChange: (blocked: boolean) => void;
}) {
  const [model, setModel] = useState<Recovery | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setModel(null);
    onBlockingChange(true);
    void fetchExchangeScheduleRecovery(workspaceId, session.id)
      .then((value) => {
        if (!active) return;
        setModel(value);
        onBlockingChange(value.changes.length > 0);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to compare the current assignments.",
        );
        onBlockingChange(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      onBlockingChange(false);
    };
  }, [workspaceId, session.id, session.revision, refresh, onBlockingChange]);

  async function restore() {
    if (!model || saving) return;
    if (attempt.current?.fingerprint !== model.fingerprint)
      attempt.current = {
        fingerprint: model.fingerprint,
        key: crypto.randomUUID(),
      };
    setSaving(true);
    setError("");
    try {
      const next = await restoreExchangeSchedule(
        workspaceId,
        session.id,
        model.fingerprint,
        attempt.current.key,
      );
      onRestored(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your edits are still here. Try again.",
      );
      if (cause instanceof ExchangeError && cause.status === 409)
        setRefresh((value) => value + 1);
    } finally {
      setSaving(false);
    }
  }
  if (loading) return <p role="status">Checking for approved shift changes…</p>;
  if (!error && !model?.changes.length) return null;
  return (
    <section
      className="sx-schedule-recovery"
      aria-label="Review approved shift changes"
    >
      {Boolean(model?.changes.length) && (
        <>
          <h3>An approved shift change needs review</h3>
          <p>
            Use these current assignments to keep the approved changes. Your
            notes and other shift edits stay in this session.
          </p>
          <ul>
            {model?.changes.map(
              ({
                current,
                edited_employee_name,
                edited_start_time,
                edited_end_time,
                edited_job_name,
                edited_shift_type_name,
                edited_timezone,
                edited_unpaid_break_minutes,
                removed,
              }) => (
                <li key={current.id}>
                  <strong>
                    {current.scheduled_date} · {current.location_name}
                  </strong>
                  <span>
                    Your draft:{" "}
                    {removed
                      ? "Removed"
                      : `${edited_employee_name ?? "Open shift"} · ${edited_start_time?.slice(0, 5) ?? "Hours unset"}–${edited_end_time?.slice(0, 5) ?? ""}`}
                  </span>
                  {!removed && (
                    <small>
                      {[
                        edited_job_name,
                        edited_shift_type_name,
                        edited_timezone && zoneName(edited_timezone),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {edited_unpaid_break_minutes != null &&
                        ` · Unpaid break: ${edited_unpaid_break_minutes} min`}
                    </small>
                  )}
                  <span>
                    Approved: {current.employee_name ?? "Open shift"} ·{" "}
                    {current.start_time?.slice(0, 5) ?? "Hours unset"}–
                    {current.end_time?.slice(0, 5) ?? ""} · {current.job_name}
                    {current.shift_type_name && ` · ${current.shift_type_name}`}
                  </span>
                  <small>
                    Approved time zone: {zoneName(current.timezone)}{" "}
                    · Unpaid break: {current.unpaid_break_minutes ?? 0} min
                  </small>
                </li>
              ),
            )}
          </ul>
          <p>
            Only the listed assignments will use the published owner, position,
            service, hours and break. This updates your draft; it does not
            publish it.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void restore()}
          >
            {saving ? "Updating assignments…" : "Use approved assignments"}
          </button>
        </>
      )}
      <FieldNote id="exchange-schedule-recovery" error={error} />
      {!model && error && (
        <button type="button" onClick={() => setRefresh((value) => value + 1)}>
          Reload comparison
        </button>
      )}
    </section>
  );
}
