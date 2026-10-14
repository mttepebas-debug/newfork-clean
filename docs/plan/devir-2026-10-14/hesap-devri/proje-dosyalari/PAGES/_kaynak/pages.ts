import screenData from "./screens.json";
// The atlas: which app pages each published page shows. One build serves every
// atlas page; the published HTML names its page on the root element
// (data-atlas-page; in the dev server ?page=<id>). A page only lets you move
// between its own routes.
/** owner, admin, manager, custom (a Shift Lead: custom manager-class role), employee. */
export type Role = "owner" | "admin" | "manager" | "custom" | "employee";

export interface AtlasPage {
  readonly id: string;
  readonly title: string;
  /** Route the page opens on, per role when they differ. */
  readonly start: string | Partial<Record<Role, string>>;
  /** Routes that belong to this page (path only). */
  readonly routes: readonly RegExp[];
  /** Roles that can open the page in the real app. The first is the default. */
  readonly roles: readonly Role[];
  /** Opens signed out (sign-in and public pages). */
  readonly signedOut?: boolean;
}

export const atlasPages: readonly AtlasPage[] = [
  // PAGES 3.0–3.2 (own build).
  { id: "schedule", title: "Schedule", start: "/app/schedule", routes: [/^\/app\/schedule(\/(export|templates))?\/?$/], roles: ["owner", "manager"] },
  // Managers' pages first (the order of the atlas index).
  // Lineup (Mert 2026-10-13): read-only day lineups under Schedule.
  { id: "lineup", title: "Lineup", start: "/app/schedule/lineup", routes: [/^\/app\/schedule\/lineup\/?$/], roles: ["owner", "manager"] },
  { id: "requests", title: "Requests", start: "/app/schedule/requests", routes: [/^\/app\/schedule\/requests\/?$/], roles: ["owner", "manager"] },
  { id: "employees", title: "Employees", start: "/app/employees", routes: [/^\/app\/employees(\/archive)?\/?$/], roles: ["owner", "manager"] },
  { id: "employee-documents", title: "Employee Documents", start: "/app/employees/documents", routes: [/^\/app\/employees\/documents\/?$/], roles: ["owner"] },
  { id: "settings", title: "Settings", start: "/app/settings/general", routes: [/^\/app\/settings(\/.*)?$/], roles: ["owner"] },
  { id: "shift-hub", title: "Shift Hub", start: "/app/employee-hub/shift-hub", routes: [/^\/app\/employee-hub\/shift-hub(\/.*)?$/], roles: ["employee"] },
  // Important Dates is a page under Announcements (EKRAN-08); before Announcements, whose pattern would take it.
  { id: "important-dates", title: "Important Dates", start: "/app/announcements/important-dates", routes: [/^\/app\/announcements\/important-dates(\/[^/]+)?\/?$/], roles: ["owner", "manager"] },
  { id: "workspace", title: "Workspace", start: "/app/workspace", routes: [/^\/app\/workspace\/?$/], roles: ["owner", "manager"] },
  { id: "availability", title: "Availability", start: "/app/availability", routes: [/^\/app\/availability\/?$/], roles: ["owner", "manager"] },
  // Employee view.
  { id: "employee-hub", title: "Employee Home", start: "/app/employee-hub", routes: [/^\/app\/employee-hub(\/(schedule|my-availability|more)(\/.*)?)?\/?$/], roles: ["employee"] },
  // Everyone.
  { id: "announcements", title: "Announcements", start: "/app/announcements", routes: [/^\/app\/announcements(\/[^/]+)?\/?$/], roles: ["owner", "manager", "employee"] },
  { id: "notifications", title: "Notifications", start: "/app/notifications", routes: [/^\/app\/notifications\/?$/], roles: ["owner", "manager", "employee"] },
  { id: "account", title: "Account", start: "/account/profile", routes: [/^\/account(\/.*)?$/], roles: ["owner", "manager", "employee"] },
  { id: "workspace-hub", title: "Workspace Hub", start: "/workspaces", routes: [/^\/workspaces(\/.*)?$/], roles: ["owner", "manager", "employee"] },
  // Setting up and signing in.
  { id: "owner-onboarding", title: "Owner Setup", start: "/onboarding", routes: [/^\/onboarding\/?$/], roles: ["owner"] },
  { id: "employee-onboarding", title: "Employee Welcome", start: "/welcome", routes: [/^\/welcome(\/.*)?$/], roles: ["employee"] },
  { id: "sign-in", title: "Sign In", start: "/sign-in", routes: [/^\/(sign-in|forgot-password|reset-password|account-recovery|accept-invite|invite\/accept)\/?$/], roles: ["owner"], signedOut: true },
  { id: "public", title: "Public Pages", start: "/privacy", routes: [/^\/(privacy|terms|accessibility|contact|your-privacy-choices)\/?$/], roles: ["owner"], signedOut: true },
];

