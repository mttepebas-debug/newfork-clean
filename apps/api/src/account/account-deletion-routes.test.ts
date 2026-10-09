import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAccountDeletionRoutes } from "./account-deletion-routes";

describe("account deletion cron route", () => {
  it("requires the shared cron secret", async () => {
    const runBatch = vi.fn(async () => ({
      checked: 0,
      reminded: 0,
      finalized: 0,
      failed: 0,
    }));
    const app = Fastify();
    registerAccountDeletionRoutes(app, {
      worker: { runBatch },
      cronSecret: "cron-secret",
    });
    await app.ready();

    const denied = await app.inject({
      method: "POST",
      url: "/internal/cron/account-deletion",
      headers: { authorization: "Bearer wrong" },
    });
    expect(denied.statusCode).toBe(401);
    expect(runBatch).not.toHaveBeenCalled();

    const accepted = await app.inject({
      method: "POST",
      url: "/internal/cron/account-deletion",
      headers: { authorization: "Bearer cron-secret" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(runBatch).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
