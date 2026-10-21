import { useState, type ReactNode } from "react";
import "./schedule-topbar-filter.css";

export type ScheduleTopBarFilterId =
  "locations" | "departments" | "shiftTypes" | "jobs" | "employees";

export interface ScheduleTopBarFilterItem {
  readonly id: string;
  readonly label: string;
  readonly color?: string | null;
}

export interface ScheduleTopBarFilterGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly ScheduleTopBarFilterItem[];
}

export function flattenScheduleTopBarFilterGroups(
  groups: readonly ScheduleTopBarFilterGroup[],
): ScheduleTopBarFilterItem[] {
  return groups.flatMap((group) => group.items);
}

const CHECK_MARK = "\u2713";
const MIXED_MARK = "\u2013";

interface ScheduleTopBarFilterProps {
  readonly filterId: ScheduleTopBarFilterId;
  readonly allLabel: string;
  readonly singularLabel: string;
  readonly pluralLabel: string;
  readonly icon: ReactNode;
  readonly items: readonly ScheduleTopBarFilterItem[];
  readonly groups?: readonly ScheduleTopBarFilterGroup[];
  readonly selectedIds: readonly string[];
  readonly onChange: (ids: string[]) => void;
  readonly topContent?: ReactNode;
  readonly summarySuffix?: string;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly searchable?: boolean;
}

export function ScheduleTopBarFilter({
  filterId,
  allLabel,
  singularLabel,
  pluralLabel,
  icon,
  items,
  groups,
  selectedIds,
  onChange,
  topContent,
  summarySuffix,
  open,
  onOpenChange,
  searchable = false,
}: ScheduleTopBarFilterProps) {
  const [search, setSearch] = useState("");
  const itemIds = items.map((item) => item.id);
  const allSelected =
    selectedIds.length === 0 ||
    (itemIds.length > 0 &&
      selectedIds.length === itemIds.length &&
      itemIds.every((id) => selectedIds.includes(id)));
  const matchesSearch = (item: ScheduleTopBarFilterItem) =>
    item.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const heading = pluralLabel.charAt(0).toUpperCase() + pluralLabel.slice(1);
  const label = allSelected
    ? allLabel
    : selectedIds.length === 1
      ? (items.find((item) => item.id === selectedIds[0])?.label ??
        `1 ${singularLabel}`)
      : `${selectedIds.length} ${pluralLabel}`;

  const summary = summarySuffix ? `${label} - ${summarySuffix}` : label;

  function normalizeSelection(ids: readonly string[]): string[] {
    const validIds = ids.filter((id) => itemIds.includes(id));
    return validIds.length === 0 || validIds.length === itemIds.length
      ? []
      : [...validIds];
  }

  function selectAll(): void {
    onChange([]);
  }

  function toggleItem(id: string): void {
    if (allSelected) {
      onChange(normalizeSelection([id]));
      return;
    }

    const next = selectedIds.includes(id)
      ? selectedIds.filter((itemId) => itemId !== id)
      : [...selectedIds, id];
    onChange(normalizeSelection(next));
  }

  function toggleGroup(ids: readonly string[]): void {
    if (!ids.length) return;

    if (allSelected) {
      onChange(normalizeSelection(ids));
      return;
    }

    const selectedSet = new Set(selectedIds);
    const groupSelected = ids.every((id) => selectedSet.has(id));
    const next = groupSelected
      ? selectedIds.filter((id) => !ids.includes(id))
      : [...new Set([...selectedIds, ...ids])];
    onChange(normalizeSelection(next));
  }

  function renderItem(item: ScheduleTopBarFilterItem, grouped = false) {
    const checked = allSelected || selectedIds.includes(item.id);
    return (
      <button
        key={item.id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={item.label}
        className={
          grouped
            ? "schedule-topbar-filter-item grouped"
            : "schedule-topbar-filter-item"
        }
        data-selected={checked}
        onClick={() => toggleItem(item.id)}
      >
        <span className="schedule-topbar-filter-check" aria-hidden>
          {checked ? CHECK_MARK : null}
        </span>
        <span className="schedule-topbar-filter-label">{item.label}</span>
      </button>
    );
  }

  function renderGroup(group: ScheduleTopBarFilterGroup) {
    const ids = group.items.map((item) => item.id);
    const groupChecked =
      allSelected || ids.every((id) => selectedIds.includes(id));
    const groupMixed =
      !allSelected &&
      !groupChecked &&
      ids.some((id) => selectedIds.includes(id));

    return (
      <div
        key={group.id}
        role="group"
        aria-label={group.label}
        className="schedule-topbar-filter-group"
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={groupMixed ? "mixed" : groupChecked}
          aria-label={group.label}
          className="schedule-topbar-filter-group-button"
          data-selected={groupChecked}
          data-mixed={groupMixed}
          onClick={() => toggleGroup(ids)}
        >
          <span className="schedule-topbar-filter-check" aria-hidden>
            {groupMixed ? MIXED_MARK : groupChecked ? CHECK_MARK : null}
          </span>
          <span className="schedule-topbar-filter-label">{group.label}</span>
          <span
            className="schedule-topbar-filter-group-count"
            aria-hidden="true"
          >
            {ids.length}
          </span>
        </button>
        <div className="schedule-topbar-filter-group-items">
          {group.items.map((item) => renderItem(item, true))}
        </div>
      </div>
    );
  }

  return (
    <details
      className="schedule-topbar-filter"
      data-active={!allSelected}
      data-filter-id={filterId}
      name="schedule-topbar-menu"
      open={open}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open)}
    >
      <summary
        data-topbar-filter-trigger={filterId}
        title={summary}
        onClick={
          onOpenChange
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenChange(!open);
              }
            : undefined
        }
      >
        {icon}
        {summary}
      </summary>
      <div
        className="schedule-topbar-filter-menu"
        data-topbar-filter-content={filterId}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="schedule-topbar-filter-heading">
          <strong>{heading}</strong>
          <span aria-live="polite">
            {allSelected
              ? "All selected"
              : `${selectedIds.length} of ${items.length} selected`}
          </span>
        </div>
        {topContent ? (
          <div className="schedule-topbar-filter-top-content">{topContent}</div>
        ) : null}
        {searchable && (
          <label className="schedule-topbar-filter-top-content job-field">
            <span>Search {pluralLabel}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        )}
        <div className="schedule-topbar-filter-all-section">
          <button
            type="button"
            role="checkbox"
            aria-checked={allSelected}
            className="schedule-topbar-filter-all"
            data-selected={allSelected}
            onClick={selectAll}
          >
            <span className="schedule-topbar-filter-check" aria-hidden>
              {allSelected ? CHECK_MARK : null}
            </span>
            <span className="schedule-topbar-filter-label">{allLabel}</span>
          </button>
        </div>
        <div className="schedule-topbar-filter-list">
          {groups?.length
            ? (searchable
                ? groups
                    .map((group) => ({
                      ...group,
                      items: group.items.filter(matchesSearch),
                    }))
                    .filter((group) => group.items.length)
                : groups
              ).map(renderGroup)
            : items.filter(matchesSearch).map((item) => renderItem(item))}
          {searchable && !items.some(matchesSearch) && (
            <p>No matching {pluralLabel}.</p>
          )}
        </div>
        <div className="schedule-topbar-filter-footer">
          <span>
            {items.length} {items.length === 1 ? singularLabel : pluralLabel}
          </span>
          <span>Esc to close</span>
        </div>
      </div>
    </details>
  );
}
