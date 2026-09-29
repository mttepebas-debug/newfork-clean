import type { EmployeeDetail, EmployeeSummary } from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { Info, Lock, MapPin, MapPinOff, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import type { V8 } from "../dev/fb628-variants";
import "./fb628-variants.css";

/*
 * FB-6.2.8 DEV variants for the Employees screen (?v8=a|b|c):
 * 1. Remove from <location> and the manager's passive Terminate,
 * 2. "Manages" (list label and the admin's field in the drawer).
 * ponytail: the user picks one per piece; the rest of this file goes.
 */

type Location = EmployeeDetail["locations"][number];

const terminateOnlyAdmin = "Only an admin or the owner can terminate an employee.";

export function personName(detail: EmployeeDetail): string {
  return detail.preferred_name || detail.first_name;
}

/** Remove button, soft red at rest and solid once armed (two clicks). */
export function RemoveFromLocationButton({
  location,
  removing,
  disabled,
  compact = false,
  onRemove,
}: {
  readonly location: Location;
  readonly removing: boolean;
  readonly disabled: boolean;
  readonly compact?: boolean;
  readonly onRemove: (locationId: string) => void;
}) {
  return (
    <ConfirmButton
      className={`danger-button v8-remove${compact ? " v8-remove-compact" : ""}`}
      type="button"
      disabled={disabled}
      confirmLabel={compact ? "Confirm remove" : `Confirm remove from ${location.name}`}
      aria-label={compact ? `Remove from ${location.name}` : undefined}
      confirmName={compact ? `Confirm remove from ${location.name}` : undefined}
      title="Their shifts there from now on are left open. The employee record stays."
      onConfirm={() => onRemove(location.id)}
    >
      {removing ? "Removing" : compact ? "Remove" : `Remove from ${location.name}`}
    </ConfirmButton>
  );
}

/** Terminate shown to a manager, switched off, with the reason next to it. */
export function PassiveTerminate({ describedBy }: { readonly describedBy?: string }) {
  return (
    <button
      type="button"
      className="employee-lifecycle-button v8-terminate-passive"
      disabled
      aria-describedby={describedBy}
      title={terminateOnlyAdmin}
    >
      <Lock size={15} aria-hidden />
      Terminate employee
    </button>
  );
}

/** A: the one-line reason under the Locations list (seen on the phone too). */
export function TerminateNote({
  id,
  detail,
  removable,
}: {
  readonly id: string;
  readonly detail: EmployeeDetail;
  readonly removable: readonly Location[];
}) {
  const where = removable.map((location) => location.name).join(" or ");
  return (
    <p id={id} className="v8-terminate-note">
      <Info size={15} aria-hidden />
      <span>
        {terminateOnlyAdmin}{" "}
        {where ? `To take ${personName(detail)} off ${where}, use Remove.` : null}
      </span>
    </p>
  );
}

/** C: where they work, one card per location, and what ending employment takes. */
export function WorkLocationCards({
  detail,
  removingLocationId,
  onRemove,
}: {
  readonly detail: EmployeeDetail;
  readonly removingLocationId: string | null;
  readonly onRemove: (locationId: string) => void;
}) {
  const noteId = useId();
  const name = personName(detail);
  const removable = detail.locations.filter((location) => location.removable);
  return (
    <section className="v8-work-cards" aria-label={`Where ${name} works`}>
      <h3 className="employee-form-section-title">Where {name} works</h3>
      <ul>
        {detail.locations.map((location) => (
          <li key={location.id} className="v8-work-card">
            <MapPin size={16} aria-hidden />
            <span className="v8-work-card-name">
              <strong>{location.name}</strong>
              {detail.primary_location_id === location.id ? <small>Primary</small> : null}
            </span>
            {location.removable ? (
              <RemoveFromLocationButton
                location={location}
                removing={removingLocationId === location.id}
                disabled={removingLocationId !== null}
                onRemove={onRemove}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {!detail.allowed.terminate && !detail.archived_at ? (
        <div className="v8-end-employment">
          <div>
            <strong>Ending employment</strong>
            <p id={noteId}>
              {terminateOnlyAdmin}
              {removable.length > 0
                ? ` Removing ${name} from ${removable.map((location) => location.name).join(" or ")} ends their shifts there; the record stays.`
                : null}
            </p>
          </div>
          <PassiveTerminate describedBy={noteId} />
        </div>
      ) : null}
    </section>
  );
}

/** B: Remove sits in the bottom bar where Terminate sits for an admin. */
export function FooterRemoveGroup({
  detail,
  removingLocationId,
  onRemove,
}: {
  readonly detail: EmployeeDetail;
  readonly removingLocationId: string | null;
  readonly onRemove: (locationId: string) => void;
}) {
  return (
    <div className="v8-footer-remove">
      {detail.locations
        .filter((location) => location.removable)
        .map((location) => (
          <RemoveFromLocationButton
            key={location.id}
            location={location}
            removing={removingLocationId === location.id}
            disabled={removingLocationId !== null}
            onRemove={onRemove}
          />
        ))}
      <PassiveTerminate />
    </div>
  );
}

type Option = { readonly id: string; readonly name: string; readonly archived?: boolean };

/** 2b: the admin's "manages without working there" field, three shapes. */
export function ManagedLocationsVariant({
  variant,
  managed,
  options,
  editable,
  saving,
  onSave,
}: {
  readonly variant: V8;
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
  const dirty =
    picked.length !== saved.length || picked.some((id) => !saved.includes(id));
  const offered = options.filter((option) => !option.archived || picked.includes(option.id));
  const nameOf = (id: string) =>
    options.find((option) => option.id === id)?.name ??
    managed.find((location) => location.id === id)?.name ??
    id;
  const toggle = (id: string, on: boolean) =>
    setPicked((current) => (on ? [...current, id] : current.filter((item) => item !== id)));
  const help = "Manager access where they don't work: no shifts and no Schedule row there.";
  const save = editable ? (
    <Button type="button" className="v8-managed-save" disabled={saving || !dirty} onClick={() => onSave(picked)}>
      {saving ? "Saving" : "Save"}
    </Button>
  ) : null;
  const readOnlyList = (
    <ul className="v8-chip-list">
      {managed.map((location) => (
        <li key={location.id} className="v8-chip">{location.name}</li>
      ))}
    </ul>
  );

  if (variant === "b") {
    const addable = offered.filter((option) => !picked.includes(option.id));
    return (
      <div className="v8-managed v8-managed-b" role="group" aria-labelledby={labelId} aria-describedby={helpId}>
        <div className="v8-managed-head">
          <span id={labelId}>Also manages</span>
          {save}
        </div>
        <small id={helpId}>{help}</small>
        {editable ? (
          <>
            <ul className="v8-chip-list">
              {picked.map((id) => (
                <li key={id} className="v8-chip">
                  {nameOf(id)}
                  <button type="button" aria-label={`Stop managing ${nameOf(id)}`} disabled={saving} onClick={() => toggle(id, false)}>
                    <X size={13} aria-hidden />
                  </button>
                </li>
              ))}
              {picked.length === 0 ? <li className="v8-chip-empty">None</li> : null}
            </ul>
            {addable.length > 0 ? (
              <label className="v8-managed-add">
                <Plus size={15} aria-hidden />
                <span className="sr-only">Add a location they manage</span>
                <select
                  value=""
                  disabled={saving}
                  onChange={(event) => event.target.value && toggle(event.target.value, true)}
                >
                  <option value="">Add a location…</option>
                  {addable.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : (
          readOnlyList
        )}
      </div>
    );
  }

  if (variant === "c") {
    // Same shape as the Locations list above it.
    return (
      <fieldset className="employee-assignment-picker v8-managed-c" disabled={!editable || saving} aria-describedby={helpId}>
        <legend>
          Manages without working there
          <span className="employee-field-requirement">Optional</span>
        </legend>
        <small id={helpId} className="v8-managed-help">{help}</small>
        {offered.map((option) => (
          <div key={option.id}>
            <label>
              <input
                type="checkbox"
                checked={picked.includes(option.id)}
                onChange={(event) => toggle(option.id, event.target.checked)}
              />
              <span>{option.name}</span>
            </label>
          </div>
        ))}
        {offered.length === 0 ? <p>No other locations.</p> : null}
        {editable && dirty ? <div className="v8-managed-c-save">{save}</div> : null}
      </fieldset>
    );
  }

  // A: toggle pills in a quiet card.
  return (
    <div className="v8-managed v8-managed-a" role="group" aria-labelledby={labelId} aria-describedby={helpId}>
      <div className="v8-managed-head">
        <span id={labelId}>Manages without working there</span>
        {save}
      </div>
      <small id={helpId}>{help}</small>
      {editable ? (
        <div className="v8-pill-row">
          {offered.map((option) => (
            <label key={option.id} className="v8-pill" data-selected={picked.includes(option.id) ? "true" : "false"}>
              <input
                type="checkbox"
                checked={picked.includes(option.id)}
                disabled={saving}
                onChange={(event) => toggle(option.id, event.target.checked)}
              />
              <span>{option.name}</span>
            </label>
          ))}
          {offered.length === 0 ? <span className="v8-chip-empty">No other locations.</span> : null}
        </div>
      ) : (
        readOnlyList
      )}
    </div>
  );
}

/** 2a: the Employees list's location cell, "No location" and "Manages" together. */
export function LocationCellVariant({
  variant,
  employee,
}: {
  readonly variant: V8;
  readonly employee: EmployeeSummary;
}) {
  const managed = employee.managed_location_names;
  const noLocation = employee.location_count === 0 && !employee.primary_location_name;
  const primary = noLocation ? null : (employee.primary_location_name ?? "Unassigned");

  if (variant === "c") {
    return (
      <span className="employee-cell-with-icon v8-loc-c">
        {primary ? (
          <>
            <MapPin size={15} aria-hidden />
            <span className="v8-loc-name">{primary}</span>
            {employee.location_count > 1 ? <small>+{employee.location_count - 1}</small> : null}
          </>
        ) : managed.length === 0 ? (
          <span className="v8-tag v8-tag-warning">No location</span>
        ) : null}
        {managed.map((name) => (
          <span key={name} className="v8-loc-managed">
            <span className="v8-tag">Manages</span>
            {name}
          </span>
        ))}
      </span>
    );
  }

  if (variant === "b") {
    return (
      <span className="employee-cell-with-icon v8-loc-b">
        {primary ? (
          <>
            <MapPin size={15} aria-hidden />
            {primary}
            {employee.location_count > 1 ? <small>+{employee.location_count - 1}</small> : null}
          </>
        ) : managed.length === 0 ? (
          <span className="v8-loc-missing">
            <MapPinOff size={14} aria-hidden />
            No location
          </span>
        ) : (
          <span className="v8-loc-missing-quiet">No shifts anywhere</span>
        )}
      </span>
    );
  }

  // A: one chip shape for both, warning tone for "No location".
  return (
    <span className="employee-cell-with-icon v8-loc-a">
      {primary ? (
        <>
          <MapPin size={15} aria-hidden />
          <span className="v8-loc-name">{primary}</span>
          {employee.location_count > 1 ? <small>+{employee.location_count - 1}</small> : null}
        </>
      ) : managed.length === 0 ? (
        <span className="v8-chip v8-chip-warning">No location</span>
      ) : null}
      {managed.map((name) => (
        <span key={name} className="v8-chip">Manages {name}</span>
      ))}
    </span>
  );
}

/**
 * 2a, under the person's name. The phone list has no location column, so A
 * and C repeat their label here on the phone only; B puts "Manages" here on
 * every screen (and "No location" on the phone).
 */
export function IdentityManagedLine({
  variant,
  employee,
}: {
  readonly variant: V8;
  readonly employee: EmployeeSummary;
}) {
  const managed = employee.managed_location_names;
  const noLocation =
    employee.location_count === 0 && !employee.primary_location_name && managed.length === 0;
  if (!noLocation && managed.length === 0) return null;
  if (variant === "b") {
    return (
      <>
        {managed.length > 0 ? (
          <span className="v8-identity-managed">Manages {managed.join(", ")}</span>
        ) : null}
        {noLocation ? <span className="v8-identity-missing v8-phone-only">No location</span> : null}
      </>
    );
  }
  return (
    <span className="v8-identity-chips v8-phone-only">
      {noLocation ? (
        <span className={variant === "c" ? "v8-tag v8-tag-warning" : "v8-chip v8-chip-warning"}>
          No location
        </span>
      ) : null}
      {managed.map((name) =>
        variant === "c" ? (
          <span key={name} className="v8-loc-managed">
            <span className="v8-tag">Manages</span>
            {name}
          </span>
        ) : (
          <span key={name} className="v8-chip">Manages {name}</span>
        ),
      )}
    </span>
  );
}
