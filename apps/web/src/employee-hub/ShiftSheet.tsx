import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { X, MapPin, ArrowUpRight } from "lucide-react";
import { formatTimeRange } from "../schedule/lib/scheduleDateTime";
import { shiftDate, shiftInstant, shiftZone } from "./dashboard-model";
import { CLOSE_BEFORE_MS, ChangeOptions } from "./shift-exchanges/ChangeOptions";
import { OwnAvailabilityFlag } from "./OwnAvailabilityFlag";
import { timeOffZoneName } from "./time-off-split";
const base = "/app/employee-hub";
function Sheet({
  title,
  children,
  onClose,
  returnToShiftId,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnToShiftId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal?.();
    const main = document.querySelector<HTMLElement>(".app-main");
    const overflow = main?.style.overflow;
    if (main) main.style.overflow = "hidden";
    return () => {
      dialog?.close?.();
      if (main) main.style.overflow = overflow ?? "";
      queueMicrotask(() => {
        const fallback = returnToShiftId
          ? document.querySelector<HTMLElement>(
              `a[href$="?shift=${returnToShiftId}"]`,
            )
          : document.querySelector<HTMLElement>('a[href="/app/employee-hub"]');
        (trigger?.isConnected &&
        trigger !== document.body &&
        !trigger.closest("dialog")
          ? trigger
          : fallback
        )?.focus({ preventScroll: true });
      });
    };
  }, [returnToShiftId]);
  return createPortal(
    <dialog
      ref={ref}
      className="eh-sheet"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="eh-sheet-heading">
        <h2 id={id}>{title}</h2>
        <button
          className="eh-icon-button"
          onClick={onClose}
          aria-label="Close shift details"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
export function ShiftSheet({
  shift,
  model,
  clash = null,
  onClose,
}: {
  shift: EmployeeHubShift;
  model: EmployeeHubReadModel;
  /** "Mon after 6:00 PM" when the shift runs into hours the employee marked unavailable. */
  clash?: string | null;
  onClose: () => void;
}) {
  return (
    <Sheet title="Your shift" onClose={onClose} returnToShiftId={shift.id}>
      <p className="eh-eyebrow">{shiftDate(shift.scheduled_date, true)}</p>
      <p className="eh-sheet-time">
        {formatTimeRange(
          shift.start_time,
          shift.end_time,
          model.settings.time_format,
          " – ",
        )}
      </p>
      <p className="eh-sheet-location">
        <MapPin size={17} />
        {shift.location_name} · {shift.job_name}
      </p>
      <p className="eh-section-description">
        {timeOffZoneName(shiftZone(model, shift))}
        {shift.end_time <= shift.start_time ? " · Ends the following day" : ""}
      </p>
      {clash ? <OwnAvailabilityFlag when={clash} shiftId={shift.id} /> : null}
      {shift.note && (
        <div className="eh-shift-note">
          <h3>Shift notes</h3>
          <p>{shift.note}</p>
        </div>
      )}
      {/* Three named ways to change it (TAKAS-RELEASE, plan 04:01); closed in the last 4 hours. */}
      <ChangeOptions
        hrefFor={(mode) => `${base}/shift-hub?offer=${shift.id}&mode=${mode}`}
        closed={shiftInstant(shift, model) - CLOSE_BEFORE_MS <= Date.now()}
      />
      <Link
        className="eh-sheet-link"
        to={`${base}/schedule?date=${shift.scheduled_date}&shift=${shift.id}#shift-${shift.id}`}
      >
        Open in my schedule
        <ArrowUpRight size={17} />
      </Link>
    </Sheet>
  );
}
export function ShiftUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Shift unavailable" onClose={onClose}>
      <p>
        This shift may have changed or is outside the current schedule range.
        Refresh your schedule to see the latest information.
      </p>
      <Link className="eh-primary" to={`${base}/schedule`}>
        Open my schedule
      </Link>
    </Sheet>
  );
}
