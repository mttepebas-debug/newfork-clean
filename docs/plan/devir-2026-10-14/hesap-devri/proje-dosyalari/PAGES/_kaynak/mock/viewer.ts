// Who is looking: the atlas switches between the people of Harbor & Vine: the
// owner, an admin, a manager, a Shift Lead (a custom manager-class role) and an
// employee. The choice is kept per atlas page in this browser.
import { currentPage, currentScenario, screenParams, type Role } from "../pages";

const key = () => `newfork.atlas.role.${currentPage().id}`;

function read(): Role {
  const page = currentPage();
  // PAGES: the shell names the role (or the scenario does).
  const asked = (screenParams().get("role") ?? currentScenario()?.role) as Role | undefined;
  if (asked && page.roles.includes(asked)) return asked;
  try {
    const saved = window.localStorage.getItem(key()) as Role | null;
    if (saved && page.roles.includes(saved)) return saved;
  } catch {
    // Storage blocked: use the page's default.
  }
  return page.roles[0]!;
}

/** The person signed in: owner, admin, manager, custom (Shift Lead) or employee. */
export const viewerIdentity: Role = read();

/**
 * The demo services' view of the same person, in the three shapes they were
 * written for: an admin sees the whole workspace like the owner, a Shift Lead
 * holds Downtown like a manager. Authorization (context actions, expected())
 * uses viewerAccess, so owner-only steps and narrower permissions still hold.
 */
export const viewerRole: "owner" | "manager" | "employee" =
  viewerIdentity === "admin" ? "owner" : viewerIdentity === "custom" ? "manager" : viewerIdentity;

/** The access class the core sees (custom roles are manager-class). */
export const viewerClass: "owner" | "admin" | "manager" | "employee" =
  viewerIdentity === "custom" ? "manager" : viewerIdentity;

export function setViewerRole(role: Role): void {
  try {
    window.localStorage.setItem(key(), role);
  } catch {
    // Storage blocked: the switch lasts until the reload below.
  }
  window.location.reload();
}
