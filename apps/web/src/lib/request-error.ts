/**
 * A failed API request, carrying the machine key the database raised in `hint`
 * alongside its English sentence.
 *
 * Screens match on `reason`. The sentence is for the log and for the refusals
 * nothing has keyed yet, so rewording a `raise exception` in a migration can no
 * longer change what a screen says or which status the API returns.
 *
 * It lives in its own module because `lib/supabase` is mocked wholesale in
 * tests; a class exported from there would come back undefined and every
 * `instanceof` against it would quietly be false.
 */
export class RequestError extends Error {
  readonly reason?: string;
  /** Which one, when the refusal is about one thing in particular. */
  readonly detail?: string;
  /** The HTTP status, when the refusal came from the API. */
  readonly status?: number;

  constructor(message: string, reason?: string, detail?: string, status?: number) {
    super(message);
    this.name = "RequestError";
    this.reason = reason;
    this.detail = detail;
    this.status = status;
  }
}

/**
 * The error for a failed API response: its sentence, status and `authz.*` or
 * other machine key. Every request helper throws this, so `isNoAccess()` can
 * tell the API's "no" from any other failure on every screen.
 */
export function requestFailure(
  body: unknown,
  status: number,
  fallback: string,
): RequestError {
  const shape = typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  return new RequestError(
    "error" in shape ? String(shape.error) : fallback,
    typeof shape.reason === "string" ? shape.reason : undefined,
    typeof shape.detail === "string" ? shape.detail : undefined,
    status,
  );
}

/**
 * A refusal the screen words itself, for the person (BL-395): "Past schedule
 * weeks cannot be unpublished." A plain Error is a programmer's message and
 * never reaches the screen; throw this when the sentence is meant to.
 */
export class ScreenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScreenError";
  }
}

/** D-O7: what a person reads when the request itself failed. */
export const UNREACHABLE = "Newfork could not be reached. Check your connection and try again.";
export const UNREADABLE = "Newfork could not finish that. Try again in a moment.";

/**
 * The sentence a screen shows for a failed request (G11, BL-395): the API's
 * own sentence for a refusal (4xx), a plain one for anything else. A server
 * failure, a dropped connection, a parser's or the browser's words never reach
 * the screen. "From the API" is an error with a numeric status (RequestError,
 * ScheduleRequestError), not a class check, so a test's module mock cannot
 * change the answer. A refusal known by its machine key carries a sentence the
 * app wrote (BL-218), so it is shown even when it came without a status.
 */
export function requestErrorText(error: unknown, fallback: string = UNREADABLE): string {
  if (!(error instanceof Error)) return fallback;
  if (error instanceof ScreenError) return error.message.trim() || fallback;
  const { status, reason } = error as { status?: unknown; reason?: unknown };
  if (typeof status !== "number") return typeof reason === "string" ? error.message.trim() || fallback : fallback;
  if (status === 0) return UNREACHABLE;
  if (status >= 500) return UNREADABLE;
  return error.message.trim() || fallback;
}
