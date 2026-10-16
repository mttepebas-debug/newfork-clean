import { describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  setTag: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
  init: sdk.init,
  captureException: sdk.captureException,
  flush: sdk.flush,
  withScope: (callback: (scope: { setTag: typeof sdk.setTag }) => void) =>
    callback({ setTag: sdk.setTag }),
}));

import { initSentry, NO_PERSONAL_DATA, reportServerError, sentryOptions } from "./sentry.js";
type Integration = { name: string };

const DSN = "https://key@o1.ingest.us.sentry.io/3";

describe("sentry", () => {
  it("stays off without a DSN and inside vitest", () => {
    expect(sentryOptions({})).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: " " })).toBeNull();
    expect(sentryOptions({ SENTRY_DSN: DSN, VITEST: "true" })).toBeNull();
  });

  it("sends no personal data and no machine name", () => {
    expect(sentryOptions({ SENTRY_DSN: DSN, APP_ENVIRONMENT: "production" })).toMatchObject({
      dsn: DSN,
      environment: "production",
      dataCollection: NO_PERSONAL_DATA,
      includeServerName: false,
    });
  });

  it("leaves the framework hooks, console breadcrumbs and variable capture out", () => {
    const options = sentryOptions({ SENTRY_DSN: DSN });
    const defaults = ["Http", "Fastify", "Express", "Console", "LocalVariablesAsync", "Dedupe"].map(
      (name) => ({ name }) as Integration,
    );
    const pick = options?.integrations as unknown as (integrations: Integration[]) => Integration[];

    expect(pick(defaults).map((integration) => integration.name)).toEqual(["Http", "Dedupe"]);
  });

  it("turns off every kind of collected request and user data", () => {
    expect((Object.values(NO_PERSONAL_DATA) as unknown[]).includes(true)).toBe(false);
    expect(NO_PERSONAL_DATA.httpBodies).toEqual([]);
    expect(NO_PERSONAL_DATA.stackFrameVariables).toBe(false);
  });

  it("reports nothing before it is started", async () => {
    await reportServerError(new Error("boom"), "req-1");

    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("reports a failed request under its request id and flushes before the reply", async () => {
    expect(initSentry({ SENTRY_DSN: DSN }, sdk.init)).toBe(true);
    const error = new Error("boom");

    await reportServerError(error, "req-2");

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.setTag).toHaveBeenCalledWith("request_id", "req-2");
    expect(sdk.captureException).toHaveBeenCalledWith(error);
    expect(sdk.flush).toHaveBeenCalled();
  });
});
