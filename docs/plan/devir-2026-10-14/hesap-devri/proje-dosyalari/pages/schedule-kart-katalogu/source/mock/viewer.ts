// Who is looking: the atlas switches between an owner, a manager and an
// employee of Harbor & Vine. The choice is kept per atlas page in this browser.
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

export const viewerRole: Role = read();

export function setViewerRole(role: Role): void {
  try {
    window.localStorage.setItem(key(), role);
  } catch {
    // Storage blocked: the switch lasts until the reload below.
  }
  window.location.reload();
}
