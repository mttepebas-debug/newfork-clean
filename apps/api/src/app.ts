import {
  activeWorkspaceContextSchema,
  healthResponseSchema,
  type NotificationChannelsConfig,
} from "@newfork/shared";
import Fastify from "fastify";
import { createDocumentLifecycleService } from "./employees/document-lifecycle-service";
import { registerDocumentLifecycleRoutes } from "./employees/document-lifecycle-routes";
import { registerTimezoneSuggestionRoutes } from "./settings/timezone-suggestion";
import { z } from "zod";
import { HttpError, replyWithError } from "./http-error.js";
import { initSentry, reportCheckIn, reportOperatorAlert } from "./sentry.js";
import { registerAccountDeletionRoutes } from "./account/account-deletion-routes";
import {
  createAccountDeletionWorker,
  type AccountDeletionWorker,
} from "./account/account-deletion-worker";
import { registerAccountSecurityRoutes } from "./account/account-security-routes";
import { createClient } from "@supabase/supabase-js";
import {
  createPasswordResetSender,
  registerPasswordResetRoutes,
  type PasswordResetClaim,
  type PasswordResetSender,
} from "./account/password-reset";
import {
  createAccountSecurityService,
  type AccountSecurityService,
} from "./account/account-security-service";
import { registerWorkspaceAccountRoutes } from "./account/workspace-account-routes";
import {
  createWorkspaceAccountService,
  type WorkspaceAccountService,
} from "./account/workspace-account-service";
import { registerWorkspaceRetentionRoutes } from "./account/workspace-retention-routes";
import {
  createWorkspaceRetentionWorker,
  type WorkspaceRetentionWorker,
} from "./account/workspace-retention-worker";
import {
  createSupabaseWorkspaceContextResolver,
  resolveActor,
  type WorkspaceContextResolver,
} from "./auth/workspace-context";
import {
  createEmployeeInvitationService,
  type EmployeeInvitationService,
} from "./employees/invitation-service";
import {
  createEmployeeDirectoryService,
  type EmployeeDirectoryService,
} from "./employees/employee-directory-service";
import { registerEmployeeDirectoryRoutes } from "./employees/employee-directory-routes";
import {
  createEmployeeCreateService,
  type EmployeeCreateService,
} from "./employees/employee-create-service";
import {
  createEmployeeOnboardingService,
  type EmployeeOnboardingService,
} from "./employees/onboarding-service";
import { registerEmployeeOnboardingRoutes } from "./employees/onboarding-routes";
import { registerScheduleRoutes } from "./schedule/schedule-routes";
import {
  registerScheduleExportCronRoutes,
  type ScheduleExportCronRouteOptions,
} from "./schedule/schedule-export-cron-routes";
import { registerScheduleRequestsRoutes } from "./schedule/schedule-requests-routes";
import {
  createScheduleRequestsService,
  type ScheduleRequestsService,
} from "./schedule/schedule-requests-service";
import {
  createScheduleReadService,
  type ScheduleReadService,
} from "./schedule/schedule-service";
import { registerEmployeeHubRoutes } from "./employee-hub/employee-hub-routes";
import { registerShiftExchangesRoutes } from "./shift-exchanges/shift-exchanges-routes";
import { createShiftExchangesService } from "./shift-exchanges/shift-exchanges-service";
import { registerAvailabilityRoutes } from "./availability/availability-routes";
import { createAvailabilityService } from "./availability/availability-service";
import {
  createEmployeeHubService,
  type EmployeeHubService,
} from "./employee-hub/employee-hub-service";
import { registerCommunicationRoutes } from "./communications/communication-routes";
import {
  createCommunicationService,
  type CommunicationService,
} from "./communications/communication-service";
import { registerMaintenanceRoutes } from "./maintenance/maintenance-routes";
import { createMaintenanceWorker, type MaintenanceWorker } from "./maintenance/maintenance-worker";
import {
  createNotificationEmailEvents,
  createNotificationEmailWorker,
  type NotificationEmailWorker,
} from "./notifications/email-worker";
import {
  registerNotificationEmailRoutes,
  type NotificationEmailEvents,
} from "./notifications/notification-email-routes";
import { notificationChannelsConfigFromEnvironment, vapidFromEnvironment } from "./notifications/channel-config";
import { createNotificationPushWorker, type NotificationPushWorker, type PushSend } from "./notifications/push-worker";
import { registerNotificationPushRoutes, type PushSubscriptionService } from "./notifications/push-routes";
import {
  alertMessage,
  createNotificationDispatcher,
  HEARTBEAT_MONITOR,
  type NotificationDispatcher,
} from "./notifications/dispatcher";
import { registerNotificationDispatchRoutes } from "./notifications/dispatch-routes";
import { createPushSubscriptionService } from "./notifications/push-subscription-service";
import { createUserVerifier } from "./auth/verify-user.js";
import { registerDocumentTypesRoutes } from "./settings/document-types-routes";
import {
  createDocumentTypesService,
  type DocumentTypesService,
} from "./settings/document-types-service";
import { registerOrganizationSettingsRoutes } from "./settings/organization-settings-routes";
import { registerSettingsReadsRoutes } from "./settings/settings-reads-routes";
import { registerTimeOffShortenRoutes } from "./time-off/time-off-shorten-routes";
import {
  createTimeOffShortenService,
  type TimeOffShortenService,
} from "./time-off/time-off-shorten-service";
import { registerTimeOffVotingRoutes } from "./time-off/time-off-voting-routes";
import { registerNotificationRoutes } from "./notifications/notifications-routes";
import type { NotificationsService } from "./notifications/notifications-service";
import { registerLineupRoutes } from "./lineup/lineup-routes";
import { registerAvatarRoutes } from "./avatars/avatar-routes";
import type { AvatarService } from "./avatars/avatar-service";
import type { LineupService } from "./lineup/lineup-service";
import {
  createTimeOffVotingService,
  type TimeOffVotingService,
} from "./time-off/time-off-voting-service";
import {
  createSettingsReadsService,
  type SettingsReadsService,
} from "./settings/settings-reads-service";
import {
  createOrganizationSettingsService,
  type OrganizationSettingsService,
} from "./settings/organization-settings-service";
import { registerRolesRoutes } from "./settings/roles-routes";
import {
  createRolesService,
  type RolesService,
} from "./settings/roles-service";
import { registerSignatureSettingsRoutes } from "./settings/signature-settings-routes";
import { registerNotificationSettingsRoutes } from "./notification-settings/notification-settings-routes";
import { createNotificationSettingsServiceFromEnvironment, type NotificationSettingsService } from "./notification-settings/notification-settings-service";
import {
  createSignatureSettingsService,
  type SignatureSettingsService,
} from "./settings/signature-settings-service";

