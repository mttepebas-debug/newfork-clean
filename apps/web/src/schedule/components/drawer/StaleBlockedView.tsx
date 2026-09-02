import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";

interface StaleBlockedViewProps {
  readonly state: {
    readonly draft?: {
      readonly scheduled_date?: string;
      readonly start_time?: string;
      readonly end_time?: string;
      readonly note?: string | null;
      readonly notes?: string | null;
    };
    readonly serverShift?: { readonly id: string };
  };
  readonly dispatch?: (event: { readonly type: "DISCARD" }) => void;
  readonly host?: {
    readonly latestShift?: (id: string) =>
      | {
          readonly scheduled_date?: string;
          readonly start_time?: string;
          readonly end_time?: string;
          readonly note?: string | null;
          readonly notes?: string | null;
        }
      | null
      | undefined;
  };
  readonly onReload: () => void;
}

export function StaleBlockedView({
  state,
  dispatch,
  host,
  onReload,
}: StaleBlockedViewProps) {
  const draft = state.draft;
  const server = state.serverShift?.id
    ? host?.latestShift?.(state.serverShift.id)
    : null;

  return (
    <div className="schedule-drawer-terminal-view">
      <div className="schedule-overwrite-warning" role="alert">
        <strong>Shift updated by another user.</strong>
        <span>
          Reload to fetch the latest version (your draft will be replaced) or
          discard your edits.
        </span>
      </div>
      <div className="schedule-drawer-terminal-columns">
        <Column title="Your draft">
          <Row label="Date" value={draft?.scheduled_date ?? "-"} />
          <Row
            label="Time"
            value={`${draft?.start_time ?? "--:--"}–${draft?.end_time ?? "--:--"}`}
          />
          {draft?.notes || draft?.note ? (
            <Row label="Notes" value={draft.notes ?? draft.note ?? ""} />
          ) : null}
        </Column>
        <Column title="Server">
          {server ? (
            <>
              <Row label="Date" value={server.scheduled_date ?? "-"} />
              <Row
                label="Time"
                value={`${server.start_time ?? "--:--"}–${server.end_time ?? "--:--"}`}
              />
              {server.notes || server.note ? (
                <Row label="Notes" value={server.notes ?? server.note ?? ""} />
              ) : null}
            </>
          ) : (
            <p>Refreshing…</p>
          )}
        </Column>
      </div>
      <div className="schedule-dialog-actions">
        <button type="button" onClick={() => dispatch?.({ type: "DISCARD" })}>
          Discard
        </button>
        <button type="button" className="primary" onClick={onReload}>
          <RotateCw size={14} aria-hidden />
          Reload
        </button>
      </div>
    </div>
  );
}

function Column({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <dl>
      <dt>{title}</dt>
      {children}
    </dl>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
