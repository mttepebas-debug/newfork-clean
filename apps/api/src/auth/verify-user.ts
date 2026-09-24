import type { User } from "@supabase/supabase-js";

export type UserVerifier = (accessToken: string) => Promise<User | null>;

interface AuthClient {
  readonly auth: {
    getUser(accessToken: string): Promise<{
      data: { user: User | null };
      error: { status?: number; name?: string } | null;
    }>;
  };
}

// The one place the API asks the auth server whose token this is. A token it
// rejects is null; an auth server that cannot answer is a 503, never "signed
// out". Concurrent checks of one token share a request; nothing is kept after
// it settles.
export function createUserVerifier(client: AuthClient): UserVerifier {
  const verifying = new Map<string, Promise<User | null>>();
  return (accessToken) => {
    if (!accessToken) return Promise.resolve(null);
    let pending = verifying.get(accessToken);
    if (!pending) {
      pending = client.auth
        .getUser(accessToken)
        .then(({ data, error }) => {
          if (
            error &&
            ((error.status ?? 0) >= 500 ||
              error.status === 429 ||
              error.name === "AuthRetryableFetchError")
          ) {
            throw Object.assign(
              new Error("Your session could not be checked. Please try again."),
              { statusCode: 503 },
            );
          }
          return error ? null : (data.user ?? null);
        })
        .finally(() => {
          verifying.delete(accessToken);
        });
      verifying.set(accessToken, pending);
    }
    return pending;
  };
}
