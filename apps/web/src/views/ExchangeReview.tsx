import type { ExchangeCase } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { changeExchange, getExchangePreview, refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { formatTimeOffDay, timeOffDeadlineAt, timeOffZoneName } from "../employee-hub/time-off-split";
import { candidateChecks, shiftLength } from "./exchange-review";
import { DrawerField, DrawerSection, RequestDrawer, type DrawerTone } from "./RequestDrawer";
import { clockRange } from "./RequestsTable";
import { blockerLines } from "./swap-review";

type Tab = "details" | "activity";

const firstName = (name: string | null | undefined) => (name ?? "").split(" ")[0] || "Teammate";
const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("");

// A closed request says how it ended instead of asking for a decision.
const endings: Partial<Record<ExchangeCase["status"], string>> = {
  cancelled: "Closed. No shifts changed.",
  expired: "The decision deadline passed. No shifts changed.",
  invalidated: "Shift details changed, so the request ended. No shifts changed.",
};

/**
 * Requests → a cover or open shift row (Mert, 2026-10-11): the shift, who
 * keeps it until the decision, and who asked to take it, each with the core's
 * checks. The manager picks one and gives the shift in one step; Close asks
 * the reason the people involved read (the core requires one).
 */
export function ExchangeReview({ item, workspace, timeFormat, onClose, onDone }: {
  readonly item: ExchangeCase;
  readonly workspace: string;
  readonly timeFormat: "12h" | "24h";
  readonly onClose: () => void;
  /** The decision went through: the page closes the drawer and says it. */
  readonly onDone: (message: string) => void;
}) {
  const client = useQueryClient();
  const open = item.status === "open";
  const decides = open && item.can_manage;
  const owner = item.owner_name ? firstName(item.owner_name) : null;
  // The manager decides among those who asked and are waiting for a decision.
  const asked = item.applications.filter((application) => (open ? application.status === "pending_manager" : true));
  const checks = new Map(asked.map((application) => [application.id, candidateChecks(application.eligibility)]));
  const choosable = asked.filter((application) => !checks.get(application.id)!.blocked);
  const [tab, setTab] = useState<Tab>("details");
  const [pick, setPick] = useState(choosable.length === 1 && decides ? choosable[0]!.id : "");
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const key = useRef<string>(crypto.randomUUID());
  const picked = asked.find((application) => application.id === pick && choosable.includes(application));
  const preview = useQuery({
    queryKey: ["shift-exchanges", workspace, "preview", item.id, picked?.id, item.revision],
    queryFn: () => getExchangePreview(workspace, item.id, picked!.id),
    enabled: decides && Boolean(picked),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: (action: "approve" | "close") =>
      changeExchange(workspace, action === "approve"
        ? { action, case_id: item.id, application_id: picked!.id, expected_revision: item.revision, fingerprint: preview.data?.fingerprint, reason: "", private_note: "" }
        : { action, case_id: item.id, expected_revision: item.revision, reason: reason.trim(), private_note: "" }, key.current),
    onSuccess: (result, action) => {
      // The decision is saved: say so now; a failing refresh after it is not its error.
      onDone(action === "close"
        ? `Request closed. ${owner ? `${owner} keeps the shift.` : "The shift stays open."}`
        : result.status === "completed"
          ? `${firstName(picked!.employee_name)} has the shift now.${owner ? ` ${owner} is off it.` : ""}`
          : "Your approval is recorded. The other location's manager decides next.");
      void refreshExchangeSurfaces(client, workspace).catch(() => undefined);
    },
    onError: () => {
      key.current = crypto.randomUUID();
      void refreshExchangeSurfaces(client, workspace).catch(() => undefined);
    },
  });

  const hours = item.shift.start_time && item.shift.end_time
    ? clockRange(item.shift.start_time, item.shift.end_time, timeFormat, { bothHalves: true })
    : "Hours not set";
  const day = formatTimeOffDay(item.shift.scheduled_date);
  const refusals = preview.data && !preview.data.allowed && picked
    ? [...new Set(blockerLines(preview.data.reasons, { receiver: preview.data.receiver, giver: preview.data.giver }, { owner: owner ?? "the open", other: firstName(picked.employee_name) }))]
    : [];
  const warned = picked ? checks.get(picked.id)!.warned : false;
  const giveLabel = picked
    ? `Give shift to ${firstName(picked.employee_name)}${warned ? " anyway" : ""}`
    : asked.length ? "Pick someone" : "Nobody to approve";

  let footer: ReactNode;
  if (!open) {
    const taker = item.applications.find((application) => application.status === "approved");
    footer = (
      <p className="rd-foot-note" role="status">
        {item.status === "completed" ? `Approved. The shift is ${taker?.employee_name ?? "someone else"}'s now.` : (endings[item.status] ?? "This request is closed.")}
      </p>
    );
  } else if (!item.can_manage) {
    footer = <p className="view-only-note">Another {item.shift.location_name} manager, the owner or an admin decides this request.</p>;
  } else if (closing) {
    footer = (
      <>
        <label className="rd-field">
          <span className="rd-label">{owner ? `Reason for ${owner} and the people who asked` : "Reason for the people who asked"}</span>
          <textarea className="rd-textarea" rows={3} maxLength={1000} autoFocus value={reason} placeholder="They read this." onChange={(event) => setReason(event.target.value)} />
        </label>
        <p className="rd-foot-note">{owner ? `${owner} keeps the shift.` : "The shift stays open."} People who asked are told.</p>
        {decide.error ? <p className="form-error" role="alert">{decide.error.message}</p> : null}
        <div className="rd-foot-row">
          <button type="button" className="nf-button secondary-button" disabled={decide.isPending} onClick={() => setClosing(false)}>
            Back
          </button>
          <div className="rd-foot-actions">
            <button type="button" className="nf-button danger-button" disabled={decide.isPending || !reason.trim()} onClick={() => decide.mutate("close")}>
              Close request
            </button>
          </div>
        </div>
      </>
    );
  } else {
    footer = (
      <>
        {preview.data?.requires_other_manager ? <p className="rd-foot-note">Another location's manager also approves.</p> : null}
        {decide.error ? <p className="form-error" role="alert">{decide.error.message}</p> : null}
        <div className="rd-foot-row">
          <button type="button" className="nf-button danger-outline" disabled={decide.isPending} onClick={() => setClosing(true)}>
            Close request
          </button>
          <div className="rd-foot-actions">
            <button
              type="button"
              className="nf-button"
              disabled={!picked || !preview.data?.allowed || preview.isFetching || decide.isPending}
              onClick={() => decide.mutate("approve")}
            >
              {decide.isPending ? "Saving..." : giveLabel}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <RequestDrawer
      title={`${day} · ${hours}`}
      type={item.kind === "open_pickup" ? "Open shift" : "Cover"}
      status={statusChip(item, asked.length)}
      sub={open
        ? `Decide by ${timeOffDeadlineAt(item.expires_at, item.shift.timezone, timeFormat)} ${timeOffZoneName(item.shift.timezone)}`
        : `Asked ${timeOffDeadlineAt(item.created_at, item.shift.timezone, timeFormat)}`}
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
            <div className="rd-shift" role="group" aria-label="Shift">
              <span className="rd-shift-day">{day}</span>
              <span className="rd-shift-time">{hours}</span>
              <span className="rd-shift-meta">
                {[item.shift.location_name, item.shift.job_name, shiftLength(item.shift.start_time, item.shift.end_time, item.shift.unpaid_break_minutes)].filter(Boolean).join(" · ")}
              </span>
            </div>
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
            title={open ? "Who can take it" : "Who asked"}
            aside={<span>{asked.length} {asked.length === 1 ? "person" : "people"}</span>}
          >
            <div className="rd-group" role="radiogroup" aria-label={open ? "Who can take it" : "Who asked"}>
              {asked.length ? asked.map((application) => {
                const check = checks.get(application.id)!;
                const disabled = !decides || check.blocked || decide.isPending;
                return (
                  <label key={application.id} className={`rd-cand${pick === application.id ? " on" : ""}${check.blocked ? " off" : ""}`}>
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
                );
              }) : (
                <p className="rd-empty">Nobody has asked yet. The shift stays open on the Schedule.</p>
              )}
            </div>
            {refusals.length ? (
              <ul className="rd-note warn rd-refusals" role="alert">
                {refusals.map((text) => <li key={text}>{text}</li>)}
              </ul>
            ) : null}
            {preview.isError ? <p className="form-error" role="alert">Eligibility could not be checked. Close and try again.</p> : null}
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

function statusChip(item: ExchangeCase, asked: number): { label: string; tone: DrawerTone } {
  if (item.status === "completed") return { label: "Approved", tone: "ok" };
  if (item.status === "cancelled") return { label: "Closed", tone: "grey" };
  if (item.status !== "open") return { label: item.status === "expired" ? "Expired" : "Ended", tone: "grey" };
  if (item.stage === "awaiting_other_manager") return { label: "In progress", tone: "grey" };
  return asked && item.can_manage ? { label: "Needs review", tone: "warn" } : { label: "Open", tone: "grey" };
}