const explicitWorkspaceContextHeadersSchema = z.object({
  "x-newfork-workspace-id": z.string().uuid().optional(),
});
function isLocalDevelopmentOrigin(origin: string | undefined): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (origin?.startsWith("http://127.0.0.1:") === true ||
      origin?.startsWith("http://localhost:") === true)
  );
}

function requestOrigin(request: { headers: { host?: string } }): string | null {
  const host = request.headers.host;
  if (!host) return null;
  return `${process.env.VERCEL === "1" ? "https" : "http"}://${host}`;
}

function isAllowedOrigin(
  origin: string | undefined,
  request: { headers: { host?: string } },
): boolean {
  const allowedOrigin = process.env.APP_URL ?? "http://127.0.0.1:5555";
  return (
    origin === allowedOrigin ||
    origin === requestOrigin(request) ||
    isLocalDevelopmentOrigin(origin)
  );
}

export interface BuildAppOptions {
  readonly contextResolver?: WorkspaceContextResolver | null;
  readonly accountSecurityService?: AccountSecurityService | null;
  readonly passwordResetSender?: PasswordResetSender | null;
  readonly passwordResetClaim?: PasswordResetClaim | null;
  readonly accountRecoveryResendClaim?: ((addressDigest: string) => Promise<boolean>) | null;
  readonly accountDeletionWorker?: AccountDeletionWorker | null;
  readonly accountDeletionCron?: {
    readonly cronSecret?: string;
  };
  readonly workspaceAccountService?: WorkspaceAccountService | null;
  readonly workspaceRetentionWorker?: WorkspaceRetentionWorker | null;
  readonly workspaceRetentionCron?: {
    readonly cronSecret?: string;
  };
  readonly employeeDirectoryService?: EmployeeDirectoryService | null;
  readonly employeeCreateService?: EmployeeCreateService | null;
  readonly invitationService?: EmployeeInvitationService | null;
  readonly onboardingService?: EmployeeOnboardingService | null;
  readonly scheduleService?: ScheduleReadService | null;
  readonly scheduleExportCron?: Partial<ScheduleExportCronRouteOptions>;
  readonly scheduleRequestsService?: ScheduleRequestsService | null;
  readonly employeeHubService?: EmployeeHubService | null;
  readonly communicationService?: CommunicationService | null;
  readonly documentTypesService?: DocumentTypesService | null;
  readonly organizationSettingsService?: OrganizationSettingsService | null;
  readonly settingsReadsService?: SettingsReadsService | null;
  readonly timeOffShortenService?: TimeOffShortenService | null;
  readonly timeOffVotingService?: TimeOffVotingService | null;
  readonly notificationsService?: NotificationsService | null;
  readonly lineupService?: LineupService | null;
  readonly avatarService?: AvatarService | null;
  readonly rolesService?: RolesService | null;
  readonly signatureSettingsService?: SignatureSettingsService | null;
  readonly notificationSettingsService?: NotificationSettingsService | null;
  readonly maintenanceWorker?: MaintenanceWorker | null;
  readonly maintenanceCron?: {
    readonly cronSecret?: string;
  };
  /** BILDIRIM-14: Resend's webhook. */
  readonly notificationEmail?: {
    readonly webhookSecret?: string;
    readonly events?: NotificationEmailEvents | null;
  };
  /** BILDIRIM-DAGITICI: the one cron door of every notification channel. */
  readonly notificationDispatch?: {
    readonly dispatcher?: NotificationDispatcher | null;
    readonly cronSecret?: string;
  };
  /** BILDIRIM-15: a person's devices and which channels can send. */
  readonly notificationPush?: {
    readonly service?: PushSubscriptionService | null;
    readonly verifySession?: ((accessToken: string) => Promise<boolean>) | null;
    readonly config?: () => NotificationChannelsConfig;
  };
}

