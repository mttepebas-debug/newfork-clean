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

  constructor(message: string, reason?: string) {
    super(message);
    this.name = "RequestError";
    this.reason = reason;
  }
}
