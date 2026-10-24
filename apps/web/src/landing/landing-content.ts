// Marketing copy for the public landing page. Every claim here maps to a
// feature that exists in the product today; MVP-later modules (time
// tracking, payroll, compliance) are named as such in the FAQ.

export type HeroShift = {
  readonly id: string;
  readonly row: number;
  readonly day: number;
  readonly time: string;
  readonly tone: "sage" | "sky" | "amber" | "rose" | "violet";
};

export const heroPeople = [
  { name: "Ava R.", job: "Server" },
  { name: "Marcus T.", job: "Line cook" },
  { name: "Priya S.", job: "Host" },
  { name: "Diego M.", job: "Bartender" },
] as const;

export const heroDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const heroShifts: readonly HeroShift[] = [
  { id: "a1", row: 0, day: 0, time: "11–5", tone: "sage" },
  { id: "a2", row: 0, day: 2, time: "11–5", tone: "sage" },
  { id: "a3", row: 0, day: 4, time: "5–11", tone: "sage" },
  { id: "a4", row: 0, day: 5, time: "5–11", tone: "sage" },
  { id: "b1", row: 1, day: 0, time: "7–3", tone: "amber" },
  { id: "b2", row: 1, day: 1, time: "7–3", tone: "amber" },
  { id: "b3", row: 1, day: 3, time: "3–11", tone: "amber" },
  { id: "b4", row: 1, day: 6, time: "7–3", tone: "amber" },
  { id: "c1", row: 2, day: 1, time: "4–10", tone: "sky" },
  { id: "c2", row: 2, day: 3, time: "4–10", tone: "sky" },
  { id: "c3", row: 2, day: 5, time: "4–11", tone: "sky" },
  { id: "d1", row: 3, day: 2, time: "6–2", tone: "violet" },
  { id: "d2", row: 3, day: 4, time: "6–2", tone: "rose" },
  { id: "d3", row: 3, day: 6, time: "4–12", tone: "violet" },
];

export const heroScenes = [
  {
    key: "build",
    label: "Build the week",
    caption: "Templates and drag-and-drop fill the grid in minutes.",
  },
  {
    key: "check",
    label: "Catch conflicts",
    caption: "Availability, time off and double-booking are flagged as you type.",
  },
  {
    key: "publish",
    label: "Publish to every phone",
    caption: "One tap sends the schedule to the whole crew.",
  },
  {
    key: "swap",
    label: "Swaps run themselves",
    caption: "The crew trades shifts; the right manager approves.",
  },
] as const;

export const audiences = [
  "Full-service restaurants",
  "Quick-service",
  "Cafés & bakeries",
  "Bars & lounges",
  "Multi-location groups",
  "Ghost kitchens",
  "Hotel restaurants",
  "Catering teams",
];

export const steps = [
  {
    title: "Set up your workspace",
    body: "Add your locations, departments and jobs. Owners land on a guided setup that saves as they go.",
  },
  {
    title: "Invite the crew",
    body: "Send invites by email. Each person accepts, finishes onboarding on their phone and signs what you need signed.",
  },
  {
    title: "Build and publish",
    body: "Start from a template, fill gaps from availability, fix conflicts, then publish the week to everyone at once.",
  },
  {
    title: "Let the day run",
    body: "Swaps, pickups and time off flow to the manager who decides. Everyone sees the same live schedule.",
  },
];

export const cockpitTabs = [
  {
    key: "schedule",
    label: "Schedule",
    title: "A week view built for the pass, not a spreadsheet",
    points: [
      "Drag shifts, copy days, reuse templates",
      "Ghost shifts show who already works at your other location",
      "Draft safely, publish when you are ready",
    ],
  },
  {
    key: "requests",
    label: "Requests",
    title: "Every swap, pickup and drop in one queue",
    points: [
      "Requests go one level up, never to a peer",
      "Eligibility checked for job and location before anyone accepts",
      "Approve or decline with the full picture",
    ],
  },
  {
    key: "availability",
    label: "Availability",
    title: "Know who can work before you ask",
    points: [
      "Weekly availability from each employee",
      "Approved time off blocks the day in red",
      "Warnings, never surprises, when you schedule over a preference",
    ],
  },
  {
    key: "announcements",
    label: "Announcements",
    title: "Say it once, know who read it",
    points: [
      "Target a location, a department or everyone",
      "Ask for acknowledgment and track it",
      "Important dates and closures on the calendar",
    ],
  },
  {
    key: "documents",
    label: "Documents",
    title: "Onboarding paperwork without the paper",
    points: [
      "Collect certificates with expiry dates",
      "E-signature templates for handbooks and policies",
      "Review, approve or send back with a reason",
    ],
  },
] as const;

export type CockpitKey = (typeof cockpitTabs)[number]["key"];

