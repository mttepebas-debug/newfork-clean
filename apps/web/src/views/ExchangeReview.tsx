import type { ExchangeCase } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfirmButton } from "@newfork/ui";
import { Lock } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { changeExchange, getExchangePreview, refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { Hand, ShiftTicket } from "../employee-hub/shift-exchanges/ShiftTicket";
import { timeOffDeadlineAt, timeOffZoneName } from "../employee-hub/time-off-split";
import { exchangeStatus } from "../schedule/request-sentences";
import { candidateChecks } from "./exchange-review";
import { DrawerField, DrawerSection, RequestDrawer, type DrawerTone } from "./RequestDrawer";
import { blockerLines } from "./swap-review";

type Tab = "details" | "activity";
/** The footer's step: deciding, writing why the request closes, or why one person is declined. */
type Step = { readonly kind: "decide" } | { readonly kind: "close" } | { readonly kind: "decline"; readonly id: string };

const firstName = (name: string | null | undefined) => (name ?? "").split(" ")[0] || "Teammate";
const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("");

// A closed request says how it ended instead of asking for a decision.
const endings: Partial<Record<ExchangeCase["status"], string>> = {
  cancelled: "Closed. No shifts changed.",
  expired: "The decision deadline passed. No shifts changed.",
  invalidated: "Shift details changed, so the request ended. No shifts changed.",
};

/**
 * Requests → a pickup or cover row (Mert, 2026-10-11; TAKAS-RELEASE, plan
 * 2026-10-13/14): the shift card, who keeps it until the decision, and who asked
 * to take it, each with the core's checks. The manager picks one and gives the
 * shift in one step, or declines one person (BL-910: only they read the reason);
 * Close ends the request. Both reasons are optional (plan 05:03; Mert, 2026-10-16).
 */
export function ExchangeReview({ item, workspace, timeFormat, onClose, onDone, onHold }: {
  readonly item: ExchangeCase;
  readonly workspace: string;
  readonly timeFormat: "12h" | "24h";
  readonly onClose: () => void;
  /** The decision went through: the page closes the drawer and says it. */
  readonly onDone: (message: string) => void;
  /** True while a reason is being written or a decision saved: the page keeps the drawer open (P26). */
  readonly onHold?: (held: boolean) => void;
}) {
  const client = useQueryClient();
  const open = item.status === "open";
  const decides = open && item.can_manage;
  const owner = item.owner_name ? firstName(item.owner_name) : null;
  // A release (a cover asked of everyone eligible) is a pickup on the manager's side.
  const pickup = item.audience === "eligible_pool";
  // The manager decides among those who asked and are waiting for a decision.
  const asked = item.applications.filter((application) => (open ? application.status === "pending_manager" : true));
  const checks = new Map(asked.map((application) => [application.id, candidateChecks(application.eligibility)]));
  const choosable = asked.filter((application) => !checks.get(application.id)!.blocked);
  const [tab, setTab] = useState<Tab>("details");
  const [pick, setPick] = useState(choosable.length === 1 && decides ? choosable[0]!.id : "");
  const [step, setStepState] = useState<Step>({ kind: "decide" });
  // Each step keeps its own reason: going back and returning finds it as it was (P26).
  const [closeReason, setCloseReason] = useState("");
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>({});
  const key = useRef<string>(crypto.randomUUID());
  const picked = asked.find((application) => application.id === pick && choosable.includes(application));
  const preview = useQuery({
    queryKey: ["shift-exchanges", workspace, "preview", item.id, picked?.id, item.revision],
    queryFn: () => getExchangePreview(workspace, item.id, picked!.id),
    enabled: decides && Boolean(picked),
    retry: false,
  });
  const declined = step.kind === "decline" ? asked.find((application) => application.id === step.id) : undefined;
  const reason = step.kind === "close" ? closeReason : step.kind === "decline" ? (declineReasons[step.id] ?? "") : "";
  // The person, and whether others asked, travel with the save: a live refresh
  // can drop them from the list before the save answers (train CI 38147392878,
  // 38148426482).
  const decide = useMutation({
    mutationFn: ({ action, person }: { readonly action: "approve" | "close" | "reject"; readonly person?: ExchangeCase["applications"][number]; readonly others?: boolean }) =>
      changeExchange(workspace, action === "close"
        ? { action, case_id: item.id, expected_revision: item.revision, reason: reason.trim(), private_note: "" }
        : action === "approve"
          ? { action, case_id: item.id, application_id: person!.id, expected_revision: item.revision, fingerprint: preview.data?.fingerprint, reason: "", private_note: "" }
          : { action, case_id: item.id, application_id: person!.id, expected_revision: item.revision, reason: reason.trim(), private_note: "" }, key.current),
    onSuccess: (result, { action, person, others }) => {
      // The decision is saved: say so now; a failing refresh after it is not its error.
      onDone(action === "close"
        ? `Request closed. ${owner ? `${owner} keeps the shift.` : "The shift stays open."}`
        : action === "reject"
          ? `${firstName(person!.employee_name)}'s request is declined.${others ? " The others can still take the shift." : ""}`
          : result.status === "completed"
            ? `${firstName(person!.employee_name)} has the shift now.${owner ? ` ${owner} is off it.` : ""}`
            : "Your approval is recorded. The other location's manager decides next.");
      void refreshExchangeSurfaces(client, workspace).catch(() => undefined);
    },
    onError: () => {
      key.current = crypto.randomUUID();
      void refreshExchangeSurfaces(client, workspace).catch(() => undefined);
    },
  });
  // A step shows only its own error: a failed give does not follow into Close.
  function setStep(next: Step) {
    decide.reset();
    setStepState(next);
  }
  const held = decide.isPending || (step.kind !== "decide" && reason.trim() !== "");
  useEffect(() => {
    onHold?.(held);
    return () => onHold?.(false);
  }, [held, onHold]);
  // Esc in a reason goes back to deciding and keeps what was typed (P26).
  function backOnEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || event.defaultPrevented || decide.isPending) return;
    event.preventDefault();
    setStep({ kind: "decide" });
  }

  const refusals = preview.data && !preview.data.allowed && picked
    ? [...new Set(blockerLines(preview.data.reasons, { receiver: preview.data.receiver, giver: preview.data.giver }, { owner, other: firstName(picked.employee_name) }))]
    : [];
  const warned = picked ? checks.get(picked.id)!.warned : false;
  const giveLabel = picked
    ? `Give to ${firstName(picked.employee_name)}${warned ? " anyway" : ""}`
    : asked.length ? "Pick someone" : "Nobody to approve";

  let footer: ReactNode;
  if (!open) {
    const taker = item.applications.find((application) => application.status === "approved");
    footer = (
      <p className="rd-foot-note" role="status">
        {item.status === "completed" ? `Approved. The shift is ${taker?.employee_name ?? "someone else"}'s now.` : (endings[item.status] ?? "This request is closed.")}
      </p>
    );
  } else if (decides && (step.kind === "close" || declined)) {
    const first = declined ? firstName(declined.employee_name) : "";
    footer = (
      <div className="rd-step" onKeyDown={backOnEscape}>
        <label className="rd-field">
          <span className="rd-label">
            {declined ? `Reason for ${first}` : owner ? `Reason for ${owner} and the people who asked` : "Reason for the people who asked"}{" "}
            <small>Optional</small>
          </span>
          <textarea
            className="rd-textarea"
            rows={3}
            maxLength={1000}
            autoFocus
            value={reason}
            placeholder={declined ? `Only ${first} reads this.` : "They read this."}
            onChange={(event) => {
              const value = event.target.value;
              if (step.kind === "decline") setDeclineReasons((all) => ({ ...all, [step.id]: value }));
              else setCloseReason(value);
            }}
          />
        </label>
        <p className="rd-foot-note">
          {declined
            ? asked.length > 1 ? "The others can still take the shift." : `${owner ?? "The shift"} ${owner ? "keeps the shift" : "stays open"} until someone else asks.`
            : `${owner ? `${owner} keeps the shift.` : "The shift stays open."}`}
        </p>
        <div className="rd-foot-row">
          <button type="button" className="nf-button secondary-button" disabled={decide.isPending} onClick={() => setStep({ kind: "decide" })}>
            Back
          </button>
          <div className="rd-foot-actions">
            <ConfirmButton
              className="danger-button"
              confirmLabel={declined ? "Confirm decline" : "Confirm close"}
              disabled={decide.isPending}
              onConfirm={() => decide.mutate(declined ? { action: "reject", person: declined, others: asked.length > 1 } : { action: "close" })}
            >
              {decide.isPending ? "Saving..." : declined ? `Decline ${first}` : "Close request"}
            </ConfirmButton>
          </div>
        </div>
      </div>
    );
  } else {
    // A manager who cannot decide sees the same buttons, faded, and who decides (KARARLAR G1).
    footer = (
      <>
        {preview.data?.requires_other_manager ? <p className="rd-foot-note">Another location's manager also approves.</p> : null}
        <div className="rd-foot-row">
          <button type="button" className="nf-button danger-outline" disabled={!decides || decide.isPending} onClick={() => setStep({ kind: "close" })}>
            Close request
          </button>
          <div className="rd-foot-actions">
            <button
              type="button"
              className="nf-button"
              disabled={!decides || !picked || !preview.data?.allowed || preview.isFetching || decide.isPending}
              onClick={() => decide.mutate({ action: "approve", person: picked })}
            >
              {decide.isPending ? "Saving..." : giveLabel}
            </button>
          </div>
        </div>
        {!decides ? (
          <p className="rd-foot-note rd-lock" role="note">
            <Lock size={14} aria-hidden />
            Another {item.shift.location_name} manager, the owner or an admin decides this request.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <RequestDrawer
      // Both when both hold, each whole (UI-FIELDMSG-2): the decision's refusal and the check's.
      footerAlert={
        [decide.error?.message, preview.isError ? "Eligibility could not be checked. Close and try again." : null]
          .filter(Boolean)
          .join(" ") || null
      }
      title={pickup ? "Shift pickup" : "Cover request"}
      status={statusChip(item)}
      sub={
        <>
          {/* An open shift a publish offered has no owner (Mert, 2026-10-20). */}
          {item.owner_id ? <>Shift owner: <b>{item.owner_name ?? "A teammate"}</b></> : <b>Open shift</b>} · {item.shift.location_name}
          {open ? ` · Expires ${timeOffDeadlineAt(item.expires_at, item.shift.timezone, timeFormat)} ${timeOffZoneName(item.shift.timezone)}` : ""}
        </>
      }
      scheduleHref={`/app/schedule?date=${item.shift.scheduled_date}&view=day&locations=${item.shift.location_id}`}
      tabs={[{ key: "details", label: "Details" }, { key: "activity", label: "Activity" }]}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      footer={footer}
    >
      {tab === "details" ? (
        <>
          <DrawerSection>
            <ShiftTicket
              shift={item.shift}
              hand={
                <Hand
                  from={owner ?? (item.owner_id ? "A teammate" : "Open shift")}
                  to={
                    picked
                      ? firstName(picked.employee_name)
                      : item.status === "completed"
                        ? firstName(item.applications.find((application) => application.status === "approved")?.employee_name)
                        : <em>?</em>
                  }
                />
              }
            />
            {item.teammate_note ? (
              <p className="sx-q">
                <b>{owner ?? "Note"}</b>“{item.teammate_note}”
              </p>
            ) : null}
            {open ? (
              <p className="rd-info">
                {owner ? `${owner} stays on this shift until you approve.` : "Nobody is on this shift yet. It stays open until you approve someone."}
              </p>
            ) : null}
            {item.private_note && owner ? (
              <DrawerField label={`Private note from ${owner}`}>
                <blockquote className="rd-quote">{item.private_note}</blockquote>
                <small>Only managers see this.</small>
              </DrawerField>
            ) : null}
          </DrawerSection>
          <DrawerSection
            title={pickup ? "Who wants it" : "Who accepted"}
            aside={
              <span className="rd-chip warn">
                {asked.length} {pickup ? (asked.length === 1 ? "wants it" : "want it") : "accepted"}
              </span>
            }
          >
            <div className="rd-group" role="radiogroup" aria-label={pickup ? "Who wants it" : "Who accepted"}>
              {asked.length ? asked.map((application) => {
                const check = checks.get(application.id)!;
                const disabled = !decides || check.blocked || decide.isPending;
                return (
                  <div key={application.id} className={`rd-cand${pick === application.id ? " on" : ""}${check.blocked ? " off" : ""}`}>
                    <label className="rd-cand-pick">
                      <input
                        type="radio"
                        name={`taker-${item.id}`}
                        checked={pick === application.id}
                        disabled={disabled}
                        onChange={() => setPick(application.id)}
                      />
                      <span className="rd-avatar" aria-hidden>{initials(application.employee_name)}</span>
                      <span className="rd-row-main">
                        <b>{application.employee_name}</b>
                        <span>Asked {timeOffDeadlineAt(application.created_at, item.shift.timezone, timeFormat)}</span>
                        <span>
                          {check.chips.map((chip) => <span key={chip.text} className={`rd-chip ${chip.tone}`}>{chip.text}</span>)}
                        </span>
                      </span>
                    </label>
                    {decides ? (
                      <button
                        type="button"
                        className="nf-button danger-outline rd-small"
                        aria-label={`Decline ${application.employee_name}`}
                        disabled={decide.isPending}
                        onClick={() => setStep({ kind: "decline", id: application.id })}
                      >
                        Decline
                      </button>
                    ) : null}
                  </div>
                );
              }) : (
                <p className="rd-empty">Nobody has asked yet. {owner ? `${owner} keeps the shift until you approve someone.` : "The shift stays open until you approve someone."}</p>
              )}
            </div>
            {refusals.length ? (
              <ul className="rd-note warn rd-refusals" role="alert">
                {refusals.map((text) => <li key={text}>{text}</li>)}
              </ul>
            ) : null}
          </DrawerSection>
        </>
      ) : (
        <DrawerSection title="Activity">
          {item.history.length ? (
            <ol className="rd-activity">
              {[...item.history].reverse().map((event) => (
                <li key={event.id}>
                  <i aria-hidden />
                  <div>
                    <b>{event.message || event.action}</b>
                    <span>{timeOffDeadlineAt(event.created_at, item.shift.timezone, timeFormat)}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rd-note">Nothing has happened yet.</p>
          )}
        </DrawerSection>
      )}
    </RequestDrawer>
  );
}

// The same short words as the Requests row; a quietly closed request has none.
const drawerTones = { amber: "warn", green: "ok", red: "red", gray: "grey" } as const satisfies Record<string, DrawerTone>;
function statusChip(item: ExchangeCase): { label: string; tone: DrawerTone } | undefined {
  const status = exchangeStatus(item);
  return status ? { label: status.label, tone: drawerTones[status.tone] } : undefined;
}
