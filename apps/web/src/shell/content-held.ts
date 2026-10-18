/**
 * Whether a page holds still when the main menu collapses: it starts next to
 * the open menu's edge and keeps that place. Schedule's grid and Settings
 * (which has its own menu) still take the room the menu gives up
 * (Mert 2026-10-18).
 */
export function contentHeldAtMenuEdge(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "");
  return path !== "/app/schedule" && path !== "/app/settings" && !path.startsWith("/app/settings/");
}
