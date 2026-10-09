import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const purgeJobSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});
const purgeResultSchema = z.object({
  status: z.literal("completed"),
  idempotent: z.boolean().default(false),
});

interface RetentionRpcClient {
  from(tableName: "workspace_retention_purge_jobs"): {
    select(columns: string): {
      eq(column: "status", value: "pending"): {
        lte(column: "due_at", value: string): {
          order(
            column: "due_at",
            options: { ascending: boolean },
          ): {
            limit(
              count: number,
            ): PromiseLike<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
  storage: {
    from(bucket: "employee-onboarding"): OnboardingBucket;
  };
  rpc(
    functionName: "mark_workspace_retention_purge_completed_service",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

interface OnboardingBucket {
  list(
    prefix: string,
    options: { limit: number; offset: number },
  ): PromiseLike<{
    data: { name: string; id: string | null }[] | null;
    error: { message: string } | null;
  }>;
  remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>;
}

// Storage lists one folder at a time; a folder entry has no id.
const listPage = 1000;

async function workspaceFilePaths(bucket: OnboardingBucket, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += listPage) {
    const { data, error } = await bucket.list(prefix, { limit: listPage, offset });
    if (error) throw new Error(error.message);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...(await workspaceFilePaths(bucket, path)));
    }
    if ((data ?? []).length < listPage) return paths;
  }
}

/**
 * BL-279 (1): a purged workspace's onboarding files (IDs, contracts) leave the
 * bucket, not only the record. Paths are workspace_id/employee_id/... .
 */
async function deleteWorkspaceFiles(client: RetentionRpcClient, workspaceId: string) {
  const bucket = client.storage.from("employee-onboarding");
  const paths = await workspaceFilePaths(bucket, workspaceId);
  for (let start = 0; start < paths.length; start += listPage) {
    const { error } = await bucket.remove(paths.slice(start, start + listPage));
    if (error) throw new Error(error.message);
  }
}

export interface WorkspaceRetentionBatchResult {
  checked: number;
  completed: number;
  idempotent: number;
  failed: number;
}

export interface WorkspaceRetentionWorker {
  runBatch(): Promise<WorkspaceRetentionBatchResult>;
}

export function createWorkspaceRetentionWorker(options: {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly workerId?: string;
  readonly batchSize?: number;
  readonly now?: () => Date;
}): WorkspaceRetentionWorker {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as RetentionRpcClient;
  return createWorkspaceRetentionWorkerWithClient(client, options);
}

export function createWorkspaceRetentionWorkerWithClient(
  client: RetentionRpcClient,
  options: {
    readonly workerId?: string;
    readonly batchSize?: number;
    readonly now?: () => Date;
  } = {},
): WorkspaceRetentionWorker {
  const workerId = options.workerId ?? `workspace-retention-${crypto.randomUUID()}`;
  const batchSize = options.batchSize ?? 10;
  const now = options.now ?? (() => new Date());

  return {
    async runBatch() {
      const jobsResponse = await client
        .from("workspace_retention_purge_jobs")
        .select("id,workspace_id")
        .eq("status", "pending")
        .lte("due_at", now().toISOString())
        .order("due_at", { ascending: true })
        .limit(batchSize);
      if (jobsResponse.error) throw new Error(jobsResponse.error.message);

      const jobs = z.array(purgeJobSchema).parse(jobsResponse.data ?? []);
      const result: WorkspaceRetentionBatchResult = {
        checked: jobs.length,
        completed: 0,
        idempotent: 0,
        failed: 0,
      };

      for (const job of jobs) {
        try {
          await deleteWorkspaceFiles(client, job.workspace_id);
        } catch {
          // Left pending: the next run deletes what is left, then marks it.
          result.failed += 1;
          continue;
        }
        const response = await client.rpc(
          "mark_workspace_retention_purge_completed_service",
          {
            target_workspace_id: job.workspace_id,
            purge_metadata: {
              executor: "workspace-retention-worker",
              worker_id: workerId,
              purge_job_id: job.id,
            },
          },
        );
        if (response.error) {
          result.failed += 1;
          continue;
        }

        const purgeResult = purgeResultSchema.parse(response.data);
        if (purgeResult.idempotent) result.idempotent += 1;
        else result.completed += 1;
      }

      return result;
    },
  };
}
