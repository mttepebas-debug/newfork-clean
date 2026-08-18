import type {
  ScheduleDraftSummary,
  ScheduleAutoFillAssignment,
  ScheduleAutoFillPreview,
  ScheduleEditableShift,
  ScheduleEditSession,
  ScheduleExportPreset,
  ScheduleExportPreview,
  ScheduleExportRequest,
  ScheduleExportSettings,
  SchedulePublicationOverrideInput,
  SchedulePublicationPreview,
  ScheduleEmployee,
  ScheduleLocation,
  ScheduleReadModel,
  ScheduleShift,
  ScheduleShiftMutationInput,
  ScheduleView,
  ScheduleUnpublishPreview,
  ScheduleTemplateSummary,
} from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  FileDown,
  Filter,
  Layers2,
  MapPin,
  LayoutTemplate,
  Plus,
  Rows3,
  Save,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  acquireScheduleEditSession,
  applyScheduleAutoFill,
  applyScheduleTemplate,
  createScheduleExportPreset,
  createScheduleTemplate,
  createScheduleShift,
  deleteScheduleShift,
  discardScheduleEditSession,
  deleteScheduleExportPreset,
  deleteScheduleTemplate,
  downloadScheduleExport,
  heartbeatScheduleEditSession,
  listScheduleDrafts,
  listScheduleExportPresets,
  listScheduleTemplates,
  previewScheduleAutoFill,
  previewScheduleExport,
  previewSchedulePublication,
  previewScheduleUnpublish,
  publishScheduleDraft,
  saveScheduleDraft,
  renameScheduleTemplate,
  updateScheduleShift,
  unpublishSchedule,
  getScheduleReadModel,
} from "../schedule/schedule-data";

const warningLabels = {
  availability: "Outside employee availability",
  closed_location: "Location is closed",
  overlap: "Overlapping employee shifts",
} as const;

