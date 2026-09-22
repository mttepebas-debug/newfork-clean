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

  constructor(
    message: string,
    statusCode: number,
    options: {
      readonly pgCode?: string;
      readonly reason?: string;
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.pgCode = options.pgCode;
    this.reason = options.reason;
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
    case "22023": // invalid_parameter_value
    case "23502": // not_null_violation
    case "23514": // check_violation
      return 400;
    default:
      return null;
  }
}

/** Turns a PostgREST/Supabase error into a typed error, status included when known. */
export function rpcFailure(
  error: {
    readonly message: string;
    readonly code?: string;
    readonly hint?: string | null;
  },
  fallbackStatus = 400,
): HttpError {
  return new HttpError(
    error.message,
    statusForPostgresCode(error.code) ?? fallbackStatus,
    { pgCode: error.code, reason: error.hint ?? undefined, cause: error },
  );
}
