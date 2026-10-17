import type { NotificationChannelsConfig } from "@newfork/shared";

/**
 * Which outside channels the server can send on now (BILDIRIM-15). Email once Resend's key and the sender
 * are set (the same two the email worker needs); phone alerts once the three VAPID values are set and well
 * formed. The public key is public: browsers subscribe with it. The private key never leaves the server.
 */
export interface ChannelEnvironment {
  readonly RESEND_API_KEY?: string;
  readonly EMPLOYEE_INVITE_FROM?: string;
  readonly VAPID_PUBLIC_KEY?: string;
  readonly VAPID_PRIVATE_KEY?: string;
  readonly VAPID_SUBJECT?: string;
}

export interface VapidDetails {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}

/** The VAPID values, or null unless all three are set and well formed. */
export function vapidFromEnvironment(env: ChannelEnvironment): VapidDetails | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  // A P-256 public key is 65 bytes and its private key 32, base64url; the push services want a contact.
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export function notificationChannelsConfigFromEnvironment(env: ChannelEnvironment): NotificationChannelsConfig {
  const vapid = vapidFromEnvironment(env);
  return {
    email: { available: Boolean(env.RESEND_API_KEY?.trim() && env.EMPLOYEE_INVITE_FROM?.trim()) },
    push: vapid ? { available: true, public_key: vapid.publicKey } : { available: false, public_key: null },
  };
}
