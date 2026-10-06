import { CONTACT } from "../site/config";

export type ContactTopic = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly email: string;
};

export const CONTACT_TOPICS: readonly ContactTopic[] = [
  {
    id: "sales",
    label: "Early access & sales",
    hint: "Plans, rollout for your locations, a walkthrough.",
    email: CONTACT.sales,
  },
  {
    id: "product",
    label: "Product question",
    hint: "How something works before you sign up.",
    email: CONTACT.general,
  },
  {
    id: "support",
    label: "Support",
    hint: "Help with your workspace. Signed in? Settings → Support has your details.",
    email: CONTACT.support,
  },
  {
    id: "partnerships",
    label: "Partnerships",
    hint: "Restaurant groups, consultants, integrations.",
    email: CONTACT.general,
  },
  {
    id: "privacy",
    label: "Privacy request",
    hint: "Access, correction or deletion of personal information.",
    email: CONTACT.privacy,
  },
  {
    id: "security",
    label: "Security report",
    hint: "A vulnerability or a security concern.",
    email: CONTACT.security,
  },
];

export const LOCATION_COUNTS = ["1 location", "2–5 locations", "6–10 locations", "11+ locations"] as const;

export type ContactFields = {
  readonly topic: string;
  readonly name: string;
  readonly email: string;
  readonly restaurant: string;
  readonly locations: string;
  readonly message: string;
};

export type ContactErrors = Partial<Record<keyof ContactFields, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(fields: ContactFields): ContactErrors {
  const errors: ContactErrors = {};
  if (!CONTACT_TOPICS.some((topic) => topic.id === fields.topic)) errors.topic = "Choose what this is about.";
  if (!fields.name.trim()) errors.name = "Enter your name.";
  if (!EMAIL.test(fields.email.trim())) errors.email = "Enter an email address like name@restaurant.com.";
  if (fields.message.trim().length < 10) errors.message = "Tell us a little more (at least 10 characters).";
  return errors;
}

export function topicById(id: string): ContactTopic {
  return CONTACT_TOPICS.find((topic) => topic.id === id) ?? CONTACT_TOPICS[0]!;
}

/** Fallback when no form endpoint is configured: a prefilled email. */
export function mailtoFor(fields: ContactFields): string {
  const topic = topicById(fields.topic);
  const lines = [
    fields.message.trim(),
    "",
    "—",
    `Name: ${fields.name.trim()}`,
    `Email: ${fields.email.trim()}`,
    fields.restaurant.trim() ? `Restaurant: ${fields.restaurant.trim()}` : "",
    fields.locations ? `Locations: ${fields.locations}` : "",
  ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""));
  const subject = `${topic.label}${fields.restaurant.trim() ? ` — ${fields.restaurant.trim()}` : ""}`;
  return `mailto:${topic.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

export type SubmitResult = { readonly kind: "sent" } | { readonly kind: "mailto"; readonly href: string } | { readonly kind: "error"; readonly message: string };

/**
 * Integration point: with VITE_CONTACT_ENDPOINT set, the form POSTs JSON
 * there ({ topic, name, email, restaurant, locations, message, page }).
 * Without it, the visitor's email app opens with everything filled in.
 */
export async function submitContact(
  fields: ContactFields,
  endpoint: string = CONTACT.endpoint,
  fetcher: typeof fetch = fetch,
): Promise<SubmitResult> {
  if (!endpoint) return { kind: "mailto", href: mailtoFor(fields) };
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...fields, page: "contact" }),
    });
    if (!response.ok) throw new Error(String(response.status));
    return { kind: "sent" };
  } catch {
    return {
      kind: "error",
      message: `We could not send this. Email us at ${topicById(fields.topic).email} instead.`,
    };
  }
}
