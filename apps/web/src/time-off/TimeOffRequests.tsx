import type { TimeOffRequestView } from "@newfork/shared";
import { Button, toast, useConfirmClick } from "@newfork/ui";
import { CalendarDays, Ellipsis, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { usePhoneWidth } from "../lib/usePhoneWidth";
import { LeaveIcon } from "./leave-icon";
import { TimeOffAskForm } from "./TimeOffAskForm";
import { StatusPill, TimeOffDetail } from "./TimeOffDetail";
import { TimeOffSheet } from "./TimeOffSheet";
import { useAskTimeOff, useAskTimeOffCancellation, useMyTimeOff, useWithdrawTimeOff } from "./time-off-data";
import {
  canAskToCancel,
  cancellationWaiting,
  cancelRefusalText,
  hoursText,
  leaveLabel,
  placesText,
  rangeShort,
  rangeText,
  requestLook,
  sizeShort,
  splitRequests,
  withdrawRefusalText,
  zoneNow,
  type TimeFormat,
} from "./time-off-text";
import "./time-off-requests.css";

type Tab = "upcoming" | "past";
type Sheet = { kind: "new" } | { kind: "detail"; id: string; cancelOpen: boolean } | null;

/**
 * The employee's Time off (Employee Hub → My Availability → Time off), rebuilt from scratch: Karma,
 * KARARLAR S-242. On a computer a table with a row menu and drawers from the right; on a phone rows and
 * sheets from the bottom. Behind the time-off-v2 flag until D7.
 */
export function TimeOffRequests({ workspaceId, timeFormat }: { workspaceId: string; timeFormat: TimeFormat }) {
  const phone = usePhoneWidth();
  const mine = useMyTimeOff(workspaceId);
  const ask = useAskTimeOff(workspaceId);
  const withdraw = useWithdrawTimeOff(workspaceId);
  const askCancel = useAskTimeOffCancellation(workspaceId);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const formId = useId();

  if (mine.isPending) {
    return (
      <section className="hub-panel tor-card" aria-busy="true" aria-label="Time off">
        <div className="tor-skel" aria-hidden><span /><span /><span /><span className="is-short" /></div>
      </section>
    );
  }
  if (mine.isError) {
    return (
      <section className="hub-panel tor-card" aria-label="Time off">
        <p className="tor-err" role="alert">Couldn't load your time off.</p>
        <Button className="secondary-button tor-retry" onClick={() => void mine.refetch()}>Try again</Button>
      </section>
    );
  }

  const data = mine.data;
  const zone = data.time_zone;
  const now = zone ? zoneNow(zone) : { date: new Date().toISOString().slice(0, 10), time: "00:00" };
  const { upcoming, past } = splitRequests(data.requests, new Date());
  const rows = tab === "upcoming" ? upcoming : past;
  const places = data.location_names;
  const open = sheet?.kind === "detail" ? data.requests.find((r) => r.id === sheet.id) ?? null : null;

  function doWithdraw(request: Pick<TimeOffRequestView, "id" | "revision">, fromSheet: boolean, what: "request" | "cancellation" = "request") {
    setWithdrawError(null);
    withdraw.mutate(request, {
      onSuccess: () => {
        if (fromSheet && what === "request") setSheet(null);
        toast.success(what === "request" ? "Request withdrawn" : "Cancellation request withdrawn");
      },
      onError: (error) => {
        const text = withdrawRefusalText((error as { reason?: string }).reason);
        if (fromSheet) setWithdrawError(text);
        else toast.error(text);
      },
    });
  }

  function openDetail(id: string, cancelOpen = false) {
    setWithdrawError(null);
    setCancelError(null);
    setSheet({ kind: "detail", id, cancelOpen });
  }

  function doAskCancel(request: TimeOffRequestView, note: string | null) {
    setCancelError(null);
    askCancel.mutate(
      { requestId: request.id, input: { note, expected_revision: request.revision, client_key: crypto.randomUUID() } },
      {
        onSuccess: () => {
          setSheet((current) => (current?.kind === "detail" ? { ...current, cancelOpen: false } : current));
          toast.success("Cancellation request sent");
        },
        onError: (error) => setCancelError(cancelRefusalText((error as { reason?: string }).reason)),
      },
    );
  }

  const empty = upcoming.length + past.length === 0;

  return (
    <section className={`hub-panel tor-card${phone ? " is-phone" : ""}`} aria-labelledby={`${formId}-title`}>
      <div className="panel-heading tor-head">
        <div>
          <h2 id={`${formId}-title`}>Time off</h2>
          <p>Ask for days or hours off. {places.length ? `A manager at ${placesText(places)} answers.` : "A manager answers."}</p>
        </div>
        <Button className="tor-new" onClick={() => setSheet({ kind: "new" })}>
          <Plus size={18} aria-hidden />Request time off
        </Button>
      </div>
      {empty ? (
        <div className="tor-empty">
          <span className="tor-empty-ic"><CalendarDays size={20} aria-hidden /></span>
          <p><strong>No time off yet.</strong> Tap Request time off when you need a day.</p>
        </div>
      ) : (
        <>
          <Tabs tab={tab} counts={{ upcoming: upcoming.length, past: past.length }} phone={phone} onSelect={setTab} panelId={`${formId}-panel`} />
          <div id={`${formId}-panel`} role="tabpanel" aria-labelledby={`${formId}-panel-${tab}`}>
            {rows.length === 0 ? (
              <p className="tor-muted tor-pad">Nothing here.</p>
            ) : phone ? (
              <ul className="tor-rows">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="tor-row" onClick={() => openDetail(r.id)}>
                      <span className="tor-ico"><LeaveIcon kind={r.kind_of_leave} size={17} /></span>
                      <span className="tor-row-main">
                        <span className="tor-row-top"><strong>{leaveLabel(r.kind_of_leave)}</strong><StatusPill look={requestLook(r)} /></span>
                        <span>{rangeText(r, timeFormat)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="tor-dt">
                <table>
                  <thead>
                    <tr><th>Dates</th><th>Type</th><th>Hours</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        tabIndex={0}
                        aria-label={`${leaveLabel(r.kind_of_leave)}, ${rangeText(r, timeFormat)}, ${requestLook(r).label}`}
                        onClick={() => openDetail(r.id)}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                            event.preventDefault();
                            openDetail(r.id);
                          }
                        }}
                      >
                        <td><strong>{rangeShort(r)}</strong><small>{sizeShort(r)}</small></td>
                        <td><span className="tor-typecell"><LeaveIcon kind={r.kind_of_leave} size={15} />{leaveLabel(r.kind_of_leave)}</span></td>
                        <td>{hoursText(r, timeFormat)}</td>
                        <td><StatusPill look={requestLook(r)} /></td>
                        <td className="tor-actcell">
                          <RowMenu
                            request={r}
                            onView={() => openDetail(r.id)}
                            onWithdraw={() => doWithdraw(r, false)}
                            onAskCancel={() => openDetail(r.id, true)}
                            onWithdrawCancellation={() => r.cancellation && doWithdraw(r.cancellation, false, "cancellation")}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {sheet?.kind === "new" ? (
        <TimeOffSheet
          title="Request time off"
          phone={phone}
          busy={ask.isPending}
          onClose={() => setSheet(null)}
          footer={
            phone ? (
              <>
                <Button className="secondary-button" onClick={() => setSheet(null)} disabled={ask.isPending}>Cancel</Button>
                <Button type="submit" form={formId} disabled={ask.isPending}>{ask.isPending ? "Sending…" : "Send request"}</Button>
              </>
            ) : (
              <>
                <button type="button" className="tor-link tor-cancel" onClick={() => setSheet(null)} disabled={ask.isPending}>Cancel</button>
                <Button type="submit" form={formId} disabled={ask.isPending}>{ask.isPending ? "Sending…" : "Send request"}</Button>
              </>
            )
          }
        >
          <TimeOffAskForm
            workspaceId={workspaceId}
            formId={formId}
            phone={phone}
            zone={zone}
            now={now}
            timeFormat={timeFormat}
            sending={ask.isPending}
            onSend={async (input) => {
              await ask.mutateAsync(input);
              setSheet(null);
              setTab("upcoming");
              toast.success("Request sent");
            }}
          />
        </TimeOffSheet>
      ) : null}

      {open ? (
        <TimeOffSheet title="Time off" phone={phone} busy={withdraw.isPending || askCancel.isPending} onClose={() => setSheet(null)}>
          <TimeOffDetail
            request={open}
            phone={phone}
            places={places}
            timeFormat={timeFormat}
            withdrawing={withdraw.isPending}
            withdrawError={withdrawError}
            onWithdraw={() => doWithdraw(open, true)}
            cancelBoxOpen={sheet?.kind === "detail" && sheet.cancelOpen}
            onCancelBoxOpen={(cancelOpen) => {
              setCancelError(null);
              setSheet({ kind: "detail", id: open.id, cancelOpen });
            }}
            askingCancel={askCancel.isPending}
            cancelError={cancelError}
            onAskCancel={(note) => doAskCancel(open, note)}
            onWithdrawCancellation={() => open.cancellation && doWithdraw(open.cancellation, true, "cancellation")}
          />
        </TimeOffSheet>
      ) : null}
    </section>
  );
}

function Tabs({
  tab,
  counts,
  phone,
  panelId,
  onSelect,
}: {
  tab: Tab;
  counts: Record<Tab, number>;
  phone: boolean;
  panelId: string;
  onSelect: (tab: Tab) => void;
}) {
  const tabs: readonly Tab[] = ["upcoming", "past"];
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "upcoming" : event.key === "End" ? "past" : tab === "upcoming" ? "past" : "upcoming";
    onSelect(next);
    document.getElementById(`${panelId}-${next}`)?.focus();
  }
  return (
    <div className={phone ? "tor-tabs" : "tor-tabs2"} role="tablist" aria-label="Time off">
      {tabs.map((t) => (
        <button
          key={t}
          id={`${panelId}-${t}`}
          type="button"
          role="tab"
          aria-selected={tab === t}
          aria-controls={panelId}
          tabIndex={tab === t ? 0 : -1}
          onClick={() => onSelect(t)}
          onKeyDown={onKeyDown}
        >
          {t === "upcoming" ? "Upcoming" : "Past"} <span>{counts[t]}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The row's "⋯": View details; Withdraw request (two clicks) while it waits for an answer; (D4) Ask to
 * cancel approved time off, or Withdraw cancellation (two clicks) while one waits.
 */
function RowMenu({
  request,
  onView,
  onWithdraw,
  onAskCancel,
  onWithdrawCancellation,
}: {
  request: TimeOffRequestView;
  onView: () => void;
  onWithdraw: () => void;
  onAskCancel: () => void;
  onWithdrawCancellation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const withdraw = useConfirmClick(() => {
    setOpen(false);
    onWithdraw();
  });
  const withdrawCancellation = useConfirmClick(() => {
    setOpen(false);
    onWithdrawCancellation();
  });

  useEffect(() => {
    if (!open) return undefined;
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    wrap.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  return (
    <div
      className="tor-menu-wrap"
      ref={wrap}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && open && !event.defaultPrevented) {
          event.preventDefault();
          setOpen(false);
          button.current?.focus();
        }
        if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          const items = Array.from(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
          const at = items.indexOf(document.activeElement as HTMLElement);
          items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="tor-kebab"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${leaveLabel(request.kind_of_leave)}, ${rangeShort(request)}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={18} aria-hidden />
      </button>
      {open ? (
        <div className="tor-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onView(); }}>View details</button>
          {request.status === "pending" ? (
            <button
              type="button"
              role="menuitem"
              className={`is-danger${withdraw.armed ? " is-armed" : ""}`}
              {...withdraw.confirmProps}
            >
              {withdraw.armed ? "Confirm withdraw" : "Withdraw request"}
            </button>
          ) : null}
          {canAskToCancel(request) ? (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onAskCancel(); }}>Ask to cancel</button>
          ) : null}
          {cancellationWaiting(request) ? (
            <button
              type="button"
              role="menuitem"
              className={`is-danger${withdrawCancellation.armed ? " is-armed" : ""}`}
              {...withdrawCancellation.confirmProps}
            >
              {withdrawCancellation.armed ? "Confirm withdraw" : "Withdraw cancellation"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
