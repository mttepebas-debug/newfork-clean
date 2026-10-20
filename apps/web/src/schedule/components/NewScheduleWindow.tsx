import type {
  ScheduleDraftSummary,
  ScheduleWeekFacts,
} from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import {
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronDown,
  FilePlus2,
  Layers,
  Lock,
  Pencil,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { type JSX, type ReactNode, useEffect, useRef } from "react";

import { SCHEDULE_ACTION_BUTTON_CLASS } from "../lib/scheduleActionButton";
import type { PublishedScheduleSummary } from "../lib/draftMenuLabels";
import { formatDateNumber } from "../lib/scheduleDateTime";
import { NewScheduleTemplates, type NewScheduleTemplatesProps, type TemplateUseOption } from "./NewScheduleTemplates";
import { agoText, hoursText } from "./newScheduleWindowText";
import "./new-schedule-window.css";

export type NewScheduleTab = "schedules" | "templates" | "export";

/** A saved draft as the drafts list carries it; a just-saved one has no facts until the list reloads. */
type DraftRow = ScheduleDraftSummary & Partial<ScheduleWeekFacts> & { readonly updated_by_name?: string };

interface Row {
  readonly kind: "live" | "draft";
  /** The draft's id; null for a live schedule with no saved draft behind it. */
  readonly id: string | null;
  readonly name: string;
  readonly draft: ScheduleDraftSummary | null;
  readonly facts: ScheduleWeekFacts | null;
  readonly by: string | null;
  readonly at: string;
  readonly viewing: boolean;
}

export interface NewScheduleWindowProps {
  readonly open: boolean;
  readonly tab: NewScheduleTab;
  readonly onOpenChange: (open: boolean) => void;
  readonly onTabChange: (tab: NewScheduleTab) => void;
  /** Which tabs this person gets: Schedules needs schedule edit, Templates and Export their own actions. */
  readonly tabs: { readonly schedules: boolean; readonly templates: boolean; readonly export: boolean };
  readonly triggerLabel: string;
  readonly highlightTrigger?: boolean;
  readonly topActionId?: string;
  readonly weekStart: string | null;
  readonly drafts: readonly ScheduleDraftSummary[];
  /** The live schedule's shifts and paid minutes; null until the list loads. */
  readonly publishedFacts: ScheduleWeekFacts | null;
  readonly publishedSchedule: PublishedScheduleSummary | null;
  readonly activeDraftId: string | null;
  /** An edit is open on the grid: nothing else can be opened until it is saved, published or discarded. */
  readonly editing: boolean;
  readonly editingName: string | null;
  readonly canManageDrafts: boolean;
  readonly canStartDraft: boolean;
  readonly isStartingDraft: boolean;
  readonly canEditPublishedSchedule: boolean;
  readonly readOnlyNote: string | null;
  readonly disableDeleteDraftId?: string | null;
  readonly onPreviewDraft: (draftId: string | null) => void;
  readonly onEditDraft: (draftId: string) => void;
  readonly onEditPublishedSchedule: () => void;
  readonly onStartBlankDraft: () => void;
  readonly onDeleteDraft: (draft: ScheduleDraftSummary) => void;
  readonly onUnpublishSchedule?: () => void;
  /** The Templates tab; the schedules a template can go into come from the Schedules rows. */
  readonly templates: Omit<NewScheduleTemplatesProps, "useOptions"> | null;
  /** The export settings and preview; drawn only while the Export tab is open. */
  readonly exportPane: ReactNode;
}

/**
 * The New Schedule window (Mert, 2026-10-12, design B): the week's schedules,
 * templates and export in one table with tabs, under the New Schedule button.
 * Export and Templates have no other buttons in the top bar.
 */
export function NewScheduleWindow(props: NewScheduleWindowProps): JSX.Element | null {
  const { open, tab, onOpenChange, onTabChange, tabs, triggerLabel, highlightTrigger = false, topActionId } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rows = scheduleRows(props);
  const tabList = (["schedules", "templates", "export"] as const).filter((key) => tabs[key]);
  const shownTab: NewScheduleTab = tabs[tab] ? tab : (tabList[0] ?? "schedules");
  const label = triggerLabel.trim() || "New Schedule";

  // The window owns Escape before the page does (the page would jump the week to today).
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // An armed two-click button disarms, and an open row menu closes; the window stays.
      const target = event.target as Element | null;
      if (target?.closest?.('[data-confirming="true"]') || document.querySelector(".new-schedule-window-menu")) return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      rootRef.current?.querySelector<HTMLButtonElement>(".schedule-draft-menu-trigger")?.focus();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onOpenChange, open]);

  if (!tabList.length) return null;
  const count = (key: NewScheduleTab) =>
    key === "schedules" ? rows.length : key === "templates" ? (props.templates?.templates.length ?? null) : null;
  return (
    <div className="schedule-draft-menu" ref={rootRef}>
      <button
        type="button"
        className={`schedule-draft-menu-trigger ${SCHEDULE_ACTION_BUTTON_CLASS}${highlightTrigger ? " schedule-new-schedule-highlight" : ""}`}
        data-schedule-top-action-trigger={topActionId}
        aria-label={`Draft selector: ${label}`}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>{label}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open ? (
        <section
          className="new-schedule-window"
          role="dialog"
          aria-label={`Schedules for ${weekText(props.weekStart)}`}
          data-tab={shownTab}
        >
          <header className="new-schedule-window-head">
            <div className="new-schedule-window-tabs" role="tablist" aria-label={`Schedule tools for ${weekText(props.weekStart)}`}>
              {tabList.map((key) => {
                const n = count(key);
                return (
                  <button key={key} type="button" role="tab" aria-selected={shownTab === key} onClick={() => onTabChange(key)}>
                    {tabName[key]}
                    {n !== null ? <span className="new-schedule-window-count">{n}</span> : null}
                  </button>
                );
              })}
            </div>
            <span className="new-schedule-window-tools">
              <HeadAction {...props} tab={shownTab} />
              <button type="button" className="new-schedule-window-icon" aria-label="Close" title="Close" onClick={() => onOpenChange(false)}>
                <X size={16} aria-hidden />
              </button>
            </span>
          </header>
          {shownTab === "schedules" ? (
            <div className="new-schedule-window-body">
              {props.editing ? <EditingNotice name={props.editingName} /> : null}
              <ScheduleRows {...props} rows={rows} />
            </div>
          ) : null}
          {shownTab === "templates" && props.templates ? (
            <div className="new-schedule-window-body">
              <NewScheduleTemplates {...props.templates} useOptions={templateUseOptions(props, rows)} />
            </div>
          ) : null}
          {shownTab === "export" ? <div className="new-schedule-window-body">{props.exportPane}</div> : null}
        </section>
      ) : null}
    </div>
  );
}

