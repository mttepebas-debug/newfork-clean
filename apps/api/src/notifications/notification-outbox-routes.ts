import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { NotificationOutboxWorker } from "./notification-outbox-worker";

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
    if (cronSecretFromRequest(request) !== options.cronSecret)
      return reply.status(401).send({ error: "Invalid cron secret" });
    return reply.send(await options.worker.runBatch());
  };

  app.get("/internal/cron/notification-outbox", handler);
  app.post("/internal/cron/notification-outbox", handler);
}

function cronSecretFromRequest(request: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const authorization = headerValue(request.headers.authorization);
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return headerValue(request.headers["x-cron-secret"]);
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
