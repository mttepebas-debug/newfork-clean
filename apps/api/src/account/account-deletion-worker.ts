import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { employeeProfilePhotoBucket } from "@newfork/shared";
import { z } from "zod";
import {
  createRecoveryEmailDelivery,
  tokenDigest,
  type RecoveryEmailDelivery,
} from "./account-security-service";

const workItemSchema = z.object({
  request_id: z.string().uuid(),
  user_id: z.string().uuid(),
  email: z.string().email(),
  restore_until: z.string().datetime({ offset: true }),
  action: z.union([z.literal("day_7"), z.literal("last_24h"), z.literal("finalize")]),
  lease_id: z.string().uuid(),
});

interface AccountDeletionWorkerClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from(bucket: typeof employeeProfilePhotoBucket): {
      remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>;
    };
  };
  auth: {
    admin: {
      updateUserById(
        userId: string,
        attributes: {
          email: string;
          email_confirm: boolean;
          password: string;
          user_metadata: Record<string, never>;
          ban_duration: string;
        },
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

export interface AccountDeletionBatchResult {
  checked: number;
  reminded: number;
  finalized: number;
  failed: number;
}

export interface AccountDeletionWorker {
  runBatch(): Promise<AccountDeletionBatchResult>;
}

export function createAccountDeletionWorker(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly appUrl: string;
  readonly resendApiKey?: string;
  readonly emailFrom?: string;
  readonly production?: boolean;
  readonly batchSize?: number;
  readonly now?: () => Date;
}): AccountDeletionWorker {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }) },
  }) as unknown as AccountDeletionWorkerClient;
  return createAccountDeletionWorkerWithClient(client, {
    appUrl: options.appUrl,
    deliverRecoveryEmail: createRecoveryEmailDelivery(options),
    batchSize: options.batchSize,
    now: options.now,
    recoverySigningKey: options.serviceRoleKey,
  });
}

export function createAccountDeletionWorkerWithClient(
  client: AccountDeletionWorkerClient,
  options: {
    readonly appUrl: string;
    readonly deliverRecoveryEmail: RecoveryEmailDelivery;
    readonly batchSize?: number;
    readonly now?: () => Date;
    readonly recoverySigningKey: string;
    readonly logError?: (event: { event: string; requestId: string; action: string; stage: string; error: string }) => void;
  },
): AccountDeletionWorker {
  const batchSize = options.batchSize ?? 20;

  async function rpc(name: string, args: Record<string, unknown>) {
    const response = await client.rpc(name, args);
    if (response.error) throw new Error(response.error.message);
    return response.data;
  }

  // AVATAR-IKON: the person's avatar photos in every workspace they uploaded one in. The database names
  // them (under this lease) before the purge forgets them; a failed delete stops the purge for a retry.
  async function removeAvatarObjects(lease: { target_request_id: string; target_lease_id: string }) {
    const paths = z.array(z.string()).parse(
      (await rpc("list_account_deletion_avatar_photos_service", lease)) ?? [],
    );
    if (paths.length === 0) return;
    const removed = await client.storage.from(employeeProfilePhotoBucket).remove(paths);
    if (removed.error) throw new Error(removed.error.message);
  }

  async function sendReminder(
    item: z.infer<typeof workItemSchema>,
    kind: "day_7" | "last_24h",
    stage: (value: string) => void,
  ) {
    const token = createHmac("sha256", options.recoverySigningKey)
      .update(`account-deletion:${item.request_id}:${kind}`).digest("base64url");
    stage("prepare_reminder");
    const rotated = (await rpc("prepare_account_deletion_delivery_service", {
      target_request_id: item.request_id,
      target_lease_id: item.lease_id,
      delivery_kind: kind,
      recovery_token_digest: tokenDigest(token),
    })) as { email: string; restore_until: string };
    stage("deliver_reminder");
    await options.deliverRecoveryEmail({
      email: rotated.email,
      recoveryUrl: `${options.appUrl.replace(/\/$/, "")}/account-recovery?token=${encodeURIComponent(token)}`,
      restoreUntil: rotated.restore_until,
      kind,
      idempotencyKey: `account-deletion-${item.request_id}-${kind}`,
    });
    stage("record_reminder_delivery");
    await rpc("complete_account_deletion_work_service", {
      target_request_id: item.request_id,
      target_lease_id: item.lease_id,
      delivery_kind: kind,
    });
  }

  async function finalize(item: z.infer<typeof workItemSchema>, stage: (value: string) => void) {
    const lease = { target_request_id: item.request_id, target_lease_id: item.lease_id };
    await rpc("renew_account_deletion_work_service", lease);
    stage("remove_avatar");
    await removeAvatarObjects(lease);
    await rpc("renew_account_deletion_work_service", lease);
    const tombstoneEmail = `deleted+${item.request_id}@deleted.invalid`;
    stage("anonymize_auth");
    const anonymized = await client.auth.admin.updateUserById(item.user_id, {
      email: tombstoneEmail,
      email_confirm: true,
      password: randomBytes(48).toString("base64url"),
      user_metadata: {},
      ban_duration: "876000h",
    });
    if (anonymized.error) throw new Error(anonymized.error.message);
    stage("purge_account_data");
    await rpc("finalize_claimed_account_deletion_service", lease);
    await rpc("complete_account_deletion_work_service", {
      target_request_id: item.request_id, target_lease_id: item.lease_id, delivery_kind: "finalize",
    });
  }

  return {
    async runBatch() {
      const result: AccountDeletionBatchResult = {
        checked: 0,
        reminded: 0,
        finalized: 0,
        failed: 0,
      };

      for (let index = 0; index < batchSize; index += 1) {
        // Claim only when ready to execute, so queued items cannot outlive their lease.
        const work = await rpc("claim_account_deletion_work_service", { target_batch_size: 1 });
        const item = z.array(workItemSchema).parse(work ?? [])[0];
        if (!item) break;
        result.checked += 1;
        let stage = "claimed";
        const setStage = (value: string) => { stage = value; };
        try {
          if (item.action === "finalize") {
            await finalize(item, setStage);
            result.finalized += 1;
          } else {
            await sendReminder(item, item.action, setStage);
            result.reminded += 1;
          }
        } catch (error: unknown) {
          result.failed += 1;
          (options.logError ?? ((event) => console.error(JSON.stringify(event))))({
            event: "account_deletion_item_failed", requestId: item.request_id,
            action: item.action, stage,
            // Do not put provider payloads, addresses or recovery links into logs.
            error: error instanceof Error ? error.name : "UnknownError",
          });
        }
      }
      return result;
    },
  };
}
