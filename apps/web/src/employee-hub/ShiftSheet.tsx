import type { EmployeeHubReadModel, EmployeeHubShift, ExchangeShift } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { shiftInstant, shiftZone } from "./dashboard-model";
import { CLOSE_BEFORE_MS, ChangeOptions, SelfOnlyNote } from "./shift-exchanges/ChangeOptions";
import { getExchanges } from "./shift-exchanges/exchange-data";
import { PlanDialog } from "./shift-exchanges/PlanDialog";
import { ShiftTicket } from "./shift-exchanges/ShiftTicket";
import { OwnAvailabilityFlag } from "./OwnAvailabilityFlag";
const base = "/app/employee-hub";

/** The hub's shift as Shift Hub's ticket reads it, where Shift Hub's own list does not have it. */
function ticketOf(shift: EmployeeHubShift, model: EmployeeHubReadModel): ExchangeShift {
  return {
    id: shift.id,
    source_id: shift.id,
    location_id: shift.location_id,
    location_name: shift.location_name,
    timezone: shiftZone(model, shift),
    time_timezone: shift.time_timezone ?? null,
    job_id: null,
    job_name: shift.job_name,
    shift_type_name: shift.shift_type_name ?? null,
    scheduled_date: shift.scheduled_date,
    start_time: shift.start_time || null,
    end_time: shift.end_time || null,
    starts_at: null,
    ends_at: null,
    employee_id: shift.employee_id,
    employee_name: null,
  };
}

/**
 * A shift opened from Home or My shifts is the same window as Shift Hub's "Your shift" (Mert 2026-10-24, "Swap or
 * give up'a tıklayınca açılan kart harika"): the shift's ticket, who can approve a change, the three ways to
 * change it; here also the hours the person marked unavailable, the shift's note and the way to My shifts.
 */
export function ShiftSheet({
  shift,
  model,
  clash = null,
  scheduleLink = true,
  onClose,
}: {
  shift: EmployeeHubShift;
  model: EmployeeHubReadModel;
  /** "Mon after 6:00 PM" when the shift runs into hours the employee marked unavailable. */
  clash?: string | null;
  /** "Open in my schedule"; off on My shifts itself. */
  scheduleLink?: boolean;
  onClose: () => void;
}) {
  const { context } = useAuth();
  // Home reads the same list (home-data.ts), so the window there opens from the cache.
  const exchanges = useQuery({
    queryKey: ["shift-exchanges", model.workspace_id, context?.userId, false],
    queryFn: () => getExchanges(model.workspace_id),
    enabled: Boolean(context?.userId),
  });
  const own = exchanges.data?.own_shifts.find((item) => item.id === shift.id || item.source_id === shift.id);
  const closed = shiftInstant(shift, model) - CLOSE_BEFORE_MS <= Date.now();
  return (
    <PlanDialog eyebrow="Your shift" onClose={onClose}>
      <ShiftTicket shift={own ?? ticketOf(shift, model)} />
      {clash ? <OwnAvailabilityFlag when={clash} shiftId={shift.id} /> : null}
      {shift.note && (
        <div className="eh-shift-note">
          <h3>Shift notes</h3>
          <p>{shift.note}</p>
        </div>
      )}
      {closed ? null : <SelfOnlyNote tier={own?.decision_tier} />}
      {/* Three named ways to change it (TAKAS-RELEASE, plan 04:01); closed in the last 4 hours. */}
      <ChangeOptions hrefFor={(mode) => `${base}/shift-hub?offer=${shift.id}&mode=${mode}`} closed={closed} />
      {/* Lands on the shift, marked, with its window closed (?focus=): the window over My shifts hid the page. */}
      {scheduleLink ? (
        <Link
          className="eh-sheet-link"
          to={`${base}/schedule?date=${shift.scheduled_date}&focus=${shift.id}#shift-${shift.id}`}
        >
          Open in my schedule
          <ArrowUpRight size={17} />
        </Link>
      ) : null}
    </PlanDialog>
  );
}
export function ShiftUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <PlanDialog eyebrow="Shift unavailable" onClose={onClose}>
      <p className="sx-help">
        This shift may have changed or is outside the current schedule range. Refresh your schedule to see the
        latest information.
      </p>
      <Link className="eh-primary" to={`${base}/schedule`}>
        Open my schedule
      </Link>
    </PlanDialog>
  );
}
