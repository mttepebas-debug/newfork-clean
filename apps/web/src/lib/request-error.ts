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
