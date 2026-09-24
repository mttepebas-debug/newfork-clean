import type {
  NotificationChannel,
  NotificationEventClass,
  NotificationTypeKey,
} from "./notification-catalog";

export type NotificationCategoryDisplay = {
  label: string;
  description: string;
  sortOrder: number;
};

export type NotificationTypeDisplay = {
  label: string;
  shortLabel: string;
  description: string;
  categoryLabel: string;
  categoryDescription: string;
  audienceLabel: string;
  actionLabel: string;
  adminDescription: string;
  preferenceDescription: string;
};

type DisplayedNotificationTypeKey =
  | NotificationTypeKey
  | "availability.review_required"
  | "availability.status_changed"
  | "availability.weekly_updated";

export const notificationCategoryDisplay = {
  security: {
    label: "Account & security",
    description: "Account, access, and security updates.",
    sortOrder: 90,
  },
  schedule: {
    label: "Schedule",
    description: "Published schedules.",
    sortOrder: 10,
  },
  requests: {
    label: "Requests",
    description: "Time off, availability, and shift change updates.",
    sortOrder: 20,
  },
  payroll: {
    label: "Payroll",
    description: "Payroll readiness, export, and deadline updates.",
    sortOrder: 40,
  },
  people: {
    label: "People",
    description: "Employee onboarding, access, and team changes.",
    sortOrder: 50,
  },
  communications: {
    label: "Announcements",
    description: "Workspace posts shared with selected roles or locations.",
    sortOrder: 60,
  },
  system: {
    label: "System",
    description: "Product notices and workspace configuration updates.",
    sortOrder: 100,
  },
} as const satisfies Record<
  NotificationEventClass,
  NotificationCategoryDisplay
>;

export const notificationTypeDisplay = {
  "security.account_invitation_cancelled": {
    label: "Cancelled employee invitations",
    shortLabel: "Cancelled invitations",
    description:
      "Alerts employee-access managers when account deletion cancels a pending invitation.",
    categoryLabel: notificationCategoryDisplay.security.label,
    categoryDescription: notificationCategoryDisplay.security.description,
    audienceLabel: "Managers who can manage employee access",
    actionLabel: "View employees",
    adminDescription:
      "Controls alerts sent when an account deletion request revokes a pending employee invitation.",
    preferenceDescription:
      "Get notified when a pending employee invitation is cancelled.",
  },
  "communications.announcement.available": {
    label: "New announcements",
    shortLabel: "Announcements",
    description: "Posts shared with your role or location in this workspace.",
    categoryLabel: notificationCategoryDisplay.communications.label,
    categoryDescription: notificationCategoryDisplay.communications.description,
    audienceLabel: "Members targeted by the announcement",
    actionLabel: "View announcements",
    adminDescription:
      "Controls whether targeted workspace announcements appear in members' notification inboxes.",
    preferenceDescription:
      "Get notified when an announcement is shared with you.",
  },
  "people.employee_document.expiring": {
    label: "Expiring employee documents",
    shortLabel: "Document expiry",
    description:
      "Alerts managers when an employee document is expired or close to expiring.",
    categoryLabel: notificationCategoryDisplay.people.label,
    categoryDescription: notificationCategoryDisplay.people.description,
    audienceLabel: "Managers who can access the employee record",
    actionLabel: "Open employee",
    adminDescription:
      "Controls in-app alerts for employee documents that are expired or close to expiring.",
    preferenceDescription:
      "Get notified when an employee document has expired or will expire soon.",
  },
  "requests.time_off.submitted": {
    label: "Time-off requests to review",
    shortLabel: "Time-off requests",
    description:
      "Alerts reviewers when an employee submits a time-off request.",
    categoryLabel: notificationCategoryDisplay.requests.label,
    categoryDescription: notificationCategoryDisplay.requests.description,
    audienceLabel: "Managers and reviewers for schedule requests",
    actionLabel: "Review request",
    adminDescription:
      "Controls review alerts for newly submitted time-off requests.",
    preferenceDescription:
      "Get notified when a time-off request needs your review.",
  },
  "requests.time_off.status_changed": {
    label: "Time-off request updates",
    shortLabel: "Time-off updates",
    description:
      "Alerts employees when their time-off request is approved, denied, or updated.",
    categoryLabel: notificationCategoryDisplay.requests.label,
    categoryDescription: notificationCategoryDisplay.requests.description,
    audienceLabel: "Employees who submitted the time-off request",
    actionLabel: "View request",
    adminDescription:
      "Controls status updates sent back to employees after a time-off decision changes.",
    preferenceDescription:
      "Get notified when your time-off request is approved, denied, or updated.",
  },
  "requests.shift_change.submitted": {
    label: "Shift change requests to review",
    shortLabel: "Shift change requests",
    description:
      "Alerts reviewers when an employee submits a shift swap, release, or coverage request.",
    categoryLabel: notificationCategoryDisplay.requests.label,
    categoryDescription: notificationCategoryDisplay.requests.description,
    audienceLabel: "Managers and reviewers for shift change requests",
    actionLabel: "Review request",
    adminDescription:
      "Controls review alerts for newly submitted shift swaps, releases, and coverage requests.",
    preferenceDescription:
      "Get notified when a shift change request needs your review.",
  },
  "requests.shift_change.status_changed": {
    label: "Shift change request updates",
    shortLabel: "Shift change updates",
    description:
      "Alerts employees when a shift change involving them is approved, denied, cancelled, or updated.",
    categoryLabel: notificationCategoryDisplay.requests.label,
    categoryDescription: notificationCategoryDisplay.requests.description,
    audienceLabel: "Employees involved in the shift change",
    actionLabel: "View shift hub",
    adminDescription:
      "Controls status updates sent to employees involved in shift swaps, releases, or coverage requests.",
    preferenceDescription:
      "Get notified when a shift change involving you is approved, denied, cancelled, or updated.",
  },
  "availability.review_required": {
    label: "Availability requests to review",
    shortLabel: "Availability review",
    description: "An employee availability request needs a decision.",
    categoryLabel: notificationCategoryDisplay.requests.label,
    categoryDescription: notificationCategoryDisplay.requests.description,
    audienceLabel: "Managers who review employee availability",
    actionLabel: "Review availability",
    adminDescription:
      "Controls alerts sent when an employee availability request needs review.",
    preferenceDescription:
      "Get notified when an employee availability request needs your review.",
  },
  "availability.status_changed": {
    label: "Your availability updates",
    shortLabel: "Availability updates",
    description: "Changes and decisions about your availability.",
    categoryLabel: notificationCategoryDisplay.requests.label,
    categoryDescription: notificationCategoryDisplay.requests.description,
    audienceLabel: "Employees whose availability changed",
    actionLabel: "View availability",
    adminDescription:
      "Controls updates sent to employees when their availability changes or needs confirmation.",
    preferenceDescription:
      "Get notified when your availability is approved, changed, or needs your confirmation.",
  },
  "availability.weekly_updated": {
    label: "Employee availability changes",
    shortLabel: "Availability changes",
    description: "An employee updated their usual weekly availability.",
    categoryLabel: notificationCategoryDisplay.requests.label,
    categoryDescription: notificationCategoryDisplay.requests.description,
    audienceLabel: "Managers who can view the employee",
    actionLabel: "View employee",
    adminDescription:
      "Controls alerts sent to managers when an employee updates weekly availability.",
    preferenceDescription:
      "Get notified when an employee updates their weekly availability.",
  },
  "schedule.published": {
    label: "Published schedules",
    shortLabel: "Published schedules",
    description: "Alerts employees when a newly published schedule is ready.",
    categoryLabel: notificationCategoryDisplay.schedule.label,
    categoryDescription: notificationCategoryDisplay.schedule.description,
    audienceLabel: "Employees assigned to the published schedule",
    actionLabel: "View schedule",
    adminDescription:
      "Controls in-app alerts sent to employees when a schedule is published.",
    preferenceDescription:
      "Get notified when a new schedule containing your shifts is published.",
  },
} as const satisfies Record<DisplayedNotificationTypeKey, NotificationTypeDisplay>;

