import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceRetentionWorker } from "./workspace-retention-worker";
import { hasCronSecret } from "../cron-secret";

export interface WorkspaceRetentionRouteOptions {
  readonly worker: WorkspaceRetentionWorker | null;
  readonly cronSecret?: string;
}

export function registerWorkspaceRetentionRoutes(
  app: FastifyInstance,
  options: WorkspaceRetentionRouteOptions,
) {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.worker)
      return reply
        .status(503)
        .send({ error: "Workspace retention worker is not configured" });
    if (!options.cronSecret)
      return reply
        .status(503)
        .send({ error: "Workspace retention cron is not configured" });
    if (!hasCronSecret(request, options.cronSecret))
      return reply.status(401).send({ error: "Invalid cron secret" });

    return reply.send(await options.worker.runBatch());
  };

  app.get("/internal/cron/workspace-retention", handler);
  app.post("/internal/cron/workspace-retention", handler);
}
