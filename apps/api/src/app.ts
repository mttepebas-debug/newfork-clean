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
import {
  createSupabaseWorkspaceContextResolver,
  type WorkspaceContextResolver,
} from "./auth/workspace-context";
import {
  createEmployeeInvitationService,
  type EmployeeInvitationService,
} from "./employees/invitation-service";
import {
  createEmployeeOnboardingService,
  type EmployeeOnboardingService,
} from "./employees/onboarding-service";
import { registerEmployeeOnboardingRoutes } from "./employees/onboarding-routes";
import {
  createAwsSsnEncryptionService,
  createLocalSsnEncryptionService,
} from "./employees/ssn-encryption";
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

const requestContextHeadersSchema = z.object({
  "x-user-id": z.string().uuid(),
  "x-workspace-id": z.string().uuid(),
  "x-workspace-role": workspaceRoleSchema,
});

function isLocalDevelopmentOrigin(origin: string | undefined): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (origin?.startsWith("http://127.0.0.1:") === true ||
      origin?.startsWith("http://localhost:") === true)
  );
}

interface BuildAppOptions {
  readonly allowDevelopmentIdentity?: boolean;
  readonly contextResolver?: WorkspaceContextResolver | null;
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

  app.addHook("onSend", async (request, reply, payload) => {
    const origin = request.headers.origin;
    const allowedOrigin = process.env.APP_URL ?? "http://127.0.0.1:5555";
    if (origin === allowedOrigin || isLocalDevelopmentOrigin(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
    }
    return payload;
  });
  app.addHook("onRequest", async (request, reply) => {
    if (
      (request.url.startsWith("/v1/me/onboarding") ||
        request.url.includes("/employee-hub") ||
        request.url.includes("/time-entries") ||
        request.url.includes("/schedule/") ||
        request.url.includes("/communications/") ||
        request.url.endsWith("/workspace/layout") ||
        request.url.includes("/kiosk/")) &&
      request.method !== "GET" &&
      request.method !== "OPTIONS"
    ) {
      const origin = request.headers.origin;
      const allowedOrigin = process.env.APP_URL ?? "http://127.0.0.1:5555";
      const localDevelopmentOrigin = isLocalDevelopmentOrigin(origin);
      if (origin && origin !== allowedOrigin && !localDevelopmentOrigin)
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
      "Authorization,Content-Type,Idempotency-Key",
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

    try {
      const context = await contextResolver.resolve(accessToken);
      if (!context)
        return reply
          .status(401)
          .send({ error: "Invalid session or membership" });
      return reply.send(context);
    } catch (error) {
      request.log.error(error);
      return reply
        .status(503)
        .send({ error: "Workspace context is temporarily unavailable" });
    }
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
      const context = await resolveRequestContext(
        request.headers.authorization,
        contextResolver,
      );
      if (!context)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (
        context.workspace.id !== params.data.workspaceId ||
        !context.permissions.includes("employee_access.manage")
      ) {
        return reply
          .status(403)
          .send({ error: "Employee access management required" });
      }
      try {
        return reply.send(
          await invitationService.prepare({
            actorUserId: context.userId,
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
      const context = await resolveRequestContext(
        request.headers.authorization,
        contextResolver,
      );
      if (!context)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (
        context.workspace.id !== params.data.workspaceId ||
        !context.permissions.includes("employee_access.manage")
      )
        return reply
          .status(403)
          .send({ error: "Employee access management required" });
      try {
        await invitationService.revoke({
          actorUserId: context.userId,
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
      request.log.error(error);
      return reply.status(409).send({
        error:
          error instanceof Error
            ? error.message
            : "Invitation could not be accepted",
      });
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
    try {
      return reply.send(await invitationService.preview(query.data.token));
    } catch {
      return reply.status(404).send({ error: "Active invitation not found" });
    }
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
  registerCommunicationRoutes(app, {
    service: communicationService,
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

  if (allowDevelopmentIdentity) {
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
  }

  return app;
}

function createResolverFromEnvironment(): WorkspaceContextResolver | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createSupabaseWorkspaceContextResolver({ url, anonKey });
}

function developmentWorkspaceContext(
  role: WorkspaceRole,
): ActiveWorkspaceContext {
  return activeWorkspaceContextSchema.parse({
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspace: {
      id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      name: "Meyhouse",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
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
    async resolve(accessToken) {
      const match = /^development-(owner|admin|manager|employee)-token$/.exec(
        accessToken,
      );
      if (match) {
        return developmentWorkspaceContext(match[1] as WorkspaceRole);
      }
      return fallback?.resolve(accessToken) ?? null;
    },
  };
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
  const keyId = process.env.AWS_KMS_SSN_KEY_ID;
  const region = process.env.AWS_REGION;
  if (production && (!keyId || !region)) return null;
  const encryption =
    keyId && region
      ? createAwsSsnEncryptionService({ keyId, region })
      : createLocalSsnEncryptionService(process.env.LOCAL_SSN_ENCRYPTION_KEY);
  return createEmployeeOnboardingService({
    url,
    serviceRoleKey,
    encryption,
    environment:
      process.env.APP_ENVIRONMENT ??
      (production ? "production" : "development"),
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

async function resolveRequestContext(
  authorization: string | undefined,
  resolver: WorkspaceContextResolver,
) {
  const accessToken = bearerToken(authorization);
  if (!accessToken) return null;
  return resolver.resolve(accessToken);
}

function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