/** PAGES: one numbered screen (one app route) per published page. */
export interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly role?: Role;
  /** Address the scenario opens on (may carry ?query); the screen's own path otherwise. */
  readonly path?: string;
  /** Router state for the first address (sign-in's "from"). */
  readonly state?: unknown;
  /** Named demo-data change (scenarios.ts), run on fresh data. */
  readonly setup?: string;
  /** Clicks and typing after the screen opens, in both frames. */
  readonly steps?: readonly Step[];
  /** The part of the screen this scenario shows (the shell groups by it). */
  readonly part?: string;
  /** Demo API answers forced to fail: path pattern (regex), optional method, status and reason. */
  readonly fail?: readonly { readonly path: string; readonly method?: string; readonly status?: number; readonly reason?: string; readonly error?: string }[];
  /** Demo API calls that never answer (the screen stays loading): path patterns, optionally "POST <pattern>". */
  readonly hold?: readonly string[];
  /** The viewer's permission keys instead of the role's own (a narrower custom role). */
  readonly perms?: readonly string[];
}
export type Step =
  | { readonly click: string; readonly within?: string }
  | { readonly fill: string; readonly value: string }
  /** Picks a made-up file in a file input (hidden ones too): name, type, size in bytes. */
  | { readonly file: string; readonly name: string; readonly type?: string; readonly size?: number }
  | { readonly wait: number }
  /** Scrolls the first visible match into view (a part below the fold). */
  | { readonly scroll: string }
  /** A key, Ctrl/Shift click, double or right click, hover or drag (schedule-steps.ts). */
  | import("./schedule-steps").Gesture;

export interface Screen {
  readonly no: string;
  readonly title: string;
  /** The atlas page whose demo backend serves this screen. */
  readonly area: string;
  readonly path: string;
  readonly match: string;
  readonly roles: readonly Role[];
  readonly scenarios: readonly Scenario[];
  /** A route the screen is reached through (a list before its detail). */
  readonly via?: string;
}

export const screens: readonly Screen[] = (screenData as { screens: Screen[] }).screens;

/** The frame's address after #: s=<no>&role=&sc=&frame=. */
export function screenParams(): URLSearchParams {
  // The shell puts the same words in the frame's name, in case the hash is lost.
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.includes("s=")) return new URLSearchParams(hash);
  return new URLSearchParams(window.name.startsWith("pages:") ? window.name.slice(6) : "");
}

export function currentScreen(): Screen {
  const wanted = screenParams().get("s") ?? new URLSearchParams(window.location.search).get("s");
  return screens.find((screen) => screen.no === wanted) ?? screens[0]!;
}

export function currentScenario(): Scenario | undefined {
  const screen = currentScreen();
  const wanted = screenParams().get("sc");
  return screen.scenarios.find((one) => one.id === wanted) ?? screen.scenarios[0];
}

export function screenFor(path: string): Screen | undefined {
  // The shell's pages (0.x) show parts of every route; a route's own page comes first.
  const owns = (screen: Screen) => new RegExp(screen.match).test(path);
  return screens.find((screen) => !screen.no.startsWith("0.") && owns(screen)) ?? screens.find(owns);
}

let cached: AtlasPage | null = null;
/** The atlas page of this screen's area, narrowed to the screen's own route. */
export function currentPage(): AtlasPage {
  if (cached) return cached;
  const screen = currentScreen();
  const area = atlasPages.find((page) => page.id === screen.area) ?? atlasPages[0]!;
  const scenario = currentScenario();
  cached = {
    ...area,
    title: `${screen.no} ${screen.title}`,
    start: scenario?.path ?? screen.path,
    routes: [new RegExp(screen.match), ...(screen.via ? [new RegExp(screen.via)] : [])],
    roles: screen.roles.length ? screen.roles : area.roles,
  };
  return cached;
}

export function startPath(page: AtlasPage, role: Role): string {
  if (typeof page.start === "string") return page.start;
  return page.start[role] ?? Object.values(page.start)[0]!;
}

export function belongs(page: AtlasPage, path: string): boolean {
  return page.routes.some((pattern) => pattern.test(path));
}
