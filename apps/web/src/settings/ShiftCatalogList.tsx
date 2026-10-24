import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Clock3, Search, Tags } from "lucide-react";
import { CatalogArchiveButton, CatalogRowMenu } from "./CatalogRowMenu";
import { ListAddButton } from "../views/CatalogPageHeader";
import { ShiftCatalogToolbar } from "./ShiftCatalogTabs";
import { nextCatalogSort } from "../views/CatalogSortButton";

type Entry = {
  id: string;
  name: string;
  color: string;
  archived_at: string | null;
  default_start_time?: string | null;
  default_end_time?: string | null;
  crosses_midnight?: boolean;
  time_options?: readonly unknown[];
};

/** "+2 more" when a type keeps times beside its primary one (PRESET-SAAT, S-183). */
function moreTimes(item: Entry): string {
  const count = item.time_options?.length ?? 0;
  return count ? ` · +${count} more` : "";
}
type SortKey = "name" | "default_start_time" | "default_end_time";

/** Shift catalog, design A (Mert 2026-10-12): the shared list language with
 * no status filter. Archived entries close the list, marked Archived, so
 * they stay in reach for Restore. */
export function ShiftCatalogList<T extends Entry>({
  items,
  types = false,
  canEdit,
  onAdd,
  addDisabled,
  tabsDisabled,
  notice,
  onEdit,
  onMove,
  onArchive,
  disabled,
  reorderPending,
  archivePending,
}: {
  items: T[];
  types?: boolean;
  canEdit: boolean;
  onAdd: () => void;
  addDisabled: boolean;
  tabsDisabled: boolean;
  /** A message for the whole list, between the filter row and the table. */
  notice?: ReactNode;
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
  const noun = types ? "shift type" : "shift label";
  const active = items.filter((item) => !item.archived_at);
  const matching = items.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  if (sort)
    matching.sort((a, b) => {
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
  const visible = [
    ...matching.filter((item) => !item.archived_at),
    ...matching.filter((item) => item.archived_at),
  ];
  const addButton = canEdit ? (
    <ListAddButton
      label={`New ${noun}`}
      shortLabel="Add"
      disabled={addDisabled}
      onClick={onAdd}
    />
  ) : null;
  const rowClass = `shift-catalog-row ${types ? "has-times" : ""}`;
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
          setSort(nextCatalogSort(sort, key))
        }
      >
        {label}
        <Icon size={13} />
      </button>
    );
  }
  return (
    <>
      <ShiftCatalogToolbar
        disabled={tabsDisabled}
      >
        <div className="catalog-toolbar-filter-row">
          <label className="job-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              aria-label={`Search shift ${types ? "types" : "labels"}`}
              placeholder="Search by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {addButton}
        </div>
      </ShiftCatalogToolbar>
      {notice}
      <div
        className="job-catalog"
        aria-label={types ? "Shift types" : "Shift labels"}
      >
        <div
          className={`job-column-headings catalog-column-headings ${rowClass}`}
          role="row"
        >
          {column("name", types ? "Shift type" : "Shift label")}
          {types && column("default_start_time", "Default start")}
          {types && column("default_end_time", "Default end")}
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="catalog-table-empty">
            <span className="catalog-table-empty-icon" aria-hidden>
              {types ? <Clock3 size={22} /> : <Tags size={22} />}
            </span>
            <h2>
              {items.length ? `No ${noun}s match your search.` : `No ${noun}s yet`}
            </h2>
            <p>
              {items.length
                ? "Try another search."
                : types
                  ? "Add a service period such as Lunch or Dinner, with its default hours."
                  : "Add a tag such as Training or Opener to mark shifts on the Schedule."}
            </p>
          </div>
        ) : null}
        {visible.map((item) => (
          <div
            key={item.id}
            className={`job-catalog-row ${rowClass}`}
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
                {/* Phone: one card per entry (UI-14). */}
                {types && (
                  <span className="shift-catalog-card-line">
                    {time(item.default_start_time)} –{" "}
                    {time(item.default_end_time)}
                    {item.crosses_midnight ? " · Ends next day" : ""} ·{" "}
                    {lengthText(item.default_start_time, item.default_end_time)}
                    {moreTimes(item)}
                  </span>
                )}
              </span>
              {item.archived_at && (
                <span className="job-archived-label">Archived</span>
              )}
            </button>
            {types && (
              <>
                <span className="shift-catalog-cell">
                  {time(item.default_start_time)}
                </span>
                <span className="shift-catalog-cell">
                  {time(item.default_end_time)}
                  {item.crosses_midnight ? (
                    <span className="shift-catalog-next"> · Ends next day</span>
                  ) : null}
                  {moreTimes(item) ? (
                    <span className="shift-catalog-next">{moreTimes(item)}</span>
                  ) : null}
                </span>
              </>
            )}
            {canEdit ? (
              <CatalogRowMenu name={item.name}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onEdit(item)}
                >
                  Edit {noun}
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
                <CatalogArchiveButton
                  archived={Boolean(item.archived_at)}
                  name={item.name}
                  disabled={disabled || archivePending}
                  onToggle={() => onArchive(item)}
                />
              </CatalogRowMenu>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function time(value: string | null | undefined): string {
  if (!value) return "—";
  const [h, m] = value.split(":");
  return `${Number(h) % 12 || 12}:${m} ${Number(h) >= 12 ? "PM" : "AM"}`;
}

/** How long the default hours run, across midnight when the end is earlier:
 * "5 h", "7 h 30 min". */
function lengthText(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return "—";
  const minutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  let span = minutes(end) - minutes(start);
  if (span <= 0) span += 24 * 60;
  const hours = Math.floor(span / 60);
  const rest = span % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
