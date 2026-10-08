import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerNotificationOutboxRoutes } from "./notification-outbox-routes";
import type { NotificationOutboxBatchResult } from "./notification-outbox-worker";

// BL-965: document maintenance failed every minute for weeks and nothing said so; the batch result
// carried a flag nobody reads. The cron route now writes the failure to the server log.
async function runCron(result: NotificationOutboxBatchResult) {
  const lines: Record<string, unknown>[] = [];
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => lines.push(JSON.parse(line)) } } });
  registerNotificationOutboxRoutes(app, { worker: { runBatch: async () => result }, cronSecret: "s" });
  const response = await app.inject({ method: "POST", url: "/internal/cron/notification-outbox", headers: { authorization: "Bearer s" } });
  await app.close();
  return { response, logged: lines.filter((line) => typeof line.msg === "string" && /maintenance/.test(line.msg as string)) };
}
const delivery = { leased: 0, processed: 0, skipped: 0, retried: 0, dead_lettered: 0, failed: 0 };

describe("notification cron route", () => {
  it("logs a maintenance step that failed, with its message, and still answers 200", async () => {
    const { response, logged } = await runCron({
      ...delivery,
      maintenance: { expired: 0, invalidated: 0, skipped_busy: 0 },
      documentMaintenance: { failed: true, error: 'null value in column "notification_key"' },
    });
    expect(response.statusCode).toBe(200);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: 50, step: "document maintenance", error: 'null value in column "notification_key"' });
    // The message is for the log; the answer keeps its old shape and no internals (app.ts error policy).
    expect(response.json().documentMaintenance).toEqual({ failed: true });
  });

  it("warns when document maintenance skipped cases after errors", async () => {
    const { logged } = await runCron({ ...delivery, documentMaintenance: { checked: 100, enqueued: 3, failed_cases: 2 } });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: 40, failedCases: 2 });
  });

  it("logs nothing when maintenance went well", async () => {
    const { logged } = await runCron({
      ...delivery,
      maintenance: { expired: 1, invalidated: 0, skipped_busy: 0 },
      documentMaintenance: { checked: 100, enqueued: 3, failed_cases: 0 },
    });
    expect(logged).toEqual([]);
  });
});
