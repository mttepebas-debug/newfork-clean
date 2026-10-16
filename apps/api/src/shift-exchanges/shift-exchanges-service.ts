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
import { rpcFailure } from "../http-error";

export function createShiftExchangesService(options: {
  url: string;
  serviceRoleKey: string;
}) {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw rpcFailure(error);
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
      return exchangeMutationSchema.parse(
        await rpc("shift_exchanges_command_service", {
          actor,
          w: workspace,
          command,
          idempotency_key: key,
        }),
      );
    },
  };
}
export type ShiftExchangesService = ReturnType<
  typeof createShiftExchangesService
>;
