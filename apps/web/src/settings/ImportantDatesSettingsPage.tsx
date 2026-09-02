import {
  importantDateInputSchema,
  type ImportantDate,
  type ImportantDateInput,
  type ImportantDateType,
} from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarDays,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { errorText, SettingsHeader } from "./GeneralSettingsPage";
import {
  listImportantDates,
  listLocations,
  saveImportantDate,
  setImportantDateArchived,
} from "./organization-data";

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

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

function newDraft(): ImportantDateInput {
  const today = todayIso();
  return {
    location_id: null,
    title: "",
    type: "event",
    starts_on: today,
    ends_on: today,
    recurrence: "none",
    note: "",
    affects_scheduling: true,
  };
}

export default function ImportantDatesSettingsPage() {
  const { context } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = context?.workspace.id ?? "";
  const canManage = context?.permissions.includes("workspace.manage") ?? false;
  const datesQueryKey = ["important-dates", workspaceId];
  const locationsQueryKey = ["organization-locations", workspaceId];
  const query = useQuery({
    queryKey: datesQueryKey,
    queryFn: () => listImportantDates(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const locations = useQuery({
    queryKey: locationsQueryKey,
    queryFn: () => listLocations(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<ImportantDateType | "all">("all");
  const [editing, setEditing] = useState<ImportantDate | "new" | null>(null);
  const [draft, setDraft] = useState<ImportantDateInput>(newDraft);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: datesQueryKey });
  const saveMutation = useMutation({
    mutationFn: ({ values, id }: { values: ImportantDateInput; id?: string }) =>
      saveImportantDate(workspaceId, values, id),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
      setFormError(null);
    },
    onError: (error) => setFormError(errorText(error)),
  });
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      setImportantDateArchived(workspaceId, id, archived),
    onSuccess: refresh,
    onError: (error) => setFormError(errorText(error)),
  });

  const items = query.data ?? [];
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (showArchived || !item.archived_at) &&
          (filter === "all" || item.type === filter),
      ),
    [filter, items, showArchived],
  );
  const closedDays = items.filter((item) => !item.archived_at && item.type === "closed_day");
  const scheduleImpacts = items.filter(
    (item) => !item.archived_at && item.affects_scheduling,
  );

  const openEditor = (item?: ImportantDate): void => {
    setEditing(item ?? "new");
    setDraft(
      item
        ? importantDateInputSchema.parse({
            location_id: item.location_id,
            title: item.title,
            type: item.type,
            starts_on: item.starts_on,
            ends_on: item.ends_on,
            recurrence: item.recurrence,
            note: item.note,
            affects_scheduling: item.affects_scheduling,
          })
        : newDraft(),
    );
    setFormError(null);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const normalized = {
      ...draft,
      affects_scheduling:
        draft.type === "closed_day" ? true : draft.affects_scheduling,
    };
    const parsed = importantDateInputSchema.safeParse(normalized);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the date fields");
      return;
    }
    saveMutation.mutate({
      values: parsed.data,
      ...(editing !== "new" && editing ? { id: editing.id } : {}),
    });
  };

  return (
    <section
      className="settings-page"
      aria-labelledby="important-dates-settings-title"
    >
      <SettingsHeader
        icon={<CalendarDays size={21} aria-hidden />}
        title="Important dates"
        description="Holidays, special events, blackout ranges, and days locations are closed."
        action={
          canManage ? (
            <Button type="button" onClick={() => openEditor()}>
              <Plus size={16} aria-hidden />
              Add date
            </Button>
          ) : undefined
        }
      />

      <div className="settings-summary-grid">
        <SummaryTile label="Active dates" value={items.filter((item) => !item.archived_at).length} />
        <SummaryTile label="Closed days" value={closedDays.length} />
        <SummaryTile label="Schedule impacts" value={scheduleImpacts.length} />
      </div>

      <div className="settings-toolbar">
        <label className="form-field compact-field">
          <span>Type</span>
          <select
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
        </label>
        <label className="archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      {editing ? (
        <form
          className="entity-editor"
          onSubmit={submit}
          aria-label={
            editing === "new" ? "Add important date" : `Edit ${editing.title}`
          }
        >
          <div className="entity-editor-heading">
            <div>
              <strong>
                {editing === "new" ? "New important date" : "Edit important date"}
              </strong>
              <span>Use closed day for dates that should block scheduling.</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close important date editor"
              title="Close"
              onClick={() => setEditing(null)}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <div className="important-date-fields">
            <label className="form-field">
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
            <label className="form-field">
              <span>Type</span>
              <select
                value={draft.type}
                onChange={(event) => {
                  const nextType = event.target.value as ImportantDateType;
                  setDraft((current) => ({
                    ...current,
                    type: nextType,
                    affects_scheduling:
                      nextType === "closed_day" ? true : current.affects_scheduling,
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
            <label className="form-field">
              <span>Location</span>
              <select
                value={draft.location_id ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    location_id: event.target.value || null,
                  }))
                }
              >
                <option value="">All locations</option>
                {(locations.data ?? [])
                  .filter((location) => !location.archived_at)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
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
            <label className="form-field">
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
            <label className="form-field">
              <span>Repeats</span>
              <select
                value={draft.recurrence}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recurrence: event.target.value as ImportantDateInput["recurrence"],
                  }))
                }
              >
                <option value="none">Does not repeat</option>
                <option value="annual">Every year</option>
              </select>
            </label>
            <label className="form-field important-date-note-field">
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
            <label className="form-check">
              <input
                type="checkbox"
                checked={draft.affects_scheduling}
                disabled={draft.type === "closed_day"}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    affects_scheduling: event.target.checked,
                  }))
                }
              />
              Flag this date inside scheduling
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
              {saveMutation.isPending ? "Saving" : "Save date"}
            </Button>
          </div>
        </form>
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
      {!query.isLoading && !query.error && visible.length === 0 ? (
        <div className="settings-empty">
          <CalendarDays size={22} aria-hidden />
          <strong>
            {showArchived ? "No archived important dates" : "No important dates yet"}
          </strong>
          <p>Add holidays, closures, and service events used by managers.</p>
        </div>
      ) : null}
      {visible.length > 0 ? (
        <div className="entity-list" aria-label="Important dates">
          {visible.map((item) => (
            <div
              className="entity-row important-date-row"
              key={item.id}
              data-archived={Boolean(item.archived_at)}
            >
              <div className="entity-main">
                <strong>{item.title}</strong>
                <span>
                  {formatRange(item.starts_on, item.ends_on)} · {typeLabels[item.type]}
                  {item.location_name ? ` · ${item.location_name}` : " · All locations"}
                </span>
                {item.note ? <p>{item.note}</p> : null}
              </div>
              <div className="entity-meta">
                {item.recurrence === "annual" ? <span>Repeats yearly</span> : null}
                {item.affects_scheduling ? <span>Schedule flag</span> : null}
                {item.archived_at ? <span>Archived</span> : null}
              </div>
              <div className="entity-actions">
                {canManage ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${item.title}`}
                    title="Edit"
                    onClick={() => openEditor(item)}
                  >
                    <Pencil size={16} aria-hidden />
                  </button>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={
                      item.archived_at ? `Restore ${item.title}` : `Archive ${item.title}`
                    }
                    title={item.archived_at ? "Restore" : "Archive"}
                    onClick={() =>
                      archiveMutation.mutate({
                        id: item.id,
                        archived: !item.archived_at,
                      })
                    }
                  >
                    {item.archived_at ? (
                      <RotateCcw size={16} aria-hidden />
                    ) : (
                      <Archive size={16} aria-hidden />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function SummaryTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="settings-summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatRange(startsOn: string, endsOn: string): string {
  if (startsOn === endsOn) return formatDate(startsOn);
  return `${formatDate(startsOn)} - ${formatDate(endsOn)}`;
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
