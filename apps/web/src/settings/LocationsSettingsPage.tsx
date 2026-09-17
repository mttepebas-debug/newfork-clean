import { CatalogDrawer } from "./CatalogDrawer";
import {
  suggestLocationShortName,
  type Location,
  type LocationInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Search, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { CatalogRowMenu } from "./CatalogRowMenu";
import { CatalogDeleteAction } from "./CatalogDeleteAction";
import "./jobs-settings.css";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import { LocationTimezoneField } from "./LocationTimezoneField";
import {
  checkLocationDraft,
  formatUsPhone,
  type LocationDraft,
  type LocationFieldErrors as FieldErrors,
} from "./location-draft";
import {
  listLocations,
  saveLocation,
  setLocationArchived,
} from "./organization-data";

const emptyLocation: LocationDraft = {
  name: "",
  short_name: "",
  phone: "",
  street_address: "",
  city: "",
  region: "CA",
  postal_code: "",
  country_code: "US",
  timezone: "",
};

const timezones = [
  ["America/Los_Angeles", "Pacific Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Chicago", "Central Time"],
  ["America/New_York", "Eastern Time"],
  ["America/Phoenix", "Arizona Time"],
  ["Pacific/Honolulu", "Hawaii Time"],
] as const;

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function locationDraft(location: Location): LocationDraft {
  return {
    name: location.name,
    short_name: location.short_name,
    phone: formatUsPhone(location.phone ?? ""),
    street_address: location.street_address,
    city: location.city,
    region: location.region,
    postal_code: location.postal_code,
    country_code: location.country_code,
    timezone: location.timezone,
  };
}

export default function LocationsSettingsPage() {
  const { context } = useAuth();
  const canEdit =
    context?.permissions.includes("settings.locations.manage") ?? false;
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["organization-locations", workspaceId];
  const locations = useQuery({
    queryKey,
    queryFn: () => listLocations(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [draft, setDraft] = useState<LocationDraft>(emptyLocation);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [deleteLocked, setDeleteLocked] = useState(false);

  const closeEditor = (): void => {
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: ({ values, id }: { values: LocationInput; id?: string }) =>
      saveLocation(workspaceId, values, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({
        queryKey: ["schedule-read", workspaceId],
      });
      setEditing(null);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setLocationArchived(workspaceId, id, archived),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => setFormError(errorText(error)),
  });

  const openEditor = (location?: Location): void => {
    if (deleteLocked || saveMutation.isPending) return;
    setEditing(location ?? "new");
    setDraft(location ? locationDraft(location) : emptyLocation);
    setFormError(null);
    setFieldErrors({});
  };

  const checked = checkLocationDraft(draft);
  const canSave =
    canEdit &&
    !deleteLocked &&
    !saveMutation.isPending &&
    Boolean(editing) &&
    checked.complete &&
    (editing === "new" ||
      Boolean(
        editing &&
        !sameJson(checked.input, {
          ...locationDraft(editing),
          phone: editing.phone ?? null,
        }),
      ));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canSave) return;
    setDraft((current) => ({ ...current, short_name: checked.input.short_name }));
    setFieldErrors(checked.errors);
    if (!checked.parsed.success) return;
    saveMutation.mutate({
      values: checked.parsed.data,
      ...(editing !== "new" && editing ? { id: editing.id } : {}),
    });
  };
  const setField = (field: keyof FieldErrors, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };
  const visible = (locations.data ?? []).filter(
    (location) =>
      (showArchived || !location.archived_at) &&
      (!search.trim() ||
        `${location.name} ${location.street_address} ${location.city}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );

  return (
    <section
      className="settings-page jobs-settings-page locations-catalog-settings-page"
      aria-labelledby="locations-settings-title"
    >
      <SettingsHeader
        icon={<MapPin size={21} aria-hidden />}
        title="Locations"
        description="Restaurant addresses and local time zones used throughout scheduling."
        action={
          <Button
            className="job-primary-button"
            type="button"
            disabled={!canEdit || saveMutation.isPending || deleteLocked}
            onClick={() => openEditor()}
          >
            <Plus size={16} aria-hidden />
            Add location
          </Button>
        }
      />
      <div className="job-catalog-toolbar">
        <label className="job-search">
          <Search size={16} />
          <input
            aria-label="Search locations"
            placeholder="Search name or address"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="job-archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>
      {editing ? (
        <CatalogDrawer
          label={editing === "new" ? "Add location" : `Edit ${editing.name}`}
          className="locations-catalog-settings-page"
          onClose={closeEditor}
          busy={saveMutation.isPending || deleteLocked}
        >
          <form
            className="job-catalog-editor"
            onSubmit={submit}
            noValidate
            aria-label={
              editing === "new" ? "Add location" : `Edit ${editing.name}`
            }
          >
            <div className="job-editor-title">
              <div>
                <h2>{editing === "new" ? "New location" : "Edit location"}</h2>
                <p>Phone number is optional.</p>
              </div>
              <button
                type="button"
                className="job-icon-button"
                aria-label="Close location editor"
                disabled={deleteLocked || saveMutation.isPending}
                title="Close"
                onClick={closeEditor}
              >
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="catalog-drawer-body">
              <fieldset
                className="location-catalog-fields"
                disabled={!canEdit || saveMutation.isPending || deleteLocked}
              >
                <FormField
                  label="Location name"
                  value={draft.name}
                  maxLength={120}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, name: value }))
                  }
                />
                <FormField
                  label="Short name"
                  value={draft.short_name}
                  maxLength={12}
                  placeholder={suggestLocationShortName(draft.name)}
                  error={fieldErrors.short_name}
                  onChange={(value) =>
                    setField("short_name", value.toUpperCase())
                  }
                />
                <FormField
                  label="Phone number"
                  type="tel"
                  inputMode="numeric"
                  optional
                  value={draft.phone}
                  maxLength={14}
                  placeholder="(415) 555-0100"
                  error={fieldErrors.phone}
                  onChange={(value) => setField("phone", formatUsPhone(value))}
                />
                <FormField
                  label="Street address"
                  value={draft.street_address}
                  maxLength={180}
                  className="field-wide"
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      street_address: value,
                    }))
                  }
                />
                <FormField
                  label="City"
                  value={draft.city}
                  maxLength={100}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, city: value }))
                  }
                />
                <FormField
                  label="State / region"
                  value={draft.region}
                  maxLength={100}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, region: value }))
                  }
                />
                <FormField
                  label="ZIP / postal code"
                  value={draft.postal_code}
                  maxLength={20}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, postal_code: value }))
                  }
                />
                <label className="job-field">
                  <span>Time zone</span>
                  <LocationTimezoneField
                    country={draft.country_code}
                    postal={draft.postal_code}
                    value={draft.timezone}
                    onChange={(timezone) =>
                      setDraft((current) => ({ ...current, timezone }))
                    }
                  />
                </label>
              </fieldset>
              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>
            <div className="job-editor-footer">
              {editing !== "new" && (
                <CatalogDeleteAction
                  key={editing.id}
                  inline
                  kind="locations"
                  id={editing.id}
                  name={editing.name}
                  workspaceId={workspaceId}
                  disabled={!canEdit || saveMutation.isPending}
                  onLockChange={setDeleteLocked}
                  onDeleted={closeEditor}
                />
              )}
              <div className="job-editor-actions">
                <Button
                  className="job-secondary-button"
                  type="button"
                  disabled={deleteLocked || saveMutation.isPending}
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
                <Button
                  className="job-primary-button"
                  type="submit"
                  disabled={!canSave}
                >
                  {saveMutation.isPending ? "Saving" : "Save location"}
                </Button>
              </div>
            </div>
          </form>
        </CatalogDrawer>
      ) : null}
      {!editing && formError ? (
        <p className="settings-state error" role="alert">
          {formError}
        </p>
      ) : null}
      {locations.isLoading ? (
        <p className="settings-state">Loading locations...</p>
      ) : null}
      {locations.error ? (
        <p className="settings-state error" role="alert">
          {errorText(locations.error)}
        </p>
      ) : null}
      {!locations.isLoading && !locations.error && visible.length === 0 ? (
        <div className="settings-empty">
          <MapPin size={22} aria-hidden />
          <strong>
            {showArchived ? "No archived locations" : "No locations yet"}
          </strong>
          <p>
            Add the first restaurant location to establish scheduling context.
          </p>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <div className="job-catalog" aria-label="Locations">
          <div className="job-column-headings location-catalog-row">
            <span>Location</span>
            <span className="location-address-col">Address</span>
            <span>Phone number</span>
            <span>Time zone</span>
            <span />
          </div>
          {visible.map((location) => {
            const zone =
              timezones.find(([value]) => value === location.timezone)?.[1] ??
              location.timezone;
            const address = `${location.street_address}, ${location.city}, ${location.region} ${location.postal_code}`;
            const phone = location.phone ? formatUsPhone(location.phone) : "—";
            return (
              <div
                className="job-catalog-row location-catalog-row"
                key={location.id}
                data-archived={Boolean(location.archived_at)}
              >
                <button
                  type="button"
                  className="job-row-identity"
                  onClick={() => openEditor(location)}
                >
                  <MapPin size={17} className="location-catalog-marker" />
                  <span className="job-name-stack">
                    <span className="job-row-name" title={location.name}>
                      {location.name}
                    </span>
                    <span className="location-catalog-address location-address-meta">{address}</span>
                    <span className="job-mobile-meta">{location.phone ? `${zone} · ${phone}` : zone}</span>
                  </span>
                  {location.archived_at && (
                    <span className="job-archived-label">Archived</span>
                  )}
                </button>
                <span
                  className="location-catalog-address location-catalog-cell location-address-col"
                  title={address}
                >
                  {address}
                </span>
                <span className="location-catalog-zone location-catalog-cell">
                  {phone}
                </span>
                <span className="location-catalog-zone">{zone}</span>
                {canEdit && (
                  <CatalogRowMenu name={location.name}>
                    <button type="button" onClick={() => openEditor(location)}>
                      Edit location
                    </button>
                    <button
                      type="button"
                      className={
                        !location.archived_at ? "job-danger-text" : undefined
                      }
                      disabled={!canEdit || archiveMutation.isPending}
                      onClick={() =>
                        archiveMutation.mutate({
                          id: location.id,
                          archived: !location.archived_at,
                        })
                      }
                    >
                      {location.archived_at ? "Restore" : "Archive"}
                    </button>
                  </CatalogRowMenu>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function FormField({
  label,
  value,
  onChange,
  maxLength,
  className = "",
  placeholder,
  error,
  optional = false,
  type = "text",
  inputMode,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength: number;
  readonly className?: string;
  readonly placeholder?: string;
  readonly error?: string;
  readonly optional?: boolean;
  readonly type?: "text" | "tel";
  readonly inputMode?: "numeric";
}) {
  const errorId = useId();
  return (
    <div className={`location-field ${className}`}>
      <label className="job-field">
        <span>{label}</span>
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          required={!optional}
        />
      </label>
      {error ? (
        <small className="location-field-error" id={errorId} role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