const tabName: Record<NewScheduleTab, string> = { schedules: "Schedules", templates: "Templates", export: "Export" };

/**
 * The green button at the top right: Blank schedule, or Save template on the
 * Templates tab. Both have one width, so it stays put when the tab changes
 * (Mert, 2026-10-12 18:29 PT). Nothing while an edit is open.
 */
function HeadAction(props: NewScheduleWindowProps & { readonly tab: NewScheduleTab }): JSX.Element | null {
  if (props.tab === "templates") {
    const templates = props.templates;
    if (!templates || !templates.canManage || templates.step.kind !== "list") return null;
    const disabled = !templates.drafts.length;
    return (
      <button
        type="button"
        className="nf-button new-schedule-window-main"
        aria-expanded={templates.saving}
        disabled={disabled}
        title={disabled ? "Save a draft first." : undefined}
        onClick={() => templates.onSavingChange(true)}
      >
        <Layers size={15} aria-hidden />Save template
      </button>
    );
  }
  if (!props.tabs.schedules || props.editing || !props.canManageDrafts) return null;
  return (
    <button
      type="button"
      className="nf-button new-schedule-window-main"
      disabled={!props.canStartDraft || props.isStartingDraft}
      // The window stays open saying "Starting…" until the edit is held.
      onClick={props.onStartBlankDraft}
    >
      <FilePlus2 size={15} aria-hidden />{props.isStartingDraft ? "Starting…" : "Blank schedule"}
    </button>
  );
}

