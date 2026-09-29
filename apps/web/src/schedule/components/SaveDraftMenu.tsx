import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { Check, CheckCircle2, FilePlus2, Save, Send } from "lucide-react";
import {
  type JSX,
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SaveDraftAction = (
  name: string,
  force: boolean,
  targetDraftId?: string | null,
) => boolean | void | Promise<unknown>;

type RunningAction = "save-current" | "save-as" | "save-publish" | null;

interface PublishedScheduleSummary {
  readonly source_draft_id?: string | null;
  readonly source_draft_name?: string | null;
  readonly published_at: string;
  readonly published_by_name?: string | null;
}

interface SaveDraftMenuProps {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly activeDraftId?: string | null;
  readonly activeDraftName?: string | null;
  readonly publishedSchedule?: PublishedScheduleSummary | null;
  readonly isWorkingCopy?: boolean;
  readonly isSaving?: boolean;
  readonly saveActionDisabled?: boolean;
  readonly saveAsActionDisabled?: boolean;
  readonly saveAndPublishActionDisabled?: boolean;
  readonly saveAndPublishDisabledReason?: string | null;
  readonly trigger: ReactElement;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onBeforeOpen?: () => void;
  readonly dismissSignal?: number;
  readonly onSaveDraft: SaveDraftAction;
  readonly onSaveAndPublish?: SaveDraftAction;
}

interface OverwriteTarget {
  readonly id: string;
  readonly name: string;
}

type DraftWithActorNames = ScheduleDraftSummary & {
  readonly created_by_name?: string | null;
  readonly updated_by_name?: string | null;
};

export function suggestVersionedDraftName(
  base: string,
  takenNames: readonly string[],
): string {
  const stripped = base.replace(/\s+vrs\.\d+\.\d+$/i, "").trim() || "Schedule";
  const taken = new Set(takenNames.map(normalizeDraftName));
  for (let minor = 1; minor <= 999; minor += 1) {
    const candidate = `${stripped} vrs.0.${minor}`;
    if (!taken.has(normalizeDraftName(candidate))) return candidate;
  }
  return `${stripped} vrs.0.${Date.now()}`;
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function updatedByLabel(draft: DraftWithActorNames): string {
  return draft.updated_by_name ?? draft.created_by_name ?? "Unknown";
}

function savedMeta(draft: ScheduleDraftSummary): string {
  const actorLabel = updatedByLabel(draft);
  const savedAt = shortDate(draft.updated_at);
  if (actorLabel !== "Unknown") return `Saved by ${actorLabel} • ${savedAt}`;
  return `Revision ${draft.revision} • ${savedAt}`;
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
  return `Published by ${publishedByLabel(summary)} • ${shortDate(summary.published_at)}`;
}

export function SaveDraftMenu({
  drafts,
  activeDraftId = null,
  activeDraftName = null,
  publishedSchedule = null,
  isWorkingCopy = false,
  isSaving = false,
  saveActionDisabled = false,
  saveAsActionDisabled = false,
  saveAndPublishActionDisabled = false,
  saveAndPublishDisabledReason = null,
  trigger,
  onOpenChange,
  onBeforeOpen,
  dismissSignal = 0,
  onSaveDraft,
  onSaveAndPublish,
}: SaveDraftMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [runningAction, setRunningAction] = useState<RunningAction>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedName = draftName.trim();
  const hasDraftName = trimmedName.length > 0;
  const normalizedDraftName = normalizeDraftName(trimmedName);
  const activeDraft =
    drafts.find((draft) => draft.id === activeDraftId) ?? null;
  const baseName =
    activeDraftName?.trim() ||
    activeDraft?.name ||
    publishedTitle(publishedSchedule);
  const matchingDraft = useMemo(
    () =>
      normalizedDraftName
        ? (drafts.find(
            (draft) => normalizeDraftName(draft.name) === normalizedDraftName,
          ) ?? null)
        : null,
    [drafts, normalizedDraftName],
  );
  const matchingOtherDraft =
    matchingDraft && matchingDraft.id !== activeDraftId ? matchingDraft : null;
  const normalizedPublishedName = publishedSchedule
    ? normalizeDraftName(publishedTitle(publishedSchedule))
    : "";
  const isLiveNameReserved =
    isWorkingCopy &&
    normalizedDraftName.length > 0 &&
    normalizedPublishedName.length > 0 &&
    normalizedDraftName === normalizedPublishedName;
  const isBusy = isSaving || runningAction !== null;
  const canSaveCurrent =
    hasDraftName &&
    !isWorkingCopy &&
    !isLiveNameReserved &&
    !saveActionDisabled &&
    !matchingOtherDraft &&
    !isBusy;
  const canSaveAsNew =
    hasDraftName &&
    !isLiveNameReserved &&
    !saveAsActionDisabled &&
    !matchingDraft &&
    !isBusy;
  const canSaveAndPublish =
    hasDraftName &&
    Boolean(onSaveAndPublish) &&
    !isLiveNameReserved &&
    !saveAndPublishActionDisabled &&
    !saveAndPublishDisabledReason &&
    !matchingOtherDraft &&
    !isBusy;
  const publishedDraftId = publishedSchedule?.source_draft_id ?? null;
  const visibleDrafts = publishedDraftId
    ? drafts.filter((draft) => draft.id !== publishedDraftId)
    : drafts;

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useEffect(() => {
    setOpen(false);
    setRunningAction(null);
  }, [dismissSignal]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const openMenu = () => {
    onBeforeOpen?.();
    const initialName = isWorkingCopy
      ? suggestVersionedDraftName(publishedTitle(publishedSchedule), [
          ...drafts.map((draft) => draft.name),
          ...(publishedSchedule ? [publishedTitle(publishedSchedule)] : []),
        ])
      : baseName;
    setDraftName(initialName);
    setRunningAction(null);
    setOpen(true);
  };

  const run = async (
    action: Exclude<RunningAction, null>,
    callback: () => boolean | void | Promise<unknown>,
  ) => {
    if (isBusy) return;
    setRunningAction(action);
    let shouldClose = false;
    try {
      const result = await callback();
      shouldClose = result !== false && result !== null;
    } finally {
      setRunningAction(null);
      if (shouldClose) setOpen(false);
    }
  };

  const saveCurrent = () => {
    if (!canSaveCurrent) return;
    void run("save-current", () =>
      onSaveDraft(trimmedName, Boolean(activeDraftId), activeDraftId),
    );
  };

  const saveAs = () => {
    if (!canSaveAsNew || isLiveNameReserved) return;
    void run("save-as", () => onSaveDraft(trimmedName, false, null));
  };

  const saveAndPublish = () => {
    if (!canSaveAndPublish || !onSaveAndPublish || isLiveNameReserved) return;
    void run("save-publish", () =>
      onSaveAndPublish(trimmedName, Boolean(activeDraftId), activeDraftId),
    );
  };

  return (
    <div className="schedule-save-menu-anchor">
      <span onClick={openMenu}>{trigger}</span>
      {open ? (
        <div
          className="schedule-save-draft-menu"
          role="dialog"
          aria-label="Save draft"
          data-save-draft-menu-content
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setRunningAction(null);
              return;
            }
            event.stopPropagation();
          }}
        >
          <label>
            Draft name
            <input
              ref={inputRef}
              id="schedule-save-draft-name"
              name="schedule-save-draft-name"
              value={draftName}
              maxLength={80}
              placeholder="Draft name"
              onChange={(event) => {
                setDraftName(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                saveCurrent();
              }}
            />
          </label>
          {isLiveNameReserved ? (
            <p className="schedule-save-menu-danger">
              The live schedule name is reserved. Choose a draft name, or
              overwrite an existing draft.
            </p>
          ) : matchingOtherDraft ? (
            <p className="schedule-save-menu-warning">
              A draft with this name already exists. Use the row action below to
              overwrite it.
            </p>
          ) : matchingDraft ? (
            <p className="schedule-save-menu-muted">
              This name matches the current draft. Use Save to update it.
            </p>
          ) : null}
          <div className="schedule-save-menu-actions">
            <button
              type="button"
              disabled={!canSaveCurrent}
              onClick={saveCurrent}
            >
              <Save size={14} />
              {runningAction === "save-current" ? "Saving..." : "Save"}
            </button>
            <button type="button" disabled={!canSaveAsNew} onClick={saveAs}>
              <FilePlus2 size={14} />
              {runningAction === "save-as" ? "Saving..." : "Save As"}
            </button>
            {onSaveAndPublish ? (
              <button
                type="button"
                className="schedule-save-menu-publish-action"
                disabled={!canSaveAndPublish}
                title={
                  saveAndPublishActionDisabled
                    ? undefined
                    : (saveAndPublishDisabledReason ?? undefined)
                }
                onClick={saveAndPublish}
              >
                <Send size={14} />
                {runningAction === "save-publish"
                  ? "Publishing..."
                  : "Save and publish"}
              </button>
            ) : null}
          </div>
          <div className="schedule-save-menu-divider" />
          {publishedSchedule && publishedDraftId ? (
            <>
              <OverwriteRow
                id={publishedDraftId}
                name={publishedTitle(publishedSchedule)}
                meta={publishedMeta(publishedSchedule)}
                isSaving={isBusy}
                published
              />
              <div className="schedule-save-menu-divider" />
            </>
          ) : null}
          <div className="schedule-save-menu-heading">Saved drafts</div>
          {visibleDrafts.length ? (
            visibleDrafts.map((draft) => (
              <OverwriteRow
                key={draft.id}
                id={draft.id}
                name={draft.name}
                meta={savedMeta(draft)}
                isSaving={isBusy}
                onOverwrite={(target) =>
                  void run("save-current", () =>
                    onSaveDraft(target.name, true, target.id),
                  )
                }
              />
            ))
          ) : (
            <p className="schedule-save-menu-empty">
              No saved drafts for this week.
            </p>
          )}
          <div className="schedule-save-menu-footer">
            <p className="schedule-menu-hint" aria-hidden="true">
              <kbd>Enter</kbd> save <kbd>Esc</kbd> close
            </p>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeDraftName(value: string): string {
  return value.trim().toLowerCase();
}

function OverwriteRow({
  id,
  name,
  meta,
  isSaving,
  published = false,
  onOverwrite,
}: {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly isSaving: boolean;
  readonly published?: boolean;
  readonly onOverwrite?: (target: OverwriteTarget) => void;
}): JSX.Element {
  return (
    <div
      className="schedule-save-menu-row"
      data-published={published}
      data-save-draft-row
    >
      {published ? (
        <span className="schedule-save-menu-published-chip">
          <CheckCircle2 aria-hidden />
          Published
        </span>
      ) : null}
      <span>
        <strong>{name}</strong>
        <small>{meta}</small>
      </span>
      {onOverwrite ? (
        <ConfirmButton
          unstyled
          aria-label={`Overwrite ${name}`}
          confirmName={`Confirm overwrite ${name}`}
          title="Overwrite draft"
          disabled={isSaving}
          confirmLabel={<Check size={14} />}
          onConfirm={() => onOverwrite({ id, name })}
        >
          <Save size={14} />
        </ConfirmButton>
      ) : null}
    </div>
  );
}
