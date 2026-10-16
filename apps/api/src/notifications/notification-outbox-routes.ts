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
    // Maintenance and its failure log (BL-965) moved to /internal/cron/maintenance (BILDIRIM-01).
    return reply.send(await options.worker.runBatch());
  };

  app.get("/internal/cron/notification-outbox", handler);
  app.post("/internal/cron/notification-outbox", handler);
}
