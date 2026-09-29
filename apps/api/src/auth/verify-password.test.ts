import { describe, expect, it, vi } from "vitest";
import { createPasswordVerifier } from "./verify-password";

const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

function fakeRpc(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: vi.fn(async () => result) };
}

describe("password verifier (SEC-003, BL-283)", () => {
  it("asks the database about this one account's password", async () => {
    const client = fakeRpc({ data: { result: "ok" }, error: null });
    const verify = createPasswordVerifier(client);
    await expect(verify(userId, "pass word ")).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith("verify_account_password_service", {
      target_user_id: userId,
      candidate_password: "pass word ",
    });
  });

  it("refuses a password that is not theirs with 403 and a key", async () => {
    const verify = createPasswordVerifier(fakeRpc({ data: { result: "incorrect" }, error: null }));
    await expect(verify(userId, "not it")).rejects.toMatchObject({
      statusCode: 403,
      reason: "session.password_incorrect",
      message: "Current password is incorrect",
    });
  });

  it("answers 429 with its own key once the account has guessed wrong too often", async () => {
    const verify = createPasswordVerifier(
      fakeRpc({ data: { result: "locked", retry_after_seconds: 420 }, error: null }),
    );
    await expect(verify(userId, "right one")).rejects.toMatchObject({
      statusCode: 429,
      reason: "session.password_attempts_exceeded",
      message: "Too many incorrect passwords. Try again in 7 minutes.",
    });
  });

  // A database that cannot answer says nothing about the password: the person
  // must not read "did not match" for the right one (O-A2).
  it("answers 503, not a wrong password, when the check cannot run", async () => {
    for (const result of [
      { data: null, error: { message: "connection refused" } },
      { data: { result: "something else" }, error: null },
    ]) {
      const verify = createPasswordVerifier(fakeRpc(result));
      const failure = await verify(userId, "right one").catch((e: unknown) => e);
      expect(failure).toMatchObject({ statusCode: 503 });
      expect((failure as { reason?: string }).reason).not.toBe("session.password_incorrect");
    }
  });
});
