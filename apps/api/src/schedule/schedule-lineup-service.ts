import {
  scheduleLineupEntryMutationResultSchema,
  scheduleLineupReadModelSchema,
  scheduleLineupSectionArchiveResultSchema,
  scheduleLineupSectionSchema,
  scheduleLineupSharePreviewSchema,
  scheduleLineupShareResultSchema,
  type ScheduleLineupEntryInput,
  type ScheduleLineupEntryMutationResult,
  type ScheduleLineupReadModel,
  type ScheduleLineupSection,
  type ScheduleLineupSectionInput,
  type ScheduleLineupSharePreview,
  type ScheduleLineupShareResult,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";

export interface ScheduleLineupService {
  get(input: {
    actorUserId: string;
    workspaceId: string;
    date: string;
    locationIds: string[] | null;
    shiftTypeIds: string[] | null;
  }): Promise<ScheduleLineupReadModel>;
  saveSection(input: {
    actorUserId: string;
    workspaceId: string;
    sectionId: string | null;
    expectedRevision: number | null;
    section: ScheduleLineupSectionInput;
  }): Promise<ScheduleLineupSection>;
  archiveSection(input: {
    actorUserId: string;
    workspaceId: string;
    sectionId: string;
    expectedRevision: number;
  }): Promise<void>;
  saveEntry(input: {
    actorUserId: string;
    workspaceId: string;
    locationId: string;
    date: string;
    entryId: string | null;
    expectedRevision: number | null;
    entry: ScheduleLineupEntryInput;
  }): Promise<ScheduleLineupEntryMutationResult>;
  deleteEntry(input: {
    actorUserId: string;
    workspaceId: string;
    entryId: string;
    expectedRevision: number;
  }): Promise<ScheduleLineupEntryMutationResult>;
  saveBrief(input: {
    actorUserId: string;
    workspaceId: string;
    locationId: string;
    date: string;
    shiftTypeId: string;
    expectedRevision: number | null;
    outOfStock: string;
    specials: string;
    preShiftNotes: string;
  }): Promise<ScheduleLineupEntryMutationResult>;
  previewShare(input: {
    actorUserId: string;
    workspaceId: string;
    date: string;
    locationIds: string[];
  }): Promise<ScheduleLineupSharePreview>;
  share(input: {
    actorUserId: string;
    workspaceId: string;
    date: string;
    locationIds: string[];
    fingerprint: string;
  }): Promise<ScheduleLineupShareResult>;
}

export function createScheduleLineupService(options: {
  url: string;
  serviceRoleKey: string;
}): ScheduleLineupService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async get(input) {
      return scheduleLineupReadModelSchema.parse(
        await rpc("get_schedule_lineup_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_date: input.date,
          target_location_ids: input.locationIds,
          target_shift_type_ids: input.shiftTypeIds,
        }),
      );
    },
    async saveSection(input) {
      return scheduleLineupSectionSchema.parse(
        await rpc("upsert_schedule_lineup_section_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_section_id: input.sectionId,
          target_expected_revision: input.expectedRevision,
          section: input.section,
        }),
      );
    },
    async archiveSection(input) {
      scheduleLineupSectionArchiveResultSchema.parse(
        await rpc("archive_schedule_lineup_section_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_section_id: input.sectionId,
          target_expected_revision: input.expectedRevision,
        }),
      );
    },
    async saveEntry(input) {
      return scheduleLineupEntryMutationResultSchema.parse(
        await rpc("upsert_schedule_lineup_entry_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_location_id: input.locationId,
          target_date: input.date,
          target_entry_id: input.entryId,
          target_expected_revision: input.expectedRevision,
          entry: input.entry,
        }),
      );
    },
    async deleteEntry(input) {
      return scheduleLineupEntryMutationResultSchema.parse(
        await rpc("delete_schedule_lineup_entry_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_entry_id: input.entryId,
          target_expected_revision: input.expectedRevision,
        }),
      );
    },
    async saveBrief(input) {
      return scheduleLineupEntryMutationResultSchema.parse(
        await rpc("upsert_schedule_lineup_brief_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_location_id: input.locationId,
          target_date: input.date,
          target_shift_type_id: input.shiftTypeId,
          target_expected_revision: input.expectedRevision,
          brief: {
            out_of_stock: input.outOfStock,
            specials: input.specials,
            pre_shift_notes: input.preShiftNotes,
          },
        }),
      );
    },
    async previewShare(input) {
      return scheduleLineupSharePreviewSchema.parse(
        await rpc("preview_schedule_lineup_share_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_date: input.date,
          target_location_ids: input.locationIds,
        }),
      );
    },
    async share(input) {
      return scheduleLineupShareResultSchema.parse(
        await rpc("share_schedule_lineup_service", {
          actor_user_id: input.actorUserId,
          target_workspace_id: input.workspaceId,
          target_date: input.date,
          target_location_ids: input.locationIds,
          expected_fingerprint: input.fingerprint,
        }),
      );
    },
  };
}
