import type { ExchangeCase, ExchangeCommand, OwnExchangeShift } from "@newfork/shared";
import { ConfirmButton } from "@newfork/ui";
import { Check } from "lucide-react";
import { useState } from "react";
import { SelfOnlyNote } from "./ChangeOptions";
import { PlanDialog } from "./PlanDialog";
import { WindowAlert } from "../../shell/WindowAlert";
import { Hand, ShiftTicket } from "./ShiftTicket";

// TAKAS-RELEASE (Mert, 2026-10-13/14): the release window and the release card in
// My requests. A release goes to everyone eligible; the manager picks who gets it,
// and until then the shift stays with its owner.

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "Teammate";
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const NOTE_LIMIT = 200;

export function ReleaseDialog({
  shift,
  ownerName,
  canWrite,
  run,
  onBack,
  onClose,
  onReleased,
}: {
  shift: OwnExchangeShift;
  ownerName: string;
  canWrite: boolean;
  run: (command: ExchangeCommand) => Promise<{ case_id: string }>;
  onBack?: () => void;
  onClose: () => void;
  onReleased: (caseId: string) => void;
}) {
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const release = async () => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const result = await run({ action: "create", kind: "cover", shift_id: shift.id, note: "", teammate_note: note.trim() });
      onReleased(result.case_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to release this shift");
    } finally {
      setWorking(false);
    }
  };
  return (
    <PlanDialog
      eyebrow="Release shift"
      names={
        <Hand from={ownerName} to={<i>open shifts</i>} />
      }
      onBack={onBack}
      onClose={onClose}
      busy={working}
      alert={error}
      foot={
        <>
          <p className="sx-w-meta">Teammates who can work it see it. You stay responsible until your manager approves.</p>
          <button type="button" className="sx-primary" disabled={!canWrite || working} onClick={() => void release()}>
            Release shift
          </button>
        </>
      }
    >
      <ShiftTicket shift={shift} hand={<Hand from={firstName(ownerName)} to={<em>anyone eligible</em>} />} />
      <SelfOnlyNote tier={shift.decision_tier} />
      <label className="sx-note-field">
        <span>
          Note for teammates <small>Optional · everyone eligible sees it</small>
        </span>
        <textarea value={note} maxLength={NOTE_LIMIT} onChange={(event) => setNote(event.target.value)} />
      </label>
    </PlanDialog>
  );
}

/** Where a request is now, in three steps. */
export function RequestPath({ steps }: { steps: readonly (readonly [string, "done" | "now" | "next"])[] }) {
  return (
    <ol className="sx-path" aria-label="Request progress">
      {steps.map(([label, state]) => (
        <li key={label} data-state={state} aria-current={state === "now" ? "step" : undefined}>
          <span className="sx-path-dot" aria-hidden>
            {state === "done" ? <Check /> : null}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

/** "Asked 1 h ago". */
export function askedAgo(at: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  if (minutes < 1) return "Asked just now";
  if (minutes < 60) return `Asked ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Asked ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `Asked ${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The owner's release in My requests: where it stands, who wants it, Take back. */
export function ReleaseCard({
  item,
  canWrite,
  run,
}: {
  item: ExchangeCase;
  canWrite: boolean;
  run: (command: ExchangeCommand) => Promise<unknown>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const wanting = item.applications.filter((application) => application.status === "pending_manager");
  const open = item.status === "open";
  const takeBack = async () => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await run({ action: "close", case_id: item.id, expected_revision: item.revision, reason: "", private_note: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to take your shift back");
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="sx-w" aria-label="Released shift">
      <header className="sx-w-head">
        <h3>Released</h3>
      </header>
      <p className="sx-w-names">
        <Hand from={item.owner_name ?? "You"} to={<i>open shifts</i>} />
      </p>
      <div className="sx-w-body">
        {open ? (
          <RequestPath
            steps={[
              ["Released", "done"],
              [wanting.length ? `${wanting.length} ${wanting.length === 1 ? "wants" : "want"} it` : "Nobody yet", wanting.length ? "done" : "now"],
              ["Manager picks", wanting.length ? "now" : "next"],
            ]}
          />
        ) : null}
        <ShiftTicket shift={item.shift} hand={<Hand from={firstName(item.owner_name)} to={<em>anyone eligible</em>} />} />
        {item.teammate_note ? (
          <p className="sx-q">
            <b>Your note</b>“{item.teammate_note}”
          </p>
        ) : null}
        {open ? (
          <>
            <p className="sx-w-label">Who wants it</p>
            {wanting.length ? (
              <div className="sx-asked">
                {wanting.map((application) => (
                  <div className="sx-pr" key={application.id}>
                    <span className="sx-pr-av" aria-hidden>
                      {initials(application.employee_name)}
                    </span>
                    <span className="sx-pr-name">{application.employee_name}</span>
                    <span className="sx-pr-sub">{askedAgo(application.created_at)}</span>
                    <span className="sx-pr-state">
                      <span className="sx-st" data-tone="warn">
                        Wants it
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="sx-help">Nobody has asked yet. The shift stays yours until your manager approves someone.</p>
            )}
          </>
        ) : null}
      </div>
      {open && item.is_owner ? (
        <footer className="sx-w-foot">
          {/* Its refusal in the band over the body's bottom edge (UI-FIELDMSG-2). */}
          <WindowAlert message={error} />
          <p className="sx-w-meta">Your manager picks who gets it. Until then it is your shift.</p>
          {/* Taking the shift back ends the release for everyone who asked: red, two clicks (BL-748). */}
          <ConfirmButton
            unstyled
            className="sx-danger"
            confirmLabel="Confirm take back"
            disabled={!canWrite || working}
            onConfirm={() => void takeBack()}
          >
            Take back shift
          </ConfirmButton>
        </footer>
      ) : (
        // No footer left to hang from: the band lies over the body's bottom edge, no empty bar.
        <WindowAlert between message={error} />
      )}
    </section>
  );
}
