import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasCronSecret } from "../cron-secret";
import type { NotificationDispatcher } from "./dispatcher";

/**
 * The one cron door of every notification channel (BILDIRIM-DAGITICI): with the cron secret, it runs the
 * dispatcher once. The answer says what each channel did, never an address, a key or what failed inside.
 */
export interface NotificationDispatchRouteOptions {
  readonly dispatcher: NotificationDispatcher | null;
  readonly cronSecret?: string;
}

export function registerNotificationDispatchRoutes(app: FastifyInstance, options: NotificationDispatchRouteOptions) {
  const run = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.dispatcher) return reply.status(503).send({ error: "Notification delivery is not configured" });
    if (!options.cronSecret) return reply.status(503).send({ error: "Notification delivery cron is not configured" });
    if (!hasCronSecret(request, options.cronSecret)) return reply.status(401).send({ error: "Invalid cron secret" });
    try {
      return reply.send(await options.dispatcher.run(request.log));
    } catch (error) {
      request.log.error({ error: error instanceof Error ? error.message : String(error) }, "notification dispatch failed");
      return reply.status(500).send({ error: "Internal server error", requestId: request.id });
    }
  };
  app.get("/internal/cron/notification-dispatch", run);
  app.post("/internal/cron/notification-dispatch", run);
}