export const notificationChannelDisplay = {
  in_app: {
    label: "In-app",
    unavailableLabel: "Shown inside Newfork.",
  },
  email: {
    label: "Email",
    unavailableLabel:
      "Email delivery is not available for this notification yet.",
  },
  push: {
    label: "Push",
    unavailableLabel:
      "Push delivery is not available for this notification yet.",
  },
} as const satisfies Record<
  NotificationChannel,
  { label: string; unavailableLabel: string }
>;

export const notificationLockReasonDisplay: Record<string, string> = {
  available: "Available",
  catalog_channel_unsupported:
    "This delivery channel is not available for this notification yet.",
  organization_policy_denied:
    "Your organization does not allow this delivery channel for this notification.",
  mandatory_in_app: "This notification is always shown in the app.",
  consent_required:
    "This delivery channel needs your consent before it can be used.",
  endpoint_missing: "No delivery destination is set up for this channel yet.",
};

export const notificationSeverityDisplay = {
  info: "Update",
  success: "Completed",
  warning: "Needs attention",
  action_required: "Action needed",
} as const;

export function displayForNotificationType(
  typeKey: string | null | undefined,
): NotificationTypeDisplay | null {
  if (!typeKey) return null;
  return notificationTypeDisplay[typeKey as NotificationTypeKey] ?? null;
}

export function displayForNotificationCategory(
  category: string,
): NotificationCategoryDisplay {
  if (category === "announcement") {
    return notificationCategoryDisplay.communications;
  }
  if (category === "request") {
    return notificationCategoryDisplay.requests;
  }
  return (
    notificationCategoryDisplay[category as NotificationEventClass] ?? {
      label: humanizeIdentifier(category),
      description: "Workspace notification updates.",
      sortOrder: 999,
    }
  );
}

export function labelForNotificationLockReason(reasonCode: string): string {
  return (
    notificationLockReasonDisplay[reasonCode] ?? humanizeIdentifier(reasonCode)
  );
}

export function humanizeIdentifier(value: string): string {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}
