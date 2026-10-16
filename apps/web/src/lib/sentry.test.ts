import { describe, expect, it, vi } from "vitest";

import { initSentry, NO_PERSONAL_DATA, sentryOptions } from "./sentry";

const DSN = "https://key@o1.ingest.us.sentry.io/2";

describe("sentry", () => {
  it("stays off without a DSN, so local runs, tests and CI send nothing", () => {
    const init = vi.fn();

    expect(sentryOptions({ VITE_SENTRY_DSN: "  ", MODE: "production" })).toBeNull();
    expect(initSentry({ MODE: "production" }, init)).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("sends no personal data and samples one request in ten", () => {
    const options = sentryOptions({ VITE_SENTRY_DSN: DSN, MODE: "production" });

    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      dataCollection: NO_PERSONAL_DATA,
      tracesSampleRate: 0.1,
    });
  });

  it("turns off every kind of collected request and user data", () => {
    expect((Object.values(NO_PERSONAL_DATA) as unknown[]).includes(true)).toBe(false);
    expect(NO_PERSONAL_DATA.httpBodies).toEqual([]);
    expect(NO_PERSONAL_DATA.userInfo).toBe(false);
  });

  it("records no screen sessions", () => {
    const options = sentryOptions({ VITE_SENTRY_DSN: DSN, MODE: "production" });
    const integrations = Array.isArray(options?.integrations) ? options.integrations : [];
    const names = integrations.map((integration) => integration.name);

    expect(names).not.toContain("Replay");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
  });

  it("starts the SDK once a DSN is set", () => {
    const init = vi.fn();

    expect(initSentry({ VITE_SENTRY_DSN: DSN, MODE: "production" }, init)).toBe(true);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN }));
  });
});
