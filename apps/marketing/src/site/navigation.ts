// Navigation content. Every link points at a real page or anchor on this
// site, or at the app's own sign-in screen.

export type NavLink = {
  readonly label: string;
  readonly to: string;
  readonly description?: string;
};

export type NavGroup = {
  readonly id: string;
  readonly label: string;
  readonly intro?: string;
  readonly columns: readonly { readonly title: string; readonly links: readonly NavLink[] }[];
  readonly feature?: NavLink;
};

export const PRIMARY_NAV: readonly (NavGroup | NavLink)[] = [
  {
    id: "product",
    label: "Product",
    columns: [
      {
        title: "Manager cockpit",
        links: [
          { label: "Schedule", to: "/product#schedule", description: "Build the week, catch conflicts, publish." },
          { label: "Requests", to: "/product#requests", description: "Time off, swaps, cover and open shifts." },
          { label: "Availability", to: "/product#availability", description: "See who prefers what as you schedule." },
          { label: "Team & onboarding", to: "/product#team", description: "Invite, onboard and manage people." },
        ],
      },
      {
        title: "Everyone",
        links: [
          { label: "Employee app", to: "/product#employee-app", description: "Shifts, requests and paperwork on the phone." },
          { label: "Documents", to: "/product#documents", description: "Required documents, review and expiry." },
          { label: "Announcements", to: "/product#announcements", description: "Post once, see who acknowledged." },
          { label: "Roles & permissions", to: "/product#permissions", description: "Owner, admin, manager, employee." },
        ],
      },
    ],
    feature: { label: "Take the product tour", to: "/product", description: "The cockpit and the phone, screen by screen." },
  },
  {
    id: "solutions",
    label: "Solutions",
    columns: [
      {
        title: "Built for",
        links: [
          { label: "Multi-location groups", to: "/solutions/multi-location-restaurants", description: "One schedule across every location." },
          { label: "General managers", to: "/solutions/restaurant-managers", description: "Run the week without chasing texts." },
          { label: "Hourly teams", to: "/solutions/restaurant-teams", description: "Your shifts and requests, on your phone." },
        ],
      },
    ],
  },
  { label: "Pricing", to: "/pricing" },
  { label: "FAQ", to: "/faq" },
];

export function isGroup(item: NavGroup | NavLink): item is NavGroup {
  return "columns" in item;
}

export const FOOTER_NAV: readonly { readonly title: string; readonly links: readonly NavLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Product tour", to: "/product" },
      { label: "Schedule", to: "/product#schedule" },
      { label: "Requests", to: "/product#requests" },
      { label: "Employee app", to: "/product#employee-app" },
      { label: "Pricing", to: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Multi-location groups", to: "/solutions/multi-location-restaurants" },
      { label: "General managers", to: "/solutions/restaurant-managers" },
      { label: "Hourly teams", to: "/solutions/restaurant-teams" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Security", to: "/security" },
      { label: "FAQ", to: "/faq" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Cookie Policy", to: "/cookies" },
      { label: "Acceptable Use", to: "/acceptable-use" },
      { label: "Data Processing", to: "/data-processing" },
      { label: "Accessibility", to: "/accessibility" },
    ],
  },
];
