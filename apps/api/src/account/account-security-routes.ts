import { notificationActionSchema } from "@newfork/shared";
import { inboxQuery } from "../communications/communication-routes";
import type { FastifyInstance, FastifyReply } from "fastify";
import { HttpError } from "../http-error.js";
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
  options: { readonly service: AccountSecurityService | null },
) {
  app.get("/v1/account/notification-preferences", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    try { return reply.send(await options.service.getNotificationPreferences(token)); }
    catch (error) { return requestError(reply, error); }
  });
  app.get("/v1/account/notifications", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: "Bearer token required" });
    const query = inboxQuery.safeParse(request.query);
    if (!query.success) return reply.status(400).send({ error: "Valid notification filters required" });
    if (!options.service) return unavailable(reply);
    try { return reply.send(await options.service.getNotifications(token, {
      category: query.data.category, severity: query.data.severity,
      readState: query.data.read_state ?? (query.data.unread_only ? "unread" : null),
      cursor: query.data.cursor, limit: query.data.limit,
    })); } catch (error) { return requestError(reply, error); }
  });
  app.post("/v1/account/notifications/action", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token) return reply.status(401).send({ error: "Bearer token required" });
    const body = notificationActionSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Valid notification action required" });
    if (!options.service) return unavailable(reply);
    try { return reply.send(await options.service.actOnNotification(token, body.data)); }
    catch (error) { return requestError(reply, error); }
  });
  app.get("/v1/account/security", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    try {
      return reply.send(await options.service.getSecurityState(accessToken));
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.post("/v1/account/security/email-change", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = emailChangeBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success)
      return reply.status(400).send({ error: "Valid new email required" });
    if (!options.service) return unavailable(reply);
    try {
      return reply.send(
        await options.service.requestEmailChange(accessToken, body.data.newEmail),
      );
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.post("/v1/account/security/email-change/resend", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    try {
      await options.service.resendEmailChange(accessToken);
      return reply.send({ status: "sent" });
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.delete("/v1/account/security/email-change", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    try {
      await options.service.cancelEmailChange(accessToken);
      return reply.send({ status: "cancelled" });
    } catch (error) {
      return requestError(reply, error);
    }
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
    try {
      await options.service.changePassword(
        accessToken,
        body.data.currentPassword,
        body.data.newPassword,
      );
      return reply.send({ status: "changed" });
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.post("/v1/account/security/sessions/sign-out-others", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = currentPasswordBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success) return passwordRequired(reply);
    if (!options.service) return unavailable(reply);
    try {
      await options.service.signOutOtherSessions(
        accessToken,
        body.data.currentPassword,
      );
      return reply.send({ status: "signed_out" });
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.get("/v1/account/security/deletion/blockers", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service) return unavailable(reply);
    try {
      const blockers = await options.service.getAccountDeletionBlockers(accessToken);
      return reply.send({ blockers });
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.post("/v1/account/security/deletion", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = currentPasswordBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success) return passwordRequired(reply);
    if (!options.service) return unavailable(reply);
    try {
      return reply.send(
        await options.service.requestAccountDeletion(
          accessToken,
          body.data.currentPassword,
        ),
      );
    } catch (error) {
      return requestError(reply, error);
    }
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
      if (!options.service) return unavailable(reply);
      try {
        await options.service.resendAccountDeletionRecovery(body.data.email);
      } catch (error) {
        request.log.error(error);
      }
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

function requestError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "Account security request failed";
  // A typed status wins: it comes from the SQLSTATE the RPC raised, not from
  // the wording of its message. The matching below stays for untyped throws.
  if (error instanceof HttpError)
    return reply.status(error.statusCode).send({
      error: message,
      ...(error.reason ? { reason: error.reason } : {}),
    });
  if (/bearer|session|required|incorrect|password|blocked/i.test(message)) {
    const status = /bearer|session/i.test(message) ? 401 : /blocked/i.test(message) ? 409 : 400;
    return reply.status(status).send({ error: message });
  }
  return reply.status(400).send({ error: message });
}
