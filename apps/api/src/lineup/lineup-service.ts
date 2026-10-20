import { createClient } from "@supabase/supabase-js";
import {
  lineupAcknowledgementSchema,
  lineupCandidatesSchema,
  lineupCommandResultSchema,
  lineupDaySchema,
  lineupEditResultSchema,
  lineupSectionsResultSchema,
  myLineupsSchema,
  type LineupAcknowledgement,
  type LineupCandidates,
  type LineupCandidatesQuery,
  type LineupCommandInput,
  type LineupCommandResult,
  type LineupDay,
  type LineupEditInput,
  type LineupEditResult,
  type LineupSectionsInput,
  type LineupSectionsResult,
  type MyLineups,
} from "@newfork/shared";
import { rpcFailure } from "../http-error";

interface Actor {
  readonly actorUserId: string;
  readonly workspaceId: string;
}

/** LINEUP-PUBLISH: publishing a lineup and the employee's side of it. */
export interface LineupService {
  command(input: Actor & { readonly command: LineupCommandInput }): Promise<LineupCommandResult>;
  /** LINEUP-EDIT L2a: a change to a draft lineup's row or notes (lineup.share there). */
  edit(input: Actor & { readonly edit: LineupEditInput }): Promise<LineupEditResult>;
  /** LINEUP-EDIT L2b: the Sections window, a location's sections (lineup.share there). */
  sections(input: Actor & { readonly change: LineupSectionsInput }): Promise<LineupSectionsResult>;
  /** LINEUP-EDIT L3a: who may join a department (Add Staff) or take a person's place (Replace), scored. */
  candidates(input: Actor & { readonly query: LineupCandidatesQuery }): Promise<LineupCandidates>;
  myLineups(input: Actor & { readonly date: string }): Promise<MyLineups>;
  acknowledge(input: Actor & { readonly versionId: string }): Promise<LineupAcknowledgement>;
  /** The manager's day: every location she reads, unless she chose some (lineup.read). */
  day(
    input: Actor & { readonly date: string; readonly locationIds?: readonly string[]; readonly shiftTypeIds?: readonly string[] },
  ): Promise<LineupDay>;
}

type RpcError = { message: string; code?: string; hint?: string | null; details?: string | null };
interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export function createLineupService(options: { url: string; serviceRoleKey: string }): LineupService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RpcClient;
  return lineupService(client);
}

export function lineupServiceFromEnvironment(): LineupService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createLineupService({ url, serviceRoleKey }) : null;
}

/**
 * Every service asks the authorization core itself (lineup.share, employee_hub.read, lineup.acknowledge), so a
 * stranger's no comes back as 404 and any other as 403 through rpcFailure; a refused lineup keeps its key
 * (lineup.week_not_published, lineup.past_day, ...) for the screen.
 */
export function lineupService(client: RpcClient): LineupService {
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
    return data;
  }
  return {
    async command({ command, ...actor }) {
      const { command_id, kind, ...payload } = command;
      return lineupCommandResultSchema.parse(await rpc("lineup_command_service", {
        actor_user_id: actor.actorUserId,
        target_workspace_id: actor.workspaceId,
        command_id,
        kind,
        payload,
      }));
    },
    async edit({ edit, ...actor }) {
      const { command_id, ...payload } = edit;
      return lineupEditResultSchema.parse(await rpc("lineup_edit_service", {
        actor_user_id: actor.actorUserId,
        target_workspace_id: actor.workspaceId,
        command_id,
        payload,
      }));
    },
    async sections({ change, ...actor }) {
      return lineupSectionsResultSchema.parse(await rpc("lineup_sections_service", {
        actor_user_id: actor.actorUserId,
        target_workspace_id: actor.workspaceId,
        payload: change,
      }));
    },
    async candidates({ query, ...actor }) {
      return lineupCandidatesSchema.parse(await rpc("get_lineup_candidates_service", {
        actor_user_id: actor.actorUserId,
        target_workspace_id: actor.workspaceId,
        payload: query,
      }));
    },
    async myLineups({ date, ...actor }) {
      return myLineupsSchema.parse(await rpc("get_my_lineups_service", {
        actor_user_id: actor.actorUserId,
        target_workspace_id: actor.workspaceId,
        target_date: date,
      }));
    },
    async acknowledge({ versionId, ...actor }) {
      return lineupAcknowledgementSchema.parse(await rpc("acknowledge_lineup_service", {
        actor_user_id: actor.actorUserId,
        target_workspace_id: actor.workspaceId,
        version_id: versionId,
      }));
    },
    async day({ date, locationIds, shiftTypeIds, ...actor }) {
      return lineupDaySchema.parse(await rpc("get_lineup_day_service", {
        actor_user_id: actor.actorUserId,
        target_workspace_id: actor.workspaceId,
        target_date: date,
        target_location_ids: locationIds ?? null,
        target_shift_type_ids: shiftTypeIds ?? null,
      }));
    },
  };
}
