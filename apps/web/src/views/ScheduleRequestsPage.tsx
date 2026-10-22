import { CatalogDrawer } from "../settings/CatalogDrawer";
import { CatalogPageHeader, ListAddButton } from "./CatalogPageHeader";
import { ListPagination } from "./ListPagination";
import { RequestCards, RequestsTable } from "./RequestsTable";
import { SwapReview } from "./SwapReview";
import "./requests-catalog.css";
import { timeOffApprovalAsksFirst, timeOffOpenedShiftCount, type ExchangeCase, type TimeOffRequest } from "@newfork/shared";
import { useToast } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { TimeOffShorten } from "./TimeOffShorten";
import { TimeOffReview } from "./TimeOffReview";
import type { DrawerNotice } from "./RequestDrawer";
import { alsoOffThese } from "../schedule/time-off-overlap";
import { ExchangeReview } from "./ExchangeReview";
import { getExchanges, refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { RequestError } from "../lib/request-error";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { AvailabilityDraftScope } from "../availability/availability-navigation";
import { requestAppNavigation } from "../shell/leave-guard";
import {
  isStaleTimeOff,
  useRevokeTimeOff,
  useVoteOnTimeOff,
} from "../schedule/requests-data";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import {
  openCounts,
  pageOf,
  readRequestsParams,
  requestRows,
  requestTypesFor,
  useRequests,
  type RequestRow,
  requestTabLabels,
  requestTabsFor,
  tabOf,
} from "../schedule/requests-list";

import { ListOutline, LoadError } from "../shell/LoadState";
import { NoAccessRoute, NoAccessState } from "../shell/NoAccessState";
import { noAccessHomePath } from "../auth/resolveLanding";
import { timeOffV2Enabled } from "../time-off/time-off-flag";
import { TimeOffAnswers } from "../time-off/TimeOffAnswers";
import { TimeOffEntry } from "../time-off/TimeOffEntry";
type Act = { request: TimeOffRequest; kind: "approve" | "deny" | "revoke" };

export function ScheduleRequestsPage() {
  const [params] = useSearchParams();
  const { context } = useAuth();
  if (params.get("tab") === "availability") {
    return <Navigate to="/app/availability" replace />;
  }
  // EKRAN-02 B1: the door asks the core, like the tabs do.
  // Neither type opens: the no-access card in place (Mert 2026-10-14).
  if (!can(context, "requests.read") && !can(context, "exchange.read"))
    return <NoAccessRoute />;
  return (
      <AvailabilityDraftScope
        labels={{
          saving: "Saving request decision",
          discard: "Discard request decision?",
          saved: "Decision saved",
          unsaved:
            "Your unsaved decision and note will be lost. Saved decisions and published assignments stay in place.",
        }}
      >
        <ScheduleRequestsPageContent />
      </AvailabilityDraftScope>
  );
}
function ScheduleRequestsPageContent() {
  const { context } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const workspaceId = context?.workspace.id ?? "";
  const canReadTimeOff = can(context, "requests.read");
  const canReadShift = can(context, "exchange.read");
  const allowedTypes = requestTypesFor({ timeOff: canReadTimeOff, shiftChanges: canReadShift });
  const view = readRequestsParams(params, allowedTypes);
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(params.get("request") ?? "");
  const [addingTimeOff, setAddingTimeOff] = useState(false);
  // EKRAN-02 C2 (H2): the swap whose review window is open over the list. The
  // window reads the list's latest copy and keeps the last one it saw, so a
  // refresh that no longer lists the swap does not pull it away (P26).
  const [openSwap, setOpenSwap] = useState<ExchangeCase | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const [actText, setActText] = useState("");
  const [actError, setActError] = useState("");
  // The reason a Deny written in the drawer could not send (Mert, 2026-10-11).
  const [denyError, setDenyError] = useState("");
  const [shortenError, setShortenError] = useState<string | null>(null);
  const toast = useToast();
  // Said inside the drawer while it stays open (CatalogDrawer).
  const [drawerNotice, setDrawerNotice] = useState<DrawerNotice | null>(null);
  const vote = useVoteOnTimeOff(workspaceId);
  const revoke = useRevokeTimeOff(workspaceId);
  const data = useRequests(workspaceId, { timeOff: canReadTimeOff, shiftChanges: canReadShift }, { locationId, search });
  // "Also off these days" asks every request the reader reads, not the filtered list;
  // without a filter this is the same cached read.
  const everyone = useRequests(workspaceId, { timeOff: canReadTimeOff, shiftChanges: canReadShift }, { locationId: "", search: "" });
  // A reason being written keeps a drawer open on Escape and the backdrop (P26).
  const [held, setHeld] = useState(false);
  // A drawer opened from the list is a history step: closing it steps back, so Back is never a no-op.
  const caseStep = useRef(false);
  // Every type, so each tab can count what is still open in it.
  const allRows = useMemo(
    () => requestRows(data.timeOff, data.exchanges, { type: "all", locationId, search }),
    [data.timeOff, data.exchanges, locationId, search],
  );
  const counts = openCounts(allRows);
  const page = pageOf(view.type === "all" ? allRows : allRows.filter((row) => tabOf(row.type) === view.type), view.page, view.pageSize);
  const swap = openSwap ? (data.exchanges.find((item) => item.id === openSwap.id) ?? openSwap) : null;
  // A cover or an open shift opens its drawer over the list (Mert,
  // 2026-10-11); ?case= names it, so Back closes it and a link
  // lands on it. Like the swap window, it keeps the last copy it saw (P26).
  const caseId = params.get("case") ?? "";
  const [seenCase, setSeenCase] = useState<ExchangeCase | null>(null);
  const inList = caseId ? data.exchanges.find((item) => item.id === caseId) : undefined;
  // A link to a case the list does not carry reads that one case.
  const caseRead = useQuery({
    queryKey: ["shift-exchanges", workspaceId, "manager-case", caseId],
    queryFn: () => getExchanges(workspaceId, true, { caseId }),
    enabled: Boolean(caseId && canReadShift && !data.isLoading && !inList && seenCase?.id !== caseId),
    retry: false,
    // Every visit asks again, also when the read waits for the list: an
    // earlier visit's answer is not this one's.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const listedCase = inList ?? caseRead.data?.cases.find((item) => item.id === caseId) ?? null;
  useEffect(() => {
    if (listedCase && listedCase.kind !== "swap") setSeenCase(listedCase);
  }, [listedCase]);
  // A link to a listed swap opens its review window instead.
  useEffect(() => {
    if (listedCase?.kind !== "swap") return;
    setOpenSwap(listedCase);
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("case");
      return next;
    }, { replace: true });
  }, [listedCase, setParams]);
  const openCase = listedCase && listedCase.kind !== "swap" ? listedCase : seenCase?.id === caseId ? seenCase : null;
  // A link to a case the core does not hand back (its location closed, or no
  // longer this manager's): Requests' own empty state says so where the table
  // was (BL-1024; Mert, 2026-10-12). Out of scope reads empty, and an id the
  // API refuses outright (a garbled link) is as gone: trying again cannot
  // help. Any other failed read is an outage: it offers to read again.
  const caseUnread = Boolean(caseId && !openCase && !listedCase);
  const caseRefused = caseRead.error instanceof RequestError && [400, 403, 404].includes(caseRead.error.status ?? 0);
  // An answer kept from an earlier visit counts only once this visit has read
  // again (offline, that read waits: the page says it is reading).
  const caseAnswered = caseRead.isSuccess && caseRead.isFetchedAfterMount;
  const caseMissing = caseUnread && (caseAnswered || (caseRead.isError && caseRefused));
  const caseFailed = caseUnread && caseRead.isError && !caseRefused;
  // Reading that one case (or waiting for the network to read it): the list
  // does not flash in before the answer.
  const caseChecking = caseUnread && !caseMissing && !caseFailed && (caseRead.isFetching || caseRead.isPaused);
  // A drawer closed with the browser's Back leaves no step for closeCase to undo.
  useEffect(() => {
    if (!caseId) caseStep.current = false;
  }, [caseId]);
  // The message is the page's answer to the link, so focus goes to it.
  const caseNoticeHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (caseMissing || caseFailed) caseNoticeHeading.current?.focus({ preventScroll: true });
  }, [caseMissing, caseFailed]);
  // "Show all requests" goes away with the message: focus lands on the list.
  const listWrap = useRef<HTMLDivElement>(null);
  const [focusList, setFocusList] = useState(false);
  useEffect(() => {
    if (!focusList || caseUnread) return;
    listWrap.current?.focus({ preventScroll: true });
    setFocusList(false);
  }, [focusList, caseUnread]);
  const timeOffById = new Map<string, TimeOffRequest>();
  for (const row of allRows) if (row.source === "time_off") timeOffById.set(row.id, row.request);
  const selected = timeOffById.get(selectedId) ?? null;

  function setView(values: Record<string, string | null>) {
    requestAppNavigation(() => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(values)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          // A tab, filter or search used beside an unavailable request
          // means the list: the message gives way to it.
          if (caseUnread) next.delete("case");
          return next;
        },
        { replace: true },
      );
    });
  }
  function selectRequest(id: string) {
    setHeld(false);
    setSelectedId(id);
    setDrawerNotice(null);
    setDenyError("");
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (id) next.set("request", id);
        else next.delete("request");
        return next;
      },
      { preventScrollReset: true },
    );
  }
  function closeCase() {
    setHeld(false);
    if (caseStep.current) {
      caseStep.current = false;
      navigate(-1);
      return;
    }
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("case");
      return next;
    }, { replace: true });
  }
  // Clears an unavailable request's link where it stands: it opened no
  // drawer, so there is no step of ours for Back to undo.
  function showAllRequests() {
    caseStep.current = false;
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete("case");
      return next;
    }, { replace: true });
  }
  function openRow(row: RequestRow) {
    // A swap opens its review window over the list (H2). A cover or open
    // shift opens its drawer (?case=); that is a step the browser's Back
    // undoes, so it is pushed.
    if (row.source === "exchange" && row.type === "swap") setOpenSwap(row.request);
    else if (row.source === "exchange")
      requestAppNavigation(() => {
        caseStep.current = true;
        setParams((previous) => {
          const next = new URLSearchParams(previous);
          next.set("case", row.id);
          return next;
        });
      });
    else selectRequest(row.id);
  }
  function startAct(request: TimeOffRequest, kind: Act["kind"]) {
    setActText("");
    setActError("");
    const progress = request.progress;
    // A manager's plain vote needs no box; one that opens shifts, a revoke
    // (its reason) and an admin's or owner's decision do (rules 6, 7, 14). A
    // deny asks its reason in the drawer itself.
    const ask = kind === "revoke" || Boolean(progress && timeOffApprovalAsksFirst(progress));
    if (ask) setAct({ request, kind });
    else void runAct({ request, kind }, "");
  }
  async function runAct(current: Act, text: string, inline = false) {
    const { request, kind } = current;
    setDrawerNotice(null);
    setDenyError("");
    try {
      let message: string;
      let closedNow = true;
      if (kind === "revoke") {
        await revoke.mutateAsync({
          requestId: request.id,
          revoke: { expected_revision: request.revision, reason: text },
        });
        message = "Time off revoked.";
      } else {
        const result = await vote.mutateAsync({
          requestId: request.id,
          verdict: {
            verdict: kind,
            note: text,
            expected_impact: request.progress!.impact!.fingerprint,
          },
        });
        closedNow = result.final;
        message = verdictMessage(request, kind, result.final, result.remaining);
      }
      setAct(null);
      if (closedNow) {
        selectRequest("");
        toast.success(message);
      } else setDrawerNotice({ text: message });
      // A decision can open shifts: every surface that shows them refreshes.
      await refreshExchangeSurfaces(client, workspaceId);
    } catch (error) {
      if (isStaleTimeOff(error)) {
        setAct(null);
        setDrawerNotice({ text: "This request changed. Review it again.", tone: "warning" });
        return;
      }
      const message = error instanceof Error ? error.message : "Decision failed";
      if (inline) setDenyError(message);
      else if (kind === "approve" && !act) setDrawerNotice({ text: message, tone: "error" });
      else setActError(message);
    }
  }
  const header = (
    <CatalogPageHeader
      eyebrow="TEAM CHANGES. REVIEWED WITH CONTROL."
      title="Requests"
      titleId="requests-title"
      description="Review time off and shift change requests in one place."
    />
  );
  // The API's "no" gets the one no-access card, never its raw sentence.
  if (data.failure === "no_access")
    return (
      <NoAccessState
        homeHref={noAccessHomePath(context, "/app/schedule/requests")}
      />
    );
  const timeFormat = data.timeFormat;
  const loading = data.isLoading;
  const failed = Boolean(data.failure);
  // One group to read needs no tabs: All would say the same thing.
  const tabs = requestTabsFor(allowedTypes);
  // Time off rebuild D3: behind the time-off-v2 flag the Time off tab is the new time off's (its own list,
  // paged by the server, and its answer drawer). The All tab and the old drawer stay until D7.
  const newTimeOff = view.type === "time_off" && timeOffV2Enabled() && can(context, "time_off.decide");
  // D5: whoever may answer adds approved time off for somebody from the Time off tab's filter row.

  return (
    <section
      className="settings-page jobs-settings-page requests-catalog-page requests-page list-page"
      aria-labelledby="requests-title"
    >
      {header}

      <div className="requests-toolbar catalog-toolbar">
        {tabs.length ? (
        <TabRow chosen={view.type}>
          <div
            className="catalog-status-tabs"
            role="group"
            aria-label="Request type"
            onKeyDown={(event) => {
              // R2-48: the arrow keys move along the tabs.
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              const buttons = [...event.currentTarget.querySelectorAll("button")];
              const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (at < 0) return;
              event.preventDefault();
              buttons[(at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }}
          >
            {tabs.map((key) => (
              <button
                key={key}
                type="button"
                className={view.type === key ? "active" : ""}
                aria-pressed={view.type === key}
                onClick={() => {
                  selectRequest("");
                  setView({ type: key === "all" ? null : key, page: null });
                }}
              >
                {requestTabLabels[key]}
                {counts[key] ? <strong>{counts[key]}</strong> : null}
              </button>
            ))}
          </div>
        </TabRow>
        ) : null}
        <div className="catalog-toolbar-filter-row">
          <select
            className="toolbar-filter-select"
            value={locationId}
            aria-label="Filter by location"
            onChange={(event) => {
              setLocationId(event.target.value);
              setView({ page: null });
            }}
          >
            <option value="">All locations</option>
            {data.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <label className="requests-search toolbar-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={search}
              placeholder="Search employee or note"
              aria-label="Search requests"
              onChange={(event) => {
                setSearch(event.target.value);
                setView({ page: null });
              }}
            />
          </label>
          {newTimeOff ? <ListAddButton label="Add time off" shortLabel="Add" onClick={() => setAddingTimeOff(true)} /> : null}
        </div>
      </div>

      {caseMissing || caseFailed || caseChecking ? (
        <div className="employee-table-wrap requests-table-wrap">
          {caseMissing ? (
            <TableEmpty
              icon={<ArrowLeftRight size={22} />}
              title="Request unavailable"
              text="This request is no longer available."
              headingRef={caseNoticeHeading}
              action={
                <button
                  type="button"
                  className="nf-button secondary"
                  onClick={() => {
                    setFocusList(true);
                    showAllRequests();
                  }}
                >
                  Show all requests
                </button>
              }
            />
          ) : caseFailed ? (
            <LoadError
              inset
              title="We couldn't load this request"
              detail="The request didn't load. Nothing was changed."
              headingRef={caseNoticeHeading}
              retrying={caseRead.isFetching}
              onRetry={() => void caseRead.refetch()}
            />
          ) : (
            <ListOutline label="Loading request" rows={1} columns={5} inset />
          )}
        </div>
      ) : newTimeOff ? (
        <>
          <TimeOffAnswers
            workspaceId={workspaceId}
            timeFormat={timeFormat}
            locationId={locationId}
            search={search}
            page={view.page}
            pageSize={view.pageSize}
            onPageChange={(next) => setView({ page: next > 1 ? String(next) : null })}
            onPageSizeChange={(size) => setView({ size: size === 50 ? null : String(size), page: null })}
            selectedId={selectedId}
            onSelect={selectRequest}
          />
          {addingTimeOff ? (
            <TimeOffEntry
              workspaceId={workspaceId}
              timeFormat={timeFormat}
              onClose={() => setAddingTimeOff(false)}
              onAdded={(entered) => {
                setAddingTimeOff(false);
                selectRequest(entered.id);
                toast.success(`Time off added for ${entered.employee_name}`);
              }}
            />
          ) : null}
        </>
      ) : (
        <>
          <div className="employee-table-wrap requests-table-wrap" ref={listWrap} tabIndex={-1}>
            {/* Three reads make one list: it is drawn once all of them answered. */}
            <RequestsTable rows={loading ? [] : page.rows} timeFormat={timeFormat} onOpen={openRow} />
            <RequestCards rows={loading ? [] : page.rows} timeFormat={timeFormat} onOpen={openRow} />
            {loading ? <ListOutline label="Loading requests" rows={6} columns={5} inset /> : null}
            {!loading && failed ? (
              <LoadError
                inset
                title="We couldn't load requests"
                detail="Requests didn't load. Nothing was changed."
                retrying={data.isFetching}
                onRetry={data.retry}
              />
            ) : null}
            {!loading && !failed && !page.rows.length ? (
              <TableEmpty
                icon={<Check size={22} />}
                title="No requests"
                text={view.type === "all" ? "No requests match these filters." : `No ${view.type === "time_off" ? "time off" : "shift change"} requests match these filters.`}
              />
            ) : null}
          </div>
          <ListPagination
            total={page.total}
            page={page.page}
            pageSize={view.pageSize}
            onPageChange={(next) => setView({ page: next > 1 ? String(next) : null })}
            onPageSizeChange={(size) => setView({ size: size === 50 ? null : String(size), page: null })}
          />
        </>
      )}

      {selected && (
        <CatalogDrawer
          label="Review request"
          className="requests-catalog-page requests-review-drawer"
          busy={held || vote.isPending || revoke.isPending}
          onClose={() => selectRequest("")}
        >
          <TimeOffReview
            key={selected.id}
            request={selected}
            alsoOff={alsoOffThese(selected, everyone.timeOff)}
            timeFormat={timeFormat}
            notice={drawerNotice}
            busy={vote.isPending || revoke.isPending}
            // ponytail: "may they revoke somewhere"; the API asks per person.
            canRevoke={can(context, "time_off.revoke")}
            denyError={denyError}
            onClose={() => selectRequest("")}
            onApprove={() => startAct(selected, "approve")}
            onDeny={(reason) => void runAct({ request: selected, kind: "deny" }, reason, true)}
            onRevoke={() => startAct(selected, "revoke")}
            onHold={setHeld}
            shortenError={shortenError}
            shorten={
              <TimeOffShorten
                key={`${selected.id}:${selected.revision}`}
                request={selected}
                workspaceId={workspaceId}
                timeFormat={timeFormat}
                onError={setShortenError}
                onDone={(message) => {
                  selectRequest("");
                  toast.success(message);
                  void refreshExchangeSurfaces(client, workspaceId);
                }}
              />
            }
          />
        </CatalogDrawer>
      )}
      {openCase ? (
        <CatalogDrawer label="Review shift change" className="requests-catalog-page requests-review-drawer" busy={held} onClose={closeCase}>
          <ExchangeReview
            key={openCase.id}
            item={openCase}
            workspace={workspaceId}
            timeFormat={timeFormat}
            onClose={closeCase}
            onHold={setHeld}
            onDone={(message) => {
              closeCase();
              toast.success(message);
            }}
          />
        </CatalogDrawer>
      ) : null}
      {swap ? (
        <SwapReview
          // One window per swap: a refresh keeps a reason being typed (P26).
          key={swap.id}
          item={swap}
          workspace={workspaceId}
          timeFormat={timeFormat}
          onClose={() => setOpenSwap(null)}
          onDone={(message) => {
            setOpenSwap(null);
            toast.success(message);
          }}
        />
      ) : null}
      {act ? (
        <ActDialog
          act={act}
          text={actText}
          error={actError}
          busy={vote.isPending || revoke.isPending}
          onText={setActText}
          onCancel={() => setAct(null)}
          onConfirm={() => void runAct(act, actText.trim())}
        />
      ) : null}
    </section>
  );
}

/**
 * The type tabs' row. When it is wider than a phone the row scrolls, its edge
 * fades where more tabs wait (`data-more`), and the chosen tab is scrolled into view.
 */
/** What stands where the table was: an icon, a heading, a sentence, maybe one button. */
function TableEmpty({ icon, title, text, action, headingRef }: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly text: string;
  readonly action?: ReactNode;
  /** Set when the page moves focus to the message. */
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="catalog-table-empty">
      <span className="catalog-table-empty-icon" aria-hidden>
        {icon}
      </span>
      <h2 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        {title}
      </h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

function TabRow({ chosen, children }: { chosen: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState<"left" | "right" | "both" | null>(null);
  const measure = useCallback(() => {
    const element = row.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setMore(left && right ? "both" : left ? "left" : right ? "right" : null);
  }, []);
  useEffect(() => {
    row.current?.querySelector<HTMLElement>("button.active")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [chosen, measure]);
  return (
    <div ref={row} className="catalog-toolbar-status-row" data-more={more ?? undefined} onScroll={measure}>
      {children}
    </div>
  );
}

function verdictMessage(
  request: TimeOffRequest,
  kind: "approve" | "deny",
  final: boolean,
  remaining: number,
) {
  const cancellation = request.request_type === "time_off_cancellation";
  if (kind === "deny") return cancellation ? "Cancellation declined." : "Time off denied.";
  if (final) return cancellation ? "Cancellation approved." : "Time off approved.";
  return `Your approval is saved. ${plural(remaining, "location")} still to approve.`;
}

function ActDialog({
  act,
  text,
  error,
  busy,
  onText,
  onCancel,
  onConfirm,
}: {
  act: Act;
  text: string;
  error: string;
  busy: boolean;
  onText: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { request, kind } = act;
  const cancellation = request.request_type === "time_off_cancellation";
  const opens = request.progress ? timeOffOpenedShiftCount(request.progress) : 0;
  const opensLine = opens
    ? `${plural(opens, "published shift")} become${opens === 1 ? "s an open shift" : " open shifts"}.`
    : "";
  const alone = Boolean(request.progress?.can_decide_alone);
  const copy =
    kind === "revoke"
      ? {
          title: "Revoke time off?",
          description: "Hours not yet taken stop being time off.",
          confirm: "Revoke",
          field: "Reason",
        }
      : {
          title: cancellation ? "Approve cancellation?" : "Approve time off?",
          description: alone
            ? `Takes effect now.${opensLine ? ` ${opensLine}` : ""}`
            : opensLine,
          confirm: "Approve",
          field: null,
        };
  return (
    <ConfirmDialog
      open
      title={copy.title}
      description={copy.description}
      confirmLabel={busy ? "Saving..." : copy.confirm}
      destructive={kind !== "approve"}
      busy={busy}
      confirmDisabled={kind === "revoke" && !text.trim()}
      onCancel={onCancel}
      onConfirm={onConfirm}
      // The server's answer in the box's band, above the buttons (UI-FIELDMSG-2).
      error={error}
    >
      {copy.field ? (
        <label className="app-confirm-field">
          <span>{copy.field}</span>
          <textarea
            rows={3}
            autoFocus
            maxLength={1000}
            required={kind === "revoke"}
            value={text}
            onChange={(event) => onText(event.target.value)}
          />
        </label>
      ) : null}
    </ConfirmDialog>
  );
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
export default ScheduleRequestsPage;
