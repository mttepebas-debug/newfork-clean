import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotificationPushWorkerWithClient, PushSendError, type PushSend } from "./push-worker";
import type { NotificationEmailLog } from "./email-worker";

// BILDIRIM-15 (KARARLAR S-138): the cron worker claims due push deliveries and sends each to the person's
// devices that have not taken it yet, then says, device by device, how each push service answered. It
// starts nothing once the run's time is up and gives back what it had no time for. No address, key or
// alert text ever reaches a log.
const appUrl = "https://app.newfork.test";

function target(n: number) {
  return {
    subscription_id: `98150000-0000-4000-8000-00000000000${n}`,
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
    p256dh: "B" + String(n).repeat(86),
    auth: String(n).repeat(22),
  };
}

function item(n: number, targets = [target(1)]) {
  return {
    delivery_id: `98150000-0000-4000-8000-0000000000a${n}`,
    ttl: 86_000,
    urgency: "high",
    topic: `topic${n}`.padEnd(32, "0"),
    payload: { title: `Notice ${n}`, body: "Meyhouse · Now 9:00 AM–3:00 PM.", url: "/app/requests", tag: `tag-${n}` },
    targets,
  };
}

function fakeClient(items: unknown[], finishAnswer = "sent") {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "claim_notification_push_service") return { data: items, error: null };
      if (fn === "release_notification_push_service") return { data: (args.target_deliveries as unknown[]).length, error: null };
      return { data: finishAnswer, error: null };
    }),
  };
  const finished = () =>
    calls.filter((c) => c.fn === "finish_notification_push_service").map((c) => [c.args.target_delivery, c.args.target_results]);
  const released = () => calls.filter((c) => c.fn === "release_notification_push_service").map((c) => c.args.target_deliveries);
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
  // No real push ever leaves a test.
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("the global fetch must not be used");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function worker(items: unknown[], send: PushSend, clock = { now: 0 }, finishAnswer = "sent") {
  const fake = fakeClient(items, finishAnswer);
  const push = createNotificationPushWorkerWithClient(fake.client, { appUrl, send, now: () => clock.now });
  return { ...fake, push };
}

const accepted: PushSend = async () => ({ status: 201, retryAfter: null });

