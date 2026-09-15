import { CatalogDrawer } from "./CatalogDrawer";
import {
  locationInputSchema,
  type Location,
  type LocationInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { CatalogRowMenu } from "./CatalogRowMenu";
import { CatalogDeleteAction } from "./CatalogDeleteAction";
import "./jobs-settings.css";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  listLocations,
  saveLocation,
  setLocationArchived,
} from "./organization-data";

const emptyLocation: LocationInput = {
  name: "",
  street_address: "",
  city: "",
  region: "CA",
  postal_code: "",
  country_code: "US",
  timezone: "America/Los_Angeles",
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
  const [draft, setDraft] = useState<LocationInput>(emptyLocation);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteLocked, setDeleteLocked] = useState(false);

  const closeEditor = (): void => {
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: ({ values, id }: { values: LocationInput; id?: string }) =>
      saveLocation(workspaceId, values, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
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
    setDraft(location ? locationInputSchema.parse(location) : emptyLocation);
    setFormError(null);
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = locationInputSchema.safeParse(draft);
    if (!canSave) return;
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Complete every location field",
      );
      return;
    }
    saveMutation.mutate({
      values: parsed.data,
      ...(editing !== "new" && editing ? { id: editing.id } : {}),
    });
  };

  const visible = (locations.data ?? []).filter(
    (location) =>
      (showArchived || !location.archived_at) &&
      (!search.trim() ||
        `${location.name} ${location.street_address} ${location.city}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())),
  );
  const parsedDraft = locationInputSchema.safeParse(draft);
  const locationBaseline =
    editing && editing !== "new" ? locationInputSchema.parse(editing) : null;
  const canSave =
    canEdit &&
    !deleteLocked &&
    !saveMutation.isPending &&
    Boolean(editing) &&
    parsedDraft.success &&
    (editing === "new" ||
      Boolean(
        locationBaseline && !sameJson(parsedDraft.data, locationBaseline),
      ));

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
            aria-label={
              editing === "new" ? "Add location" : `Edit ${editing.name}`
            }
          >
            <div className="job-editor-title">
              <div>
                <h2>{editing === "new" ? "New location" : "Edit location"}</h2>
                <p>All fields are required.</p>
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
                  <select
                    value={draft.timezone}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        timezone: event.target.value,
                      }))
                    }
                  >
                    {timezones.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
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
            <span>Time zone</span>
            <span />
          </div>
          {visible.map((location) => {
            const zone =
              timezones.find(([value]) => value === location.timezone)?.[1] ??
              location.timezone;
            const address = `${location.street_address}, ${location.city}, ${location.region} ${location.postal_code}`;
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
                    <span className="location-catalog-address" title={address}>
                      {address}
                    </span>
                    <span className="job-mobile-meta">{zone}</span>
                  </span>
                  {location.archived_at && (
                    <span className="job-archived-label">Archived</span>
                  )}
                </button>
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
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength: number;
  readonly className?: string;
}) {
  return (
    <label className={`job-field ${className}`}>
      <span>{label}</span>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}
