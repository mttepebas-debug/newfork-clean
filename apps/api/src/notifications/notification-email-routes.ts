import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * The email channel's door with no signed-in person (BILDIRIM-14, KARARLAR S-130); its sending runs in the
 * dispatcher of every channel (dispatch-routes.ts, BILDIRIM-DAGITICI):
 *   * Resend's webhook says what happened to an email. It is taken only with a valid Svix signature
 *     (HMAC-SHA256 of "<svix-id>.<svix-timestamp>.<raw body>" with the endpoint secret, any one of the
 *     space-separated v1 signatures, compared in constant time) and a timestamp within five minutes.
 * Neither the answer nor the log carries an address, a key or what failed inside.
 */
export interface ResendEvent {
  readonly type: string;
  readonly emailId: string;
  readonly to: string | null;
  readonly bounceType: string | null;
}

export interface NotificationEmailEvents {
  apply(event: ResendEvent): Promise<string>;
}

export interface NotificationEmailRouteOptions {
  /** Resend's endpoint secret ("whsec_..."); without it the webhook answers 503 and sending still works. */
  readonly webhookSecret?: string;
  readonly events: NotificationEmailEvents | null;
  readonly now?: () => number;
}

const TOLERANCE_SECONDS = 5 * 60;
// A secret shorter than this is no secret: the webhook stays shut (503) rather than trust it.
const LEAST_SECRET_BYTES = 24;
// What Resend says that changes a delivery; anything else (opened, clicked, delayed) is taken and dropped.
const used = new Set(["email.delivered", "email.bounced", "email.complained", "email.suppressed", "email.failed"]);

export function registerNotificationEmailRoutes(app: FastifyInstance, options: NotificationEmailRouteOptions) {
  const now = options.now ?? (() => Date.now());

  // The signature is over the bytes Resend sent, so this door reads its body raw.
  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => done(null, body));
    scope.post("/webhooks/resend", async (request, reply) => {
      const key = options.webhookSecret ? secretBytes(options.webhookSecret) : null;
      if (!key || key.length < LEAST_SECRET_BYTES || !options.events) {
        return reply.status(503).send({ error: "Resend webhook is not configured" });
      }
      const body = typeof request.body === "string" ? request.body : "";
      if (!signed(request.headers, body, key, now())) {
        return reply.status(401).send({ error: "Invalid signature" });
      }
      const event = readEvent(body);
      if (!event) return reply.send({ received: true });
      try {
        await options.events.apply(event);
        return reply.send({ received: true });
      } catch (error) {
        request.log.error({ error: error instanceof Error ? error.message : String(error), type: event.type }, "resend webhook failed");
        return reply.status(500).send({ error: "Internal server error", requestId: request.id });
      }
    });
  });
}

function header(headers: FastifyRequest["headers"], name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function secretBytes(secret: string): Buffer {
  return Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
}

function signed(headers: FastifyRequest["headers"], body: string, key: Buffer, nowMs: number): boolean {
  const id = header(headers, "svix-id");
  const timestamp = header(headers, "svix-timestamp");
  const signatures = header(headers, "svix-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

function readEvent(body: string): ResendEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const { type, data } = parsed as { type?: unknown; data?: unknown };
  if (typeof type !== "string" || !used.has(type) || !data || typeof data !== "object") return null;
  const { email_id: emailId, to, bounce } = data as { email_id?: unknown; to?: unknown; bounce?: unknown };
  if (typeof emailId !== "string" || emailId.length === 0) return null;
  const first = Array.isArray(to) && typeof to[0] === "string" ? to[0] : typeof to === "string" ? to : null;
  const bounceType =
    bounce && typeof bounce === "object" && typeof (bounce as { type?: unknown }).type === "string"
      ? (bounce as { type: string }).type
      : null;
  return { type, emailId, to: first ? first.trim().toLowerCase() : null, bounceType };
}
