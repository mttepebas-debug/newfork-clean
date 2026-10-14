// Item 2: the New Schedule window. Stands in for
// apps/web/src/schedule/components/DraftDropdownMenu on the test page: the
// original menu or one of five prototypes, all wired to the page's real
// handlers (view, edit, start blank, delete, unpublish, save as template).
import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import {
  CalendarDays, Check, ChevronDown, CircleDot, Eye, FilePlus2, Layers, LayoutTemplate, Lock, MapPin, MoreHorizontal,
  Pencil, Trash2, Undo2, Users, X,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DraftDropdownMenu as Original } from "../../../src/schedule/components/DraftDropdownMenu";
import { SCHEDULE_ACTION_BUTTON_CLASS } from "../../../src/schedule/lib/scheduleActionButton";
import { ago, hoursText, plural, shortDateTime, useScheduleList, type ScheduleFacts } from "./common";
import { useChoice } from "./store";
import "./variants.css";

type Props = ComponentProps<typeof Original>;

export function DraftDropdownMenu(props: Props): JSX.Element {
  const choice = useChoice("newSchedule");
  if (choice === "original") return <Original {...props} />;
  return <Prototype {...props} variant={choice} />;
}

interface Row {
  readonly kind: "live" | "draft";
  readonly id: string | null;
  readonly name: string;
  readonly draft: ScheduleDraftSummary | null;
  readonly facts: ScheduleFacts | null;
  readonly meta: string;
  readonly when: string;
  readonly by: string | null;
  readonly viewing: boolean;
}

