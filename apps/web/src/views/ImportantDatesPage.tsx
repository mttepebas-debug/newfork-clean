import type { AnnouncementRecord } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { noAccessHomePath } from "../auth/resolveLanding";
import { AnnouncementDrawer } from "../communications/AnnouncementDrawer";
import { AnnouncementReader } from "../communications/AnnouncementReader";
import {
  announcementCategoryText,
  dayTone,
  isUnderway,
  momentLabel,
  rangeText,
  statusLabels,
  statusTones,
} from "../communications/announcement-model";
import { getAnnouncements, getImportantDates } from "../communications/communications-data";
import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { CatalogPageHeader, ListAddButton } from "./CatalogPageHeader";
import { tabLineRef } from "../shell/useTabSwipe";
import { ListCard, ListCards } from "./ListCards";
import "../settings/jobs-settings.css";
import "./announcements-catalog.css";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";

const base = "/app/announcements/important-dates";

/**
 * Important Dates (EKRAN-08), a page under Announcements: the published posts
 * that were added to it, in calendar order, like a shared calendar.
 */
export function ImportantDatesPage() {
  const { context } = useAuth();
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const workspaceId = context?.workspace.id ?? "";
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const dates = useQuery({
    queryKey: ["important-dates", workspaceId],
    queryFn: () => getImportantDates(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const drawerOpen = adding || Boolean(announcementId);
  const list = useQuery({
    queryKey: ["announcements", workspaceId],
    queryFn: () => getAnnouncements(workspaceId),
    enabled: Boolean(workspaceId) && drawerOpen,
  });
  const close = () => {
    setAdding(false);
    if (announcementId) navigate(base, { replace: true, preventScrollReset: true });
  };
  if (isNoAccess(dates.error))
    return <NoAccessState homeHref={noAccessHomePath(context, base)} />;
  const timeFormat = dates.data?.time_format ?? "12h";
  const needle = search.trim().toLowerCase();
  const rows = (dates.data?.dates ?? [])
    .filter((record) =>
      tab === "upcoming" ? record.display_status === "published" : record.display_status === "past",
    )
    .filter((record) => !needle || `${record.title} ${record.body}`.toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        (a.starts_on ?? "").localeCompare(b.starts_on ?? "") * (tab === "past" ? -1 : 1) ||
        a.title.localeCompare(b.title),
    );
  const selected = dates.data?.dates.find((record) => record.id === announcementId) ?? null;
  const addButton = dates.data?.can_write ? (
    <ListAddButton label="New" shortLabel="Add" onClick={() => setAdding(true)} />
  ) : null;
  return (
    <section
      className="settings-page jobs-settings-page announcements-page important-dates-page list-page"
      aria-labelledby="important-dates-title"
    >
      <CatalogPageHeader
        eyebrow="THE RIGHT UPDATE. THE RIGHT PEOPLE."
        title="Important Dates"
        titleId="important-dates-title"
        description="Published posts that were added to Important Dates, in calendar order. Like a shared calendar for the team."
      />
      <div className="job-catalog-toolbar catalog-toolbar">
        <div className="announcement-toolbar-controls catalog-toolbar-status-row">
          <div className="catalog-status-tabs" ref={tabLineRef} role="tablist" aria-label="Important dates">
            {(
              [
                ["upcoming", "Upcoming"],
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
        <div className="catalog-toolbar-filter-row">
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label="Search important dates"
              placeholder="Search important dates"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {addButton}
        </div>
      </div>
      {dates.isLoading && <ListOutline label="Loading important dates" rows={5} columns={5} />}
      {dates.error && dates.data ? (
        <RefreshError
          message="Important Dates didn't refresh. This is the last list that loaded."
          retrying={dates.isFetching}
          onRetry={() => void dates.refetch()}
        />
      ) : null}
      {dates.error && !dates.data && (
        <LoadError
          title="We couldn't load Important Dates"
          detail="Important Dates didn't load. Nothing was changed."
          retrying={dates.isFetching}
          onRetry={() => void dates.refetch()}
        />
      )}
      {dates.data && (
        <div className="job-catalog important-dates-table" role="table" aria-label="Important dates">
          <div className="job-column-headings catalog-column-headings important-date-row" role="row">
            <span role="columnheader">Status</span>
            <span role="columnheader">Important date</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Starts</span>
            <span role="columnheader">Ends</span>
          </div>
          {rows.length ? (
            rows.map((record) => (
              <DateRow
                key={record.id}
                record={record}
                timeFormat={timeFormat}
                onOpen={() => navigate(`${base}/${record.id}`, { preventScrollReset: true })}
              />
            ))
          ) : (
            <div className="announcement-list-empty">No dates here.</div>
          )}
        </div>
      )}
      {dates.data && rows.length > 0 && (
        <ListCards label="Important dates">
          {rows.map((record) => (
            <DateCard
              key={record.id}
              record={record}
              onOpen={() => navigate(`${base}/${record.id}`, { preventScrollReset: true })}
            />
          ))}
        </ListCards>
      )}
      {drawerOpen && list.data?.can_manage && (
        <AnnouncementDrawer
          key={adding ? "new" : announcementId}
          workspaceId={workspaceId}
          list={list.data}
          announcementId={adding ? null : (announcementId ?? null)}
          importantDate
          onClose={close}
        />
      )}
      {drawerOpen && list.data && !list.data.can_manage && (
        <AnnouncementReader
          workspaceId={workspaceId}
          record={selected}
          myLocationIds={context?.locationScope.locationIds ?? []}
          timeFormat={timeFormat}
          onClose={close}
        />
      )}
    </section>
  );
}

/** Status · Important date · Category · Starts · Ends (Mert 2026-10-13). */
function DateRow({
  record,
  timeFormat,
  onOpen,
}: {
  record: AnnouncementRecord;
  timeFormat: "12h" | "24h";
  onOpen: () => void;
}) {
  const tone = dayTone(record);
  const starts = record.starts_on ? momentLabel(record.starts_on, record.event_from, timeFormat) : null;
  const ends = record.starts_on
    ? momentLabel(record.ends_on ?? record.starts_on, record.event_until, timeFormat)
    : null;
  return (
    <div
      className="job-catalog-row important-date-row"
      role="row"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button")) onOpen();
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
        <button className="job-row-identity" type="button" onClick={onOpen}>
          <span className="announcement-row-icon" aria-hidden>
            <CalendarDays size={16} />
          </span>
          <span className="job-name-stack">
            <span className="job-row-name important-date-title">
              {record.title}
              {record.recurrence !== "none" && <span className="announcement-day-chip">Every year</span>}
            </span>
          </span>
        </button>
      </div>
      <div role="cell" className="announcement-date-cell important-date-category">
        {announcementCategoryText(record)}
      </div>
      <div role="cell" className="announcement-date-cell">
        {starts && (
          <span className="announcement-day-chip" data-tone={tone ?? undefined}>
            {starts}
          </span>
        )}
      </div>
      <div role="cell" className="announcement-date-cell">
        {ends && (
          <span className="announcement-day-chip" data-tone={tone ?? undefined}>
            {ends}
          </span>
        )}
      </div>
    </div>
  );
}

/** Phone: the shared list card; the days first, then the kind. */
function DateCard({ record, onOpen }: { record: AnnouncementRecord; onOpen: () => void }) {
  const status = statusLabels[record.display_status];
  const days = [
    isUnderway(record) ? "Today" : "",
    record.starts_on ? rangeText(record.starts_on, record.ends_on) : "",
    record.recurrence !== "none" ? "Every year" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <ListCard
      label={[record.title, days, status].filter(Boolean).join(", ")}
      mark={<CalendarDays size={16} />}
      title={<span>{record.title}</span>}
      status={
        <span className="list-chip" data-tone={statusTones[record.display_status]}>
          {status}
        </span>
      }
      lines={[days || null, announcementCategoryText(record)]}
      onOpen={onOpen}
    />
  );
}

export default ImportantDatesPage;
