import { createHash, timingSafeEqual } from "node:crypto";

type HeaderValue = string | string[] | undefined;

/**
 * Whether a cron call carries the cron secret, as "Authorization: Bearer <secret>"
 * or in x-cron-secret (BL-282). Both sides are hashed first, so the comparison
 * takes the same time whatever the length sent or the first character that differs.
 */
export function hasCronSecret(
  request: { readonly headers: Record<string, HeaderValue> },
  secret: string,
): boolean {
  const sent = cronSecretFromRequest(request.headers);
  if (sent === null) return false;
  return timingSafeEqual(digest(sent), digest(secret));
}

function cronSecretFromRequest(headers: Record<string, HeaderValue>): string | null {
  const authorization = headerValue(headers.authorization);
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
  return headerValue(headers["x-cron-secret"]);
}

function headerValue(value: HeaderValue): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