/**
 * An invitation that could not be answered, told in a word instead of a
 * sentence. The RPCs already raise the right SQLSTATE; the screen needs
 * something stable to branch on, and the server's English is not it.
 */
function invitationFailure(error: unknown): {
  readonly status: number;
  readonly body: { readonly error: string; readonly code: string };
} {
  const pgCode =
    error instanceof HttpError ? error.pgCode : undefined;
  switch (pgCode) {
    case "42501":
      if (error instanceof HttpError && error.reason === "authz.not_active")
        return {
          status: 403,
          body: {
            error: "Confirm your email address to answer this invitation",
            code: "email_unconfirmed",
          },
        };
      return {
        status: 403,
        body: {
          error: "This invitation is for a different account",
          code: "invitation_email_mismatch",
        },
      };
    case "P0002":
      return {
        status: 404,
        body: {
          error: "This invitation is no longer open",
          code: "invitation_not_found",
        },
      };
    case "23505":
      return {
        status: 409,
        body: {
          error: "This account is already a member",
          code: "already_member",
        },
      };
    default:
      // Not the invitation's failure (a crash, a lost connection): the
      // global handler answers it as one, with nothing of it on the screen.
      if (!(error instanceof HttpError) || error.statusCode >= 500) throw error;
      return {
        status: error.statusCode,
        body: {
          error: "This invitation could not be answered",
          code: "invitation_unavailable",
        },
      };
  }
}

const invitationParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  employeeId: z.string().uuid(),
});
const invitationBodySchema = z.object({
  email: z.string().trim().email(),
  roleId: z.string().uuid().nullable().optional(),
});
const invitationAcceptanceSchema = z.object({
  token: z.string().trim().min(32).max(256),
});
const invitationPreviewBodySchema = z.object({
  token: z.string().trim().min(32).max(256),
});
const invitationActionParamsSchema = z.object({
  invitationId: z.string().uuid(),
});

/**
 * Pino ships with Fastify, so this adds no dependency. Tests stay silent; every
 * other environment writes structured JSON that Vercel collects.
 */
function apiLoggerOptions() {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return false;
  return {
    level: process.env.LOG_LEVEL ?? "info",
    // Bearer tokens and cookies must never reach the log sink.
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      remove: true,
    },
  };
}

