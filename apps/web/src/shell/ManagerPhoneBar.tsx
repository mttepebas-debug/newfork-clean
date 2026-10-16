import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { CurrentUserAvatar } from "../account/AccountAvatar";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { NotificationBell } from "../notifications/NotificationViews";

/**
 * The top bar of owner, admin and manager on a phone (Mert 2026-10-16,
 * variant A): the workspace (tap to switch), the notification bell with what
 * arrived since the list was last opened, and Account. It sits above the
 * scrolling page, so a page's own frozen heading keeps its place under it.
 * The shell draws it only at phone width (720 px and below, like the bottom bar).
 */
export function ManagerPhoneBar() {
  const { context } = useAuth();
  if (!context) return null;
  const name = context.workspace.name;
  return (
    <header className="mm-top" aria-label="Workspace bar">
      <Link className="mm-top-workspace" to="/account/workspaces" aria-label={`${name}. Switch workspace`}>
        <span className="workspace-switcher-tile mm-top-tile" aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="mm-top-name">{name}</span>
        <ChevronRight size={16} aria-hidden />
      </Link>
      <div className="mm-top-tools">
        {can(context, "notifications.read_own") ? <NotificationBell workspaceId={context.workspace.id} /> : null}
        <Link className="mm-top-account" to="/account/profile" aria-label="Account">
          <CurrentUserAvatar />
        </Link>
      </div>
    </header>
  );
}
