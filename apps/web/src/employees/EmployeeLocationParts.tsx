import type { EmployeeDetail, EmployeeSummary } from "@newfork/shared";
import { ConfirmButton } from "@newfork/ui";
import { Info, Lock, MapPin } from "lucide-react";
import "./employee-location-parts.css";

/*
 * Where somebody works, on the Employees screen (FB-6.2.8): Remove on the
 * location's own row, a manager's Terminate shown switched off with the
 * reason, and the list's location cell with its "No location" chip.
 */

type Location = EmployeeDetail["locations"][number];

const terminateOnlyAdmin = "Only an admin or the owner can terminate an employee.";

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

/** Terminate shown to a manager, switched off, with the reason as its title. */
export function PassiveTerminate() {
  return (
    <button
      type="button"
      className="employee-lifecycle-button employee-terminate-passive"
      disabled
      title={terminateOnlyAdmin}
    >
      <Lock size={15} aria-hidden />
      Terminate employee
    </button>
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
  return employee.location_count === 0 && !employee.primary_location_name;
}

/** The Employees list's location cell: primary location, or the "No location" chip. */
export function EmployeeLocationCell({ employee }: { readonly employee: EmployeeSummary }) {
  return (
    <span className="employee-cell-with-icon employee-location-cell">
      {hasNoLocation(employee) ? (
        <span className="employee-chip employee-chip-warning">No location</span>
      ) : (
        <>
          <MapPin size={15} aria-hidden />
          <span className="employee-location-name">
            {employee.primary_location_name ?? "Unassigned"}
          </span>
          {employee.location_count > 1 ? <small>+{employee.location_count - 1}</small> : null}
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
