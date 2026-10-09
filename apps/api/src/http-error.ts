import { managementAndOwnerSentence } from "@newfork/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

/**
 * HTTP status carried by the error instead of guessed from its English message.
 *
 * Route modules historically decided the status with `message.includes(...)`,
 * which silently changes the status when a message is reworded and blocks
 * translating messages at all. Services throw this instead; the route helper
 * and the global error handler read `statusCode` directly.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  /** Postgres SQLSTATE the status was derived from, when there was one. */
  readonly pgCode?: string;
  /**
   * Machine key the RPC raised in `hint`, e.g. "workspace.closure.name_mismatch".
   * Screens read this instead of the English sentence, so the sentence can be
   * reworded or translated without anything downstream noticing.
   */
  readonly reason?: string;
  /**
   * What the refusal was about, when it is about one thing in particular: the
   * id of the transfer standing in the way, say. The key says which refusal;
   * this says which one of them.
   */
  readonly detail?: string;

  constructor(
    message: string,
    statusCode: number,
    options: {
      readonly pgCode?: string;
      readonly reason?: string;
      readonly detail?: string;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.pgCode = options.pgCode;
    this.reason = options.reason;
    this.detail = options.detail;
  }
}

/**
 * SQLSTATE to HTTP. The RPCs raise these deliberately, so the code is a far
 * better signal than the message text. Unknown codes return null and the
 * caller keeps its existing behaviour.
 */
export function statusForPostgresCode(code: string | undefined): number | null {
  switch (code) {
    case "42501": // insufficient_privilege: every "access required" guard
      return 403;
    case "P0002": // no_data_found: the RPCs use it for "not found"
    case "02000": // no_data: the workspace lifecycle RPCs raise this one
      return 404;
    case "23505": // unique_violation
    case "40001": // serialization_failure, used for revision conflicts
    case "PT409": // PostgREST passthrough for business-rule conflicts
      return 409;
    case "P0001": // raise_exception: a plain RAISE, always on purpose
    case "22023": // invalid_parameter_value
    case "23502": // not_null_violation
    case "23514": // check_violation
    case "23503": // foreign_key_violation: "role is assigned to members"
    case "55000": // object_not_in_prerequisite_state: onboarding readiness
      return 400;
    default:
      return null;
  }
}

/** A machine key such as "authz.out_of_scope" or "schedule.locked". */
const reasonKey = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ponytail: Postgres's own sentences name the relation, column or constraint in
// double quotes, or say "permission denied for <object>". A deliberate RAISE
// does neither, with one known exception: Schedule's past-edit refusals raise a
// JSON payload as the message. It is swapped here like the rest; the Schedule
// routes read the payload back from `cause` (schedule-routes.ts pastEditPayload).
// Shift changes raise their eligibility reasons as a JSON list of sentences
// on purpose (reasonList); that list stays too.
// Widen this if another built-in message shape shows up in a 4xx.
const postgresSentence = /"|^permission denied for /;

function reasonList(message: string): boolean {
  if (!message.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(message);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string");
  } catch {
    return false;
  }
}
const plainSentence: Record<number, string> = {
  400: "Request could not be completed",
  403: "Not allowed",
  404: "Not found",
  409: "Request conflicts with the current state",
};

/**
 * Turns a PostgREST/Supabase error into a typed error, status included when known.
 *
 * Nothing the database said by itself reaches a 4xx body (BL-131): the hint
 * travels only as a machine key, `details` only beside one and only as an
 * action key or an id, and Postgres's own sentence is swapped for a plain one.
 * A code nobody raises on purpose is a bug, so it answers 500.
 */
export function rpcFailure(
  error: {
    readonly message: string;
    readonly code?: string;
    readonly hint?: string | null;
    readonly details?: string | null;
  },
  fallbackStatus = 500,
): HttpError {
  const reason = error.hint && reasonKey.test(error.hint) ? error.hint : undefined;
  const detail =
    reason && error.details && (reasonKey.test(error.details) || uuid.test(error.details))
      ? error.details
      : undefined;
  // The authorization core says no with 42501 and its reason in the hint; to
  // somebody who is not a member the workspace is simply not there.
  const status =
    reason === "authz.not_member"
      ? 404
      : (statusForPostgresCode(error.code) ?? fallbackStatus);
  // Route helpers send an HttpError's message whatever its status; the
  // original stays on `cause` for the log.
  if (status >= 500)
    return new HttpError("Internal server error", status, { pgCode: error.code, cause: error });
  // BL-218: these few refusals already have the sentence a person reads.
  const message =
    managementAndOwnerSentence(reason) ??
    (!reason && postgresSentence.test(error.message) && !reasonList(error.message)
      ? (plainSentence[status] ?? "Request could not be completed")
      : error.message);
  return new HttpError(message, status, {
    pgCode: error.code,
    reason,
    detail,
    cause: error,
  });
}


/**
 * The one answer to a failed request (the app's error handler): the status the
 * error carries, its machine key and detail beside the sentence, and the
 * request id. Nothing above 499 says what went wrong; the log does.
 */
export function replyWithError(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const statusCode = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
  if (statusCode >= 500) request.log.error({ err: error }, "request failed");
  else request.log.warn({ err: error, statusCode }, "request rejected");
  if (statusCode >= 500)
    return reply.status(statusCode).send({ error: "Internal server error", requestId: request.id });
  const typed = error instanceof HttpError ? error : undefined;
  return reply.status(statusCode).send({
    error: error.message,
    ...(typed?.reason ? { reason: typed.reason } : {}),
    ...(typed?.detail ? { detail: typed.detail } : {}),
    requestId: request.id,
  });
}
