import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendResendEmail } from "../email/resend-email.js";

// BL-137: "Forgot password?" on the sign-in screen. A person types an email;
// if an account owns it, a one-hour, one-time reset link goes out through
// Resend (the same road as invitations). The answer never says which case it
// was: same status, same body, same time.

export type PasswordResetSender = (email: string, signal: AbortSignal) => Promise<void>;

/**
 * The database's answer to "may a reset email go?" (BL-162), given sha256 hex
 * digests of the email and the caller's address: "send", "quiet" (one went in
 * the last fifteen minutes; its link stays valid) or "address_limited" (ten
 * from this caller in the last hour). Counted in the database, not per server
 * instance. See claim_password_reset_send_service.
 */
export type PasswordResetClaim = (
  emailDigest: string,
  addressDigest: string,
) => Promise<"send" | "quiet" | "address_limited">;

interface RecoveryLinkAdmin {
  generateLink(params: { type: "recovery"; email: string }): PromiseLike<{
    data: { properties: { hashed_token: string } | null } | null;
    error: unknown;
  }>;
}

const requestBody = z.object({ email: z.string().trim().email().max(320) });

// Every answer leaves at the floor. The send (generateLink + Resend) gets the
// budget, which is under the floor, so an account's existence never shows as
// time; a send still running at the budget is aborted and logged.
const defaultResponseFloorMs = 1_500;
const defaultSendBudgetMs = 1_200;

export function registerPasswordResetRoutes(
  app: FastifyInstance,
  options: {
    readonly send: PasswordResetSender | null;
    readonly claim: PasswordResetClaim | null;
    readonly responseFloorMs?: number;
    readonly sendBudgetMs?: number;
  },
) {
  const floorMs = options.responseFloorMs ?? defaultResponseFloorMs;
  const budgetMs = options.sendBudgetMs ?? defaultSendBudgetMs;
  app.post("/v1/auth/password-reset", async (request, reply) => {
    const body = requestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Valid email required" });
    if (!options.send || !options.claim)
      return reply.status(503).send({ error: "Password reset is not available" });
    const send = options.send;

    const email = body.data.email.toLowerCase();
    // Vercel sets x-real-ip to the caller's address; locally it is the socket.
    const realIp = request.headers["x-real-ip"];
    const address = (typeof realIp === "string" && realIp) || request.ip;
    const claim = await options.claim(digest(email), digest(address));
    if (claim === "address_limited")
      return reply
        .status(429)
        .header("retry-after", "3600")
        .send({ error: "Too many reset requests. Try again later." });

    // The send is awaited (Vercel may freeze the function once the answer is
    // out), but only for sendBudgetMs, which sits under the floor: every answer
    // then leaves at the floor, account or not. Logs never carry the email.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    const cutOff = new Promise<never>((_resolve, reject) =>
      controller.signal.addEventListener("abort", () =>
        reject(new Error("Password reset delivery timed out")),
      ),
    );
    const delivery = (claim === "send"
      ? Promise.race([send(email, controller.signal), cutOff])
      : Promise.resolve())
      .catch((error: unknown) => {
        request.log.error({ err: error }, "password reset delivery failed");
      })
      .finally(() => clearTimeout(timer));
    await Promise.all([delivery, new Promise((resolve) => setTimeout(resolve, floorMs))]);
    return reply.status(202).send({ status: "accepted" });
  });
}

export function createPasswordResetSender(options: {
  readonly admin: RecoveryLinkAdmin;
  readonly appUrl: string;
  readonly resendApiKey?: string;
  readonly emailFrom?: string;
  readonly production?: boolean;
}): PasswordResetSender {
  return async (email, signal) => {
    const { data, error } = await options.admin.generateLink({ type: "recovery", email });
    const tokenHash = data?.properties?.hashed_token;
    // No account for this email: nothing to send, and nothing to say.
    if (error || !tokenHash) return;

    if (!options.resendApiKey) {
      if (options.production) throw new Error("Password reset delivery is not configured");
      return;
    }
    // The token rides in the fragment: a browser never sends it to a server,
    // so it cannot land in an access log.
    const link = `${options.appUrl.replace(/\/$/, "")}/reset-password#token_hash=${encodeURIComponent(tokenHash)}`;
    await sendResendEmail({
      apiKey: options.resendApiKey,
      failure: "Password reset delivery failed",
      signal,
      message: {
        from: options.emailFrom ?? "Newfork <security@newfork.app>",
        to: email,
        subject: "Reset your Newfork password",
        html: `<p>Someone asked to reset the password for this Newfork account.</p><p><a href="${escapeHtml(link)}">Choose a new password</a></p><p>This link works once and expires in 1 hour. If you did not ask for it, you can ignore this email.</p>`,
      },
    });
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
