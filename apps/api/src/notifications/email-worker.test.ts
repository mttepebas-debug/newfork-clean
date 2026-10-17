import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResendSendError, type sendResendEmail } from "../email/resend-email";
import type { NotificationEmailItem } from "./email-template";
import { createNotificationEmailWorkerWithClient, type NotificationEmailLog } from "./email-worker";

// BILDIRIM-14 (KARARLAR S-130): the cron worker claims due email deliveries, sends each through Resend
// with the delivery's own idempotency key, and says how each went. It stops starting sends well inside
// the function's time and gives back what it had no time for. The address and the key never reach a log.
const key = "re_secret_key_123";

function item(n: number): NotificationEmailItem {
  const id = `98020000-0000-4000-8000-00000000000${n}`;
  return {
    delivery_id: id,
    to: `person${n}@example.test`,
    subject: `Notice ${n}`,
    title: `Notice ${n}`,
    body: `Body ${n}`,
    url: "/app",
    workspace_name: "Meyhouse",
    level: "important",
    topic: "Time off",
    idempotency_key: `notification-delivery/${id}`,
  };
}

function fakeClient(items: unknown[]) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "claim_notification_emails_service") return { data: items, error: null };
      if (fn === "release_notification_emails_service") return { data: (args.target_deliveries as unknown[]).length, error: null };
      return { data: "ok", error: null };
    }),
  };
  const finished = () =>
    calls.filter((c) => c.fn === "finish_notification_email_service").map((c) => [
      c.args.target_delivery,
      c.args.target_outcome,
      c.args.target_provider_id ?? null,
      c.args.target_error ?? null,
    ]);
  const released = () =>
    calls.filter((c) => c.fn === "release_notification_emails_service").map((c) => c.args.target_deliveries);
  return { client, calls, finished, released };
}

function capturingLog() {
  const lines: unknown[] = [];
  const log: NotificationEmailLog = {
    info: (...args: unknown[]) => void lines.push(args),
    error: (...args: unknown[]) => void lines.push(args),
  };
  return { log, text: () => JSON.stringify(lines) };
}

