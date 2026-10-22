import { afterEach, describe, expect, it, vi } from "vitest";

import { createAvailabilityService } from "./availability/availability-service";
import { createCommunicationService } from "./communications/communication-service";
import { createEmployeeHubService } from "./employee-hub/employee-hub-service";
import { createEmployeeCreateService } from "./employees/employee-create-service";
import { createEmployeeInvitationService } from "./employees/invitation-service";
import { createEmployeeDirectoryService } from "./employees/employee-directory-service";
import { createScheduleRequestsService } from "./schedule/schedule-requests-service";
import { createDocumentTypesService } from "./settings/document-types-service";
import { createJobsManagementService } from "./settings/jobs-management-service";
import { createOrganizationSettingsService } from "./settings/organization-settings-service";
import { createSignatureSettingsService } from "./settings/signature-settings-service";
import { createNotificationSettingsService } from "./notification-settings/notification-settings-service";
import { createOnboardingApprovalService } from "./settings/onboarding-approval-service";
import { createShiftExchangesService } from "./shift-exchanges/shift-exchanges-service";
import { createDocumentLifecycleServiceWithClient } from "./employees/document-lifecycle-service";
import { createNotificationsService } from "./notifications/notifications-service";
import { createLineupService } from "./lineup/lineup-service";
import { createAvatarService } from "./avatars/avatar-service";
import { createTimeOffRequestsService } from "./time-off/time-off-requests-service";

// BL-134: whatever the database says goes through rpcFailure, so a refusal
// keeps its status and machine key and Postgres's own sentence never reaches
// the screen. One call per service; the error is the database's.
const database = vi.hoisted(() => ({ error: null as unknown }));
vi.mock("@supabase/supabase-js", () => {
  const answer = () => Promise.resolve({ data: null, error: database.error });
  const chain: object = new Proxy(() => chain, {
    get: (_target, key) =>
      key === "then"
        ? (...args: Parameters<Promise<unknown>["then"]>) => answer().then(...args)
        : chain,
    apply: () => chain,
  });
  return { createClient: () => ({ rpc: answer, from: () => chain, schema: () => chain }) };
});
afterEach(() => {
  database.error = null;
});

const options = { url: "http://localhost", serviceRoleKey: "test-only" };
const actor = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const id = "98020000-0000-4000-8000-000000000001";
const input = { actorUserId: actor, workspaceId: workspace } as never;
const createOptions = { ...options, appUrl: "https://app.example.test", resendApiKey: "test-key", production: true };
const newEmployee = {
  request_id: id,
  invite_access: { employee_role_id: id, management_role_id: null, managed_location_ids: [] },
  employee: {
    first_name: "Ada", last_name: "Lovelace", preferred_name: "", invitation_email: "ada@example.test",
    start_date: "", internal_note: "", location_ids: [id], primary_location_id: id, job_ids: [id],
    primary_job_id: id, is_remote: true, expected_revision: null,
  },
};
const documentsClient = {
  rpc: () => Promise.resolve({ data: null, error: database.error }),
  auth: { getUser: () => Promise.resolve({ data: { user: { id: actor } }, error: null }) },
} as never;
const jobsClient = {
  rpc: () => Promise.resolve({ data: null, error: database.error }),
} as never;

const calls: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
  ["availability", () => createAvailabilityService(options).readWeekly(actor, workspace)],
  ["communications", () => createCommunicationService(options).getAnnouncements(input)],
  ["employee hub", () => createEmployeeHubService(options).getPersonalTasks(input)],
  ["employee create", () => createEmployeeCreateService(createOptions).create(actor, workspace, newEmployee as never)],
  ["invitation access", () => createEmployeeInvitationService(createOptions).updateAccess({
    actorUserId: actor, workspaceId: workspace, employeeId: id,
    access: { employee_role_id: id, management_role_id: null, managed_location_ids: [] },
  })],
  ["employee directory", () => createEmployeeDirectoryService(options).list(input)],
  ["schedule requests", () => createScheduleRequestsService(options).get(input)],
  ["document types", () => createDocumentTypesService(options).targetOptions(input)],
  ["jobs management", () => createJobsManagementService(jobsClient).deleteJob(input, id)],
  ["organization settings", () => createOrganizationSettingsService(options).readSchedulingSettings(input)],
  ["signature settings", () => createSignatureSettingsService(options).approveRetentionPolicy({ actorUserId: actor, workspaceId: workspace, policyId: id })],
  ["notification preferences", () => createNotificationSettingsService(options).readPreferences(input)],
  ["notification settings", () => createNotificationSettingsService(options).saveWorkspaceSettings({ actorUserId: actor, workspaceId: workspace, settings: { email_enabled: true, push_enabled: true, muted_types: [] } })],
  ["onboarding approval", () => createOnboardingApprovalService(options).save({ actorUserId: actor, workspaceId: workspace, finalApprovalRequired: false })],
  ["shift exchanges", () => createShiftExchangesService(options).read(actor, workspace, false)],
  ["notifications", () => createNotificationsService(options).counts(input)],
  ["employee documents", () => createDocumentLifecycleServiceWithClient(documentsClient).list("token", { workspaceId: workspace, selfOnly: false })],
  ["lineup", () => createLineupService(options).myLineups({ actorUserId: actor, workspaceId: workspace, date: "2028-09-11" })],
  ["lineup day", () => createLineupService(options).day({ actorUserId: actor, workspaceId: workspace, date: "2028-09-11" })],
  ["own avatar", () => createAvatarService(options).own(input)],
  ["last avatar", () => createAvatarService(options).last(input)],
  ["my time off", () => createTimeOffRequestsService(options).mine(input)],
  ["ask time off", () => createTimeOffRequestsService(options).ask({ actorUserId: actor, workspaceId: workspace, request: {
    kind_of_leave: "vacation", start_date: "2028-09-11", end_date: "2028-09-11", all_day: true, start_time: null, end_time: null,
    note: null, expected_timezone: "America/Los_Angeles", client_key: id } })],
  ["withdraw time off", () => createTimeOffRequestsService(options).withdraw({ actorUserId: actor, workspaceId: workspace, requestId: id, expectedRevision: 1 })],
];

describe.each(calls)("%s service", (_name, call) => {
  it("answers a non-member with 404 and authz.not_member", async () => {
    database.error = { message: "Not allowed", code: "42501", hint: "authz.not_member", details: null };
    await expect(call()).rejects.toMatchObject({ statusCode: 404, reason: "authz.not_member" });
  });

  it("keeps an authz reason on a 403", async () => {
    database.error = { message: "Not allowed", code: "42501", hint: "authz.out_of_scope", details: null };
    await expect(call()).rejects.toMatchObject({ statusCode: 403, reason: "authz.out_of_scope" });
  });

  it("swaps Postgres's own sentence for a plain one", async () => {
    database.error = { message: "permission denied for table employees", code: "42501", hint: null, details: null };
    await expect(call()).rejects.toMatchObject({ statusCode: 403, message: "Not allowed" });
  });

  it("answers a code nobody raises on purpose with 500", async () => {
    database.error = { message: 'relation "app_private.x" does not exist', code: "42P01", hint: null, details: null };
    await expect(call()).rejects.toMatchObject({ statusCode: 500, message: "Internal server error" });
  });
});
