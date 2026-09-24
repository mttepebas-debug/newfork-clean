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
import { NavLink, Navigate, Outlet, useLocation } from "react-router";
import type { Permission } from "@newfork/shared";
import { useAuth } from "../auth/AuthContext";
import { settingsEntryPermissions } from "../auth/PermissionRoute";

const groups = [
  {
    label: "Organization",
    items: [
      {
        to: "/app/settings/general",
        label: "General",
        icon: Settings,
        permissions: ["settings.general.read"],
      },
      {
        to: "/app/settings/locations",
        label: "Locations",
        icon: MapPin,
        permissions: ["settings.locations.read"],
      },
      {
        to: "/app/settings/jobs",
        label: "Jobs",
        icon: BriefcaseBusiness,
        permissions: ["settings.jobs.read"],
      },
      {
        to: "/app/settings/notifications",
        label: "Notifications",
        icon: Bell,
        permissions: [
          "notifications.settings.read",
          "notifications.settings.write",
        ],
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
        permissions: ["settings.schedule_rules.read"],
      },
      {
        to: "/app/settings/scheduling/conflicts",
        label: "Conflict handling",
        icon: ShieldAlert,
        permissions: ["schedule.conflict_rules.manage"],
      },
      {
        to: "/app/settings/scheduling/shift-types",
        label: "Shift catalog",
        icon: CalendarClock,
        permissions: ["settings.shift_catalog.read"],
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
        permissions: ["roles.read"],
      },
      {
        to: "/app/settings/documents",
        label: "Documents",
        icon: FileText,
        permissions: ["documents.read"],
      },
      {
        to: "/app/settings/acknowledgements",
        label: "Acknowledgements",
        icon: ScrollText,
        permissions: ["signature_templates.read"],
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
        permissions: [],
      },
    ],
  },
] as const;

export default function SettingsLayout() {
  const { context } = useAuth();
  const location = useLocation();
  if (
    !context ||
    !settingsEntryPermissions.some((permission) =>
      context.permissions.includes(permission),
    )
  ) {
    return <Navigate to="/app" replace />;
  }

  const permissions = new Set<Permission>(context.permissions);
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.permissions.length === 0 ||
          item.permissions.some((permission) => permissions.has(permission)),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="organization-settings">
      <aside className="settings-rail">
        <div className="settings-rail-title">
          <SlidersHorizontal size={18} aria-hidden />
          <strong>Settings</strong>
        </div>
        <nav aria-label="Organization settings">
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
      </aside>
      <main className="settings-content">
        <Outlet />
      </main>
    </div>
  );
}