function Prototype(props: Props & { readonly variant: string }): JSX.Element {
  const {
    drafts, activeDraftId, triggerLabel, highlightTrigger = false, canEditPublishedSchedule = false, publishedSchedule = null,
    publishedLocationStatuses = [], onOpen, onOpenChange, dismissSignal = 0, topActionId, onPreviewDraft, onEditDraft,
    onStartBlankDraft, onEditPublishedSchedule, onDeleteDraft, onUnpublishSchedule, onSaveAsTemplate,
    saveAsTemplateDisabledReason = null, canManageDrafts = true, canStartDraft = true, isStartingDraft = false, variant,
  } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const label = triggerLabel.trim() || "New Schedule";
  const editDisabled = !canStartDraft || isStartingDraft;
  const editing = !canManageDrafts;
  const publishedDraftId = publishedSchedule?.source_draft_id ?? null;
  const list = useScheduleList(drafts[0]?.week_start ?? null, `${open}:${drafts.map((draft) => `${draft.id}${draft.revision}`).join()}`);
  const triggerDisabled = drafts.length === 0 && !publishedSchedule && (!canManageDrafts || editDisabled);

  useEffect(() => onOpenChange?.(open), [onOpenChange, open]);
  useEffect(() => setOpen(false), [dismissSignal]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || layerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const closeAfter = (action: () => void) => {
    action();
    setOpen(false);
  };
  const liveFacts = list?.published ?? null;
  const factsFor = (id: string) => list?.drafts.find((item) => item.id === id) ?? null;
  const liveDraft = publishedDraftId ? drafts.find((draft) => draft.id === publishedDraftId) ?? null : null;
  // While editing, the page passes no publication summary; the list route still knows it.
  const publishedSource = publishedSchedule ?? (list?.published
    ? { published_at: list.published.published_at, published_by_name: list.published.published_by_name, source_draft_id: null, source_draft_name: null }
    : null);
  const live: Row | null = publishedSource
    ? {
        kind: "live", id: liveDraft?.id ?? null, name: liveDraft?.name ?? publishedSource.source_draft_name ?? "Published schedule",
        draft: liveDraft, facts: liveFacts, by: publishedSource.published_by_name ?? null,
        meta: `Published by ${publishedSource.published_by_name ?? "Unknown"} · ${shortDateTime(publishedSource.published_at)}`,
        when: `Published ${ago(publishedSource.published_at)}`,
        viewing: activeDraftId === (liveDraft?.id ?? null),
      }
    : null;
  const draftRows: Row[] = drafts.filter((draft) => draft.id !== publishedDraftId).map((draft) => ({
    kind: "draft", id: draft.id, name: draft.name, draft, facts: factsFor(draft.id), by: null,
    meta: `Revision ${draft.revision} · edited ${ago(draft.updated_at)}`, when: `Edited ${ago(draft.updated_at)}`,
    viewing: activeDraftId === draft.id,
  }));
  const locationName = (id: string) => publishedLocationStatuses.find((status) => status.id === id)?.name ?? list?.locations.find((item) => item.id === id)?.name ?? null;
  const locationColor = (id: string) => publishedLocationStatuses.find((status) => status.id === id)?.color ?? list?.locations.find((item) => item.id === id)?.color ?? "var(--theme-swatch-fallback)";
  const weekStart = list?.week_start ?? drafts[0]?.week_start ?? null;

  const actions = {
    view: (row: Row) => closeAfter(() => onPreviewDraft(row.id)),
    canEdit: (row: Row) => canManageDrafts && (row.kind === "draft" || (canEditPublishedSchedule && Boolean(onEditPublishedSchedule))),
    edit: (row: Row) => {
      if (editDisabled) return;
      closeAfter(() => (row.kind === "live" ? onEditPublishedSchedule?.() : onEditDraft(row.id)));
    },
    canDelete: (row: Row) => Boolean(onDeleteDraft && canManageDrafts && row.kind === "draft" && row.draft),
    remove: (row: Row) => row.draft && onDeleteDraft?.(row.draft),
    canUnpublish: (row: Row) => Boolean(row.kind === "live" && onUnpublishSchedule && canManageDrafts),
    unpublish: () => onUnpublishSchedule && closeAfter(onUnpublishSchedule),
    blank: () => closeAfter(onStartBlankDraft),
    template: () => onSaveAsTemplate && closeAfter(onSaveAsTemplate),
    openTemplates: () => closeAfter(() => document.querySelector<HTMLButtonElement>('[data-schedule-top-action-trigger="templates"]')?.click()),
  };
  const shared: ViewProps = {
    live, draftRows, editing, editingName: drafts.find((draft) => draft.id === activeDraftId)?.name ?? null, actions, editDisabled, isStartingDraft, weekStart, locationName, locationColor,
    saveAsTemplate: onSaveAsTemplate && canManageDrafts ? { disabledReason: saveAsTemplateDisabledReason } : null,
    close: () => setOpen(false),
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
          const next = !open;
          setOpen(next);
          if (next) void onOpen?.();
        }}
      >
        <span>{label}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && variant !== "v5" ? (
        <div ref={layerRef}>
          {variant === "v1" ? <CleanList {...shared} /> : null}
          {variant === "v2" ? <Cards {...shared} /> : null}
          {variant === "v3" ? <WideTable {...shared} /> : null}
          {variant === "v4" ? <Tabs {...shared} /> : null}
        </div>
      ) : null}
      {/* The top bar's blur makes "fixed" relative to the bar, so the drawer lives on <body>. */}
      {open && variant === "v5" ? createPortal(<div ref={layerRef}><Drawer {...shared} /></div>, document.body) : null}
    </div>
  );
}

interface ViewProps {
  readonly live: Row | null;
  readonly draftRows: readonly Row[];
  readonly editing: boolean;
  readonly editingName: string | null;
  readonly editDisabled: boolean;
  readonly isStartingDraft: boolean;
  readonly weekStart: string | null;
  readonly saveAsTemplate: { readonly disabledReason: string | null } | null;
  readonly locationName: (id: string) => string | null;
  readonly locationColor: (id: string) => string;
  readonly close: () => void;
  readonly actions: {
    view: (row: Row) => void; canEdit: (row: Row) => boolean; edit: (row: Row) => void; canDelete: (row: Row) => boolean;
    remove: (row: Row) => void; canUnpublish: (row: Row) => boolean; unpublish: () => void; blank: () => void;
    template: () => void; openTemplates: () => void;
  };
}