export const employeeScreens = [
  {
    key: "week",
    label: "My week",
    body: "The published schedule on their phone, with the next shift up top.",
  },
  {
    key: "swap",
    label: "Swap a shift",
    body: "Pick a shift, see who is eligible, send the request. Done.",
  },
  {
    key: "timeoff",
    label: "Request time off",
    body: "Choose the dates, add a note, follow the decision live.",
  },
] as const;

export const features = [
  {
    icon: "layers",
    title: "Multi-location by default",
    body: "Run two or twenty locations. Managers decide for their own location; owners see it all.",
    wide: true,
  },
  {
    icon: "alert",
    title: "Conflict warnings",
    body: "Double-booking, time off and availability are flagged the moment a shift is written.",
  },
  {
    icon: "check",
    title: "Real approval chain",
    body: "Requests climb one level. Nobody approves themselves or a peer.",
  },
  {
    icon: "copy",
    title: "Templates",
    body: "Save a great week once. Roll it forward forever.",
  },
  {
    icon: "file",
    title: "PDF & Excel export",
    body: "Print the week for the back-of-house wall in one click.",
  },
  {
    icon: "shield",
    title: "Roles & permissions",
    body: "Owner, admin, manager and employee, each seeing exactly what their job needs.",
    wide: true,
  },
  {
    icon: "pen",
    title: "E-signatures",
    body: "Handbooks and policies signed during onboarding.",
  },
  {
    icon: "calendar",
    title: "Closures & key dates",
    body: "Holidays and closed days guard the schedule automatically.",
  },
  {
    icon: "bell",
    title: "Quiet notifications",
    body: "Alerts go to the person who decides and the person affected. Nobody else.",
    wide: true,
  },
] as const;

export const principles = [
  { no: "No settings hell.", yes: "Sensible defaults. A setting only exists when restaurants truly differ." },
  { no: "No notification noise.", yes: "Only the decider and the affected person hear about a change." },
  { no: "No enterprise drag.", yes: "A manager's five-minute job never takes twenty." },
  { no: "No toy UI.", yes: "A serious tool for a serious business. No badges, no gimmicks." },
];

export type Plan = {
  readonly name: string;
  readonly blurb: string;
  readonly monthly: number | null;
  readonly annual: number | null;
  readonly unit: string;
  readonly cta: string;
  readonly featured?: boolean;
  readonly includes: readonly string[];
};

export const plans: readonly Plan[] = [
  {
    name: "Starter",
    blurb: "One location getting organized.",
    monthly: 0,
    annual: 0,
    unit: "free forever",
    cta: "Start free",
    includes: [
      "1 location, up to 20 people",
      "Schedule, templates and publishing",
      "Employee app for every team member",
      "Availability and time off",
    ],
  },
  {
    name: "Pro",
    blurb: "Growing groups with 2–5 locations.",
    monthly: 49,
    annual: 39,
    unit: "per location / month",
    cta: "Start 14-day trial",
    featured: true,
    includes: [
      "Unlimited people",
      "Swaps, pickups and approval chain",
      "Ghost shifts across locations",
      "Announcements with acknowledgment",
      "Documents and e-signatures",
      "PDF & Excel export",
    ],
  },
  {
    name: "Group",
    blurb: "Restaurant groups with 6+ locations.",
    monthly: null,
    annual: null,
    unit: "custom",
    cta: "Talk to us",
    includes: [
      "Everything in Pro",
      "Guided onboarding for every location",
      "Priority support",
      "Volume pricing",
    ],
  },
];

export const faqs = [
  {
    q: "Who is Newfork for?",
    a: "Restaurants in the United States, from a single café to groups with several locations. It is designed around owners and managers on desktop and employees on their phones.",
  },
  {
    q: "Do my employees need to pay or install anything?",
    a: "No. Employees are free on every plan. They open Newfork in their phone's browser, accept the invite and see their schedule.",
  },
  {
    q: "How long does setup take?",
    a: "Most owners add their locations and jobs and send the first invites in one sitting. Setup saves as you go, so you can pick it back up later.",
  },
  {
    q: "Who approves shift swaps and time off?",
    a: "Requests go one level up. An employee's request goes to the manager of their location; a manager's goes to an admin or the owner. Nobody approves their own request or a peer's.",
  },
  {
    q: "Can one employee work at more than one location?",
    a: "Yes. Their shifts at other locations appear as ghost shifts, so no manager double-books someone by accident.",
  },
  {
    q: "Does Newfork do time clock, payroll or tip pooling?",
    a: "Not yet. Newfork focuses on scheduling and crew control. Time tracking, payroll and compliance tools are on the roadmap after launch.",
  },
  {
    q: "Is my data separated from other restaurants?",
    a: "Yes. Every workspace is isolated at the database level with row-level security, and every action is checked against the person's role and location.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Paid plans are month to month unless you choose annual billing, and the Starter plan is free with no card required.",
  },
];