export function buildApp(options: BuildAppOptions = {}) {
  initSentry();
  const app = Fastify({
    logger: apiLoggerOptions(),
  });

  // An unhandled throw used to return a bare 500 that vanished without a trace.
  // Log it against the request id and hand the same id to the caller so a bug
  // report can be matched to a log line. Internals never reach the response.
  app.setErrorHandler(replyWithError);

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: "Not found" }),
  );
  const contextResolver =
    options.contextResolver ?? createResolverFromEnvironment();
  const accountSecurityService =
    options.accountSecurityService === undefined
      ? createAccountSecurityServiceFromEnvironment()
      : options.accountSecurityService;
  const accountDeletionWorker =
    options.accountDeletionWorker === undefined
      ? createAccountDeletionWorkerFromEnvironment()
      : options.accountDeletionWorker;
  const workspaceAccountService =
    options.workspaceAccountService ??
    createWorkspaceAccountServiceFromEnvironment();
  const workspaceRetentionWorker =
    options.workspaceRetentionWorker === undefined
      ? createWorkspaceRetentionWorkerFromEnvironment()
      : options.workspaceRetentionWorker;
  const employeeDirectoryService =
    options.employeeDirectoryService ??
    createEmployeeDirectoryServiceFromEnvironment();
  const invitationService =
    options.invitationService ?? createInvitationServiceFromEnvironment();
  const onboardingService =
    options.onboardingService ?? createOnboardingServiceFromEnvironment();
  const scheduleService =
    options.scheduleService ?? createScheduleServiceFromEnvironment();
  const scheduleRequestsService =
    options.scheduleRequestsService ??
    createScheduleRequestsServiceFromEnvironment();
  const employeeHubService =
    options.employeeHubService ?? createEmployeeHubServiceFromEnvironment();
  const communicationService =
    options.communicationService ?? createCommunicationServiceFromEnvironment();
  const maintenanceWorker =
    options.maintenanceWorker === undefined
      ? createMaintenanceWorkerFromEnvironment()
      : options.maintenanceWorker;
  const documentTypesService =
    options.documentTypesService ?? createDocumentTypesServiceFromEnvironment();
  const organizationSettingsService =
    options.organizationSettingsService ??
    createOrganizationSettingsServiceFromEnvironment();
  const settingsReadsService =
    options.settingsReadsService ?? createSettingsReadsServiceFromEnvironment();
  const timeOffShortenService =
    options.timeOffShortenService ?? createTimeOffShortenServiceFromEnvironment();
  const timeOffVotingService =
    options.timeOffVotingService ?? createTimeOffVotingServiceFromEnvironment();
  const rolesService =
    options.rolesService ?? createRolesServiceFromEnvironment();
  const signatureSettingsService =
    options.signatureSettingsService ??
    createSignatureSettingsServiceFromEnvironment();

  app.addHook("onSend", async (request, reply, payload) => {
    const origin = request.headers.origin;
    if (isAllowedOrigin(origin, request)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
    }
    return payload;
  });
  app.addHook("onRequest", async (request, reply) => {
    if (
      (request.url.startsWith("/v1/me/onboarding") ||
        request.url.startsWith("/v1/invitations") ||
        request.url.includes("/employee-hub") ||
        request.url.includes("/schedule/") ||
        request.url.includes("/communications/") ||
        request.url.includes("/account/workspaces") ||
        request.url.includes("/employees") ||
        request.url.includes("/document-types") ||
        request.url.includes("/organization/") ||
        request.url.includes("/roles") ||
        request.url.includes("/signature-") ||
        request.url.includes("/shift-types/") ||
        request.url.includes("/owner-onboarding") ||
        request.url.endsWith("/workspace/layout")) &&
      request.method !== "GET" &&
      request.method !== "OPTIONS"
    ) {
      const origin = request.headers.origin;
      if (origin && !isAllowedOrigin(origin, request))
        return reply
          .status(403)
          .send({ error: "Request origin is not allowed" });
    }
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.url.startsWith("/v1/me/onboarding") ||
      request.url.startsWith("/v1/invitations") ||
      request.url.includes("/employee-hub") ||
      request.url.includes("/schedule") ||
      request.url.includes("/communications/") ||
      request.url.includes("/account/workspaces") ||
      request.url.includes("/employees") ||
      request.url.includes("/document-types") ||
      request.url.includes("/organization/") ||
      request.url.includes("/roles") ||
      request.url.includes("/signature-") ||
      request.url.includes("/shift-types/") ||
      request.url.includes("/owner-onboarding") ||
      request.url.endsWith("/workspace") ||
      request.url.endsWith("/workspace/layout")
    ) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });
  app.options("/*", async (request, reply) => {
    reply.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    );
    reply.header(
      "Access-Control-Allow-Headers",
      "Authorization,Content-Type,Idempotency-Key,X-Newfork-Workspace-Id",
    );
    return reply.status(204).send();
  });

  app.get("/health", async () => {
    return healthResponseSchema.parse({
      ok: true,
      service: "newfork-api",
      phase: "phase-10",
    });
  });

  app.get("/v1/context", async (request, reply) => {
    if (!contextResolver) {
      return reply
        .status(503)
        .send({ error: "Supabase auth is not configured" });
    }

    const authorization = request.headers.authorization;
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    const workspaceHeader = explicitWorkspaceContextHeadersSchema.safeParse(
      request.headers,
    );
    if (!workspaceHeader.success) {
      return reply
        .status(400)
        .send({ error: "Valid workspace context required" });
    }
    const requestedWorkspaceId =
      workspaceHeader.data["x-newfork-workspace-id"] ?? null;

    try {
      const resolvedContext = await contextResolver.resolve(
        accessToken,
        requestedWorkspaceId,
      );
      const context =
        activeWorkspaceContextSchema.safeParse(resolvedContext).data ?? null;
      if (!context)
        return reply
          .status(401)
          .send({ error: "Invalid session or membership" });
      if (
        requestedWorkspaceId &&
        (context.workspace.id !== requestedWorkspaceId ||
          context.membership.workspaceId !== requestedWorkspaceId)
      ) {
        return reply
          .status(401)
          .send({ error: "Invalid session or membership" });
      }
      // Opening a workspace is what makes it the most recently used one, and
      // the switcher opens on that. A failed stamp is not worth the page.
      if (workspaceAccountService)
        void workspaceAccountService
          .touchWorkspace(accessToken, context.workspace.id)
          .catch((stampError: unknown) => {
            request.log.warn({ err: stampError }, "workspace not stamped");
          });
      return reply.send(context);
    } catch (error) {
      request.log.error(error);
      return reply
        .status(503)
        .send({ error: "Workspace context is temporarily unavailable" });
    }
  });

  registerAccountSecurityRoutes(app, {
    service: accountSecurityService,
    claimRecoveryResend:
      options.accountRecoveryResendClaim === undefined
        ? createAccountRecoveryResendClaimFromEnvironment()
        : options.accountRecoveryResendClaim,
  });
  registerPasswordResetRoutes(app, {
    send:
      options.passwordResetSender === undefined
        ? createPasswordResetSenderFromEnvironment()
        : options.passwordResetSender,
    claim:
      options.passwordResetClaim === undefined
        ? createPasswordResetClaimFromEnvironment()
        : options.passwordResetClaim,
  });
  registerAccountDeletionRoutes(app, {
    worker: accountDeletionWorker,
    cronSecret:
      options.accountDeletionCron?.cronSecret ?? process.env.CRON_SECRET,
  });
  registerWorkspaceAccountRoutes(app, {
    service: workspaceAccountService,
    contextResolver,
    invitationService: invitationService,
  });
  registerWorkspaceRetentionRoutes(app, {
    worker: workspaceRetentionWorker,
    cronSecret:
      options.workspaceRetentionCron?.cronSecret ?? process.env.CRON_SECRET,
  });

  // Sending, resending, cancelling an invitation and copying its link. No
  // gate here: each service asks the core (employee.invite with the person,
  // can_invite_with_role for the role; FB-6.2 .5), and its "no" reaches the
  // drawer as 404 or 403 with its reason (BL-414).
  app.post(
    "/v1/workspaces/:workspaceId/employees/:employeeId/invitations",
    async (request, reply) => {
      const params = invitationParamsSchema.safeParse(request.params);
      const body = invitationBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply
          .status(400)
          .send({ error: "Valid employee invitation details required" });
      }
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        contextResolver,
      );
      if (!invitationService)
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      return reply.send(
        await invitationService.prepare({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          email: body.data.email,
          roleId: body.data.roleId ?? null,
        }),
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/employees/:employeeId/invitations/retry",
    async (request, reply) => {
      const params = invitationParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        contextResolver,
      );
      if (!invitationService)
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      return reply.send(
        await invitationService.retry({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
        }),
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/employees/:employeeId/invitations",
    async (request, reply) => {
      const params = invitationParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        contextResolver,
      );
      if (!invitationService)
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      await invitationService.revoke({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        employeeId: params.data.employeeId,
      });
      return reply.status(204).send();
    },
  );

  // The invitation's own link, for whoever sent it to pass along by hand
  // because email did not arrive.
  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId/invitations/link",
    async (request, reply) => {
      const params = invitationParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        contextResolver,
      );
      if (!invitationService)
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      return reply.send(
        await invitationService.link({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
        }),
      );
    },
  );

  app.post("/v1/invitations/accept", async (request, reply) => {
    const body = invitationAcceptanceSchema.safeParse(request.body);
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Valid invitation token required" });
    if (!invitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply
        .status(401)
        .send({ error: "Authenticated account required" });
    try {
      return reply.send(
        await invitationService.accept(accessToken, body.data.token),
      );
    } catch (error) {
      request.log.warn({ err: error }, "invitation not accepted");
      const failure = invitationFailure(error);
      return reply.status(failure.status).send(failure.body);
    }
  });

  app.get("/v1/invitations/pending", async (request, reply) => {
    if (!invitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply
        .status(401)
        .send({ error: "Authenticated account required" });
    try {
      return reply.send(await invitationService.listPending(accessToken));
    } catch (error) {
      request.log.warn({ err: error }, "pending invitations not listed");
      const failure = invitationFailure(error);
      return reply.status(failure.status).send(failure.body);
    }
  });

  app.post("/v1/invitations/:invitationId/accept", async (request, reply) => {
    const params = invitationActionParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid invitation required" });
    if (!invitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply
        .status(401)
        .send({ error: "Authenticated account required" });
    try {
      return reply.send(
        await invitationService.acceptPending(
          accessToken,
          params.data.invitationId,
        ),
      );
    } catch (error) {
      request.log.warn({ err: error }, "invitation not accepted");
      const failure = invitationFailure(error);
      return reply.status(failure.status).send(failure.body);
    }
  });

  app.post("/v1/invitations/:invitationId/decline", async (request, reply) => {
    const params = invitationActionParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid invitation required" });
    if (!invitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply
        .status(401)
        .send({ error: "Authenticated account required" });
    try {
      await invitationService.declinePending(
        accessToken,
        params.data.invitationId,
      );
      return reply.status(204).send();
    } catch (error) {
      request.log.warn({ err: error }, "invitation not declined");
      const failure = invitationFailure(error);
      return reply.status(failure.status).send(failure.body);
    }
  });

  // BL-279 (2): the token rides in the body; an address with it lands in request logs.
  app.post("/v1/invitations/preview", async (request, reply) => {
    const query = invitationPreviewBodySchema.safeParse(request.body);
    if (!query.success)
      return reply
        .status(400)
        .send({ error: "Valid invitation token required" });
    if (!invitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    // Every state but "no such token" is a found invitation the screen has to
    // render its own way, so it answers 200 and says which state it is.
    try {
      const preview = await invitationService.preview(query.data.token);
      if (!preview)
        return reply.status(404).send({
          error: "This invitation is no longer open",
          code: "invitation_not_found",
        });
      return reply.send(preview);
    } catch (error) {
      request.log.warn({ err: error }, "invitation preview failed");
      const failure = invitationFailure(error);
      return reply.status(failure.status).send(failure.body);
    }
  });

  registerEmployeeDirectoryRoutes(app, {
    service: employeeDirectoryService,
    createService:
      options.employeeCreateService ??
      createEmployeeCreateServiceFromEnvironment(),
    contextResolver,
  });

  registerTimezoneSuggestionRoutes(app, contextResolver);
  registerDocumentLifecycleRoutes(app, process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createDocumentLifecycleService({ url: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY })
    : null);

  if (onboardingService) {
    registerEmployeeOnboardingRoutes(app, {
      service: onboardingService,
      contextResolver,
    });
  }

  registerScheduleRoutes(app, {
    service: scheduleService,
    contextResolver,
  });
  registerScheduleExportCronRoutes(app, {
    service: scheduleService,
    cronSecret:
      options.scheduleExportCron?.cronSecret ?? process.env.CRON_SECRET,
    delivery: options.scheduleExportCron?.delivery,
    resendApiKey:
      options.scheduleExportCron?.resendApiKey ?? process.env.RESEND_API_KEY,
    emailFrom:
      options.scheduleExportCron?.emailFrom ??
      process.env.SCHEDULE_EXPORT_FROM ??
      process.env.EMPLOYEE_INVITE_FROM,
    now: options.scheduleExportCron?.now,
  });
  registerMaintenanceRoutes(app, {
    worker: maintenanceWorker,
    cronSecret: options.maintenanceCron?.cronSecret ?? process.env.CRON_SECRET,
  });
  registerNotificationDispatchRoutes(app, {
    dispatcher:
      options.notificationDispatch?.dispatcher === undefined
        ? createNotificationDispatcherFromEnvironment()
        : options.notificationDispatch.dispatcher,
    cronSecret: options.notificationDispatch?.cronSecret ?? process.env.CRON_SECRET,
  });
  registerNotificationEmailRoutes(app, {
    webhookSecret: options.notificationEmail?.webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET,
    events:
      options.notificationEmail?.events === undefined
        ? createNotificationEmailEventsFromEnvironment()
        : options.notificationEmail.events,
  });
  registerNotificationPushRoutes(app, {
    service:
      options.notificationPush?.service === undefined
        ? createPushSubscriptionServiceFromEnvironment()
        : options.notificationPush.service,
    verifySession:
      options.notificationPush?.verifySession === undefined
        ? createSessionCheckFromEnvironment()
        : options.notificationPush.verifySession,
    config: options.notificationPush?.config ?? (() => notificationChannelsConfigFromEnvironment(process.env)),
  });
  registerScheduleRequestsRoutes(app, {
    service: scheduleRequestsService,
    contextResolver,
  });
  registerEmployeeHubRoutes(app, {
    service: employeeHubService,
    contextResolver,
  });
  registerShiftExchangesRoutes(app, {
    contextResolver,
    service:
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createShiftExchangesService({
            url: process.env.SUPABASE_URL,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          })
        : null,
  });
  registerAvailabilityRoutes(app, {
    contextResolver,
    service:
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createAvailabilityService({
            url: process.env.SUPABASE_URL,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          })
        : null,
  });
  registerCommunicationRoutes(app, {
    service: communicationService,
    contextResolver,
  });
  registerDocumentTypesRoutes(app, {
    service: documentTypesService,
    contextResolver,
  });
  registerOrganizationSettingsRoutes(app, {
    service: organizationSettingsService,
    contextResolver,
  });
  registerTimeOffShortenRoutes(app, {
    service: timeOffShortenService,
    contextResolver,
  });
  registerTimeOffVotingRoutes(app, {
    service: timeOffVotingService,
    contextResolver,
  });
  registerNotificationRoutes(app, { service: options.notificationsService, contextResolver });
  registerLineupRoutes(app, { service: options.lineupService, contextResolver });
  registerAvatarRoutes(app, { service: options.avatarService, contextResolver });
  registerSettingsReadsRoutes(app, {
    service: settingsReadsService,
    contextResolver,
  });
  registerRolesRoutes(app, {
    service: rolesService,
    contextResolver,
  });
  registerSignatureSettingsRoutes(app, {
    service: signatureSettingsService,
    contextResolver,
  });
  registerNotificationSettingsRoutes(app, {
    service: options.notificationSettingsService === undefined ? createNotificationSettingsServiceFromEnvironment() : options.notificationSettingsService,
    contextResolver,
  });

  return app;
}

function createResolverFromEnvironment(): WorkspaceContextResolver | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  return createSupabaseWorkspaceContextResolver({ url, anonKey, serviceRoleKey });
}

function createWorkspaceAccountServiceFromEnvironment(): WorkspaceAccountService | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anonKey && serviceRoleKey
    ? createWorkspaceAccountService({ url, anonKey, serviceRoleKey })
    : null;
}

function createAccountSecurityServiceFromEnvironment(): AccountSecurityService | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  return createAccountSecurityService({
    url,
    anonKey,
    serviceRoleKey,
    appUrl: process.env.APP_URL ?? "http://127.0.0.1:5555",
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.ACCOUNT_SECURITY_FROM ?? process.env.EMPLOYEE_INVITE_FROM,
    production: process.env.NODE_ENV === "production",
  });
}

// The service role is needed only for auth.admin.generateLink: a recovery link
// can be minted for an email only by the admin API.
function createPasswordResetSenderFromEnvironment(): PasswordResetSender | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;
  return createPasswordResetSender({
    admin,
    appUrl: process.env.APP_URL ?? "http://127.0.0.1:5555",
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.ACCOUNT_SECURITY_FROM ?? process.env.EMPLOYEE_INVITE_FROM,
    production: process.env.NODE_ENV === "production",
  });
}

