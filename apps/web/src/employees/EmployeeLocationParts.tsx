import type { EmployeeDetail, EmployeeSummary } from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { Info, Lock, MapPin } from "lucide-react";
import { useId, useState } from "react";
import "./employee-location-parts.css";

/*
 * Where somebody works and manages, on the Employees screen (FB-6.2.8):
 * Remove on the location's own row, a manager's Terminate shown switched off
 * with the reason, the admin's "manages without working there" list, and the
 * list's location cell with "No location" and "Manages" chips.
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

type Option = { readonly id: string; readonly name: string; readonly archived?: boolean };

/** The admin's "manages without working there" list, shaped like Locations above it. */
export function ManagedLocationsField({
  managed,
  options,
  editable,
  saving,
  onSave,
}: {
  readonly managed: EmployeeDetail["managed_locations"];
  readonly options: readonly Option[];
  readonly editable: boolean;
  readonly saving: boolean;
  readonly onSave: (locationIds: readonly string[]) => void;
}) {
  const saved = managed.map((location) => location.id);
  const [picked, setPicked] = useState<readonly string[]>(saved);
  const labelId = useId();
  const helpId = useId();
  const dirty = picked.length !== saved.length || picked.some((id) => !saved.includes(id));
  const offered = options.filter((option) => !option.archived || picked.includes(option.id));
  return (
    <fieldset
      className="employee-assignment-picker employee-managed-field"
      disabled={saving}
      aria-labelledby={labelId}
      aria-describedby={helpId}
    >
      <legend>
        <span id={labelId}>Manages without working there</span>
        <span className="employee-field-requirement">Optional</span>
      </legend>
      <small id={helpId} className="employee-managed-help">
        Manager access where they don't work: no shifts and no Schedule row there.
      </small>
      {editable ? (
        <>
          {offered.map((option) => (
            <div key={option.id}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.includes(option.id)}
                  onChange={(event) =>
                    setPicked((current) =>
                      event.target.checked
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id),
                    )
                  }
                />
                <span>{option.name}</span>
              </label>
            </div>
          ))}
          {offered.length === 0 ? <p>No other locations.</p> : null}
          {dirty ? (
            <div className="employee-managed-save">
              <Button
                type="button"
                aria-label="Save managed locations"
                onClick={() => onSave(picked)}
              >
                {saving ? "Saving" : "Save"}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <ul className="employee-managed-readonly">
          {managed.map((location) => (
            <li key={location.id}>
              <MapPin size={15} aria-hidden />
              {location.name}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function hasNoLocation(employee: EmployeeSummary): boolean {
  return employee.location_count === 0 && !employee.primary_location_name;
}

/** The Employees list's location cell: primary location, then "Manages" chips. */
export function EmployeeLocationCell({ employee }: { readonly employee: EmployeeSummary }) {
  const managed = employee.managed_location_names;
  return (
    <span className="employee-cell-with-icon employee-location-cell">
      {!hasNoLocation(employee) ? (
        <>
          <MapPin size={15} aria-hidden />
          <span className="employee-location-name">
            {employee.primary_location_name ?? "Unassigned"}
          </span>
          {employee.location_count > 1 ? <small>+{employee.location_count - 1}</small> : null}
        </>
      ) : managed.length === 0 ? (
        <span className="employee-chip employee-chip-warning">No location</span>
      ) : null}
      {managed.map((name) => (
        <span key={name} className="employee-chip">Manages {name}</span>
      ))}
    </span>
  );
}

/** The same chips under the person's name, on the phone only (no location column there). */
export function EmployeeLocationChips({ employee }: { readonly employee: EmployeeSummary }) {
  const managed = employee.managed_location_names;
  const noLocation = hasNoLocation(employee) && managed.length === 0;
  if (!noLocation && managed.length === 0) return null;
  return (
    <span className="employee-location-chips">
      {noLocation ? <span className="employee-chip employee-chip-warning">No location</span> : null}
      {managed.map((name) => (
        <span key={name} className="employee-chip">Manages {name}</span>
      ))}
    </span>
  );
}
