import { tabLineRef } from "../shell/useTabSwipe";
import {
  documentMatchesStatus,
  documentStatusFilterOf,
  documentStatusFilters,
  type DocumentObligation,
  type DocumentStatusFilter,
} from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogSortButton } from "../views/CatalogSortButton";
import { ListOutline, LoadError, RefreshError } from "../shell/LoadState";
import {
  documentQueryKey,
  listDocuments,
  type DocumentAudience,
} from "./document-data";
import { useAuth } from "../auth/AuthContext";
import { noAccessHomePath } from "../auth/resolveLanding";
import { isNoAccess } from "../lib/no-access";
import { NoAccessState } from "../shell/NoAccessState";
import { DocumentReviewDrawer } from "./DocumentReviewDrawer";
import { statusLabel, statusTone, statusWeight, type StatusTone } from "./document-rules";
import { snapshotQueue } from "./review-queue";
import { createReviewSitting } from "./review-sitting";
import "./documents.css";

const statusLabels: Record<DocumentStatusFilter, string> = {
  needs_review: "Needs review",
  to_do: "To do",
  completed: "Completed",
};
/** What an empty tab says when nothing else narrows the list. */
const emptyTab: Record<DocumentStatusFilter, { title: string; detail: string; own: string }> = {
  needs_review: {
    title: "Nothing to review",
    detail: "Documents sent for review show up here.",
    own: "Nothing waiting for review.",
  },
  to_do: {
    title: "Nothing to do",
    detail: "Missing, rejected and expired documents show up here.",
    own: "Nothing to do.",
  },
  completed: {
    title: "Nothing completed yet",
    detail: "Approved and exempt documents show up here.",
    own: "Nothing completed yet.",
  },
};
/** A manager's tabs speak the manager's words: a document sent back is Missing, an exempt one Excused (K1 decision 4). */
const managerEmptyDetail: Partial<Record<DocumentStatusFilter, string>> = {
  to_do: "Missing and expired documents show up here.",
  completed: "Approved and excused documents show up here.",
};
/** One cached read for the list and the page around it, so the page can drop
 * its header when the list is refused. */
export function useEmployeeDocuments(audience: DocumentAudience, userId: string) {
  return useQuery({
    queryKey: documentQueryKey(audience, userId),
    queryFn: () => listDocuments(audience),
    enabled: Boolean(audience.workspaceId),
  });
}

