import type { AnnouncementRecord } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Megaphone, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { noAccessHomePath } from "../auth/resolveLanding";
import { AnnouncementDrawer } from "../communications/AnnouncementDrawer";
import { AnnouncementReader } from "../communications/AnnouncementReader";
import {
  announcementCategoryText,
  defaultSort,
  inListTab,
  isUnderway,
  listTabs,
  momentDay,
  momentText,
  nextSort,
  publishedOn,
  rangeText,
  sortRecords,
  statusLabels,
  statusTones,
  dayText,
  type ListSort,
  type ListTab,
  type SortKey,
  type TimeFormat,
} from "../communications/announcement-model";
import { getAnnouncements } from "../communications/communications-data";
import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { CatalogPageHeader, ListAddButton } from "./CatalogPageHeader";
import { CatalogSortButton } from "./CatalogSortButton";
import "../settings/jobs-settings.css";
import "./announcements-catalog.css";

/**
 * Announcements (EKRAN-08): one list of posts, Important Dates among them.
 * Whoever may write sees every status in Active and Past tables; everyone
 * else reads the ones sent to them.
 */
export function AnnouncementsPage() {
  const { context } = useAuth();
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const workspaceId = context?.workspace.id ?? "";
  const query = useQuery({
    queryKey: ["announcements", workspaceId],
    queryFn: () => getAnnouncements(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const [adding, setAdding] = useState(false);
  const close = () => {
    setAdding(false);
    if (announcementId) navigate("/app/announcements", { replace: true, preventScrollReset: true });
  };
  const open = (id: string) => navigate(`/app/announcements/${id}`, { preventScrollReset: true });

  if (isNoAccess(query.error))
    return <NoAccessState subject="announcements" homeHref={noAccessHomePath(context, "/app/announcements")} />;
  const list = query.data;
  const reader = list ? !list.can_manage : false;
  return (
    <section
      className="settings-page jobs-settings-page announcements-page announcements-catalog-page list-page"
      aria-labelledby="announcements-title"
      data-reader={reader}
    >
      <CatalogPageHeader
        eyebrow="THE RIGHT UPDATE. THE RIGHT PEOPLE."
        title="Announcements"
        titleId="announcements-title"
        description={
          reader
            ? "Updates your managers have shared with your team."
            : "Create, schedule, and publish updates for the right teams. Posts added to Important Dates show a calendar icon."
        }
      />
      {query.isLoading && <p className="settings-state">Loading announcements...</p>}
      {query.error && (
        <p className="settings-state error" role="alert">
          Announcements couldn&apos;t load. Refresh the page to try again.
        </p>
      )}
      {list && !reader && (
        <ManagerList
          records={list.announcements}
          locations={list.locations}
          timeFormat={list.time_format}
          onOpen={open}
          onNew={() => setAdding(true)}
        />
      )}
      {list && reader && <ReaderList records={list.announcements} onOpen={open} />}
      {list && !reader && (adding || announcementId) && (
        <AnnouncementDrawer
          key={adding ? "new" : announcementId}
          workspaceId={workspaceId}
          list={list}
          announcementId={adding ? null : (announcementId ?? null)}
          onClose={close}
        />
      )}
      {list && reader && announcementId && (
        <AnnouncementReader
          workspaceId={workspaceId}
          record={list.announcements.find((item) => item.id === announcementId) ?? null}
          myLocationIds={context?.locationScope.locationIds ?? []}
          timeFormat={list.time_format}
          onClose={close}
        />
      )}
    </section>
  );
}

function ManagerList({
  records,
  locations,
  timeFormat,
  onOpen,
  onNew,
}: {
  records: AnnouncementRecord[];
  locations: { id: string; name: string }[];
  timeFormat: TimeFormat;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [tab, setTab] = useState<ListTab>("all");
  const [sort, setSort] = useState<ListSort>(defaultSort);
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return records.filter(
      (record) =>
        (!locationId || record.locations.some((location) => location.location_id === locationId)) &&
        (!needle || `${record.title} ${record.body}`.toLowerCase().includes(needle)),
    );
  }, [records, locationId, search]);
  const rows = filtered.filter((record) => inListTab(record, tab));
  const split = tab === "all" || tab === "published";
  const active = rows.filter((record) => record.display_status !== "past");
  const past = rows.filter((record) => record.display_status === "past");
  const table = (items: AnnouncementRecord[], label: string, empty: string) => (
    <AnnouncementTable
      label={label}
      rows={sortRecords(items, sort)}
      sort={sort}
      empty={empty}
      timeFormat={timeFormat}
      onSort={(key) => setSort((current) => nextSort(current, key))}
      onOpen={onOpen}
    />
  );
  return (
    <>
      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="announcement-toolbar-controls catalog-toolbar-status-row">
          <div className="catalog-status-tabs" role="tablist" aria-label="Announcement status">
            {listTabs.map((item) => {
              const count =
                item.id === "draft" || item.id === "scheduled"
                  ? records.filter((record) => inListTab(record, item.id)).length
                  : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-label={count ? `${item.label} (${count})` : item.label}
                  className={tab === item.id ? "active" : ""}
                  onClick={() => setTab(item.id)}
                >
                  <span>{item.label}</span>
                  {count ? (
                    <span className="announcement-status-tab-count" aria-hidden="true">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="catalog-toolbar-filter-row">
          {locations.length > 1 && (
            <select
              className="toolbar-filter-select list-filter-narrow"
              aria-label="Filter announcements by location"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          )}
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label="Search announcements"
              placeholder="Search announcements"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ListAddButton label="New" onClick={onNew} />
        </div>
      </div>
      {split ? (
        <>
          <h2 className="announcement-list-heading">
            Active <span>{active.length}</span>
          </h2>
          {table(active, "Active announcements", "Nothing active.")}
          <h2 className="announcement-list-heading">
            Past <span>{past.length}</span>
          </h2>
          {table(past, "Past announcements", "Nothing has ended yet.")}
        </>
      ) : (
        table(
          rows,
          `${listTabs.find((item) => item.id === tab)!.label} announcements`,
          tab === "archived" ? "Nothing archived." : "Nothing here.",
        )
      )}
    </>
  );
}

const columns: { key: SortKey; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "title", label: "Announcement" },
  { key: "published_on", label: "Published on" },
];

function AnnouncementTable({
  label,
  rows,
  sort,
  empty,
  timeFormat,
  onSort,
  onOpen,
}: {
  label: string;
  rows: AnnouncementRecord[];
  sort: ListSort;
  empty: string;
  timeFormat: TimeFormat;
  onSort: (key: SortKey) => void;
  onOpen: (id: string) => void;
}) {
  const thisYear = new Date().getFullYear();
  return (
    <div className="job-catalog announcement-table" role="table" aria-label={label}>
      <div className="job-column-headings catalog-column-headings announcement-catalog-row" role="row">
        {columns.map((column) => (
          <div
            key={column.key}
            role="columnheader"
            aria-sort={
              sort.key === column.key ? (sort.direction === 1 ? "ascending" : "descending") : "none"
            }
          >
            <CatalogSortButton
              label={column.label}
              active={sort.key === column.key}
              onClick={() => onSort(column.key)}
            />
          </div>
        ))}
      </div>
      {rows.length ? (
        rows.map((record) => {
          const on = publishedOn(record);
          const day = on.at ? momentDay(on.at, record.time_zone) : null;
          return (
            <div
              className="job-catalog-row announcement-catalog-row"
              role="row"
              key={record.id}
              onClick={(event) => {
                if (!(event.target as HTMLElement).closest("button")) onOpen(record.id);
              }}
            >
              <div role="cell" className="announcement-status-cell">
                <span className="announcement-status">
                  <span className="list-chip" data-tone={statusTones[record.display_status]}>
                    {statusLabels[record.display_status]}
                  </span>
                  {isUnderway(record) && <small>Today</small>}
                </span>
              </div>
              <div role="cell">
                <button className="job-row-identity" type="button" onClick={() => onOpen(record.id)}>
                  <span className="announcement-row-icon" aria-hidden>
                    {record.on_important_dates ? <CalendarDays size={16} /> : <Megaphone size={16} />}
                  </span>
                  <span className="job-name-stack">
                    <span className="job-row-name">
                      {record.title || "Untitled"}
                      {record.on_important_dates && <span className="sr-only"> (on Important Dates)</span>}
                    </span>
                    <span className="announcement-row-preview">
                      {[announcementCategoryText(record), record.body].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </div>
              <div role="cell" className="announcement-date-cell">
                {day && on.at ? (
                  <span
                    data-planned={on.planned || undefined}
                    title={on.planned ? `Publishes ${momentText(on.at, record.time_zone, timeFormat)}` : undefined}
                  >
                    {dayText(day, Number(day.slice(0, 4)) !== thisYear)}
                  </span>
                ) : (
                  <span className="announcement-dash" aria-label="Not published">
                    —
                  </span>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="announcement-list-empty">{empty}</div>
      )}
    </div>
  );
}

function ReaderList({
  records,
  onOpen,
}: {
  records: AnnouncementRecord[];
  onOpen: (id: string) => void;
}) {
  const [tab, setTab] = useState<"current" | "past">("current");
  const rows = records
    .filter((record) =>
      tab === "past" ? record.display_status === "past" : record.display_status === "published",
    )
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  return (
    <>
      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="announcement-toolbar-controls catalog-toolbar-status-row">
          <div className="catalog-status-tabs" role="tablist" aria-label="Announcements">
            {(
              [
                ["current", "Current"],
                ["past", "Past"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="announcement-reader-list">
        {rows.length ? (
          rows.map((record) => {
            const ask = tab === "current" && record.asked_to_acknowledge && !record.acknowledged_at;
            return (
              <button key={record.id} type="button" className="announcement-reader-row" onClick={() => onOpen(record.id)}>
                <span className="announcement-row-icon" aria-hidden>
                  {record.on_important_dates ? <CalendarDays size={16} /> : <Megaphone size={16} />}
                </span>
                <span className="announcement-reader-text">
                  <strong>{record.title}</strong>
                  <small>
                    {[record.starts_on ? rangeText(record.starts_on, record.ends_on) : "", record.body]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                {ask ? (
                  <span className="list-chip" data-tone="blue">
                    Acknowledge
                  </span>
                ) : (
                  <ChevronRight size={16} aria-hidden className="announcement-reader-go" />
                )}
              </button>
            );
          })
        ) : (
          <p className="announcement-list-empty">
            {tab === "past" ? "Nothing has ended yet." : "No announcements for you right now."}
          </p>
        )}
      </div>
    </>
  );
}

export default AnnouncementsPage;
