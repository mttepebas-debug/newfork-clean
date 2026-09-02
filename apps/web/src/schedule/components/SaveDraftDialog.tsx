import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function SaveDraftDialog({
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
            This replaces revision {target.revision} of &ldquo;{target.name}&rdquo;.
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

function Dialog({
  title,
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const titleId = useId();

  return (
    <div className="schedule-dialog-layer" role="presentation">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
