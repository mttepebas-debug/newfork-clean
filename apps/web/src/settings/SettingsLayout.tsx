import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  FileText,
  LifeBuoy,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { useFrozenTop } from "../shell/useFrozenTop";
import { PageOutline } from "../shell/LoadState";
import { usePhonePageMenu } from "../shell/usePhonePageMenu";
import { NoAccessRoute } from "../shell/NoAccessState";
import { useAuth } from "../auth/AuthContext";
import {
  canEnterSettings,
  canOpenSettingsPage,
} from "./settings-access";

const groups = [
  {
    label: "Workspace",
    items: [
      {
        to: "/app/settings/general",
        label: "General",
        icon: Settings,
        page: "general",
      },
      {
        to: "/app/settings/locations",
        label: "Locations",
        icon: MapPin,
        page: "locations",
      },
      {
        to: "/app/settings/jobs",
        label: "Jobs",
        icon: BriefcaseBusiness,
        page: "jobs",
      },
      {
        to: "/app/settings/notifications",
        label: "Notifications",
        icon: Bell,
        page: "notifications",
      },
    ],
  },
  {
    label: "Scheduling",
    items: [
      {
        to: "/app/settings/scheduling",
        label: "Schedule rules",
        icon: CalendarClock,
        end: true,
        page: "scheduling",
      },
      {
        to: "/app/settings/scheduling/conflicts",
        label: "Conflict handling",
        icon: ShieldAlert,
        page: "conflicts",
      },
      {
        to: "/app/settings/scheduling/shift-types",
        label: "Shift catalog",
        icon: CalendarClock,
        page: "shiftCatalog",
      },
    ],
  },
  {
    label: "Access",
    items: [
      {
        to: "/app/settings/roles",
        label: "Roles & permissions",
        icon: ShieldCheck,
        page: "roles",
      },
      {
        to: "/app/settings/documents",
        label: "Documents",
        icon: FileText,
        page: "documents",
      },
      {
        to: "/app/settings/acknowledgements",
        label: "Acknowledgements",
        icon: ScrollText,
        page: "acknowledgements",
      },
    ],
  },
  {
    label: "Help",
    items: [
      {
        to: "/app/settings/support",
        label: "Support",
        icon: LifeBuoy,
      },
    ],
  },
] as const;

export default function SettingsLayout() {
  const { context } = useAuth();
  const location = useLocation();
  const [content, setContent] = useState<HTMLElement | null>(null);
  useFrozenTop(content);
  // On a phone the menu sits under the page heading's line (Mert 2026-10-17).
  const menuSlot = usePhonePageMenu(content);
  // Nobody's settings: the no-access card, not a silent trip home (Mert 2026-10-14).
  if (!canEnterSettings(context)) return <NoAccessRoute subject="Settings" />;

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      // A link shows exactly when its page opens (SettingsPageRoute); Support
      // is open to whoever may enter Settings.
      items: group.items.filter(
        (item) =>
          !("page" in item) ||
          canOpenSettingsPage(context, item.page),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const menu = (
    <nav aria-label="Workspace settings">
      {visibleGroups.map((group) => (
        <div className="settings-nav-group" key={group.label}>
          <span className="settings-nav-label">{group.label}</span>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : undefined}
                className={({ isActive }) => {
                  const shiftCatalogActive =
                    item.label === "Shift catalog" &&
                    location.pathname.endsWith("/shift-labels");
                  return `settings-nav-item${isActive || shiftCatalogActive ? " active" : ""}`;
                }}
              >
                <Icon size={17} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="organization-settings">
      <aside className="settings-rail">
        <div className="settings-rail-title">
          <SlidersHorizontal size={18} aria-hidden />
          <strong>Settings</strong>
        </div>
        {menuSlot ? null : menu}
      </aside>
      <main className="settings-content" ref={setContent}>
        <Suspense fallback={<PageOutline />}>
          <Outlet />
        </Suspense>
      </main>
      {menuSlot ? createPortal(menu, menuSlot) : null}
    </div>
  );
}
