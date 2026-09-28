import { HttpError } from "../http-error";

interface SignInClient {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): PromiseLike<{
      data: { session: unknown };
      error: { message: string } | null;
    }>;
    signOut(options: { scope: "local" }): PromiseLike<unknown>;
  };
}

/**
 * Proves the person at the keyboard knows the account's password (SEC-003):
 * signs in with it on a throwaway client and drops that session again. A wrong
 * password is 403 session.password_incorrect, so every screen that asks for
 * the password answers the same key. `makeClient` returns a fresh anon client
 * each call, e.g. `() => createClient(url, anonKey, { auth: { persistSession: false } })`.
 */
export function createPasswordVerifier(makeClient: () => SignInClient) {
  return async (email: string, password: string): Promise<void> => {
    const client = makeClient();
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error || !result.data.session)
      throw new HttpError("Current password is incorrect", 403, {
        reason: "session.password_incorrect",
      });
    await client.auth.signOut({ scope: "local" });
  };
}
