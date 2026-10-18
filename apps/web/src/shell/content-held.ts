/** Schedule's own list pages; every other path under Schedule draws the grid
 * (export and templates open their panel over it). */
const SCHEDULE_LIST_PAGES = new Set(["/app/schedule/requests", "/app/schedule/lineup"]);

/**
 * Whether a page holds still when the main menu collapses: it starts next to
 * the open menu's edge and keeps that place. Schedule's grid and Settings
 * (which has its own menu) still take the room the menu gives up
 * (Mert 2026-10-18).
 */
export function contentHeldAtMenuEdge(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  const under = (root: string) => path === root || path.startsWith(`${root}/`);
  if (under("/app/settings")) return false;
  if (under("/app/schedule-badge-lab")) return false;
  if (under("/app/schedule")) {
    return [...SCHEDULE_LIST_PAGES].some((page) => under(page));
  }
  return true;
}
