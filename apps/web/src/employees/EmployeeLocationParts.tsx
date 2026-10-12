import type { EmployeeDetail, EmployeeSummary } from "@newfork/shared";
import { ConfirmButton } from "@newfork/ui";
import { Info, Lock, MapPin } from "lucide-react";
import { Tooltip } from "../shell/Tooltip";
import "./employee-location-parts.css";

/*
 * Where somebody works, on the Employees screen (FB-6.2.8): Remove on the
 * location's own row, a manager's Terminate shown switched off with the
 * reason, and the list's location cell with its "No location" chip.
 */

type Location = EmployeeDetail["locations"][number];

const terminateOnlyAdmin = "Only an admin or the owner can terminate an employee.";

/** Why the Owner job cannot be ticked: Employees drawer and setup's Add your team. */
export const ownerJobReason = "Only the workspace owner holds the Owner job.";

function personName(detail: EmployeeDetail): string {
  return detail.preferred_name || detail.first_name;
}

/** Remove on a location's row: soft red at rest, solid once armed (two clicks). */
export function RemoveFromLocationButton({
  location,
  removing,
  disabled,
  onRemove,
}: {
  readonly location: Location;
  readonly removing: boolean;
  readonly disabled: boolean;
  readonly onRemove: (locationId: string) => void;
}) {
  return (
    <ConfirmButton
      className="danger-button employee-location-remove"
      type="button"
      disabled={disabled}
      confirmLabel="Confirm remove"
      aria-label={`Remove from ${location.name}`}
      confirmName={`Confirm remove from ${location.name}`}
      title="Their shifts there from now on are left open. The employee record stays."
      onConfirm={() => onRemove(location.id)}
    >
      {removing ? "Removing" : "Remove"}
    </ConfirmButton>
  );
}

/**
 * Terminate shown switched off: to a manager, or while a draft is unsaved. It
 * stays reachable and does nothing; the reason opens in the app's bubble on
 * hover, keyboard focus and a tap, and is what it is described by (BL-429).
 */
export function PassiveTerminate({
  reason = terminateOnlyAdmin,
}: {
  readonly reason?: string;
}) {
  return (
    <Tooltip
      unstyled
      label="Terminate employee"
      content={reason}
      className="employee-lifecycle-button employee-terminate-passive"
      aria-disabled="true"
    >
      <Lock size={15} aria-hidden />
      Terminate employee
    </Tooltip>
  );
}

/** The one-line reason under the Locations list (seen on the phone too). */
export function TerminateNote({
  detail,
  removable,
}: {
  readonly detail: EmployeeDetail;
  readonly removable: readonly Location[];
}) {
  const where = removable.map((location) => location.name).join(" or ");
  return (
    <p className="employee-terminate-note">
      <Info size={15} aria-hidden />
      <span>
        {terminateOnlyAdmin}{" "}
        {where ? `To take ${personName(detail)} off ${where}, use Remove.` : null}
      </span>
    </p>
  );
}

function hasNoLocation(employee: EmployeeSummary): boolean {
  return employee.locations.length === 0;
}

/**
 * The Employees list's location cell: the first location (the primary, else
 * A to Z) and the count of the others, or the "No location" chip. The owner,
 * who has no primary, reads "Kadikoy +1" (G3, BL-428).
 */
export function EmployeeLocationCell({ employee }: { readonly employee: EmployeeSummary }) {
  const [first, ...others] = employee.locations;
  return (
    <span className="employee-cell-with-icon employee-location-cell">
      {first === undefined ? (
        <span className="employee-chip employee-chip-warning">No location</span>
      ) : (
        <>
          <MapPin size={15} aria-hidden />
          <span className="employee-location-name">{first.name}</span>
          {others.length > 0 ? <small>+{others.length}</small> : null}
        </>
      )}
    </span>
  );
}

/** The same chip under the person's name, on the phone only (no location column there). */
export function EmployeeLocationChips({ employee }: { readonly employee: EmployeeSummary }) {
  if (!hasNoLocation(employee)) return null;
  return (
    <span className="employee-location-chips">
      <span className="employee-chip employee-chip-warning">No location</span>
    </span>
  );
}
