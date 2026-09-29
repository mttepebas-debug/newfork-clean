import { createHash } from "node:crypto";
import { notificationActionSchema } from "@newfork/shared";
import { inboxQuery } from "../communications/communication-routes";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { bearerToken } from "../auth/workspace-context";
import type { AccountSecurityService } from "./account-security-service";

const emailChangeBody = z.object({
  newEmail: z.string().trim().email().max(320),
});
const passwordChangeBody = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(8).max(256),
    confirmPassword: z.string().min(8).max(256),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Password confirmation must match",
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "New password must be different",
  });
const currentPasswordBody = z.object({
  currentPassword: z.string().min(1).max(256),
});
const recoveryBody = z.object({
  token: z.string().trim().min(32).max(256),
});
const recoveryResendBody = z.object({
  email: z.string().trim().email().max(320),
});

export function registerAccountSecurityRoutes(
  app: FastifyInstance,
  options: {
    readonly service: AccountSecurityService | null;
    /** Every resend answer waits this long, so its time says nothing (BL-279). */
    readonly recoveryResendFloorMs?: number;
    /** The resend's share of the floor; a send still running then is cut off. */
    readonly recoveryResendBudgetMs?: number;
    /**
     * Whether this caller may ask for another resend (ten an hour), given a
     * sha256 hex digest of its address. See claim_account_recovery_resend_service.
     */
    readonly claimRecoveryResend: ((addressDigest: string) => Promise<boolean>) | null;
  },
) {
  const resendFloorMs = options.recoveryResendFloorMs ?? 1_500;
  const resendBudgetMs = options.recoveryResendBudgetMs ?? 1_200;
  app.get("/v1/account/notification-preferences", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.getNotificationPreferences(token));
  });
  app.get("/v1/account/notifications", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: "Bearer token required" });
    const query = inboxQuery.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Valid notification filters required" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.getNotifications(token, {
      category: query.data.category, severity: query.data.severity,
      readState: query.data.read_state ?? (query.data.unread_only ? "unread" : null),
      cursor: query.data.cursor, limit: query.data.limit,
    }));
  });
  app.post("/v1/account/notifications/action", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: "Bearer token required" });
    const body = notificationActionSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Valid notification action required" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.actOnNotification(token, body.data));
  });
  app.get("/v1/account/security", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    return reply.send(await options.service.getSecurityState(accessToken));
  });

  app.post("/v1/account/security/email-change", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = emailChangeBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success)
      return reply.status(400).send({ error: "Valid new email required" });
    if (!options.service) return unavailable(reply);
    return reply.send(
      await options.service.requestEmailChange(accessToken, body.data.newEmail),
    );
  });

  app.post("/v1/account/security/email-change/resend", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    await options.service.resendEmailChange(accessToken);
    return reply.send({ status: "sent" });
  });

  app.delete("/v1/account/security/email-change", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    await options.service.cancelEmailChange(accessToken);
    return reply.send({ status: "cancelled" });
  });

  app.post("/v1/account/security/password", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = passwordChangeBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success)
      return hasCurrentPassword(request.body)
        ? reply.status(400).send({ error: "Valid password change required" })
        : passwordRequired(reply);
    if (!options.service) return unavailable(reply);
    await options.service.changePassword(
      accessToken,
      body.data.currentPassword,
      body.data.newPassword,
    );
    return reply.send({ status: "changed" });
  });

  app.post("/v1/account/security/sessions/sign-out-others", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = currentPasswordBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success) return passwordRequired(reply);
    if (!options.service) return unavailable(reply);
    await options.service.signOutOtherSessions(
      accessToken,
      body.data.currentPassword,
    );
    return reply.send({ status: "signed_out" });
  });

  app.get("/v1/account/security/deletion/blockers", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    const blockers = await options.service.getAccountDeletionBlockers(accessToken);
    return reply.send({ blockers });
  });

  app.post("/v1/account/security/deletion", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = currentPasswordBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success) return passwordRequired(reply);
    if (!options.service) return unavailable(reply);
    return reply.send(
      await options.service.requestAccountDeletion(
        accessToken,
        body.data.currentPassword,
      ),
    );
  });

  app.post("/v1/account/security/deletion/recovery", async (request, reply) => {
    const body = recoveryBody.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid recovery token required" });
    if (!options.service) return unavailable(reply);
    try {
      return reply.send(
        await options.service.restoreAccountDeletion(body.data.token),
      );
    } catch {
      return reply.status(400).send({ error: "Valid recovery token required" });
    }
  });

  app.post(
    "/v1/account/security/deletion/recovery/resend",
    async (request, reply) => {
      const body = recoveryResendBody.safeParse(request.body);
      if (!body.success)
        return reply.status(400).send({ error: "Valid account email required" });
      if (!options.service || !options.claimRecoveryResend) return unavailable(reply);
      const service = options.service;
      // Vercel sets x-real-ip to the caller's address; locally it is the socket.
      const realIp = request.headers["x-real-ip"];
      const address = (typeof realIp === "string" && realIp) || request.ip;
      if (!(await options.claimRecoveryResend(sha256(address))))
        return reply
          .status(429)
          .header("retry-after", "3600")
          .send({ error: "Too many requests. Try again later." });

      // As in password-reset.ts: the send gets a budget under the floor and is
      // cut off at it, so every answer leaves at the floor, pending account or not.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), resendBudgetMs);
      const cutOff = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener("abort", () =>
          reject(new Error("Account recovery resend timed out")),
        ),
      );
      const resend = Promise.race([
        service.resendAccountDeletionRecovery(body.data.email, controller.signal),
        cutOff,
      ])
        .catch((error: unknown) => {
          request.log.error({ err: error }, "account recovery resend failed");
        })
        .finally(() => clearTimeout(timer));
      await Promise.all([resend, new Promise((resolve) => setTimeout(resolve, resendFloorMs))]);
      return reply.status(202).send({ status: "accepted" });
    },
  );
}

function hasCurrentPassword(body: unknown): boolean {
  const value = (body as { currentPassword?: unknown } | null)?.currentPassword;
  return typeof value === "string" && value.length > 0;
}

// Same key as the workspace close/hand-over prompts, so a screen reads one.
function passwordRequired(reply: FastifyReply) {
  return reply.status(400).send({
    error: "Current password required",
    reason: "session.password_required",
  });
}

function unavailable(reply: FastifyReply) {
  return reply.status(503).send({ error: "Account security service is not configured" });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
