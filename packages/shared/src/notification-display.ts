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

export const notificationCategoryDisplay = {
  security: {
    label: "Account & security",
    description: "Account, access, and security updates.",
    sortOrder: 90,
  },
  schedule: {
    label: "Schedule",
    description: "Published schedules and schedule-related changes.",
    sortOrder: 10,
  },
  requests: {
    label: "Requests",
    description:
      "Time-off and shift-change requests that need review or changed status.",
    sortOrder: 20,
  },
  time_tracking: {
    label: "Time tracking",
    description: "Time entry corrections and review outcomes.",
    sortOrder: 30,
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
      "Choose whether announcements for your role or location appear in your inbox.",
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
      "Choose whether expiring employee document alerts appear in your inbox.",
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
      "Choose whether time-off requests that need your review appear in your inbox.",
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
      "Choose whether updates about your own time-off requests appear in your inbox.",
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
      "Choose whether shift change requests that need your review appear in your inbox.",
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
      "Choose whether updates about shift changes involving you appear in your inbox.",
  },
  "time_tracking.correction.submitted": {
    label: "Time correction requests to review",
    shortLabel: "Time corrections",
    description:
      "Alerts reviewers when an employee submits a time entry correction.",
    categoryLabel: notificationCategoryDisplay.time_tracking.label,
    categoryDescription: notificationCategoryDisplay.time_tracking.description,
    audienceLabel: "Managers and reviewers for time corrections",
    actionLabel: "Review correction",
    adminDescription:
      "Controls review alerts for newly submitted time entry corrections.",
    preferenceDescription:
      "Choose whether time correction requests that need your review appear in your inbox.",
  },
  "time_tracking.correction.decided": {
    label: "Time correction decisions",
    shortLabel: "Time correction decisions",
    description:
      "Alerts employees when their requested time correction is approved or denied.",
    categoryLabel: notificationCategoryDisplay.time_tracking.label,
    categoryDescription: notificationCategoryDisplay.time_tracking.description,
    audienceLabel: "Employees who requested the correction",
    actionLabel: "View time entries",
    adminDescription:
      "Controls decision updates sent back to employees after a time correction is reviewed.",
    preferenceDescription:
      "Choose whether decisions about your own time corrections appear in your inbox.",
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
      "Choose whether newly published schedules for your shifts appear in your inbox.",
  },
  "schedule.staffing.offer_updated": {
    label: "Staffing offers",
    shortLabel: "Staffing offers",
    description:
      "Offers and responses that need employee or manager attention.",
    categoryLabel: notificationCategoryDisplay.schedule.label,
    categoryDescription: notificationCategoryDisplay.schedule.description,
    audienceLabel: "Invited employees and authorized staffing managers",
    actionLabel: "View offer",
    adminDescription:
      "Controls in-app updates when a staffing offer is sent or accepted.",
    preferenceDescription:
      "Choose whether staffing offers and their responses appear in your inbox.",
  },
  "schedule.staffing.offer_closed": {
    label: "Closed staffing offers",
    shortLabel: "Closed staffing offers",
    description:
      "Offers that were declined, cancelled or filled by someone else.",
    categoryLabel: notificationCategoryDisplay.schedule.label,
    categoryDescription: notificationCategoryDisplay.schedule.description,
    audienceLabel: "Invited employees and authorized staffing managers",
    actionLabel: "View offer",
    adminDescription:
      "Controls in-app updates when a staffing offer is declined, cancelled or filled.",
    preferenceDescription:
      "Choose whether closed staffing offers appear in your inbox.",
  },
  "schedule.staffing.assignment_changed": {
    label: "Assignment changes",
    shortLabel: "Assignment changes",
    description:
      "Confirmed staffing changes to your published work assignments.",
    categoryLabel: notificationCategoryDisplay.schedule.label,
    categoryDescription: notificationCategoryDisplay.schedule.description,
    audienceLabel: "Affected employees and authorized staffing managers",
    actionLabel: "View assignment",
    adminDescription:
      "Controls in-app updates after a manager changes a staffing assignment.",
    preferenceDescription:
      "Choose whether confirmed assignment changes appear in your inbox.",
  },
} as const satisfies Record<NotificationTypeKey, NotificationTypeDisplay>;

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
