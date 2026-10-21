import type { AnnouncementRecord } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, CircleCheck, Megaphone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  dayTone,
  momentLabel,
  type ListSort,
  type ListTab,
  type SortKey,
  type TimeFormat,
} from "../communications/announcement-model";
import { employeeAnnouncementsPath, managementAnnouncementsPath } from "../shell/view-address";
import { getAnnouncements } from "../communications/communications-data";
import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { CatalogPageHeader, ListAddButton } from "./CatalogPageHeader";
import { CatalogSortButton } from "./CatalogSortButton";
import { ListCard, ListCards } from "./ListCards";
import "../settings/jobs-settings.css";
import "./announcements-catalog.css";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";

/**
 * Announcements (EKRAN-08): one list of posts, Important Dates among them.
 * Whoever may write sees every status in Active and Past tables; everyone
 * else reads the ones sent to them, and so does whoever opens it in the
 * employee view (EMPLOYEE-ANNOUNCEMENTS).
 */
export function AnnouncementsPage({ view = "management" }: { readonly view?: "employee" | "management" }) {
  const base = view === "employee" ? employeeAnnouncementsPath : managementAnnouncementsPath;
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
  // A post that went out after the list on hand was read (a phone alert's tap lands right then): the
  // list is asked for again once, and the reader waits for it before saying the post is gone.
  const missing = Boolean(
    announcementId && query.data && !query.data.announcements.some((item) => item.id === announcementId),
  );
  const [askedFor, setAskedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!missing || askedFor === announcementId) return;
    setAskedFor(announcementId ?? null);
    void query.refetch();
  }, [missing, askedFor, announcementId, query]);
  const looking = missing && (askedFor !== announcementId || query.isFetching);
  const close = () => {
    setAdding(false);
    if (announcementId) navigate(base, { replace: true, preventScrollReset: true });
  };
  const open = (id: string) => navigate(`${base}/${id}`, { preventScrollReset: true });

  if (isNoAccess(query.error))
    return <NoAccessState homeHref={noAccessHomePath(context, base)} />;
  const list = query.data;
  const reader = list ? view === "employee" || !list.can_manage : false;
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
      {query.isLoading && <ListOutline label="Loading announcements" rows={5} columns={4} />}
      {query.error && query.data ? (
        <RefreshError
          message="Announcements didn't refresh. This is the last list that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.error && !query.data && (
        <LoadError
          title="We couldn't load announcements"
          detail="Announcements didn't load. Nothing was changed."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
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
          loading={looking}
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
  // Draft and Scheduled say how many wait; the other tabs carry no number.
  const tabCount = (id: ListTab) =>
    id === "draft" || id === "scheduled" ? records.filter((record) => inListTab(record, id)).length : 0;
  const split = tab === "all" || tab === "published";
  const active = rows.filter((record) => record.display_status !== "past");
  const past = rows.filter((record) => record.display_status === "past");
  // The table on a desktop, one card per post on a phone (list-cards.css).
  const table = (items: AnnouncementRecord[], label: string, empty: string) => (
    <>
      <AnnouncementTable
        label={label}
        rows={sortRecords(items, sort)}
        sort={sort}
        empty={empty}
        timeFormat={timeFormat}
        onSort={(key) => setSort((current) => nextSort(current, key))}
        onOpen={onOpen}
      />
      <AnnouncementCards label={label} rows={sortRecords(items, sort)} timeFormat={timeFormat} onOpen={onOpen} />
    </>
  );
  return (
    <>
      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="announcement-toolbar-controls catalog-toolbar-status-row">
          <div className="catalog-status-tabs" role="tablist" aria-label="Announcement status">
            {listTabs.map((item) => {
              const count = tabCount(item.id);
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
          {/* A phone has no room for the tabs: the same choice is this list (Mert 2026-10-13). */}
          <select
            className="toolbar-filter-select list-filter-narrow announcement-status-select"
            aria-label="Show announcements"
            value={tab}
            onChange={(event) => setTab(event.target.value as ListTab)}
          >
            {listTabs.map((item) => {
              const count = tabCount(item.id);
              const label = item.id === "all" ? "All statuses" : item.label;
              return (
                <option key={item.id} value={item.id}>
                  {count ? `${label} (${count})` : label}
                </option>
              );
            })}
          </select>
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
      {/* The list scrolls here while the toolbar stays (list-page-frozen.css). */}
      <div className="list-frozen-body">
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
      </div>
    </>
  );
}

const columns: { key: SortKey; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "title", label: "Announcement" },
  { key: "category", label: "Category" },
  { key: "starts", label: "Starts" },
  { key: "ends", label: "Ends" },
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
          const tone = dayTone(record);
          const starts = record.starts_on ? momentLabel(record.starts_on, record.event_from, timeFormat) : null;
          const ends = record.starts_on
            ? momentLabel(record.ends_on ?? record.starts_on, record.event_until, timeFormat)
            : null;
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
                    {record.body && <span className="announcement-row-preview">{record.body}</span>}
                  </span>
                </button>
              </div>
              <div role="cell" className="announcement-date-cell">
                {announcementCategoryText(record)}
              </div>
              {[starts, ends].map((moment, index) => (
                <div role="cell" className="announcement-date-cell" key={index ? "ends" : "starts"}>
                  {moment ? (
                    <span className="announcement-day-chip" data-tone={tone ?? undefined}>
                      {moment}
                    </span>
                  ) : (
                    <span className="announcement-dash" aria-label="No date">
                      —
                    </span>
                  )}
                </div>
              ))}
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

/** Phone: the shared list card (KARARLAR Genel "telefonda liste sayfaları kart satırıyla"). */
function AnnouncementCards({
  label,
  rows,
  timeFormat,
  onOpen,
}: {
  label: string;
  rows: AnnouncementRecord[];
  timeFormat: TimeFormat;
  onOpen: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <ListCards label={label}>
      {rows.map((record) => {
        const title = record.title || "Untitled";
        const status = statusLabels[record.display_status];
        const when = whenText(record, timeFormat);
        return (
          <ListCard
            key={record.id}
            label={[title, record.on_important_dates ? "on Important Dates" : "", status, when].filter(Boolean).join(", ")}
            mark={record.on_important_dates ? <CalendarDays size={16} /> : <Megaphone size={16} />}
            title={<span>{title}</span>}
            status={
              <span className="list-chip" data-tone={statusTones[record.display_status]}>
                {status}
              </span>
            }
            lines={[
              [isUnderway(record) ? "Today" : "", announcementCategoryText(record), when].filter(Boolean).join(" · "),
              record.body || null,
            ]}
            onOpen={() => onOpen(record.id)}
          />
        );
      })}
    </ListCards>
  );
}

/** An Important Date names its days; any other post when it went out or goes out. */
function whenText(record: AnnouncementRecord, timeFormat: TimeFormat): string {
  if (record.on_important_dates && record.starts_on) return rangeText(record.starts_on, record.ends_on);
  const on = publishedOn(record);
  if (!on.at) return "";
  if (on.planned) return `Publishes ${momentText(on.at, record.time_zone, timeFormat)}`;
  const day = momentDay(on.at, record.time_zone);
  return `Published ${dayText(day, Number(day.slice(0, 4)) !== new Date().getFullYear())}`;
}

/**
 * What an employee reads: one feed with no tabs, Current over Earlier (S-181).
 * Nothing current says so in one line above the earlier posts; no post at all
 * gives the page's empty state.
 */
function ReaderList({
  records,
  onOpen,
}: {
  records: AnnouncementRecord[];
  onOpen: (id: string) => void;
}) {
  const newestFirst = (a: AnnouncementRecord, b: AnnouncementRecord) =>
    (b.published_at ?? "").localeCompare(a.published_at ?? "");
  const current = records.filter((record) => record.display_status === "published").sort(newestFirst);
  const earlier = records.filter((record) => record.display_status === "past").sort(newestFirst);
  if (!current.length && !earlier.length)
    return (
      <div className="announcement-feed-empty">
        <span className="announcement-feed-empty-icon" aria-hidden>
          <Megaphone size={28} />
        </span>
        <h2>No announcements yet</h2>
        <p>Updates your managers share with your team will show up here.</p>
      </div>
    );
  return (
    // The feed scrolls here while the page title stays (list-page-frozen.css).
    <div className="list-frozen-body announcement-feed">
      <h2 className="announcement-list-heading">
        Current <span>{current.length}</span>
      </h2>
      {current.length ? (
        <ReaderRows records={current} section="current" onOpen={onOpen} />
      ) : (
        <div className="announcement-caught-up">
          <span className="announcement-caught-up-mark" aria-hidden>
            <CircleCheck size={18} />
          </span>
          <span>
            <strong>You're all caught up</strong>
            <small>No current announcements.</small>
          </span>
        </div>
      )}
      {earlier.length > 0 && (
        <>
          <h2 className="announcement-list-heading">
            Earlier <span>{earlier.length}</span>
          </h2>
          <ReaderRows records={earlier} section="earlier" onOpen={onOpen} />
        </>
      )}
    </div>
  );
}

/** One section's rows: a reading row on a desktop, the shared list card on a phone. */
function ReaderRows({
  records,
  section,
  onOpen,
}: {
  records: AnnouncementRecord[];
  section: "current" | "earlier";
  onOpen: (id: string) => void;
}) {
  const asks = (record: AnnouncementRecord) =>
    section === "current" && record.asked_to_acknowledge && !record.acknowledged_at;
  return (
    <>
      <div className="announcement-reader-list" data-section={section}>
        {records.map((record) => (
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
            {asks(record) ? (
              <span className="list-chip" data-tone="blue">
                Acknowledge
              </span>
            ) : (
              <ChevronRight size={16} aria-hidden className="announcement-reader-go" />
            )}
          </button>
        ))}
      </div>
      <ListCards label={section === "earlier" ? "Earlier announcements" : "Current announcements"}>
        {records.map((record) => {
          const ask = asks(record);
          const when = record.starts_on ? rangeText(record.starts_on, record.ends_on) : null;
          return (
            <ListCard
              key={record.id}
              label={[record.title, when, ask ? "Acknowledge" : ""].filter(Boolean).join(", ")}
              mark={record.on_important_dates ? <CalendarDays size={16} /> : <Megaphone size={16} />}
              title={<span>{record.title}</span>}
              status={
                ask ? (
                  <span className="list-chip" data-tone="blue">
                    Acknowledge
                  </span>
                ) : null
              }
              lines={[when, record.body || null]}
              onOpen={() => onOpen(record.id)}
            />
          );
        })}
      </ListCards>
    </>
  );
}

export default AnnouncementsPage;