function EditingNotice({ name }: { readonly name: string | null }): JSX.Element {
  return (
    <p className="new-schedule-window-editing" role="status">
      <Lock size={14} aria-hidden />
      <span>
        You are editing {name ? <strong>{name}</strong> : "this week"}. Publish, save or discard it before you start or edit another schedule.
      </span>
    </p>
  );
}

/** The live schedule first, then the drafts that are not live. */
function scheduleRows(props: NewScheduleWindowProps): Row[] {
  const { drafts, publishedSchedule, publishedFacts, activeDraftId, editing } = props;
  const liveDraftId = publishedSchedule?.source_draft_id ?? null;
  const liveDraft = liveDraftId ? (drafts.find((draft) => draft.id === liveDraftId) ?? null) : null;
  return [
    ...(publishedSchedule ? [{
      kind: "live" as const,
      id: liveDraft?.id ?? null,
      name: liveDraft?.name ?? publishedSchedule.source_draft_name?.trim() ?? "Published schedule",
      draft: liveDraft,
      facts: publishedFacts,
      by: publishedSchedule.published_by_name?.trim() || null,
      at: publishedSchedule.published_at,
      // While a new blank edit is open, nothing saved is on screen.
      viewing: editing ? Boolean(liveDraft) && activeDraftId === liveDraft?.id : activeDraftId === (liveDraft?.id ?? null),
    }] : []),
    ...drafts.filter((draft) => draft.id !== liveDraftId).map((draft) => ({
      kind: "draft" as const,
      id: draft.id,
      name: draft.name,
      draft,
      facts: draftFacts(draft),
      by: (draft as DraftRow).updated_by_name ?? null,
      at: draft.updated_at,
      viewing: activeDraftId === draft.id,
    })),
  ];
}

/** The schedules this person may open for editing now: where "Use" can put a template. */
function templateUseOptions(props: NewScheduleWindowProps, rows: readonly Row[]): TemplateUseOption[] {
  if (!props.canManageDrafts) return [];
  return rows.flatMap((row): TemplateUseOption[] => {
    if (row.kind === "live") {
      return props.canEditPublishedSchedule
        ? [{ key: "live", label: row.name, target: { kind: "live" }, live: true, viewing: row.viewing }]
        : [];
    }
    return row.id ? [{ key: row.id, label: row.name, target: { kind: "draft", draftId: row.id }, live: false, viewing: row.viewing }] : [];
  });
}

function draftFacts(draft: DraftRow): ScheduleWeekFacts | null {
  return typeof draft.shift_count === "number" && typeof draft.paid_minutes === "number"
    ? { shift_count: draft.shift_count, paid_minutes: draft.paid_minutes }
    : null;
}

/**
 * The Schedules tab: the same compact rows as Templates (Mert, 2026-10-12 17:00 PT):
 * name with its status and last change under it, shifts, hours, edit, unpublish or delete.
 */