export function SchedulePage() {
  const { context } = useAuth();
  const [search, setSearch] = useSearchParams();
  const today = new Date().toLocaleDateString("en-CA");
  const selectedDate = validDate(search.get("date")) ?? today;
  const view: ScheduleView = search.get("view") === "day" ? "day" : "week";
  const layout = search.get("layout") === "unified" ? "unified" : "separate";
  const hideUnscheduled = search.get("hideUnscheduled") === "true";
  const query = useQuery({
    queryKey: ["schedule-read", context?.workspace.id, selectedDate, view],
    queryFn: () =>
      getScheduleReadModel(context!.workspace.id, selectedDate, view),
    enabled: Boolean(context),
  });
  const [session, setSession] = useState<ScheduleEditSession | null>(null);
  const [drafts, setDrafts] = useState<readonly ScheduleDraftSummary[]>([]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [editor, setEditor] = useState<ShiftEditorState | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [clipboard, setClipboard] = useState<ScheduleEditableShift | null>(
    null,
  );
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [idleSeconds, setIdleSeconds] = useState<number | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<
    readonly ScheduleTemplateSummary[]
  >([]);
  const [autoFill, setAutoFill] = useState<ScheduleAutoFillPreview | null>(
    null,
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPresets, setExportPresets] = useState<
    readonly ScheduleExportPreset[]
  >([]);

  useEffect(() => {
    if (!session) return;
    const heartbeat = window.setInterval(() => {
      if (!context) return;
      if (Date.now() - lastActivity >= 180_000) return;
      void heartbeatScheduleEditSession(context.workspace.id, session.id)
        .then(setSession)
        .catch((error: Error) => setOperationError(error.message));
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [context, session?.id, lastActivity]);

  useEffect(() => {
    if (!session) return;
    const active = () => {
      setLastActivity(Date.now());
      setIdleSeconds(null);
    };
    window.addEventListener("pointerdown", active);
    window.addEventListener("keydown", active);
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      if (elapsed < 180_000) return;
      const remaining = Math.max(0, Math.ceil((195_000 - elapsed) / 1000));
      setIdleSeconds(remaining);
      if (remaining === 0 && context) {
        void discardScheduleEditSession(
          context.workspace.id,
          session.id,
        ).finally(() => {
          setSession(null);
          setIdleSeconds(null);
          setSelectedIds([]);
        });
      }
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
      window.clearInterval(timer);
    };
  }, [context, session?.id, lastActivity]);

  useEffect(() => {
    if (!session?.dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session?.dirty]);

  const changePeriod = (days: number) => {
    const next = new URLSearchParams(search);
    next.set("date", addDays(selectedDate, days));
    next.set("view", view);
    setSearch(next);
  };
  const setMode = (nextView: ScheduleView) => {
    const next = new URLSearchParams(search);
    next.set("date", selectedDate);
    next.set("view", nextView);
    setSearch(next);
  };
  const setHideUnscheduled = (hidden: boolean) => {
    const next = new URLSearchParams(search);
    if (hidden) next.set("hideUnscheduled", "true");
    else next.delete("hideUnscheduled");
    setSearch(next);
  };

  const openSources = async () => {
    if (!context || !query.data) return;
    setOperationError(null);
    try {
      const result = await listScheduleDrafts(
        context.workspace.id,
        query.data.week_start,
      );
      setDrafts(result.drafts);
      setSourceOpen(true);
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const openPublish = async () => {
    if (!context || !query.data) return;
    setOperationError(null);
    try {
      const result = await listScheduleDrafts(
        context.workspace.id,
        query.data.week_start,
      );
      setDrafts(result.drafts);
      if (!result.drafts.length) {
        setOperationError("Save a named draft before publishing this week.");
        return;
      }
      setPublishOpen(true);
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const openTemplates = async () => {
    if (!context || !query.data) return;
    setOperationError(null);
    try {
      const [templateResult, draftResult] = await Promise.all([
        listScheduleTemplates(context.workspace.id),
        listScheduleDrafts(context.workspace.id, query.data.week_start),
      ]);
      setTemplates(templateResult.templates);
      setDrafts(draftResult.drafts);
      setTemplatesOpen(true);
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const openAutoFill = async () => {
    if (!context || !session) return;
    setOperationError(null);
    try {
      setAutoFill(
        await previewScheduleAutoFill(context.workspace.id, session.id),
      );
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const openExport = async () => {
    if (!context || !query.data) return;
    setOperationError(null);
    try {
      const [draftResult, presetResult] = await Promise.all([
        listScheduleDrafts(context.workspace.id, query.data.week_start),
        listScheduleExportPresets(context.workspace.id),
      ]);
      setDrafts(draftResult.drafts);
      setExportPresets(presetResult.presets);
      setExportOpen(true);
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const acquire = async (
    source: "blank" | "published" | "draft",
    draftId: string | null = null,
  ) => {
    if (!context || !query.data) return;
    setOperationError(null);
    try {
      const result = await acquireScheduleEditSession(
        context.workspace.id,
        query.data.week_start,
        source,
        draftId,
      );
      if (result.status === "conflict") {
        setConflict(
          `${result.holder_name} is editing this week until ${new Date(result.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`,
        );
        return;
      }
      setSession(result.session);
      setSourceOpen(false);
      setConflict(null);
    } catch (error) {
      setOperationError((error as Error).message);
    }
  };

  const mutate = async (action: () => Promise<ScheduleEditSession>) => {
    setOperationError(null);
    try {
      const next = await action();
      setSession(next);
      return next;
    } catch (error) {
      setOperationError((error as Error).message);
      return null;
    }
  };

  const removeSelected = async () => {
    if (!context || !session) return;
    let current = session;
    for (const id of selectedIds) {
      const shift = current.shifts.find((item) => item.id === id);
      if (!shift) continue;
      const next = await mutate(() =>
        deleteScheduleShift(
          context.workspace.id,
          current,
          shift.id,
          shift.revision,
        ),
      );
      if (!next) return;
      current = next;
    }
    setSelectedIds([]);
  };

  if (query.isPending)
    return (
      <ScheduleState
        title="Loading Schedule"
        detail="Resolving the published week."
      />
    );
  if (query.isError)
    return (
      <ScheduleState
        title="Schedule unavailable"
        detail={query.error.message}
        error
      />
    );

  const model = session
    ? { ...query.data, shifts: session.shifts }
    : query.data;
  const periodLabel = formatPeriod(selectedDate, model.week_start, view);
  const pastWeek =
    model.week_start < currentWeekStart(today, model.week_start_day);

  return (
    <section className="schedule-page" aria-labelledby="schedule-title">
      <header className="schedule-topbar">
        <div className="schedule-command-group">
          <button
            type="button"
            className="icon-button"
            aria-label={`Previous ${view}`}
            onClick={() => changePeriod(view === "day" ? -1 : -7)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="schedule-view-mode"
            aria-label={`Switch to ${view === "week" ? "daily" : "weekly"} view`}
            onClick={() => setMode(view === "week" ? "day" : "week")}
          >
            {view === "week" ? "Weekly view" : "Daily view"}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={`Next ${view}`}
            onClick={() => changePeriod(view === "day" ? 1 : 7)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
          <details
            className="schedule-command-menu"
            name="schedule-topbar-menu"
          >
            <summary role="button">
              <SlidersHorizontal size={15} aria-hidden /> Settings
            </summary>
            <div className="schedule-command-menu-panel">
              <strong>Schedule</strong>
              <button
                type="button"
                onClick={(event) => {
                  closeScheduleMenu(event.currentTarget);
                  const next = new URLSearchParams(search);
                  next.set("date", today);
                  next.set("view", view);
                  setSearch(next);
                }}
              >
                Today
              </button>
              {context?.permissions.includes("schedule.lineup.read") ? (
                <Link to={`/app/schedule/lineup?date=${selectedDate}`}>
                  Line-up
                </Link>
              ) : null}
              {context?.permissions.some((permission) =>
                [
                  "schedule.time_off_requests.read",
                  "schedule.shift_change_requests.read",
                ].includes(permission),
              ) ? (
                <Link to="/app/schedule/requests">Requests</Link>
              ) : null}
            </div>
          </details>
          <button
            type="button"
            className="schedule-hide-unscheduled"
            aria-pressed={hideUnscheduled}
            onClick={() => setHideUnscheduled(!hideUnscheduled)}
          >
            {hideUnscheduled ? (
              <Eye size={15} aria-hidden />
            ) : (
              <EyeOff size={15} aria-hidden />
            )}
            {hideUnscheduled ? "Show Unscheduled" : "Hide Unscheduled"}
          </button>
        </div>
        <div className="schedule-action-group">
          {context?.permissions.includes("schedule.export") && !session ? (
            <button
              className="schedule-export-action"
              type="button"
              onClick={() => void openExport()}
            >
              <FileDown size={15} aria-hidden /> Export
            </button>
          ) : null}
          {context?.permissions.includes("schedule.manage") && !session ? (
            <details
              className="schedule-action-menu"
              name="schedule-topbar-menu"
            >
              <summary role="button">
                New Schedule <ChevronDown size={15} aria-hidden />
              </summary>
              <div className="schedule-action-menu-panel">
                <button
                  type="button"
                  onClick={(event) => {
                    closeScheduleMenu(event.currentTarget);
                    void openSources();
                  }}
                >
                  <Edit3 size={15} aria-hidden /> Edit or create
                </button>
                {context.permissions.includes("schedule.templates.manage") ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      closeScheduleMenu(event.currentTarget);
                      void openTemplates();
                    }}
                  >
                    <LayoutTemplate size={15} aria-hidden /> Templates
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
          {context?.permissions.includes("schedule.publish") &&
          !session &&
          !pastWeek ? (
            model.locations.some(
              (location) => location.publication_status === "published",
            ) ? (
              <details
                className="schedule-published-menu"
                name="schedule-topbar-menu"
              >
                <summary role="button">
                  <Check size={15} aria-hidden /> Published
                </summary>
                <div className="schedule-action-menu-panel">
                  <button
                    type="button"
                    onClick={(event) => {
                      closeScheduleMenu(event.currentTarget);
                      setUnpublishOpen(true);
                    }}
                  >
                    <EyeOff size={15} aria-hidden /> Unpublish
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      closeScheduleMenu(event.currentTarget);
                      void openPublish();
                    }}
                  >
                    <Send size={15} aria-hidden /> Publish another draft
                  </button>
                </div>
              </details>
            ) : (
              <button
                className="schedule-publish-action"
                type="button"
                onClick={() => void openPublish()}
              >
                <Send size={15} aria-hidden /> Publish
              </button>
            )
          ) : null}
        </div>
        <h1 id="schedule-title" className="sr-only">
          Schedule
        </h1>
        <span className="sr-only">{periodLabel}</span>
      </header>

      <ScheduleToolbar
        model={model}
        search={search}
        setSearch={setSearch}
        layout={layout}
      />
      {operationError ? (
        <div className="schedule-operation-error" role="alert">
          {operationError}
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setOperationError(null)}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      {session ? (
        <div className="schedule-edit-banner" role="status">
          <div>
            <strong>Editing draft</strong>
            <span>
              {session.dirty ? "Unsaved changes" : "Working copy ready"}
            </span>
          </div>
          {selectedIds.length ? (
            <button
              type="button"
              className="danger"
              onClick={() => void removeSelected()}
            >
              <Trash2 size={15} /> Delete {selectedIds.length}
            </button>
          ) : null}
          {context?.permissions.includes("schedule.templates.manage") ? (
            <button type="button" onClick={() => void openTemplates()}>
              <LayoutTemplate size={15} /> Templates
            </button>
          ) : null}
          <button type="button" onClick={() => void openAutoFill()}>
            <WandSparkles size={15} /> Auto-fill
          </button>
          <button type="button" onClick={() => setSaveOpen(true)}>
            <Save size={15} /> Save draft
          </button>
          <button
            type="button"
            onClick={() =>
              void (async () => {
                if (
                  !context ||
                  !window.confirm(
                    session.dirty
                      ? "Discard all unsaved changes?"
                      : "Close this editing session?",
                  )
                )
                  return;
                await discardScheduleEditSession(
                  context.workspace.id,
                  session.id,
                );
                setSession(null);
                setSelectedIds([]);
              })()
            }
          >
            <X size={15} /> Discard
          </button>
        </div>
      ) : (
        <div className="schedule-readonly-banner" role="status">
          <span>Published schedule</span>
          <strong>View only</strong>
        </div>
      )}
      <ScheduleGrid
        model={model}
        search={search}
        selectedDate={selectedDate}
        view={view}
        layout={layout}
        hideUnscheduled={hideUnscheduled}
        session={session}
        selectedIds={selectedIds}
        clipboard={clipboard}
        onSelect={(id, additive) =>
          setSelectedIds((current) =>
            additive
              ? current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id]
              : [id],
          )
        }
        onEdit={(shift) => setEditor({ mode: "edit", shift })}
        onCreate={(locationId, employeeId, date) =>
          setEditor({ mode: "create", locationId, employeeId, date })
        }
        onCopy={setClipboard}
        onPaste={(locationId, employeeId, date) =>
          clipboard &&
          setEditor({
            mode: "create",
            locationId,
            employeeId,
            date,
            copy: clipboard,
          })
        }
        onMove={(shift, locationId, employeeId, date) => {
          if (!context || !session) return;
          void mutate(() =>
            updateScheduleShift(
              context.workspace.id,
              session,
              shift.id,
              shift.revision,
              toMutation(shift, {
                location_id: locationId,
                employee_id: employeeId,
                scheduled_date: date,
              }),
            ),
          );
        }}
      />
      {sourceOpen ? (
        <EditSourceDialog
          drafts={drafts}
          onClose={() => setSourceOpen(false)}
          onAcquire={acquire}
        />
      ) : null}
      {conflict ? (
        <MessageDialog
          title="This week is locked"
          detail={conflict}
          onClose={() => setConflict(null)}
        />
      ) : null}
      {idleSeconds !== null ? (
        <IdleDialog
          seconds={idleSeconds}
          onContinue={() => {
            setLastActivity(Date.now());
            setIdleSeconds(null);
          }}
        />
      ) : null}
      {editor && session && context ? (
        <ShiftEditor
          model={model}
          state={editor}
          onClose={() => setEditor(null)}
          onSubmit={(shift) =>
            void mutate(() =>
              editor.mode === "edit"
                ? updateScheduleShift(
                    context.workspace.id,
                    session,
                    editor.shift.id,
                    editor.shift.revision,
                    shift,
                  )
                : createScheduleShift(context.workspace.id, session, shift),
            ).then((next) => next && setEditor(null))
          }
        />
      ) : null}
      {saveOpen && session && context ? (
        <SaveDraftDialog
          drafts={drafts}
          initialDraft={
            drafts.find((item) => item.id === session.source_draft_id) ?? null
          }
          onClose={() => setSaveOpen(false)}
          onSave={(name, draft) =>
            void saveScheduleDraft(context.workspace.id, session, name, draft)
              .then((saved) => {
                setDrafts((items) => [
                  ...items.filter((item) => item.id !== saved.id),
                  saved,
                ]);
                setSaveOpen(false);
                setSession(null);
                void query.refetch();
              })
              .catch((error: Error) => setOperationError(error.message))
          }
        />
      ) : null}
      {publishOpen && context ? (
        <PublishScheduleDialog
          drafts={drafts}
          locations={model.locations}
          onClose={() => setPublishOpen(false)}
          onPreview={(draftId, locationIds) =>
            previewSchedulePublication(
              context.workspace.id,
              draftId,
              locationIds,
            )
          }
          onPublish={(preview, overrides) =>
            publishScheduleDraft(context.workspace.id, preview, overrides).then(
              () => {
                setPublishOpen(false);
                void query.refetch();
              },
            )
          }
        />
      ) : null}
      {unpublishOpen && context ? (
        <UnpublishScheduleDialog
          weekStart={model.week_start}
          locations={model.locations.filter(
            (location) => location.publication_status === "published",
          )}
          onClose={() => setUnpublishOpen(false)}
          onPreview={(locationIds) =>
            previewScheduleUnpublish(
              context.workspace.id,
              model.week_start,
              locationIds,
            )
          }
          onUnpublish={(preview) =>
            unpublishSchedule(context.workspace.id, preview).then(() => {
              setUnpublishOpen(false);
              void query.refetch();
            })
          }
        />
      ) : null}
      {templatesOpen && context ? (
        <ScheduleTemplatesDialog
          templates={templates}
          drafts={drafts}
          session={session}
          onClose={() => setTemplatesOpen(false)}
          onCreate={(draftId, name, stripAssignments) =>
            createScheduleTemplate(
              context.workspace.id,
              draftId,
              name,
              stripAssignments,
            ).then((result) =>
              setTemplates((items) => [...items, result.template]),
            )
          }
          onRename={(template, name) =>
            renameScheduleTemplate(
              context.workspace.id,
              template.id,
              name,
              template.revision,
            ).then((result) =>
              setTemplates((items) =>
                items.map((item) =>
                  item.id === template.id ? result.template : item,
                ),
              ),
            )
          }
          onDelete={(template) =>
            deleteScheduleTemplate(
              context.workspace.id,
              template.id,
              template.revision,
            ).then(() =>
              setTemplates((items) =>
                items.filter((item) => item.id !== template.id),
              ),
            )
          }
          onApply={(templateId, mode) =>
            session
              ? applyScheduleTemplate(
                  context.workspace.id,
                  session,
                  templateId,
                  mode,
                ).then((result) => {
                  setSession(result.session);
                  setTemplatesOpen(false);
                })
              : Promise.resolve()
          }
        />
      ) : null}
      {autoFill && context && session ? (
        <ScheduleAutoFillDialog
          preview={autoFill}
          onClose={() => setAutoFill(null)}
          onApply={(assignments) =>
            applyScheduleAutoFill(
              context.workspace.id,
              session,
              autoFill,
              assignments,
            ).then((result) => {
              setSession(result.session);
              setAutoFill(null);
              if (result.rejected.length)
                setOperationError(
                  `${result.rejected.length} auto-fill assignment could not be applied.`,
                );
            })
          }
        />
      ) : null}
      {exportOpen && context ? (
        <ScheduleExportDialog
          weekStart={model.week_start}
          locations={model.locations}
          drafts={drafts}
          presets={exportPresets}
          onClose={() => setExportOpen(false)}
          onPreview={(request) =>
            previewScheduleExport(context.workspace.id, request)
          }
          onDownload={(request) =>
            downloadScheduleExport(context.workspace.id, request)
          }
          onSavePreset={(name, settings) =>
            createScheduleExportPreset(
              context.workspace.id,
              name,
              settings,
            ).then((preset) => setExportPresets((items) => [...items, preset]))
          }
          onDeletePreset={(presetId) =>
            deleteScheduleExportPreset(context.workspace.id, presetId).then(
              () =>
                setExportPresets((items) =>
                  items.filter((item) => item.id !== presetId),
                ),
            )
          }
        />
      ) : null}
    </section>
  );
}

function ScheduleToolbar({
  model,
  search,
  setSearch,
  layout,
}: {
  readonly model: ScheduleReadModel;
  readonly search: URLSearchParams;
  readonly setSearch: ReturnType<typeof useSearchParams>[1];
  readonly layout: "separate" | "unified";
}) {
  const setLayout = (value: "separate" | "unified") => {
    const next = new URLSearchParams(search);
    if (value === "separate") next.delete("layout");
    else next.set("layout", value);
    setSearch(next);
  };
  return (
    <div className="schedule-toolbar">
      <div className="schedule-filter-row" aria-label="Schedule filters">
        <Filter size={16} aria-hidden />
        <ScheduleFilter
          label="Locations"
          param="locations"
          options={model.locations.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
          search={search}
          setSearch={setSearch}
        />
        <ScheduleFilter
          label="Shift types"
          param="shiftTypes"
          options={model.shift_types.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
          search={search}
          setSearch={setSearch}
        />
        <ScheduleFilter
          label="Jobs"
          param="jobs"
          options={model.jobs.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
          search={search}
          setSearch={setSearch}
        />
        <ScheduleFilter
          label="Employees"
          param="employees"
          options={model.employees.map((item) => ({
            id: item.id,
            label: item.display_name,
          }))}
          search={search}
          setSearch={setSearch}
        />
        {hasFilters(search) ? (
          <button
            type="button"
            className="schedule-clear-filters"
            onClick={() => {
              const next = new URLSearchParams(search);
              ["locations", "shiftTypes", "jobs", "employees"].forEach((key) =>
                next.delete(key),
              );
              setSearch(next);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      <div className="schedule-layout-control" aria-label="Location layout">
        <button
          type="button"
          title="Separate locations"
          aria-pressed={layout === "separate"}
          onClick={() => setLayout("separate")}
        >
          <Rows3 size={16} aria-hidden />
          <span>Separate</span>
        </button>
        <button
          type="button"
          title="Unified locations"
          aria-pressed={layout === "unified"}
          onClick={() => setLayout("unified")}
        >
          <Layers2 size={16} aria-hidden />
          <span>Unified</span>
        </button>
      </div>
    </div>
  );
}

function ScheduleFilter({
  label,
  param,
  options,
  search,
  setSearch,
}: {
  readonly label: string;
  readonly param: string;
  readonly options: readonly { id: string; label: string }[];
  readonly search: URLSearchParams;
  readonly setSearch: ReturnType<typeof useSearchParams>[1];
}) {
  const selected = parseIds(search.get(param));
  const active = selected.length > 0;
  const toggle = (id: string) => {
    const nextSelected = new Set(
      active ? selected : options.map((option) => option.id),
    );
    if (nextSelected.has(id)) nextSelected.delete(id);
    else nextSelected.add(id);
    const next = new URLSearchParams(search);
    if (nextSelected.size > 0 && nextSelected.size < options.length) {
      next.set(param, [...nextSelected].join(","));
    } else {
      next.delete(param);
    }
    setSearch(next);
  };
  return (
    <details className="schedule-filter" data-active={active}>
      <summary>
        {active
          ? `${label} (${selected.length})`
          : `All ${label.toLowerCase()}`}
      </summary>
      <div className="schedule-filter-menu">
        {options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={!active || selected.includes(option.id)}
              onChange={() => toggle(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function ScheduleGrid({
  model,
  search,
  selectedDate,
  view,
  layout,
  hideUnscheduled,
  session,
  selectedIds,
  clipboard,
  onSelect,
  onEdit,
  onCreate,
  onCopy,
  onPaste,
  onMove,
}: {
  readonly model: ScheduleReadModel;
  readonly search: URLSearchParams;
  readonly selectedDate: string;
  readonly view: ScheduleView;
  readonly layout: "separate" | "unified";
  readonly hideUnscheduled: boolean;
  readonly session: ScheduleEditSession | null;
  readonly selectedIds: readonly string[];
  readonly clipboard: ScheduleEditableShift | null;
  readonly onSelect: (id: string, additive: boolean) => void;
  readonly onEdit: (shift: ScheduleEditableShift) => void;
  readonly onCreate: (
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onCopy: (shift: ScheduleEditableShift) => void;
  readonly onPaste: (
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onMove: (
    shift: ScheduleEditableShift,
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
}) {
  const filtered = useMemo(() => filterModel(model, search), [model, search]);
  const days =
    view === "day"
      ? [selectedDate]
      : Array.from({ length: 7 }, (_, index) =>
          addDays(model.week_start, index),
        );
  const locationGroups =
    layout === "unified"
      ? [
          {
            id: "unified",
            name: filtered.locations.map((item) => item.name).join(" + "),
            timezone: "",
            sort_order: 0,
            publication_status: filtered.locations.every(
              (item) => item.publication_status === "published",
            )
              ? ("published" as const)
              : ("unpublished" as const),
            published_at: null,
            sourceIds: filtered.locations.map((item) => item.id),
          },
        ]
      : filtered.locations.map((item) => ({ ...item, sourceIds: [item.id] }));
  const columns = Math.max(1, locationGroups.length * days.length);
  const unassigned = filtered.shifts.filter(
    (shift) => shift.employee_id === null,
  );
  const scheduledEmployeeIds = new Set(
    filtered.shifts.flatMap((shift) =>
      shift.employee_id ? [shift.employee_id] : [],
    ),
  );
  const visibleEmployees = hideUnscheduled
    ? filtered.employees.filter((employee) =>
        scheduledEmployeeIds.has(employee.id),
      )
    : filtered.employees;
  const rows: readonly (ScheduleEmployee | null)[] = unassigned.length
    ? [null, ...visibleEmployees]
    : visibleEmployees;

  if (!filtered.locations.length)
    return (
      <ScheduleState
        title="No locations match"
        detail="Clear the location filter to restore the schedule grid."
      />
    );

  return (
    <div className="schedule-grid-scroll" data-testid="schedule-grid-scroll">
      <div
        className="schedule-grid-exact"
        role="grid"
        aria-label={`${view === "day" ? "Daily" : "Weekly"} published schedule`}
        style={{
          gridTemplateColumns: `220px repeat(${columns}, minmax(126px, 1fr))`,
        }}
      >
        <div
          className="schedule-grid-corner schedule-grid-sticky"
          role="columnheader"
        >
          Team
        </div>
        {locationGroups.map((location) => (
          <div
            key={location.id}
            className="schedule-location-header"
            role="columnheader"
            style={{ gridColumn: `span ${days.length}` }}
          >
            <span>
              <MapPin size={13} aria-hidden />
              {location.name || "Selected locations"}
            </span>
            <em data-status={location.publication_status}>
              {location.publication_status === "published"
                ? "Published"
                : "Not published"}
            </em>
          </div>
        ))}
        <div
          className="schedule-employee-header schedule-grid-sticky"
          role="columnheader"
        >
          Employees
        </div>
        {locationGroups.flatMap((location) =>
          days.map((day) => (
            <div
              key={`${location.id}-${day}`}
              className="schedule-day-header"
              role="columnheader"
              data-today={day === new Date().toLocaleDateString("en-CA")}
            >
              <strong>{formatDay(day)}</strong>
              <span>{formatDateNumber(day)}</span>
            </div>
          )),
        )}
        {rows.map((employee) => (
          <ScheduleRow
            key={employee?.id ?? "unassigned"}
            employee={employee}
            shifts={filtered.shifts}
            locations={locationGroups}
            days={days}
            jobs={model.jobs}
            shiftTypes={model.shift_types}
            closures={model.closures}
            editing={Boolean(session)}
            selectedIds={selectedIds}
            clipboard={clipboard}
            onSelect={onSelect}
            onEdit={onEdit}
            onCreate={onCreate}
            onCopy={onCopy}
            onPaste={onPaste}
            onMove={onMove}
          />
        ))}
        {!rows.length ? (
          <>
            <div className="schedule-empty-row schedule-grid-sticky">
              No employees
            </div>
            {Array.from({ length: columns }, (_, index) => (
              <div className="schedule-cell" key={index} />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ScheduleRow({
  employee,
  shifts,
  locations,
  days,
  jobs,
  shiftTypes,
  closures,
  editing,
  selectedIds,
  clipboard,
  onSelect,
  onEdit,
  onCreate,
  onCopy,
  onPaste,
  onMove,
}: {
  readonly employee: ScheduleEmployee | null;
  readonly shifts: readonly ScheduleShift[];
  readonly locations: readonly (ScheduleLocation & {
    sourceIds: readonly string[];
  })[];
  readonly days: readonly string[];
  readonly jobs: ScheduleReadModel["jobs"];
  readonly shiftTypes: ScheduleReadModel["shift_types"];
  readonly closures: ScheduleReadModel["closures"];
  readonly editing: boolean;
  readonly selectedIds: readonly string[];
  readonly clipboard: ScheduleEditableShift | null;
  readonly onSelect: (id: string, additive: boolean) => void;
  readonly onEdit: (shift: ScheduleEditableShift) => void;
  readonly onCreate: (
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onCopy: (shift: ScheduleEditableShift) => void;
  readonly onPaste: (
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
  readonly onMove: (
    shift: ScheduleEditableShift,
    locationId: string,
    employeeId: string | null,
    date: string,
  ) => void;
}) {
  const employeeShifts = shifts.filter(
    (shift) =>
      shift.employee_id === employee?.id ||
      (!employee && shift.employee_id === null),
  );
  const hours = employeeShifts.reduce(
    (sum, shift) => sum + shiftHours(shift),
    0,
  );
  return (
    <>
      <div
        className="schedule-employee-cell schedule-grid-sticky"
        role="rowheader"
        data-unassigned={!employee}
      >
        <strong>{employee?.display_name ?? "Unassigned shifts"}</strong>
        <span>
          {employee
            ? `${employee.employee_code} · ${hours.toFixed(1)}h`
            : `${employeeShifts.length} open ${employeeShifts.length === 1 ? "shift" : "shifts"}`}
        </span>
      </div>
      {locations.flatMap((location) =>
        days.map((day) => {
          const cellShifts = employeeShifts.filter(
            (shift) =>
              location.sourceIds.includes(shift.location_id) &&
              shift.scheduled_date === day,
          );
          const closure = closures.find(
            (item) =>
              location.sourceIds.includes(item.location_id) &&
              item.closed_date === day &&
              item.is_all_day,
          );
          return (
            <div
              className="schedule-cell"
              role="gridcell"
              key={`${employee?.id ?? "open"}-${location.id}-${day}`}
              data-closed={Boolean(closure)}
              title={closure?.title}
              data-editing={editing}
              onDoubleClick={() =>
                editing &&
                onCreate(location.sourceIds[0]!, employee?.id ?? null, day)
              }
              onDragOver={(event) => editing && event.preventDefault()}
              onDrop={(event) => {
                if (!editing) return;
                const shift = shifts.find(
                  (item) =>
                    item.id ===
                    event.dataTransfer.getData("text/schedule-shift"),
                );
                if (shift && "revision" in shift)
                  onMove(
                    shift as ScheduleEditableShift,
                    location.sourceIds[0]!,
                    employee?.id ?? null,
                    day,
                  );
              }}
            >
              {editing ? (
                <button
                  type="button"
                  className="schedule-cell-add"
                  aria-label={`Add shift for ${employee?.display_name ?? "unassigned"} on ${day}`}
                  onClick={() =>
                    onCreate(location.sourceIds[0]!, employee?.id ?? null, day)
                  }
                >
                  <Plus size={14} aria-hidden />
                </button>
              ) : null}
              {cellShifts.map((shift) => (
                <ShiftBadge
                  key={shift.id}
                  shift={shift}
                  job={
                    jobs.find((item) => item.id === shift.job_id)?.name ??
                    "Shift"
                  }
                  type={shiftTypes.find(
                    (item) => item.id === shift.shift_type_id,
                  )}
                  editing={editing}
                  selected={selectedIds.includes(shift.id)}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onCopy={onCopy}
                />
              ))}
              {editing && clipboard ? (
                <button
                  type="button"
                  className="schedule-cell-paste"
                  onClick={() =>
                    onPaste(location.sourceIds[0]!, employee?.id ?? null, day)
                  }
                  title="Paste copied shift"
                >
                  <ClipboardPaste size={13} /> Paste
                </button>
              ) : null}
            </div>
          );
        }),
      )}
    </>
  );
}

function ShiftBadge({
  shift,
  job,
  type,
  editing = false,
  selected = false,
  onSelect,
  onEdit,
  onCopy,
}: {
  readonly shift: ScheduleShift;
  readonly job: string;
  readonly type: ScheduleReadModel["shift_types"][number] | undefined;
  readonly editing?: boolean;
  readonly selected?: boolean;
  readonly onSelect?: (id: string, additive: boolean) => void;
  readonly onEdit?: (shift: ScheduleEditableShift) => void;
  readonly onCopy?: (shift: ScheduleEditableShift) => void;
}) {
  return (
    <article
      className="schedule-shift-badge"
      style={{ "--shift-color": type?.color ?? "#54736a" } as CSSProperties}
      aria-label={`${job}, ${formatTime(shift.start_time)} to ${formatTime(shift.end_time)}`}
      data-selected={selected}
      draggable={editing}
      tabIndex={editing ? 0 : undefined}
      onDragStart={(event) =>
        event.dataTransfer.setData("text/schedule-shift", shift.id)
      }
      onClick={(event) => editing && onSelect?.(shift.id, event.shiftKey)}
      onDoubleClick={() => editing && onEdit?.(shift as ScheduleEditableShift)}
      onKeyDown={(event) => {
        if (!editing) return;
        if (event.key === "Enter") onEdit?.(shift as ScheduleEditableShift);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c")
          onCopy?.(shift as ScheduleEditableShift);
      }}
      onContextMenu={(event) => {
        if (!editing) return;
        event.preventDefault();
        onCopy?.(shift as ScheduleEditableShift);
      }}
    >
      <div>
        <strong>{type?.name ?? job}</strong>
        {shift.warning_codes.length ? (
          <AlertTriangle
            size={13}
            aria-label={shift.warning_codes
              .map((code) => warningLabels[code])
              .join(", ")}
          />
        ) : null}
      </div>
      <span>
        {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
        {shift.crosses_midnight ? " +1" : ""}
      </span>
      {type ? <em>{job}</em> : null}
    </article>
  );
}

type ShiftEditorState =
  | { mode: "edit"; shift: ScheduleEditableShift }
  | {
      mode: "create";
      locationId: string;
      employeeId: string | null;
      date: string;
      copy?: ScheduleEditableShift;
    };

function EditSourceDialog({
  drafts,
  onClose,
  onAcquire,
}: {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly onClose: () => void;
  readonly onAcquire: (
    source: "blank" | "published" | "draft",
    draftId?: string | null,
  ) => void;
}) {
  return (
    <Dialog title="Edit schedule" onClose={onClose}>
      <div className="schedule-source-list">
        <button type="button" onClick={() => onAcquire("published")}>
          <strong>Published schedule</strong>
          <span>Start from the current published week.</span>
        </button>
        <button type="button" onClick={() => onAcquire("blank")}>
          <strong>Blank schedule</strong>
          <span>Start with an empty week.</span>
        </button>
        {drafts.map((draft) => (
          <button
            key={draft.id}
            type="button"
            onClick={() => onAcquire("draft", draft.id)}
          >
            <strong>{draft.name}</strong>
            <span>
              Draft revision {draft.revision} · updated{" "}
              {new Date(draft.updated_at).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function ShiftEditor({
  model,
  state,
  onClose,
  onSubmit,
}: {
  readonly model: ScheduleReadModel;
  readonly state: ShiftEditorState;
  readonly onClose: () => void;
  readonly onSubmit: (shift: ScheduleShiftMutationInput) => void;
}) {
  const base = state.mode === "edit" ? state.shift : state.copy;
  const [value, setValue] = useState<ScheduleShiftMutationInput>({
    location_id:
      state.mode === "edit" ? state.shift.location_id : state.locationId,
    employee_id:
      state.mode === "edit" ? state.shift.employee_id : state.employeeId,
    job_id: base?.job_id ?? model.jobs[0]?.id ?? "",
    shift_type_id: base?.shift_type_id ?? null,
    scheduled_date:
      state.mode === "edit" ? state.shift.scheduled_date : state.date,
    start_time:
      base?.start_time ?? model.shift_types[0]?.default_start_time ?? "09:00",
    end_time:
      base?.end_time ?? model.shift_types[0]?.default_end_time ?? "17:00",
    note: base?.note ?? "",
  });
  const eligibleEmployees = model.employees.filter((employee) =>
    employee.location_ids.includes(value.location_id),
  );
  const eligibleJobs = model.jobs.filter(
    (job) =>
      value.employee_id === null ||
      model.employees
        .find((employee) => employee.id === value.employee_id)
        ?.job_ids.includes(job.id),
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
  };
  return (
    <Dialog
      title={
        state.mode === "edit"
          ? "Edit shift"
          : state.copy
            ? "Paste shift"
            : "Add shift"
      }
      onClose={onClose}
    >
      <form className="schedule-shift-form" onSubmit={submit}>
        <label>
          Location
          <select
            value={value.location_id}
            onChange={(event) =>
              setValue({ ...value, location_id: event.target.value })
            }
          >
            {model.locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Employee
          <select
            value={value.employee_id ?? ""}
            onChange={(event) =>
              setValue({ ...value, employee_id: event.target.value || null })
            }
          >
            <option value="">Unassigned</option>
            {eligibleEmployees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={value.scheduled_date}
            min={model.week_start}
            max={addDays(model.week_start, 6)}
            onChange={(event) =>
              setValue({ ...value, scheduled_date: event.target.value })
            }
            required
          />
        </label>
        <label>
          Job
          <select
            value={value.job_id}
            onChange={(event) =>
              setValue({ ...value, job_id: event.target.value })
            }
          >
            {eligibleJobs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shift type
          <select
            value={value.shift_type_id ?? ""}
            onChange={(event) =>
              setValue({ ...value, shift_type_id: event.target.value || null })
            }
          >
            <option value="">No type</option>
            {model.shift_types.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="schedule-time-fields">
          <label>
            Start
            <input
              type="time"
              value={value.start_time}
              onChange={(event) =>
                setValue({ ...value, start_time: event.target.value })
              }
              required
            />
          </label>
          <label>
            End
            <input
              type="time"
              value={value.end_time}
              onChange={(event) =>
                setValue({ ...value, end_time: event.target.value })
              }
              required
            />
          </label>
        </div>
        <label className="wide">
          Note
          <textarea
            value={value.note}
            maxLength={500}
            onChange={(event) =>
              setValue({ ...value, note: event.target.value })
            }
          />
        </label>
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {state.mode === "edit" ? "Update shift" : "Add shift"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function SaveDraftDialog({
  drafts,
  initialDraft,
  onClose,
  onSave,
}: {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly initialDraft: ScheduleDraftSummary | null;
  readonly onClose: () => void;
  readonly onSave: (name: string, draft: ScheduleDraftSummary | null) => void;
}) {
  const [targetId, setTargetId] = useState(initialDraft?.id ?? "");
  const target = drafts.find((item) => item.id === targetId) ?? null;
  const [name, setName] = useState(initialDraft?.name ?? "");
  return (
    <Dialog title="Save draft" onClose={onClose}>
      <form
        className="schedule-save-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name, target);
        }}
      >
        <label>
          Destination
          <select
            value={targetId}
            onChange={(event) => {
              const draft =
                drafts.find((item) => item.id === event.target.value) ?? null;
              setTargetId(event.target.value);
              if (draft) setName(draft.name);
            }}
          >
            <option value="">New draft</option>
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                Overwrite {draft.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Draft name
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        {target ? (
          <p className="schedule-overwrite-warning">
            This replaces revision {target.revision} of “{target.name}”.
            Published shifts are unchanged.
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {target ? "Overwrite draft" : "Save draft"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function PublishScheduleDialog({
  drafts,
  locations,
  onClose,
  onPreview,
  onPublish,
}: {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly locations: readonly ScheduleLocation[];
  readonly onClose: () => void;
  readonly onPreview: (
    draftId: string,
    locationIds: string[],
  ) => Promise<SchedulePublicationPreview>;
  readonly onPublish: (
    preview: SchedulePublicationPreview,
    overrides: SchedulePublicationOverrideInput[],
  ) => Promise<unknown>;
}) {
  const [draftId, setDraftId] = useState(drafts[0]?.id ?? "");
  const [locationIds, setLocationIds] = useState(() =>
    locations.map((location) => location.id),
  );
  const [preview, setPreview] = useState<SchedulePublicationPreview | null>(
    null,
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const softFindings =
    preview?.findings.filter((finding) => finding.severity === "soft") ?? [];
  const hasHardBlocker =
    preview?.findings.some((finding) => finding.severity === "hard") ?? false;
  const reasonsValid = softFindings.every(
    (finding) => (reasons[finding.id] ?? "").trim().length >= 10,
  );

  const toggleLocation = (id: string) => {
    setLocationIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    setPreview(null);
  };
  const loadPreview = async () => {
    setPending(true);
    setError(null);
    try {
      setPreview(await onPreview(draftId, locationIds));
      setReasons({});
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };
  const publish = async () => {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      await onPublish(
        preview,
        softFindings.map((finding) => ({
          finding_id: finding.id,
          reason: reasons[finding.id]!.trim(),
        })),
      );
    } catch (caught) {
      setError((caught as Error).message);
      setPreview(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog title="Publish schedule" onClose={onClose}>
      <div className="schedule-publication-form">
        {!preview ? (
          <>
            <label>
              Saved draft
              <select
                value={draftId}
                onChange={(event) => setDraftId(event.target.value)}
              >
                {drafts.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    {draft.name} · revision {draft.revision}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="schedule-publication-locations">
              <legend>Locations to publish</legend>
              {locations.map((location) => (
                <label
                  key={location.id}
                  className="schedule-publication-location"
                >
                  <input
                    type="checkbox"
                    checked={locationIds.includes(location.id)}
                    onChange={() => toggleLocation(location.id)}
                  />
                  <span>
                    <strong>{location.name}</strong>
                    <small>
                      {location.publication_status === "published"
                        ? "Published now"
                        : "Not published"}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        ) : (
          <div className="schedule-publication-review">
            {preview.status === "past_week_closed" ? (
              <div className="schedule-finding hard">
                <ShieldAlert size={18} />
                <div>
                  <strong>Past week closed</strong>
                  <span>Past schedule weeks cannot be published.</span>
                </div>
              </div>
            ) : null}
            <div className="schedule-publication-diff">
              {preview.locations.map((location) => (
                <section key={location.location_id}>
                  <strong>{location.location_name}</strong>
                  <span>{location.next_shift_count} shifts after publish</span>
                  <dl>
                    <div>
                      <dt>Added</dt>
                      <dd>{location.added}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{location.updated}</dd>
                    </div>
                    <div>
                      <dt>Removed</dt>
                      <dd>{location.removed}</dd>
                    </div>
                    <div>
                      <dt>Unchanged</dt>
                      <dd>{location.unchanged}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
            {preview.findings.map((finding) => (
              <div
                key={finding.id}
                className={`schedule-finding ${finding.severity}`}
              >
                <ShieldAlert size={18} aria-hidden />
                <div>
                  <strong>
                    {finding.severity === "hard"
                      ? "Publication blocked"
                      : "Override required"}
                  </strong>
                  <span>{finding.message}</span>
                  {finding.severity === "soft" ? (
                    <label>
                      Reason
                      <textarea
                        value={reasons[finding.id] ?? ""}
                        minLength={10}
                        maxLength={500}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [finding.id]: event.target.value,
                          }))
                        }
                        placeholder="Explain why this exception is approved"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ))}
            {!preview.findings.length ? (
              <p className="schedule-publication-clear">
                No publication blockers found.
              </p>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          {preview ? (
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          )}
          {preview ? (
            <button
              type="button"
              className="primary"
              disabled={
                pending ||
                hasHardBlocker ||
                !reasonsValid ||
                preview.status === "past_week_closed"
              }
              onClick={() => void publish()}
            >
              <Send size={15} /> {pending ? "Publishing…" : "Publish locations"}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={pending || !draftId || locationIds.length === 0}
              onClick={() => void loadPreview()}
            >
              {pending ? "Checking…" : "Review publication"}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function UnpublishScheduleDialog({
  weekStart,
  locations,
  onClose,
  onPreview,
  onUnpublish,
}: {
  readonly weekStart: string;
  readonly locations: readonly ScheduleLocation[];
  readonly onClose: () => void;
  readonly onPreview: (
    locationIds: string[],
  ) => Promise<ScheduleUnpublishPreview>;
  readonly onUnpublish: (preview: ScheduleUnpublishPreview) => Promise<unknown>;
}) {
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<ScheduleUnpublishPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleLocation = (id: string) =>
    setLocationIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog title="Unpublish schedule" onClose={onClose}>
      <div className="schedule-publication-form">
        {!preview ? (
          <fieldset className="schedule-publication-locations">
            <legend>Published locations for week of {weekStart}</legend>
            {locations.map((location) => (
              <label
                key={location.id}
                className="schedule-publication-location"
              >
                <input
                  type="checkbox"
                  checked={locationIds.includes(location.id)}
                  onChange={() => toggleLocation(location.id)}
                />
                <span>
                  <strong>{location.name}</strong>
                  <small>Published</small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div className="schedule-publication-review">
            {preview.status === "past_week_closed" ? (
              <div className="schedule-finding hard">
                <ShieldAlert size={18} />
                <div>
                  <strong>Past week closed</strong>
                  <span>Past schedule weeks cannot be unpublished.</span>
                </div>
              </div>
            ) : null}
            {preview.locations.map((location) => (
              <section
                key={location.location_id}
                className="schedule-unpublish-summary"
              >
                <div>
                  <strong>{location.location_name}</strong>
                  <span>
                    Version {location.version} · {location.shift_count} shifts
                  </span>
                </div>
                <EyeOff size={18} aria-hidden />
              </section>
            ))}
            {preview.status === "unpublish_ready" ? (
              <p className="schedule-publication-clear">
                Employees will no longer see these shifts. Publication history
                is retained.
              </p>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          {preview ? (
            <button type="button" onClick={() => setPreview(null)}>
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          )}
          {preview ? (
            <button
              type="button"
              className="danger"
              disabled={pending || preview.status !== "unpublish_ready"}
              onClick={() => void run(() => onUnpublish(preview))}
            >
              <EyeOff size={15} />{" "}
              {pending ? "Unpublishing…" : "Confirm unpublish"}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={pending || locationIds.length === 0}
              onClick={() =>
                void run(async () => setPreview(await onPreview(locationIds)))
              }
            >
              {pending ? "Checking…" : "Review unpublish"}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function ScheduleTemplatesDialog({
  templates,
  drafts,
  session,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onApply,
}: {
  readonly templates: readonly ScheduleTemplateSummary[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly session: ScheduleEditSession | null;
  readonly onClose: () => void;
  readonly onCreate: (
    draftId: string,
    name: string,
    stripAssignments: boolean,
  ) => Promise<unknown>;
  readonly onRename: (
    template: ScheduleTemplateSummary,
    name: string,
  ) => Promise<unknown>;
  readonly onDelete: (template: ScheduleTemplateSummary) => Promise<unknown>;
  readonly onApply: (
    templateId: string,
    mode: "merge" | "overwrite",
  ) => Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const [draftId, setDraftId] = useState(drafts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [stripAssignments, setStripAssignments] = useState(true);
  const [rename, setRename] = useState(selected?.name ?? "");
  const [mode, setMode] = useState<"merge" | "overwrite">("merge");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };
  const choose = (template: ScheduleTemplateSummary) => {
    setSelectedId(template.id);
    setRename(template.name);
  };
  return (
    <Dialog title="Schedule templates" onClose={onClose}>
      <div className="schedule-tool-dialog schedule-template-dialog">
        <section>
          <h3>Saved templates</h3>
          <div className="schedule-template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                aria-pressed={template.id === selectedId}
                onClick={() => choose(template)}
              >
                <span>
                  <strong>{template.name}</strong>
                  <small>Revision {template.revision}</small>
                </span>
                <span>
                  {template.shift_count} shifts
                  <br />
                  {template.open_slot_count} open
                </span>
              </button>
            ))}
            {!templates.length ? <p>No templates saved yet.</p> : null}
          </div>
          {selected ? (
            <div className="schedule-template-actions">
              <label>
                Template name
                <input
                  value={rename}
                  maxLength={80}
                  onChange={(event) => setRename(event.target.value)}
                />
              </label>
              <div>
                <button
                  type="button"
                  disabled={pending || !rename.trim()}
                  onClick={() =>
                    void run(() => onRename(selected, rename.trim()))
                  }
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="danger-text"
                  disabled={pending}
                  onClick={() =>
                    window.confirm(`Delete ${selected.name}?`) &&
                    void run(() => onDelete(selected))
                  }
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
              {session ? (
                <>
                  <label>
                    Apply mode
                    <select
                      value={mode}
                      onChange={(event) =>
                        setMode(event.target.value as "merge" | "overwrite")
                      }
                    >
                      <option value="merge">Merge with working copy</option>
                      <option value="overwrite">Replace working copy</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="primary-command"
                    disabled={pending}
                    onClick={() => void run(() => onApply(selected.id, mode))}
                  >
                    Apply template
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await onCreate(draftId, name.trim(), stripAssignments);
              setName("");
            });
          }}
        >
          <h3>Create from named draft</h3>
          <label>
            Draft
            <select
              value={draftId}
              onChange={(event) => setDraftId(event.target.value)}
            >
              <option value="">Select draft</option>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.name} · revision {draft.revision}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template name
            <input
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="schedule-check">
            <input
              type="checkbox"
              checked={stripAssignments}
              onChange={(event) => setStripAssignments(event.target.checked)}
            />{" "}
            Save shifts as open slots
          </label>
          <button
            type="submit"
            className="primary-command"
            disabled={pending || !draftId || !name.trim()}
          >
            Create template
          </button>
        </form>
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function ScheduleAutoFillDialog({
  preview,
  onClose,
  onApply,
}: {
  readonly preview: ScheduleAutoFillPreview;
  readonly onClose: () => void;
  readonly onApply: (
    assignments: ScheduleAutoFillAssignment[],
  ) => Promise<unknown>;
}) {
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      preview.proposals.map((proposal) => [
        proposal.shift_id,
        proposal.recommended_employee_id,
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assignments = preview.proposals.flatMap((proposal) =>
    choices[proposal.shift_id]
      ? [
          {
            shift_id: proposal.shift_id,
            employee_id: choices[proposal.shift_id]!,
          },
        ]
      : [],
  );
  const apply = async () => {
    setPending(true);
    setError(null);
    try {
      await onApply(assignments);
    } catch (caught) {
      setError((caught as Error).message);
      setPending(false);
    }
  };
  return (
    <Dialog title="Review auto-fill" onClose={onClose}>
      <div className="schedule-tool-dialog">
        <p className="schedule-tool-summary">
          {preview.proposals.length} open shifts have eligible candidates. Clear
          a selection to leave that shift open.
        </p>
        <div className="schedule-autofill-list">
          {preview.proposals.map((proposal) => (
            <label key={proposal.shift_id}>
              <span>
                <strong>
                  {proposal.job_name} · {proposal.location_name}
                </strong>
                <small>
                  {proposal.scheduled_date} · {formatTime(proposal.start_time)}–
                  {formatTime(proposal.end_time)}
                </small>
              </span>
              <select
                aria-label={`Assignment for ${proposal.job_name} on ${proposal.scheduled_date}`}
                value={choices[proposal.shift_id] ?? ""}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [proposal.shift_id]: event.target.value,
                  }))
                }
              >
                <option value="">Leave open</option>
                {proposal.candidates.map((candidate) => (
                  <option
                    key={candidate.employee_id}
                    value={candidate.employee_id}
                  >
                    {candidate.employee_name} ·{" "}
                    {(candidate.scheduled_minutes / 60).toFixed(1)}h scheduled
                  </option>
                ))}
              </select>
            </label>
          ))}
          {!preview.proposals.length ? (
            <p>No eligible auto-fill proposals for this working copy.</p>
          ) : null}
          {preview.unfilled.map((item) => (
            <p key={item.shift_id} className="schedule-overwrite-warning">
              Open shift not filled: {item.reason}
            </p>
          ))}
        </div>
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={pending || !assignments.length}
            onClick={() => void apply()}
          >
            {pending ? "Applying…" : `Apply ${assignments.length} assignments`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

const defaultExportSettings: ScheduleExportSettings = {
  format: "csv",
  layout: "weekly",
  time_format: "12h",
  include_unassigned: true,
  include_notes: false,
  include_scheduled_hours: true,
  csv_delimiter: ",",
};

function ScheduleExportDialog({
  weekStart,
  locations,
  drafts,
  presets,
  onClose,
  onPreview,
  onDownload,
  onSavePreset,
  onDeletePreset,
}: {
  readonly weekStart: string;
  readonly locations: readonly ScheduleLocation[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly presets: readonly ScheduleExportPreset[];
  readonly onClose: () => void;
  readonly onPreview: (
    request: ScheduleExportRequest,
  ) => Promise<ScheduleExportPreview>;
  readonly onDownload: (request: ScheduleExportRequest) => Promise<Blob>;
  readonly onSavePreset: (
    name: string,
    settings: ScheduleExportSettings,
  ) => Promise<unknown>;
  readonly onDeletePreset: (presetId: string) => Promise<unknown>;
}) {
  const [source, setSource] = useState("published");
  const [locationIds, setLocationIds] = useState(() =>
    locations.map((item) => item.id),
  );
  const [settings, setSettings] = useState(defaultExportSettings);
  const [preview, setPreview] = useState<ScheduleExportPreview | null>(null);
  const [presetName, setPresetName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request: ScheduleExportRequest = {
    week_start: weekStart,
    source:
      source === "published"
        ? { type: "published" }
        : { type: "draft", draft_id: source },
    location_ids: locationIds,
    settings,
  };
  const changeSettings = (next: Partial<ScheduleExportSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
    setPreview(null);
  };
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  };
  const download = async () => {
    const blob = await onDownload(request);
    const url = URL.createObjectURL(blob);
    if (settings.format === "print")
      window.open(url, "_blank", "noopener,noreferrer");
    else {
      const link = document.createElement("a");
      link.href = url;
      link.download = `schedule-${weekStart}.csv`;
      link.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <Dialog title="Export schedule" onClose={onClose}>
      <div className="schedule-tool-dialog schedule-export-dialog">
        <div className="schedule-export-grid">
          <label>
            Source
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setPreview(null);
              }}
            >
              <option value="published">Published schedule</option>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.name} · revision {draft.revision}
                </option>
              ))}
            </select>
          </label>
          <label>
            Preset
            <select
              defaultValue=""
              onChange={(event) => {
                const preset = presets.find(
                  (item) => item.id === event.target.value,
                );
                if (preset) {
                  setSettings(preset.settings);
                  setPreview(null);
                }
              }}
            >
              <option value="">Custom settings</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select
              value={settings.format}
              onChange={(event) =>
                changeSettings({
                  format: event.target.value as "csv" | "print",
                })
              }
            >
              <option value="csv">CSV</option>
              <option value="print">Print / Save as PDF</option>
            </select>
          </label>
          <label>
            Layout
            <select
              value={settings.layout}
              onChange={(event) =>
                changeSettings({
                  layout: event.target.value as "weekly" | "daily",
                })
              }
            >
              <option value="weekly">Weekly table</option>
              <option value="daily">Daily sections</option>
            </select>
          </label>
          <label>
            Time
            <select
              value={settings.time_format}
              onChange={(event) =>
                changeSettings({
                  time_format: event.target.value as "12h" | "24h",
                })
              }
            >
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </label>
          {settings.format === "csv" ? (
            <label>
              Delimiter
              <select
                value={settings.csv_delimiter}
                onChange={(event) =>
                  changeSettings({
                    csv_delimiter: event.target.value as "," | ";",
                  })
                }
              >
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
              </select>
            </label>
          ) : null}
        </div>
        <fieldset className="schedule-publication-locations">
          <legend>Locations</legend>
          {locations.map((location) => (
            <label key={location.id} className="schedule-publication-location">
              <input
                type="checkbox"
                checked={locationIds.includes(location.id)}
                onChange={() => {
                  setLocationIds((current) =>
                    current.includes(location.id)
                      ? current.filter((id) => id !== location.id)
                      : [...current, location.id],
                  );
                  setPreview(null);
                }}
              />
              <span>
                <strong>{location.name}</strong>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="schedule-export-options">
          <label className="schedule-check">
            <input
              type="checkbox"
              checked={settings.include_unassigned}
              onChange={(event) =>
                changeSettings({ include_unassigned: event.target.checked })
              }
            />{" "}
            Include open shifts
          </label>
          <label className="schedule-check">
            <input
              type="checkbox"
              checked={settings.include_notes}
              onChange={(event) =>
                changeSettings({ include_notes: event.target.checked })
              }
            />{" "}
            Include notes
          </label>
          <label className="schedule-check">
            <input
              type="checkbox"
              checked={settings.include_scheduled_hours}
              onChange={(event) =>
                changeSettings({
                  include_scheduled_hours: event.target.checked,
                })
              }
            />{" "}
            Include scheduled hours
          </label>
        </div>
        <div className="schedule-preset-row">
          <input
            aria-label="Preset name"
            placeholder="Preset name"
            value={presetName}
            maxLength={80}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <button
            type="button"
            disabled={pending || !presetName.trim()}
            onClick={() =>
              void run(async () => {
                await onSavePreset(presetName.trim(), settings);
                setPresetName("");
              })
            }
          >
            Save preset
          </button>
        </div>
        {presets.length ? (
          <div className="schedule-preset-list">
            {presets.map((preset) => (
              <span key={preset.id}>
                {preset.name}
                <button
                  type="button"
                  aria-label={`Delete ${preset.name}`}
                  onClick={() =>
                    void run(async () => {
                      await onDeletePreset(preset.id);
                    })
                  }
                >
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {preview ? (
          <section className="schedule-export-preview">
            <strong>
              {preview.summary.shift_count} shifts ·{" "}
              {preview.summary.employee_count} employees ·{" "}
              {(preview.summary.scheduled_minutes / 60).toFixed(2)} hours
            </strong>
            <span>{preview.locations.map((item) => item.name).join(", ")}</span>
            <div>
              {preview.rows.slice(0, 5).map((row) => (
                <p key={row.shift_id}>
                  <span>{row.scheduled_date}</span>
                  <strong>{row.employee_name ?? "Open shift"}</strong>
                  <span>
                    {row.job_name} · {formatTime(row.start_time)}
                  </span>
                </p>
              ))}
            </div>
          </section>
        ) : null}
        {error ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {preview ? (
            <button
              type="button"
              className="primary"
              disabled={pending}
              onClick={() => void run(download)}
            >
              <FileDown size={15} />{" "}
              {settings.format === "csv" ? "Download CSV" : "Open print view"}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={pending || !locationIds.length}
              onClick={() =>
                void run(async () => setPreview(await onPreview(request)))
              }
            >
              {pending ? "Preparing…" : "Preview export"}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function MessageDialog({
  title,
  detail,
  onClose,
}: {
  readonly title: string;
  readonly detail: string;
  readonly onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="schedule-dialog-message">{detail}</p>
      <div className="schedule-dialog-actions">
        <button type="button" className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

function IdleDialog({
  seconds,
  onContinue,
}: {
  readonly seconds: number;
  readonly onContinue: () => void;
}) {
  return (
    <Dialog title="Editing session inactive" onClose={onContinue}>
      <p className="schedule-dialog-message">
        This editing session will close in {seconds} seconds. Unsaved changes
        will be recovered as a draft if the lease expires.
      </p>
      <div className="schedule-dialog-actions">
        <button type="button" className="primary" onClick={onContinue}>
          Continue editing
        </button>
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="schedule-dialog-layer" role="presentation">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <section
        className="schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-dialog-title"
      >
        <header>
          <h2 id="schedule-dialog-title">{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function toMutation(
  shift: ScheduleShift,
  overrides: Partial<ScheduleShiftMutationInput> = {},
): ScheduleShiftMutationInput {
  return {
    location_id: shift.location_id,
    employee_id: shift.employee_id,
    job_id: shift.job_id,
    shift_type_id: shift.shift_type_id,
    scheduled_date: shift.scheduled_date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    note: shift.note,
    ...overrides,
  };
}

function filterModel(
  model: ScheduleReadModel,
  search: URLSearchParams,
): ScheduleReadModel {
  const locationIds = validIds(
    search.get("locations"),
    model.locations.map((item) => item.id),
  );
  const jobIds = validIds(
    search.get("jobs"),
    model.jobs.map((item) => item.id),
  );
  const shiftTypeIds = validIds(
    search.get("shiftTypes"),
    model.shift_types.map((item) => item.id),
  );
  const employeeIds = validIds(
    search.get("employees"),
    model.employees.map((item) => item.id),
  );
  const locations = locationIds.length
    ? model.locations.filter((item) => locationIds.includes(item.id))
    : model.locations;
  const shifts = model.shifts.filter(
    (shift) =>
      locations.some((location) => location.id === shift.location_id) &&
      (!jobIds.length || jobIds.includes(shift.job_id)) &&
      (!shiftTypeIds.length ||
        (shift.shift_type_id !== null &&
          shiftTypeIds.includes(shift.shift_type_id))) &&
      (!employeeIds.length ||
        (shift.employee_id !== null &&
          employeeIds.includes(shift.employee_id))),
  );
  const employees = model.employees.filter(
    (employee) =>
      (!employeeIds.length || employeeIds.includes(employee.id)) &&
      (!jobIds.length || employee.job_ids.some((id) => jobIds.includes(id))) &&
      employee.location_ids.some((id) =>
        locations.some((location) => location.id === id),
      ),
  );
  return { ...model, locations, employees, shifts };
}

function ScheduleState({
  title,
  detail,
  error = false,
}: {
  readonly title: string;
  readonly detail: string;
  readonly error?: boolean;
}) {
  return (
    <section className="schedule-state" role={error ? "alert" : "status"}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </section>
  );
}

function parseIds(value: string | null): string[] {
  return value?.split(",").filter(Boolean) ?? [];
}
function closeScheduleMenu(target: HTMLElement): void {
  target.closest("details")?.removeAttribute("open");
}
function validIds(value: string | null, allowed: readonly string[]): string[] {
  return parseIds(value).filter((id) => allowed.includes(id));
}
function hasFilters(search: URLSearchParams): boolean {
  return ["locations", "shiftTypes", "jobs", "employees"].some((key) =>
    search.has(key),
  );
}
function validDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function currentWeekStart(
  today: string,
  weekStartDay: ScheduleReadModel["week_start_day"],
): string {
  const date = new Date(`${today}T12:00:00Z`);
  const day = date.getUTCDay();
  const offset = weekStartDay === "sunday" ? day : (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}
function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}
function formatDateNumber(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function formatPeriod(
  selected: string,
  weekStart: string,
  view: ScheduleView,
): string {
  return view === "day"
    ? new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : `${formatDateNumber(weekStart)} – ${new Date(`${addDays(weekStart, 6)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}
function formatTime(value: string): string {
  const [hour, minute] = value.split(":").map(Number);
  const suffix = (hour ?? 0) >= 12 ? "p" : "a";
  const display = (hour ?? 0) % 12 || 12;
  return minute
    ? `${display}:${String(minute).padStart(2, "0")}${suffix}`
    : `${display}${suffix}`;
}
function shiftHours(shift: ScheduleShift): number {
  const [startHour, startMinute] = shift.start_time.split(":").map(Number);
  const [endHour, endMinute] = shift.end_time.split(":").map(Number);
  let minutes = endHour! * 60 + endMinute! - (startHour! * 60 + startMinute!);
  if (minutes <= 0) minutes += 1440;
  return minutes / 60;
}

export default SchedulePage;