function createPasswordResetClaimFromEnvironment(): PasswordResetClaim | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return async (emailDigest, addressDigest) => {
    const { data, error } = await client.rpc("claim_password_reset_send_service", {
      email_digest: emailDigest,
      address_digest: addressDigest,
    });
    if (error) throw new Error("Password reset limit could not be checked");
    return z.enum(["send", "quiet", "address_limited"]).parse(data);
  };
}

function createAccountRecoveryResendClaimFromEnvironment():
  | ((addressDigest: string) => Promise<boolean>)
  | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return async (addressDigest) => {
    const { data, error } = await client.rpc("claim_account_recovery_resend_service", {
      address_digest: addressDigest,
    });
    if (error) throw new Error("Account recovery resend limit could not be checked");
    return z.boolean().parse(data);
  };
}

function createAccountDeletionWorkerFromEnvironment(): AccountDeletionWorker | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createAccountDeletionWorker({
    url,
    serviceRoleKey,
    appUrl: process.env.APP_URL ?? "http://127.0.0.1:5555",
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.ACCOUNT_SECURITY_FROM ?? process.env.EMPLOYEE_INVITE_FROM,
    production: process.env.NODE_ENV === "production",
    batchSize: integerEnvironmentValue(process.env.ACCOUNT_DELETION_BATCH_SIZE),
  });
}

