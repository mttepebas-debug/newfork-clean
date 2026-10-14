// The New Schedule window. Stands in for
// apps/web/src/schedule/components/DraftDropdownMenu on the test page. Original:
// main's menu. A and B: one wide table of this week's schedules that also runs
// Export and Templates. Every action goes to the page's own handlers; Export and
// Templates reach the window through ./bridge (main's panel and dialog hand over
// their props instead of drawing themselves). A template is shown and edited on
// the grid like a draft (the mock serves it under its own id); ./save-draft-menu
// saves such an edit back into the template.
import type { ScheduleDraftSummary, ScheduleTemplateSummary } from "@newfork/shared/schedule";
import { ConfirmButton, useConfirmClick } from "@newfork/ui";
import {
  ArrowLeft, CalendarCheck2, CalendarDays, Check, ChevronDown, CircleDot, Eye, FileDown, FilePlus2, Layers, Lock, MoreHorizontal, Pencil, TextCursorInput, Trash2, Undo2, X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DraftDropdownMenu as Original } from "../../../src/schedule/components/DraftDropdownMenu";
import { TEMPLATE_NO_DEPARTMENT_KEY } from "../../../src/schedule/components/ScheduleTemplateDialogs";
import { SCHEDULE_ACTION_BUTTON_CLASS } from "../../../src/schedule/lib/scheduleActionButton";
import { requestErrorText } from "../../../src/lib/request-error";
import { exportSlot, templatesSlot, type TemplatesProps } from "./bridge";
import { ago, plural, useScheduleList, type ScheduleFacts } from "./common";
import { ExportPane, SourceChip, type ExportProps } from "./export";
import { useChoice } from "./store";
import { templateNames } from "./template-store";
import "./variants.css";

interface Extra {
  /** The page's own Export opener (patched in by vite.config.ts). */
  readonly stOpenExport?: () => void;
  /** The page's own Templates opener; the draft id preselects "save as template". */
  readonly stOpenTemplates?: (draftId: string | null) => void;
}
type Props = ComponentProps<typeof Original> & Extra;

export function DraftDropdownMenu({ stOpenExport, stOpenTemplates, ...props }: Props): JSX.Element {
  const choice = useChoice("newSchedule");
  if (choice === "original") return <Original {...props} />;
  return <Prototype {...props} variant={choice} openExport={stOpenExport} openTemplates={stOpenTemplates} />;
}

/**
 * "Use" outside an edit: the schedule picked for it opens for editing first; once
 * the edit is open the window comes back at this template's Add / Replace step.
 */
let pendingUse: string | null = null;

interface Row {
  readonly kind: "live" | "draft";
  readonly id: string | null;
  readonly name: string;
  readonly draft: ScheduleDraftSummary | null;
  readonly facts: ScheduleFacts | null;
  readonly by: string | null;
  readonly changed: string;
  readonly viewing: boolean;
}

type Step =
  | { readonly kind: "table" }
  | { readonly kind: "export"; readonly rowName: string }
  | { readonly kind: "save"; readonly draftId: string | null }
  | { readonly kind: "use"; readonly templateId: string };
type Tab = "schedules" | "templates" | "export";

