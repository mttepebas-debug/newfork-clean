import type { ExchangeCase, TimeOffRequest } from "@newfork/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getExchanges } from "../employee-hub/shift-exchanges/exchange-data";
import { isNoAccess } from "../lib/no-access";
import { RequestError } from "../lib/request-error";
import { getOpenTimeOffRequests, timeOffKeys } from "./requests-data";

// EKRAN-02 B1 (K-S8 – K-S10): Requests is one table. The open tabs join the
// time off list and the shift changes list here, in the browser; Closed is
// read from one server list (B3). The screen draws what this returns.

export const requestTypes = ["time_off", "swap", "cover", "open_pickup"] as const;
export type RequestType = (typeof requestTypes)[number];
export const requestTypeLabels: Record<RequestType, string> = {
  time_off: "Time off",
  swap: "Swap",
  cover: "Cover",
  open_pickup: "Open shift",
};
export type RequestTab = "needs_review" | "in_progress" | "closed";
export const requestPageSizes = [25, 50, 100] as const;
export type RequestPageSize = (typeof requestPageSizes)[number];

export type OpenRequestRow =
  | { source: "time_off"; id: string; type: "time_off"; tab: Exclude<RequestTab, "closed">; decideBy: string | null; request: TimeOffRequest }
  | { source: "exchange"; id: string; type: ExchangeCase["kind"]; tab: Exclude<RequestTab, "closed">; decideBy: string | null; request: ExchangeCase };

export interface OpenRequestFilters {
  types: readonly RequestType[];
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
function exchangeTab(item: ExchangeCase): OpenRequestRow["tab"] {
  return item.can_manage && (item.stage === "ready_for_manager" || item.stage === "awaiting_other_manager")
    ? "needs_review"
    : "in_progress";
}

function timeOffTab(item: TimeOffRequest): OpenRequestRow["tab"] {
  return item.progress?.can_vote && !item.progress.my_vote ? "needs_review" : "in_progress";
}

function exchangeMatches(item: ExchangeCase, filters: OpenRequestFilters): boolean {
  const sides = [item.shift, item.requested_shift].filter((side) => side !== null);
  if (filters.locationId && !sides.some((side) => side.location_id === filters.locationId)) return false;
  const search = filters.search.trim().toLowerCase();
  if (!search) return true;
  return [item.owner_name, ...sides.map((side) => side.employee_name), ...item.applications.map((application) => application.employee_name)]
    .some((name) => name?.toLowerCase().includes(search));
}

/**
 * The open tabs' rows, nearest Decide by first. Time off arrives already
 * filtered by location and search (the server does it); shift changes are
 * filtered here.
 */
export function openRequestRows(
  timeOff: readonly TimeOffRequest[],
  exchanges: readonly ExchangeCase[],
  filters: OpenRequestFilters,
): OpenRequestRow[] {
  const rows: OpenRequestRow[] = [];
  if (filters.types.includes("time_off")) {
    for (const request of timeOff) {
      if (request.status !== "pending") continue;
      rows.push({ source: "time_off", id: request.id, type: "time_off", tab: timeOffTab(request), decideBy: request.decide_by ?? null, request });
    }
  }
  for (const request of exchanges) {
    if (request.status !== "open" || request.stage === "closed" || !filters.types.includes(request.kind)) continue;
    if (!exchangeMatches(request, filters)) continue;
    rows.push({ source: "exchange", id: request.id, type: request.kind, tab: exchangeTab(request), decideBy: request.expires_at, request });
  }
  return rows.sort((left, right) =>
    left.decideBy === right.decideBy ? 0 : left.decideBy === null ? 1 : right.decideBy === null ? -1 : left.decideBy < right.decideBy ? -1 : 1,
  );
}

/** Which tab a linked request (`?request=`) opens in: Closed once it is no longer open. */
export function tabOfRequest(id: string, rows: readonly OpenRequestRow[]): RequestTab {
  return rows.find((row) => row.id === id)?.tab ?? "closed";
}

/** Tab, request types and page as the address keeps them; anything else falls back. */
export function readRequestsParams(params: URLSearchParams, allowed: readonly RequestType[]) {
  const tab = params.get("tab");
  const asked = (params.get("types") ?? "").split(",").filter((type): type is RequestType => allowed.includes(type as RequestType));
  const page = Number(params.get("page"));
  const size = Number(params.get("size"));
  return {
    tab: (tab === "in_progress" || tab === "closed" ? tab : "needs_review") as RequestTab,
    types: asked.length ? asked : [...allowed],
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
 * Needs review and In progress, whole: every open time off request and shift
 * change the reader may read. A list the reader may not read, or whose types
 * are filtered out, is never asked for. Typing in search keeps the last rows
 * on screen until the new ones arrive (R2-10, R2-20).
 */
export function useOpenRequests(
  workspaceId: string | undefined,
  can: { timeOff: boolean; shiftChanges: boolean },
  filters: OpenRequestFilters,
) {
  const wantsTimeOff = can.timeOff && filters.types.includes("time_off");
  const wantsShiftChanges = can.shiftChanges && filters.types.some((type) => type !== "time_off");
  const timeOff = useQuery({
    queryKey: [...timeOffKeys.requests(workspaceId ?? ""), "open", filters.locationId, filters.search.trim()],
    queryFn: () => getOpenTimeOffRequests(workspaceId!, { locationId: filters.locationId, search: filters.search }),
    enabled: Boolean(workspaceId) && wantsTimeOff,
    placeholderData: keepPreviousData,
  });
  const exchanges = useQuery({
    // "shift-exchanges" + workspace: every exchange decision refreshes it (refreshExchangeSurfaces).
    queryKey: ["shift-exchanges", workspaceId ?? "", "requests-open"],
    queryFn: () => getExchanges(workspaceId!, true),
    enabled: Boolean(workspaceId) && wantsShiftChanges,
    placeholderData: keepPreviousData,
  });
  const error = (wantsTimeOff ? timeOff.error : null) ?? (wantsShiftChanges ? exchanges.error : null);
  return {
    rows: openRequestRows(
      wantsTimeOff ? (timeOff.data ?? []) : [],
      wantsShiftChanges ? (exchanges.data?.cases ?? []) : [],
      filters,
    ),
    isLoading: (wantsTimeOff && timeOff.isLoading) || (wantsShiftChanges && exchanges.isLoading),
    isFetching: timeOff.isFetching || exchanges.isFetching,
    error,
    failure: error ? requestFailureKind(error) : null,
  };
}
