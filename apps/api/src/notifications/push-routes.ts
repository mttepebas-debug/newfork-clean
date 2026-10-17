import {
  pushSubscriptionInputSchema,
  pushSubscriptionRemoveSchema,
  type NotificationChannelsConfig,
  type PushDevices,
  type PushSubscriptionInput,
} from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { bearerToken } from "../auth/workspace-context";

/**
 * Phone alerts' doors (BILDIRIM-15, KARARLAR S-138); their sending runs in the dispatcher of every channel
 * (dispatch-routes.ts, BILDIRIM-DAGITICI):
 *   * a signed-in person saves and removes their own devices. A device is the account's, never a
 *     workspace's, so these name none. The address goes in the body, never in a URL (it is a capability);
 *   * every screen asks which channels the server can send on, so none promises what is not set up.
 */
export interface PushSubscriptionService {
  save(accessToken: string, input: PushSubscriptionInput): Promise<PushDevices>;
  remove(accessToken: string, endpoint: string): Promise<PushDevices>;
}

export interface NotificationPushRouteOptions {
  readonly service: PushSubscriptionService | null;
  /** Whether the auth server knows this session; the channels are told to a signed-in person only. */
  readonly verifySession: ((accessToken: string) => Promise<boolean>) | null;
  readonly config: () => NotificationChannelsConfig;
}

export function registerNotificationPushRoutes(app: FastifyInstance, options: NotificationPushRouteOptions) {
  app.get("/v1/account/notification-channels", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken) return reply.status(401).send({ error: "Bearer token required" });
    if (!options.verifySession) return reply.status(503).send({ error: "Notifications are not configured" });
    if (!(await options.verifySession(accessToken))) return reply.status(401).send({ error: "Valid bearer session required" });
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