export function EmployeeDocumentsList(props: {
  audience: DocumentAudience;
  userId: string;
  canReview: boolean;
  kind?: "document" | "acknowledgement";
  employeeId?: string;
  initialRequirementId?: string | null;
  /** Where a link opens the list (Home's Needs you); the person changes them after. */
  initialStatus?: DocumentStatusFilter;
  initialLocationId?: string;
  /** Account's own list: one person, so no employee column, location filter
   * or employee search. Everyone else keeps the full table. */
  personal?: boolean;
}) {
  const personal = props.personal ?? false;
  // A manager reviews in the A2 drawer, which walks this list (K1); the person's own drawer keeps today's Next.
  const manager = !props.audience.selfOnly;
  const reader = manager ? "manager" : "employee";
  const { context } = useAuth();
  const query = useEmployeeDocuments(props.audience, props.userId);
  // KARARLAR S-255: a manager opens on what waits for them, the person on what waits for them.
  const [filter, setFilter] = useState<DocumentStatusFilter>(
    props.initialStatus ?? (props.audience.selfOnly ? "to_do" : "needs_review"),
  );
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState(props.initialLocationId ?? "");
  const [type, setType] = useState("");
  const [sort, setSort] = useState<{
    key: "employee_name" | "title" | "status";
    descending: boolean;
  }>({ key: personal ? "title" : "employee_name", descending: false });
  const [openedInitial, setOpenedInitial] = useState(false);
  const [selected, setSelected] = useState<{
    id: string;
    ordinal: number;
  } | null>(null);
  // K1 decision 6: the rows the drawer walks, taken from the open tab when it opens (after a link's tab switch).
  const [queue, setQueue] = useState<DocumentObligation[] | null>(null);
  // K1 decision 5: what a manager typed in the drawer, per document, while this page is open.
  const [sitting] = useState(createReviewSitting);
  const open = (id: string, ordinal: number) => {
    setSelected({ id, ordinal });
    setQueue(null);
  };
  const items = useMemo(
    () =>
      (query.data ?? []).filter(
        (r) =>
          (!props.kind || r.kind === props.kind) &&
          (!props.employeeId || r.employee_id === props.employeeId),
      ),
    [query.data, props.kind, props.employeeId],
  );
  useEffect(() => {
    if (!openedInitial && query.data) {
      setOpenedInitial(true);
      const opened = items.find((item) => item.id === props.initialRequirementId);
      if (opened) {
        setSelected({ id: opened.id, ordinal: 0 });
        // A link that names no tab (a notification) shows its row behind the drawer.
        const tab = documentStatusFilterOf(opened.status);
        if (!props.initialStatus && tab) setFilter(tab);
      }
    }
  }, [openedInitial, query.data, items, props.initialRequirementId, props.initialStatus]);
  const blockers = (query.data ?? []).filter((item) => item.suspended);
  const locations = new Map<string, string>();
  items.forEach((r) =>
    r.location_ids.forEach((id, i) =>
      locations.set(id, r.location_names[i] ?? "Location"),
    ),
  );
  const types = new Map(items.map((r) => [r.source_id ?? r.id, r.title]));
  const matchesControls = (r: DocumentObligation) =>
    (!location || r.location_ids.includes(location)) &&
    (!type || (r.source_id ?? r.id) === type) &&
    `${r.employee_name} ${r.title}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
  const compare = (a: DocumentObligation, b: DocumentObligation) => {
    const order =
      sort.key === "status"
        ? statusWeight(a.status) - statusWeight(b.status)
        : a[sort.key].localeCompare(b[sort.key]);
    return (sort.descending ? -1 : 1) * order;
  };
  const visible = items
    .filter(
      (r) => matchesControls(r) && documentMatchesStatus(r.status, filter),
    )
    .sort(compare);
  // Taken on the render that opens the drawer: a link's tab switch lands in the same render, so the queue holds the
  // linked row's tab; the opened row is in it even when the tab does not show it.
  if (manager && selected && queue === null && query.data)
    setQueue(snapshotQueue(visible, items.find((r) => r.id === selected.id), compare));
  // The queue's rows with the list's latest data; one gone from the list stays as it was shown.
  const latest = new Map(items.map((r) => [r.id, r]));
  const walked = (queue ?? []).map((r) => latest.get(r.id) ?? r);
  // The drawer gives focus back to the row that opened it; a decision can take that row off the tab, and closing
  // then puts focus on the row now in its place (or the open tab), never on the page itself. The manager's drawer
  // only: the person's own drawer stays as it is in this slice (K1).
  const listRef = useRef<HTMLDivElement>(null);
  const lastShown = useRef<{ id: string; index: number } | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!manager) return;
    if (selected) {
      wasOpen.current = true;
      const index = visible.findIndex((r) => r.id === selected.id);
      lastShown.current = { id: selected.id, index: index >= 0 ? index : (lastShown.current?.index ?? 0) };
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    const root = listRef.current;
    const rows = Array.from(root?.querySelectorAll<HTMLElement>("tbody tr[data-document-row]") ?? []);
    const last = lastShown.current;
    const target =
      rows.find((r) => r.dataset.documentRow === last?.id) ??
      rows[Math.min(last?.index ?? 0, rows.length - 1)] ??
      root?.querySelector<HTMLElement>(".catalog-status-tabs button[aria-pressed='true']");
    target?.focus();
  });
  const currentIndex = visible.findIndex((r) => r.id === selected?.id);
  const nextIndex =
    currentIndex >= 0 ? currentIndex + 1 : (selected?.ordinal ?? 0);
  const next = visible[nextIndex];
  // Nothing asked of this person here: one line says so, no empty table.
  // A failed refresh keeps the last answer, so it doesn't turn this into a table.
  const nothingAsked =
    personal && Boolean(query.data) && !isNoAccess(query.error) && items.length === 0;
  // BL-834: nothing here at all is not a filter miss; on any tab (S-255).
  const narrowed = Boolean(search.trim() || location || type);
  const noneYet = items.length === 0 && !narrowed;
  // Refused: only the no-access card, no header, filters or empty table.
  // Employees → Documents answers before this (EmployeeDocumentsPage); the
  // employee drawer and Account › Documents land here.
  const refused = Boolean(query.error) && isNoAccess(query.error);
  const sortBy = (key: typeof sort.key) =>
    setSort((s) => ({ key, descending: s.key === key && !s.descending }));
  if (refused)
    return (
      <NoAccessState
        subject="these documents"
        homeHref={noAccessHomePath(context, "/app/employees/documents")}
      />
    );
  return (
    <div className="employee-documents-list" ref={listRef}>
      {props.audience.selfOnly && blockers.length > 0 && (
        <p role="status">
          Workspace access is restricted until these requests are resolved:{" "}
          {blockers.map((item) => item.title).join(", ")}.
        </p>
      )}
      {query.error && query.data && !isNoAccess(query.error) ? (
        <RefreshError
          message="Documents didn't refresh. This is the last list that loaded."
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {nothingAsked ? (
        <div className="employee-documents-none">
          <span className="employee-documents-none-icon" aria-hidden>
            <FileText size={22} />
          </span>
          <p>Nothing has been asked of you here.</p>
        </div>
      ) : null}
      {nothingAsked ? null : <>
      <div className="catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div className="catalog-status-tabs" ref={tabLineRef} aria-label="Document status">
            {documentStatusFilters.map((status) =>
              (() => {
                const count = items.filter(
                  (r) =>
                    matchesControls(r) &&
                    documentMatchesStatus(r.status, status),
                ).length;
                return (
                  <button
                    key={status}
                    type="button"
                    className={filter === status ? "active" : ""}
                    aria-pressed={filter === status}
                    onClick={() => setFilter(status)}
                  >
                    {statusLabels[status]}
                    {count > 0 ? <span>{count}</span> : null}
                  </button>
                );
              })(),
            )}
          </div>
        </div>
        <div className="catalog-toolbar-filter-row">
          {personal ? null : <label>
            <span className="sr-only">Location</span>
            <select
              className="toolbar-filter-select list-filter-narrow"
              aria-label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">All locations</option>
              {[...locations].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>}
          <label>
            <span className="sr-only">Document type</span>
            <select
              className="toolbar-filter-select list-filter-narrow"
              aria-label="Document type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All document types</option>
              {[...types].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {personal ? null : <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label="Search employee documents"
              placeholder="Search employee or document"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>}
        </div>
      </div>
      <div className="employee-table-wrap">
        <table
          className="employee-table document-table"
          aria-label="Employee documents"
        >
          <thead>
            <tr>
              {(
                [
                  ["employee_name", "Employee"],
                  ["title", "Document"],
                  ["status", "Status"],
                ] as const
              ).filter(([key]) => !personal || key !== "employee_name").map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort.key === key
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <CatalogSortButton
                    active={sort.key === key}
                    label={label}
                    onClick={() => sortBy(key)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, ordinal) => (
              <tr
                key={r.id}
                data-document-row={r.id}
                tabIndex={0}
                onClick={() => open(r.id, ordinal)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    open(r.id, ordinal);
                  }
                }}
              >
                {personal ? (
                  <td>
                    {r.title}
                    <small className="document-location-label">
                      {r.location_names.join(", ")}
                    </small>
                  </td>
                ) : (
                  <>
                    <td>
                      {r.employee_name}
                      <small className="document-location-label">
                        {r.location_names.join(", ")}
                      </small>
                    </td>
                    <td>{r.title}</td>
                  </>
                )}
                <td>
                  {personal ? (
                    statusLabel(r, reader)
                  ) : (
                    <span className="list-chip" data-tone={chipTones[statusTone(r)]}>
                      {statusLabel(r, reader)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* BL-855: where the rows go, not under the empty table. */}
        {query.isLoading && (
          <ListOutline label="Loading documents" rows={6} columns={personal ? 2 : 3} inset />
        )}
        {query.error && !query.data && !isNoAccess(query.error) && (
          <LoadError
            inset
            level={props.employeeId || personal ? 3 : 2}
            title="We couldn't load documents"
            detail="Documents didn't load. Nothing was changed."
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        )}
        {query.data && !isNoAccess(query.error) && !visible.length && (
          noneYet ? (
            <div className="catalog-table-empty">
              <span className="catalog-table-empty-icon" aria-hidden>
                <FileText size={22} />
              </span>
              <h2>No documents yet</h2>
              <p>
                {props.employeeId
                  ? "Documents they submit show up here."
                  : "Documents your team submits show up here."}
              </p>
            </div>
          ) : personal ? (
            <div className="employee-documents-empty is-compact">
              <strong>
                {narrowed ? "No documents match these filters." : emptyTab[filter].own}
              </strong>
            </div>
          ) : !narrowed ? (
            <div className="catalog-table-empty">
              <span className="catalog-table-empty-icon" aria-hidden>
                <FileText size={22} />
              </span>
              <h2>{emptyTab[filter].title}</h2>
              <p>{(manager && managerEmptyDetail[filter]) || emptyTab[filter].detail}</p>
            </div>
          ) : (
            <div className="catalog-table-empty">
              <span className="catalog-table-empty-icon" aria-hidden>
                <FileText size={22} />
              </span>
              <h2>No documents match these filters.</h2>
              <p>Try another status or clear your search.</p>
            </div>
          )
        )}
      </div>
      </>}
      {selected && (
        <DocumentReviewDrawer
          audience={props.audience}
          userId={props.userId}
          requirementId={selected.id}
          canReview={props.canReview}
          onClose={() => {
            setSelected(null);
            setQueue(null);
          }}
          {...(manager
            ? {
                queue: walked,
                sitting,
                onOpen: (id: string) => setSelected({ id, ordinal: 0 }),
              }
            : next
              ? { onNext: () => setSelected({ id: next.id, ordinal: nextIndex }) }
              : {})}
        />
      )}
    </div>
  );
}

/** The list chip's colour names for a status's tone (KARARLAR Genel → "Durum çipi"). */
const chipTones: Record<StatusTone, "green" | "amber" | "red" | "gray"> = {
  ok: "green",
  warn: "amber",
  red: "red",
  grey: "gray",
};
