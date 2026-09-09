import type { QueryClient, QueryKey } from "@tanstack/react-query";

const tenantScopedQueryPrefixes = new Set([
  "announcements",
  "availability-board",
  "employee-detail",
  "employee-hub",
  "employee-personal-tasks",
  "employee-onboarding-review",
  "employee-reference-data",
  "employee-schedule",
  "employee-time-tracking",
  "employees",
  "document-types",
  "important-dates",
  "kiosk-management",
  "lineup",
  "manager-time-entries",
  "notification-settings",
  "notification-preferences",
  "notifications",
  "organization-jobs",
  "organization-locations",
  "owner-setup-checklist",
  "roles",
  "schedule-drafts",
  "schedule-lineups",
  "schedule-pending-ops",
  "schedule-read",
  "schedule-requests",
  "schedule-templates",
  "scheduling-settings",
  "shift-exchanges",
  "shift-labels",
  "shift-types",
  "signature-settings",
  "workspace-action-center",
  "workspace-attention",
  "workspace-dashboard",
]);

export function isTenantScopedQueryKey(queryKey: QueryKey): boolean {
  const [prefix] = queryKey;
  return typeof prefix === "string" && tenantScopedQueryPrefixes.has(prefix);
}

export async function clearTenantQueriesForOrganizationSwitch(
  queryClient: QueryClient,
): Promise<void> {
  const filters = {
    predicate: (query: { queryKey: QueryKey }) =>
      isTenantScopedQueryKey(query.queryKey),
  };
  await queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
}
