import { LineupPlacements } from "./LineupPlacements";
import { SectionPlanDialog } from "./LineupSectionPlan";
import { entryInput } from "./lineup-helpers";
import { LineupQueue } from "./LineupQueue";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  Send,
  Settings2,
  Users,
  UserPlus,
  Undo2,
} from "lucide-react";
import type {
  ScheduleLineupEntry,
  ScheduleLineupReadModel,
  ScheduleLineupSharePreview,
} from "@newfork/shared";
import { useAuth } from "../../auth/AuthContext";
import {
  archiveLineupSection,
  getLineup,
  getLineupSharedExport,
  getLineupOperations,
  previewLineupShare,
  saveLineupBrief,
  saveLineupEntry,
  saveLineupSection,
  shareLineup,
  retryLineupNotifications,
  remindLineupRecipients,
} from "../lineup-data";
import { buildLineupShareText } from "../lineup-share";
import { LineupBoard, lineupCounts } from "./LineupBoard";
import { BriefDialog, SectionsDialog, ShareDialog } from "./LineupDialogs";
import { LineupEditor } from "./LineupEditor";
import { LineupNotes } from "./LineupNotes";
import { LineupDialog } from "./LineupDialog";
import "./lineup.css";

export function LineupWorkspace() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const [initialDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(search.get("date") ?? "")
    ? search.get("date")!
    : initialDate;
  const locationId = search.get("location") ?? "";
  function setLocationId(id: string) {
    setSearch(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set("location", id);
        return next;
      },
      { replace: true },
    );
  }
  const [service, setService] = useState("");
  const [view, setView] = useState<"sections" | "list">("sections");
  const [term, setTerm] = useState("");
  const [position, setPosition] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [placements, setPlacements] = useState<string[] | null>(null);
  const [setupSection, setSetupSection] = useState<string | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [mobileBriefOpen, setMobileBriefOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [reminderStatus, setReminderStatus] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editor, setEditor] = useState<{
    row: ScheduleLineupEntry | null;
    placement?: Pick<
      ScheduleLineupEntry,
      "start_time" | "end_time" | "section_id" | "station"
    >;
    sectionId: string | null;
    mode: "edit" | "extra" | "assign" | "replace";
  } | null>(null);
  const [share, setShare] = useState<{
    published?: boolean;
    serviceIds?: string[];
    preview: ScheduleLineupSharePreview;
    model: ScheduleLineupReadModel;
  } | null>(null);
  const [undo, setUndo] = useState<{
    row: ScheduleLineupEntry;
    entryId: string;
    revision: number;
    locationId: string;
  } | null>(null);
  const workspaceId = context?.workspace.id ?? "";
  const query = useQuery({
    queryKey: ["lineup", workspaceId, date],
    queryFn: () => getLineup(workspaceId, date),
    enabled: Boolean(workspaceId),
  });
  const model = query.data;
  const location =
    model?.locations.find((item) => item.id === locationId) ??
    model?.locations[0];
  useEffect(() => {
    if (!search.get("date") && location) {
      setSearch(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set(
            "date",
            new Date().toLocaleDateString("en-CA", {
              timeZone: location.timezone,
            }),
          );
          return next;
        },
        { replace: true },
      );
    }
  }, [location, search, setSearch]);
  const operations = useQuery({
    queryKey: ["lineup-operations", workspaceId, date, location?.id],
    queryFn: () => getLineupOperations(workspaceId, date, location!.id),
    enabled: Boolean(location),
    refetchInterval: 60_000,
  });
  const canManage =
    Boolean(context?.permissions.includes("schedule.lineup.manage")) &&
    operations.data?.read_only !== true;
  const canShare =
    Boolean(context?.permissions.includes("schedule.lineup.share")) &&
    operations.data?.read_only !== true;
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["lineup"] }),
      client.invalidateQueries({ queryKey: ["lineup-operations"] }),
      client.invalidateQueries({ queryKey: ["lineup-proposals"] }),
      client.invalidateQueries({ queryKey: ["employee-hub"] }),
      client.invalidateQueries({ queryKey: ["employee-lineup"] }),
      client.invalidateQueries({ queryKey: ["schedule"] }),
    ]);
  }
  async function action(fn: () => Promise<void>) {
    setError("");
    setPending(true);
    try {
      await fn();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Your change could not be saved. Try again.",
      );
    } finally {
      setPending(false);
    }
  }
  function setDate(next: string) {
    setSearch((previous) => {
      previous.set("date", next);
      return previous;
    });
    setUndo(null);
  }
  function moveDate(days: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDate(next.toLocaleDateString("en-CA"));
  }
  if (!model)
    return (
      <section
        className="lu-workspace lu-loading"
        role={query.error ? "alert" : "status"}
      >
        <ClipboardList size={30} />
        <h1>
          {query.error ? "Line Up could not load" : "Preparing your Line Up…"}
        </h1>
        {query.error ? (
          <>
            <p>{query.error.message}</p>
            <button className="nf-button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </>
        ) : (
          <p>Gathering the published schedule for your team.</p>
        )}
      </section>
    );
  const rows = (location?.entries ?? []).filter(
    (row) => !row.hidden && (!service || row.shift_type_id === service),
  );
  const counts = lineupCounts(rows);
  const filtered = rows.filter(
    (row) =>
      (!position || row.job_id === position) &&
      (!term ||
        `${row.employee_name} ${row.job_name} ${row.station}`
          .toLowerCase()
          .includes(term.toLowerCase())) &&
      (filter === "all" ||
        (filter === "open" && (!row.employee_id || row.call_off)) ||
        (filter === "unassigned" &&
          (row.placement_segments?.length
            ? row.placement_segments.some((segment) => !segment.section_id)
            : !row.section_id) &&
          Boolean(row.employee_id)) ||
        (filter === "review" && (row.orphaned || row.source_changed)) ||
        (filter === "now" &&
          Boolean(operations.data?.active_entry_ids?.includes(row.id)))),
  );
  const receipts = operations.data?.receipts ?? [];
  const awaiting = receipts.filter(
    (receipt) => !receipt.acknowledged_at,
  ).length;
  const selectedService = model.shift_types.find((type) => type.id === service);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: location?.timezone ?? "UTC",
  });
  const scopedModel = { ...model, locations: location ? [location] : [] };
  const notesPanel = location ? (
    <LineupNotes
      workspaceId={workspaceId}
      date={date}
      location={location}
      serviceId={service || null}
      model={model}
      state={operations.data}
      error={operations.error?.message}
      canManage={canManage}
      refresh={refresh}
      onBrief={() => setBriefOpen(true)}
    />
  ) : null;
  return (
    <section className="lu-workspace" aria-labelledby="lineup-title">
      <header className="lu-header">
        <div>
          <span className="lu-eyebrow">YOUR TEAM. READY FOR SERVICE.</span>
          <h1 id="lineup-title" tabIndex={-1}>
            Line Up<span className="lu-title-dot">.</span>
          </h1>
          <p>A clear plan for every person, every section.</p>
        </div>
        <div className="lu-header-actions">
          {canManage ? (
            <button
              className="nf-button secondary"
              disabled={operations.data?.can_manage_sections === false}
              title={
                operations.data?.can_manage_sections === false
                  ? "Section definitions affect every location. An administrator can update them; daily section setup is available below."
                  : undefined
              }
              onClick={() => setSectionsOpen(true)}
            >
              <Settings2 size={16} /> Sections
            </button>
          ) : null}
          {canShare ? (
            <button
              className="nf-button lu-primary"
              disabled={!location || pending}
              onClick={() =>
                void action(async () => {
                  const serviceIds = service ? [service] : undefined;
                  const preview = await previewLineupShare(
                    workspaceId,
                    date,
                    [location!.id],
                    serviceIds,
                  );
                  setShare({
                    preview,
                    model: preview.content ?? scopedModel,
                    serviceIds,
                  });
                })
              }
            >
              <Send size={16} />{" "}
              {service
                ? `Share ${selectedService?.name ?? "service"}`
                : "Share Line Up"}
            </button>
          ) : null}
        </div>
      </header>
      <div className="lu-context">
        <label className="lu-location-select">
          <MapPin size={17} />
          <select
            aria-label="Location"
            value={location?.id ?? ""}
            onChange={(event) => {
              setLocationId(event.target.value);
              setUndo(null);
            }}
          >
            {model.locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="lu-date">
          <button aria-label="Previous day" onClick={() => moveDate(-1)}>
            <ChevronLeft size={18} />
          </button>
          <label>
            <span>
              {new Intl.DateTimeFormat("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(new Date(`${date}T12:00:00`))}
            </span>
            <input
              aria-label="Line Up date"
              type="date"
              value={date}
              onChange={(event) =>
                event.target.value && setDate(event.target.value)
              }
            />
          </label>
          <button aria-label="Next day" onClick={() => moveDate(1)}>
            <ChevronRight size={18} />
          </button>
          <button className="lu-today" onClick={() => setDate(today)}>
            Today
          </button>
        </div>
        <span className="lu-source">
          <Check size={14} />{" "}
          {operations.data?.source_current === false
            ? "Schedule not published"
            : "Published Schedule"}
        </span>
      </div>
      <div className="lu-servicebar">
        <div className="lu-service-tabs" aria-label="Service">
          <button aria-pressed={!service} onClick={() => setService("")}>
            All day
          </button>
          {model.shift_types.map((type) => (
            <button
              key={type.id}
              aria-pressed={service === type.id}
              onClick={() => setService(type.id)}
            >
              {type.name}
            </button>
          ))}
        </div>
        <span className="lu-share-state">
          {location?.share_version
            ? `Shared · v${location.share_version}`
            : "Not shared yet"}
          {operations.data?.unpublished_changes ? (
            <span className="lu-unsaved-dot">Unshared changes</span>
          ) : null}
        </span>
      </div>
      {error ? (
        <div role="alert" className="lu-error">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      ) : null}
      {query.isError ? (
        <p className="lu-error" role="alert">
          Connection interrupted. The displayed plan may be out of date.
        </p>
      ) : null}
      {undo ? (
        <div className="lu-undo" role="status">
          <Check size={16} /> Assignment saved
          <button
            disabled={pending}
            onClick={() =>
              void action(async () => {
                await saveLineupEntry(
                  workspaceId,
                  undo.locationId,
                  date,
                  entryInput(undo.row),
                  undo.entryId,
                  undo.revision,
                );
                setUndo(null);
                await refresh();
              })
            }
          >
            <Undo2 size={15} /> Undo
          </button>
        </div>
      ) : null}
      <div className="lu-overview">
        <div className="lu-metrics">
          <button
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            <span className="lu-metric-icon">
              <Users size={19} />
            </span>
            <strong>{counts.people}</strong>
            <span>Team members</span>
          </button>
          <button
            className={counts.open ? "needs-attention" : ""}
            aria-pressed={filter === "open"}
            onClick={() => setFilter(filter === "open" ? "all" : "open")}
          >
            <strong>{counts.open.toString().padStart(2, "0")}</strong>
            <span>Open positions</span>
          </button>
          <button
            aria-pressed={filter === "unassigned"}
            onClick={() =>
              setFilter(filter === "unassigned" ? "all" : "unassigned")
            }
          >
            <strong>{counts.unassigned.toString().padStart(2, "0")}</strong>
            <span>Unassigned</span>
          </button>
          <button
            onClick={() => {
              setReminderStatus("");
              setError("");
              setReceiptsOpen(true);
            }}
          >
            <strong>
              {operations.data ? awaiting.toString().padStart(2, "0") : "—"}
            </strong>
            <span>Awaiting read</span>
          </button>
        </div>
        {canManage && location ? (
          <div className="lu-add-actions">
            <button
              className="nf-button secondary"
              onClick={() =>
                setEditor({ row: null, sectionId: null, mode: "extra" })
              }
            >
              <Plus size={16} /> Extra line
            </button>
            <button
              className="nf-button lu-dark"
              onClick={() =>
                setEditor({ row: null, sectionId: null, mode: "assign" })
              }
            >
              <UserPlus size={16} /> Add staff
            </button>
          </div>
        ) : null}
      </div>
      {operations.data?.read_only ? (
        <p className="lu-error" role="status">
          Line Up is read-only at this location. Your plan and shared history
          remain available.
        </p>
      ) : null}
      {operations.data?.source_current === false ? (
        <p className="lu-review-banner">
          Schedule is not published for this day. Previous shares remain
          historical.{" "}
          <Link to={`/app/schedule?date=${date}`}>Open Schedule →</Link>
        </p>
      ) : null}
      {counts.review ? (
        <button
          className="lu-review-banner"
          onClick={() => setFilter("review")}
        >
          <AlertCircle size={16} /> {counts.review} assignments need review
          after a Schedule change <span>Review →</span>
        </button>
      ) : null}
      <div className="lu-toolbar">
        <div className="lu-view-switch" aria-label="View">
          <button
            aria-pressed={view === "sections"}
            onClick={() => setView("sections")}
          >
            <LayoutGrid size={15} /> Sections
          </button>
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={17} /> Staff list
          </button>
          <button
            className="lu-mobile-brief"
            onClick={() => setMobileBriefOpen(true)}
          >
            <ClipboardList size={15} /> Daily brief
          </button>
        </div>
        <div className="lu-filters">
          {canManage && rows.length ? (
            <button
              className="nf-button secondary"
              onClick={() => setPlacements([])}
            >
              Place team
            </button>
          ) : null}
          <button
            className="lu-now"
            aria-pressed={filter === "now"}
            disabled={!operations.data?.server_time || operations.isError}
            onClick={() => setFilter(filter === "now" ? "all" : "now")}
          >
            Scheduled now
          </button>
          <select
            aria-label="Position filter"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          >
            <option value="">All positions</option>
            {model.jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
          </select>
          <label className="lu-search">
            <Search size={16} />
            <input
              aria-label="Search team"
              placeholder="Search team…"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="lu-layout">
        <main>
          {filter === "now" && operations.data?.server_time ? (
            <p className="lu-field-help">
              Planned assignments · checked{" "}
              {new Date(operations.data.server_time).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
              . Attendance is not included.
            </p>
          ) : null}
          {!rows.length ? (
            <div className="lu-day-empty">
              <ClipboardList size={25} />
              <div>
                <h2>
                  {service
                    ? `No ${selectedService?.name ?? "service"} assignments yet`
                    : "Your day starts here"}
                </h2>
                <p>
                  Published shifts appear here automatically. Add an extra line
                  to plan additional coverage.
                </p>
                <Link to={`/app/schedule?date=${date}`}>
                  Open Schedule <span>↗</span>
                </Link>
              </div>
            </div>
          ) : null}
          <LineupBoard
            locationId={location?.id}
            serviceId={service || null}
            model={model}
            rows={filtered}
            activeAt={
              filter === "now" ? operations.data?.server_time : undefined
            }
            onlyUnassigned={filter === "unassigned"}
            view={view}
            canManage={canManage}
            plans={model.sections.flatMap((section) => {
              const all =
                operations.data?.section_plans?.filter(
                  (plan) => plan.section_id === section.id,
                ) ?? [];
              const chosen =
                all.find((plan) => plan.shift_type_id === (service || null)) ??
                all.find((plan) => !plan.shift_type_id);
              return chosen ? [chosen] : [];
            })}
            onSetup={setSetupSection}
            onEdit={(row, mode, placement) =>
              setEditor({
                row,
                placement,
                sectionId: placement ? placement.section_id : row.section_id,
                mode: mode ?? "edit",
              })
            }
            onAdd={(sectionId) =>
              setEditor({ row: null, sectionId, mode: "extra" })
            }
          />
        </main>
        {location ? (
          <aside className="lu-sidebar">
            {notesPanel}
            {canManage ? (
              <LineupQueue
                workspaceId={workspaceId}
                date={date}
                locationId={location.id}
                refresh={refresh}
              />
            ) : null}
            <div className="lu-sharing-card">
              <span className="lu-eyebrow">KEEP EVERYONE IN SYNC</span>
              <h3>
                {location.share_version
                  ? `Shared version ${location.share_version}`
                  : "Ready when you are"}
              </h3>
              <p>
                {location.share_version
                  ? "Track who has opened and acknowledged the shared plan."
                  : "Share the plan when your team assignments and brief are ready."}
              </p>
              {Boolean(operations.data?.unreachable_recipients) ? (
                <p>
                  {operations.data?.unreachable_recipients} team members need an
                  active account to receive and acknowledge this plan.
                </p>
              ) : null}
              {Boolean(operations.data?.pending_notifications) && canShare ? (
                <button
                  disabled={pending}
                  onClick={() =>
                    void action(async () => {
                      await retryLineupNotifications(
                        workspaceId,
                        date,
                        location.id,
                      );
                      await refresh();
                    })
                  }
                >
                  {operations.data?.pending_notifications} notifications pending
                  · Retry
                </button>
              ) : null}
              <button
                onClick={() => {
                  setReminderStatus("");
                  setError("");
                  setReceiptsOpen(true);
                }}
              >
                View acknowledgements <span>↗</span>
              </button>
              {canShare && location.share_version > 0 ? (
                <button
                  disabled={pending}
                  onClick={() =>
                    void action(async () => {
                      const snapshot = await getLineupSharedExport(
                        workspaceId,
                        date,
                        location.id,
                      );
                      setShare({
                        model: snapshot,
                        published: true,
                        preview: {
                          status: "share_ready",
                          workspace_id: workspaceId,
                          date,
                          fingerprint: "0".repeat(64),
                          locations: snapshot.locations.map((item) => ({
                            location_id: item.id,
                            location_name: item.name,
                            current_version: item.share_version,
                            entry_count: item.entries.length,
                            added: 0,
                            updated: 0,
                            removed: 0,
                          })),
                        },
                      });
                    })
                  }
                >
                  Export shared v{location.share_version} <span>↗</span>
                </button>
              ) : null}
              <button onClick={() => setHistoryOpen(true)}>
                Recent changes <span>↗</span>
              </button>
            </div>
          </aside>
        ) : null}
      </div>
      {mobileBriefOpen ? (
        <LineupDialog
          title="Daily brief"
          onClose={() => setMobileBriefOpen(false)}
        >
          {notesPanel}
        </LineupDialog>
      ) : null}
      {placements && location ? (
        <LineupPlacements
          key={`${date}:${location.id}`}
          workspaceId={workspaceId}
          date={date}
          location={location}
          model={model}
          rows={rows.filter((row) => !row.hidden && !row.orphaned)}
          initialIds={placements}
          onClose={() => setPlacements(null)}
          refresh={refresh}
        />
      ) : null}
      {setupSection && location ? (
        <SectionPlanDialog
          workspaceId={workspaceId}
          date={date}
          locationId={location.id}
          serviceId={service || null}
          sectionId={setupSection}
          onMove={(ids) => {
            setSetupSection(null);
            setPlacements(ids);
          }}
          model={model}
          plan={operations.data?.section_plans?.find(
            (plan) =>
              plan.section_id === setupSection &&
              plan.shift_type_id === (service || null),
          )}
          onClose={() => setSetupSection(null)}
          refresh={refresh}
        />
      ) : null}
      {editor && location ? (
        <LineupEditor
          key={`${date}:${location.id}:${editor.row?.id ?? editor.mode}`}
          {...editor}
          workspaceId={workspaceId}
          date={date}
          location={location}
          model={model}
          serviceId={service || null}
          onClose={() => setEditor(null)}
          onSaved={async (saved, keepOpen) => {
            if (saved && editor.row)
              setUndo({
                row: editor.row,
                entryId: saved.entry_id!,
                revision: saved.entry_revision!,
                locationId: location.id,
              });
            await refresh();
            if (!keepOpen) setEditor(null);
          }}
        />
      ) : null}
      {sectionsOpen ? (
        <SectionsDialog
          model={model}
          sections={model.sections}
          onClose={() => setSectionsOpen(false)}
          onSave={async (id, revision, section) => {
            const saved = await saveLineupSection(
              workspaceId,
              section,
              id,
              revision,
            );
            await refresh();
            return saved;
          }}
          onArchive={async (id, revision) => {
            await archiveLineupSection(workspaceId, id, revision);
            await refresh();
          }}
        />
      ) : null}
      {briefOpen && location ? (
        <BriefDialog
          typeName={
            selectedService?.name ?? model.shift_types[0]?.name ?? "Service"
          }
          brief={location.briefs.find(
            (brief) =>
              brief.shift_type_id === (service || model.shift_types[0]?.id),
          )}
          onClose={() => setBriefOpen(false)}
          onSave={async (value, revision) => {
            const id = service || model.shift_types[0]?.id;
            if (!id)
              throw new Error("Create a service in Scheduling settings first.");
            const saved = await saveLineupBrief(
              workspaceId,
              location.id,
              date,
              id,
              revision,
              value,
            );
            await refresh();
            return saved.entry_revision;
          }}
        />
      ) : null}
      {share ? (
        <ShareDialog
          preview={share.preview}
          model={share.model}
          published={share.published}
          shareText={buildLineupShareText(share.model, share.published)}
          onClose={() => setShare(null)}
          onConfirm={async () => {
            await shareLineup(
              workspaceId,
              date,
              share.preview.locations.map((item) => item.location_id),
              share.preview.fingerprint,
              share.serviceIds,
            );
            await refresh();
            setShare(null);
          }}
        />
      ) : null}
      {receiptsOpen ? (
        <LineupDialog
          title="Team acknowledgements"
          onClose={() => setReceiptsOpen(false)}
        >
          <p>
            Opening a plan and explicitly marking it read are recorded
            separately.
          </p>
          {operations.error ? (
            <p role="alert">{operations.error.message}</p>
          ) : receipts.length ? (
            receipts.map((receipt) => (
              <div className="lu-receipt" key={receipt.employee_id}>
                <strong>{receipt.employee_name}</strong>
                <span
                  className={`lu-badge ${receipt.acknowledged_at ? "success" : "warning"}`}
                >
                  {receipt.acknowledged_at
                    ? "Acknowledged"
                    : receipt.viewed_at
                      ? "Viewed · awaiting read"
                      : "Not viewed"}{" "}
                  · v{receipt.version}
                </span>
              </div>
            ))
          ) : (
            <p>No shared recipients yet.</p>
          )}
          {canShare &&
          location &&
          receipts.some((receipt) => !receipt.acknowledged_at) ? (
            <footer className="lu-dialog-footer">
              <button
                className="nf-button lu-primary"
                disabled={pending}
                onClick={() =>
                  void action(async () => {
                    setReminderStatus("");
                    const result = await remindLineupRecipients(
                      workspaceId,
                      date,
                      location.id,
                      receipts[0]!.snapshot_id,
                    );
                    setReminderStatus(
                      result.sent
                        ? `${result.sent} reminder${result.sent === 1 ? "" : "s"} sent to team members still awaiting acknowledgement.`
                        : "No new reminders. Recipients may have acknowledged, been reminded in the last hour, or need an active account.",
                    );
                    await refresh();
                  })
                }
              >
                {pending ? "Sending…" : "Remind those awaiting read"}
              </button>
            </footer>
          ) : null}
          {reminderStatus ? (
            <p role="status" className="lu-field-help">
              {reminderStatus}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="lu-error">
              {error}
            </p>
          ) : null}
        </LineupDialog>
      ) : null}
      {historyOpen ? (
        <LineupDialog
          title="Recent changes"
          onClose={() => setHistoryOpen(false)}
        >
          {operations.data?.events.length ? (
            operations.data.events.map((event) => (
              <div className="lu-event" key={event.id}>
                <strong>{event.description}</strong>
                <small>{new Date(event.created_at).toLocaleString()}</small>
              </div>
            ))
          ) : (
            <p>No operational changes recorded for this day.</p>
          )}
        </LineupDialog>
      ) : null}
    </section>
  );
}
