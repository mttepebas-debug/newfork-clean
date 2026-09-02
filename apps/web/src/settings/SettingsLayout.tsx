import {
  BriefcaseBusiness,
  CalendarClock,
  Clock3,
  FileText,
  LifeBuoy,
  MapPin,
  MonitorSmartphone,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { NavLink, Navigate, Outlet } from "react-router";
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
        permissions: ["workspace.manage"],
      },
      {
        to: "/app/settings/locations",
        label: "Locations",
        icon: MapPin,
        permissions: ["workspace.manage"],
      },
      {
        to: "/app/settings/jobs",
        label: "Jobs",
        icon: BriefcaseBusiness,
        permissions: ["workspace.manage"],
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
        permissions: ["workspace.manage"],
      },
      {
        to: "/app/settings/scheduling/shift-types",
        label: "Shift types",
        icon: Clock3,
        permissions: ["workspace.manage"],
      },
      {
        to: "/app/important-dates",
        label: "Important dates",
        icon: CalendarClock,
        permissions: ["workspace.manage", "schedule.read"],
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
    label: "Time clock",
    items: [
      {
        to: "/app/settings/kiosk",
        label: "Kiosk",
        icon: MonitorSmartphone,
        permissions: [
          "kiosk.device.enroll.location",
          "kiosk.device.read.location",
          "kiosk.device.revoke.location",
          "kiosk.pin.reset.location",
          "kiosk.audit.read.location",
        ],
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
                    className={({ isActive }) =>
                      `settings-nav-item${isActive ? " active" : ""}`
                    }
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
