import { AlertCircle, ArrowLeftRight, CalendarOff } from "lucide-react";
import { Link } from "react-router";

const base = "/app/employee-hub";

/**
 * Under a shift the employee marked unavailable (spec "Kurallar" 5, mockup
 * availability-tur2 `myschedPhone`): a small orange note, never a new
 * notification. The shift stays theirs; the two ways out are the existing
 * Shift Hub offer and the Time off form.
 */
export function OwnAvailabilityFlag({ when, shiftId }: { readonly when: string; readonly shiftId: string }) {
  return (
    <div className="eh-avail-flag" role="note">
      <AlertCircle size={15} aria-hidden className="eh-avail-flag-icon" />
      <div>
        <p>
          <strong>You marked {when} unavailable.</strong> You're scheduled, so the shift is yours.
        </p>
        <div className="eh-avail-flag-actions">
          <Link to={`${base}/shift-hub?offer=${shiftId}`}>
            <ArrowLeftRight size={13} aria-hidden /> Swap or give up
          </Link>
          <Link to={`${base}/my-availability?section=time-off`}>
            <CalendarOff size={13} aria-hidden /> Request time off
          </Link>
        </div>
      </div>
    </div>
  );
}
