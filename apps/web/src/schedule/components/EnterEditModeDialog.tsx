import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { FilePlus2, Trash2 } from "lucide-react";

export function EnterEditModeDialog({
  open,
  drafts,
  isLoading = false,
  onOpenChange,
  onStartBlank,
  onLoadDraft,
  onDeleteDraft,
}: {
  readonly open: boolean;
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly isLoading?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onStartBlank: () => void;
  readonly onLoadDraft: (draftId: string) => void;
  readonly onDeleteDraft?: (draft: ScheduleDraftSummary) => void;
}) {
  if (!open) return null;

  return (
    <div className="schedule-dialog-layer" role="presentation">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onClick={() => onOpenChange(false)}
      />
      <section
        className="schedule-enter-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-enter-edit-title"
      >
        <header>
          <h2 id="schedule-enter-edit-title">Edit schedule</h2>
          <p>Choose a draft to edit for this week.</p>
        </header>
        <div className="schedule-enter-edit-list">
          <button type="button" onClick={onStartBlank}>
            <FilePlus2 size={16} aria-hidden />
            <span>
              <strong>Start blank</strong>
              <small>Start with an empty week.</small>
            </span>
          </button>
          {drafts.map((draft) => (
            <div key={draft.id} className="schedule-enter-edit-row">
              <button type="button" onClick={() => onLoadDraft(draft.id)}>
                <strong>{draft.name}</strong>
                <small>
                  Revision {draft.revision} -{" "}
                  {new Date(draft.updated_at).toLocaleString()}
                </small>
              </button>
              {onDeleteDraft ? (
                <button
                  type="button"
                  aria-label={`Delete ${draft.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteDraft(draft);
                  }}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}
          {!drafts.length && !isLoading ? (
            <div className="schedule-enter-edit-empty">
              No saved drafts for this week.
            </div>
          ) : null}
        </div>
        <footer>
          <button type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
        </footer>
      </section>
    </div>
  );
}
