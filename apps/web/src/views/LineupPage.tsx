import type {
  ScheduleLineupBrief,
  ScheduleLineupEmployeeOption,
  ScheduleLineupEntry,
  ScheduleLineupEntryInput,
  ScheduleLineupLocation,
  ScheduleLineupReadModel,
  ScheduleLineupSection,
  ScheduleLineupSectionInput,
  ScheduleLineupSharePreview,
} from "@newfork/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  FileDown,
  GripVertical,
  ImageDown,
  Plus,
  Save,
  Send,
  Settings2,
  Share2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  archiveLineupSection,
  deleteLineupEntry,
  getLineup,
  moveLineupEntry,
  previewLineupShare,
  saveLineupBrief,
  saveLineupEntry,
  saveLineupSection,
  shareLineup,
} from "../schedule/lineup-data";
import {
  buildLineupShareText,
  copyLineupPng,
  downloadLineupPdf,
  downloadLineupPng,
  formatLineupShareDate,
  shareLineupPng,
} from "../schedule/lineup-share";

export function LineupPage() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const today = new Date().toLocaleDateString("en-CA");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(search.get("date") ?? "")
    ? search.get("date")!
    : today;
  const [locations, setLocations] = useState<string[]>([]),
    [staffFor, setStaffFor] = useState<ScheduleLineupLocation | null>(null),
    [sectionsOpen, setSectionsOpen] = useState(false),
    [share, setShare] = useState<ScheduleLineupSharePreview | null>(null),
    [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["lineup", context?.workspace.id, date, locations],
    queryFn: () => getLineup(context!.workspace.id, date, locations),
    enabled: Boolean(context),
  });
  const canManage =
      context?.permissions.includes("schedule.lineup.manage") ?? false,
    canShare = context?.permissions.includes("schedule.lineup.share") ?? false;
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["lineup"] });
  }
  function move(days: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    setSearch({ date: next.toLocaleDateString("en-CA") });
  }
  async function save(
    location: ScheduleLineupLocation,
    row: ScheduleLineupEntry,
    patch: Partial<ScheduleLineupEntryInput>,
  ) {
    try {
      setError("");
      await saveLineupEntry(
        context!.workspace.id,
        location.id,
        date,
        {
          source_shift_id: row.source_shift_id,
          employee_id: row.employee_id,
          job_id: row.job_id,
          shift_type_id: row.shift_type_id,
          start_time: row.start_time,
          end_time: row.end_time,
          section_id: row.section_id,
          station: row.station,
          call_off: row.call_off,
          hidden: row.hidden,
          display_order: row.display_order,
          ...patch,
        },
        row.overlay_id,
        row.revision,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Line-up could not be saved");
    }
  }
  if (query.isLoading) return <State text="Loading Line-up..." />;
  if (query.error || !query.data)
    return (
      <State
        text={
          query.error instanceof Error
            ? query.error.message
            : "Line-up unavailable"
        }
        error
      />
    );
  const model = query.data;
  return (
    <section className="lineup-page" aria-labelledby="lineup-title">
      <nav className="schedule-subnav" aria-label="Schedule sections">
        <Link to="/app/schedule">Schedule</Link>
        <Link className="active" to={`/app/schedule/lineup?date=${date}`}>
          Line-up
        </Link>
        {context?.permissions.some((permission) =>
          [
            "schedule.time_off_requests.read",
            "schedule.shift_change_requests.read",
          ].includes(permission),
        ) ? (
          <Link to="/app/schedule/requests">Requests</Link>
        ) : null}
      </nav>
      <header className="lineup-header">
        <div className="lineup-date">
          <button
            className="icon-button"
            aria-label="Previous day"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="nf-button secondary"
            onClick={() => setSearch({ date: today })}
          >
            Today
          </button>
          <button
            className="icon-button"
            aria-label="Next day"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
          <div>
            <h1 id="lineup-title">Line-up</h1>
            <span>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(new Date(`${date}T12:00:00`))}
            </span>
          </div>
        </div>
        <div className="lineup-actions">
          <label>
            <CalendarDays size={16} />
            <input
              type="date"
              value={date}
              onChange={(e) => setSearch({ date: e.target.value })}
            />
          </label>
          {canManage ? (
            <button
              className="nf-button secondary"
              onClick={() => setSectionsOpen(true)}
            >
              <Settings2 size={16} /> Sections
            </button>
          ) : null}
          {canShare ? (
            <button
              className="nf-button"
              disabled={!model.locations.length}
              onClick={async () => {
                try {
                  setShare(
                    await previewLineupShare(
                      context!.workspace.id,
                      date,
                      model.locations.map((l) => l.id),
                    ),
                  );
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Share preview failed",
                  );
                }
              }}
            >
              <Send size={16} /> Share
            </button>
          ) : null}
        </div>
      </header>
      <div className="lineup-location-filter" aria-label="Locations">
        {model.locations.map((l) => (
          <button
            key={l.id}
            aria-pressed={!locations.length || locations.includes(l.id)}
            onClick={() =>
              setLocations((current) =>
                current.length === 1 && current[0] === l.id ? [] : [l.id],
              )
            }
          >
            {l.name}
          </button>
        ))}
      </div>
      {error ? (
        <p className="lineup-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="lineup-locations">
        {model.locations.map((location) => (
          <LocationBand
            key={location.id}
            location={location}
            model={model}
            allEntries={model.locations.flatMap((item) => item.entries)}
            canManage={canManage}
            onSave={(
              row: ScheduleLineupEntry,
              patch: Partial<ScheduleLineupEntryInput>,
            ) => save(location, row, patch)}
            onMove={async (
              row: ScheduleLineupEntry,
              target: { sectionId: string | null; displayOrder: number },
            ) => {
              const sourceEntryId = row.overlay_id ?? row.id;
              try {
                setError("");
                await moveLineupEntry(context!.workspace.id, {
                  source_entry_id: sourceEntryId,
                  target_location_id: location.id,
                  target_date: date,
                  target_section_id: target.sectionId,
                  display_order: target.displayOrder,
                });
                await refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Line-up row could not be moved");
              }
            }}
            onAdd={() => setStaffFor(location)}
            onDelete={async (row: ScheduleLineupEntry) => {
              if (!row.overlay_id || !row.revision) return;
              await deleteLineupEntry(
                context!.workspace.id,
                row.overlay_id,
                row.revision,
              );
              await refresh();
            }}
            onBrief={async (
              typeId: string,
              revision: number | null,
              brief: Pick<
                ScheduleLineupBrief,
                "out_of_stock" | "specials" | "pre_shift_notes"
              >,
            ) => {
              await saveLineupBrief(
                context!.workspace.id,
                location.id,
                date,
                typeId,
                revision,
                brief,
              );
              await refresh();
            }}
          />
        ))}
      </div>
      {staffFor ? (
        <StaffDrawer
          location={staffFor}
          model={model}
          onClose={() => setStaffFor(null)}
          onAdd={async (employee: ScheduleLineupEmployeeOption) => {
            const presence = employee.presences.find(
              (p) => p.location_id === staffFor.id,
            );
            const jobId = employee.job_ids[0] ?? model.jobs[0]?.id ?? null;
            await saveLineupEntry(
              context!.workspace.id,
              staffFor.id,
              date,
              {
                source_shift_id: null,
                employee_id: employee.id,
                job_id: jobId,
                shift_type_id: model.shift_types[0]?.id ?? null,
                start_time:
                  presence?.start_time ??
                  model.shift_types[0]?.default_start_time ??
                  null,
                end_time:
                  presence?.end_time ??
                  model.shift_types[0]?.default_end_time ??
                  null,
                section_id: model.sections[0]?.id ?? null,
                station: "",
                call_off: false,
                hidden: false,
                display_order: staffFor.entries.length + 1,
              },
              null,
              null,
            );
            setStaffFor(null);
            await refresh();
          }}
        />
      ) : null}
      {sectionsOpen ? (
        <SectionsDialog
          sections={model.sections}
          onClose={() => setSectionsOpen(false)}
          onSave={async (sectionId, revision, section) => {
            const saved = await saveLineupSection(
              context!.workspace.id,
              section,
              sectionId,
              revision,
            );
            await refresh();
            return saved;
          }}
          onArchive={async (sectionId, revision) => {
            await archiveLineupSection(
              context!.workspace.id,
              sectionId,
              revision,
            );
            await refresh();
          }}
        />
      ) : null}
      {share ? (
        <ShareDialog
          preview={share}
          model={model}
          shareText={buildLineupShareText(model)}
          onClose={() => setShare(null)}
          onConfirm={async () => {
            await shareLineup(
              context!.workspace.id,
              date,
              share.locations.map((l) => l.location_id),
              share.fingerprint,
            );
            setShare(null);
            await refresh();
          }}
        />
      ) : null}
    </section>
  );
}