function ScheduleRows(props: NewScheduleWindowProps & { readonly rows: readonly Row[] }): JSX.Element {
  const { rows, editing, canManageDrafts, canStartDraft, isStartingDraft, readOnlyNote } = props;
  if (!rows.length) {
    return readOnlyNote
      ? <p className="new-schedule-window-empty">{readOnlyNote}</p>
      : <p className="new-schedule-window-empty">No schedules for this week yet. Start a blank one or use a template.</p>;
  }
  const editDisabled = !canStartDraft || isStartingDraft;
  const view = (row: Row) => {
    props.onOpenChange(false);
    props.onPreviewDraft(row.id);
  };
  const canEdit = (row: Row) => canManageDrafts && (row.kind === "draft" || props.canEditPublishedSchedule);
  const edit = (row: Row) => {
    if (editDisabled) return;
    if (row.kind === "live") props.onEditPublishedSchedule();
    else if (row.id) props.onEditDraft(row.id);
  };
  return (
    <>
      {readOnlyNote ? <p className="new-schedule-window-note">{readOnlyNote}</p> : null}
      <ul className="new-schedule-window-rows is-schedules">
        {rows.map((row) => (
          <li
            key={row.id ?? "live"}
            data-viewing={row.viewing}
            data-clickable={!editing}
            data-draft-row={row.kind === "draft" ? true : undefined}
            data-published-draft-row={row.kind === "live" ? "true" : undefined}
            // A click on the row (not on its buttons) shows that schedule on the grid.
            onClick={(event) => {
              if (editing || (event.target as Element).closest("button")) return;
              view(row);
            }}
          >
            <span className="new-schedule-window-name">
              {row.kind === "live" ? <CalendarCheck2 size={14} aria-hidden className="is-live" /> : <CalendarDays size={14} aria-hidden />}
              <button
                type="button"
                className="new-schedule-window-open"
                aria-label={row.kind === "live" && !row.id ? "View published schedule" : `View ${row.name}`}
                disabled={editing}
                title={editing ? "Save or discard your edit to view another schedule." : `Show ${row.name} on the grid`}
                onClick={() => view(row)}
              >
                <b>{row.name}</b>
                {row.viewing ? <em>{editing ? "Editing" : "On screen"}</em> : null}
              </button>
              <small>
                {row.kind === "live" ? <span className="is-live">Live</span> : "Draft"}
                {" · "}{row.kind === "live" ? "published" : "saved"}{row.by ? ` by ${row.by},` : ""} {agoText(row.at)}
              </small>
            </span>
            <span className="new-schedule-window-num"><b>{row.facts ? row.facts.shift_count : "–"}</b> shifts</span>
            <span className="new-schedule-window-num"><b>{row.facts ? hoursText(row.facts.paid_minutes) : "–"}</b> h</span>
            {canEdit(row) ? (
              <button
                type="button"
                className="new-schedule-window-icon"
                aria-label={row.kind === "live" ? "Edit live schedule" : `Edit ${row.name}`}
                title="Edit"
                disabled={editDisabled}
                onClick={() => edit(row)}
              >
                <Pencil size={14} aria-hidden />
              </button>
            ) : <span />}
            <RowEnd {...props} row={row} />
          </li>
        ))}
      </ul>
    </>
  );
}

function RowEnd(props: NewScheduleWindowProps & { readonly row: Row }): JSX.Element {
  const { row, canManageDrafts, onUnpublishSchedule } = props;
  if (row.kind === "live") {
    if (!onUnpublishSchedule || !canManageDrafts) return <span />;
    return (
      <button
        type="button"
        className="new-schedule-window-icon is-danger"
        aria-label="Unpublish schedule"
        title="Unpublish"
        onClick={() => {
          props.onOpenChange(false);
          onUnpublishSchedule();
        }}
      >
        <Undo2 size={14} aria-hidden />
      </button>
    );
  }
  if (!canManageDrafts || !row.draft) return <span />;
  const draft = row.draft;
  const beingEdited = props.disableDeleteDraftId === draft.id;
  return (
    <ConfirmButton
      unstyled
      className="new-schedule-window-icon is-danger"
      aria-label={`Delete ${draft.name}`}
      confirmName={`Confirm delete ${draft.name}`}
      title={beingEdited ? "Currently being edited" : "Delete"}
      disabled={beingEdited}
      confirmLabel={<Check size={14} aria-hidden />}
      onConfirm={() => props.onDeleteDraft(draft)}
    >
      <Trash2 size={14} aria-hidden />
    </ConfirmButton>
  );
}

function weekText(weekStart: string | null): string {
  if (!weekStart) return "this week";
  const end = new Date(`${weekStart}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${formatDateNumber(weekStart)} – ${formatDateNumber(end.toISOString().slice(0, 10))}`;
}
