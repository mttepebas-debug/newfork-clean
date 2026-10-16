import { Bell } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { can } from "../auth/can";
import { useNotificationCounts } from "./notifications-data";
import { NotificationsPanel, notificationsPath } from "./NotificationViews";
import { useNotificationsRealtime } from "./useNotificationsRealtime";

/**
 * The left menu's Notifications (variant A): it opens the panel beside the
 * menu instead of a page; the count is what arrived since the list was last
 * opened. It also keeps the person's live channel open for the badge.
 */
export function NotificationsNavEntry({ collapsed }: { readonly collapsed: boolean }) {
  const { context } = useAuth();
  const workspaceId = context?.workspace.id;
  const allowed = can(context, "notifications.read_own");
  useNotificationsRealtime(allowed ? context?.userId : undefined, workspaceId);
  const unseen = useNotificationCounts(allowed ? workspaceId : undefined).data?.unseen_count ?? 0;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  if (!allowed || !workspaceId) return null;
  const active = open || pathname === notificationsPath;
  const label = unseen ? `Notifications, ${unseen} new` : "Notifications";
  return (
    <div className="sidebar-nav-entry">
      <button
        ref={trigger}
        type="button"
        className={`nav-item ni-nav-item${active ? " active" : ""}${collapsed ? " rail-peek-item" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={collapsed || unseen ? label : undefined}
        data-rail-peek={collapsed ? "" : undefined}
        data-rail-active={collapsed && active ? "true" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="nav-icon-frame">
          <Bell size={18} aria-hidden />
          {collapsed && unseen ? <span className="ni-nav-dot" aria-hidden /> : null}
        </span>
        <span className={collapsed ? "rail-flyout" : undefined}>Notifications</span>
        {!collapsed && unseen ? (
          <span className="nav-item-count" aria-hidden>
            {unseen > 99 ? "99+" : unseen}
          </span>
        ) : null}
      </button>
      {open ? (
        <NotificationsPanel
          workspaceId={workspaceId}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
