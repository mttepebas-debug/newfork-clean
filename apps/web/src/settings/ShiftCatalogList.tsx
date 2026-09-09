import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { CatalogRowMenu } from "./CatalogRowMenu";

type Entry = {
  id: string;
  name: string;
  color: string;
  archived_at: string | null;
  default_start_time?: string | null;
  default_end_time?: string | null;
  crosses_midnight?: boolean;
};
type SortKey = "name" | "default_start_time" | "default_end_time";
export function ShiftCatalogList<T extends Entry>({
  items,
  types = false,
  showArchived,
  onArchivedChange,
  onEdit,
  onMove,
  onArchive,
  disabled,
  reorderPending,
  archivePending,
}: {
  items: T[];
  types?: boolean;
  showArchived: boolean;
  onArchivedChange: (value: boolean) => void;
  onEdit: (item: T) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onArchive: (item: T) => void;
  disabled: boolean;
  reorderPending: boolean;
  archivePending: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{
    key: SortKey;
    descending: boolean;
  } | null>(null);
  const active = items.filter((item) => !item.archived_at);
  const visible = items.filter(
    (item) =>
      (showArchived || !item.archived_at) &&
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  if (sort)
    visible.sort((a, b) => {
      const av = a[sort.key],
        bv = b[sort.key];
      if (!av || !bv) return av ? -1 : bv ? 1 : a.name.localeCompare(b.name);
      const comparison = av.localeCompare(bv, undefined, {
        sensitivity: "base",
        numeric: true,
      });
      return (
        (sort.descending ? -comparison : comparison) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
      );
    });
  const time = (value: string | null | undefined) => {
    if (!value) return "—";
    const [h, m] = value.split(":");
    return `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? "PM" : "AM"}`;
  };
  function column(key: SortKey, label: string) {
    const selected = sort?.key === key;
    const Icon = selected
      ? sort.descending
        ? ArrowDown
        : ArrowUp
      : ArrowUpDown;
    return (
      <button
        type="button"
        className="job-sort-button"
        aria-label={`Sort by ${label}`}
        aria-pressed={selected}
        onClick={() =>
          setSort({ key, descending: selected ? !sort.descending : false })
        }
      >
        {label}
        <Icon size={13} />
      </button>
    );
  }
  return (
    <>
      <div className="job-catalog-toolbar">
        <label className="job-search">
          <Search size={16} aria-hidden />
          <input
            aria-label={`Search shift ${types ? "types" : "labels"}`}
            placeholder="Search by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="job-archive-filter">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => onArchivedChange(e.target.checked)}
          />
          Show archived
        </label>
      </div>
      {visible.length ? (
        <div
          className="job-catalog"
          aria-label={types ? "Shift types" : "Shift labels"}
        >
          <div
            className={`job-column-headings shift-catalog-columns ${types ? "has-times" : ""}`}
          >
            {column("name", types ? "Shift type" : "Shift label")}
            {types && column("default_start_time", "Default start")}
            {types && column("default_end_time", "Default end")}
            {sort ? (
              <button
                type="button"
                className="job-icon-button"
                aria-label="Clear column sorting"
                onClick={() => setSort(null)}
              >
                <X size={14} />
              </button>
            ) : (
              <span />
            )}
          </div>
          {visible.map((item) => (
            <div
              key={item.id}
              className={`job-catalog-row shift-catalog-columns ${types ? "has-times" : ""}`}
              data-archived={Boolean(item.archived_at)}
            >
              <button
                type="button"
                className="job-row-identity"
                disabled={disabled}
                aria-label={`Edit ${item.name}`}
                onClick={() => onEdit(item)}
              >
                <span
                  className="job-color-dot"
                  style={{ backgroundColor: item.color }}
                />
                <span className="job-name-stack">
                  <span className="job-row-name" title={item.name}>
                    {item.name}
                  </span>
                  {types && (
                    <span className="job-mobile-meta">
                      {time(item.default_start_time)} –{" "}
                      {time(item.default_end_time)}
                      {item.crosses_midnight ? " · Next day" : ""}
                    </span>
                  )}
                </span>
                {item.archived_at && (
                  <span className="job-archived-label">Archived</span>
                )}
              </button>
              {types && (
                <>
                  <span className="job-department-cell shift-catalog-time">
                    {time(item.default_start_time)}
                  </span>
                  <span className="job-department-cell shift-catalog-time">
                    {time(item.default_end_time)}
                    {item.crosses_midnight ? " · Next day" : ""}
                  </span>
                </>
              )}
              <CatalogRowMenu name={item.name}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onEdit(item)}
                >
                  Edit {types ? "shift type" : "shift label"}
                </button>
                {!item.archived_at && (
                  <>
                    <button
                      type="button"
                      aria-label={`Move ${item.name} up`}
                      disabled={
                        disabled ||
                        reorderPending ||
                        Boolean(search.trim() || sort) ||
                        active[0]?.id === item.id
                      }
                      onClick={() => onMove(item.id, -1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${item.name} down`}
                      disabled={
                        disabled ||
                        reorderPending ||
                        Boolean(search.trim() || sort) ||
                        active.at(-1)?.id === item.id
                      }
                      onClick={() => onMove(item.id, 1)}
                    >
                      Move down
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`${item.archived_at ? "Restore" : "Archive"} ${item.name}`}
                  disabled={disabled || archivePending}
                  className={item.archived_at ? undefined : "job-danger-text"}
                  onClick={() => onArchive(item)}
                >
                  {item.archived_at ? "Restore" : "Archive"}
                </button>
              </CatalogRowMenu>
            </div>
          ))}
        </div>
      ) : (
        <div className="job-empty-state">
          <h2>
            {search
              ? "No matches found"
              : `No shift ${types ? "types" : "labels"}`}
          </h2>
          <p>
            {search
              ? "Try another name or clear your search."
              : "Add your first entry to get started."}
          </p>
        </div>
      )}
    </>
  );
}
