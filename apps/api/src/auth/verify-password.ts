import { z } from "zod";
import { HttpError } from "../http-error";

interface PasswordCheckClient {
  rpc(
    name: "verify_account_password_service",
    args: { target_user_id: string; candidate_password: string },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const answerSchema = z.discriminatedUnion("result", [
  z.object({ result: z.literal("ok") }),
  z.object({ result: z.literal("incorrect") }),
  z.object({ result: z.literal("locked"), retry_after_seconds: z.number().int().positive() }),
]);

/**
 * Proves the person at the keyboard knows the account's password (SEC-003).
 * The database checks it against the stored hash and counts wrong guesses per
 * account (BL-283): five in fifteen minutes lock that account's checks, and
 * nobody else's, because no check draws on Supabase Auth's shared per-address
 * bucket. A wrong password is 403 session.password_incorrect, a locked account
 * 429 session.password_attempts_exceeded; a check that cannot run is 503 and
 * says nothing about the password. `client` is a service-role Supabase client.
 */
export function createPasswordVerifier(client: PasswordCheckClient) {
  return async (userId: string, password: string): Promise<void> => {
    const { data, error } = await client.rpc("verify_account_password_service", {
      target_user_id: userId,
      candidate_password: password,
    });
    const answer = answerSchema.safeParse(data);
    if (error || !answer.success)
      throw new HttpError("Your password could not be checked. Please try again.", 503);
    if (answer.data.result === "locked") {
      const minutes = Math.ceil(answer.data.retry_after_seconds / 60);
      throw new HttpError(
        `Too many incorrect passwords. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        429,
        { reason: "session.password_attempts_exceeded" },
      );
    }
    if (answer.data.result === "incorrect")
      throw new HttpError("Current password is incorrect", 403, {
        reason: "session.password_incorrect",
      });
  };
}
