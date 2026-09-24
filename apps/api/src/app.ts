import {
  activeWorkspaceContextSchema,
  healthResponseSchema,
} from "@newfork/shared";
import Fastify, { type FastifyError } from "fastify";
import { createDocumentLifecycleService } from "./employees/document-lifecycle-service";
import { registerDocumentLifecycleRoutes } from "./employees/document-lifecycle-routes";
import { registerTimezoneSuggestionRoutes } from "./settings/timezone-suggestion";
import { z } from "zod";
import { HttpError } from "./http-error.js";
import { registerAccountDeletionRoutes } from "./account/account-deletion-routes";
import {
  createAccountDeletionWorker,
  type AccountDeletionWorker,
} from "./account/account-deletion-worker";
import { registerAccountSecurityRoutes } from "./account/account-security-routes";
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
  resolveWorkspaceAuthorization,
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
import { registerScheduleLineupRoutes } from "./schedule/schedule-lineup-routes";
import {
  createScheduleLineupService,
  type ScheduleLineupService,
} from "./schedule/schedule-lineup-service";
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
import { registerTimeEntriesRoutes } from "./time-entries/time-entries-routes";
import {
  createTimeEntriesService,
  type TimeEntriesService,
} from "./time-entries/time-entries-service";
import { registerKioskRoutes } from "./kiosk/kiosk-routes";
import { createKioskService, type KioskService } from "./kiosk/kiosk-service";
import { registerNotificationOutboxRoutes } from "./notifications/notification-outbox-routes";
import {
  createNotificationOutboxWorker,
  type NotificationOutboxWorker,
} from "./notifications/notification-outbox-worker";
import { registerNotificationSettingsRoutes } from "./notifications/notification-settings-routes";
import {
  createNotificationSettingsService,
  type NotificationSettingsService,
} from "./notifications/notification-settings-service";
import { registerDocumentTypesRoutes } from "./settings/document-types-routes";
import {
  createDocumentTypesService,
  type DocumentTypesService,
} from "./settings/document-types-service";
import { registerOrganizationSettingsRoutes } from "./settings/organization-settings-routes";
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

