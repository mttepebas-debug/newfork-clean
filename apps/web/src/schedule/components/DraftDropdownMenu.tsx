import type {
  ScheduleDraftSummary,
  SchedulePublicationStatus,
  ScheduleTemplateSummary,
} from "@newfork/shared/schedule";
import {
  CheckCircle2,
  ChevronDown,
  FilePlus2,
  Layers,
  Loader2,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { ConfirmButton } from "@newfork/ui";
import { type JSX, useEffect, useRef, useState } from "react";

import { SCHEDULE_ACTION_BUTTON_CLASS } from "../lib/scheduleActionButton";

interface PublishedScheduleSummary {
  readonly source_draft_id?: string | null;
  readonly source_draft_name?: string | null;
  readonly published_at: string;
  readonly published_by_name?: string | null;
}

type PublicationLocationStatus = SchedulePublicationStatus["locations"][number];

interface DraftDropdownMenuProps {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly activeDraftId: string | null;
  readonly triggerLabel: string;
  readonly highlightTrigger?: boolean;
  readonly canEditPublishedSchedule?: boolean;
  readonly publishedSchedule?: PublishedScheduleSummary | null;
  readonly publishedLocationStatuses?: readonly PublicationLocationStatus[];
  readonly onOpen?: () => void | Promise<unknown>;
  readonly onOpenChange?: (open: boolean) => void;
  readonly dismissSignal?: number;
  readonly topActionId?: string;
  readonly onPreviewDraft: (draftId: string | null) => void;
  readonly onEditDraft: (draftId: string | null) => void;
  readonly onStartBlankDraft: () => void;
  readonly onEditPublishedSchedule?: () => void;
  readonly onDeleteDraft?: (draft: ScheduleDraftSummary) => void;
  readonly onUnpublishSchedule?: () => void;
  readonly isUnpublishing?: boolean;
  readonly unpublishDisabledReason?: string | null;
  readonly templates?: readonly ScheduleTemplateSummary[];
  readonly onApplyTemplate?: (template: ScheduleTemplateSummary) => void;
  readonly onRenameTemplate?: (template: ScheduleTemplateSummary) => void;
  readonly onDeleteTemplate?: (template: ScheduleTemplateSummary) => void;
  readonly onSaveAsTemplate?: () => void;
  readonly onManageTemplates?: () => void;
  readonly saveAsTemplateDisabledReason?: string | null;
  readonly onPrefetchDraft?: (draftId: string) => void;
  readonly disableDeleteDraftId?: string | null;
  readonly canManageDrafts?: boolean;
  readonly canStartDraft?: boolean;
  readonly isStartingDraft?: boolean;
}

export function DraftDropdownMenu({
  drafts,
  activeDraftId,
  triggerLabel,
  highlightTrigger = false,
  canEditPublishedSchedule = false,
  publishedSchedule = null,
  publishedLocationStatuses = [],
  onOpen,
  onOpenChange,
  dismissSignal = 0,
  topActionId,
  onPreviewDraft,
  onEditDraft,
  onStartBlankDraft,
  onEditPublishedSchedule,
  onDeleteDraft,
  onUnpublishSchedule,
  isUnpublishing = false,
  unpublishDisabledReason = null,
  templates = [],
  onApplyTemplate,
  onRenameTemplate,
  onDeleteTemplate,
  onSaveAsTemplate,
  onManageTemplates,
  saveAsTemplateDisabledReason = null,
  onPrefetchDraft,
  disableDeleteDraftId = null,
  canManageDrafts = true,
  canStartDraft = true,
  isStartingDraft = false,
}: DraftDropdownMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const label = triggerLabel.trim() || "New Schedule";
  const editDisabled = !canStartDraft || isStartingDraft;
  const publishedDraftId = publishedSchedule?.source_draft_id ?? null;
  const hasPublishedDraftRow =
    !!publishedDraftId && drafts.some((draft) => draft.id === publishedDraftId);
  const showPublishedFallbackRow = !!publishedSchedule && !hasPublishedDraftRow;
  const visibleDraftCount = drafts.length + (showPublishedFallbackRow ? 1 : 0);
  const triggerDisabled =
    visibleDraftCount === 0 && (!canManageDrafts || editDisabled);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    setOpen(false);
  }, [dismissSignal]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const closeAfter = (action: () => void) => {
    action();
    setOpen(false);
  };

  const openMenu = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      void onOpen?.();
      drafts.forEach((draft) => onPrefetchDraft?.(draft.id));
    }
  };

  const unpublishButton =
    onUnpublishSchedule && canManageDrafts ? (
      <button
        type="button"
        aria-label="Unpublish schedule"
        disabled={isUnpublishing || Boolean(unpublishDisabledReason)}
        title={unpublishDisabledReason ?? "Unpublish schedule"}
        onClick={(event) => {
          event.stopPropagation();
          closeAfter(onUnpublishSchedule);
        }}
      >
        {isUnpublishing ? (
          <Loader2 className="schedule-draft-menu-action-icon" />
        ) : (
          <Undo2 className="schedule-draft-menu-action-icon" />
        )}
      </button>
    ) : null;

  return (
    <div className="schedule-draft-menu" ref={rootRef}>
      <button
        type="button"
        className={`schedule-draft-menu-trigger ${SCHEDULE_ACTION_BUTTON_CLASS}${
          highlightTrigger ? " schedule-new-schedule-highlight" : ""
        }`}
        data-schedule-top-action-trigger={topActionId}
        aria-label={`Draft selector: ${label}`}
        aria-expanded={open}
        disabled={triggerDisabled}
        onClick={openMenu}
      >
        <span>{label}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {open ? (
        <div className="schedule-draft-menu-panel" role="dialog">
          {canManageDrafts ? (
            <button
              type="button"
              className="schedule-draft-menu-start"
              disabled={!canStartDraft || isStartingDraft}
              onClick={() => closeAfter(onStartBlankDraft)}
            >
              <span>
                <FilePlus2 size={16} />
              </span>
              <strong>
                {isStartingDraft
                  ? "Starting schedule..."
                  : "New Schedule (blank)"}
              </strong>
            </button>
          ) : null}
          <div className="schedule-draft-menu-separator" role="separator" />
          <div className="schedule-draft-menu-heading">
            <span>Saved drafts</span>
            <small>
              {visibleDraftCount} {visibleDraftCount === 1 ? "draft" : "drafts"}
            </small>
          </div>
          <div className="schedule-draft-menu-list">
            {visibleDraftCount ? (
              <>
                {drafts.map((draft) => {
                  const active = activeDraftId === draft.id;
                  const isPublishedDraft = publishedDraftId === draft.id;
                  const deleteDisabled =
                    disableDeleteDraftId === draft.id || isPublishedDraft;
                  const canEditDraftRow =
                    !isPublishedDraft ||
                    (canEditPublishedSchedule &&
                      Boolean(onEditPublishedSchedule));
                  return (
                    <div
                      key={draft.id}
                      className="schedule-draft-menu-row"
                      data-active={active}
                      data-draft-row
                      data-published-draft-row={
                        isPublishedDraft ? "true" : undefined
                      }
                      role="button"
                      tabIndex={0}
                      onMouseEnter={() => onPrefetchDraft?.(draft.id)}
                      onFocus={() => onPrefetchDraft?.(draft.id)}
                      onClick={() => closeAfter(() => onPreviewDraft(draft.id))}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        closeAfter(() => onPreviewDraft(draft.id));
                      }}
                    >
                      <div>
                        <span className="schedule-draft-menu-title-line">
                          <strong>{draft.name}</strong>
                          {isPublishedDraft ? (
                            <span
                              className="schedule-draft-menu-published-chip"
                              title={
                                publishedSchedule
                                  ? publishedMeta(publishedSchedule)
                                  : undefined
                              }
                            >
                              <CheckCircle2 size={12} />
                              Published
                            </span>
                          ) : null}
                        </span>
                        <small>{formatDraftMeta(draft)}</small>
                        {isPublishedDraft ? (
                          <PublishedLocationBadges
                            statuses={publishedLocationStatuses}
                          />
                        ) : null}
                      </div>
                      {canManageDrafts && canEditDraftRow ? (
                        <button
                          type="button"
                          aria-label={
                            isPublishedDraft
                              ? "Edit live schedule"
                              : `Edit ${draft.name}`
                          }
                          disabled={editDisabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (editDisabled) return;
                            closeAfter(() => {
                              if (isPublishedDraft) {
                                if (!onEditPublishedSchedule) return;
                                onEditPublishedSchedule();
                                return;
                              }
                              onEditDraft(draft.id);
                            });
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      ) : null}
                      {isPublishedDraft ? unpublishButton : null}
                      {onDeleteDraft && canManageDrafts ? (
                        <ConfirmButton
                          unstyled
                          aria-label={`Delete ${draft.name}`}
                          confirmName={`Confirm delete ${draft.name}`}
                          disabled={deleteDisabled}
                          title={
                            isPublishedDraft
                              ? "Published source draft"
                              : disableDeleteDraftId === draft.id
                                ? "Currently being edited"
                                : undefined
                          }
                          confirmLabel={<CheckCircle2 size={14} />}
                          onClick={(event) => event.stopPropagation()}
                          onConfirm={() => onDeleteDraft(draft)}
                        >
                          <Trash2 size={14} />
                        </ConfirmButton>
                      ) : null}
                    </div>
                  );
                })}
                {showPublishedFallbackRow ? (
                  <PublishedFallbackRow
                    active={activeDraftId === null}
                    publishedSchedule={publishedSchedule}
                    publishedLocationStatuses={publishedLocationStatuses}
                    editDisabled={editDisabled}
                    unpublishButton={unpublishButton}
                    onPreview={() => closeAfter(() => onPreviewDraft(null))}
                    onEdit={
                      canManageDrafts &&
                      canEditPublishedSchedule &&
                      onEditPublishedSchedule
                        ? () => closeAfter(onEditPublishedSchedule)
                        : null
                    }
                  />
                ) : null}
              </>
            ) : (
              <p className="schedule-draft-menu-empty">
                No saved drafts for this week.
              </p>
            )}
          </div>
          {templates.length > 0 || onSaveAsTemplate ? (
            <>
              <div className="schedule-draft-menu-separator" role="separator" />
              <div className="schedule-draft-menu-heading">
                <span>Templates</span>
                <span className="schedule-draft-menu-template-meta">
                  {onManageTemplates ? (
                    <button
                      type="button"
                      onClick={() => closeAfter(onManageTemplates)}
                    >
                      Manage
                    </button>
                  ) : null}
                  <small>
                    {templates.length}{" "}
                    {templates.length === 1 ? "template" : "templates"}
                  </small>
                </span>
              </div>
              {templates.length ? (
                <div className="schedule-draft-menu-template-list">
                  {templates.map((template) => {
                    return (
                      <div
                        key={template.id}
                        className="schedule-draft-menu-template-row"
                        data-template-row
                        role="button"
                        tabIndex={0}
                        aria-label={`Apply template ${template.name}`}
                        onClick={() => {
                          if (onApplyTemplate) {
                            closeAfter(() => onApplyTemplate(template));
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") {
                            return;
                          }
                          event.preventDefault();
                          if (onApplyTemplate) {
                            closeAfter(() => onApplyTemplate(template));
                          }
                        }}
                      >
                        <span className="schedule-draft-menu-template-icon">
                          <Layers size={16} />
                        </span>
                        <div>
                          <strong>{template.name}</strong>
                          <small>
                            {template.shift_count}{" "}
                            {template.shift_count === 1 ? "shift" : "shifts"}
                            {template.open_slot_count > 0
                              ? ` · ${template.open_slot_count} open`
                              : ""}
                            {template.created_by_name
                              ? ` · by ${template.created_by_name}`
                              : ""}
                          </small>
                        </div>
                        {canManageDrafts && onRenameTemplate ? (
                          <button
                            type="button"
                            aria-label={`Rename template ${template.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              closeAfter(() => onRenameTemplate(template));
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                        ) : null}
                        {canManageDrafts && onDeleteTemplate ? (
                          <ConfirmButton
                            unstyled
                            aria-label={`Delete template ${template.name}`}
                            confirmName={`Confirm delete template ${template.name}`}
                            confirmLabel={<CheckCircle2 size={14} />}
                            onClick={(event) => event.stopPropagation()}
                            onConfirm={() => onDeleteTemplate(template)}
                          >
                            <Trash2 size={14} />
                          </ConfirmButton>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {onSaveAsTemplate && canManageDrafts ? (
                <button
                  type="button"
                  className="schedule-draft-menu-save-template"
                  disabled={Boolean(saveAsTemplateDisabledReason)}
                  title={saveAsTemplateDisabledReason ?? undefined}
                  onClick={() => closeAfter(onSaveAsTemplate)}
                >
                  <Layers size={14} />
                  Save current schedule as template
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatDraftDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

type DraftWithActorNames = ScheduleDraftSummary & {
  readonly created_by_name?: string | null;
  readonly updated_by_name?: string | null;
};

function updatedByLabel(draft: DraftWithActorNames): string {
  return draft.updated_by_name ?? draft.created_by_name ?? "Unknown";
}

function formatDraftMeta(draft: ScheduleDraftSummary): string {
  const actorLabel = updatedByLabel(draft);
  const updatedAt = formatDraftDate(draft.updated_at);
  if (actorLabel !== "Unknown") return `Saved by ${actorLabel} • ${updatedAt}`;
  return `Revision ${draft.revision} • ${updatedAt}`;
}

function publishedTitle(summary?: PublishedScheduleSummary | null): string {
  const title = summary?.source_draft_name?.trim();
  return title ? title : "Published schedule";
}

function publishedByLabel(summary?: PublishedScheduleSummary | null): string {
  const label = summary?.published_by_name?.trim();
  return label ? label : "Unknown";
}

function publishedMeta(summary: PublishedScheduleSummary): string {
  return `Published by ${publishedByLabel(summary)} • ${formatDraftDate(
    summary.published_at,
  )}`;
}

function publishedLocationBadges(
  statuses: readonly PublicationLocationStatus[] | undefined,
): PublicationLocationStatus[] {
  return (statuses ?? []).filter(
    (status) =>
      status.status === "published" && status.reason !== "worked_shifts_kept",
  );
}

function PublishedLocationBadges({
  statuses,
}: {
  readonly statuses: readonly PublicationLocationStatus[] | undefined;
}): JSX.Element | null {
  const liveStatuses = publishedLocationBadges(statuses);
  if (liveStatuses.length === 0) return null;
  const visible = liveStatuses.slice(0, 3);
  const overflowCount = liveStatuses.length - visible.length;
  return (
    <div className="schedule-draft-menu-location-badges">
      {visible.map((status) => (
        <span key={status.id} title={status.name}>
          <span
            aria-hidden
            style={{ backgroundColor: status.color ?? "#64748b" }}
          />
          <span>{status.name}</span>
        </span>
      ))}
      {overflowCount > 0 ? <span>+{overflowCount}</span> : null}
    </div>
  );
}

function PublishedFallbackRow({
  active,
  publishedSchedule,
  publishedLocationStatuses,
  editDisabled,
  unpublishButton,
  onPreview,
  onEdit,
}: {
  readonly active: boolean;
  readonly publishedSchedule: PublishedScheduleSummary;
  readonly publishedLocationStatuses: readonly PublicationLocationStatus[];
  readonly editDisabled: boolean;
  readonly unpublishButton: JSX.Element | null;
  readonly onPreview: () => void;
  readonly onEdit: (() => void) | null;
}): JSX.Element {
  return (
    <div
      className="schedule-draft-menu-row"
      data-active={active}
      data-published-fallback-row
      role="button"
      tabIndex={0}
      aria-label="View published schedule"
      onClick={onPreview}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onPreview();
      }}
    >
      <span className="schedule-draft-menu-published-chip">
        <CheckCircle2 size={12} />
        Published
      </span>
      <div>
        <strong>{publishedTitle(publishedSchedule)}</strong>
        <small>{publishedMeta(publishedSchedule)}</small>
        <PublishedLocationBadges statuses={publishedLocationStatuses} />
      </div>
      {onEdit ? (
        <button
          type="button"
          aria-label="Edit live schedule"
          disabled={editDisabled}
          onClick={(event) => {
            event.stopPropagation();
            if (!editDisabled) onEdit();
          }}
        >
          <Pencil size={14} />
        </button>
      ) : null}
      {unpublishButton}
    </div>
  );
}
