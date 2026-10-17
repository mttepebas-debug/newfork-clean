import * as Sentry from "@sentry/node";

type SentryEnv = Readonly<Record<string, string | undefined>>;

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
} satisfies Sentry.NodeOptions["dataCollection"];

/**
 * Integrations left out. Express/Fastify/Hapi/Hono/Koa: the framework hooks
 * would catch a 500 before replyWithError and send it without our request id,
 * so reportServerError stays the one path. Console: log lines become
 * breadcrumbs, and logs can carry employee details. LocalVariablesAsync:
 * variable values (see stackFrameVariables).
 */
export const LEFT_OUT_INTEGRATIONS = new Set([
  "Express",
  "Fastify",
  "Hapi",
  "Hono",
  "Koa",
  "Console",
  "LocalVariablesAsync",
]);

let started = false;

/**
 * Error reporting is on only where SENTRY_DSN is set (the hosted function).
 * Local runs, tests and CI have none. No personal data and no tracing: the
 * Vercel bundle is a single esbuild file, which request tracing cannot hook
 * into, so only failed requests are sent.
 */
export function sentryOptions(env: SentryEnv): Sentry.NodeOptions | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn || env.VITEST) return null;
  return {
    dsn,
    environment: env.APP_ENVIRONMENT ?? "production",
    dataCollection: NO_PERSONAL_DATA,
    includeServerName: false,
    integrations: (defaults) => defaults.filter((integration) => !LEFT_OUT_INTEGRATIONS.has(integration.name)),
  };
}

export function initSentry(
  env: SentryEnv = process.env,
  init: (options: Sentry.NodeOptions) => unknown = Sentry.init,
): boolean {
  if (started) return true;
  const options = sentryOptions(env);
  if (!options) return false;
  init(options);
  started = true;
  return true;
}

/**
 * A 500 goes to Sentry under the same request id the caller got back. The
 * function can be frozen as soon as the response leaves, so the event is
 * flushed first; this waits only on a failed request, never on a good one.
 */
export async function reportServerError(error: unknown, requestId: string) {
  if (!started) return;
  Sentry.withScope((scope) => {
    scope.setTag("request_id", requestId);
    Sentry.captureException(error);
  });
  await Sentry.flush(2000);
}

/**
 * A limit or a delay Mert must hear about (BILDIRIM-DAGITICI): a warning, one Sentry issue per kind and
 * channel, so Sentry's email tells him the first time and counts the rest. Answers whether it went out.
 */
export async function reportOperatorAlert(message: string, fingerprint: readonly string[], details: Record<string, string | number>) {
  if (!started) return false;
  Sentry.withScope((scope) => {
    scope.setLevel("warning");
    scope.setFingerprint([...fingerprint]);
    scope.setContext("alert", details);
    Sentry.captureMessage(message);
  });
  await Sentry.flush(2000);
  return true;
}
