import { tabLineRef } from "../shell/useTabSwipe";
import { CatalogDrawer } from "./CatalogDrawer";
import { SettingsListHeader } from "./SettingsListHeader";
import {
  displayUsPhone,
  suggestLocationShortName,
  type Location,
  type LocationInput,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Search, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  ListAddButton,
} from "../views/CatalogPageHeader";
import { CatalogSortButton, nextCatalogSort } from "../views/CatalogSortButton";
import { CatalogArchiveButton, CatalogRowMenu } from "./CatalogRowMenu";
import { CatalogDeleteAction } from "./CatalogDeleteAction";
import "./jobs-settings.css";
import { errorText } from "./GeneralSettingsPage";
import { isGoneMeanwhile } from "../lib/catalog-refusals";
import { LocationTimezoneField } from "./LocationTimezoneField";
import { UsPhoneInput } from "../shell/UsPhoneInput";
import {
  checkLocationDraft,
  locationDraft,
  type LocationDraft,
  type LocationFieldErrors as FieldErrors,
} from "./location-draft";
import {
  listLocations,
  saveLocation,
  setLocationArchived,
} from "./organization-data";

import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { onTabListKeyDown } from "../lib/tab-list-keys";
import { WindowAlert } from "../shell/WindowAlert";
import { FieldNote, fieldNoteId } from "../shell/FieldNote";
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