function createWorkspaceRetentionWorkerFromEnvironment(): WorkspaceRetentionWorker | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createWorkspaceRetentionWorker({
    url,
    serviceRoleKey,
    workerId: process.env.WORKSPACE_RETENTION_WORKER_ID,
    batchSize: integerEnvironmentValue(
      process.env.WORKSPACE_RETENTION_BATCH_SIZE,
    ),
  });
}

function createEmployeeDirectoryServiceFromEnvironment(): EmployeeDirectoryService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createEmployeeDirectoryService({ url, serviceRoleKey })
    : null;
}

function createEmployeeCreateServiceFromEnvironment(): EmployeeCreateService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createEmployeeCreateService({
    url,
    serviceRoleKey,
    appUrl: process.env.APP_URL ?? "http://127.0.0.1:5555",
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMPLOYEE_INVITE_FROM,
    production: process.env.NODE_ENV === "production",
  });
}

function createInvitationServiceFromEnvironment(): EmployeeInvitationService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createEmployeeInvitationService({
    url,
    serviceRoleKey,
    appUrl: process.env.APP_URL ?? "http://127.0.0.1:5555",
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMPLOYEE_INVITE_FROM,
    production: process.env.NODE_ENV === "production",
  });
}

function createOnboardingServiceFromEnvironment(): EmployeeOnboardingService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  const production = process.env.NODE_ENV === "production";
  return createEmployeeOnboardingService({
    url,
    serviceRoleKey,
    productionReady:
      !production || process.env.ONBOARDING_PRODUCTION_READY === "true",
  });
}

