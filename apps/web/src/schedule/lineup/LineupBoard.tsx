import { projectLineupEntries, lineupSectionAllowed } from "./lineup-helpers";
import {
  ArrowUpRight,
  Clock3,
  MoreHorizontal,
  Plus,
  Users,
  AlertCircle,
} from "lucide-react";
import type {
  LineupSectionPlan,
  ScheduleLineupEntry,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import { formatLineupInterval } from "./lineup-time";
import type { CSSProperties } from "react";

export function lineupCounts(rows: ScheduleLineupEntry[]) {
  const active = rows.filter((row) => !row.hidden && !row.orphaned);
  return {
    people: new Set(
      active
        .filter((row) => row.employee_id && !row.call_off)
        .map((row) => row.employee_id),
    ).size,
    open: active.filter((row) => !row.employee_id || row.call_off).length,
    unassigned: active.filter(
      (row) =>
        row.employee_id &&
        !row.call_off &&
        (row.placement_segments?.length
          ? row.placement_segments.some((segment) => !segment.section_id)
          : !row.section_id),
    ).length,
    review: rows.filter(
      (row) => (row.orphaned || row.source_changed) && !row.hidden,
    ).length,
  };
}

export function LineupBoard({
  rows: sourceRows,
  model,
  locationId,
  serviceId,
  view,
  canManage,
  onEdit: editSource,
  onAdd,
  plans = [],
  activeAt,
  onlyUnassigned,
  onSetup,
}: {
  rows: ScheduleLineupEntry[];
  model: ScheduleLineupReadModel;
  locationId?: string;
  serviceId?: string | null;
  view: "sections" | "list";
  canManage: boolean;
  onEdit: (
    row: ScheduleLineupEntry,
    mode?: "replace",
    placement?: Pick<
      ScheduleLineupEntry,
      "start_time" | "end_time" | "section_id" | "station"
    >,
  ) => void;
  onAdd: (sectionId: string | null) => void;
  plans?: LineupSectionPlan[];
  activeAt?: string;
  onlyUnassigned?: boolean;
  onSetup?: (sectionId: string) => void;
}) {
  const selectedLocation =
    model.locations.find((location) => location.id === locationId) ??
    model.locations.find((location) =>
      location.entries.some((entry) => entry.id === sourceRows[0]?.id),
    ) ??
    model.locations[0];
  const rows = projectLineupEntries(
    sourceRows,
    selectedLocation?.timezone ?? "UTC",
  ).filter(
    (row) =>
      (!onlyUnassigned || !row.section_id) &&
      (!activeAt ||
        !row.placement_start_at ||
        !row.placement_end_at ||
        (new Date(row.placement_start_at).getTime() <=
          new Date(activeAt).getTime() &&
          new Date(activeAt).getTime() <
            new Date(row.placement_end_at).getTime())),
  );
  const onEdit = (row: ScheduleLineupEntry, mode?: "replace") =>
    editSource(
      sourceRows.find(
        (source) => source.id === (row.placement_parent_id ?? row.id),
      ) ?? row,
      mode,
      row.placement_parent_id ? row : undefined,
    );
  const pool = { id: null, name: "Unassigned", color: "#89958e" };
  const applicableSections = model.sections.filter(
    (section) =>
      lineupSectionAllowed(section, selectedLocation?.id ?? "", serviceId) ||
      rows.some((row) => row.section_id === section.id),
  );
  const sections =
    rows.length && rows.every((row) => !row.section_id)
      ? [pool, ...applicableSections]
      : [...applicableSections, pool];
  if (view === "list")
    return (
      <div className="lu-list" aria-label="Staff list">
        <div className="lu-list-heading">
          <span>TEAM MEMBER</span>
          <span>ASSIGNMENT</span>
          <span>SHIFT</span>
        </div>
        {rows.map((row) => (
          <Assignment
            key={row.id}
            row={row}
            timezone={selectedLocation?.timezone ?? "UTC"}
            model={model}
            canManage={canManage}
            onEdit={onEdit}
          />
        ))}
        {!rows.length ? (
          <p className="lu-empty-small">No assignments match these filters.</p>
        ) : null}
      </div>
    );
  return (
    <div className="lu-board">
      {sections.map((section) => {
        const entries = rows.filter((row) => row.section_id === section.id);
        const available =
          !section.id ||
          lineupSectionAllowed(
            section as (typeof model.sections)[number],
            selectedLocation?.id ?? "",
            serviceId,
          );
        const count = lineupCounts(entries);
        const plan = plans.find((item) => item.section_id === section.id);
        return (
          <section
            key={section.id ?? "unassigned"}
            className={`lu-section${!section.id ? " lu-section-unassigned" : ""}`}
            style={{ "--section-color": section.color } as CSSProperties}
          >
            <header>
              <div>
                <span className="lu-section-dot" />
                <h2>{section.name}</h2>
                <span className="lu-count">{count.people}</span>
              </div>
              {count.open ? (
                <span className="lu-badge warning">{count.open} open</span>
              ) : (
                <span className="lu-section-caption">
                  {entries.length}{" "}
                  {entries.length === 1 ? "assignment" : "assignments"}
                </span>
              )}
            </header>
            {section.id ? (
              <div className="lu-section-setup">
                <span>
                  {!available
                    ? "Not used for this location / service"
                    : plan?.closed
                      ? "Closed for this service"
                      : plan?.lead_name
                        ? `Lead · ${plan.lead_name}`
                        : "Lead not assigned"}
                  {plan?.stations ? ` · ${plan.stations}` : ""}
                </span>
                {canManage && onSetup ? (
                  <button
                    aria-label={`Set up ${section.name}`}
                    onClick={() => onSetup(section.id!)}
                  >
                    Set up
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="lu-section-rows">
              {entries.map((row) => (
                <Assignment
                  key={row.id}
                  row={row}
                  timezone={selectedLocation?.timezone ?? "UTC"}
                  model={model}
                  canManage={canManage}
                  onEdit={onEdit}
                />
              ))}
              {!entries.length && !plan?.closed ? (
                <div className="lu-empty-section">
                  <Users size={21} />
                  <p>
                    {section.id
                      ? "Ready for your team"
                      : "Everyone has a section"}
                  </p>
                  <span>
                    {section.id
                      ? "Add an assignment or an open position."
                      : "Team members without a section appear here."}
                  </span>
                </div>
              ) : null}
            </div>
            {canManage && available && !plan?.closed ? (
              <button
                className="lu-section-add"
                onClick={() => onAdd(section.id)}
              >
                <Plus size={16} /> Add to {section.name.toLowerCase()}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function Assignment({
  row,
  timezone,
  model,
  canManage,
  onEdit,
}: {
  row: ScheduleLineupEntry;
  timezone: string;
  model: ScheduleLineupReadModel;
  canManage: boolean;
  onEdit: (row: ScheduleLineupEntry, mode?: "replace") => void;
}) {
  const open = !row.employee_id || row.call_off;
  const initials = row.employee_name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("");
  return (
    <article
      className={`lu-assignment${open ? " lu-open" : ""}${row.orphaned ? " lu-orphan" : ""}`}
    >
      <div className="lu-person">
        <span className={`lu-avatar${open ? " lu-avatar-open" : ""}`}>
          {open ? <Users size={18} /> : initials}
        </span>
        <div>
          <strong>{row.employee_name || "Open position"}</strong>
          <span>
            {row.job_name || "Position needed"}
            {row.call_off ? " · Called off" : ""}
          </span>
        </div>
        {canManage ? (
          <button
            className="lu-more"
            aria-label={`Manage ${row.employee_name || "open position"}${row.placement_parent_id ? ` · ${row.section_name || "Unassigned"} · ${row.start_time}–${row.end_time}` : ""}`}
            onClick={() => onEdit(row)}
          >
            <MoreHorizontal size={20} />
          </button>
        ) : null}
      </div>
      <div className="lu-assignment-detail">
        <span>{row.station || row.section_name || "No section"}</span>
        <span>
          <Clock3 size={12} />
          {row.start_time && row.end_time
            ? formatLineupInterval(
                row,
                model.settings.time_format,
                model.date,
                timezone,
              )
            : "Time needed"}
        </span>
      </div>
      {row.note ? <p className="lu-assignment-note">{row.note}</p> : null}
      {row.orphaned || row.source_changed ? (
        <p className="lu-review">
          <AlertCircle size={14} /> Source changed · review assignment
        </p>
      ) : open && canManage ? (
        <button className="lu-find" onClick={() => onEdit(row, "replace")}>
          Find available staff <ArrowUpRight size={15} />
        </button>
      ) : null}
    </article>
  );
}
