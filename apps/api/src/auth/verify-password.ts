import { HttpError } from "../http-error";

interface SignInClient {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): PromiseLike<{
      data: { session: unknown };
      error: { message: string; status?: number; name?: string } | null;
    }>;
    signOut(options: { scope: "local" }): PromiseLike<unknown>;
  };
}

/**
 * Proves the person at the keyboard knows the account's password (SEC-003):
 * signs in with it on a throwaway client and drops that session again. A wrong
 * password is 403 session.password_incorrect, so every screen that asks for
 * the password answers the same key. An auth server that cannot answer (429,
 * 5xx, network) is 503, like verify-user.ts: it says nothing about the
 * password. `makeClient` returns a fresh anon client each call, e.g.
 * `() => createClient(url, anonKey, { auth: { persistSession: false } })`.
 */
export function createPasswordVerifier(makeClient: () => SignInClient) {
  return async (email: string, password: string): Promise<void> => {
    const client = makeClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (
      error &&
      ((error.status ?? 0) >= 500 ||
        error.status === 429 ||
        error.name === "AuthRetryableFetchError")
    )
      throw new HttpError("Your password could not be checked. Please try again.", 503);
    if (error || !data.session)
      throw new HttpError("Current password is incorrect", 403, {
        reason: "session.password_incorrect",
      });
    await client.auth.signOut({ scope: "local" });
  };
}