interface BuildAppOptions {
  readonly contextResolver?: WorkspaceContextResolver | null;
  readonly accountSecurityService?: AccountSecurityService | null;
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
  readonly scheduleLineupService?: ScheduleLineupService | null;
  readonly scheduleRequestsService?: ScheduleRequestsService | null;
  readonly employeeHubService?: EmployeeHubService | null;
  readonly communicationService?: CommunicationService | null;
  readonly timeEntriesService?: TimeEntriesService | null;
  readonly kioskService?: KioskService | null;
  readonly notificationOutboxWorker?: NotificationOutboxWorker | null;
  readonly notificationSettingsService?: NotificationSettingsService | null;
  readonly documentTypesService?: DocumentTypesService | null;
  readonly organizationSettingsService?: OrganizationSettingsService | null;
  readonly rolesService?: RolesService | null;
  readonly signatureSettingsService?: SignatureSettingsService | null;
  readonly notificationOutboxCron?: {
    readonly cronSecret?: string;
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
      return {
        status:
          error instanceof HttpError && error.statusCode < 500
            ? error.statusCode
            : 409,
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
const invitationPreviewQuerySchema = z.object({
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
  const app = Fastify({
    logger: apiLoggerOptions(),
  });

  // An unhandled throw used to return a bare 500 that vanished without a trace.
  // Log it against the request id and hand the same id to the caller so a bug
  // report can be matched to a log line. Internals never reach the response.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) request.log.error({ err: error }, "request failed");
    else request.log.warn({ err: error, statusCode }, "request rejected");
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : error.message,
      requestId: request.id,
    });
  });

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
  const scheduleLineupService =
    options.scheduleLineupService ??
    createScheduleLineupServiceFromEnvironment();
  const scheduleRequestsService =
    options.scheduleRequestsService ??
    createScheduleRequestsServiceFromEnvironment();
  const employeeHubService =
    options.employeeHubService ?? createEmployeeHubServiceFromEnvironment();
  const communicationService =
    options.communicationService ?? createCommunicationServiceFromEnvironment();
  const timeEntriesService =
    options.timeEntriesService ?? createTimeEntriesServiceFromEnvironment();
  const kioskService =
    options.kioskService ?? createKioskServiceFromEnvironment();
  const notificationOutboxWorker =
    options.notificationOutboxWorker === undefined
      ? createNotificationOutboxWorkerFromEnvironment()
      : options.notificationOutboxWorker;
  const notificationSettingsService =
    options.notificationSettingsService ??
    createNotificationSettingsServiceFromEnvironment();
  const documentTypesService =
    options.documentTypesService ?? createDocumentTypesServiceFromEnvironment();
  const organizationSettingsService =
    options.organizationSettingsService ??
    createOrganizationSettingsServiceFromEnvironment();
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
        request.url.includes("/time-entries") ||
        request.url.includes("/schedule/") ||
        request.url.includes("/communications/") ||
        request.url.includes("/notification-settings") ||
        request.url.includes("/notification-preferences") ||
        request.url.includes("/account/workspaces") ||
        request.url.includes("/employees") ||
        request.url.includes("/document-types") ||
        request.url.includes("/organization/") ||
        request.url.includes("/roles") ||
        request.url.includes("/signature-") ||
        request.url.includes("/shift-types/") ||
        request.url.includes("/owner-onboarding") ||
        request.url.endsWith("/workspace/layout") ||
        request.url.includes("/kiosk/")) &&
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
      request.url.includes("/time-entries") ||
      request.url.includes("/schedule") ||
      request.url.includes("/communications/") ||
      request.url.includes("/notification-settings") ||
      request.url.includes("/notification-preferences") ||
      request.url.includes("/account/workspaces") ||
      request.url.includes("/employees") ||
      request.url.includes("/document-types") ||
      request.url.includes("/organization/") ||
      request.url.includes("/roles") ||
      request.url.includes("/signature-") ||
      request.url.includes("/shift-types/") ||
      request.url.includes("/owner-onboarding") ||
      request.url.includes("/kiosk/") ||
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

  registerAccountSecurityRoutes(app, { service: accountSecurityService });
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
      if (!contextResolver || !invitationService) {
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      }
      const authorization = await resolveWorkspaceAuthorization({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        permission: "employee_access.manage",
        resolver: contextResolver,
      });
      if (!authorization.context) {
        return reply
          .status(authorization.denied === "workspace_not_found" ? 404 : 403)
          .send({
            error:
              authorization.denied === "workspace_not_found"
                ? "Workspace not found"
                : "Employee access management required",
          });
      }
      try {
        return reply.send(
          await invitationService.prepare({
            actorUserId: authorization.context.userId,
            workspaceId: params.data.workspaceId,
            employeeId: params.data.employeeId,
            email: body.data.email,
            roleId: body.data.roleId ?? null,
          }),
        );
      } catch (error) {
        request.log.error(error);
        return reply.status(409).send({
          error:
            error instanceof Error
              ? error.message
              : "Invitation could not be prepared",
        });
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/employees/:employeeId/invitations/retry",
    async (request, reply) => {
      const params = invitationParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      if (!contextResolver || !invitationService) {
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      }
      const authorization = await resolveWorkspaceAuthorization({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        permission: "employee_access.manage",
        resolver: contextResolver,
      });
      if (!authorization.context)
        return reply
          .status(authorization.denied === "workspace_not_found" ? 404 : 403)
          .send({
            error:
              authorization.denied === "workspace_not_found"
                ? "Workspace not found"
                : "Employee access management required",
          });
      try {
        return reply.send(
          await invitationService.retry({
            actorUserId: authorization.context.userId,
            workspaceId: params.data.workspaceId,
            employeeId: params.data.employeeId,
          }),
        );
      } catch (error) {
        request.log.error(error);
        return reply.status(409).send({
          error:
            error instanceof Error
              ? error.message
              : "Invitation delivery could not be retried",
        });
      }
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/employees/:employeeId/invitations",
    async (request, reply) => {
      const params = invitationParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      if (!contextResolver || !invitationService) {
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      }
      const authorization = await resolveWorkspaceAuthorization({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        permission: "employee_access.manage",
        resolver: contextResolver,
      });
      if (!authorization.context)
        return reply
          .status(authorization.denied === "workspace_not_found" ? 404 : 403)
          .send({
            error:
              authorization.denied === "workspace_not_found"
                ? "Workspace not found"
                : "Employee access management required",
          });
      try {
        await invitationService.revoke({
          actorUserId: authorization.context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
        });
        return reply.status(204).send();
      } catch (error) {
        request.log.error(error);
        return reply.status(409).send({
          error:
            error instanceof Error
              ? error.message
              : "Invitation could not be revoked",
        });
      }
    },
  );

  // The invitation's own link, for an admin who has to pass it along by hand
  // because email did not arrive. Same permission as sending one.
  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId/invitations/link",
    async (request, reply) => {
      const params = invitationParamsSchema.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      if (!contextResolver || !invitationService) {
        return reply
          .status(503)
          .send({ error: "Employee invitation service is not configured" });
      }
      // No credentials at all is a different answer from "not yours": the
      // workspace helper folds both into 404 to avoid confirming a workspace
      // exists, which is right for a stranger and wrong for a caller that
      // simply forgot to sign in.
      if (!bearerToken(request.headers.authorization))
        return reply
          .status(401)
          .send({ error: "Authenticated account required" });
      const authorization = await resolveWorkspaceAuthorization({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        permission: "employee_access.manage",
        resolver: contextResolver,
      });
      if (!authorization.context)
        return reply
          .status(authorization.denied === "workspace_not_found" ? 404 : 403)
          .send({
            error:
              authorization.denied === "workspace_not_found"
                ? "Workspace not found"
                : "Employee access management required",
          });
      try {
        return reply.send(
          await invitationService.link({
            actorUserId: authorization.context.userId,
            workspaceId: params.data.workspaceId,
            employeeId: params.data.employeeId,
          }),
        );
      } catch (error) {
        request.log.warn({ err: error }, "invitation link unavailable");
        const failure = invitationFailure(error);
        return reply.status(failure.status).send(failure.body);
      }
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

  app.get("/v1/invitations/preview", async (request, reply) => {
    const query = invitationPreviewQuerySchema.safeParse(request.query);
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
  registerNotificationOutboxRoutes(app, {
    worker: notificationOutboxWorker,
    cronSecret:
      options.notificationOutboxCron?.cronSecret ?? process.env.CRON_SECRET,
  });
  registerScheduleLineupRoutes(app, {
    service: scheduleLineupService,
    contextResolver,
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
  registerNotificationSettingsRoutes(app, {
    service: notificationSettingsService,
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
  registerRolesRoutes(app, {
    service: rolesService,
    contextResolver,
  });
  registerSignatureSettingsRoutes(app, {
    service: signatureSettingsService,
    contextResolver,
  });
  registerTimeEntriesRoutes(app, {
    service: timeEntriesService,
    contextResolver,
  });
  registerKioskRoutes(app, {
    service: kioskService,
    contextResolver,
    secureCookies: process.env.NODE_ENV === "production",
  });

  return app;
}

function createResolverFromEnvironment(): WorkspaceContextResolver | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) return null;
  return createSupabaseWorkspaceContextResolver({
    url,
    anonKey,
    ...(serviceRoleKey ? { serviceRoleKey } : {}),
  });
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
    ensureDevelopmentBucket: !production,
  });
}

function createScheduleServiceFromEnvironment(): ScheduleReadService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createScheduleReadService({ url, serviceRoleKey });
}

function createScheduleLineupServiceFromEnvironment(): ScheduleLineupService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createScheduleLineupService({ url, serviceRoleKey })
    : null;
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

function createNotificationSettingsServiceFromEnvironment(): NotificationSettingsService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createNotificationSettingsService({ url, serviceRoleKey })
    : null;
}

function createDocumentTypesServiceFromEnvironment(): DocumentTypesService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createDocumentTypesService({ url, serviceRoleKey })
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

function createTimeEntriesServiceFromEnvironment(): TimeEntriesService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createTimeEntriesService({ url, serviceRoleKey })
    : null;
}

function createKioskServiceFromEnvironment(): KioskService | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey
    ? createKioskService({ url, serviceRoleKey })
    : null;
}

function createNotificationOutboxWorkerFromEnvironment(): NotificationOutboxWorker | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createNotificationOutboxWorker({
    url,
    serviceRoleKey,
    workerId: process.env.NOTIFICATION_WORKER_ID,
    batchSize: integerEnvironmentValue(
      process.env.NOTIFICATION_OUTBOX_BATCH_SIZE,
    ),
    leaseSeconds: integerEnvironmentValue(
      process.env.NOTIFICATION_OUTBOX_LEASE_SECONDS,
    ),
    maxAttempts: integerEnvironmentValue(
      process.env.NOTIFICATION_OUTBOX_MAX_ATTEMPTS,
    ),
    retryBaseDelaySeconds: integerEnvironmentValue(
      process.env.NOTIFICATION_OUTBOX_RETRY_BASE_SECONDS,
    ),
  });
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
