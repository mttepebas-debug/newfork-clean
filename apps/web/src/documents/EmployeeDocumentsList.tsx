import {
  documentMatchesStatus,
  documentStatusFilters,
  type DocumentObligation,
  type DocumentStatusFilter,
} from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CatalogSortButton } from "../views/CatalogSortButton";
import { errorText } from "../settings/GeneralSettingsPage";
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
import "./documents.css";

const statusLabels = {
  all: "All",
  pending_review: "Needs review",
  missing: "Missing",
  expired: "Expired",
  completed: "Completed",
};
const labels: Record<DocumentObligation["status"], string> = {
  pending_review: "Needs review",
  missing: "Missing",
  expired: "Expired",
  completed: "Completed",
  grace: "Grace period",
  rejected: "Rejected",
  removed: "Removed",
  exempt: "Exempt",
  timezone_required: "Time zone needed",
  paused: "Paused",
};
export function EmployeeDocumentsList(props: {
  audience: DocumentAudience;
  userId: string;
  canReview: boolean;
  kind?: "document" | "acknowledgement";
  employeeId?: string;
  initialRequirementId?: string | null;
  /** Account's own list: one person, so no employee column, location filter
   * or employee search. Everyone else keeps the full table. */
  personal?: boolean;
}) {
  const personal = props.personal ?? false;
  const { context } = useAuth();
  const query = useQuery({
    queryKey: documentQueryKey(props.audience, props.userId),
    queryFn: () => listDocuments(props.audience),
    enabled: Boolean(props.audience.workspaceId),
  });
  const [filter, setFilter] = useState<DocumentStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
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
      if (items.some((item) => item.id === props.initialRequirementId))
        setSelected({ id: props.initialRequirementId!, ordinal: 0 });
    }
  }, [openedInitial, query.data, items, props.initialRequirementId]);
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
  const visible = items
    .filter(
      (r) => matchesControls(r) && documentMatchesStatus(r.status, filter),
    )
    .sort((a, b) => {
      if (props.audience.selfOnly && filter === "all") {
        const actionable = (r: DocumentObligation) =>
          ["missing", "grace", "rejected", "expired"].includes(r.status)
            ? 0
            : 1;
        const order = actionable(a) - actionable(b);
        if (order) return order;
      }
      return (
        (sort.descending ? -1 : 1) * a[sort.key].localeCompare(b[sort.key])
      );
    });
  const currentIndex = visible.findIndex((r) => r.id === selected?.id);
  const nextIndex =
    currentIndex >= 0 ? currentIndex + 1 : (selected?.ordinal ?? 0);
  const next = visible[nextIndex];
  // Nothing asked of this person here: one line says so, no empty table.
  const nothingAsked =
    personal && !query.isLoading && !query.error && items.length === 0;
  const sortBy = (key: typeof sort.key) =>
    setSort((s) => ({ key, descending: s.key === key && !s.descending }));
  return (
    <div className="employee-documents-list">
      {props.audience.selfOnly && blockers.length > 0 && (
        <p role="status">
          Workspace access is restricted until these requests are resolved:{" "}
          {blockers.map((item) => item.title).join(", ")}.
        </p>
      )}
      {nothingAsked ? (
        <p className="employee-documents-none">
          Nothing has been asked of you here.
        </p>
      ) : null}
      {nothingAsked ? null : <>
      <div className="catalog-toolbar">
        <div className="catalog-toolbar-status-row">
          <div className="catalog-status-tabs" aria-label="Document status">
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
              className="toolbar-filter-select"
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
              className="toolbar-filter-select"
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
          className={personal ? "employee-table document-personal-table" : "employee-table"}
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
                tabIndex={0}
                onClick={() => setSelected({ id: r.id, ordinal })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected({ id: r.id, ordinal });
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
                <td>{labels[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!query.isLoading && !query.error && !visible.length && (
          <div className={personal ? "employee-documents-empty is-compact" : "employee-documents-empty"}>
            <strong>No documents match these filters.</strong>
          </div>
        )}
      </div>
      </>}
      {query.isLoading && <p className="settings-state">Loading documents…</p>}
      {query.error && (isNoAccess(query.error) ? (
        <NoAccessState
          subject="these documents"
          homeHref={noAccessHomePath(context, "/app/employees/documents")}
        />
      ) : (
        <p className="settings-state error" role="alert">
          {errorText(query.error)}
        </p>
      ))}
      {selected && (
        <DocumentReviewDrawer
          audience={props.audience}
          userId={props.userId}
          requirementId={selected.id}
          canReview={props.canReview}
          onClose={() => setSelected(null)}
          {...(next
            ? { onNext: () => setSelected({ id: next.id, ordinal: nextIndex }) }
            : {})}
        />
      )}
    </div>
  );
}
