import {
  lineupAcknowledgementSchema,
  lineupCommandResultSchema,
  lineupDaySchema,
  myLineupsSchema,
  type LineupTarget,
} from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest, supabaseClient } from "../lib/supabase";
import { RequestError } from "../lib/request-error";
import { scheduleReadScopeKey } from "./schedule-data";

// LINEUP-PUBLISH-WEB: the manager's day (publish state, rows) and the employee's published lineups, through
// the API. The day sits under the Schedule's read key, so the Schedule's live channel refreshes it when a
// published shift changes; the employee's lineups sit under "employee-hub", refreshed by her own schedule
// signal. Both first key items are in tenant-query-cache.

export const lineupKeys = {
  day: (workspaceId: string, date: string) => [...scheduleReadScopeKey(workspaceId), "lineup-day", date] as const,
  allMine: (workspaceId: string) => ["employee-hub", workspaceId, "my-lineups"] as const,
  mine: (workspaceId: string, date: string) => ["employee-hub", workspaceId, "my-lineups", date] as const,
};

function lineupApi(workspaceId: string, path: string, init?: RequestInit) {
  if (!supabaseClient) throw new Error("Lineup storage is not configured");
  return apiRequest(supabaseClient, `/v1/workspaces/${workspaceId}${path}`, init);
}

export async function getLineupDay(workspaceId: string, date: string) {
  return lineupDaySchema.parse(await lineupApi(workspaceId, `/lineups/${date}`));
}

export async function getMyLineups(workspaceId: string, date: string) {
  return myLineupsSchema.parse(await lineupApi(workspaceId, `/my-lineups/${date}`));
}

export function useLineupDay(workspaceId: string | null, date: string) {
  return useQuery({
    queryKey: lineupKeys.day(workspaceId ?? "", date),
    queryFn: () => getLineupDay(workspaceId!, date),
    enabled: Boolean(workspaceId),
  });
}

export function useMyLineups(workspaceId: string | null, date: string) {
  return useQuery({
    queryKey: lineupKeys.mine(workspaceId ?? "", date),
    queryFn: () => getMyLineups(workspaceId!, date),
    enabled: Boolean(workspaceId),
    refetchInterval: 60_000,
  });
}

export type LineupCommand =
  | { readonly kind: "share"; readonly lineups: readonly LineupTarget[]; readonly askAck: boolean }
  | { readonly kind: "unpublish"; readonly lineups: readonly LineupTarget[] };

/** Share or unpublish; each press is its own command id, so a retried request is done once. */
export function useLineupCommand(workspaceId: string | null, date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (command: LineupCommand) => {
      const body = command.kind === "share"
        ? { command_id: crypto.randomUUID(), kind: "share", lineups: command.lineups, ask_ack: command.askAck }
        : { command_id: crypto.randomUUID(), kind: "unpublish", lineups: command.lineups };
      return lineupCommandResultSchema.parse(
        await lineupApi(workspaceId!, "/lineups/commands", { method: "POST", body: JSON.stringify(body) }),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: lineupKeys.day(workspaceId ?? "", date) }),
  });
}

export function useAcknowledgeLineup(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) =>
      lineupAcknowledgementSchema.parse(
        await lineupApi(workspaceId!, `/lineups/versions/${versionId}/acknowledge`, { method: "POST", body: "{}" }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: lineupKeys.allMine(workspaceId ?? "") }),
  });
}

/** What a refused lineup command means to the manager; the server's sentence never shows. */
export function lineupCommandMessage(error: unknown): string {
  const reason = error instanceof RequestError ? error.reason : undefined;
  switch (reason) {
    case "lineup.week_not_published":
      return "Publish this week's Schedule first. Then publish the lineup.";
    case "lineup.past_day":
      return "This day is over. Its lineups can't change.";
    case "lineup.closed_day":
      return "The location is closed that day, so it has no lineup.";
    case "lineup.one_day":
      return "Publish one day's lineups at a time.";
    case "lineup.not_shared":
      return "That lineup isn't published anymore.";
    case "authz.out_of_scope":
    case "authz.not_member":
      return "You can't publish lineups at this location.";
    default:
      return "The lineup didn't change. Check your connection, then try again.";
  }
}
