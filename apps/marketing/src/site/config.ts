// Everything that changes when the final name, domain or app address is
// chosen lives here. Nothing else in the site hard-codes them.

const env = import.meta.env;

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Placeholder until the final product name is chosen. */
export const BRAND_NAME = "Newfork";

/** Public address of this marketing site (canonical URLs, sitemap, Open Graph). */
export const SITE_URL = trimSlash(
  env.VITE_SITE_URL ?? "https://newfork.example",
);

/**
 * The product itself. The marketing site never signs anyone in: every
 * account action links to the app's own screens.
 */
export const APP_URL = trimSlash(
  env.VITE_APP_URL ?? (env.DEV ? "http://127.0.0.1:5555" : "https://app.newfork.example"),
);

/** True while the site still points at placeholder domains. */
export const USING_PLACEHOLDER_DOMAINS =
  SITE_URL.endsWith(".example") || APP_URL.endsWith(".example");

/**
 * Entry points into the existing app (apps/web/src/App.tsx). "Create
 * account" is the same screen as "Sign in": its second button switches the
 * form to "Create a workspace account". There is no deep link to that mode
 * yet, so both CTAs open /sign-in.
 */
export const APP_LINKS = {
  signIn: `${APP_URL}/sign-in`,
  createAccount: `${APP_URL}/sign-in`,
  forgotPassword: `${APP_URL}/forgot-password`,
} as const;

/**
 * Contact routing. Addresses are placeholders until real inboxes exist;
 * VITE_CONTACT_ENDPOINT, when set, receives the contact form as JSON.
 */
export const CONTACT = {
  endpoint: env.VITE_CONTACT_ENDPOINT ?? "",
  sales: env.VITE_CONTACT_SALES_EMAIL ?? "sales@newfork.example",
  support: env.VITE_CONTACT_SUPPORT_EMAIL ?? "support@newfork.example",
  privacy: env.VITE_CONTACT_PRIVACY_EMAIL ?? "privacy@newfork.example",
  security: env.VITE_CONTACT_SECURITY_EMAIL ?? "security@newfork.example",
  general: env.VITE_CONTACT_GENERAL_EMAIL ?? "hello@newfork.example",
} as const;

export const SITE_DESCRIPTION =
  "Restaurant scheduling and team operations for multi-location restaurants: build and publish the schedule, catch conflicts before they reach the floor, and let your team handle time off, swaps and open shifts from their phones.";
