/**
 * Is this the API saying "you may not"? The one place a screen asks.
 *
 * The API's no is a 403 (a member without the right) or a 404 (not a member,
 * or a target they cannot see) carrying an `authz.*` reason (CLAUDE.md,
 * "Hayır" sözleşmesi). A 403 or 404 without that key is some other refusal.
 * Reads RequestError (reason on the error) and ScheduleRequestError (reason in
 * the response body).
 */
export function isNoAccess(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { status, reason, body } = error as {
    status?: unknown;
    reason?: unknown;
    body?: unknown;
  };
  const key =
    reason ??
    (typeof body === "object" && body !== null
      ? (body as { reason?: unknown }).reason
      : undefined);
  return (
    (status === 403 || status === 404) &&
    typeof key === "string" &&
    key.startsWith("authz.")
  );
}
