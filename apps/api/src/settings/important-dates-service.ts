import {
  importantDateHistorySchema,
  type ImportantDateHistory,
  type ImportantDateInput,
  type ImportantDateStateAction,
} from "@newfork/shared";
import { z } from "zod";
import { rpcFailure } from "../http-error";
import type { JobsRpcClient } from "./jobs-management-service";

type Actor = { actorUserId: string; workspaceId: string };

const savedSchema = z.object({
  important_date_id: z.string().uuid(),
  status: z.enum(["published", "unpublished"]),
  archived_at: z.string().datetime({ offset: true }).nullable().optional(),
  recipient_count: z.coerce.number().int().nonnegative().optional(),
});
export type ImportantDateSaved = z.infer<typeof savedSchema>;

/**
 * Settings > Important dates writes through the server (FB-6.7): the database
 * decides who may (K1-K3), tells the people it reaches (K5) and keeps the
 * history.
 */
export interface ImportantDatesService {
  save(input: Actor & { importantDateId: string | null; date: ImportantDateInput }): Promise<ImportantDateSaved>;
  setState(input: Actor & { importantDateId: string; action: ImportantDateStateAction }): Promise<ImportantDateSaved>;
  history(input: Actor & { importantDateId: string }): Promise<ImportantDateHistory>;
}

export function createImportantDatesService(client: JobsRpcClient): ImportantDatesService {
  async function rpc(name: string, actor: Actor, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, {
      actor_user_id: actor.actorUserId,
      target_workspace_id: actor.workspaceId,
      ...args,
    });
    if (error) throw rpcFailure(error);
    return data;
  }
  return {
    async save(input) {
      const locations = input.date.location_ids ?? (input.date.location_id ? [input.date.location_id] : []);
      return savedSchema.parse(
        await rpc("save_important_date_service", input, {
          target_important_date_id: input.importantDateId,
          target_title: input.date.title,
          target_type: input.date.type,
          target_starts_on: input.date.starts_on,
          target_ends_on: input.date.ends_on,
          target_recurrence: input.date.recurrence,
          target_note: input.date.note,
          target_affects_scheduling: input.date.affects_scheduling,
          target_location_ids: [...new Set(locations)],
        }),
      );
    },
    async setState(input) {
      return savedSchema.parse(
        await rpc("set_important_date_state_service", input, {
          target_important_date_id: input.importantDateId,
          target_action: input.action,
        }),
      );
    },
    async history(input) {
      return importantDateHistorySchema.parse(
        await rpc("read_important_date_history_service", input, {
          target_important_date_id: input.importantDateId,
        }),
      );
    },
  };
}
