// The site map. Every page exists here once: the router, the prerenderer,
// the sitemap, breadcrumbs and per-page metadata all read this list.

export type RouteGroup = "main" | "solutions" | "company" | "legal";

export type SiteRoute = {
  readonly path: string;
  /** File name in src/pages (without .tsx). */
  readonly page: string;
  /** Title without the brand suffix. */
  readonly title: string;
  readonly description: string;
  /** Short label for breadcrumbs and footers. */
  readonly label: string;
  readonly group: RouteGroup;
  readonly changefreq: "weekly" | "monthly" | "yearly";
  readonly priority: number;
  readonly noindex?: boolean;
  /** Path of the parent page in breadcrumbs (defaults to home). */
  readonly parent?: string;
};

export const ROUTES: readonly SiteRoute[] = [
  {
    path: "/",
    page: "HomePage",
    label: "Home",
    title: "Restaurant scheduling software for multi-location teams",
    description:
      "Build the week, catch conflicts before they reach the floor, and publish one schedule every location trusts. Your team handles time off, swaps and open shifts from their phones — you approve what matters.",
    group: "main",
    changefreq: "weekly",
    priority: 1,
  },
  {
    path: "/product",
    page: "ProductPage",
    label: "Product",
    title: "Product tour: the manager cockpit and the employee app",
    description:
      "A guided tour of the schedule, requests, availability, onboarding, documents and announcements — the manager cockpit on the desktop and the employee app on the phone.",
    group: "main",
    changefreq: "monthly",
    priority: 0.9,
  },
  {
    path: "/solutions/multi-location-restaurants",
    page: "MultiLocationPage",
    label: "Multi-location groups",
    title: "Scheduling for multi-location restaurant groups",
    description:
      "One schedule across every location. Location managers run their own floor, people who work at more than one location show up everywhere they are booked, and nobody gets double-scheduled.",
    group: "solutions",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/solutions/restaurant-managers",
    page: "ManagersPage",
    label: "General managers",
    title: "Restaurant scheduling for general managers",
    description:
      "Build the week in one place, see availability and time off as you schedule, and approve requests without chasing texts.",
    group: "solutions",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/solutions/restaurant-teams",
    page: "TeamsPage",
    label: "Hourly teams",
    title: "The employee app for restaurant teams",
    description:
      "Your shifts, your availability, your requests and your paperwork — on your phone, without texting the manager.",
    group: "solutions",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/pricing",
    page: "PricingPage",
    label: "Pricing",
    title: "Pricing",
    description:
      "Plans for single restaurants and multi-location groups. Final prices are not published yet — talk to us about early access.",
    group: "main",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/faq",
    page: "FaqPage",
    label: "FAQ",
    title: "Frequently asked questions",
    description:
      "How scheduling, publishing, time off, swaps, open shifts, approvals, onboarding and permissions work — and what happens to employee data.",
    group: "main",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/security",
    page: "SecurityPage",
    label: "Security",
    title: "Security and trust",
    description:
      "How workspaces are kept apart, who can see what, and how employee documents are stored.",
    group: "company",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/about",
    page: "AboutPage",
    label: "About",
    title: "About",
    description:
      "Why we are building restaurant scheduling around the way restaurants actually run.",
    group: "company",
    changefreq: "monthly",
    priority: 0.5,
  },
  {
    path: "/contact",
    page: "ContactPage",
    label: "Contact",
    title: "Contact",
    description:
      "Questions about the product, early access, support or partnerships — reach the team.",
    group: "company",
    changefreq: "yearly",
    priority: 0.6,
  },
  {
    path: "/legal",
    page: "LegalIndexPage",
    label: "Legal",
    title: "Legal",
    description: "Privacy, terms, cookies, acceptable use, data processing and accessibility.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/privacy",
    page: "PrivacyPage",
    label: "Privacy Policy",
    title: "Privacy Policy",
    description: "What information we collect, why, who we share it with and the choices you have.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.3,
    parent: "/legal",
  },
  {
    path: "/terms",
    page: "TermsPage",
    label: "Terms of Service",
    title: "Terms of Service",
    description: "The terms that apply when a restaurant and its team use the service: accounts, workspaces, acceptable use and liability.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.3,
    parent: "/legal",
  },
  {
    path: "/cookies",
    page: "CookiesPage",
    label: "Cookie Policy",
    title: "Cookie Policy",
    description: "The cookies and browser storage this site and the app use, and how to control them.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.3,
    parent: "/legal",
  },
  {
    path: "/acceptable-use",
    page: "AcceptableUsePage",
    label: "Acceptable Use Policy",
    title: "Acceptable Use Policy",
    description: "What the service may and may not be used for, and what happens when a workspace breaks these rules.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.3,
    parent: "/legal",
  },
  {
    path: "/data-processing",
    page: "DataProcessingPage",
    label: "Data Processing",
    title: "Data processing and subprocessors",
    description:
      "How we process employee data on behalf of restaurants, and the subprocessors involved.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.3,
    parent: "/legal",
  },
  {
    path: "/accessibility",
    page: "AccessibilityPage",
    label: "Accessibility",
    title: "Accessibility statement",
    description: "Our accessibility target, what we test, known gaps and how to report a barrier.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.3,
    parent: "/legal",
  },
  {
    path: "/your-privacy-choices",
    page: "PrivacyChoicesPage",
    label: "Your Privacy Choices",
    title: "Your privacy choices",
    description:
      "Review this site's storage, see what is and is not used, and how to make a privacy request.",
    group: "legal",
    changefreq: "yearly",
    priority: 0.2,
    parent: "/legal",
  },
];

export const NOT_FOUND_ROUTE: SiteRoute = {
  path: "/404",
  page: "NotFoundPage",
  label: "Not found",
  title: "Page not found",
  description: "This page does not exist.",
  group: "main",
  changefreq: "yearly",
  priority: 0,
  noindex: true,
};

export function findRoute(pathname: string): SiteRoute {
  const normalized = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  return ROUTES.find((route) => route.path === normalized) ?? NOT_FOUND_ROUTE;
}

export function routeByPath(path: string): SiteRoute {
  const route = ROUTES.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Unknown route ${path}`);
  return route;
}

/** Home → (parent) → page, for breadcrumbs and BreadcrumbList schema. */
export function breadcrumbTrail(route: SiteRoute): SiteRoute[] {
  if (route.path === "/" || route.noindex) return [];
  const trail: SiteRoute[] = [routeByPath("/")];
  if (route.parent) trail.push(routeByPath(route.parent));
  trail.push(route);
  return trail;
}