interface LocationBandProps {
  location: ScheduleLineupLocation;
  model: ScheduleLineupReadModel;
  allEntries: readonly ScheduleLineupEntry[];
  canManage: boolean;
  onSave: (
    row: ScheduleLineupEntry,
    patch: Partial<ScheduleLineupEntryInput>,
  ) => Promise<void>;
  onMove: (
    row: ScheduleLineupEntry,
    target: { sectionId: string | null; displayOrder: number },
  ) => Promise<void>;
  onAdd: () => void;
  onDelete: (row: ScheduleLineupEntry) => Promise<void>;
  onBrief: (
    typeId: string,
    revision: number | null,
    brief: BriefValue,
  ) => Promise<void>;
}
function LocationBand({
  location,
  model,
  allEntries,
  canManage,
  onSave,
  onMove,
  onAdd,
  onDelete,
  onBrief,
}: LocationBandProps) {
  const [briefType, setBriefType] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const groups = useMemo(
    () =>
      model.shift_types
        .map((type) => ({
          type,
          rows: location.entries.filter(
            (row) => row.shift_type_id === type.id && !row.hidden,
          ),
        }))
        .filter((group) => group.rows.length),
    [location.entries, model.shift_types],
  );
  return (
    <article className="lineup-location">
      <header>
        <div>
          <h2>{location.name}</h2>
          <span>
            {location.summary.active_entries} staff ·{" "}
            {location.summary.open_rows} open · {location.summary.called_off}{" "}
            called off
          </span>
        </div>
        <div className="lineup-location-actions">
          {canManage ? (
            <button className="nf-button secondary" onClick={onAdd}>
              <UserPlus size={16} /> Add staff
            </button>
          ) : null}
          <button
            className="icon-button"
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${location.name}`}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronDown size={17} />
          </button>
        </div>
      </header>
      {!collapsed && groups.length ? (
        groups.map(({ type, rows }) => (
          <details className="lineup-service" key={type.id} open>
            <summary className="lineup-service-heading">
              <div>
                <i style={{ background: type.color }} />
                <h3>{type.name}</h3>
                <span>{rows.length}</span>
              </div>
              <button
                className="icon-button"
                aria-label={`Edit ${type.name} brief`}
                onClick={() => setBriefType(type.id)}
              >
                <ClipboardList size={17} />
              </button>
            </summary>
            <div className="lineup-table" role="table">
              <div className="lineup-row lineup-labels" role="row">
                <span>Staff</span>
                <span>Position</span>
                <span>Station</span>
                <span>Time</span>
                <span>Status</span>
                <span />
              </div>
              {rows.map((row, index) => (
                <div
                  className="lineup-row"
                  role="row"
                  key={row.id}
                  draggable={canManage}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/lineup-row", row.id)
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/lineup-row");
                    const source = allEntries.find(
                      (candidate) => candidate.id === id,
                    );
                    if (source)
                      void onMove(source, {
                        sectionId: row.section_id,
                        displayOrder: row.display_order,
                      });
                  }}
                >
                  <span className="lineup-person">
                    <GripVertical size={15} />
                    <span>
                      <strong>{row.employee_name || "Open row"}</strong>
                      {row.orphaned ? <small>Source removed</small> : null}
                    </span>
                  </span>
                  <select
                    aria-label={`Position for ${row.employee_name || "open row"}`}
                    value={row.job_id ?? ""}
                    disabled={!canManage}
                    onChange={(e) =>
                      void onSave(row, { job_id: e.target.value || null })
                    }
                  >
                    {model.jobs.map((job) => (
                      <option value={job.id} key={job.id}>
                        {job.name}
                      </option>
                    ))}
                  </select>
                  <div className="lineup-station-cell">
                    <select
                      aria-label={`Section for ${row.employee_name || "open row"}`}
                      value={row.section_id ?? ""}
                      disabled={!canManage}
                      onChange={(event) =>
                        void onSave(row, {
                          section_id: event.target.value || null,
                        })
                      }
                    >
                      <option value="">No section</option>
                      {model.sections.map((section) => (
                        <option value={section.id} key={section.id}>
                          {section.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Station for ${row.employee_name || "open row"}`}
                      defaultValue={row.station}
                      disabled={!canManage}
                      placeholder="Station label"
                      onBlur={(event) =>
                        event.target.value !== row.station
                          ? void onSave(row, { station: event.target.value })
                          : undefined
                      }
                    />
                  </div>
                  <span>
                    {row.start_time ?? "--:--"}–{row.end_time ?? "--:--"}
                  </span>
                  <label className="lineup-calloff">
                    <input
                      type="checkbox"
                      checked={row.call_off}
                      disabled={!canManage}
                      onChange={(e) =>
                        void onSave(row, { call_off: e.target.checked })
                      }
                    />{" "}
                    Called off
                  </label>
                  {canManage ? (
                    <span className="lineup-row-actions">
                      <button
                        className="icon-button"
                        aria-label="Move up"
                        disabled={!index}
                        onClick={() =>
                          void onSave(row, {
                            display_order: Math.max(0, row.display_order - 1),
                          })
                        }
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Move down"
                        disabled={index === rows.length - 1}
                        onClick={() =>
                          void onSave(row, {
                            display_order: row.display_order + 1,
                          })
                        }
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Remove row"
                        onClick={() => void onDelete(row)}
                      >
                        <X size={15} />
                      </button>
                    </span>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          </details>
        ))
      ) : !collapsed ? (
        <div className="lineup-empty">
          <p>No published shifts for this day.</p>
          {canManage ? (
            <button className="nf-button secondary" onClick={onAdd}>
              <Plus size={16} /> Add manual row
            </button>
          ) : null}
        </div>
      ) : null}
      {briefType ? (
        <BriefDialog
          typeName={
            model.shift_types.find((type) => type.id === briefType)?.name ??
            "Service"
          }
          brief={location.briefs.find(
            (brief) => brief.shift_type_id === briefType,
          )}
          onClose={() => setBriefType(null)}
          onSave={async (value) => {
            await onBrief(
              briefType,
              location.briefs.find((brief) => brief.shift_type_id === briefType)
                ?.revision ?? null,
              value,
            );
            setBriefType(null);
          }}
        />
      ) : null}
    </article>
  );
}