function createScheduleServiceFromEnvironment(): ScheduleReadService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createScheduleReadService({ url, serviceRoleKey });
}

function createScheduleRequestsServiceFromEnvironment(): ScheduleRequestsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createScheduleRequestsService({ url, serviceRoleKey })
    : null;
}

function createEmployeeHubServiceFromEnvironment(): EmployeeHubService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createEmployeeHubService({ url, serviceRoleKey })
    : null;
}

function createCommunicationServiceFromEnvironment(): CommunicationService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createCommunicationService({ url, serviceRoleKey })
    : null;
}

function createDocumentTypesServiceFromEnvironment(): DocumentTypesService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createDocumentTypesService({ url, serviceRoleKey })
    : null;
}

function createTimeOffShortenServiceFromEnvironment(): TimeOffShortenService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createTimeOffShortenService({ url, serviceRoleKey })
    : null;
}

function createTimeOffVotingServiceFromEnvironment(): TimeOffVotingService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createTimeOffVotingService({ url, serviceRoleKey })
    : null;
}

function createSettingsReadsServiceFromEnvironment(): SettingsReadsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createSettingsReadsService({ url, serviceRoleKey })
    : null;
}

function createOrganizationSettingsServiceFromEnvironment(): OrganizationSettingsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createOrganizationSettingsService({ url, serviceRoleKey })
    : null;
}

