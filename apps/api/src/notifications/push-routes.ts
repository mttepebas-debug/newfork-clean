import {
  pushSubscriptionInputSchema,
  pushSubscriptionRemoveSchema,
  type NotificationChannelsConfig,
  type PushDevices,
  type PushSubscriptionInput,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { bearerToken } from "../auth/workspace-context";
import { hasCronSecret } from "../cron-secret";
import type { NotificationPushWorker } from "./push-worker";

/**
 * Phone alerts' doors (BILDIRIM-15, KARARLAR S-138):
 *   * the cron route runs one batch of the push worker, with the cron secret;
 *   * a signed-in person saves and removes their own devices. A device is the account's, never a
 *     workspace's, so these name none. The address goes in the body, never in a URL (it is a capability);
 *   * every screen asks which channels the server can send on, so none promises what is not set up.
 */
export interface PushSubscriptionService {
  save(accessToken: string, input: PushSubscriptionInput): Promise<PushDevices>;
  remove(accessToken: string, endpoint: string): Promise<PushDevices>;
}

export interface NotificationPushRouteOptions {
  readonly worker: NotificationPushWorker | null;
  readonly cronSecret?: string;
  readonly service: PushSubscriptionService | null;
  readonly config: () => NotificationChannelsConfig;
}

export function registerNotificationPushRoutes(app: FastifyInstance, options: NotificationPushRouteOptions) {
  const run = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.worker) return reply.status(503).send({ error: "Phone alerts are not configured" });
    if (!options.cronSecret) return reply.status(503).send({ error: "Phone alerts cron is not configured" });
    if (!hasCronSecret(request, options.cronSecret)) return reply.status(401).send({ error: "Invalid cron secret" });
    try {
      return reply.send(await options.worker.runBatch(request.log));
    } catch (error) {
      request.log.error({ error: error instanceof Error ? error.message : String(error) }, "notification push run failed");
      return reply.status(500).send({ error: "Internal server error", requestId: request.id });
    }
  };
  app.get("/internal/cron/notification-push", run);
  app.post("/internal/cron/notification-push", run);

  app.get("/v1/account/notification-channels", async (request, reply) => {
    if (!bearerToken(request.headers.authorization)) return reply.status(401).send({ error: "Bearer token required" });
    return reply.send(options.config());
  });

  app.put("/v1/account/push-subscription", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken) return reply.status(401).send({ error: "Bearer token required" });
    const body = pushSubscriptionInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "A push subscription from this browser is required" });
    // No device is kept while nothing could send to it.
    if (!options.service || !options.config().push.available) return reply.status(503).send({ error: "Phone alerts are not configured" });
    return reply.send(await options.service.save(accessToken, body.data));
  });

  app.delete("/v1/account/push-subscription", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken) return reply.status(401).send({ error: "Bearer token required" });
    const body = pushSubscriptionRemoveSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "This browser's push address is required" });
    if (!options.service) return reply.status(503).send({ error: "Phone alerts are not configured" });
    return reply.send(await options.service.remove(accessToken, body.data.endpoint));
  });
}
