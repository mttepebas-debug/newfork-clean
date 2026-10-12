/**
 * BL-1044: the machine key a Schedule refusal carries, `reason` in the API's
 * error body (the database's hint). Screens match on it, never on the English
 * sentence or on a bare 409. It reads the error by shape, so a test that mocks
 * `schedule-data` wholesale still gets an answer.
 */
export function scheduleRefusalReason(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const { body, reason } = error as { body?: unknown; reason?: unknown };
  const key = typeof reason === "string" ? reason
    : typeof body === "object" && body ? (body as { reason?: unknown }).reason : undefined;
  return typeof key === "string" ? key : undefined;
}
