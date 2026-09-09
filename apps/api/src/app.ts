import {
  type ActiveWorkspaceContext,
  activeWorkspaceContextSchema,
  healthResponseSchema,
  permissionsForRole,
  type WorkspaceRole,
  workspaceRoleSchema,
} from "@newfork/shared";
import Fastify from "fastify";
import { z } from "zod";
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

const requestContextHeadersSchema = z.object({
  "x-user-id": z.string().uuid(),
  "x-workspace-id": z.string().uuid(),
  "x-workspace-role": workspaceRoleSchema,
});
const explicitWorkspaceContextHeadersSchema = z.object({
  "x-newfork-workspace-id": z.string().uuid().optional(),
});
const developmentInvitationQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  email: z.string().trim().email().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const developmentBearerPattern =
  /^Bearer development-(owner|admin|manager)-token$/;

interface DevelopmentInvitationMailboxEntry {
  readonly id: string;
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly email: string;
  readonly emailHint: string;
  readonly developmentUrl: string;
  readonly expiresAt: string;
  readonly createdAt: string;
}

const developmentInvitationMailbox: DevelopmentInvitationMailboxEntry[] = [];

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
  readonly allowDevelopmentIdentity?: boolean;
  readonly contextResolver?: WorkspaceContextResolver | null;
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

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: false,
  });
  const allowDevelopmentIdentity =
    options.allowDevelopmentIdentity ?? process.env.NODE_ENV !== "production";
  const environmentContextResolver =
    options.contextResolver ?? createResolverFromEnvironment();
  const contextResolver =
    allowDevelopmentIdentity && process.env.NODE_ENV !== "production"
      ? createDevelopmentWorkspaceContextResolver(environmentContextResolver)
      : environmentContextResolver;
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
  const activeInvitationService =
    invitationService &&
    allowDevelopmentIdentity &&
    process.env.NODE_ENV !== "production"
      ? withDevelopmentInvitationMailbox(invitationService)
      : invitationService;
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
      return reply.send(context);
    } catch (error) {
      request.log.error(error);
      return reply
        .status(503)
        .send({ error: "Workspace context is temporarily unavailable" });
    }
  });

  registerWorkspaceAccountRoutes(app, {
    service: workspaceAccountService,
    contextResolver,
    invitationService: activeInvitationService,
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
      if (!contextResolver || !activeInvitationService) {
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
          await activeInvitationService.prepare({
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
      if (!contextResolver || !activeInvitationService) {
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
          await activeInvitationService.retry({
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
      if (!contextResolver || !activeInvitationService) {
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
        await activeInvitationService.revoke({
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

  app.post("/v1/invitations/accept", async (request, reply) => {
    const body = invitationAcceptanceSchema.safeParse(request.body);
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Valid invitation token required" });
    if (!activeInvitationService)
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
        await activeInvitationService.accept(accessToken, body.data.token),
      );
    } catch (error) {
      request.log.error(error);
      return reply.status(409).send({
        error:
          error instanceof Error
            ? error.message
            : "Invitation could not be accepted",
      });
    }
  });

  app.get("/v1/invitations/pending", async (request, reply) => {
    if (!activeInvitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply
        .status(401)
        .send({ error: "Authenticated account required" });
    try {
      return reply.send(await activeInvitationService.listPending(accessToken));
    } catch (error) {
      request.log.error(error);
      return reply.status(409).send({
        error:
          error instanceof Error
            ? error.message
            : "Pending invitations could not be loaded",
      });
    }
  });

  app.post("/v1/invitations/:invitationId/accept", async (request, reply) => {
    const params = invitationActionParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid invitation required" });
    if (!activeInvitationService)
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
        await activeInvitationService.acceptPending(
          accessToken,
          params.data.invitationId,
        ),
      );
    } catch (error) {
      request.log.error(error);
      return reply.status(409).send({
        error:
          error instanceof Error
            ? error.message
            : "Invitation could not be accepted",
      });
    }
  });

  app.post("/v1/invitations/:invitationId/decline", async (request, reply) => {
    const params = invitationActionParamsSchema.safeParse(request.params);
    if (!params.success)
      return reply.status(400).send({ error: "Valid invitation required" });
    if (!activeInvitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply
        .status(401)
        .send({ error: "Authenticated account required" });
    try {
      await activeInvitationService.declinePending(
        accessToken,
        params.data.invitationId,
      );
      return reply.status(204).send();
    } catch (error) {
      request.log.error(error);
      return reply.status(409).send({
        error:
          error instanceof Error
            ? error.message
            : "Invitation could not be declined",
      });
    }
  });

  app.get("/v1/invitations/preview", async (request, reply) => {
    const query = invitationPreviewQuerySchema.safeParse(request.query);
    if (!query.success)
      return reply
        .status(400)
        .send({ error: "Valid invitation token required" });
    if (!activeInvitationService)
      return reply
        .status(503)
        .send({ error: "Employee invitation service is not configured" });
    try {
      return reply.send(
        await activeInvitationService.preview(query.data.token),
      );
    } catch {
      return reply.status(404).send({ error: "Active invitation not found" });
    }
  });

  registerEmployeeDirectoryRoutes(app, {
    service: employeeDirectoryService,
    createService:
      options.employeeCreateService ??
      createEmployeeCreateServiceFromEnvironment(),
    contextResolver,
  });

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

  if (allowDevelopmentIdentity && process.env.NODE_ENV !== "production") {
    app.get("/v1/development/context", async (request, reply) => {
      const headers = requestContextHeadersSchema.safeParse(request.headers);
      if (!headers.success) {
        return reply
          .status(401)
          .send({ error: "A valid workspace context is required" });
      }

      const context = activeWorkspaceContextSchema.parse({
        userId: headers.data["x-user-id"],
        workspace: {
          id: headers.data["x-workspace-id"],
          name: "Development workspace",
        },
        membership: {
          id: crypto.randomUUID(),
          userId: headers.data["x-user-id"],
          workspaceId: headers.data["x-workspace-id"],
          role: headers.data["x-workspace-role"],
          status: "active",
        },
        permissions: permissionsForRole(headers.data["x-workspace-role"]),
      });

      return reply.send(context);
    });

    app.get("/v1/development/invitations", async (request, reply) => {
      if (!developmentBearerPattern.test(request.headers.authorization ?? "")) {
        return reply.status(401).send({
          error: "Development owner, admin or manager token required",
        });
      }
      const query = developmentInvitationQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply
          .status(400)
          .send({ error: "Valid development invitation query required" });
      }
      const email = query.data.email?.trim().toLowerCase();
      const entries = developmentInvitationMailbox
        .filter(
          (entry) =>
            (!query.data.workspaceId ||
              entry.workspaceId === query.data.workspaceId) &&
            (!query.data.employeeId ||
              entry.employeeId === query.data.employeeId) &&
            (!email || entry.email === email),
        )
        .slice(-query.data.limit)
        .reverse()
        .map(({ email: _email, ...entry }) => entry);
      return reply.send(entries);
    });
  }

  return app;
}

function withDevelopmentInvitationMailbox(
  service: EmployeeInvitationService,
): EmployeeInvitationService {
  return {
    ...service,
    async prepare(input) {
      const result = await service.prepare(input);
      if (result.developmentUrl && process.env.NODE_ENV !== "production") {
        developmentInvitationMailbox.push({
          id: result.id,
          workspaceId: input.workspaceId,
          employeeId: input.employeeId,
          email: input.email.trim().toLowerCase(),
          emailHint: maskEmail(input.email),
          developmentUrl: result.developmentUrl,
          expiresAt: result.expiresAt,
          createdAt: new Date().toISOString(),
        });
        if (developmentInvitationMailbox.length > 100) {
          developmentInvitationMailbox.splice(
            0,
            developmentInvitationMailbox.length - 100,
          );
        }
      }
      return result;
    },
  };
}

function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.trim().toLowerCase().split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
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

function developmentWorkspaceContext(
  role: WorkspaceRole,
  workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
): ActiveWorkspaceContext {
  const isDefaultWorkspace =
    workspaceId === "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
  return activeWorkspaceContextSchema.parse({
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspace: {
      id: workspaceId,
      name: isDefaultWorkspace ? "Meyhouse" : "Development workspace",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      workspaceId,
      role,
      status: "active",
      allLocations: true,
    },
    permissions: permissionsForRole(role),
    onboarding: { status: "complete", currentStep: 2 },
    locationScope: { allLocations: true, locationIds: [] },
  });
}

function createDevelopmentWorkspaceContextResolver(
  fallback: WorkspaceContextResolver | null,
): WorkspaceContextResolver {
  return {
    async resolve(accessToken, workspaceId = null) {
      const match = /^development-(owner|admin|manager|employee)-token$/.exec(
        accessToken,
      );
      if (match) {
        return developmentWorkspaceContext(
          match[1] as WorkspaceRole,
          workspaceId ?? undefined,
        );
      }
      return fallback?.resolve(accessToken, workspaceId) ?? null;
    },
  };
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
