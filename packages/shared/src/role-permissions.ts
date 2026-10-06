import type { Permission, WorkspaceRole } from "./index";

export interface RolePermissionArea {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly read: readonly Permission[];
  readonly edit: readonly Permission[];
  readonly employee?: boolean;
  readonly adminOnly?: boolean;
}

export const rolePermissionGroups: readonly {
  readonly label: string;
  readonly areas: readonly RolePermissionArea[];
}[] = [
  {
    label: "Schedule",
    areas: [
      {
        id: "schedule",
        label: "Schedule",
        description: "Schedules for accessible locations.",
        read: ["schedule.read"],
        edit: ["schedule.manage"],
      },
      {
        id: "publishing",
        label: "Publishing",
        description: "Publish schedule changes to employees.",
        read: ["schedule.read"],
        edit: ["schedule.publish"],
      },
      {
        id: "conflict-rules",
        label: "Manage conflict rules",
        description: "View and change workspace conflict handling.",
        read: [],
        edit: ["schedule.conflict_rules.manage"],
      },
      {
        id: "availability",
        label: "Availability",
        description: "Review and manage employee availability.",
        read: ["availability.read"],
        edit: ["availability.manage"],
      },
      {
        id: "templates",
        label: "Templates",
        description: "Saved schedule templates.",
        read: ["schedule.templates.read"],
        edit: ["schedule.templates.manage"],
      },
      {
        id: "export",
        label: "Export",
        description: "Download schedules for accessible locations.",
        read: ["schedule.export"],
        edit: [],
      },
    ],
  },
  {
    label: "Requests",
    areas: [
      {
        id: "time-off",
        label: "Time off",
        description: "View requests and record decisions.",
        read: ["schedule.time_off_requests.read"],
        edit: ["schedule.time_off_requests.manage"],
      },
      {
        id: "shift-changes",
        label: "Shift changes",
        description: "Review release and exchange requests.",
        read: ["schedule.shift_change_requests.read"],
        edit: ["schedule.shift_change_requests.manage"],
      },
    ],
  },
  {
    label: "Employees",
    areas: [
      {
        id: "employees",
        label: "Operational records",
        description:
          "Employee details, assignments, onboarding and archiving. One shared location permits changes to the common record.",
        read: ["employees.read"],
        edit: [
          "employees.manage",
          "employees.archive",
          "employee_onboarding.review",
        ],
      },
      {
        id: "access",
        label: "Invitations & access",
        description:
          "Invite employees, assign eligible roles and remove access.",
        read: ["employee_access.read"],
        edit: ["employee_access.manage"],
      },
      {
        id: "private",
        label: "Private information",
        description: "Personal contact details and profile review.",
        read: ["employees.private.read"],
        edit: ["employees.private.manage"],
      },
      {
        id: "employee-documents",
        label: "Employee documents",
        description:
          "Open documents; edit includes approval, rejection and correction requests.",
        read: ["employee_documents.read"],
        edit: ["employee_documents.review"],
      },
    ],
  },
  {
    label: "Communication",
    areas: [
      {
        id: "announcements",
        label: "Announcements",
        description:
          "Managers can manage announcements only for their assigned locations.",
        read: ["announcements.read"],
        edit: ["announcements.manage"],
      },
      {
        id: "important-dates",
        label: "Important dates",
        description: "Important dates for accessible locations.",
        read: ["important_dates.read"],
        edit: ["important_dates.manage"],
      },
    ],
  },
  {
    label: "Organization settings",
    areas: [
      ...(
        [
          ["general", "General"],
          ["locations", "Locations"],
          ["jobs", "Jobs & departments"],
          ["shift_catalog", "Shift catalog"],
          ["schedule_rules", "Schedule rules"],
        ] as const
      ).map(([id, label]) => ({
        id,
        label,
        description: "Organization-wide: this access can affect all locations.",
        read: [`settings.${id}.read` as Permission],
        edit: [`settings.${id}.manage` as Permission],
      })),
      {
        id: "requirements",
        label: "Document requirements",
        description:
          "Organization-wide document requirements; employee documents are controlled separately.",
        read: ["documents.read"],
        edit: ["documents.manage"],
      },
      {
        id: "notifications",
        label: "Notification settings",
        description:
          "Organization-wide delivery settings. Personal inbox and preferences stay available.",
        read: ["notifications.settings.read"],
        edit: ["notifications.settings.write"],
      },
      {
        id: "roles",
        label: "Roles & permissions",
        description:
          "Only the Owner can authorize Admin to manage lower roles.",
        read: ["roles.read"],
        edit: ["roles.manage"],
        adminOnly: true,
      },
    ],
  },
  {
    label: "Personal access",
    areas: [
      {
        id: "personal-schedule",
        label: "My schedule",
        description: "Published schedules in the employee experience.",
        read: ["schedule.read"],
        edit: [],
        employee: true,
      },
      {
        id: "personal-announcements",
        label: "Announcements",
        description: "Announcements addressed to this employee.",
        read: ["announcements.read"],
        edit: [],
        employee: true,
      },
    ],
  },
];