function createRolesServiceFromEnvironment(): RolesService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createRolesService({ url, serviceRoleKey })
    : null;
}

function createSignatureSettingsServiceFromEnvironment(): SignatureSettingsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createSignatureSettingsService({ url, serviceRoleKey })
    : null;
}

// One dispatcher for every channel (BILDIRIM-DAGITICI). A channel whose secrets are not set has no worker
// and is left alone; with neither, the cron routes answer 503. An alert goes to Sentry, which emails Mert;
// the heartbeat checks in with Sentry's cron monitor, made on the first check-in.
function createNotificationDispatcherFromEnvironment(): NotificationDispatcher | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = createNotificationEmailWorkerFromEnvironment();
  const push = createNotificationPushWorkerFromEnvironment();
  if (!url || !serviceRoleKey || (!email && !push)) return null;
  return createNotificationDispatcher({
    url,
    serviceRoleKey,
    email,
    push,
    checkIn: (status) => reportCheckIn(HEARTBEAT_MONITOR.slug, status, HEARTBEAT_MONITOR.config),
    report: (alert) =>
      reportOperatorAlert(alertMessage(alert), ["notification-alert", alert.kind, alert.channel], {
        kind: alert.kind,
        channel: alert.channel,
        period: alert.period,
        ...(alert.sent === undefined ? {} : { sent: alert.sent }),
        ...(alert.limit === undefined ? {} : { limit: alert.limit }),
        ...(alert.waiting_seconds === undefined ? {} : { waiting_seconds: alert.waiting_seconds }),
        ...(alert.due === undefined ? {} : { due: alert.due }),
      }),
  });
}

// The links go where the invitation and password reset links go (APP_URL); the sender is the one the
// other emails use. Without the Resend key or a sender email has no worker and claims nothing.
function createNotificationEmailWorkerFromEnvironment(): NotificationEmailWorker | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMPLOYEE_INVITE_FROM;
  if (!url || !serviceRoleKey || !resendApiKey || !from) return null;
  return createNotificationEmailWorker({
    url,
    serviceRoleKey,
    resendApiKey,
    from,
    appUrl: process.env.APP_URL ?? "http://127.0.0.1:5555",
  });
}

// Phone alerts open once the three VAPID values are set (Mert sets them in Vercel; nobody else sees them).
// web-push is loaded on the first send only, so nothing else in the API depends on it.
function createNotificationPushWorkerFromEnvironment(): NotificationPushWorker | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapid = vapidFromEnvironment(process.env);
  if (!url || !serviceRoleKey || !vapid) return null;
  let loaded: Promise<PushSend> | null = null;
  const send: PushSend = async (target, payload, sendOptions) => {
    loaded ??= import("./notifications/web-push-send").then((module) => module.createWebPushSend(vapid));
    return (await loaded)(target, payload, sendOptions);
  };
  return createNotificationPushWorker({ url, serviceRoleKey, send, appUrl: process.env.APP_URL ?? "http://127.0.0.1:5555" });
}

function createSessionCheckFromEnvironment(): ((accessToken: string) => Promise<boolean>) | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const verifyUser = createUserVerifier(createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } }));
  return async (accessToken) => (await verifyUser(accessToken)) !== null;
}

function createPushSubscriptionServiceFromEnvironment(): PushSubscriptionService | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anonKey && serviceRoleKey ? createPushSubscriptionService({ url, anonKey, serviceRoleKey }) : null;
}

function createNotificationEmailEventsFromEnvironment(): NotificationEmailEvents | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createNotificationEmailEvents({ url, serviceRoleKey }) : null;
}

function createMaintenanceWorkerFromEnvironment(): MaintenanceWorker | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? createMaintenanceWorker({ url, serviceRoleKey }) : null;
}

function integerEnvironmentValue(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
