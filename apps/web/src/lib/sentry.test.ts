import { describe, expect, it, vi } from "vitest";

import { initSentry, NO_PERSONAL_DATA, sentryOptions, STALE_BUILD_CHUNK_FINGERPRINT } from "./sentry";

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

  it("files every old-build chunk failure under one issue, whatever file or browser it names", () => {
    const options = sentryOptions({ VITE_SENTRY_DSN: DSN, MODE: "production" });
    const send = (type: string, value: string) =>
      (options?.beforeSend as (event: unknown, hint: unknown) => { fingerprint?: string[] } | null)(
        { exception: { values: [{ type, value }] } },
        {},
      );
    const failures: Array<[string, string]> = [
      ["TypeError", "Failed to fetch dynamically imported module: https://www.tepebash.com/assets/SchedulePage-CyXlRb3F.js"],
      ["TypeError", "Failed to fetch dynamically imported module: https://www.tepebash.com/assets/WorkspacePage-CnTjQFNY.js"],
      ["TypeError", "Importing a module script failed."],
      ["TypeError", "error loading dynamically imported module: https://www.tepebash.com/assets/LineupPage-x.js"],
      ["TypeError", "'text/html' is not a valid JavaScript MIME type."],
      ["Error", "Unable to preload CSS for /assets/us-text-D6aAZO57.css"],
    ];

    for (const [type, value] of failures) {
      expect(send(type, value)?.fingerprint).toEqual([STALE_BUILD_CHUNK_FINGERPRINT]);
    }
  });

  it("leaves every other error grouped by Sentry as usual", () => {
    const options = sentryOptions({ VITE_SENTRY_DSN: DSN, MODE: "production" });
    const event = { exception: { values: [{ type: "TypeError", value: "Cannot read properties of null (reading 'id')" }] } };

    const sent = (options?.beforeSend as (event: unknown, hint: unknown) => typeof event | null)(event, {});

    expect(sent).toBe(event);
    expect(sent).not.toHaveProperty("fingerprint");
  });

  it("starts the SDK once a DSN is set", () => {
    const init = vi.fn();

    expect(initSentry({ VITE_SENTRY_DSN: DSN, MODE: "production" }, init)).toBe(true);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({ dsn: DSN }));
  });
});
