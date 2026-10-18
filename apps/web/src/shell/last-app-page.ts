/**
 * The workspace page this tab showed last, so Account's "Back to workspace"
 * returns to it (ACCOUNT-BACK, Mert 2026-10-18). The employee view lives only
 * in the address: without this a manager who is also an employee left the
 * employee view for Account and came back in the management view.
 *
 * Per tab, like the tab's workspace. It belongs to one person in one
 * workspace; anyone else, or a workspace switched in Account, gets `/app`.
 */
const storageKey = "newfork.lastAppPage";

type LastAppPage = { readonly userId: string; readonly workspaceId: string; readonly path: string };

export function rememberAppPage(page: LastAppPage): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(page));
  } catch {
    // Storage blocked: Back goes to `/app`, as before.
  }
}

/** Where "Back to workspace" goes for this person in this workspace. */
export function workspaceReturnPath(userId: string | undefined, workspaceId: string | undefined): string {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as Partial<LastAppPage> | null;
    if (
      saved &&
      saved.userId === userId &&
      saved.workspaceId === workspaceId &&
      typeof saved.path === "string" &&
      saved.path.startsWith("/app/")
    )
      return saved.path;
  } catch {
    // Unreadable or blocked: the workspace's home.
  }
  return "/app";
}