function weekText(weekStart: string | null): string {
  if (!weekStart) return "This week";
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const month = (date: Date) => date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month(start)} ${start.getUTCDate()} – ${month(end) === month(start) ? "" : `${month(end)} `}${end.getUTCDate()}`;
}

function EditingNotice({ name }: { readonly name: string | null }) {
  return (
    <p className="stv-ns-editing" role="status">
      <Lock size={14} aria-hidden />
      <span>
        You are editing {name ? <strong>{name}</strong> : "this week"}. Publish, save or discard it before you start or edit another schedule.
      </span>
    </p>
  );
}

function BlankButton({ view, wide = true }: { readonly view: ViewProps; readonly wide?: boolean }) {
  if (view.editing) return null;
  return (
    <button type="button" className={`nf-button stv-ns-blank${wide ? " is-wide" : ""}`} disabled={view.editDisabled} onClick={view.actions.blank}>
      <FilePlus2 size={15} aria-hidden />
      {view.isStartingDraft ? "Starting schedule…" : "New blank schedule"}
    </button>
  );
}

function SaveTemplateLink({ view }: { readonly view: ViewProps }) {
  if (!view.saveAsTemplate) return null;
  return (
    <button type="button" className="stv-link" disabled={Boolean(view.saveAsTemplate.disabledReason)} title={view.saveAsTemplate.disabledReason ?? undefined} onClick={view.actions.template}>
      <Layers size={14} aria-hidden /> Save the viewed draft as a template
    </button>
  );
}

function DeleteButton({ view, row, compact = false }: { readonly view: ViewProps; readonly row: Row; readonly compact?: boolean }) {
  if (!view.actions.canDelete(row)) return null;
  return (
    <ConfirmButton
      unstyled
      className={`stv-ns-icon is-danger${compact ? "" : " has-text"}`}
      aria-label={`Delete ${row.name}`}
      confirmName={`Confirm delete ${row.name}`}
      confirmLabel={compact ? <Check size={14} aria-hidden /> : "Delete?"}
      onClick={(event) => event.stopPropagation()}
      onConfirm={() => view.actions.remove(row)}
    >
      <Trash2 size={14} aria-hidden />
      {compact ? null : "Delete"}
    </ConfirmButton>
  );
}

function Status({ row }: { readonly row: Row }) {
  return row.kind === "live" ? <span className="stv-pill is-live"><CircleDot size={11} aria-hidden />Live</span> : <span className="stv-pill">Draft</span>;
}

function factsLine(facts: ScheduleFacts | null): string {
  if (!facts) return "…";
  return [plural(facts.shift_count, "shift"), hoursText(facts.hours), facts.open_shift_count ? `${facts.open_shift_count} open` : null].filter(Boolean).join(" · ");
}

// ---------- 1 · Clean list ----------
function CleanList(view: ViewProps) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const rowView = (row: Row) => {
    const key = row.id ?? "live";
    const more = view.actions.canDelete(row) || view.actions.canUnpublish(row);
    return (
      <div key={key} className="stv-ns1-row" data-viewing={row.viewing} role="button" tabIndex={0} aria-label={`View ${row.name}`}
        onClick={() => view.actions.view(row)}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            view.actions.view(row);
          }
        }}>
        <div className="stv-ns1-text">
          <strong>{row.kind === "live" ? <i className="stv-dot is-live" aria-hidden /> : null}{row.name}</strong>
          <small>{row.viewing ? <b>Viewing · </b> : null}{row.kind === "live" ? row.meta : row.when} · {factsLine(row.facts)}</small>
        </div>
        <div className="stv-ns1-tools" onClick={(event) => event.stopPropagation()}>
          {view.actions.canEdit(row) ? (
            <button type="button" className="stv-ns-text" disabled={view.editDisabled} onClick={() => view.actions.edit(row)}>
              Edit
            </button>
          ) : null}
          {more ? (
            <button type="button" className="stv-ns-icon" aria-label={`More for ${row.name}`} aria-expanded={menuFor === key} onClick={() => setMenuFor(menuFor === key ? null : key)}>
              <MoreHorizontal size={15} aria-hidden />
            </button>
          ) : null}
          {menuFor === key ? (
            <div className="stv-ns1-more">
              {view.actions.canUnpublish(row) ? (
                <button type="button" className="is-danger" onClick={view.actions.unpublish}><Undo2 size={14} aria-hidden />Unpublish…</button>
              ) : null}
              <DeleteButton view={view} row={row} />
            </div>
          ) : null}
        </div>
      </div>
    );
  };
  return (
    <div className="stv-ns-panel stv-ns1" role="dialog" aria-label="Schedules for this week">
      <header className="stv-ns-head"><strong>Schedules · {weekText(view.weekStart)}</strong></header>
      {view.editing ? <EditingNotice name={view.editingName} /> : null}
      {view.live ? <><h3 className="stv-ns-section">Live</h3>{rowView(view.live)}</> : <p className="stv-ns-empty">Nothing is published for this week.</p>}
      <h3 className="stv-ns-section">Drafts <span>{view.draftRows.length}</span></h3>
      {view.draftRows.length ? view.draftRows.map(rowView) : <p className="stv-ns-empty">No saved drafts for this week.</p>}
      <footer className="stv-ns-foot">
        <BlankButton view={view} />
        <SaveTemplateLink view={view} />
      </footer>
    </div>
  );
}

// ---------- 2 · Live + draft cards ----------
function Stat({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return <div className="stv-stat"><b>{value}</b><span>{label}</span></div>;
}

function Cards(view: ViewProps) {
  const card = (row: Row) => (
    <article key={row.id ?? "live"} className="stv-ns2-card" data-kind={row.kind} data-viewing={row.viewing}>
      <header>
        <Status row={row} />
        {row.viewing ? <span className="stv-pill is-viewing"><Eye size={11} aria-hidden />On screen</span> : null}
        <small>{row.kind === "live" ? `${row.when} by ${row.by ?? "Unknown"}` : row.when}</small>
      </header>
      <h4>{row.name}</h4>
      {row.kind === "live" ? (
        <div className="stv-stats">
          <Stat label="shifts" value={row.facts?.shift_count ?? "…"} />
          <Stat label="hours" value={row.facts ? Math.round(row.facts.hours) : "…"} />
          <Stat label="people" value={row.facts?.employee_count ?? "…"} />
          <Stat label="open" value={row.facts?.open_shift_count ?? "…"} />
        </div>
      ) : (
        <p className="stv-ns2-line">{factsLine(row.facts)}{row.facts ? ` · ${plural(row.facts.employee_count, "person", "people")}` : ""}</p>
      )}
      {row.facts && row.facts.location_ids.length ? (
        <div className="stv-locs">
          {row.facts.location_ids.map((id) => <span key={id}><i style={{ background: view.locationColor(id) }} aria-hidden />{view.locationName(id) ?? "Location"}</span>)}
        </div>
      ) : null}
      <footer>
        <button type="button" className="secondary-button stv-btn" disabled={row.viewing} onClick={() => view.actions.view(row)}>
          <Eye size={14} aria-hidden />{row.viewing ? "On screen" : "View"}
        </button>
        {view.actions.canEdit(row) ? (
          <button type="button" className="secondary-button stv-btn" disabled={view.editDisabled} onClick={() => view.actions.edit(row)}>
            <Pencil size={14} aria-hidden />{row.kind === "live" ? "Edit live" : "Edit"}
          </button>
        ) : null}
        <span className="stv-grow" />
        {view.actions.canUnpublish(row) ? (
          <button type="button" className="stv-ns-icon is-danger has-text" onClick={view.actions.unpublish}><Undo2 size={14} aria-hidden />Unpublish</button>
        ) : null}
        <DeleteButton view={view} row={row} compact />
      </footer>
    </article>
  );
  return (
    <div className="stv-ns-panel stv-ns2" role="dialog" aria-label="Schedules for this week">
      <header className="stv-ns-head"><strong>Week of {weekText(view.weekStart)}</strong><BlankButton view={view} wide={false} /></header>
      {view.editing ? <EditingNotice name={view.editingName} /> : null}
      <h3 className="stv-ns-section">Live now</h3>
      {view.live ? card(view.live) : <p className="stv-ns-empty">Nothing is published for this week yet.</p>}
      <h3 className="stv-ns-section">Drafts <span>{view.draftRows.length}</span></h3>
      {view.draftRows.length ? view.draftRows.map(card) : <p className="stv-ns-empty">No saved drafts for this week.</p>}
      <footer className="stv-ns-foot"><SaveTemplateLink view={view} /></footer>
    </div>
  );
}

// ---------- 3 · Wide table ----------
function WideTable(view: ViewProps) {
  const rows = [...(view.live ? [view.live] : []), ...view.draftRows];
  return (
    <div className="stv-ns-panel stv-ns3" role="dialog" aria-label="Schedules for this week">
      <header className="stv-ns-head">
        <strong>Schedules for {weekText(view.weekStart)}</strong>
        <BlankButton view={view} wide={false} />
      </header>
      {view.editing ? <EditingNotice name={view.editingName} /> : null}
      {rows.length ? (
        <table className="stv-ns3-table">
          <thead>
            <tr><th>Name</th><th>Status</th><th className="num">Shifts</th><th className="num">Hours</th><th className="num">Open</th><th>Last change</th><th><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id ?? "live"} data-viewing={row.viewing} onClick={() => view.actions.view(row)}>
                <td className="name"><button type="button" className="stv-ns3-name" onClick={(event) => { event.stopPropagation(); view.actions.view(row); }}>{row.name}</button>{row.viewing ? <small>On screen</small> : null}</td>
                <td><Status row={row} /></td>
                <td className="num">{row.facts?.shift_count ?? "…"}</td>
                <td className="num">{row.facts ? Math.round(row.facts.hours) : "…"}</td>
                <td className="num">{row.facts?.open_shift_count ?? "…"}</td>
                <td className="when">{row.kind === "live" ? `${row.by ?? "Unknown"}, ${row.when.replace("Published ", "")}` : row.when.replace("Edited ", "")}</td>
                <td className="tools" onClick={(event) => event.stopPropagation()}>
                  {view.actions.canEdit(row) ? (
                    <button type="button" className="stv-ns-icon" aria-label={row.kind === "live" ? "Edit live schedule" : `Edit ${row.name}`} title="Edit" disabled={view.editDisabled} onClick={() => view.actions.edit(row)}><Pencil size={14} aria-hidden /></button>
                  ) : null}
                  {view.actions.canUnpublish(row) ? (
                    <button type="button" className="stv-ns-icon is-danger" aria-label="Unpublish schedule" title="Unpublish" onClick={view.actions.unpublish}><Undo2 size={14} aria-hidden /></button>
                  ) : null}
                  <DeleteButton view={view} row={row} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="stv-ns-empty">No schedules for this week yet.</p>}
      <footer className="stv-ns-foot is-row"><span className="stv-muted">Click a row to see it on the grid.</span><SaveTemplateLink view={view} /></footer>
    </div>
  );
}

// ---------- 4 · Tabs ----------
function Tabs(view: ViewProps) {
  const viewingDraft = view.draftRows.some((row) => row.viewing);
  const [tab, setTab] = useState<"live" | "drafts" | "new">(viewingDraft || !view.live ? "drafts" : "live");
  const tabs: { key: typeof tab; label: ReactNode; hidden?: boolean }[] = [
    { key: "live", label: "Live" },
    { key: "drafts", label: <>Drafts <span className="stv-count">{view.draftRows.length}</span></> },
    { key: "new", label: "+ New", hidden: view.editing },
  ];
  return (
    <div className="stv-ns-panel stv-ns4" role="dialog" aria-label="Schedules for this week">
      <header className="stv-ns-head"><strong>Week of {weekText(view.weekStart)}</strong></header>
      {view.editing ? <EditingNotice name={view.editingName} /> : null}
      <div className="stv-seg" role="tablist">
        {tabs.filter((item) => !item.hidden).map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>{item.label}</button>
        ))}
      </div>
      {tab === "live" ? (
        view.live ? (
          <div className="stv-ns4-live">
            <h4><i className="stv-dot is-live" aria-hidden />{view.live.name}</h4>
            <p className="stv-muted">{view.live.meta}</p>
            <div className="stv-stats">
              <Stat label="shifts" value={view.live.facts?.shift_count ?? "…"} />
              <Stat label="hours" value={view.live.facts ? Math.round(view.live.facts.hours) : "…"} />
              <Stat label="people" value={view.live.facts?.employee_count ?? "…"} />
              <Stat label="open" value={view.live.facts?.open_shift_count ?? "…"} />
            </div>
            <div className="stv-ns4-actions">
              <button type="button" className="secondary-button stv-btn" disabled={view.live.viewing} onClick={() => view.actions.view(view.live!)}><Eye size={14} aria-hidden />{view.live.viewing ? "On screen" : "View"}</button>
              {view.actions.canEdit(view.live) ? <button type="button" className="secondary-button stv-btn" disabled={view.editDisabled} onClick={() => view.actions.edit(view.live!)}><Pencil size={14} aria-hidden />Edit live</button> : null}
              <span className="stv-grow" />
              {view.actions.canUnpublish(view.live) ? <button type="button" className="stv-ns-icon is-danger has-text" onClick={view.actions.unpublish}><Undo2 size={14} aria-hidden />Unpublish</button> : null}
            </div>
          </div>
        ) : <p className="stv-ns-empty">Nothing is published for this week. Open a draft and publish it.</p>
      ) : null}
      {tab === "drafts" ? (
        view.draftRows.length ? (
          <div className="stv-ns4-list">
            {view.draftRows.map((row) => (
              <div key={row.id} className="stv-ns4-row" data-viewing={row.viewing}>
                <button type="button" className="stv-ns4-main" onClick={() => view.actions.view(row)}>
                  <strong>{row.name}</strong>
                  <small>{row.viewing ? "On screen · " : ""}{row.when} · {factsLine(row.facts)}</small>
                </button>
                {view.actions.canEdit(row) ? <button type="button" className="stv-ns-icon" aria-label={`Edit ${row.name}`} title="Edit" disabled={view.editDisabled} onClick={() => view.actions.edit(row)}><Pencil size={14} aria-hidden /></button> : null}
                <DeleteButton view={view} row={row} compact />
              </div>
            ))}
            <SaveTemplateLink view={view} />
          </div>
        ) : <p className="stv-ns-empty">No saved drafts for this week. Start one from “+ New”.</p>
      ) : null}
      {tab === "new" ? (
        <div className="stv-ns4-new">
          <button type="button" className="stv-choice" disabled={view.editDisabled} onClick={view.actions.blank}>
            <FilePlus2 size={18} aria-hidden /><span><strong>{view.isStartingDraft ? "Starting…" : "Blank week"}</strong><small>An empty grid for this week</small></span>
          </button>
          <button type="button" className="stv-choice" onClick={view.actions.openTemplates}>
            <LayoutTemplate size={18} aria-hidden /><span><strong>From a template</strong><small>Opens Templates</small></span>
          </button>
          {view.live && view.actions.canEdit(view.live) ? (
            <button type="button" className="stv-choice" disabled={view.editDisabled} onClick={() => view.actions.edit(view.live!)}>
              <Pencil size={18} aria-hidden /><span><strong>Change the live schedule</strong><small>Edit what employees see now</small></span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------- 5 · Side drawer ----------
function Drawer(view: ViewProps) {
  const rows = [...(view.live ? [view.live] : []), ...view.draftRows];
  const initial = rows.find((row) => row.viewing) ?? rows[0] ?? null;
  const [selectedKey, setSelectedKey] = useState(initial ? initial.id ?? "live" : null);
  const selected = rows.find((row) => (row.id ?? "live") === selectedKey) ?? null;
  return (
    <aside className="stv-ns5" role="dialog" aria-label="Schedules for this week">
      <header className="stv-ns5-head">
        <div><small>Schedules</small><strong><CalendarDays size={16} aria-hidden />{weekText(view.weekStart)}</strong></div>
        <button type="button" className="icon-button" aria-label="Close" onClick={view.close}><X size={18} aria-hidden /></button>
      </header>
      {view.editing ? <EditingNotice name={view.editingName} /> : null}
      <div className="stv-ns5-list" role="listbox" aria-label="Schedules">
        {rows.map((row) => (
          <button key={row.id ?? "live"} type="button" role="option" aria-selected={selected === row} className="stv-ns5-item" data-kind={row.kind}
            onClick={() => setSelectedKey(row.id ?? "live")} onDoubleClick={() => view.actions.view(row)}>
            <span className="stv-ns5-rail" aria-hidden />
            <span className="stv-ns5-text">
              <strong>{row.name}</strong>
              <small>{row.kind === "live" ? "Live" : "Draft"} · {row.when}{row.viewing ? " · on screen" : ""}</small>
            </span>
          </button>
        ))}
        {!rows.length ? <p className="stv-ns-empty">No schedules for this week yet.</p> : null}
      </div>
      {selected ? (
        <section className="stv-ns5-detail" aria-label={selected.name}>
          <Status row={selected} />
          <h4>{selected.name}</h4>
          <p className="stv-muted">{selected.meta}</p>
          <div className="stv-stats">
            <Stat label="shifts" value={selected.facts?.shift_count ?? "…"} />
            <Stat label="hours" value={selected.facts ? Math.round(selected.facts.hours) : "…"} />
            <Stat label="people" value={selected.facts?.employee_count ?? "…"} />
            <Stat label="open" value={selected.facts?.open_shift_count ?? "…"} />
          </div>
          {selected.facts ? (
            <ul className="stv-ns5-locs">
              {selected.facts.by_location.filter((item) => item.shift_count).map((item) => (
                <li key={item.location_id}><i style={{ background: view.locationColor(item.location_id) }} aria-hidden /><MapPin size={13} aria-hidden />
                  <span>{view.locationName(item.location_id) ?? "Location"}</span><b>{plural(item.shift_count, "shift")}</b><small><Users size={12} aria-hidden />{item.employee_count}</small></li>
              ))}
            </ul>
          ) : null}
          <div className="stv-ns5-actions">
            <button type="button" className="nf-button" disabled={selected.viewing} onClick={() => view.actions.view(selected)}><Eye size={15} aria-hidden />{selected.viewing ? "On screen now" : "Show on grid"}</button>
            {view.actions.canEdit(selected) ? <button type="button" className="secondary-button stv-btn" disabled={view.editDisabled} onClick={() => view.actions.edit(selected)}><Pencil size={14} aria-hidden />{selected.kind === "live" ? "Edit live" : "Edit"}</button> : null}
            {view.actions.canUnpublish(selected) ? <button type="button" className="stv-ns-icon is-danger has-text" onClick={view.actions.unpublish}><Undo2 size={14} aria-hidden />Unpublish…</button> : null}
            <DeleteButton view={view} row={selected} />
          </div>
        </section>
      ) : null}
      <footer className="stv-ns5-foot">
        <BlankButton view={view} />
        <SaveTemplateLink view={view} />
      </footer>
    </aside>
  );
}
