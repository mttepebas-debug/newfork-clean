import type { EmployeeHubReadModel, EmployeeHubShift } from "@newfork/shared";
import { useEffect, useId, useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { X, MapPin, ArrowUpRight } from "lucide-react";
import { addDays, formatTime } from "../schedule/lib/scheduleDateTime";
import { dateInZone } from "../lib/today";
import { shiftDate, shiftInstant, shiftZone } from "./dashboard-model";
import { CLOSE_BEFORE_MS, ChangeOptions } from "./shift-exchanges/ChangeOptions";
import { OwnAvailabilityFlag } from "./OwnAvailabilityFlag";
const base = "/app/employee-hub";
/** How far a pull goes before letting go closes the sheet, and how fast a flick must be (px per ms). */
const PULL_CLOSE = 90;
const FLICK_CLOSE = 0.6;
/**
 * A pull down closes the sheet (Mert 2026-10-24): from its grip always, from anywhere on it while it is scrolled
 * to its top. A short pull springs back; a pull that moved swallows the click it ends in.
 */
function usePullToClose(ref: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  const pull = useRef<{ id: number; y: number; t: number; dy: number; moved: boolean } | null>(null);
  const place = (dy: number, animate: boolean) => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.style.transition = animate ? "transform .22s cubic-bezier(.2, .8, .2, 1)" : "none";
    dialog.style.transform = dy ? `translateY(${dy}px)` : "";
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const dialog = ref.current;
    if (!dialog || event.button !== 0) return;
    const fromGrip = (event.target as Element).closest?.(".eh-sheet-top");
    if (!fromGrip && dialog.scrollTop > 0) return;
    pull.current = { id: event.pointerId, y: event.clientY, t: event.timeStamp, dy: 0, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const state = pull.current;
    if (!state || state.id !== event.pointerId) return;
    const dy = Math.max(0, event.clientY - state.y);
    if (!state.moved && dy < 6) return;
    if (!state.moved) {
      state.moved = true;
      ref.current?.setPointerCapture?.(event.pointerId);
    }
    state.dy = dy;
    place(dy, false);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const state = pull.current;
    pull.current = null;
    if (!state || state.id !== event.pointerId || !state.moved) return;
    const speed = state.dy / Math.max(1, event.timeStamp - state.t);
    if (state.dy >= PULL_CLOSE || speed >= FLICK_CLOSE) {
      place(ref.current?.offsetHeight || state.dy, true);
      window.setTimeout(onClose, 180);
    } else {
      place(0, true);
    }
    // The click a pull ends in opens nothing.
    const swallow = (click: Event) => {
      click.preventDefault();
      click.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  };
  const onPointerCancel = () => {
    if (pull.current?.moved) place(0, true);
    pull.current = null;
  };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

function Sheet({
  label,
  heading = false,
  children,
  onClose,
  returnToShiftId,
}: {
  /** The sheet's name for a screen reader; on screen only when it is also the heading. */
  label: string;
  heading?: boolean;
  children: ReactNode;
  onClose: () => void;
  returnToShiftId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const pull = usePullToClose(ref, onClose);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal?.();
    // A sheet with nothing to scroll can be pulled down from anywhere on it, a touch too.
    dialog?.classList.toggle("is-still", dialog.scrollHeight <= dialog.clientHeight);
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
      {...(heading ? { "aria-labelledby": id } : { "aria-label": label })}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      {...pull}
    >
      {/* The grip on top says the sheet can be pulled down, and is where to pull it from (Mert 2026-10-24). */}
      <div className={`eh-sheet-top${heading ? "" : " is-bare"}`}>
        <span className="eh-sheet-grip" aria-hidden />
        {heading ? <h2 id={id}>{label}</h2> : null}
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
  const format = model.settings.time_format;
  const today = dateInZone(new Date(), shiftZone(model, shift));
  const day =
    shift.scheduled_date === today
      ? "Today"
      : shift.scheduled_date === addDays(today, 1)
        ? "Tomorrow"
        : shiftDate(shift.scheduled_date);
  // The day and the hours as Home's card writes them, the hours in full (Mert 2026-10-24: never "9a"); no title
  // and no zone line.
  return (
    <Sheet label="Your shift" onClose={onClose} returnToShiftId={shift.id}>
      <p className="eh-sheet-date">{day}</p>
      <p className="eh-sheet-time">
        {formatTime(shift.start_time, format, "long")}
        <span className="eh-sheet-dash">–</span>
        {formatTime(shift.end_time, format, "long")}
      </p>
      <p className="eh-sheet-location">
        <MapPin size={17} />
        {shift.location_name} · {shift.job_name}
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
      {/* Lands on the shift, marked, with its sheet closed (?focus=): the sheet over My shifts hid the page. */}
      {scheduleLink ? (
        <Link
          className="eh-sheet-link"
          to={`${base}/schedule?date=${shift.scheduled_date}&focus=${shift.id}#shift-${shift.id}`}
        >
          Open in my schedule
          <ArrowUpRight size={17} />
        </Link>
      ) : null}
    </Sheet>
  );
}
export function ShiftUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label="Shift unavailable" heading onClose={onClose}>
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
