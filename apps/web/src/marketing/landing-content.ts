/**
 * Everything the public site says, in one place. The page components only lay
 * it out, so a price, a question or a feature line changes here and nowhere
 * else. Every claim in this file must match what the product does today.
 */

export const SIGN_UP_PATH = "/sign-up";
export const SIGN_IN_PATH = "/sign-in";

/**
 * One plan, priced per location: no feature tiers to compare, every feature
 * for every workspace. The numbers are a launch proposal waiting on the
 * product owner's sign-off (pricing is not decided in KARARLAR yet).
 */
export const PRICING = {
  currency: "USD",
  monthlyPerLocation: 39,
  annualPerLocation: 32,
  trialDays: 14,
  maxSelfServeLocations: 10,
} as const;

export type BillingCycle = "monthly" | "annual";

export function pricePerLocation(cycle: BillingCycle): number {
  return cycle === "annual"
    ? PRICING.annualPerLocation
    : PRICING.monthlyPerLocation;
}

/** The monthly bill for a workspace with this many locations. */
export function monthlyTotal(locations: number, cycle: BillingCycle): number {
  const count = Math.min(
    Math.max(Math.round(locations), 1),
    PRICING.maxSelfServeLocations,
  );
  return count * pricePerLocation(cycle);
}

export function annualSavingsPercent(): number {
  return Math.round(
    (1 - PRICING.annualPerLocation / PRICING.monthlyPerLocation) * 100,
  );
}

export const PLAN_INCLUDES = [
  "Schedule builder with drafts, templates and export",
  "Multi-location scheduling with cross-location shifts",
  "Availability, time off, swaps and cover requests",
  "Approvals routed to the right manager",
  "Announcements with acknowledgements",
  "Important dates and closed days",
  "Employee onboarding, documents and signatures",
  "Roles and location-level permissions",
  "Employee access from any phone browser",
] as const;

export type Faq = { readonly question: string; readonly answer: string };

export const FAQS: readonly Faq[] = [
  {
    question: "Who is Newfork for?",
    answer:
      "Restaurants in the United States, from a single location to groups with several. It is built for the way they actually run: an owner who oversees everything, a manager at each location, and a team that works across shifts and sometimes across locations.",
  },
  {
    question: "Do my employees need to download an app?",
    answer:
      "No. Employees open Newfork in their phone's browser and sign in from the invitation you send them. Their schedule, requests, availability and documents are all there. Managers build the schedule on a computer, where a full week fits on one screen.",
  },
  {
    question: "Can I run more than one location?",
    answer:
      "Yes. Each location has its own managers, jobs and schedule, and the owner sees all of them. When someone works at two locations, their shifts at the other one appear in your grid as ghost shifts, so nobody gets booked twice.",
  },
  {
    question: "How do shift swaps, cover and time off work?",
    answer:
      "An employee asks from their phone. Newfork only offers the shift to people who can take it — the right location, the right job, no approved time off — and sends the request to the manager who decides. Once it is approved, the schedule updates and everyone involved is notified.",
  },
  {
    question: "What if I schedule someone during their time off?",
    answer:
      "You find out while you are building, not after you publish. Availability is a preference, so it shows a warning you can override. Approved time off is a commitment, so the shift cannot be placed there.",
  },
  {
    question: "Can managers only see their own locations?",
    answer:
      "Yes. Owners and admins see the whole workspace; managers see and decide only for the locations they run; employees see their own schedule and requests. You can also create custom roles with exactly the permissions you want to give.",
  },
  {
    question: "Does Newfork do time clocks, payroll or tips?",
    answer:
      "Not today. Newfork focuses on scheduling and day-to-day team operations and does them well. It does not run a time clock, process payroll, or give legal or compliance advice.",
  },
  {
    question: "How does pricing work?",
    answer: `One plan with every feature, priced per location per month. Each workspace is one business and one subscription; locations of the same business live inside it. Every new workspace starts with a ${PRICING.trialDays}-day free trial.`,
  },
  {
    question: "Do I need a credit card for the trial?",
    answer:
      "No. Create a workspace account, set up your locations and invite your team. You only decide on a plan when the trial ends.",
  },
  {
    question: "Can I export or print the schedule?",
    answer:
      "Yes. Export the week as a PDF for the back-of-house wall or as an Excel file for your own records.",
  },
  {
    question: "How is my team's information protected?",
    answer:
      "Every workspace is isolated at the database level, and every request is checked against the person's role and locations before anything is read or changed. Sensitive actions are recorded. Newfork runs no advertising or cross-site tracking.",
  },
];

export const NAV_LINKS = [
  { label: "Cockpit", href: "#cockpit" },
  { label: "Employee app", href: "#employee-app" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

export const SECTION_ROUTES: Readonly<Record<string, string>> = {
  "/pricing": "pricing",
  "/faq": "faq",
  "/features": "cockpit",
  "/product": "cockpit",
};

/**
 * Facts about the business the site needs and nobody has decided yet. Every
 * value in [BRACKETS] is a placeholder to replace before launch; the page
 * shows it as written so a missing one is easy to spot. The domain also
 * appears in index.html, public/robots.txt and public/sitemap.xml.
 */
export const SITE = {
  companyLegalName: "[COMPANY LEGAL NAME]",
  companyAddress: "[STREET ADDRESS, CITY, STATE ZIP]",
  domain: "[YOUR-DOMAIN.COM]",
  supportEmail: "[SUPPORT EMAIL]",
  salesEmail: "[SALES EMAIL]",
  phone: "[PHONE NUMBER]",
  social: [
    { label: "LinkedIn", href: "[LINKEDIN URL]" },
    { label: "Instagram", href: "[INSTAGRAM URL]" },
    { label: "X", href: "[X URL]" },
  ],
} as const;

export type Testimonial = {
  readonly quote: string;
  readonly name: string;
  readonly role: string;
  readonly restaurant: string;
};

/** Real customer words only; until there are some, these hold the places. */
export const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote: "[CUSTOMER QUOTE — one or two sentences about the schedule]",
    name: "[CUSTOMER NAME]",
    role: "[ROLE, e.g. Owner]",
    restaurant: "[RESTAURANT NAME, CITY, STATE]",
  },
  {
    quote: "[CUSTOMER QUOTE — one or two sentences about swaps or time off]",
    name: "[CUSTOMER NAME]",
    role: "[ROLE, e.g. General manager]",
    restaurant: "[RESTAURANT NAME, CITY, STATE]",
  },
  {
    quote: "[EMPLOYEE QUOTE — one or two sentences about the phone app]",
    name: "[EMPLOYEE NAME]",
    role: "[ROLE, e.g. Line cook]",
    restaurant: "[RESTAURANT NAME, CITY, STATE]",
  },
];

export function isPlaceholder(value: string): boolean {
  return value.trim().startsWith("[");
}

/**
 * A link for a contact value: mail, phone or web. A placeholder has nowhere
 * to go yet, so it points at the Contact page instead of a broken address.
 */
export function contactHref(
  value: string,
  kind: "mail" | "tel" | "web",
): string {
  if (isPlaceholder(value)) return "/contact";
  if (kind === "mail") return `mailto:${value}`;
  if (kind === "tel") return `tel:${value.replace(/[^\d+]/g, "")}`;
  return value;
}

/** The deployment's configured address wins; otherwise the placeholder shows. */
export function supportEmail(): string {
  const configured = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
  return (
    configured ||
    (import.meta.env.DEV ? "support@newfork.test" : SITE.supportEmail)
  );
}