describe("notification push worker", () => {
  it("sends eight deliveries at once at most, and works to the dispatcher's deadline (BILDIRIM-DAGITICI)", async () => {
    let open = 0;
    let most = 0;
    const send: PushSend = async () => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((resolve) => setTimeout(resolve, 5));
      open -= 1;
      return { status: 201, retryAfter: null };
    };
    const items = Array.from({ length: 9 }, (_, n) => item(n + 1));
    const { push, finished } = worker(items, send);
    const result = await push.runBatch(capturingLog().log, 60_000);
    expect(most).toBe(8);
    expect(finished()).toHaveLength(9);
    expect(result).toMatchObject({ claimed: 9, sent: 9, released: 0 });
  });

  it("sends each device the alert in the declarative shape, for the day, urgent, under its topic", async () => {
    const send = vi.fn(accepted);
    const { push, finished } = worker([item(1, [target(1), target(2)])], send);
    const result = await push.runBatch(capturingLog().log);

    expect(send).toHaveBeenCalledTimes(2);
    const [to, payload, options] = send.mock.calls[0]!;
    expect(to).toEqual({ endpoint: target(1).endpoint, keys: { p256dh: target(1).p256dh, auth: target(1).auth } });
    expect(JSON.parse(payload)).toEqual({
      web_push: 8030,
      notification: {
        title: "Notice 1",
        body: "Meyhouse · Now 9:00 AM–3:00 PM.",
        navigate: "https://app.newfork.test/app/requests",
        tag: "tag-1",
        lang: "en-US",
      },
    });
    expect(options).toMatchObject({ ttl: 86_000, urgency: "high", topic: "topic1".padEnd(32, "0") });
    expect(options.timeoutMs).toBeLessThanOrEqual(3_000);
    expect(finished()).toEqual([
      [item(1).delivery_id, [
        { subscription_id: target(1).subscription_id, outcome: "accepted", code: null, retry_after: null },
        { subscription_id: target(2).subscription_id, outcome: "accepted", code: null, retry_after: null },
      ]],
    ]);
    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, dead: 0, released: 0 });
  });

  it("names each push service's answer: taken, gone, too large, refused, wait", async () => {
    const answers: Record<string, Awaited<ReturnType<PushSend>> | Error> = {
      [target(1).endpoint]: { status: 410, retryAfter: null },
      [target(2).endpoint]: { status: 404, retryAfter: null },
      [target(3).endpoint]: { status: 403, retryAfter: null },
      [target(4).endpoint]: { status: 429, retryAfter: 120 },
      [target(5).endpoint]: { status: 503, retryAfter: null },
      [target(6).endpoint]: new PushSendError("timeout"),
      [target(7).endpoint]: new Error("socket hang up at fcm.googleapis.com/fcm/send/device-7"),
      [target(8).endpoint]: { status: 413, retryAfter: null },
    };
    const send: PushSend = async (to) => {
      const answer = answers[to.endpoint]!;
      if (answer instanceof Error) throw answer;
      return answer;
    };
    const targets = [1, 2, 3, 4, 5, 6, 7, 8].map(target);
    const { push, finished } = worker([item(1, targets)], send, { now: 0 }, "failed");
    const { log, text } = capturingLog();
    const result = await push.runBatch(log);

    expect(finished()[0]![1]).toEqual([
      { subscription_id: target(1).subscription_id, outcome: "gone", code: "http_410", retry_after: null },
      { subscription_id: target(2).subscription_id, outcome: "gone", code: "http_404", retry_after: null },
      { subscription_id: target(3).subscription_id, outcome: "refused", code: "http_403", retry_after: null },
      { subscription_id: target(4).subscription_id, outcome: "retry", code: "http_429", retry_after: 120 },
      { subscription_id: target(5).subscription_id, outcome: "retry", code: "http_503", retry_after: null },
      { subscription_id: target(6).subscription_id, outcome: "retry", code: "timeout", retry_after: null },
      { subscription_id: target(7).subscription_id, outcome: "retry", code: "network", retry_after: null },
      { subscription_id: target(8).subscription_id, outcome: "too_large", code: "http_413", retry_after: null },
    ]);
    expect(result).toEqual({ claimed: 1, sent: 0, retried: 1, dead: 0, released: 0 });
    // Neither an address, a key nor the alert's words reach a log.
    expect(text()).not.toMatch(/fcm\.googleapis|device-|BBBB|1111|Notice 1|Meyhouse/);
  });

  it("never sends an alert too large for the push services", async () => {
    const send = vi.fn(accepted);
    const big = { ...item(1), payload: { ...item(1).payload, body: "é".repeat(2000) } };
    const { push, finished } = worker([big], send, { now: 0 }, "dead");
    const result = await push.runBatch(capturingLog().log);
    expect(send).not.toHaveBeenCalled();
    expect(finished()[0]![1]).toEqual([{ subscription_id: target(1).subscription_id, outcome: "too_large", code: "payload_too_large", retry_after: null }]);
    expect(result.dead).toBe(1);
  });

  it("starts nothing once the run's time is up and gives the rest back in one call", async () => {
    const clock = { now: 0 };
    const send: PushSend = async () => {
      clock.now += 2_500;
      return { status: 201, retryAfter: null };
    };
    const { push, finished, released } = worker([item(1), item(2), item(3), item(4)], send, clock);
    const result = await push.runBatch(capturingLog().log);
    expect(finished().map(([id]) => id)).toEqual([item(1).delivery_id, item(2).delivery_id]);
    expect(released()).toEqual([[item(3).delivery_id, item(4).delivery_id]]);
    expect(result).toEqual({ claimed: 4, sent: 2, retried: 0, dead: 0, released: 2 });
  });

  it("a row it cannot read stops nothing: with an id it is finished with no device reached", async () => {
    const send = vi.fn(accepted);
    const { push, finished } = worker([{ delivery_id: item(9).delivery_id, ttl: "soon" }, { nonsense: true }, item(1)], send, { now: 0 }, "dead");
    const { log, text } = capturingLog();
    await push.runBatch(log);
    expect(finished().map(([id, results]) => [id, results])).toEqual([
      [item(9).delivery_id, []],
      [item(1).delivery_id, [{ subscription_id: target(1).subscription_id, outcome: "accepted", code: null, retry_after: null }]],
    ]);
    expect(text()).toContain("bad_item");
  });

  it("never sends to an address that is not a push service's, even from the database", async () => {
    const send = vi.fn(accepted);
    const fake = { ...target(2), endpoint: "https://evil.example/collect" };
    const lookalike = { ...target(3), endpoint: "https://fcm.googleapis.com.evil.com/x" };
    const { push, finished } = worker([item(1, [target(1), fake, lookalike])], send);
    await push.runBatch(capturingLog().log);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].endpoint).toBe(target(1).endpoint);
    expect(finished()[0]![1]).toEqual([
      { subscription_id: target(1).subscription_id, outcome: "accepted", code: null, retry_after: null },
      { subscription_id: target(2).subscription_id, outcome: "refused", code: "bad_endpoint", retry_after: null },
      { subscription_id: target(3).subscription_id, outcome: "refused", code: "bad_endpoint", retry_after: null },
    ]);
  });

  it("refuses a link that leaves the app", async () => {
    const send = vi.fn(accepted);
    const outside = { ...item(1), payload: { ...item(1).payload, url: "//evil.example/x" } };
    const { push, finished } = worker([outside], send, { now: 0 }, "dead");
    await push.runBatch(capturingLog().log);
    expect(send).not.toHaveBeenCalled();
    expect(finished()).toEqual([[item(1).delivery_id, []]]);
  });

  it("says a failed claim or release plainly", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })) };
    const push = createNotificationPushWorkerWithClient(client, { appUrl, send: accepted });
    await expect(push.runBatch(capturingLog().log)).rejects.toThrow("claim failed");
  });
});
