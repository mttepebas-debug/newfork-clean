import type { ExchangeCase, TimeOffDeciderView } from "@newfork/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { awaitsDecision, exchangeStatus } from "./request-sentences";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { loadAllTimeOffToAnswer } from "../time-off/time-off-data";
import { answerStatus, waitsUntil } from "../time-off/time-off-text";

// EKRAN-02 (K-S8 – K-S10; KARARLAR Schedule → Requests, Ek 2026-10-07): Requests
// is one list. Open requests (Needs review, In progress) come first, nearest
// Decide by on top; closed ones follow, the newest decision on top. The tabs are
// request types and count what is still open. The screen draws what this returns.

// TAKAS-RELEASE: only a release reaches the pool; the open shift kind is gone.
export const requestTypes = ["time_off", "swap", "cover"] as const;
export type RequestType = (typeof requestTypes)[number];
export const requestTypeLabels: Record<RequestType, string> = {
  time_off: "Time off",
  swap: "Swap",
  cover: "Cover",
};
// Two tabs (Mert, 2026-10-11): Time off, and every shift change (swap, cover,
// pickup) together; each row's icon names its kind. All stays first when the
// reader has both.
export type RequestTypeTab = "all" | "time_off" | "shift_changes";
export const shiftChangeTypes: readonly RequestType[] = ["swap", "cover"];
export const tabOf = (type: RequestType): Exclude<RequestTypeTab, "all"> => (type === "time_off" ? "time_off" : "shift_changes");
export const requestTabLabels: Record<RequestTypeTab, string> = { all: "All", time_off: "Time off", shift_changes: "Shift changes" };

/** The tabs a reader gets: All, then one per group they may read; one group needs no tabs. */
export function requestTabsFor(allowed: readonly RequestType[]): RequestTypeTab[] {
  const groups = (["time_off", "shift_changes"] as const).filter((tab) => allowed.some((type) => tabOf(type) === tab));
  return groups.length > 1 ? ["all", ...groups] : [];
}
export type RequestState = "needs_review" | "in_progress" | "closed";
export const requestPageSizes = [25, 50, 100] as const;
export type RequestPageSize = (typeof requestPageSizes)[number];

export type RequestRow =
  | { source: "time_off"; id: string; type: "time_off"; state: RequestState; decideBy: string | null; closedAt: string | null; request: TimeOffDeciderView }
  | { source: "exchange"; id: string; type: ExchangeCase["kind"]; state: RequestState; decideBy: string | null; closedAt: string | null; request: ExchangeCase };

export interface RequestFilters {
  type: RequestTypeTab;
  locationId: string;
  search: string;
}

/** The request types a reader may see; a type they may not read is never offered. */
export function requestTypesFor(can: { timeOff: boolean; shiftChanges: boolean }): RequestType[] {
  return requestTypes.filter((type) => (type === "time_off" ? can.timeOff : can.shiftChanges));
}

// Needs review: the decision is the reader's now. In progress: somebody else
// answers first (cover search, the other employee, the other manager).
// ponytail: a swap that one manager already approved stays in Needs review
// for that manager too; the read model does not say who voted (R2-18, A2).
function exchangeState(item: ExchangeCase): RequestState {
  if (item.status !== "open" || item.stage === "closed") return "closed";
  return item.can_manage && (item.stage === "ready_for_manager" || item.stage === "awaiting_other_manager")
    ? "needs_review"
    : "in_progress";
}

// Time off (D7): one answer from whoever may give it, so a request waiting is this reader's to decide.
function timeOffState(item: TimeOffDeciderView, now: Date): RequestState {
  return answerStatus(item, now).label === "Needs decision" ? "needs_review" : "closed";
}

function exchangeMatches(item: ExchangeCase, filters: RequestFilters): boolean {
  const sides = [item.shift, item.requested_shift].filter((side) => side !== null);
  if (filters.locationId && !sides.some((side) => side.location_id === filters.locationId)) return false;
  const search = filters.search.trim().toLowerCase();
  if (!search) return true;
  return [item.owner_name, ...sides.map((side) => side.employee_name), ...item.applications.map((application) => application.employee_name)]
    .some((name) => name?.toLowerCase().includes(search));
}

// Times are compared as instants: the API may write any offset.
const instant = (value: string | null) => (value === null ? null : Date.parse(value));

// When a closed request was decided: its last event, else when it was asked.
function lastAt(events: readonly { created_at: string }[], createdAt: string) {
  return events.reduce((latest, event) => (instant(event.created_at)! > instant(latest)! ? event.created_at : latest), createdAt);
}

function compareRows(left: RequestRow, right: RequestRow) {
  const leftOpen = left.state !== "closed";
  if (leftOpen !== (right.state !== "closed")) return leftOpen ? -1 : 1;
  if (leftOpen) {
    const [from, to] = [instant(left.decideBy), instant(right.decideBy)];
    if (from === to) return 0;
    if (from === null) return 1;
    if (to === null) return -1;
    return from - to;
  }
  return (instant(right.closedAt) ?? 0) - (instant(left.closedAt) ?? 0);
}

/**
 * The one list. Time off arrives already filtered by location and search (the
 * server does it); shift changes are filtered here.
 */
