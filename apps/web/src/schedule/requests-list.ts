import type { ExchangeCase, TimeOffRequest } from "@newfork/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { getTimeOffQueue, timeOffKeys } from "./requests-data";

// EKRAN-02 (K-S8 – K-S10; KARARLAR Schedule → Requests, Ek 2026-10-07): Requests
// is one list. Open requests (Needs review, In progress) come first, nearest
// Decide by on top; closed ones follow, the newest decision on top. The tabs are
// request types and count what is still open. The screen draws what this returns.

export const requestTypes = ["time_off", "swap", "cover", "open_pickup"] as const;
export type RequestType = (typeof requestTypes)[number];
export const requestTypeLabels: Record<RequestType, string> = {
  time_off: "Time off",
  swap: "Swap",
  cover: "Cover",
  open_pickup: "Open shift",
};
// Two tabs (Mert, 2026-10-11): Time off, and every shift change (swap, cover,
// open shift) together; the Type column still names each row's kind. All
// stays first when the reader has both.
export type RequestTypeTab = "all" | "time_off" | "shift_changes";
export const shiftChangeTypes: readonly RequestType[] = ["swap", "cover", "open_pickup"];
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
  | { source: "time_off"; id: string; type: "time_off"; state: RequestState; decideBy: string | null; closedAt: string | null; request: TimeOffRequest }
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

function timeOffState(item: TimeOffRequest): RequestState {
  if (item.status !== "pending") return "closed";
  const progress = item.progress;
  return progress && (progress.can_vote || progress.can_decide_alone) && !progress.my_vote ? "needs_review" : "in_progress";
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
  timeOff: readonly TimeOffRequest[],
  exchanges: readonly ExchangeCase[],
  filters: RequestFilters,
): RequestRow[] {
  const rows: RequestRow[] = [];
  if (filters.type === "all" || filters.type === "time_off") {
    for (const request of timeOff) {
      const state = timeOffState(request);
      rows.push({
        source: "time_off",
        id: request.id,
        type: "time_off",
        state,
        decideBy: state === "closed" ? null : (request.decide_by ?? null),
        closedAt: state === "closed" ? lastAt(request.events, request.created_at) : null,
        request,
      });
    }
  }
  for (const request of exchanges) {
    if ((filters.type !== "all" && filters.type !== tabOf(request.kind)) || !exchangeMatches(request, filters)) continue;
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
 * Every request the reader may read: open and closed time off, and the shift
 * changes the manager view returns (open ones and the recently closed ones).
 * A list the reader may not read is never asked for. Typing in search keeps
 * the last rows on screen until the new ones arrive (R2-10, R2-20).
 * ponytail: closed time off is read whole, page after page, until the one
 * closed read (B3) pages the list on the server.
 */
export function useRequests(
  workspaceId: string | undefined,
  can: { timeOff: boolean; shiftChanges: boolean },
  filters: { locationId: string; search: string },
) {
  const read = { locationId: filters.locationId, search: filters.search };
  const enabled = Boolean(workspaceId);
  const timeOffKey = [...timeOffKeys.requests(workspaceId ?? ""), filters.locationId, filters.search.trim()];
  const openTimeOff = useQuery({
    queryKey: [...timeOffKey, "needs_review"],
    queryFn: () => getTimeOffQueue(workspaceId!, "needs_review", read),
    enabled: enabled && can.timeOff,
    placeholderData: keepPreviousData,
  });
  const closedTimeOff = useQuery({
    queryKey: [...timeOffKey, "closed"],
    queryFn: () => getTimeOffQueue(workspaceId!, "closed", read),
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
  const error = (can.timeOff ? (openTimeOff.error ?? closedTimeOff.error) : null) ?? (can.shiftChanges ? exchanges.error : null);
  return {
    timeOff: can.timeOff ? [...(openTimeOff.data?.requests ?? []), ...(closedTimeOff.data?.requests ?? [])] : [],
    exchanges: can.shiftChanges ? (exchanges.data?.cases ?? []) : [],
    locations: openTimeOff.data?.locations ?? closedTimeOff.data?.locations ?? [],
    timeFormat: openTimeOff.data?.timeFormat ?? closedTimeOff.data?.timeFormat ?? "12h",
    isLoading: (can.timeOff && (openTimeOff.isLoading || closedTimeOff.isLoading)) || (can.shiftChanges && exchanges.isLoading),
    error,
    failure: error ? requestFailureKind(error) : null,
    retry: () => {
      if (can.timeOff) {
        void openTimeOff.refetch();
        void closedTimeOff.refetch();
      }
      if (can.shiftChanges) void exchanges.refetch();
    },
  };
}
