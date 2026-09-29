import {
  exchangeCandidatesSchema,
  exchangeMutationSchema,
  exchangePreviewSchema,
  exchangeReadModelSchema,
  exchangeScheduleRecoverySchema,
  type ExchangeCommand,
} from "@newfork/shared";
import { scheduleEditSessionSchema } from "@newfork/shared/schedule";
import type { QueryClient } from "@tanstack/react-query";
import { RequestError, requestFailure } from "../../lib/request-error";
import {
  getApiAccessToken,
  newforkApiUrl,
  supabaseClient,
} from "../../lib/supabase";

/** A Shift changes request the API refused: a RequestError, so isNoAccess reads its key. */
export class ExchangeError extends RequestError {
  declare readonly status: number;

  constructor(message: string, status: number, reason?: string, detail?: string) {
    super(message, reason, detail, status);
    this.name = "ExchangeError";
  }
}
function errorMessage(data: unknown) {
  const fallback = "Unable to load shift changes";
  if (!data || typeof data !== "object" || !("error" in data)) return fallback;
  const message = String(data.error);
  // Final eligibility guards can return a JSON-encoded list of reasons.
  // Keep the HTTP status and plain errors intact while removing wire syntax.
  if (message.trimStart().startsWith("[")) {
    try {
      const reasons: unknown = JSON.parse(message);
      if (
        Array.isArray(reasons) &&
        reasons.every((reason) => typeof reason === "string")
      ) {
        return (
          reasons
            .map((reason) => reason.trim())
            .filter(Boolean)
            .join("; ") || fallback
        );
      }
    } catch {
      // A regular message beginning with '[' is not necessarily JSON.
    }
  }
  return message;
}
async function request(
  workspace: string,
  query = "",
  body?: ExchangeCommand | { fingerprint: string },
  key?: string,
) {
  if (!supabaseClient) throw new Error("Shift Hub is unavailable");
  const token = await getApiAccessToken(supabaseClient);
  const response = await fetch(
    `${newforkApiUrl}/v1/workspaces/${workspace}/shift-exchanges${query}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Newfork-Workspace-Id": workspace,
        ...(body
          ? { "Content-Type": "application/json", "Idempotency-Key": key! }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const data: unknown = await response.json();
  if (!response.ok) {
    const refusal = requestFailure(data, response.status, "Unable to load shift changes");
    throw new ExchangeError(errorMessage(data), response.status, refusal.reason, refusal.detail);
  }
  return data;
}
export const getExchanges = async (
  workspace: string,
  manager = false,
  range?: { from?: string; to?: string; caseId?: string },
) => {
  const params = new URLSearchParams({
    view: manager ? "manager" : "employee",
  });
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  if (range?.caseId) params.set("case_id", range.caseId);
  return exchangeReadModelSchema.parse(await request(workspace, `?${params}`));
};
export const getExchangeCandidates = async (workspace: string, shift: string) =>
  exchangeCandidatesSchema.parse(
    await request(workspace, `?shift_id=${shift}`),
  );
export const getExchangePreview = async (
  workspace: string,
  caseId: string,
  application: string,
) =>
  exchangePreviewSchema.parse(
    await request(
      workspace,
      `?case_id=${caseId}&application_id=${application}`,
    ),
  );
export const changeExchange = async (
  workspace: string,
  command: ExchangeCommand,
  key: string,
) => exchangeMutationSchema.parse(await request(workspace, "", command, key));

export const fetchExchangeScheduleRecovery = async (
  workspace: string,
  session: string,
) =>
  exchangeScheduleRecoverySchema.parse(
    await request(workspace, `/schedule-recovery/${session}`),
  );
export const restoreExchangeSchedule = async (
  workspace: string,
  session: string,
  fingerprint: string,
  key: string,
) =>
  scheduleEditSessionSchema.parse(
    await request(
      workspace,
      `/schedule-recovery/${session}`,
      { fingerprint },
      key,
    ),
  );

// Prefixes deliberately include both Schedule weeks and both locations of swaps.
export const exchangeInvalidationPrefixes = [
  "shift-exchanges",
  "employee-hub",
  "schedule-requests",
  "schedule-read",
  "workspace-dashboard",
  "notifications",
  "inbox",
] as const;
export async function refreshExchangeSurfaces(
  client: QueryClient,
  workspace: string,
) {
  await Promise.all(
    exchangeInvalidationPrefixes.map((prefix) =>
      client.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === prefix && query.queryKey.includes(workspace),
      }),
    ),
  );
}
