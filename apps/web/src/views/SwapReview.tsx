import type { ExchangeCase, ExchangeShift } from "@newfork/shared";
import { ConfirmButton } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Check, Lock, MapPin, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { changeExchange, getExchangePreview, refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { timeOffDeadlineAt } from "../employee-hub/time-off-split";
import { clockRange, shortDate } from "./RequestsTable";
import { blockerLines, reviewBoxes, timeOffStops, type ReviewBox, type ReviewSide } from "./swap-review";
import "./swap-review.css";
import { WindowAlert } from "../shell/WindowAlert";

// EKRAN-02 C2 (KARARLAR "Takas inceleme penceresi H2", 2026-10-07): Requests →
// Review → a swap opens this compact window. Centred title and names; the two
// shifts side by side with a dark ⇄ between them; a box per rule that fails on
// either shift (orange where it fails, green where it holds; warnings never
// block approval, approved time off always does: KARARLAR §1.1, 2026-10-09); Decide by at the bottom left, Decline and Approve at the
// right. Decline asks for the reason the employee reads (BL-910: only them).

const firstName = (name: string | null | undefined) => (name ?? "").split(" ")[0] || "Teammate";

// A closed swap says how it ended instead of asking for a decision.
const outcomes: Partial<Record<ExchangeCase["status"], string>> = {
  completed: "Swap approved.",
  cancelled: "Swap request closed. No shifts changed.",
  expired: "The decision deadline passed. No shifts changed.",
  invalidated: "Shift details changed, so the swap ended. No shifts changed.",
};

/** A modal window: the browser keeps focus inside and Esc closes it; focus goes back where it was. */
function ReviewWindow({ title, busy, onClose, onEscape, children }: {
  title: string; busy: boolean; onClose: () => void; onEscape: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal?.();
    return () => {
      dialog?.close?.();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="swap-review"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onEscape();
      }}
    >
      <header className="swap-review-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="swap-review-close" aria-label="Close" disabled={busy} onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

function ShiftCard({ shift, from, to, boxes, timeFormat }: {
  shift: ExchangeShift; from: string; to: string; boxes: ReviewBox[]; timeFormat: "12h" | "24h";
}) {
  const day = shortDate(shift.scheduled_date, { weekday: true });
  return (
    <div className="swap-review-shift" role="group" aria-label={`${day}, ${shift.location_name}, ${from} to ${to}`}>
      <b>{day}</b>
      {/* A long location name is cut inside the card; the whole name stays on hover. */}
      <span className="swap-review-place" title={shift.location_name}>
        <MapPin size={12} aria-hidden />
        <span className="swap-review-place-name">{shift.location_name}</span>
      </span>
      <span>{shift.start_time && shift.end_time ? clockRange(shift.start_time, shift.end_time, timeFormat, { spaced: true }) : "Hours not set"}</span>
      <span className="swap-review-hand">
        {from} <i aria-hidden>→</i> {to}
      </span>
      {boxes.map((box) => (
        <p key={box.rule} className="swap-review-box" data-tone={box.tone}>
          {box.tone === "warn" ? <AlertTriangle size={14} aria-hidden /> : <Check size={14} aria-hidden />}
          <span>
            <strong>{box.top}</strong>
            <small>{box.bottom}</small>
          </span>
        </p>
      ))}
    </div>
  );
}

export function SwapReview({ item, workspace, timeFormat, onClose, onDone }: {
  readonly item: ExchangeCase;
  readonly workspace: string;
  readonly timeFormat: "12h" | "24h";
  readonly onClose: () => void;
  /** The decision went through: the page closes the window and says it. */
  readonly onDone: (message: string) => void;
}) {
  const client = useQueryClient();
  const pending = item.applications.find((application) => application.status === "pending_manager");
  const invited = item.applications.find((application) => application.status === "invited");
  // The other person comes from the request itself: once a swap is approved the
  // requested shift's live holder is the owner (EKRAN-02 C2 review).
  const applicant = pending ?? invited ?? item.applications.find((application) => application.status === "approved") ?? item.applications.at(-1);
  const open = item.status === "open";
  const owner = firstName(item.owner_name);
  const other = firstName(applicant?.employee_name ?? item.requested_shift?.employee_name);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const key = useRef<string>(crypto.randomUUID());
  const decides = item.can_manage && item.status === "open";
  const preview = useQuery({
    queryKey: ["shift-exchanges", workspace, "preview", item.id, pending?.id, item.revision],
    queryFn: () => getExchangePreview(workspace, item.id, pending!.id),
    enabled: decides && Boolean(pending),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: (action: "approve" | "reject") =>
      changeExchange(workspace, {
        action, case_id: item.id, application_id: pending!.id, expected_revision: item.revision,
        fingerprint: preview.data?.fingerprint, reason: action === "reject" ? reason.trim() : "", private_note: "",
      }, key.current),
    onSuccess: (result, action) => {
      // The decision is saved: say so now; a failing refresh after it is not its error.
      // Two locations: the first approval is a vote; the shifts move on the last one.
      onDone(action === "reject" ? "Swap declined." : result.status === "completed" ? "Swap approved." : "Your approval is recorded. The other location's manager decides next.");
      void refreshExchangeSurfaces(client, workspace).catch(() => undefined);
    },
    onError: () => {
      key.current = crypto.randomUUID();
      void refreshExchangeSurfaces(client, workspace).catch(() => undefined);
    },
  });
  const sides: [ReviewSide, ReviewSide] = [
    { date: item.shift.scheduled_date, check: preview.data?.receiver ?? null },
    { date: item.requested_shift?.scheduled_date ?? item.shift.scheduled_date, check: preview.data?.giver ?? null },
  ];
  const [offered, returned] = reviewBoxes(sides);
  // The first side is the one who takes the offered shift: the other person.
  const onTimeOff = ([[sides[0], other], [sides[1], owner]] as const).filter(([side]) => timeOffStops([side])).map(([, name]) => name);
  const reasons = [
    ...(preview.data && !preview.data.allowed
      ? blockerLines(preview.data.reasons, { receiver: preview.data.receiver, giver: preview.data.giver }, { owner, other })
      : []),
    ...onTimeOff.map((name) => `${name} has approved time off then. Their time off must be shortened before this swap.`),
  ];
  const blocked = reasons.length > 0;
  const decideBy = timeOffDeadlineAt(item.expires_at, item.shift.timezone, timeFormat);
  // Both when both hold, each whole (UI-FIELDMSG-2): the decision's refusal and the check's.
  const windowError =
    [decide.error?.message, preview.isError ? "Eligibility could not be checked. Close and try again." : null]
      .filter(Boolean)
      .join(" ") || null;
  const places = [...new Set([item.shift.location_name, item.requested_shift?.location_name].filter(Boolean))].join(" or ");
  return (
    // Esc in the decline step goes back to the shifts and keeps the reason (P26).
    <ReviewWindow title="Swap request" onClose={onClose} onEscape={() => (declining ? setDeclining(false) : onClose())} busy={decide.isPending}>
      <p className="swap-review-names">
        {item.owner_name ?? "Open shift"} ⇄ {applicant?.employee_name ?? item.requested_shift?.employee_name ?? "Teammate"}
      </p>
      <div className="swap-review-body">
        <div className="swap-review-pair">
          <ShiftCard shift={item.shift} from={owner} to={other} boxes={offered} timeFormat={timeFormat} />
          <span className="swap-review-swapicon" aria-hidden>
            <ArrowLeftRight size={15} />
          </span>
          {item.requested_shift ? (
            <ShiftCard shift={item.requested_shift} from={other} to={owner} boxes={returned} timeFormat={timeFormat} />
          ) : null}
        </div>
        {blocked ? (
          <ul className="swap-review-blockers" role="alert">
            {[...new Set(reasons)].map((text) => <li key={text}>{text}</li>)}
          </ul>
        ) : null}
        {preview.data?.requires_other_manager ? <p className="swap-review-note">Another location’s manager also approves.</p> : null}
        {!item.can_manage && item.status === "open" ? (
          <p className="swap-review-note swap-review-lock">
            <Lock size={14} aria-hidden />
            Another {places} manager, the owner or an admin decides this request.
          </p>
        ) : null}
      </div>
      {declining ? (
        <div className="swap-review-decline">
          <label>
            <span>Reason for {other}</span>
            <textarea rows={3} maxLength={1000} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <footer className="swap-review-foot">
            {/* Over the window's bottom edge, above the buttons (UI-FIELDMSG). */}
            <WindowAlert message={windowError} />
            <button type="button" className="nf-button secondary-button" disabled={decide.isPending} onClick={() => setDeclining(false)}>
              Back
            </button>
            <ConfirmButton className="danger" confirmLabel="Confirm decline" disabled={!reason.trim() || decide.isPending} onConfirm={() => decide.mutate("reject")}>
              Decline swap
            </ConfirmButton>
          </footer>
        </div>
      ) : (
        <footer className="swap-review-foot">
          <WindowAlert message={windowError} />
          {open ? <span className="swap-review-deadline">Decide by {decideBy}</span> : null}
          {!open ? (
            <span className="swap-review-deadline" role="status">{outcomes[item.status] ?? "This swap request is closed."}</span>
          ) : pending || !invited ? (
            <>
              <button type="button" className="nf-button secondary-button" disabled={!decides || !pending || decide.isPending} onClick={() => setDeclining(true)}>
                Decline
              </button>
              <button
                type="button"
                className="nf-button"
                disabled={!decides || !pending || !preview.data?.allowed || onTimeOff.length > 0 || preview.isFetching || decide.isPending}
                onClick={() => decide.mutate("approve")}
              >
                Approve
              </button>
            </>
          ) : (
            <span className="swap-review-note">Waiting for {other} to accept.</span>
          )}
        </footer>
      )}
    </ReviewWindow>
  );
}
