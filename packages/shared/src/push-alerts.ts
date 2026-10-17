import { z } from "zod";

// Phone alerts (web push, BILDIRIM-15, KARARLAR S-138). A device is the
// person's, never a workspace's. Our server posts to the address a browser
// hands it, so only the four push services' are taken (Google, Mozilla, Apple,
// Microsoft): https on their own port, no user, nothing that only looks like
// them. The database checks the same (app_private.push_endpoint_ok).

const label = "[a-z0-9]([a-z0-9-]*[a-z0-9])?";
export const pushEndpointPattern = new RegExp(
  "^https://(fcm\\.googleapis\\.com|updates\\.push\\.services\\.mozilla\\.com" +
    `|(${label}\\.)+push\\.apple\\.com|(${label}\\.)+notify\\.windows\\.com)/[^\\s\\u0000-\\u001f\\u007f\\\\#]+$`,
);

export function isPushEndpoint(value: string): boolean {
  if (value.length > 2000 || !pushEndpointPattern.test(value)) return false;
  // The pattern says it; the URL parser agrees, or it is no address.
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.port === "" && url.username === "" && url.password === "" && value.startsWith(`https://${url.hostname}/`);
  } catch {
    return false;
  }
}

/** A P-256 public key (65 bytes) and an auth secret (16 bytes), base64url as the browser gives them. */
export const pushKeysSchema = z
  .object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  })
  .strict();

export const pushEndpointSchema = z.string().refine(isPushEndpoint, "A push service's address is required");

export const pushSubscriptionInputSchema = z
  .object({
    endpoint: pushEndpointSchema,
    keys: pushKeysSchema,
    /** What the person reads in Account → Notifications: "iPhone · Home Screen app". */
    label: z
      .string()
      // Before the trim, so a trailing line break is refused, not cut.
      .regex(/^[^\u0000-\u001f\u007f]*$/)
      .trim()
      .min(1)
      .max(120)
      .nullable(),
  })
  .strict();
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushSubscriptionRemoveSchema = z.object({ endpoint: pushEndpointSchema }).strict();
export type PushSubscriptionRemove = z.infer<typeof pushSubscriptionRemoveSchema>;

export const pushDevicesSchema = z.object({ devices: z.number().int().nonnegative() });
export type PushDevices = z.infer<typeof pushDevicesSchema>;

/**
 * Which outside channels the server can send on now: email once Resend's key
 * and sender are set, phone alerts once the VAPID keys are. Until then the
 * screens say "Coming soon" and promise nothing (KARARLAR S-124).
 */
export const notificationChannelsConfigSchema = z.object({
  email: z.object({ available: z.boolean() }),
  push: z.discriminatedUnion("available", [
    z.object({ available: z.literal(true), public_key: z.string().regex(/^[A-Za-z0-9_-]{87}$/) }),
    z.object({ available: z.literal(false), public_key: z.null() }),
  ]),
});
export type NotificationChannelsConfig = z.infer<typeof notificationChannelsConfigSchema>;