function Prototype(props: Omit<Props, keyof Extra> & {
  readonly variant: string;
  readonly openExport?: () => void;
  readonly openTemplates?: (draftId: string | null) => void;
}): JSX.Element {
  const {
    drafts, activeDraftId, triggerLabel, highlightTrigger = false, canEditPublishedSchedule = false, publishedSchedule = null,
    onOpen, onOpenChange, dismissSignal = 0, topActionId, onPreviewDraft, onEditDraft,
    onStartBlankDraft, onEditPublishedSchedule, onDeleteDraft, onUnpublishSchedule, canManageDrafts = true, canStartDraft = true,
    isStartingDraft = false, variant, openExport, openTemplates,
  } = props;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "table" });
  const [tab, setTab] = useState<Tab>("schedules");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const quietUntil = useRef(0);
  const exportProps = exportSlot.use();
  const templateProps = templatesSlot.use();
  const names = templateNames.use();
  // A template on the grid (preview or edit) is named as one in the top bar.
  const templateEntry = activeDraftId ? names.get(activeDraftId) ?? null : null;
  const templateOnScreen = templateEntry?.name ?? null;
  const label = templateOnScreen !== null ? `Template · ${templateOnScreen}` : triggerLabel.trim() || "New Schedule";
  const editing = !canManageDrafts;
  const editDisabled = !canStartDraft || isStartingDraft;
  const publishedDraftId = publishedSchedule?.source_draft_id ?? null;
  const list = useScheduleList(drafts[0]?.week_start ?? null, `${open}:${drafts.map((draft) => `${draft.id}${draft.revision}`).join()}`);
  const triggerDisabled = drafts.length === 0 && !publishedSchedule && (!canManageDrafts || editDisabled);

  // Rows: the live schedule first, then the drafts that are not live.
  const publishedSource = publishedSchedule ?? (list?.published
    ? { published_at: list.published.published_at, published_by_name: list.published.published_by_name, source_draft_id: null, source_draft_name: null }
    : null);
  const liveDraft = publishedDraftId ? drafts.find((draft) => draft.id === publishedDraftId) ?? null : null;
  const rows: Row[] = [
    ...(publishedSource ? [{
      kind: "live" as const, id: liveDraft?.id ?? null, name: liveDraft?.name ?? publishedSource.source_draft_name ?? "Published schedule",
      draft: liveDraft, facts: list?.published ?? null, by: publishedSource.published_by_name ?? null,
      changed: ago(publishedSource.published_at),
      // While a new blank edit is open nothing saved is on screen.
      viewing: editing ? Boolean(liveDraft) && activeDraftId === liveDraft?.id : activeDraftId === (liveDraft?.id ?? null),
    }] : []),
    ...drafts.filter((draft) => draft.id !== publishedDraftId).map((draft) => ({
      kind: "draft" as const, id: draft.id, name: draft.name, draft, facts: list?.drafts.find((item) => item.id === draft.id) ?? null,
      by: list?.drafts.find((item) => item.id === draft.id)?.updated_by_name ?? null,
      changed: ago(draft.updated_at), viewing: activeDraftId === draft.id,
    })),
  ];
  const viewingRow = rows.find((row) => row.viewing) ?? rows[0] ?? null;

  // The page's own openers close other top-bar surfaces (this window included); those closes are ignored.
  const quietly = (action: () => void) => {
    quietUntil.current = Date.now() + 800;
    action();
  };
  const loadTemplates = () => openTemplates && quietly(() => openTemplates(null));
  const startExport = (row: Row | null) => {
    if (row && !row.viewing) onPreviewDraft(row.id);
    if (openExport) quietly(openExport);
  };
  const closeFlows = () => {
    exportSlot.get()?.onClose();
    templatesSlot.get()?.onClose();
  };
  const close = () => {
    setOpen(false);
    closeFlows();
  };
  const show = (next: { step?: Step; tab?: Tab } = {}) => {
    setStep(next.step ?? { kind: "table" });
    setTab(next.tab ?? "schedules");
    setOpen(true);
  };

  useEffect(() => onOpenChange?.(open), [onOpenChange, open]);
  useEffect(() => {
    if (Date.now() < quietUntil.current) return;
    setOpen(false);
  }, [dismissSignal]);

  // A view that lists templates loads them; Export loads only when asked for.
  const view: "table" | "export" | "templates" = variant === "b" ? (tab === "export" ? "export" : tab === "templates" || step.kind !== "table" ? "templates" : "table") : step.kind === "export" ? "export" : "templates";
  useEffect(() => {
    if (open && view !== "export" && !templateProps && openTemplates) loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, templateProps]);

  // Export or Templates opened some other way (a link, the save-then-export step): show it here.
  const lastExport = useRef<ExportProps | null>(null);
  useEffect(() => {
    const appeared = exportProps && !lastExport.current;
    lastExport.current = exportProps;
    if (appeared && !open) show({ step: { kind: "export", rowName: viewingRow?.name ?? "This week" }, tab: "export" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportProps]);

  // The top bar and the save button tell a template from a schedule by the names the window lists.
  useEffect(() => {
    if (templateProps) templateNames.set(templateProps.templates);
  }, [templateProps]);

  // "Use" outside an edit: once the picked schedule is open for editing, come back at Add / Replace.
  useEffect(() => {
    if (!pendingUse || !editing) return;
    const templateId = pendingUse;
    pendingUse = null;
    window.setTimeout(() => quietly(() => show({ step: { kind: "use", templateId }, tab: "templates" })), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element;
      if (rootRef.current?.contains(target) || layerRef.current?.contains(target)) return;
      if (target.closest?.("[data-sonner-toaster], #schedule-test-panel, .app-confirm, [role=dialog][aria-modal=true]")) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // An armed two-click button takes Escape for itself (it only disarms).
      if ((event.target as Element | null)?.closest?.('[data-confirming="true"]')) return;
      event.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape, true);
    };
  });

  const ctx: Ctx = {
    rows, editing, editDisabled, isStartingDraft, viewingRow,
    activeDraftId: activeDraftId ?? null,
    editingName: drafts.find((draft) => draft.id === activeDraftId)?.name ?? templateOnScreen,
    editingTemplate: editing && templateOnScreen !== null,
    weekStart: list?.week_start ?? drafts[0]?.week_start ?? null,
    exportProps, templateProps, drafts,
    view: (row) => { onPreviewDraft(row.id); close(); },
    canEdit: (row) => canManageDrafts && (row.kind === "draft" || (canEditPublishedSchedule && Boolean(onEditPublishedSchedule))),
    edit: (row) => {
      if (editDisabled) return;
      close();
      if (row.kind === "live") onEditPublishedSchedule?.();
      else onEditDraft(row.id);
    },
    canDelete: (row) => Boolean(onDeleteDraft && canManageDrafts && row.kind === "draft" && row.draft),
    remove: (row) => { if (row.draft) onDeleteDraft?.(row.draft); },
    canUnpublish: (row) => Boolean(row.kind === "live" && onUnpublishSchedule && canManageDrafts),
    unpublish: () => { close(); onUnpublishSchedule?.(); },
    blank: () => { close(); onStartBlankDraft(); },
    previewTemplate: (templateId) => {
      if (editing) return;
      onPreviewDraft(templateId);
      close();
    },
    editTemplate: (templateId) => {
      if (editing || editDisabled) return;
      close();
      onEditDraft(templateId);
    },
    useInto: (templateId, row) => {
      if (editing || editDisabled) return;
      pendingUse = templateId;
      close();
      if (!row) onStartBlankDraft();
      else if (row.kind === "live") onEditPublishedSchedule?.();
      else onEditDraft(row.id);
    },
    saveThenExport: () => {
      close();
      openExport?.();
    },
    exportRow: (row) => {
      startExport(row);
      if (variant === "b") setTab("export");
      else setStep({ kind: "export", rowName: row?.name ?? "This week" });
    },
    step, setStep: (next) => {
      if (next.kind !== "export" && exportSlot.get()) exportSlot.get()?.onClose();
      setStep(next);
    },
    tab, setTab: (next) => {
      // While editing, the tab only explains; "Save draft and export" starts the save.
      if (next === "export" && !editing) startExport(viewingRow);
      else if (exportSlot.get()) exportSlot.get()?.onClose();
      setStep({ kind: "table" });
      setTab(next);
    },
    close,
  };

  return (
    <div className="schedule-draft-menu" ref={rootRef}>
      <button
        type="button"
        className={`schedule-draft-menu-trigger ${SCHEDULE_ACTION_BUTTON_CLASS}${highlightTrigger ? " schedule-new-schedule-highlight" : ""}`}
        data-schedule-top-action-trigger={topActionId}
        aria-label={`Draft selector: ${label}`}
        aria-expanded={open}
        disabled={triggerDisabled}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          void onOpen?.();
          show();
        }}
      >
        <span>{label}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {templateOnScreen !== null ? createPortal(
        <div className="stv-tpl-bar" role="status" data-editing={editing}>
          <Layers size={15} aria-hidden />
          {editing ? (
            <span><b>Editing template · {templateOnScreen}</b>Changes go into the template, not into this week. Save template keeps them; Discard drops them.</span>
          ) : (
            <>
              <span>
                <b>Template preview · {templateOnScreen}</b>Nothing is saved or published.
                {/* As on every schedule, the Unassigned row shows only while editing. */}
                {templateEntry?.open_slot_count ? ` Its ${plural(templateEntry.open_slot_count, "open shift")} show when you edit it.` : null}
              </span>
              <button type="button" className="secondary-button stv-btn" disabled={editDisabled} onClick={() => activeDraftId && onEditDraft(activeDraftId)}><Pencil size={14} aria-hidden />Edit template</button>
              <button type="button" className="secondary-button stv-btn" onClick={() => onPreviewDraft(null)}><X size={14} aria-hidden />Close preview</button>
            </>
          )}
        </div>,
        document.body,
      ) : null}
      {/* The top bar's blur makes "fixed" relative to the bar, so the window lives on <body>. */}
      {open ? createPortal(
        <div ref={layerRef}>
          <Layer>
            <section className="stv-panel stv-nt" role="dialog" aria-label={`Schedules for ${weekText(ctx.weekStart)}`} data-variant={variant} data-export={!editing && (variant === "b" ? tab === "export" : step.kind === "export")}>
              {variant === "b" ? <TabsWindow {...ctx} /> : <RowMenuWindow {...ctx} />}
            </section>
          </Layer>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

/** Fixed under the New Schedule button, right edges aligned; follows resize and scroll. */
function Layer({ children }: { readonly children: ReactNode }) {
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = document.querySelector('[data-schedule-top-action-trigger="new-schedule"]');
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setBox({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, []);
  if (!box) return null;
  return <div className="stv-nt-layer" style={{ top: box.top, right: box.right }}>{children}</div>;
}

interface Ctx {
  readonly rows: readonly Row[];
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly editing: boolean;
  readonly editingName: string | null;
  /** The edit on screen is a template's. */
  readonly editingTemplate: boolean;
  readonly activeDraftId: string | null;
  readonly editDisabled: boolean;
  readonly isStartingDraft: boolean;
  readonly viewingRow: Row | null;
  readonly weekStart: string | null;
  readonly exportProps: ExportProps | null;
  readonly templateProps: TemplatesProps | null;
  readonly view: (row: Row) => void;
  readonly canEdit: (row: Row) => boolean;
  readonly edit: (row: Row) => void;
  readonly canDelete: (row: Row) => boolean;
  readonly remove: (row: Row) => void;
  readonly canUnpublish: (row: Row) => boolean;
  readonly unpublish: () => void;
  readonly blank: () => void;
  /** Lays a template on the week on screen, read-only. */
  readonly previewTemplate: (templateId: string) => void;
  /** Opens a template for editing on the grid; it saves with "Save template". */
  readonly editTemplate: (templateId: string) => void;
  /** "Use" outside an edit: opens the picked schedule (null: a new blank one) for editing, then Add / Replace. */
  readonly useInto: (templateId: string, row: Row | null) => void;
  readonly exportRow: (row: Row | null) => void;
  /** While editing: the page's own Export opener asks to save a draft, then opens the export. */
  readonly saveThenExport: () => void;
  readonly step: Step;
  readonly setStep: (step: Step) => void;
  readonly tab: Tab;
  readonly setTab: (tab: Tab) => void;
  readonly close: () => void;
}

function weekText(weekStart: string | null): string {
  if (!weekStart) return "this week";
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const month = (date: Date) => date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month(start)} ${start.getUTCDate()} – ${month(end) === month(start) ? "" : `${month(end)} `}${end.getUTCDate()}`;
}

// ---------- pieces both windows share ----------

/** The window's top row. B puts its tabs where the title would be. */
function Head({ ctx, children, lead, action }: {
  readonly ctx: Ctx; readonly children?: ReactNode; readonly lead?: ReactNode;
  /** Takes the place of "New blank schedule" (B's Templates tab: "Save template"). */
  readonly action?: ReactNode;
}) {
  return (
    <header className={`stv-nt-head${lead ? " has-tabs" : ""}`}>
      {lead ?? <strong>Schedules · {weekText(ctx.weekStart)}</strong>}
      <span className="stv-nt-head-tools">
        {children}
        {action !== undefined ? action : ctx.editing ? null : (
          <button type="button" className="nf-button stv-nt-blank" disabled={ctx.editDisabled} onClick={ctx.blank}>
            {/* B's tab row is narrower: the short label keeps the Export tab in view. */}
            <FilePlus2 size={15} aria-hidden />{ctx.isStartingDraft ? "Starting…" : lead ? "Blank schedule" : "New blank schedule"}
          </button>
        )}
        <button type="button" className="stv-ns-icon" aria-label="Close" title="Close" onClick={ctx.close}><X size={16} aria-hidden /></button>
      </span>
    </header>
  );
}

function EditingNotice({ ctx }: { readonly ctx: Ctx }) {
  const name = ctx.editingName;
  return (
    <p className="stv-ns-editing" role="status">
      <Lock size={14} aria-hidden />
      {ctx.editingTemplate ? (
        <span>You are editing the template <strong>{name}</strong>. Save or discard it before you open a schedule or another template.</span>
      ) : (
        <span>You are editing {name ? <strong>{name}</strong> : "this week"}. Publish, save or discard it before you start or edit another schedule.</span>
      )}
    </p>
  );
}

function StepHead({ ctx, title, back }: { readonly ctx: Ctx; readonly title: ReactNode; readonly back: () => void }) {
  return (
    <header className="stv-nt-head is-step">
      <button type="button" className="stv-nt-back" onClick={back}><ArrowLeft size={15} aria-hidden />Schedules</button>
      <strong>{title}</strong>
      <span className="stv-nt-head-tools">
        <button type="button" className="stv-ns-icon" aria-label="Close" title="Close" onClick={ctx.close}><X size={16} aria-hidden /></button>
      </span>
    </header>
  );
}

function Status({ row }: { readonly row: Row }) {
  return row.kind === "live" ? <span className="stv-pill is-live"><CircleDot size={11} aria-hidden />Live</span> : <span className="stv-pill">Draft</span>;
}

function Table({ ctx, tools }: { readonly ctx: Ctx; readonly tools: (row: Row) => ReactNode }) {
  if (!ctx.rows.length) return <p className="stv-ns-empty">No schedules for this week yet. Start a blank one or use a template.</p>;
  return (
    <div className="stv-nt-scroll">
      <table className="stv-ns3-table stv-nt-table">
        <thead>
          <tr><th>Name</th><th>Status</th><th className="num">Shifts</th><th className="num">Hours</th><th className="num">Open</th><th>Last change</th><th><span className="sr-only">Actions</span></th></tr>
        </thead>
        <tbody>
          {ctx.rows.map((row) => (
            <tr key={row.id ?? "live"} data-viewing={row.viewing} onClick={() => ctx.view(row)}>
              <td className="name">
                <button type="button" className="stv-ns3-name" title={row.name} onClick={(event) => { event.stopPropagation(); ctx.view(row); }}>{row.name}</button>
                {row.viewing ? <small>{ctx.editing ? "Editing" : "On screen"}</small> : null}
              </td>
              <td><Status row={row} /></td>
              <td className="num">{row.facts?.shift_count ?? "…"}</td>
              <td className="num">{row.facts ? Math.round(row.facts.hours) : "…"}</td>
              <td className="num">{row.facts?.open_shift_count ?? "…"}</td>
              <td className="when" title={row.by ? `${row.kind === "live" ? "Published" : "Saved"} by ${row.by}` : undefined}>{row.changed}</td>
              <td className="tools" onClick={(event) => event.stopPropagation()}>
                {ctx.canEdit(row) ? (
                  <button type="button" className="stv-ns-icon" aria-label={row.kind === "live" ? "Edit live schedule" : `Edit ${row.name}`} title="Edit" disabled={ctx.editDisabled} onClick={() => ctx.edit(row)}><Pencil size={14} aria-hidden /></button>
                ) : null}
                {tools(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * B's Schedules tab: the same compact rows as Templates (Mert, 2026-10-12 17:00 PT):
 * name with status and last change under it, shifts, hours, edit, unpublish or delete.
 */
function ScheduleRows({ ctx }: { readonly ctx: Ctx }) {
  if (!ctx.rows.length) return <p className="stv-ns-empty">No schedules for this week yet. Start a blank one or use a template.</p>;
  return (
    <ul className="stv-nt-templates is-schedules">
      {ctx.rows.map((row) => (
        <li
          key={row.id ?? "live"}
          data-viewing={row.viewing}
          data-clickable="true"
          // A click on the row (not on its buttons) shows that schedule on the grid.
          onClick={(event) => {
            if ((event.target as Element).closest("button")) return;
            ctx.view(row);
          }}
        >
          <span className="stv-nt-template-name">
            {row.kind === "live" ? <CalendarCheck2 size={14} aria-hidden className="is-live" /> : <CalendarDays size={14} aria-hidden />}
            <button type="button" className="stv-nt-template-open" title={`Show ${row.name} on the grid`} onClick={() => ctx.view(row)}>
              <b>{row.name}</b>
              {row.viewing ? <em>{ctx.editing ? "Editing" : "On screen"}</em> : null}
            </button>
            <small>
              {row.kind === "live" ? <span className="is-live">Live</span> : "Draft"}
              {" · "}{row.kind === "live" ? "published" : "saved"}{row.by ? ` by ${row.by},` : ""} {row.changed}
            </small>
          </span>
          <span className="stv-nt-num"><b>{row.facts?.shift_count ?? "…"}</b> shifts</span>
          <span className="stv-nt-num"><b>{row.facts ? Math.round(row.facts.hours) : "…"}</b> h</span>
          {ctx.canEdit(row) ? (
            <button type="button" className="stv-ns-icon" aria-label={row.kind === "live" ? "Edit live schedule" : `Edit ${row.name}`} title="Edit" disabled={ctx.editDisabled} onClick={() => ctx.edit(row)}><Pencil size={14} aria-hidden /></button>
          ) : <span />}
          {ctx.canUnpublish(row) ? (
            <button type="button" className="stv-ns-icon is-danger" aria-label="Unpublish schedule" title="Unpublish" onClick={ctx.unpublish}><Undo2 size={14} aria-hidden /></button>
          ) : ctx.canDelete(row) ? <DeleteDraft ctx={ctx} row={row} /> : <span />}
        </li>
      ))}
    </ul>
  );
}

function DeleteDraft({ ctx, row }: { readonly ctx: Ctx; readonly row: Row }) {
  if (!ctx.canDelete(row)) return null;
  return (
    <ConfirmButton
      unstyled
      className="stv-ns-icon is-danger"
      aria-label={`Delete ${row.name}`}
      title="Delete"
      confirmName={`Confirm delete ${row.name}`}
      confirmLabel={<Check size={14} aria-hidden />}
      onConfirm={() => ctx.remove(row)}
    >
      <Trash2 size={14} aria-hidden />
    </ConfirmButton>
  );
}

/** A small menu fixed next to its button, so the table's scroll never cuts it. */
function Menu({ label, children }: { readonly label: string; readonly children: (close: () => void) => ReactNode }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!at) return;
    const away = (event: PointerEvent) => {
      if (menu.current?.contains(event.target as Node) || button.current?.contains(event.target as Node)) return;
      setAt(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [at]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="stv-ns-icon"
        aria-label={label}
        title="More"
        aria-haspopup="menu"
        aria-expanded={Boolean(at)}
        onClick={() => {
          if (at) return setAt(null);
          const rect = button.current!.getBoundingClientRect();
          setAt({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        }}
      >
        <MoreHorizontal size={15} aria-hidden />
      </button>
      {at ? (
        <div ref={menu} className="stv-nt-menu" role="menu" style={{ top: at.top, right: at.right }}>
          {children(() => setAt(null))}
        </div>
      ) : null}
    </>
  );
}

// ---------- Templates ----------

function templateLine(template: ScheduleTemplateSummary): string {
  return `${plural(template.shift_count, "shift")} · ${template.open_slot_count} open · saved by ${template.created_by_name}, ${ago(template.updated_at)}`;
}

function TemplateRows({ ctx, compact = false }: { readonly ctx: Ctx; readonly compact?: boolean }) {
  const props = ctx.templateProps;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!props) return <p className="stv-ns-empty">Loading templates…</p>;
  if (!props.templates.length) {
    return <p className="stv-ns-empty">No templates yet. Save a draft as a template to reuse its week.</p>;
  }
  const run = (action: Promise<unknown>) => {
    setError(null);
    return action.then(() => setRenaming(null), (caught: unknown) => setError(requestErrorText(caught)));
  };
  return (
    <>
      <ul className={`stv-nt-templates${compact ? " is-compact" : ""}`}>
        {props.templates.map((template) => {
          const onScreen = ctx.activeDraftId === template.id;
          return (
          <li
            key={template.id}
            data-viewing={onScreen}
            data-clickable={!ctx.editing && renaming !== template.id}
            // A click on the row (not on its buttons) lays the template on the grid.
            onClick={(event) => {
              if (renaming === template.id || (event.target as Element).closest("button, input, form, [role=menu]")) return;
              ctx.previewTemplate(template.id);
            }}
          >
            {renaming === template.id ? (
              <form className="stv-nt-rename" onSubmit={(event) => { event.preventDefault(); void run(props.onRename(template, name.trim())); }}>
                <label className="sr-only" htmlFor={`stv-rename-${template.id}`}>Template name</label>
                <input id={`stv-rename-${template.id}`} value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} />
                <button type="submit" className="nf-button stv-btn" disabled={!name.trim()}>Save</button>
                <button type="button" className="secondary-button stv-btn" onClick={() => setRenaming(null)}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="stv-nt-template-name">
                  <Layers size={14} aria-hidden />
                  <button
                    type="button"
                    className="stv-nt-template-open"
                    disabled={ctx.editing}
                    title={ctx.editing ? "Save or discard your edit to preview a template." : `Show ${template.name} on the grid`}
                    onClick={() => ctx.previewTemplate(template.id)}
                  >
                    <b>{template.name}</b>
                    {onScreen ? <em>{ctx.editing ? "Editing" : "On screen"}</em> : null}
                  </button>
                  <small>{templateLine(template)}</small>
                </span>
                <button
                  type="button"
                  className="secondary-button stv-btn"
                  disabled={ctx.editingTemplate && onScreen}
                  title={ctx.editingTemplate && onScreen ? "This is the template you are editing." : undefined}
                  onClick={() => ctx.setStep({ kind: "use", templateId: template.id })}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="stv-ns-icon"
                  aria-label={`Edit template ${template.name}`}
                  title={ctx.editing ? "Save or discard your edit first." : "Edit template"}
                  disabled={ctx.editing || ctx.editDisabled}
                  onClick={() => ctx.editTemplate(template.id)}
                >
                  <Pencil size={14} aria-hidden />
                </button>
                <Menu label={`More for ${template.name}`}>
                  {(closeMenu) => (
                    <>
                      <button type="button" role="menuitem" onClick={() => { closeMenu(); setName(template.name); setRenaming(template.id); }}><TextCursorInput size={14} aria-hidden />Rename</button>
                      <ConfirmButton unstyled className="stv-nt-menu-danger" confirmLabel={<><Trash2 size={14} aria-hidden />Click again to delete</>} onConfirm={() => { closeMenu(); void run(props.onDelete(template)); }}>
                        <Trash2 size={14} aria-hidden />Delete
                      </ConfirmButton>
                    </>
                  )}
                </Menu>
              </>
            )}
          </li>
          );
        })}
      </ul>
      {error ? <p className="stv-un-error" role="alert">{error}</p> : null}
    </>
  );
}

function SaveTemplate({ ctx, draftId: initialDraftId, onDone, onCancel, focus = false }: {
  readonly ctx: Ctx; readonly draftId: string | null; readonly onDone: () => void;
  readonly onCancel?: () => void; readonly focus?: boolean;
}) {
  const props = ctx.templateProps;
  const [draftId, setDraftId] = useState(initialDraftId ?? ctx.drafts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [strip, setStrip] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!props) return <p className="stv-ns-empty">Loading…</p>;
  return (
    <form
      className="stv-nt-form"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        props.onCreate(draftId, name.trim(), strip).then(() => { setName(""); onDone(); }, (caught: unknown) => setError(requestErrorText(caught))).finally(() => setPending(false));
      }}
    >
      <label>
        <span>Draft</span>
        <select value={draftId} onChange={(event) => setDraftId(event.target.value)}>
          <option value="">Select draft</option>
          {ctx.drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.name}</option>)}
        </select>
      </label>
      <label>
        <span>Template name</span>
        <input value={name} maxLength={80} required placeholder="Regular week" autoFocus={focus} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="stv-nt-check">
        <input type="checkbox" checked={strip} onChange={(event) => setStrip(event.target.checked)} />
        Remove employee names (save as open shifts)
      </label>
      {error ? <p className="stv-un-error" role="alert">{error}</p> : null}
      <div className="stv-nt-actions">
        {onCancel ? <button type="button" className="secondary-button stv-btn" onClick={onCancel}>Cancel</button> : null}
        <button type="submit" className="nf-button stv-btn" disabled={pending || !draftId || !name.trim()}>{pending ? "Saving…" : "Save template"}</button>
      </div>
    </form>
  );
}

function ReplaceButton({ props, templateId, departmentKeys, disabled, onConfirm }: {
  readonly props: TemplatesProps; readonly templateId: string; readonly departmentKeys: readonly string[] | null;
  readonly disabled: boolean; readonly onConfirm: () => void;
}) {
  const { armed, confirmProps } = useConfirmClick(onConfirm);
  const [removed, setRemoved] = useState<number | null>(null);
  useEffect(() => {
    if (!armed) return;
    let current = true;
    setRemoved(null);
    props.onPreviewReplace(templateId, departmentKeys).then((count) => current && setRemoved(count), () => undefined);
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);
  return (
    <>
      {armed ? <span className="stv-nt-impact" role="status">{removed === null ? "Counting the shifts it removes…" : `${plural(removed, "shift")} will be removed. Draft only, not published.`}</span> : null}
      <button type="button" className={`stv-btn stv-danger${armed ? " is-armed" : ""}`} disabled={disabled} data-confirming={armed} {...confirmProps}>
        {armed ? "Confirm replace" : "Replace current shifts"}
      </button>
    </>
  );
}

function UseTemplate({ ctx, templateId, onDone }: { readonly ctx: Ctx; readonly templateId: string; readonly onDone: () => void }) {
  const props = ctx.templateProps;
  const template = props?.templates.find((item) => item.id === templateId) ?? null;
  const departments = [
    ...(props?.departments ?? []).map((department) => ({ key: department.id, label: department.name })),
    ...(props?.departments?.length ? [{ key: TEMPLATE_NO_DEPARTMENT_KEY, label: "No department" }] : []),
  ];
  const [chosen, setChosen] = useState<readonly string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!props) return <p className="stv-ns-empty">Loading…</p>;
  if (!template) return <p className="stv-ns-empty">This template is gone. Go back to the list.</p>;
  const keys = chosen ?? departments.map((department) => department.key);
  const keysForApply = keys.length === departments.length ? null : keys;
  const apply = (mode: "merge" | "overwrite") => {
    setPending(true);
    setError(null);
    props.onApply(template.id, mode, keysForApply).then(onDone, (caught: unknown) => setError(requestErrorText(caught))).finally(() => setPending(false));
  };
  const what = <><b>{template.name}</b>: {plural(template.shift_count, "shift")}, {template.open_slot_count} open.</>;
  if (!ctx.editing) return <UseTarget ctx={ctx} template={template} what={what} />;
  const hasShifts = Boolean(props.session?.shifts.length);
  return (
    <div className="stv-nt-use">
      <p>{what} It goes into the schedule you are editing; employees see it after you publish.</p>
      {departments.length ? (
        <details className="stv-nt-departments">
          <summary>Only some departments</summary>
          <div>
            {departments.map((department) => (
              <label key={department.key}>
                <input type="checkbox" checked={keys.includes(department.key)} onChange={() => setChosen(keys.includes(department.key) ? keys.filter((key) => key !== department.key) : [...keys, department.key])} />
                {department.label}
              </label>
            ))}
          </div>
        </details>
      ) : null}
      {hasShifts ? <p className="stv-muted">This schedule already has shifts. Add keeps them; Replace first removes the ones this template covers that haven't started.</p> : null}
      {error ? <p className="stv-un-error" role="alert">{error}</p> : null}
      <div className="stv-nt-actions">
        {hasShifts ? <ReplaceButton props={props} templateId={template.id} departmentKeys={keysForApply} disabled={pending || !keys.length} onConfirm={() => apply("overwrite")} /> : null}
        <button type="button" className="nf-button stv-btn" disabled={pending || !keys.length} onClick={() => apply("merge")}>{hasShifts ? "Add to current shifts" : "Apply template"}</button>
      </div>
    </div>
  );
}

/** "Use" outside an edit: which schedule the template goes into. It opens for editing, then Add / Replace. */
function UseTarget({ ctx, template, what }: { readonly ctx: Ctx; readonly template: ScheduleTemplateSummary; readonly what: ReactNode }) {
  const blank = { key: "new", row: null, label: "New blank draft" };
  const options = [
    ...ctx.rows.filter((row) => ctx.canEdit(row)).map((row) => ({ key: row.id ?? "live", row, label: row.name })),
    blank,
  ];
  // The schedule on screen when it can be edited; otherwise a new blank draft.
  const first = options.find((option) => option.row?.viewing) ?? blank;
  const [key, setKey] = useState(first.key);
  const picked = options.find((option) => option.key === key) ?? first;
  return (
    <div className="stv-nt-use">
      <p>{what}</p>
      <fieldset className="stv-nt-target">
        <legend>Which schedule should it go into?</legend>
        {options.map((option) => (
          <label key={option.key}>
            <input type="radio" name={`stv-use-${template.id}`} checked={option.key === key} onChange={() => setKey(option.key)} />
            <span title={option.label}>{option.label}</span>
            {option.row ? <Status row={option.row} /> : <FilePlus2 size={14} aria-hidden />}
            {option.row?.viewing ? <small>On screen</small> : null}
          </label>
        ))}
      </fieldset>
      <p className="stv-muted">It opens for editing, then you choose to add the template's shifts or replace the ones it covers. Employees see nothing until you publish.</p>
      <div className="stv-nt-actions">
        <button type="button" className="nf-button stv-btn" disabled={ctx.editDisabled} onClick={() => ctx.useInto(template.id, picked.row)}>
          <Pencil size={14} aria-hidden />Open for editing
        </button>
      </div>
    </div>
  );
}

// ---------- Export ----------

function ExportStep({ ctx }: { readonly ctx: Ctx }) {
  // As on main: export always shows what is on the grid. While editing, the page's own
  // "save, then export" step saves the edit as a draft and opens the export with it.
  if (ctx.editing) {
    if (ctx.editingTemplate) {
      return <p className="stv-ns-editing" role="status"><Lock size={14} aria-hidden /><span>Save or discard the template edit to export a schedule.</span></p>;
    }
    return (
      <div className="stv-nt-use">
        <p className="stv-ns-editing" role="status"><Lock size={14} aria-hidden /><span>Export shows what is on the grid. Save this edit as a draft and the export opens with it.</span></p>
        <div className="stv-nt-actions">
          <button type="button" className="nf-button stv-btn" onClick={ctx.saveThenExport}><FileDown size={14} aria-hidden />Save draft and export</button>
        </div>
      </div>
    );
  }
  if (!ctx.exportProps) return <p className="stv-ns-empty">Getting the export ready…</p>;
  return (
    <>
      <div className="stv-nt-source">
        <SourceChip {...ctx.exportProps} />
        <span className="stv-muted">The grid behind shows what you export.</span>
      </div>
      <ExportPane props={ctx.exportProps} />
    </>
  );
}

// ---------- A · Table with a row menu ----------

function RowMenuWindow(ctx: Ctx) {
  const { step } = ctx;
  const back = () => ctx.setStep({ kind: "table" });
  if (step.kind === "export") {
    return <><StepHead ctx={ctx} title={<>Export</>} back={back} /><div className="stv-nt-body"><ExportStep ctx={ctx} /></div></>;
  }
  if (step.kind === "save") {
    return <><StepHead ctx={ctx} title="Save as template" back={back} /><div className="stv-nt-body"><SaveTemplate ctx={ctx} draftId={step.draftId} onDone={back} /></div></>;
  }
  if (step.kind === "use") {
    return <><StepHead ctx={ctx} title="Use template" back={back} /><div className="stv-nt-body"><UseTemplate ctx={ctx} templateId={step.templateId} onDone={ctx.close} /></div></>;
  }
  return (
    <>
      <Head ctx={ctx} />
      {ctx.editing ? <EditingNotice ctx={ctx} /> : null}
      <Table
        ctx={ctx}
        tools={(row) => (
          <Menu label={`More for ${row.name}`}>
            {(closeMenu) => (
              <>
                <button type="button" role="menuitem" onClick={() => { closeMenu(); ctx.view(row); }}><Eye size={14} aria-hidden />Show on grid</button>
                <button type="button" role="menuitem" disabled={ctx.editing} title={ctx.editing ? "Save or publish your edit first." : undefined} onClick={() => { closeMenu(); ctx.exportRow(row); }}><FileDown size={14} aria-hidden />Export…</button>
                <button type="button" role="menuitem" disabled={!row.id} title={row.id ? undefined : "This live schedule has no saved draft to copy."} onClick={() => { closeMenu(); ctx.setStep({ kind: "save", draftId: row.id }); }}><Layers size={14} aria-hidden />Save as template…</button>
                {ctx.canUnpublish(row) ? <button type="button" role="menuitem" className="stv-nt-menu-danger" onClick={() => { closeMenu(); ctx.unpublish(); }}><Undo2 size={14} aria-hidden />Unpublish…</button> : null}
                {ctx.canDelete(row) ? (
                  <ConfirmButton unstyled className="stv-nt-menu-danger" confirmLabel={<><Trash2 size={14} aria-hidden />Click again to delete</>} onConfirm={() => { closeMenu(); ctx.remove(row); }}>
                    <Trash2 size={14} aria-hidden />Delete draft
                  </ConfirmButton>
                ) : null}
              </>
            )}
          </Menu>
        )}
      />
      <section className="stv-nt-section" aria-label="Templates">
        <h3>Templates</h3>
        <TemplateRows ctx={ctx} compact />
      </section>
      <footer className="stv-nt-foot"><span className="stv-muted">Click a row to see it on the grid.</span></footer>
    </>
  );
}

// ---------- B · Table with tabs ----------

function TabsWindow(ctx: Ctx) {
  const { tab, step } = ctx;
  // The count never blinks out while the template list reloads, so the tabs never shift.
  const knownTemplates = templateNames.use();
  const count = ctx.templateProps?.templates.length ?? knownTemplates.size;
  // Templates tab: "Save template" at the top right opens the form under the list.
  const [saving, setSaving] = useState(false);
  useEffect(() => setSaving(false), [tab]);
  const onTemplates = tab === "templates" && step.kind !== "use";
  return (
    <>
      <Head
        ctx={ctx}
        action={tab !== "templates" ? undefined : onTemplates ? (
          <button type="button" className="nf-button stv-nt-blank" aria-expanded={saving} disabled={!ctx.drafts.length} title={ctx.drafts.length ? undefined : "Save a draft first."} onClick={() => setSaving(true)}>
            <Layers size={15} aria-hidden />Save template
          </button>
        ) : null}
        lead={(
          <div className="stv-nt-tabs" role="tablist" aria-label={`Schedule tools for ${weekText(ctx.weekStart)}`}>
            {([["schedules", "Schedules", ctx.rows.length], ["templates", "Templates", count], ["export", "Export", null]] as const).map(([key, text, n]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => ctx.setTab(key)}>
                {text}{typeof n === "number" ? <span className="stv-nt-count">{n}</span> : null}
              </button>
            ))}
          </div>
        )}
      />
      {ctx.editing && (tab === "schedules" || (tab === "templates" && ctx.editingTemplate && step.kind !== "use")) ? <EditingNotice ctx={ctx} /> : null}
      {tab === "schedules" ? (
        <div className="stv-nt-body">
          <ScheduleRows ctx={ctx} />
        </div>
      ) : null}
      {tab === "templates" ? (
        <div className="stv-nt-body">
          {step.kind === "use" ? (
            <>
              <button type="button" className="stv-nt-back" onClick={() => ctx.setStep({ kind: "table" })}><ArrowLeft size={15} aria-hidden />All templates</button>
              <UseTemplate ctx={ctx} templateId={step.templateId} onDone={ctx.close} />
            </>
          ) : (
            <>
              <TemplateRows ctx={ctx} />
              {saving ? (
                <section className="stv-nt-section is-form" aria-label="Save a draft as a template" ref={(node) => node?.scrollIntoView({ block: "nearest" })}>
                  <h3>Save a draft as a template</h3>
                  <SaveTemplate ctx={ctx} focus draftId={ctx.viewingRow?.kind === "draft" ? ctx.viewingRow.id : null} onDone={() => setSaving(false)} onCancel={() => setSaving(false)} />
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {tab === "export" ? (
        <div className="stv-nt-body">
          {ctx.editing ? null : (
            <div className="stv-nt-pick" role="radiogroup" aria-label="Schedule to export">
              <span className="stv-nt-label">Schedule</span>
              {ctx.rows.map((row) => (
                <button key={row.id ?? "live"} type="button" role="radio" aria-checked={row.viewing} onClick={() => ctx.exportRow(row)}>
                  {row.kind === "live" ? <CircleDot size={12} aria-hidden /> : null}<span title={row.name}>{row.name}</span>
                </button>
              ))}
            </div>
          )}
          <ExportStep ctx={ctx} />
        </div>
      ) : null}
    </>
  );
}
