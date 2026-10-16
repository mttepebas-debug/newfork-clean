import * as Sentry from "@sentry/react";

type SentryEnv = { readonly VITE_SENTRY_DSN?: string; readonly MODE?: string };

/**
 * Sentry collects user details, cookies, headers, bodies, query strings and
 * local variable values by default. Every screen and request here carries
 * employee details, so all of it stays home; only the error and its stack go.
 */
export const NO_PERSONAL_DATA = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies Sentry.BrowserOptions["dataCollection"];

/**
 * Error reporting is on only where a DSN is set (the hosted build). Local runs,
 * tests and CI have none, so their failures never reach Sentry. No personal
 * data (see NO_PERSONAL_DATA) and no screen recording.
 */
export function sentryOptions(env: SentryEnv): Sentry.BrowserOptions | null {
  const dsn = env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return null;
  return {
    dsn,
    environment: env.MODE ?? "production",
    dataCollection: NO_PERSONAL_DATA,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  };
}

export function initSentry(
  env: SentryEnv = import.meta.env,
  init: (options: Sentry.BrowserOptions) => unknown = Sentry.init,
): boolean {
  const options = sentryOptions(env);
  if (!options) return false;
  init(options);
  return true;
}