type SortKey = "name" | "address" | "phone" | "timezone";

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
  // Active / Archived tabs replace "Show archived" (Locations A, Mert 2026-10-07):
  // Archived lists only archived locations.
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [sort, setSort] = useState<{
    key: SortKey;
    descending: boolean;
  } | null>(null);
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
    // BL-1045: a location deleted meanwhile leaves the list; its sentence stays.
    onError: (error) => {
      setFormError(errorText(error));
      if (isGoneMeanwhile(error)) void queryClient.invalidateQueries({ queryKey });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setLocationArchived(workspaceId, id, archived),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    // BL-1045: a location deleted meanwhile leaves the list; its sentence stays.
    onError: (error) => {
      setFormError(errorText(error));
      if (isGoneMeanwhile(error)) void queryClient.invalidateQueries({ queryKey });
    },
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
  const inTab = (locations.data ?? []).filter(
    (location) => Boolean(location.archived_at) === (tab === "archived"),
  );
  const visible = inTab
    .filter(
      (location) =>
        !search.trim() ||
        `${location.name} ${location.street_address} ${location.city}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (!sort) return 0;
      const comparison = sortText(a, sort.key).localeCompare(
        sortText(b, sort.key),
      );
      return sort.descending ? -comparison : comparison;
    });
  const sortColumn = (key: SortKey, label: string) => {
    const selected = sort?.key === key;
    return (
      <span
        role="columnheader"
        aria-sort={
          selected ? (sort.descending ? "descending" : "ascending") : "none"
        }
      >
        <CatalogSortButton
          active={selected}
          label={label}
          onClick={() =>
            setSort(nextCatalogSort(sort, key))
          }
        />
      </span>
    );
  };

  const addButton = canEdit ? (
    <ListAddButton
      label="New location"
      shortLabel="Add"
      disabled={saveMutation.isPending || deleteLocked}
      onClick={() => openEditor()}
    />
  ) : null;

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(locations.error))
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/settings/locations")}
      />
    );
  return (
    <section
      className="settings-page jobs-settings-page locations-catalog-settings-page list-page"
      aria-labelledby="locations-settings-title"
    >
      <SettingsListHeader
        icon={<MapPin size={21} aria-hidden />}
        title="Locations"
        titleId="locations-settings-title"
        description="Restaurant addresses and local time zones used throughout scheduling."
      />
      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div
            className="catalog-status-tabs"
            ref={tabLineRef}
            role="tablist"
            onKeyDown={onTabListKeyDown}
            aria-label="Location status"
          >
            {(
              [
                ["active", "Active"],
                ["archived", "Archived"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="catalog-toolbar-filter-row">
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label="Search locations"
              placeholder="Search name or address"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {addButton}
        </div>
      </div>
      {editing ? (
        <CatalogDrawer
          label={editing === "new" ? "New location" : `Edit ${editing.name}`}
          className="locations-catalog-settings-page"
          onClose={closeEditor}
          busy={saveMutation.isPending || deleteLocked}
        >
          <form
            className="job-catalog-editor"
            onSubmit={submit}
            noValidate
            aria-label={
              editing === "new" ? "New location" : `Edit ${editing.name}`
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
                  error={fieldErrors.name}
                  onChange={(value) => setField("name", value)}
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
                  phone
                  optional
                  value={draft.phone}
                  maxLength={14}
                  error={fieldErrors.phone}
                  onChange={(value) => setField("phone", value)}
                />
                <FormField
                  label="Street address"
                  value={draft.street_address}
                  maxLength={180}
                  className="field-wide"
                  error={fieldErrors.street_address}
                  onChange={(value) => setField("street_address", value)}
                />
                <FormField
                  label="City"
                  value={draft.city}
                  maxLength={100}
                  error={fieldErrors.city}
                  onChange={(value) => setField("city", value)}
                />
                <FormField
                  label="State / region"
                  value={draft.region}
                  maxLength={100}
                  error={fieldErrors.region}
                  onChange={(value) => setField("region", value)}
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
            </div>
            {/* Over the body's bottom edge, above the footer, which scrolls (UI-FIELDMSG). */}
            <WindowAlert between message={formError} />
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
        <ListOutline label="Loading locations" rows={4} columns={4} />
      ) : null}
      {locations.error && !locations.data ? (
        <LoadError
          title="We couldn't load locations"
          detail="Locations didn't load. Nothing was changed."
          retrying={locations.isFetching}
          onRetry={() => void locations.refetch()}
        />
      ) : null}
      {locations.error && locations.data ? (
        <RefreshError
          message="Locations didn't refresh. This is the last list that loaded."
          retrying={locations.isFetching}
          onRetry={() => void locations.refetch()}
        />
      ) : null}
      {locations.data ? (
        <div className="job-catalog" aria-label="Locations">
          <div
            className="job-column-headings catalog-column-headings location-catalog-row"
            role="row"
          >
            {sortColumn("name", "Location")}
            {sortColumn("address", "Address")}
            {sortColumn("phone", "Phone number")}
            {sortColumn("timezone", "Time zone")}
            <span />
          </div>
          {visible.length === 0 ? (
            <div className="catalog-table-empty">
              <span className="catalog-table-empty-icon" aria-hidden>
                <MapPin size={22} />
              </span>
              <h2>
                {inTab.length
                  ? "No locations match your search."
                  : tab === "archived"
                    ? "No archived locations"
                    : "No locations yet"}
              </h2>
              <p>
                {inTab.length
                  ? "Try another search."
                  : tab === "archived"
                    ? "Archived locations will appear here."
                    : "Add the first restaurant location to establish scheduling context."}
              </p>
            </div>
          ) : null}
          {visible.map((location) => {
            const zone = zoneLabel(location);
            const address = addressText(location);
            const phone = displayUsPhone(location.phone);
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
                  <span className="job-name-stack">
                    <span className="job-row-name" title={location.name}>
                      {location.name}
                    </span>
                    {/* Phone: one card per location (UI-14). */}
                    <span className="location-card-line">{address}</span>
                    <span className="location-card-meta">
                      {phone ? `${zone} · ${phone}` : zone}
                    </span>
                  </span>
                </button>
                <span className="location-catalog-cell" title={address}>
                  {address}
                </span>
                <span
                  className={`location-catalog-cell${phone ? "" : " location-catalog-faint"}`}
                >
                  {phone ?? "—"}
                </span>
                <span className="location-catalog-cell">{zone}</span>
                {canEdit ? (
                  <CatalogRowMenu name={location.name}>
                    <button type="button" onClick={() => openEditor(location)}>
                      Edit location
                    </button>
                    <CatalogArchiveButton
                      archived={Boolean(location.archived_at)}
                      disabled={archiveMutation.isPending}
                      onToggle={() =>
                        archiveMutation.mutate({
                          id: location.id,
                          archived: !location.archived_at,
                        })
                      }
                    />
                  </CatalogRowMenu>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function zoneLabel(location: Location): string {
  return (
    timezones.find(([value]) => value === location.timezone)?.[1] ??
    location.timezone
  );
}

/** BL-664 (1): only the filled-in parts, so a blank one leaves no stray comma. */
function addressText(location: Location): string {
  const regionLine = [location.region, location.postal_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return [location.street_address, location.city, regionLine]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function sortText(location: Location, key: SortKey): string {
  if (key === "name") return location.name;
  if (key === "address") return addressText(location);
  if (key === "phone") return displayUsPhone(location.phone) ?? "";
  return zoneLabel(location);
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
  phone = false,
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
  /** The one US phone field: a fixed +1 and the mask (BL-503). */
  readonly phone?: boolean;
}) {
  const noteId = useId();
  return (
    <div className={`location-field ${className}`}>
      <label className="job-field">
        <span>{label}</span>
        {phone ? (
          <UsPhoneInput
            value={value}
            // Named outright: the +1 sits inside the label.
            aria-label={label}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldNoteId(noteId, error)}
            onChange={onChange}
            required={!optional}
          />
        ) : (
          <input
            type={type}
            inputMode={inputMode}
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={fieldNoteId(noteId, error)}
            onChange={(event) => onChange(event.target.value)}
            required={!optional}
          />
        )}
      </label>
      <FieldNote id={noteId} error={error} className="location-field-error" />
    </div>
  );
}
