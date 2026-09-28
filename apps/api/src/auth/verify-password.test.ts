import { describe, expect, it, vi } from "vitest";
import { createPasswordVerifier } from "./verify-password";

function fakeClient(result: { error: { message: string } | null; session: object | null }) {
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
});
