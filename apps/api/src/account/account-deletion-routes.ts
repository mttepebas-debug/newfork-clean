import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AccountDeletionWorker } from "./account-deletion-worker";
import { hasCronSecret } from "../cron-secret";

export function registerAccountDeletionRoutes(
  app: FastifyInstance,
  options: {
    readonly worker: AccountDeletionWorker | null;
    readonly cronSecret?: string;
  },
) {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.worker)
      return reply.status(503).send({ error: "Account deletion worker is not configured" });
    if (!options.cronSecret)
      return reply.status(503).send({ error: "Account deletion cron is not configured" });
    if (!hasCronSecret(request, options.cronSecret))
      return reply.status(401).send({ error: "Invalid cron secret" });
    return reply.send(await options.worker.runBatch());
  };

  app.get("/internal/cron/account-deletion", handler);
  app.post("/internal/cron/account-deletion", handler);
}
