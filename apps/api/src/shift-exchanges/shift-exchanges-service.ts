import { createClient } from "@supabase/supabase-js";
import {
  exchangeCandidatesSchema,
  exchangeMutationSchema,
  exchangePreviewSchema,
  exchangeReadModelSchema,
  exchangeScheduleRecoverySchema,
  type ExchangeCommand,
} from "@newfork/shared";
import { scheduleEditSessionSchema } from "@newfork/shared/schedule";

export function createShiftExchangesService(options: {
  url: string;
  serviceRoleKey: string;
}) {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error)
      throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  }
  return {
    async recoverSchedule(
      actor: string,
      workspace: string,
      session: string,
      fingerprint?: string,
      key?: string,
    ) {
      const data = await rpc("shift_exchange_schedule_recovery_service", {
        actor,
        w: workspace,
        sid: session,
        ...(fingerprint
          ? { expected_fingerprint: fingerprint, idempotency_key: key }
          : {}),
      });
      return fingerprint
        ? scheduleEditSessionSchema.parse(data)
        : exchangeScheduleRecoverySchema.parse(data);
    },
    async read(
      actor: string,
      workspace: string,
      manager: boolean,
      from?: string,
      to?: string,
      caseId?: string,
    ) {
      return exchangeReadModelSchema.parse(
        await rpc("shift_exchanges_read_service", {
          actor,
          w: workspace,
          manager_view: manager,
          ...(from ? { from_date: from } : {}),
          ...(to ? { to_date: to } : {}),
          ...(caseId ? { focused_case_id: caseId } : {}),
        }),
      );
    },
    async candidates(actor: string, workspace: string, shift: string) {
      return exchangeCandidatesSchema.parse(
        await rpc("shift_exchanges_candidates_service", {
          actor,
          w: workspace,
          shift_id: shift,
        }),
      );
    },
    async preview(
      actor: string,
      workspace: string,
      caseId: string,
      applicationId: string,
    ) {
      return exchangePreviewSchema.parse(
        await rpc("shift_exchange_preview", {
          actor,
          w: workspace,
          cid: caseId,
          aid: applicationId,
        }),
      );
    },
    async command(
      actor: string,
      workspace: string,
      command: ExchangeCommand,
      key: string,
    ) {
      const result = exchangeMutationSchema.parse(
        await rpc("shift_exchanges_command_service", {
          actor,
          w: workspace,
          command,
          idempotency_key: key,
        }),
      );
      // This RPC starts only after the assignment/consent transaction committed.
      // Delivery failure (including an uncertain timeout) cannot undo that result;
      // the durable outbox and cron retain ownership of retrying it.
      try {
        const signal = AbortSignal.timeout(2_000);
        let remaining = true;
        while (remaining && !signal.aborted) {
          const delivery = await client
            .rpc("flush_shift_exchange_notifications_service", {
              target_workspace_id: workspace,
              target_case_id: result.case_id,
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
            console.warn("Shift exchange notification delivery deferred", {
              workspaceId: workspace,
              caseId: result.case_id,
            });
            break;
          }
          remaining = Boolean(delivery.data?.remaining);
        }
      } catch {
        console.warn("Shift exchange notification delivery deferred", {
          workspaceId: workspace,
          caseId: result.case_id,
        });
      }
      return result;
    },
  };
}
export type ShiftExchangesService = ReturnType<
  typeof createShiftExchangesService
>;
