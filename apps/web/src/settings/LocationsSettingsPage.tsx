import {
  locationInputSchema,
  type Location,
  type LocationInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, MapPin, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
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

export default function LocationsSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const queryKey = ["organization-locations", workspaceId];
  const locations = useQuery({
    queryKey,
    queryFn: () => listLocations(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [draft, setDraft] = useState<LocationInput>(emptyLocation);
  const [formError, setFormError] = useState<string | null>(null);

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
    setEditing(location ?? "new");
    setDraft(location ? locationInputSchema.parse(location) : emptyLocation);
    setFormError(null);
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const parsed = locationInputSchema.safeParse(draft);
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
    (location) => showArchived || !location.archived_at,
  );

  return (
    <section
      className="settings-page"
      aria-labelledby="locations-settings-title"
    >
      <SettingsHeader
        icon={<MapPin size={21} aria-hidden />}
        title="Locations"
        description="Restaurant addresses and local time zones used throughout scheduling."
        action={
          <Button type="button" onClick={() => openEditor()}>
            <Plus size={16} aria-hidden />
            Add location
          </Button>
        }
      />
      <label className="archive-filter">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Show archived
      </label>
      {editing ? (
        <form
          className="entity-editor"
          onSubmit={submit}
          aria-label={
            editing === "new" ? "Add location" : `Edit ${editing.name}`
          }
        >
          <div className="entity-editor-heading">
            <div>
              <strong>
                {editing === "new" ? "New location" : "Edit location"}
              </strong>
              <span>All fields are required.</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close location editor"
              title="Close"
              onClick={() => setEditing(null)}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="location-fields">
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
                setDraft((current) => ({ ...current, street_address: value }))
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
            <label className="form-field">
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
          </div>
          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}
          <div className="entity-editor-actions">
            <Button
              className="secondary-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving" : "Save location"}
            </Button>
          </div>
        </form>
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
        <div className="entity-list" aria-label="Locations">
          {visible.map((location) => (
            <div
              className="entity-row"
              key={location.id}
              data-archived={Boolean(location.archived_at)}
            >
              <span className="entity-marker location-marker">
                <MapPin size={16} aria-hidden />
              </span>
              <div className="entity-summary">
                <strong>{location.name}</strong>
                <span>
                  {location.street_address}, {location.city}, {location.region}{" "}
                  {location.postal_code}
                </span>
                <small>
                  {timezones.find(
                    ([value]) => value === location.timezone,
                  )?.[1] ?? location.timezone}
                </small>
              </div>
              {location.archived_at ? (
                <span className="status-label">Archived</span>
              ) : null}
              <div className="row-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Edit ${location.name}`}
                  title="Edit"
                  onClick={() => openEditor(location)}
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${location.archived_at ? "Restore" : "Archive"} ${location.name}`}
                  title={location.archived_at ? "Restore" : "Archive"}
                  onClick={() =>
                    archiveMutation.mutate({
                      id: location.id,
                      archived: !location.archived_at,
                    })
                  }
                >
                  {location.archived_at ? (
                    <RotateCcw size={16} aria-hidden />
                  ) : (
                    <Archive size={16} aria-hidden />
                  )}
                </button>
              </div>
            </div>
          ))}
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
    <label className={`form-field ${className}`}>
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
