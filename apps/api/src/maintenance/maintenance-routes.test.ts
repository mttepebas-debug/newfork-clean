import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerMaintenanceRoutes } from "./maintenance-routes";
import type { MaintenanceBatchResult } from "./maintenance-worker";

// BL-965 moved here with the work (BILDIRIM-01): a failed maintenance step is written to the
// server log with its message; the answer says only { failed: true }.
async function runCron(result: MaintenanceBatchResult, headers = { authorization: "Bearer s" }) {
  const lines: Record<string, unknown>[] = [];
  const app = Fastify({ logger: { level: "info", stream: { write: (line: string) => lines.push(JSON.parse(line)) } } });
  const runBatch = vi.fn(async () => result);
  registerMaintenanceRoutes(app, { worker: { runBatch }, cronSecret: "s" });
  const response = await app.inject({ method: "POST", url: "/internal/cron/maintenance", headers });
  await app.close();
  return { response, runBatch, logged: lines.filter((line) => typeof line.msg === "string" && /maintenance/.test(line.msg as string)) };
}
const healthy: MaintenanceBatchResult = {
  shiftExchanges: { expired: 1, invalidated: 0, skipped_busy: 0 },
  documents: { checked: 100, enqueued: 3, failed_cases: 0, suspended: 1 },
  failed: 0,
};

describe("maintenance cron route", () => {
  it("runs the worker only with the cron secret", async () => {
    const denied = await runCron(healthy, { authorization: "Bearer wrong" });
    expect(denied.response.statusCode).toBe(401);
    expect(denied.runBatch).not.toHaveBeenCalled();

    const { response, runBatch, logged } = await runCron(healthy);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(healthy);
    expect(runBatch).toHaveBeenCalledOnce();
    expect(logged).toEqual([]);
  });

  it("answers 503 when the worker or the secret is missing", async () => {
    const app = Fastify();
    registerMaintenanceRoutes(app, { worker: null, cronSecret: "s" });
    const noWorker = await app.inject({ method: "POST", url: "/internal/cron/maintenance", headers: { authorization: "Bearer s" } });
    expect(noWorker.statusCode).toBe(503);
    await app.close();

    const other = Fastify();
    registerMaintenanceRoutes(other, { worker: { runBatch: async () => healthy } });
    const noSecret = await other.inject({ method: "GET", url: "/internal/cron/maintenance" });
    expect(noSecret.statusCode).toBe(503);
    await other.close();
  });

  it("logs a step that failed, with its message, and still answers 200 without internals", async () => {
    const { response, logged } = await runCron({
      shiftExchanges: { failed: true, error: "shift maintenance unavailable" },
      documents: { failed: true, error: 'null value in column "notification_key"' },
      failed: 2,
    });
    expect(response.statusCode).toBe(200);
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ level: 50, step: "shift exchange maintenance", error: "shift maintenance unavailable" });
    expect(logged[1]).toMatchObject({ level: 50, step: "document maintenance", error: 'null value in column "notification_key"' });
    expect(response.json()).toEqual({ shiftExchanges: { failed: true }, documents: { failed: true }, failed: 2 });
  });

  it("warns when document maintenance skipped cases after errors", async () => {
    const { logged } = await runCron({
      ...healthy,
      documents: { checked: 100, enqueued: 3, failed_cases: 2, suspended: 0 },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ level: 40, failedCases: 2 });
  });
});
