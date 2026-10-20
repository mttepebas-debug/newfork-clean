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
    beforeSend: groupStaleBuildChunks,
  };
}

export const STALE_BUILD_CHUNK_FINGERPRINT = "stale-build-chunk";

// A tab left on an old build asks for chunk files the new deploy renamed
// (stale-chunk-reload.ts reloads it). Each deploy names new files, so Sentry
// opened a new issue, and sent a new email, for every one. One fingerprint
// keeps them in one issue that still counts every time it happens.
const STALE_BUILD_CHUNK_MESSAGES = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /Importing a module script failed/i, // Safari
  /error loading dynamically imported module/i, // Firefox
  /is not a valid JavaScript MIME type/i, // Safari, index.html served for a gone chunk
  /Unable to preload CSS/i, // Vite, gone stylesheet
];

function groupStaleBuildChunks<E extends Sentry.ErrorEvent>(event: E): E {
  const values = event.exception?.values ?? [];
  const stale = values.some((exception) =>
    STALE_BUILD_CHUNK_MESSAGES.some((pattern) => pattern.test(exception.value ?? "")),
  );
  if (stale) event.fingerprint = [STALE_BUILD_CHUNK_FINGERPRINT];
  return event;
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
