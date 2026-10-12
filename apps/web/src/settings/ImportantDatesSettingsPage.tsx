import type { ImportantDate, ImportantDateSaved, ImportantDateType } from "@newfork/shared";
import { toast } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { CatalogSortButton } from "../views/CatalogSortButton";
import { CatalogPageHeader, ListAddButton } from "../views/CatalogPageHeader";
import { CatalogArchiveButton, CatalogRowMenu } from "./CatalogRowMenu";
import { ImportantDateDrawer } from "./ImportantDateDrawer";
import { drawerErrorText, impactLabel, savedPhrase } from "./important-date-drawer-model";
import { listImportantDates, setImportantDateState } from "./organization-data";
import { errorText } from "./GeneralSettingsPage";
import "./jobs-settings.css";

import { isNoAccess } from "../lib/no-access";
import { todayIn } from "../lib/today";
import { NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { importantDateTypeLabels } from "../lib/importantDateTypes";
import { onTabListKeyDown } from "../lib/tab-list-keys";
const typeLabels = importantDateTypeLabels;

const typeOptions = Object.entries(typeLabels) as readonly [
  ImportantDateType,
  string,
][];
type ImportantDateSortKey = "title" | "date" | "type" | "locations" | "impact";

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
  const [tab, setTab] = useState<DateTab>("upcoming");
  const [filter, setFilter] = useState<ImportantDateType | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{
    key: ImportantDateSortKey;
    descending: boolean;
  }>({ key: "date", descending: false });
  const [editing, setEditing] = useState<{ item: ImportantDate | "new"; republish: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const liveLocationCount = pickerLocations.filter((location) => !location.archived_at).length;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: datesQueryKey }),
      queryClient.invalidateQueries({ queryKey: ["schedule-read"] }),
    ]);
  };
  const stateMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "unpublish" | "republish" | "archive" | "restore" }) =>
      setImportantDateState(workspaceId, id, action),
    onSuccess: async (result) => {
      await refresh();
      if (result.shifts_stay_open) toast.success(savedPhrase({ shifts_stay_open: result.shifts_stay_open }));
    },
    onError: (error) => setFormError(drawerErrorText(error)),
  });
  // The drawer closes first, then says what the save did (BL-884): a toast
  // under an open drawer is inert.
  const finish = async (result: ImportantDateSaved) => {
    await refresh();
    setEditing(null);
    setFormError(null);
    toast.success(savedPhrase(result));
  };

  const items = useMemo(() => query.data?.dates ?? [], [query.data]);
  const normalizedSearch = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      items
        .filter(
          (item) =>
            dateTab(item, todayIn()) === tab &&
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
    [filter, items, normalizedSearch, tab, sort],
  );

  const openEditor = (item?: ImportantDate, republish = false): void => {
    if (stateMutation.isPending || !canManage || (item && !(republish ? item.can_republish : mayManageDate(item)))) return;
    setEditing({ item: item ?? "new", republish });
    setFormError(null);
  };
  // Republishing a date that closes or shortens a location reviews its shifts first (K13).
  const republishDate = (item: ImportantDate): void => {
    if (Object.keys(item.location_days ?? {}).length) openEditor(item, true);
    else stateMutation.mutate({ id: item.id, action: "republish" });
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
      className="settings-page jobs-settings-page important-dates-page important-dates-catalog-page list-page"
      aria-labelledby="important-dates-settings-title"
    >
      <CatalogPageHeader
        eyebrow="EVERY DATE. ACCOUNTED FOR."
        title="Important Dates"
        titleId="important-dates-settings-title"
        description="Manage holidays and events, and the days each location closes or keeps short hours."
      />

      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div
            className="catalog-status-tabs"
            role="tablist"
            onKeyDown={onTabListKeyDown}
            aria-label="Important date status"
          >
            {(
              [
                ["upcoming", "Upcoming"],
                ["past", "Past"],
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
          {canManage ? (
            <ListAddButton
              label="New date"
              disabled={stateMutation.isPending}
              onClick={() => openEditor()}
            />
          ) : null}
        </div>
      </div>

      {editing ? (
        <ImportantDateDrawer
          workspaceId={workspaceId}
          editing={editing.item}
          republish={editing.republish}
          locations={pickerLocations}
          canTargetWorkspace={allLocations}
          mayManageLocations={mayManageLocations}
          onClose={() => setEditing(null)}
          onSaved={finish}
        />
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
                ["impact", "Impact", "job-department-cell"],
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
                    <span className="list-chip" data-tone="gray">Archived</span>
                  ) : item.status === "unpublished" ? (
                    <span className="list-chip" data-tone="gray">Unpublished</span>
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
                  {impactLabel(item, liveLocationCount)}
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
                        disabled={stateMutation.isPending}
                        onClick={() =>
                          item.can_unpublish
                            ? stateMutation.mutate({ id: item.id, action: "unpublish" })
                            : republishDate(item)
                        }
                      >
                        {item.can_unpublish ? "Unpublish" : "Republish"}
                      </button>
                    ) : null}
                    <CatalogArchiveButton
                      archived={Boolean(item.archived_at)}
                      disabled={stateMutation.isPending}
                      onToggle={() =>
                        stateMutation.mutate({
                          id: item.id,
                          action: item.archived_at ? "restore" : "archive",
                        })
                      }
                    />
                  </CatalogRowMenu>
                ) : null}
              </div>
            ))
          ) : (
            <div className="settings-empty">
              <CalendarDays size={22} aria-hidden />
              <strong>
                {tab === "archived"
                  ? "No archived important dates"
                  : tab === "past"
                    ? "No past important dates"
                    : items.some((item) => !item.archived_at)
                      ? "No upcoming important dates"
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

type DateTab = "upcoming" | "past" | "archived";

/** Which tab a date belongs to: archived first, then by its last day
 * against today (a one-day date ends on its own day). */
export function dateTab(item: ImportantDate, today: string): DateTab {
  if (item.archived_at) return "archived";
  return item.ends_on < today ? "past" : "upcoming";
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
  if (key === "impact") return impactLabel(item, Number.POSITIVE_INFINITY);
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
