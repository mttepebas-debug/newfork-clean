import type { NotificationFilter } from "@newfork/shared";
import { toast } from "@newfork/ui";
import { ArrowLeft, ArrowRight, Bell, Settings2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { CatalogPageHeader } from "../views/CatalogPageHeader";
import { managementNotificationsPath, useViewAddress } from "../shell/view-address";
import { NotificationList, NotificationTabs } from "./NotificationList";
import { useMarkNotificationsRead, useNotificationCounts } from "./notifications-data";
import "./notifications.css";

/** A person's own notification choices (Account → Notifications). */
export const notificationSettingsPath = "/account/preferences/notifications";

function useReadAll(workspaceId: string) {
  const read = useMarkNotificationsRead(workspaceId);
  const unread = useNotificationCounts(workspaceId).data?.unread_count ?? 0;
  return {
    disabled: unread === 0 || read.isPending,
    run: () =>
      read.mutate({ all: true }, { onSuccess: () => toast.success("All marked as read"), onError: () => toast.error("Couldn't mark them as read") }),
  };
}

/**
 * Desktop: the panel the left menu's Notifications opens beside the menu
 * (variant A). The page behind stays; Escape, the close button and a click
 * outside close it and focus goes back to the menu item.
 */
export function NotificationsPanel({
  workspaceId,
  onClose,
}: {
  readonly workspaceId: string;
  readonly onClose: () => void;
}) {
  const { context } = useAuth();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  const readAll = useReadAll(workspaceId);
  // See all stays in the view on screen (NOTICE-VIEW).
  const allNotices = useViewAddress()(managementNotificationsPath);
  useEffect(() => {
    panel.current?.focus();
  }, []);
  return (
    <>
      <div className="ni-scrim" onClick={onClose} aria-hidden />
      <section
        ref={panel}
        className="ni-panel"
        role="dialog"
        aria-labelledby={`${panelId}-title`}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        <div className="ni-panel-head">
          <h2 id={`${panelId}-title`}>Notifications</h2>
          <div className="ni-panel-tools">
            <button type="button" className="ni-link" disabled={readAll.disabled} onClick={readAll.run}>
              Mark all as read
            </button>
            <Link className="ni-icon" to={notificationSettingsPath} onClick={onClose} aria-label="Notification settings" title="Notification settings">
              <Settings2 size={17} aria-hidden />
            </Link>
            <button type="button" className="ni-icon" onClick={onClose} aria-label="Close">
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>
        <NotificationTabs workspaceId={workspaceId} filter={filter} onChange={setFilter} panelId={panelId} />
        <div className="ni-panel-body">
          <NotificationList workspaceId={workspaceId} viewerId={context?.userId} filter={filter} panelId={panelId} onNavigate={onClose} />
        </div>
        <div className="ni-panel-foot">
          <Link className="ni-link" to={allNotices} onClick={onClose}>
            See all notifications <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}

/** Phone: the bell opens the list full screen; Back returns where the person was. */
export function NotificationsSheet({
  workspaceId,
  onClose,
}: {
  readonly workspaceId: string;
  readonly onClose: () => void;
}) {
  const { context } = useAuth();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const dialog = useRef<HTMLDialogElement>(null);
  const panelId = useId();
  const readAll = useReadAll(workspaceId);
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal?.();
    return () => node?.close?.();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ni-sheet"
      aria-labelledby={`${panelId}-title`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ni-sheet-head">
        <button type="button" className="ni-icon" onClick={onClose} aria-label="Back">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <h2 id={`${panelId}-title`}>Notifications</h2>
        <Link className="ni-icon" to={notificationSettingsPath} onClick={onClose} aria-label="Notification settings">
          <Settings2 size={19} aria-hidden />
        </Link>
      </div>
      <NotificationTabs workspaceId={workspaceId} filter={filter} onChange={setFilter} panelId={panelId} />
      <div className="ni-sheet-body">
        <NotificationList workspaceId={workspaceId} viewerId={context?.userId} filter={filter} panelId={panelId} onNavigate={onClose} />
        <button type="button" className="ni-link ni-sheet-readall" disabled={readAll.disabled} onClick={readAll.run}>
          Mark all as read
        </button>
      </div>
    </dialog>
  );
}

/** The full page (See all notifications), at /app/notifications and in the employee view /app/employee-hub/notifications. */
export function NotificationsPage() {
  const { context } = useAuth();
  const workspaceId = context?.workspace.id ?? "";
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const panelId = useId();
  const readAll = useReadAll(workspaceId);
  if (!context) return null;
  return (
    <section className="settings-page ni-page list-page" aria-labelledby="notifications-title">
      <CatalogPageHeader
        eyebrow="UPDATES. ALERTS. ACTIONS."
        title="Notifications"
        titleId="notifications-title"
        description={`Everything sent to you in ${context.workspace.name}, newest first. Kept for 90 days.`}
        action={
          <>
            <button type="button" className="nf-button secondary-button" disabled={readAll.disabled} onClick={readAll.run}>
              Mark all as read
            </button>
            <Link className="nf-button secondary-button ni-settings-link" to={notificationSettingsPath}>
              <Settings2 size={16} aria-hidden /> Settings
            </Link>
          </>
        }
      />
      <div className="ni-page-bar">
        <NotificationTabs workspaceId={workspaceId} filter={filter} onChange={setFilter} panelId={panelId} />
      </div>
      <div className="ni-page-list">
        <NotificationList workspaceId={workspaceId} viewerId={context.userId} filter={filter} panelId={panelId} wide />
      </div>
    </section>
  );
}

/** Phone: the bell with the Unread tab's count; it opens the full-screen list. */
export function NotificationBell({ workspaceId, className }: { readonly workspaceId: string; readonly className?: string }) {
  const unread = useNotificationCounts(workspaceId).data?.unread_count ?? 0;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className ? `ni-bell ${className}` : "ni-bell"}
        aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen(true)}
      >
        <Bell size={20} aria-hidden />
        {unread ? (
          <span className="ni-bell-count" aria-hidden>
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <NotificationsSheet
          workspaceId={workspaceId}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
