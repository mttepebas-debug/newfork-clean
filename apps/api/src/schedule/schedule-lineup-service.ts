import {
  scheduleLineupEntryMutationResultSchema,
  scheduleLineupReadModelSchema,
  scheduleLineupSectionArchiveResultSchema,
  scheduleLineupSectionSchema,
  scheduleLineupSharePreviewSchema,
  scheduleLineupShareResultSchema,
  type ScheduleLineupEntryInput,
  type ScheduleLineupEntryMoveInput,
  type ScheduleLineupEntryMutationResult,
  type ScheduleLineupReadModel,
  type ScheduleLineupSection,
  type ScheduleLineupSectionInput,
  type ScheduleLineupSharePreview,
  type ScheduleLineupShareResult,
} from "@newfork/shared/schedule";

import { createClient } from "@supabase/supabase-js";

export interface ScheduleLineupService {
  operations?(input: {
    actorUserId: string;

    workspaceId: string;

    action: string;

    payload: Record<string, unknown>;
  }): Promise<unknown>;

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

  moveEntry(input: {
    actorUserId: string;

    workspaceId: string;

    move: ScheduleLineupEntryMoveInput;
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
    shiftTypeIds?: string[];
  }): Promise<ScheduleLineupSharePreview>;

  share(input: {
    actorUserId: string;

    workspaceId: string;

    date: string;

    locationIds: string[];
    shiftTypeIds?: string[];

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

  async function schedulingTimeFormat(workspaceId: string) {
    const { data, error } = await client

      .from("workspace_scheduling_settings")

      .select("time_format")

      .eq("workspace_id", workspaceId)

      .maybeSingle();

    if (error) throw new Error(error.message);

    return data?.time_format === "24h" ? "24h" : "12h";
  }

  async function assertLocationsEnabled(
    actorUserId: string,
    workspaceId: string,
    locationIds: string[] | null,
    permission = "schedule.lineup.manage",
  ) {
    await rpc("lineup_operations_service", {
      actor_user_id: actorUserId,
      target_workspace_id: workspaceId,
      action: "guard",
      payload: { location_ids: locationIds, permission },
    });
  }
  async function assertEntryEnabled(
    actorUserId: string,
    workspaceId: string,
    entryId: string,
  ) {
    await rpc("lineup_operations_service", {
      actor_user_id: actorUserId,
      target_workspace_id: workspaceId,
      action: "guard",
      payload: { entry_id: entryId, permission: "schedule.lineup.manage" },
    });
  }

  return {
    async operations(input) {
      if (["note", "section_plan"].includes(input.action)) {
        const item = (
          input.action === "note" ? input.payload.note : input.payload
        ) as Record<string, unknown>;
        await assertLocationsEnabled(
          input.actorUserId,
          input.workspaceId,
          typeof item.location_id === "string" ? [item.location_id] : null,
        );
      }
      const result = await rpc(
        [
          "offers",
          "respond",
          "destinations",
          "proposals",
          "propose",
          "proposal_action",
        ].includes(input.action)
          ? "lineup_proposals_service"
          : "lineup_operations_service",
        {
          actor_user_id: input.actorUserId,

          target_workspace_id: input.workspaceId,

          action: input.action,

          payload: input.payload,
        },
      );
      const proposalId =
        input.action === "propose"
          ? result?.id
          : input.action === "respond" ||
              (input.action === "proposal_action" &&
                input.payload.response !== "preview")
            ? input.payload.id
            : null;
      const eventId = input.action === "apply" ? result?.event_id : null;
      if (typeof proposalId === "string" || typeof eventId === "string") {
        // The domain RPC has committed. Failure here leaves the successful
        // assignment/response intact; durable outbox retries remain available.
        try {
          const signal = AbortSignal.timeout(2_000);
          let remaining = true;
          while (remaining && !signal.aborted) {
            const delivery = await client
              .rpc("flush_lineup_staffing_notifications_service", {
                target_workspace_id: input.workspaceId,
                target_proposal_id: proposalId ?? null,
                target_event_id: eventId ?? null,
              })
              .abortSignal(signal);
            if (
              delivery.error ||
              delivery.data?.retried ||
              delivery.data?.dead_lettered ||
              delivery.data?.invalidation_deferred ||
              delivery.data?.busy ||
              (delivery.data?.remaining && !delivery.data?.leased)
            ) {
              console.warn("Line Up staffing notification delivery deferred", {
                workspaceId: input.workspaceId,
                proposalId,
                eventId,
              });
              break;
            }
            remaining = Boolean(delivery.data?.remaining);
          }
        } catch {
          console.warn("Line Up staffing notification delivery deferred", {
            workspaceId: input.workspaceId,
            proposalId,
            eventId,
          });
        }
      }
      return result;
    },

    async get(input) {
      const [model, timeFormat] = await Promise.all([
        rpc("get_schedule_lineup_service", {
          actor_user_id: input.actorUserId,

          target_workspace_id: input.workspaceId,

          target_date: input.date,

          target_location_ids: input.locationIds,

          target_shift_type_ids: input.shiftTypeIds,
        }),

        schedulingTimeFormat(input.workspaceId),
      ]);

      return scheduleLineupReadModelSchema.parse(
        typeof model === "object" && model !== null
          ? { ...model, settings: { time_format: timeFormat } }
          : model,
      );
    },

    async saveSection(input) {
      await assertLocationsEnabled(input.actorUserId, input.workspaceId, null);
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
      await assertLocationsEnabled(input.actorUserId, input.workspaceId, null);
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
      await assertLocationsEnabled(input.actorUserId, input.workspaceId, [
        input.locationId,
      ]);
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
      await assertEntryEnabled(
        input.actorUserId,
        input.workspaceId,
        input.entryId,
      );
      return scheduleLineupEntryMutationResultSchema.parse(
        await rpc("delete_schedule_lineup_entry_service", {
          actor_user_id: input.actorUserId,

          target_workspace_id: input.workspaceId,

          target_entry_id: input.entryId,

          target_expected_revision: input.expectedRevision,
        }),
      );
    },

    async moveEntry(input) {
      await assertEntryEnabled(
        input.actorUserId,
        input.workspaceId,
        input.move.source_entry_id,
      );
      await assertLocationsEnabled(input.actorUserId, input.workspaceId, [
        input.move.target_location_id,
      ]);
      return scheduleLineupEntryMutationResultSchema.parse(
        await rpc("move_schedule_lineup_entry_service", {
          actor_user_id: input.actorUserId,

          target_workspace_id: input.workspaceId,

          move: input.move,
        }),
      );
    },

    async saveBrief(input) {
      await assertLocationsEnabled(input.actorUserId, input.workspaceId, [
        input.locationId,
      ]);
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
        await rpc("preview_schedule_lineup_scoped_share_service", {
          actor_user_id: input.actorUserId,

          target_workspace_id: input.workspaceId,

          target_date: input.date,

          target_location_ids: input.locationIds,
          target_shift_type_ids: input.shiftTypeIds ?? null,
        }),
      );
    },

    async share(input) {
      await assertLocationsEnabled(
        input.actorUserId,
        input.workspaceId,
        input.locationIds,
        "schedule.lineup.share",
      );
      const result = scheduleLineupShareResultSchema.parse(
        await rpc("share_schedule_lineup_scoped_service", {
          actor_user_id: input.actorUserId,

          target_workspace_id: input.workspaceId,

          target_date: input.date,

          target_location_ids: input.locationIds,
          target_shift_type_ids: input.shiftTypeIds ?? null,

          expected_fingerprint: input.fingerprint,
        }),
      );

      try {
        await rpc("deliver_lineup_notifications_service", {
          actor: input.actorUserId,

          w: input.workspaceId,

          snapshot_ids: result.snapshot_ids,
        });
      } catch {
        // The committed snapshot remains available; undelivered outbox rows are
        // retained for retry. Never turn a delivery failure into a failed share.
      }

      return result;
    },
  };
}