beforeEach(() => {
  // No real send ever leaves a test.
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("the global fetch must not be used");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function worker(items: unknown[], send: ReturnType<typeof vi.fn>, clock = { now: 0 }) {
  const fake = fakeClient(items);
  const pause = vi.fn(async (ms: number) => {
    clock.now += ms;
  });
  const w = createNotificationEmailWorkerWithClient(fake.client, {
    resendApiKey: key,
    from: "Newfork <no-reply@notify.example.test>",
    appUrl: "https://app.example.test",
    send,
    now: () => clock.now,
    pause,
  });
  return { ...fake, w, pause };
}

describe("notification email worker", () => {
  it("claims a batch, sends each with its own key and both parts, and marks it sent", async () => {
    const send = vi.fn(async (_input: Parameters<typeof sendResendEmail>[0]) => ({ id: "re_1" }));
    const { w, calls, finished, pause } = worker([item(1), item(2)], send);
    const { log } = capturingLog();
    const result = await w.runBatch(log);

    expect(calls[0]).toEqual({ fn: "claim_notification_emails_service", args: { target_batch_size: 10 } });
    expect(send).toHaveBeenCalledTimes(2);
    const first = send.mock.calls[0]?.[0];
    if (!first) throw new Error("nothing was sent");
    expect(first.apiKey).toBe(key);
    expect(first.message).toMatchObject({
      from: "Newfork <no-reply@notify.example.test>",
      to: "person1@example.test",
      subject: "Notice 1",
      idempotencyKey: `notification-delivery/${item(1).delivery_id}`,
    });
    expect(first.message.html).toContain("Notice 1");
    expect(first.message.text).toContain("Notice 1");
    expect(finished()).toEqual([
      [item(1).delivery_id, "sent", "re_1", null],
      [item(2).delivery_id, "sent", "re_1", null],
    ]);
    expect(pause).toHaveBeenCalledWith(550);
    expect(result).toEqual({ claimed: 2, sent: 2, retried: 0, dead: 0, released: 0 });
  });

  it("tries again on a busy or broken Resend, and gives up on a refusal", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new ResendSendError("Notification delivery failed", 429))
      .mockRejectedValueOnce(new ResendSendError("Notification delivery failed", 503))
      .mockRejectedValueOnce(new ResendSendError("Notification delivery failed", null, "timeout"))
      .mockRejectedValueOnce(new ResendSendError("Notification delivery failed", 422));
    const { w, finished } = worker([item(1), item(2), item(3), item(4)], send);
    const result = await w.runBatch(capturingLog().log);
    expect(finished()).toEqual([
      [item(1).delivery_id, "retry", null, "http_429"],
      [item(2).delivery_id, "retry", null, "http_503"],
      [item(3).delivery_id, "retry", null, "timeout"],
      [item(4).delivery_id, "dead", null, "http_422"],
    ]);
    expect(result).toMatchObject({ retried: 3, dead: 1 });
  });

  it("starts no send after its time is up and gives the rest back", async () => {
    const clock = { now: 0 };
    const send = vi.fn(async () => {
      clock.now += 3_000;
      return { id: "re_x" };
    });
    const { w, finished, released } = worker([item(1), item(2), item(3), item(4)], send, clock);
    const result = await w.runBatch(capturingLog().log);
    expect(send).toHaveBeenCalledTimes(2);
    expect(finished().map(([id, outcome]) => [id, outcome])).toEqual([
      [item(1).delivery_id, "sent"],
      [item(2).delivery_id, "sent"],
    ]);
    // What it had no time for goes back in one call.
    expect(released()).toEqual([[item(3).delivery_id, item(4).delivery_id]]);
    expect(result).toMatchObject({ sent: 2, released: 2 });
  });

  it("never writes the address or the key to its log", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ id: "re_1" })
      .mockRejectedValueOnce(new ResendSendError("Notification delivery failed", 500))
      .mockRejectedValueOnce(new Error("socket hang up for person3@example.test"));
    const { w } = worker([item(1), item(2), item(3)], send);
    const { log, text } = capturingLog();
    await w.runBatch(log);
    expect(text()).not.toContain("@example.test");
    expect(text()).not.toContain(key);
    expect(text()).toContain(item(2).delivery_id);
  });

  it("an unknown failure is a network retry, never its message", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND api.resend.com"));
    const { w, finished } = worker([item(1)], send);
    await w.runBatch(capturingLog().log);
    expect(finished()).toEqual([[item(1).delivery_id, "retry", null, "network"]]);
  });

  it("asks the time left again after its wait between sends", async () => {
    const clock = { now: 0 };
    const send = vi.fn(async () => {
      clock.now += 4_600;
      return { id: "re_x" };
    });
    // After the first send 2.4 s are left; the 550 ms wait leaves 1.85 s, too little to start another.
    const { w, released } = worker([item(1), item(2)], send, clock);
    await w.runBatch(capturingLog().log);
    expect(send).toHaveBeenCalledTimes(1);
    expect(released()).toEqual([[item(2).delivery_id]]);
  });

  it("finishes a row it cannot read as dead and still sends the others", async () => {
    const send = vi.fn(async () => ({ id: "re_ok" }));
    const broken = { ...item(2), url: "https://elsewhere.example.test/", level: "loud" };
    const nameless = { to: "x@example.test" };
    const { w, finished } = worker([item(1), broken, nameless, item(3)], send);
    const { log, text } = capturingLog();
    const result = await w.runBatch(log);
    expect(finished()).toEqual([
      [item(1).delivery_id, "sent", "re_ok", null],
      [item(2).delivery_id, "dead", null, "bad_item"],
      [item(3).delivery_id, "sent", "re_ok", null],
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ claimed: 4, sent: 2, dead: 1 });
    expect(text()).not.toContain("@example.test");
  });

  it("refuses a link with a control character, as the table does", async () => {
    const send = vi.fn(async () => ({ id: "re_ok" }));
    const { w, finished } = worker([{ ...item(1), url: "/app\tx" }], send);
    await w.runBatch(capturingLog().log);
    expect(finished()).toEqual([[item(1).delivery_id, "dead", null, "bad_item"]]);
    expect(send).not.toHaveBeenCalled();
  });
});
