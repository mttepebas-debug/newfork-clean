// The atlas: which app pages each published page shows. One build serves every
// atlas page; the published HTML names its page on the root element
// (data-atlas-page; in the dev server ?page=<id>). A page only lets you move
// between its own routes.
export type Role = "owner" | "manager" | "employee";

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
  // Jobs & departments lab: the real Settings → Jobs next to the V1 variants.
  { id: "jobs-lab", title: "Jobs & departments", start: "/app/settings/jobs", routes: [/^\/app\/settings\/jobs\/?$/], roles: ["owner"] },
  // Managers' pages first (the order of the atlas index).
  { id: "requests", title: "Requests", start: "/app/schedule/requests", routes: [/^\/app\/schedule\/requests\/?$/], roles: ["owner", "manager"] },
  { id: "employees", title: "Employees", start: "/app/employees", routes: [/^\/app\/employees(\/archive)?\/?$/], roles: ["owner", "manager"] },
  { id: "employee-documents", title: "Employee Documents", start: "/app/employees/documents", routes: [/^\/app\/employees\/documents\/?$/], roles: ["owner"] },
  { id: "settings", title: "Settings", start: "/app/settings/general", routes: [/^\/app\/settings(\/.*)?$/], roles: ["owner"] },
  { id: "shift-hub", title: "Shift Hub", start: "/app/employee-hub/shift-hub", routes: [/^\/app\/employee-hub\/shift-hub(\/.*)?$/], roles: ["employee"] },
  { id: "important-dates", title: "Important Dates", start: "/app/important-dates", routes: [/^\/app\/important-dates\/?$/], roles: ["owner", "manager"] },
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

export function currentPage(): AtlasPage {
  const wanted = document.getElementById("root")?.dataset.atlasPage ?? new URLSearchParams(window.location.search).get("page") ?? atlasPages[0]!.id;
  return atlasPages.find((page) => page.id === wanted) ?? atlasPages[0]!;
}

export function startPath(page: AtlasPage, role: Role): string {
  if (typeof page.start === "string") return page.start;
  return page.start[role] ?? Object.values(page.start)[0]!;
}

export function belongs(page: AtlasPage, path: string): boolean {
  return page.routes.some((pattern) => pattern.test(path));
}
