import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { ConfirmButton } from "@newfork/ui";
import { X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

export function SaveDraftDialog({
  drafts,
  initialDraft,
  onClose,
  onSave,
  busy = false,
  description,
}: {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly initialDraft: ScheduleDraftSummary | null;
  readonly onClose: () => void;
  readonly onSave: (name: string, draft: ScheduleDraftSummary | null) => void;
  readonly busy?: boolean;
  readonly description?: string;
}) {
  const [targetId, setTargetId] = useState(initialDraft?.id ?? "");
  const target = drafts.find((item) => item.id === targetId) ?? null;
  const [name, setName] = useState(initialDraft?.name ?? "");
  return (
    <Dialog title="Save draft" onClose={() => { if (!busy) onClose(); }}>
      {description ? <p>{description}</p> : null}
      <form
        className="schedule-save-form"
        onSubmit={(event) => {
          event.preventDefault();
          // Overwriting another draft is the button's second click, never
          // Enter (BL-708); Enter moves to that button instead.
          if (target)
            event.currentTarget
              .querySelector<HTMLButtonElement>("[data-save-draft-overwrite]")
              ?.focus();
          else if (!busy) onSave(name, null);
        }}
      >
        <label>
          Destination
          <select
            disabled={busy}
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
            disabled={busy}
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
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {target ? (
            // UI-12: overwriting another draft asks twice, as Publish ▾ does.
            <ConfirmButton
              data-save-draft-overwrite
              unstyled
              className="danger"
              disabled={busy}
              confirmLabel={busy ? "Saving…" : "Confirm overwrite"}
              onConfirm={() => onSave(name, target)}
            >
              {busy ? "Saving…" : "Overwrite draft"}
            </ConfirmButton>
          ) : (
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save draft"}
            </button>
          )}
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
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
