import { describe, expect, it, vi } from "vitest";
import { createPasswordVerifier } from "./verify-password";

function fakeClient(result: {
  error: { message: string; status?: number; name?: string } | null;
  session: object | null;
}) {
  const signOut = vi.fn(async () => ({ error: null }));
  const signInWithPassword = vi.fn(async () => ({
    data: { session: result.session },
    error: result.error,
  }));
  return { client: { auth: { signInWithPassword, signOut } }, signInWithPassword, signOut };
}

describe("password verifier (SEC-003)", () => {
  it("signs in with the password on a throwaway client, then drops that session", async () => {
    const fake = fakeClient({ error: null, session: { access_token: "t" } });
    const verify = createPasswordVerifier(() => fake.client);
    await expect(verify("owner@example.test", "pass word ")).resolves.toBeUndefined();
    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: "pass word ",
    });
    expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("refuses a password that is not theirs with 403 and a key", async () => {
    for (const result of [
      { error: { message: "Invalid login credentials" }, session: null },
      { error: null, session: null },
    ]) {
      const fake = fakeClient(result);
      const verify = createPasswordVerifier(() => fake.client);
      await expect(verify("owner@example.test", "not it")).rejects.toMatchObject({
        statusCode: 403,
        reason: "session.password_incorrect",
        message: "Current password is incorrect",
      });
      expect(fake.signOut).not.toHaveBeenCalled();
    }
  });

  // An auth server that cannot answer says nothing about the password: the
  // person must not read "did not match" for the right one (O-A2).
  it("answers 503, not a wrong password, when the auth server cannot answer", async () => {
    for (const error of [
      { message: "Too many requests", status: 429 },
      { message: "Bad gateway", status: 502 },
      { message: "fetch failed", status: 0, name: "AuthRetryableFetchError" },
    ]) {
      const fake = fakeClient({ error, session: null });
      const verify = createPasswordVerifier(() => fake.client);
      const failure = await verify("owner@example.test", "right one").catch((e: unknown) => e);
      expect(failure, error.message).toMatchObject({ statusCode: 503 });
      expect((failure as { reason?: string }).reason).not.toBe("session.password_incorrect");
    }
  });
});
