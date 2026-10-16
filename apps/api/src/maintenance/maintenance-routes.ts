import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MaintenanceWorker } from "./maintenance-worker";
import { hasCronSecret } from "../cron-secret";

export interface MaintenanceRouteOptions {
  readonly worker: MaintenanceWorker | null;
  readonly cronSecret?: string;
}

export function registerMaintenanceRoutes(app: FastifyInstance, options: MaintenanceRouteOptions) {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.worker)
      return reply.status(503).send({ error: "Maintenance worker is not configured" });
    if (!options.cronSecret)
      return reply.status(503).send({ error: "Maintenance cron is not configured" });
    if (!hasCronSecret(request, options.cronSecret))
      return reply.status(401).send({ error: "Invalid cron secret" });

    const result = await options.worker.runBatch();
    // BL-965: a failed step used to leave only a flag in the answer, which nothing reads. The server
    // log says so, with the message; the answer carries no internals (app.ts error policy).
    const steps = [
      ["shift exchange maintenance", result.shiftExchanges],
      ["document maintenance", result.documents],
    ] as const;
    for (const [step, outcome] of steps) {
      if ("failed" in outcome) request.log.error({ step, error: outcome.error }, "maintenance step failed");
    }
    const documents = result.documents;
    return reply.send({
      ...result,
      ...("failed" in result.shiftExchanges ? { shiftExchanges: { failed: true } } : {}),
      ...("failed" in documents ? { documents: { failed: true } } : {}),
    });
  };

  app.get("/internal/cron/maintenance", handler);
  app.post("/internal/cron/maintenance", handler);
}
