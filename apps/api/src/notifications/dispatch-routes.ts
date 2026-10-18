import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasCronSecret } from "../cron-secret";
import type { NotificationDispatcher } from "./dispatcher";

/**
 * The cron doors of every notification channel (BILDIRIM-DAGITICI), with the cron secret:
 *   * dispatch runs the dispatcher once (every 5 seconds while something is due);
 *   * heartbeat tells the alerts and checks in with Sentry's cron monitor (every 5 minutes, always).
 * The answer says what was done, never an address, a key or what failed inside.
 */
export interface NotificationDispatchRouteOptions {
  readonly dispatcher: NotificationDispatcher | null;
  readonly cronSecret?: string;
}

export function registerNotificationDispatchRoutes(app: FastifyInstance, options: NotificationDispatchRouteOptions) {
  const door =
    (work: (dispatcher: NotificationDispatcher, request: FastifyRequest) => Promise<unknown>, failure: string) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!options.dispatcher) return reply.status(503).send({ error: "Notification delivery is not configured" });
      if (!options.cronSecret) return reply.status(503).send({ error: "Notification delivery cron is not configured" });
      if (!hasCronSecret(request, options.cronSecret)) return reply.status(401).send({ error: "Invalid cron secret" });
      try {
        return reply.send(await work(options.dispatcher, request));
      } catch (error) {
        request.log.error({ error: error instanceof Error ? error.message : String(error) }, failure);
        return reply.status(500).send({ error: "Internal server error", requestId: request.id });
      }
    };
  const dispatch = door((dispatcher, request) => dispatcher.run(request.log), "notification dispatch failed");
  const heartbeat = door((dispatcher, request) => dispatcher.heartbeat(request.log), "notification heartbeat failed");
  app.get("/internal/cron/notification-dispatch", dispatch);
  app.post("/internal/cron/notification-dispatch", dispatch);
  app.get("/internal/cron/notification-heartbeat", heartbeat);
  app.post("/internal/cron/notification-heartbeat", heartbeat);
}