export const rolePermissionDependencies: Readonly<
  Partial<Record<Permission, readonly Permission[]>>
> = {
  "schedule.manage": ["schedule.read"],
  "schedule.publish": ["schedule.manage"],
  "schedule.conflict_rules.manage": ["settings.schedule_rules.read"],
  "schedule.templates.read": ["schedule.read"],
  "schedule.templates.manage": ["schedule.templates.read", "schedule.manage"],
  "schedule.export": ["schedule.read"],
  "schedule.time_off_requests.read": ["schedule.read"],
  "schedule.time_off_requests.manage": ["schedule.time_off_requests.read"],
  "schedule.shift_change_requests.read": ["schedule.read"],
  "schedule.shift_change_requests.manage": [
    "schedule.shift_change_requests.read",
  ],
  "availability.read": ["employees.read"],
  "availability.manage": ["availability.read"],
  "employees.manage": ["employees.read"],
  "employees.archive": ["employees.read"],
  "employee_onboarding.review": ["employees.read"],
  "employee_access.read": ["employees.read"],
  "employee_access.manage": ["employee_access.read", "roles.read"],
  "employees.private.read": ["employees.read"],
  "employees.private.manage": ["employees.private.read"],
  "employee_documents.read": ["employees.read"],
  "employee_documents.review": ["employee_documents.read"],
  "announcements.manage": ["announcements.read"],
  "important_dates.manage": ["important_dates.read"],
  "documents.manage": ["documents.read"],
  "roles.manage": ["roles.read"],
  "notifications.settings.write": ["notifications.settings.read"],
  ...Object.fromEntries(
    ["general", "locations", "jobs", "shift_catalog", "schedule_rules"].map(
      (id) => [`settings.${id}.manage`, [`settings.${id}.read`]],
    ),
  ),
};

export const personalRolePermissions: readonly Permission[] = [
  "workspace.read",
  "notifications.read",
  "notifications.read_own",
  "notifications.preferences.write_own",
];
export const employeeEligiblePermissions: readonly Permission[] = [
  ...personalRolePermissions,
  "schedule.read",
  "announcements.read",
];

export function permissionGroupsForRole(accessClass: WorkspaceRole) {
  return rolePermissionGroups
    .map((group) => ({
      ...group,
      areas: group.areas.filter((area) =>
        accessClass === "employee"
          ? area.employee
          : !area.employee &&
            (!area.adminOnly ||
              accessClass === "owner" ||
              accessClass === "admin"),
      ),
    }))
    .filter((group) => group.areas.length > 0);
}

/** Toggle only the requested grants and their dependencies; never seed defaults into an existing role. */
export function toggleRolePermissions(
  current: readonly Permission[],
  keys: readonly Permission[],
  checked: boolean,
): Permission[] {
  const next = new Set(current);
  const add = (key: Permission) => {
    next.add(key);
    for (const dependency of rolePermissionDependencies[key] ?? [])
      if (!next.has(dependency)) add(dependency);
  };
  for (const key of keys) {
    if (checked) add(key);
    else next.delete(key);
  }
  if (!checked) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const key of next)
        if (
          (rolePermissionDependencies[key] ?? []).some(
            (dependency) => !next.has(dependency),
          )
        ) {
          next.delete(key);
          changed = true;
        }
    }
  }
  return [...next].sort();
}
