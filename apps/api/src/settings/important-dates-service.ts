import {
  importantDateClosurePreviewSchema,
  importantDateHistorySchema,
  importantDateSavedSchema,
  type ImportantDateClosurePreview,
  type ImportantDateHistory,
  type ImportantDateInput,
  type ImportantDateLocationDays,
  type ImportantDateSaved,
  type ImportantDateShiftChoice,
  type ImportantDateStateAction,
} from "@newfork/shared";
import { rpcFailure } from "../http-error";
import type { JobsRpcClient } from "./jobs-management-service";

type Actor = { actorUserId: string; workspaceId: string };
/** K13: what was chosen for each listed shift, and the fingerprint of the list it was shown. */
type Closure = { shiftChoices: Record<string, ImportantDateShiftChoice>; expectedFingerprint: string | null };
type ClosureQuery = {
  importantDateId: string | null; startsOn: string; endsOn: string; recurrence: string; locationIds: string[];
  allDay: boolean; startTime: string | null; endTime: string | null; locationDays: ImportantDateLocationDays;
};

/**
 * Settings > Important dates writes through the server (FB-6.7): the database
 * decides who may (K1-K3), tells the people it reaches (K5) and keeps the
 * history.
 */
export interface ImportantDatesService {
  save(input: Actor & { importantDateId: string | null; expectedRevision: number | null; date: ImportantDateInput; closure?: Closure }): Promise<ImportantDateSaved>;
  setState(input: Actor & { importantDateId: string; action: ImportantDateStateAction; closure?: Closure }): Promise<ImportantDateSaved>;
  history(input: Actor & { importantDateId: string }): Promise<ImportantDateHistory>;
  /** K13: the published shifts a date would land on. */
  previewClosure(input: Actor & ClosureQuery): Promise<ImportantDateClosurePreview>;
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
      return importantDateSavedSchema.parse(
        await rpc("save_important_date_service", input, {
          target_important_date_id: input.importantDateId,
          target_title: input.date.title,
          target_type: input.date.type,
          target_starts_on: input.date.starts_on,
          target_ends_on: input.date.ends_on,
          target_recurrence: input.date.recurrence,
          target_note: input.date.note,
          target_location_ids: [...new Set(locations)],
          target_expected_revision: input.expectedRevision,
          target_all_day: input.date.all_day,
          target_start_time: input.date.start_time,
          target_end_time: input.date.end_time,
          target_location_days: input.date.location_days,
          target_shift_choices: input.closure?.shiftChoices ?? {},
          target_expected_fingerprint: input.closure?.expectedFingerprint ?? null,
        }),
      );
    },
    async setState(input) {
      return importantDateSavedSchema.parse(
        await rpc("set_important_date_state_service", input, {
          target_important_date_id: input.importantDateId,
          target_action: input.action,
          target_shift_choices: input.closure?.shiftChoices ?? {},
          target_expected_fingerprint: input.closure?.expectedFingerprint ?? null,
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
    async previewClosure(input) {
      return importantDateClosurePreviewSchema.parse(
        await rpc("preview_important_date_closure_service", input, {
          target_important_date_id: input.importantDateId,
          target_starts_on: input.startsOn,
          target_ends_on: input.endsOn,
          target_recurrence: input.recurrence,
          target_location_ids: [...new Set(input.locationIds)],
          target_all_day: input.allDay,
          target_start_time: input.startTime,
          target_end_time: input.endTime,
          target_location_days: input.locationDays,
        }),
      );
    },
  };
}