function StaffDrawer({
  location,
  model,
  onClose,
  onAdd,
}: {
  location: ScheduleLineupLocation;
  model: ScheduleLineupReadModel;
  onClose: () => void;
  onAdd: (employee: ScheduleLineupEmployeeOption) => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const groups = [
    {
      name: "Off today",
      items: model.employees.filter((employee) => !employee.presences.length),
    },
    {
      name: "Working elsewhere",
      items: model.employees.filter(
        (employee) =>
          employee.presences.length &&
          !employee.presences.some(
            (presence) => presence.location_id === location.id,
          ),
      ),
    },
    {
      name: "Already scheduled here",
      items: model.employees.filter((employee) =>
        employee.presences.some(
          (presence) => presence.location_id === location.id,
        ),
      ),
    },
  ];
  return (
    <div className="lineup-dialog-layer">
      <button
        className="lineup-backdrop"
        aria-label="Close staff picker"
        onClick={onClose}
      />
      <aside className="lineup-drawer" role="dialog" aria-label="Add staff">
        <header>
          <div>
            <h2>Add staff</h2>
            <span>{location.name}</span>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <input
          className="lineup-search"
          placeholder="Search staff"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {groups.map((group) => (
          <section key={group.name}>
            <h3>
              {group.name}
              <span>{group.items.length}</span>
            </h3>
            {group.items
              .filter((employee) =>
                employee.display_name
                  .toLowerCase()
                  .includes(term.toLowerCase()),
              )
              .map((employee) => (
                <button
                  className="lineup-staff"
                  key={employee.id}
                  onClick={() => void onAdd(employee)}
                >
                  <span className="lineup-avatar">
                    {employee.display_name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span>
                    <strong>{employee.display_name}</strong>
                    <small>
                      {employee.presences
                        .map(
                          (presence) =>
                            `${presence.location_name} ${presence.start_time}`,
                        )
                        .join(" · ") || "No scheduled shift"}
                    </small>
                  </span>
                  <Plus size={17} />
                </button>
              ))}
          </section>
        ))}
      </aside>
    </div>
  );
}
type BriefValue = Pick<
  ScheduleLineupBrief,
  "out_of_stock" | "specials" | "pre_shift_notes"
>;
function BriefDialog({
  typeName,
  brief,
  onClose,
  onSave,
}: {
  typeName: string;
  brief: ScheduleLineupBrief | undefined;
  onClose: () => void;
  onSave: (value: BriefValue) => Promise<void>;
}) {
  const [value, setValue] = useState<BriefValue>({
    out_of_stock: brief?.out_of_stock ?? "",
    specials: brief?.specials ?? "",
    pre_shift_notes: brief?.pre_shift_notes ?? "",
  });
  return (
    <Dialog title={`${typeName} brief`} onClose={onClose}>
      <label>
        86 / out of stock
        <textarea
          value={value.out_of_stock}
          onChange={(e) => setValue({ ...value, out_of_stock: e.target.value })}
        />
      </label>
      <label>
        Specials
        <textarea
          value={value.specials}
          onChange={(e) => setValue({ ...value, specials: e.target.value })}
        />
      </label>
      <label>
        Pre-shift notes
        <textarea
          value={value.pre_shift_notes}
          onChange={(e) =>
            setValue({ ...value, pre_shift_notes: e.target.value })
          }
        />
      </label>
      <button className="nf-button" onClick={() => void onSave(value)}>
        Save brief
      </button>
    </Dialog>
  );
}
function ShareDialog({
  preview,
  model,
  shareText,
  onClose,
  onConfirm,
}: {
  preview: ScheduleLineupSharePreview;
  model: ScheduleLineupReadModel;
  shareText: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const visualRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("");
  const fileBase =
    `lineup-${model.date}-${preview.locations.length === 1 ? preview.locations[0]!.location_name : `${preview.locations.length}-locations`}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/(^-|-$)/g, "") || "lineup";
  async function copyShareText() {
    try {
      setStatus("");
      if (!navigator.clipboard?.writeText) {
        throw new Error("Text clipboard is not supported in this browser.");
      }
      await navigator.clipboard.writeText(shareText);
      setStatus("Share text copied.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Share text could not be copied.",
      );
    }
  }
  async function runImageExport(
    kind: "copy" | "png" | "pdf" | "share",
  ): Promise<void> {
    try {
      setStatus("");
      if (!visualRef.current) throw new Error("Line-up image is not ready.");
      if (kind === "copy") {
        await copyLineupPng(visualRef.current);
        setStatus("Line-up image copied.");
        return;
      }
      if (kind === "png") {
        await downloadLineupPng(visualRef.current, `${fileBase}.png`);
        setStatus("PNG exported.");
        return;
      }
      if (kind === "pdf") {
        await downloadLineupPdf(visualRef.current, `${fileBase}.pdf`);
        setStatus("PDF exported.");
        return;
      }
      const nativeShared = await shareLineupPng(
        visualRef.current,
        `${fileBase}.png`,
        shareText,
      );
      setStatus(nativeShared ? "Line-up image shared." : "Image downloaded.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Line-up image export failed.",
      );
    }
  }
  return (
    <Dialog title="Share Line-up" onClose={onClose}>
      <p className="lineup-share-summary">
        Review the immutable version that will be created.
      </p>
      {preview.locations.map((l) => (
        <div className="lineup-share-row" key={l.location_id}>
          <strong>{l.location_name}</strong>
          <span>{l.entry_count} rows</span>
          <small>
            +{l.added} · ~{l.updated} · -{l.removed}
          </small>
        </div>
      ))}
      <div
        className="lineup-share-visual-actions"
        aria-label="Line-up image actions"
      >
        <button
          className="icon-button"
          type="button"
          aria-label="Copy Line-up image"
          title="Copy Line-up image"
          onClick={() => void runImageExport("copy")}
        >
          <Copy size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Share Line-up image"
          title="Share Line-up image"
          onClick={() => void runImageExport("share")}
        >
          <Share2 size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Download Line-up PNG"
          title="Download Line-up PNG"
          onClick={() => void runImageExport("png")}
        >
          <ImageDown size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Download Line-up PDF"
          title="Download Line-up PDF"
          onClick={() => void runImageExport("pdf")}
        >
          <FileDown size={16} />
        </button>
      </div>
      <LineupVisualPreview model={model} ref={visualRef} />
      <label className="lineup-share-text">
        Share text
        <textarea readOnly value={shareText} />
      </label>
      <button
        className="nf-button secondary"
        type="button"
        onClick={() => void copyShareText()}
      >
        <Copy size={16} /> Copy share text
      </button>
      {status ? (
        <p className="lineup-section-message" role="status">
          {status}
        </p>
      ) : null}
      <button className="nf-button" onClick={() => void onConfirm()}>
        <Send size={16} /> Create share version
      </button>
    </Dialog>
  );
}

function LineupVisualPreview({
  model,
  ref,
}: {
  model: ScheduleLineupReadModel;
  ref: Ref<HTMLDivElement>;
}) {
  return (
    <div className="lineup-visual-preview" ref={ref}>
      {model.locations.map((location) => (
        <section key={location.id}>
          <header>
            <div>
              <strong>{location.name}</strong>
              <span>{formatLineupShareDate(model.date)}</span>
            </div>
            <small>Line-up</small>
          </header>
          {model.shift_types.map((shiftType) => {
            const entries = location.entries
              .filter(
                (entry) =>
                  entry.shift_type_id === shiftType.id &&
                  entry.employee_id &&
                  !entry.call_off &&
                  !entry.hidden,
              )
              .sort(
                (left, right) =>
                  left.display_order - right.display_order ||
                  (left.start_time ?? "").localeCompare(right.start_time ?? ""),
              );
            const brief = location.briefs.find(
              (item) => item.shift_type_id === shiftType.id,
            );
            if (!entries.length && !brief) return null;
            return (
              <div className="lineup-visual-service" key={shiftType.id}>
                <h3>
                  <i style={{ backgroundColor: shiftType.color }} />
                  {shiftType.name}
                </h3>
                {brief ? (
                  <dl>
                    {brief.out_of_stock.trim() ? (
                      <div>
                        <dt>86</dt>
                        <dd>{brief.out_of_stock}</dd>
                      </div>
                    ) : null}
                    {brief.specials.trim() ? (
                      <div>
                        <dt>Specials</dt>
                        <dd>{brief.specials}</dd>
                      </div>
                    ) : null}
                    {brief.pre_shift_notes.trim() ? (
                      <div>
                        <dt>Pre-shift</dt>
                        <dd>{brief.pre_shift_notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                <div className="lineup-visual-table">
                  {entries.map((entry) => (
                    <div key={entry.id}>
                      <span>{entry.start_time ?? ""}</span>
                      <strong>{entry.employee_name}</strong>
                      <span>{entry.job_name}</span>
                      <span>
                        {[entry.section_name, entry.station]
                          .map((part) => part.trim())
                          .filter(Boolean)
                          .join(" - ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

interface SectionDraft extends ScheduleLineupSectionInput {
  id: string | null;
  revision: number | null;
}
function SectionsDialog({
  sections,
  onClose,
  onSave,
  onArchive,
}: {
  sections: ScheduleLineupSection[];
  onClose: () => void;
  onSave: (
    id: string | null,
    revision: number | null,
    value: ScheduleLineupSectionInput,
  ) => Promise<ScheduleLineupSection>;
  onArchive: (id: string, revision: number) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<SectionDraft[]>(
    sections.map((section) => ({
      id: section.id,
      revision: section.revision,
      name: section.name,
      color: section.color,
      sort_order: section.sort_order,
    })),
  );
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: () => Promise<void>) {
    try {
      setBusy(true);
      setMessage("");
      await action();
      setMessage("Sections updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Section update failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Manage sections" onClose={onClose}>
      <div className="lineup-section-editor">
        {drafts.map((draft, index) => (
          <div className="lineup-section-row" key={draft.id ?? `new-${index}`}>
            <input
              type="color"
              aria-label={`Color for ${draft.name || "new section"}`}
              value={draft.color}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, color: event.target.value } : item,
                  ),
                )
              }
            />
            <input
              aria-label={`Section name ${index + 1}`}
              value={draft.name}
              placeholder="Section name"
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
            />
            <input
              type="number"
              min="0"
              aria-label={`Sort order for ${draft.name || "new section"}`}
              value={draft.sort_order}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((item, i) =>
                    i === index
                      ? { ...item, sort_order: Number(event.target.value) }
                      : item,
                  ),
                )
              }
            />
            <button
              className="icon-button"
              aria-label={`Save ${draft.name || "section"}`}
              disabled={busy || !draft.name.trim()}
              onClick={() =>
                void run(async () => {
                  const saved = await onSave(draft.id, draft.revision, {
                    name: draft.name.trim(),
                    color: draft.color,
                    sort_order: draft.sort_order,
                  });
                  setDrafts((current) =>
                    current.map((item, i) =>
                      i === index
                        ? {
                            id: saved.id,
                            revision: saved.revision,
                            name: saved.name,
                            color: saved.color,
                            sort_order: saved.sort_order,
                          }
                        : item,
                    ),
                  );
                })
              }
            >
              <Save size={16} />
            </button>
            {draft.id ? (
              <button
                className={`icon-button ${confirmArchive === draft.id ? "danger" : ""}`}
                aria-label={
                  confirmArchive === draft.id
                    ? `Confirm archive ${draft.name}`
                    : `Archive ${draft.name}`
                }
                disabled={busy}
                onClick={() =>
                  confirmArchive === draft.id
                    ? void run(async () => {
                        await onArchive(draft.id!, draft.revision!);
                        setDrafts((current) =>
                          current.filter((item) => item.id !== draft.id),
                        );
                        setConfirmArchive(null);
                      })
                    : setConfirmArchive(draft.id)
                }
              >
                <Trash2 size={16} />
              </button>
            ) : (
              <button
                className="icon-button"
                aria-label="Remove unsaved section"
                onClick={() =>
                  setDrafts((current) => current.filter((_, i) => i !== index))
                }
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        <button
          className="nf-button secondary"
          disabled={busy}
          onClick={() =>
            setDrafts((current) => [
              ...current,
              {
                id: null,
                revision: null,
                name: "",
                color: "#397A68",
                sort_order: (current.length + 1) * 10,
              },
            ])
          }
        >
          <Plus size={16} /> Add section
        </button>
        {message ? (
          <p className="lineup-section-message" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="lineup-dialog-layer">
      <button
        className="lineup-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="lineup-dialog" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function State({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <section className="lineup-state" role={error ? "alert" : "status"}>
      {text}
    </section>
  );
}
export default LineupPage;
