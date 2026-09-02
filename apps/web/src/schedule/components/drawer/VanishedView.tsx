import { Trash2 } from "lucide-react";

interface VanishedViewProps {
  readonly state: {
    readonly lastKnownDraft?: {
      readonly scheduled_date?: string;
      readonly start_time?: string;
      readonly end_time?: string;
      readonly note?: string | null;
      readonly notes?: string | null;
    };
  };
  readonly dispatch?: (event: { readonly type: "CLOSE" }) => void;
}

export function VanishedView({ state, dispatch }: VanishedViewProps) {
  const draft = state.lastKnownDraft;

  return (
    <div className="schedule-drawer-terminal-view">
      <div className="schedule-overwrite-warning" role="alert">
        <Trash2 size={15} aria-hidden />
        <strong>This shift was removed by another user.</strong>
        <span>
          Your in-progress edits below are not saved anywhere. Copy them out if
          you need them, then close.
        </span>
      </div>
      <dl className="schedule-drawer-terminal-summary">
        <div>
          <dt>Date</dt>
          <dd>{draft?.scheduled_date ?? "-"}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{`${draft?.start_time ?? "--:--"}–${draft?.end_time ?? "--:--"}`}</dd>
        </div>
        {draft?.notes || draft?.note ? (
          <div>
            <dt>Notes</dt>
            <dd>{draft.notes ?? draft.note ?? ""}</dd>
          </div>
        ) : null}
      </dl>
      <div className="schedule-dialog-actions">
        <button type="button" className="primary" onClick={() => dispatch?.({ type: "CLOSE" })}>
          Close
        </button>
      </div>
    </div>
  );
}
