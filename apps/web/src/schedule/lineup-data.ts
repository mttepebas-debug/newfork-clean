import {
  lineupAcknowledgementSchema,
  lineupCommandResultSchema,
  lineupDaySchema,
  lineupEditResultSchema,
  lineupSectionsResultSchema,
  myLineupsSchema,
  type LineupEditInput,
  type LineupSectionsInput,
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

/** A change to a draft lineup (LINEUP-EDIT W2a): its row or its notes; each is its own command id. */
export type LineupEdit = LineupEditInput extends infer Edit ? (Edit extends unknown ? Omit<Edit, "command_id"> : never) : never;

export function useLineupEdit(workspaceId: string | null, date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (edit: LineupEdit) =>
      lineupEditResultSchema.parse(
        await lineupApi(workspaceId!, "/lineups/edit", {
          method: "POST",
          body: JSON.stringify({ command_id: crypto.randomUUID(), ...edit }),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: lineupKeys.day(workspaceId ?? "", date) }),
  });
}

/** The Sections window (LINEUP-EDIT W2a): a location's sections; the day read holds them, so it is read again. */
export function useLineupSections(workspaceId: string | null, date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (change: LineupSectionsInput) =>
      lineupSectionsResultSchema.parse(
        await lineupApi(workspaceId!, "/lineups/sections", { method: "POST", body: JSON.stringify(change) }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: lineupKeys.day(workspaceId ?? "", date) }),
  });
}

/** What a refused edit or section change means to the manager; the server's sentence never shows. */
export function lineupEditMessage(error: unknown): string {
  const reason = error instanceof RequestError ? error.reason : undefined;
  switch (reason) {
    case "lineup.invalid_hours":
      return "Use a time like 4:30 PM, with Out not the same as In.";
    case "lineup.invalid_job":
      return "Choose one of the positions.";
    case "lineup.invalid_label":
      return "Choose one of the labels.";
    case "lineup.invalid_section":
      return "Choose one of this location's sections.";
    case "lineup.invalid_section_name":
      return "Name the section in 40 characters or fewer.";
    case "lineup.section_exists":
      return "This location already has a section with that name.";
    case "lineup.note_too_long":
      return "This note is too long.";
    case "lineup.live":
      return "This lineup is published. Take it back with Edit first.";
    case "lineup.started":
      return "This shift has started. Its lineup can't change.";
    case "lineup.past_day":
      return "This day is over. Its lineups can't change.";
    case "lineup.closed_day":
      return "The location is closed that day, so it has no lineup.";
    case "authz.out_of_scope":
    case "authz.not_member":
      return "You can't change lineups at this location.";
    default:
      return "It didn't change. Check your connection, then try again.";
  }
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