export function requestRows(
  timeOff: readonly TimeOffDeciderView[],
  exchanges: readonly ExchangeCase[],
  filters: RequestFilters,
  now: Date = new Date(),
): RequestRow[] {
  const rows: RequestRow[] = [];
  if (filters.type === "all" || filters.type === "time_off") {
    for (const request of timeOff) {
      const state = timeOffState(request, now);
      rows.push({
        source: "time_off",
        id: request.id,
        type: "time_off",
        state,
        decideBy: state === "closed" ? null : waitsUntil(request),
        closedAt: state === "closed" ? (request.ended_at ?? request.decided_at ?? request.created_at) : null,
        request,
      });
    }
  }
  for (const request of exchanges) {
    if ((filters.type !== "all" && filters.type !== tabOf(request.kind)) || !exchangeMatches(request, filters)) continue;
    // Mert, 2026-10-18: only what waits on a manager, or ended with a decision or the deadline.
    if (request.status === "open" ? !awaitsDecision(request) : exchangeStatus(request) === null) continue;
    const state = exchangeState(request);
    rows.push({
      source: "exchange",
      id: request.id,
      type: request.kind,
      state,
      decideBy: state === "closed" ? null : request.expires_at,
      closedAt: state === "closed" ? lastAt(request.history, request.created_at) : null,
      request,
    });
  }
  return rows.sort(compareRows);
}

/** Each type tab's number, and All's: the requests still open. */
export function openCounts(rows: readonly RequestRow[]): Record<RequestTypeTab, number> {
  const counts: Record<RequestTypeTab, number> = { all: 0, time_off: 0, shift_changes: 0 };
  for (const row of rows) {
    if (row.state === "closed") continue;
    counts.all += 1;
    counts[tabOf(row.type)] += 1;
  }
  return counts;
}

/** Type tab and page as the address keeps them; anything else falls back. */
export function readRequestsParams(params: URLSearchParams, allowed: readonly RequestType[]) {
  const asked = params.get("type");
  // An old one-type address (?type=swap) lands on the shift changes tab.
  const type = asked && (shiftChangeTypes as readonly string[]).includes(asked) ? "shift_changes" : asked;
  const tabs = requestTabsFor(allowed);
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    type: (tabs.includes(type as RequestTypeTab) ? type : "all") as RequestTypeTab,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (requestPageSizes as readonly number[]).includes(size) ? (size as RequestPageSize) : 50,
  };
}

/** One page of a list; a page past the end shows the last one. */
export function pageOf<T>(rows: readonly T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  return { rows: rows.slice((current - 1) * pageSize, current * pageSize), page: current, pageCount, total: rows.length };
}

/** Why a list did not load (R2-11): the API's no, a dropped connection, or the server. */
export function requestFailureKind(error: unknown): "no_access" | "connection" | "server" {
  if (isNoAccess(error)) return "no_access";
  return error instanceof RequestError && error.status !== undefined ? "server" : "connection";
}

/**
 * Every request the reader may read: the time off they answer (waiting and answered) and the shift changes the
 * manager view returns (open ones and the recently closed ones). A list the reader may not read is never asked
 * for. Typing in search keeps the last rows on screen until the new ones arrive (R2-10, R2-20). The time off read
 * also carries the page's time format and location filter (D7).
 */
export function useRequests(
  workspaceId: string | undefined,
  can: { timeOff: boolean; shiftChanges: boolean },
  filters: { locationId: string; search: string },
) {
  const enabled = Boolean(workspaceId);
  const timeOff = useQuery({
    // "time-off-requests" + workspace: every answer refreshes it.
    queryKey: ["time-off-requests", workspaceId ?? "", "all-rows", filters.locationId, filters.search.trim()],
    queryFn: () =>
      loadAllTimeOffToAnswer(workspaceId!, { location_id: filters.locationId || undefined, search: filters.search.trim() }),
    enabled: enabled && can.timeOff,
    placeholderData: keepPreviousData,
  });
  const exchanges = useQuery({
    // "shift-exchanges" + workspace: every exchange decision refreshes it (refreshExchangeSurfaces).
    queryKey: ["shift-exchanges", workspaceId ?? "", "requests-open"],
    queryFn: () => getExchanges(workspaceId!, true),
    enabled: enabled && can.shiftChanges,
    placeholderData: keepPreviousData,
  });
  const error = (can.timeOff ? timeOff.error : null) ?? (can.shiftChanges ? exchanges.error : null);
  return {
    timeOff: can.timeOff ? (timeOff.data?.requests ?? []) : [],
    exchanges: can.shiftChanges ? (exchanges.data?.cases ?? []) : [],
    locations: timeOff.data?.locations ?? [],
    timeFormat: timeOff.data?.time_format ?? "12h",
    isLoading: (can.timeOff && timeOff.isLoading) || (can.shiftChanges && exchanges.isLoading),
    isFetching: (can.timeOff && timeOff.isFetching) || (can.shiftChanges && exchanges.isFetching),
    error,
    failure: error ? requestFailureKind(error) : null,
    retry: () => {
      if (can.timeOff) void timeOff.refetch();
      if (can.shiftChanges) void exchanges.refetch();
    },
  };
}
