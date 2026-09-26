import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPasswordResetSender,
  registerPasswordResetRoutes,
  type PasswordResetSender,
} from "./password-reset";

const url = "/v1/auth/password-reset";
const known = "known@example.test";
const unknown = "nobody@example.test";

// generateLink as supabase-js answers it: a hashed token for an account, an
// error for an address nobody owns.
function fakeAdmin() {
  return {
    generateLink: vi.fn(async (params: { type: string; email: string }) =>
      params.email === known
        ? {
            data: { properties: { hashed_token: "hashed-token-1" }, user: {} },
            error: null,
          }
        : { data: { properties: null, user: null }, error: new Error("User not found") },
    ),
  };
}

async function appWith(
  send: PasswordResetSender | null,
  extra: { responseFloorMs?: number; now?: () => number } = {},
) {
  const app = Fastify();
  registerPasswordResetRoutes(app, {
    send,
    responseFloorMs: extra.responseFloorMs ?? 0,
    now: extra.now,
  });
  await app.ready();
  return app;
}

const post = (
  app: Awaited<ReturnType<typeof appWith>>,
  email: unknown,
  ip = "203.0.113.7",
) =>
  app.inject({
    method: "POST",
    url,
    headers: { "x-real-ip": ip },
    payload: { email },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("password reset request", () => {
  it("answers a known and an unknown email with the same status and body", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const send = createPasswordResetSender({
      admin: fakeAdmin(),
      appUrl: "http://app.test/",
      resendApiKey: "re_test",
    });
    const app = await appWith(send);

    const forKnown = await post(app, known);
    const forUnknown = await post(app, unknown);

    expect(forKnown.statusCode).toBe(202);
    expect(forUnknown.statusCode).toBe(forKnown.statusCode);
    expect(forUnknown.body).toBe(forKnown.body);
    expect(forKnown.json()).toEqual({ status: "accepted" });
    await app.close();
  });

  it("does not answer before the fixed floor, however fast or slow the send is", async () => {
    const never = vi.fn(() => new Promise<void>(() => undefined));
    const instant = vi.fn(async () => undefined);

    for (const send of [never, instant]) {
      const app = await appWith(send, { responseFloorMs: 60 });
      const started = performance.now();
      const response = await post(app, known);
      const elapsed = performance.now() - started;
      expect(response.statusCode).toBe(202);
      expect(elapsed).toBeGreaterThanOrEqual(55);
      expect(elapsed).toBeLessThan(1_000);
      await app.close();
    }
  });

  it("hides a failed send behind the same answer", async () => {
    const send = vi.fn(async () => {
      throw new Error("Resend is down");
    });
    const app = await appWith(send);
    const response = await post(app, known);
    expect(response.statusCode).toBe(202);
    expect(response.body).not.toContain("Resend");
    await app.close();
  });

  it("rejects a missing or malformed email without calling the sender", async () => {
    const send = vi.fn(async () => undefined);
    const app = await appWith(send);
    for (const email of [undefined, "", "not-an-email", "a".repeat(330) + "@x.test"]) {
      const response = await post(app, email);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "Valid email required" });
    }
    expect(send).not.toHaveBeenCalled();
    await app.close();
  });

  it("says the service is unavailable when it is not configured", async () => {
    const app = await appWith(null);
    expect((await post(app, known)).statusCode).toBe(503);
    await app.close();
  });

  it("limits one email to three requests an hour, the same way whether or not it has an account", async () => {
    let clock = 1_000_000;
    const send = vi.fn(async () => undefined);
    const app = await appWith(send, { now: () => clock });

    for (const email of [known, unknown]) {
      for (let attempt = 0; attempt < 3; attempt += 1)
        expect((await post(app, email, `198.51.100.${attempt}`)).statusCode).toBe(202);
      const limited = await post(app, email.toUpperCase(), "198.51.100.99");
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: "Too many reset requests. Try again later.",
      });
    }
    expect(send).toHaveBeenCalledTimes(6);

    clock += 60 * 60 * 1000;
    expect((await post(app, known)).statusCode).toBe(202);
    await app.close();
  });

  it("limits one address to ten requests an hour across emails", async () => {
    const send = vi.fn(async () => undefined);
    const app = await appWith(send, { now: () => 5_000 });
    for (let index = 0; index < 10; index += 1)
      expect((await post(app, `person${index}@example.test`)).statusCode).toBe(202);
    expect((await post(app, "person10@example.test")).statusCode).toBe(429);
    expect((await post(app, "person10@example.test", "192.0.2.1")).statusCode).toBe(202);
    await app.close();
  });
});

describe("password reset sender", () => {
  it("emails a known account a reset link built from the recovery token hash", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const admin = fakeAdmin();
    const send = createPasswordResetSender({
      admin,
      appUrl: "http://app.test/",
      resendApiKey: "re_test",
      emailFrom: "Newfork <security@newfork.test>",
    });

    await send(known);

    expect(admin.generateLink).toHaveBeenCalledWith({ type: "recovery", email: known });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [target, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body)) as { to: string[]; html: string; from: string };
    expect(body.to).toEqual([known]);
    expect(body.from).toBe("Newfork <security@newfork.test>");
    expect(body.html).toContain(
      "http://app.test/reset-password?token_hash=hashed-token-1",
    );
    expect(body.html).toContain("1 hour");
  });

  it("sends nothing for an email without an account", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const send = createPasswordResetSender({
      admin: fakeAdmin(),
      appUrl: "http://app.test",
      resendApiKey: "re_test",
    });
    await expect(send(unknown)).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips delivery without a Resend key outside production and fails loudly in production", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      createPasswordResetSender({ admin: fakeAdmin(), appUrl: "http://app.test" })(known),
    ).resolves.toBeUndefined();
    await expect(
      createPasswordResetSender({
        admin: fakeAdmin(),
        appUrl: "http://app.test",
        production: true,
      })(known),
    ).rejects.toThrow("not configured");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("throws when Resend refuses the message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const send = createPasswordResetSender({
      admin: fakeAdmin(),
      appUrl: "http://app.test",
      resendApiKey: "re_test",
    });
    await expect(send(known)).rejects.toThrow("(500)");
  });
});
