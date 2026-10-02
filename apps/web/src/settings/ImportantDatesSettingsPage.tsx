import { CatalogDrawer } from "./CatalogDrawer";
import {
  importantDateInputSchema,
  type ImportantDate,
  type ImportantDateInput,
  type ImportantDateStateAction,
  type ImportantDateType,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { CatalogSortButton } from "../views/CatalogSortButton";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import { CatalogRowMenu } from "./CatalogRowMenu";
import { errorText } from "./GeneralSettingsPage";
import {
  listImportantDates,
  saveImportantDate,
  setImportantDateState,
} from "./organization-data";
import "./jobs-settings.css";

import { isNoAccess } from "../lib/no-access";
import { todayIn } from "../lib/today";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
const typeLabels: Record<ImportantDateType, string> = {
  holiday: "Holiday",
  event: "Event",
  blackout: "Blackout",
  closed_day: "Closed day",
};

const typeOptions = Object.entries(typeLabels) as readonly [
  ImportantDateType,
  string,
][];
type ImportantDateSortKey = "title" | "date" | "type" | "locations" | "impact";

function newDraft(): ImportantDateInput {
  const today = todayIn();
  return {
    location_id: null,
    location_ids: [],
    title: "",
    type: "event",
    starts_on: today,
    ends_on: today,
    recurrence: "none",
    note: "",
    affects_scheduling: true,
  };
}

function draftFrom(item: ImportantDate): ImportantDateInput {
  return importantDateInputSchema.parse({
    location_id: item.location_id,
    location_ids: [
      ...(item.location_ids ?? (item.location_id ? [item.location_id] : [])),
    ].sort(),
    title: item.title,
    type: item.type,
    starts_on: item.starts_on,
    ends_on: item.ends_on,
    recurrence: item.recurrence,
    note: item.note,
    affects_scheduling: item.affects_scheduling,
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function ImportantDatesSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const datesQueryKey = ["important-dates", workspaceId];
  const query = useQuery({
    queryKey: datesQueryKey,
    queryFn: () => listImportantDates(workspaceId),
    enabled: Boolean(workspaceId),
  });
  // The picker offers the locations this person may place a date at, from the same read.
  const pickerLocations = query.data?.locations ?? [];
  // What this person may do comes from the server (FB-6.7, K1-K3): a date at
  // one of their locations, or, for admins and the owner, several or the whole
  // workspace.
  const canManage = query.data?.can_manage ?? false;
  const allLocations = query.data?.can_target_workspace ?? false;
  const mayManageLocations = (ids: readonly string[]) =>
    canManage &&
    (allLocations ||
      (ids.length === 1 && pickerLocations.some((location) => location.id === ids[0])));
  const mayManageDate = (item: ImportantDate) => item.can_edit === true;
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<ImportantDateType | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{
    key: ImportantDateSortKey;
    descending: boolean;
  }>({ key: "date", descending: false });
  const [editing, setEditing] = useState<ImportantDate | "new" | null>(null);
  const [draft, setDraft] = useState<ImportantDateInput>(newDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: datesQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["schedule-read"] }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: ({ values, id }: { values: ImportantDateInput; id?: string }) =>
      saveImportantDate(workspaceId, values, id),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      setConfirmDelete(false);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ImportantDateStateAction }) =>
      setImportantDateState(workspaceId, id, action),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const items = query.data?.dates ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      items
        .filter(
          (item) =>
            (showArchived || !item.archived_at) &&
            (filter === "all" || item.type === filter) &&
            (!normalizedSearch ||
              `${item.title} ${item.note} ${locationLabel(item)}`
                .toLowerCase()
                .includes(normalizedSearch)),
        )
        .sort(
          (left, right) =>
            compareCatalogValues(
              importantDateSortValue(left, sort.key),
              importantDateSortValue(right, sort.key),
            ) * (sort.descending ? -1 : 1),
        ),
    [filter, items, normalizedSearch, showArchived, sort],
  );

  const openEditor = (item?: ImportantDate): void => {
    if (
      saveMutation.isPending ||
      archiveMutation.isPending ||
      !canManage ||
      (item && !mayManageDate(item))
    )
      return;
    setEditing(item ?? "new");
    setDraft(
      item
        ? draftFrom(item)
        : {
            ...newDraft(),
            // A manager writes for one location (K1): theirs, if they have one.
            location_ids:
              !allLocations && pickerLocations.length === 1
                ? [pickerLocations[0]!.id]
                : [],
          },
    );
    setConfirmDelete(false);
    setFormError(null);
  };

  const closeEditor = (): void => {
    if (saveMutation.isPending || archiveMutation.isPending) return;
    setEditing(null);
    setConfirmDelete(false);
  };

  const selectedLocationIds = [...(draft.location_ids ?? [])].sort();
  const normalizedDraft = {
    ...draft,
    location_ids: selectedLocationIds,
    location_id:
      selectedLocationIds.length === 1 ? selectedLocationIds[0]! : null,
    affects_scheduling:
      draft.type === "closed_day" ? true : draft.affects_scheduling,
  };
  const parsedDraft = importantDateInputSchema.safeParse(normalizedDraft);
  const baseline = editing && editing !== "new" ? draftFrom(editing) : null;
  const canSave =
    mayManageLocations(selectedLocationIds) &&
    !saveMutation.isPending &&
    !archiveMutation.isPending &&
    Boolean(editing) &&
    parsedDraft.success &&
    (editing === "new" ||
      Boolean(baseline && !sameJson(parsedDraft.data, baseline)));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!canSave) return;
    setFormError(null);
    saveMutation.mutate({
      values: parsedDraft.data,
      ...(editing !== "new" && editing ? { id: editing.id } : {}),
    });
  };

  // The API's "no" gets the one no-access card, never its raw sentence.
  if (isNoAccess(query.error))
    return (
      <NoAccessState
        subject="important dates"
        homeHref={noAccessHomePath(context, "/app/important-dates")}
      />
    );
  return (
    <section
      className="settings-page jobs-settings-page important-dates-page important-dates-catalog-page"
      aria-labelledby="important-dates-settings-title"
    >
      <CatalogPageHeader
        eyebrow="EVERY DATE. ACCOUNTED FOR."
        title="Important Dates"
        titleId="important-dates-settings-title"
        description="Manage holidays, closures, events, and dates that affect scheduling."
        action={
          canManage ? (
            <Button
              className="job-primary-button"
              type="button"
              disabled={saveMutation.isPending || archiveMutation.isPending}
              onClick={() => openEditor()}
            >
              <Plus size={16} aria-hidden />
              Add date
            </Button>
          ) : null
        }
      />

      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div
            className="catalog-status-tabs job-archive-tabs"
            role="group"
            aria-label="Archive visibility"
          >
            <button
              type="button"
              className={showArchived ? "active" : ""}
              onClick={() => setShowArchived((current) => !current)}
            >
              Show archived
            </button>
          </div>
        </div>
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select important-date-filter"
            aria-label="Type"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as ImportantDateType | "all")
            }
          >
            <option value="all">All dates</option>
            {typeOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label="Search important dates"
              placeholder="Search title, note, or location"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </div>

      {editing ? (
        <CatalogDrawer
          label={
            editing === "new" ? "Add important date" : `Edit ${editing.title}`
          }
          className="important-dates-catalog-page"
          onClose={closeEditor}
          busy={saveMutation.isPending || archiveMutation.isPending}
        >
          <form
            className="job-catalog-editor"
            onSubmit={submit}
            aria-label={
              editing === "new" ? "Add important date" : `Edit ${editing.title}`
            }
          >
            <div className="job-editor-title">
              <div>
                <h2>
                  {editing === "new"
                    ? "New important date"
                    : "Edit important date"}
                </h2>
                <p>Use closed day for dates that should block scheduling.</p>
              </div>
              <button
                type="button"
                className="job-icon-button"
                aria-label="Close important date editor"
                disabled={saveMutation.isPending || archiveMutation.isPending}
                title="Close"
                onClick={closeEditor}
              >
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="catalog-drawer-body">
              <fieldset
                className="important-date-fields"
                disabled={saveMutation.isPending || archiveMutation.isPending}
              >
                <label className="job-field field-wide">
                  <span>Title</span>
                  <input
                    value={draft.title}
                    maxLength={120}
                    required
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="job-field">
                  <span>Type</span>
                  <select
                    value={draft.type}
                    onChange={(event) => {
                      const nextType = event.target.value as ImportantDateType;
                      setDraft((current) => ({
                        ...current,
                        type: nextType,
                        affects_scheduling:
                          nextType === "closed_day"
                            ? true
                            : current.affects_scheduling,
                      }));
                    }}
                  >
                    {typeOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="job-field">
                  <span>Locations</span>
                  <details
                    className="important-date-location-picker"
                    onKeyDown={(event) => {
                      if (event.key === "Escape" && event.currentTarget.open) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector("summary")?.focus();
                      }
                    }}
                  >
                    <summary aria-label="Select locations">
                      <span
                        title={selectedLocationIds
                          .map(
                            (id) =>
                              pickerLocations.find(
                                (location) => location.id === id,
                              )?.name ?? "Archived location",
                          )
                          .join(", ")}
                      >
                        {selectedLocationIds.length === 0
                          ? allLocations
                            ? "All locations"
                            : "Select a location"
                          : selectedLocationIds.length === 1
                            ? (pickerLocations.find(
                                (location) =>
                                  location.id === selectedLocationIds[0],
                              )?.name ?? "Selected location")
                            : `${selectedLocationIds.length} locations selected`}
                      </span>
                      <ChevronDown size={14} aria-hidden />
                    </summary>
                    <div className="important-date-location-options">
                      {allLocations && (
                        <label className="important-date-location-all">
                          <input
                            type="checkbox"
                            checked={!selectedLocationIds.length}
                            onChange={() =>
                              setDraft((current) => ({
                                ...current,
                                location_ids: [],
                              }))
                            }
                          />
                          <span>All locations</span>
                        </label>
                      )}
                      {pickerLocations
                        .filter(
                          (location) =>
                            !location.archived_at ||
                            selectedLocationIds.includes(location.id),
                        )
                        .map((location) => (
                          <label key={location.id}>
                            <input
                              type="checkbox"
                              checked={selectedLocationIds.includes(
                                location.id,
                              )}
                              onChange={() =>
                                setDraft((current) => ({
                                  ...current,
                                  location_ids: (
                                    current.location_ids ?? []
                                  ).includes(location.id)
                                    ? (current.location_ids ?? []).filter(
                                        (id) => id !== location.id,
                                      )
                                    : [
                                        ...(current.location_ids ?? []),
                                        location.id,
                                      ],
                                }))
                              }
                            />
                            <span>
                              {location.name}
                              {location.archived_at ? " (archived)" : ""}
                            </span>
                          </label>
                        ))}
                    </div>
                  </details>
                </div>
                <label className="job-field">
                  <span>Starts</span>
                  <input
                    type="date"
                    value={draft.starts_on}
                    required
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        starts_on: event.target.value,
                        ends_on:
                          current.ends_on < event.target.value
                            ? event.target.value
                            : current.ends_on,
                      }))
                    }
                  />
                </label>
                <label className="job-field">
                  <span>Ends</span>
                  <input
                    type="date"
                    value={draft.ends_on}
                    required
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        ends_on: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="job-field">
                  <span>Repeats</span>
                  <select
                    value={draft.recurrence}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        recurrence: event.target
                          .value as ImportantDateInput["recurrence"],
                      }))
                    }
                  >
                    <option value="none">Does not repeat</option>
                    <option value="annual">Every year</option>
                  </select>
                </label>
                <label className="job-field important-date-note-field field-wide">
                  <span>Note</span>
                  <textarea
                    value={draft.note}
                    rows={3}
                    maxLength={500}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="important-date-check field-wide">
                  <input
                    type="checkbox"
                    checked={normalizedDraft.affects_scheduling}
                    disabled={draft.type === "closed_day"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        affects_scheduling: event.target.checked,
                      }))
                    }
                  />
                  <span>Flag this date inside scheduling</span>
                </label>
              </fieldset>
              {formError ? (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              ) : null}
            </div>
            <div className="job-editor-footer">
              {editing !== "new" ? (
                <ImportantDateDeleteAction
                  name={editing.title}
                  busy={saveMutation.isPending || archiveMutation.isPending}
                  confirming={confirmDelete}
                  setConfirming={setConfirmDelete}
                  deleteDate={() =>
                    archiveMutation.mutate(
                      { id: editing.id, action: "archive" },
                      { onSuccess: closeEditor },
                    )
                  }
                />
              ) : (
                <span />
              )}
              <div className="job-editor-actions">
                <Button
                  className="job-secondary-button"
                  type="button"
                  disabled={saveMutation.isPending || archiveMutation.isPending}
                  onClick={closeEditor}
                >
                  Cancel
                </Button>
                <Button
                  className="job-primary-button"
                  type="submit"
                  disabled={!canSave}
                >
                  {saveMutation.isPending ? "Saving" : "Save date"}
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
      {query.isLoading ? (
        <p className="settings-state">Loading important dates...</p>
      ) : null}
      {query.error ? (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
      ) : null}
      {!query.isLoading && !query.error ? (
        <div className="job-catalog" aria-label="Important dates">
          <div className="job-column-headings catalog-column-headings important-date-catalog-row">
            {(
              [
                ["title", "Important date", undefined],
                ["date", "Date", undefined],
                ["type", "Type", "job-department-cell"],
                ["locations", "Locations", "job-department-cell"],
                ["impact", "Impact", "important-date-impact-stack"],
              ] as const
            ).map(([key, label, className]) => (
              <span
                key={key}
                className={className}
                role="columnheader"
                aria-sort={
                  sort.key === key
                    ? sort.descending
                      ? "descending"
                      : "ascending"
                    : "none"
                }
              >
                <CatalogSortButton
                  label={label}
                  active={sort.key === key}
                  onClick={() =>
                    setSort({
                      key,
                      descending: sort.key === key ? !sort.descending : false,
                    })
                  }
                />
              </span>
            ))}
            <span />
          </div>
          {visible.length ? (
            visible.map((item) => (
              <div
                className="job-catalog-row important-date-catalog-row"
                key={item.id}
                data-archived={Boolean(item.archived_at)}
              >
                <button
                  type="button"
                  className="job-row-identity"
                  disabled={!mayManageDate(item)}
                  onClick={() => openEditor(item)}
                >
                  <span className="important-date-marker" aria-hidden>
                    <CalendarDays size={16} />
                  </span>
                  <span className="job-name-stack">
                    <span className="job-row-name" title={item.title}>
                      {item.title}
                    </span>
                    <span className="job-mobile-meta">
                      {typeLabels[item.type]} · {locationLabel(item)}
                    </span>
                  </span>
                  {item.archived_at ? (
                    <span className="job-archived-label">Archived</span>
                  ) : item.status === "unpublished" ? (
                    <span className="job-archived-label">Unpublished</span>
                  ) : null}
                </button>
                <span className="important-date-date-cell">
                  {formatRange(item.starts_on, item.ends_on)}
                </span>
                <span className="job-department-cell">
                  {typeLabels[item.type]}
                </span>
                <span
                  className="job-department-cell"
                  title={locationLabel(item)}
                >
                  {locationLabel(item)}
                </span>
                <span className="important-date-impact-stack">
                  {item.recurrence === "annual" ? (
                    <span>Repeats yearly</span>
                  ) : null}
                  {item.affects_scheduling ? <span>Schedule flag</span> : null}
                  {!item.affects_scheduling && item.recurrence !== "annual" ? (
                    <span>None</span>
                  ) : null}
                </span>
                {item.can_edit || item.can_restore ? (
                  <CatalogRowMenu name={item.title}>
                    {item.can_edit ? (
                      <button type="button" onClick={() => openEditor(item)}>
                        Edit date
                      </button>
                    ) : null}
                    {item.can_unpublish || item.can_republish ? (
                      <button
                        type="button"
                        disabled={archiveMutation.isPending}
                        onClick={() =>
                          archiveMutation.mutate({
                            id: item.id,
                            action: item.can_unpublish ? "unpublish" : "republish",
                          })
                        }
                      >
                        {item.can_unpublish ? "Unpublish" : "Republish"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={
                        !item.archived_at ? "job-danger-text" : undefined
                      }
                      disabled={archiveMutation.isPending}
                      onClick={() =>
                        archiveMutation.mutate({
                          id: item.id,
                          action: item.archived_at ? "restore" : "archive",
                        })
                      }
                    >
                      {item.archived_at ? "Restore" : "Archive"}
                    </button>
                  </CatalogRowMenu>
                ) : null}
              </div>
            ))
          ) : (
            <div className="settings-empty">
              <CalendarDays size={22} aria-hidden />
              <strong>
                {showArchived
                  ? "No archived important dates"
                  : "No important dates yet"}
              </strong>
              <p>
                Add holidays, closures, and service events used by managers.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ImportantDateDeleteAction({
  name,
  busy,
  confirming,
  setConfirming,
  deleteDate,
}: {
  readonly name: string;
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly setConfirming: (value: boolean) => void;
  readonly deleteDate: () => void;
}) {
  if (confirming) {
    return (
      <div
        className="catalog-delete-confirm policy-footer-confirm"
        role="group"
      >
        <div className="catalog-delete-copy" aria-live="polite">
          <strong>Delete "{name}"?</strong>
          <span>
            This date will be archived and hidden from active scheduling
            choices.
          </span>
        </div>
        <div className="catalog-delete-buttons">
          <button
            type="button"
            className="job-secondary-button"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Keep date
          </button>
          <button
            type="button"
            className="catalog-delete-confirm-button"
            disabled={busy}
            onClick={deleteDate}
          >
            Delete date
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="catalog-delete-action">
      <button
        type="button"
        className="catalog-delete-trigger"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        Delete date
      </button>
    </div>
  );
}

function formatRange(startsOn: string, endsOn: string): string {
  if (startsOn === endsOn) return formatDate(startsOn);
  return `${formatDate(startsOn)} - ${formatDate(endsOn)}`;
}

function importantDateSortValue(
  item: ImportantDate,
  key: ImportantDateSortKey,
): string {
  if (key === "date") return `${item.starts_on} ${item.ends_on}`;
  if (key === "type") return typeLabels[item.type];
  if (key === "locations") return locationLabel(item);
  if (key === "impact") {
    return [
      item.recurrence === "annual" ? "Repeats yearly" : "",
      item.affects_scheduling ? "Schedule flag" : "None",
    ].join(" ");
  }
  return item.title;
}

function compareCatalogValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function locationLabel(item: ImportantDate): string {
  return item.location_names?.length
    ? item.location_names.join(", ")
    : (item.location_name ?? "All locations");
}
