// Who is looking: the atlas switches between an owner, a manager and an
// employee of Harbor & Vine. The choice is kept per atlas page in this browser.
import { currentPage, type Role } from "../pages";

declare const __ATLAS_NS__: string;
const key = () => `newfork.atlas.${__ATLAS_NS__}role.${currentPage().id}`;

function read(): Role {
  const page = currentPage();
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
