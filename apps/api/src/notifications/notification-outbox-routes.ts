import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { NotificationOutboxWorker } from "./notification-outbox-worker";
import { hasCronSecret } from "../cron-secret";

export interface NotificationOutboxRouteOptions {
  readonly worker: NotificationOutboxWorker | null;
  readonly cronSecret?: string;
}

export function registerNotificationOutboxRoutes(
  app: FastifyInstance,
  options: NotificationOutboxRouteOptions,
) {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.worker)
      return reply
        .status(503)
        .send({ error: "Notification worker is not configured" });
    if (!options.cronSecret)
      return reply
        .status(503)
        .send({ error: "Notification cron is not configured" });
    if (!hasCronSecret(request, options.cronSecret))
      return reply.status(401).send({ error: "Invalid cron secret" });
    const result = await options.worker.runBatch();
    // BL-965: a failed maintenance step left only a flag in this answer, which nothing reads, so
    // document maintenance failed every minute for weeks unseen. The server log says so now.
    const steps = [
      ["shift exchange maintenance", result.maintenance],
      ["document maintenance", result.documentMaintenance],
    ] as const;
    for (const [step, outcome] of steps) {
      if (outcome && "failed" in outcome) request.log.error({ step, error: outcome.error }, "notification maintenance failed");
    }
    const documents = result.documentMaintenance;
    if (documents && "failed_cases" in documents && documents.failed_cases > 0)
      request.log.warn({ failedCases: documents.failed_cases }, "document maintenance skipped cases after errors");
    return reply.send(result);
  };

  app.get("/internal/cron/notification-outbox", handler);
  app.post("/internal/cron/notification-outbox", handler);
}
