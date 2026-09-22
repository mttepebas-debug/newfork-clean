import {
  employeeInputSchema,
  employeeCreateCommandSchema,
  employeeRoleUpdateInputSchema,
  type Permission,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceAuthorization,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type {
  EmployeeDirectoryService,
  TerminationTimeEntryAction,
} from "./employee-directory-service";
import type { EmployeeCreateService } from "./employee-create-service";

const ownEmergencyContactBody = z.object({
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().or(z.literal("")).optional(),
});

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const employeeParams = workspaceParams.extend({
  employeeId: z.string().uuid(),
});
const queryBoolean = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");
const listQuery = z.object({
  archived: queryBoolean.default(false),
  search: z.string().default(""),
  status: z.string().default("all"),
});
const archiveBody = z.object({
  archived: z.boolean(),
  restoreAccess: z.boolean().default(false),
});
const terminationBody = z.object({
  effectiveLocal: z.string().min(1),
  worksiteTimezone: z.string().min(1),
  timeEntryAction: z.enum([
    "block",
    "close_at",
    "keep_open",
  ] satisfies TerminationTimeEntryAction[]),
  reason: z.string().default(""),
  idempotencyKey: z.string().uuid(),
});

export function registerEmployeeDirectoryRoutes(
  app: FastifyInstance,
  options: {
    service: EmployeeDirectoryService | null;
    createService?: EmployeeCreateService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.get("/v1/workspaces/:workspaceId/me/avatar", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const { context } = await resolveWorkspaceMembership({
      authorization: request.headers.authorization, workspaceId: params.data.workspaceId,
      resolver: options.contextResolver,
    });
    if (!context) return reply.status(404).send({ error: "Workspace unavailable" });
    if (!options.service?.getOwnAvatar) return reply.status(503).send({ error: "Account photo service is not configured" });
    try { return reply.send(await options.service.getOwnAvatar({ actorUserId: context.userId, workspaceId: context.workspace.id })); }
    catch (error) { return requestError(reply, error); }
  });
  app.post(
    "/v1/workspaces/:workspaceId/employees/create",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = employeeCreateCommandSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid employee details required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employees.manage",
        options.contextResolver,
        reply,
        "Employee management required",
        { allowIncompleteOnboarding: true },
      );
      if (!context) return;
      if (body.data.invite_role_id) {
        const access = await authorize(
          request.headers.authorization,
          params.data.workspaceId,
          "employee_access.manage",
          options.contextResolver,
          reply,
          "Employee access required",
        );
        if (!access) return;
      }
      if (!options.createService)
        return reply
          .status(503)
          .send({ error: "Employee create service is not configured" });
      try {
        return reply
          .status(201)
          .send(
            await options.createService.create(
              context.userId,
              params.data.workspaceId,
              body.data,
            ),
          );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
  app.get("/v1/workspaces/:workspaceId/employees", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    const query = listQuery.safeParse(request.query);
    if (!params.success || !query.success)
      return reply.status(400).send({ error: "Valid employee query required" });
    const context = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "employees.read",
      options.contextResolver,
      reply,
      "Employee read required",
    );
    if (!context) return;
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Employee directory service is not configured" });
    try {
      return reply.send(
        await options.service.list({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          ...query.data,
        }),
      );
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employees.read",
        options.contextResolver,
        reply,
        "Employee read required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        return reply.send(
          await options.service.get({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            employeeId: params.data.employeeId,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId/avatar",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employees.read",
        options.contextResolver,
        reply,
        "Employee read required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        return reply.send(
          await options.service.getAvatar({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            employeeId: params.data.employeeId,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/employees/:employeeId/avatar",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employee_access.manage",
        options.contextResolver,
        reply,
        "Employee access required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        await options.service.removeAvatar({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/employees/:employeeId/access",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employee_access.manage",
        options.contextResolver,
        reply,
        "Employee access required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        await options.service.removeAccess({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  // The owner's own emergency contact. Everyone else gives one during
  // onboarding; the owner never runs it. The database checks that the record is
  // the caller's own and that the caller owns the workspace.
  app.put(
    "/v1/workspaces/:workspaceId/employees/:employeeId/emergency-contact",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = ownEmergencyContactBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "An emergency contact needs a name and a phone number" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employees.read",
        options.contextResolver,
        reply,
        "Employee access required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        await options.service.saveOwnEmergencyContact({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          name: body.data.name,
          relationship: body.data.relationship ?? "",
          phone: body.data.phone,
          email: body.data.email ?? "",
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post("/v1/workspaces/:workspaceId/employees", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    const body = employeeInputSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid employee details required" });
    const context = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "employees.manage",
      options.contextResolver,
      reply,
      "Employee management required",
      { allowIncompleteOnboarding: true },
    );
    if (!context) return;
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Employee directory service is not configured" });
    try {
      return reply.status(201).send({
        id: await options.service.save({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employee: body.data,
        }),
      });
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.put(
    "/v1/workspaces/:workspaceId/employees/:employeeId",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = employeeInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid employee details required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employees.manage",
        options.contextResolver,
        reply,
        "Employee management required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        return reply.send({
          id: await options.service.save({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            employeeId: params.data.employeeId,
            employee: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/employees/:employeeId/role",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = employeeRoleUpdateInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid employee role required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employee_access.manage",
        options.contextResolver,
        reply,
        "Employee access required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        await options.service.updateRole({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          role: body.data,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/employees/:employeeId/archive",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = archiveBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid archive state required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employees.archive",
        options.contextResolver,
        reply,
        "Employee archive required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        await options.service.setArchived({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          archived: body.data.archived,
          restoreAccess: body.data.restoreAccess,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/employees/:employeeId/termination",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = terminationBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid termination details required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "employees.archive",
        options.contextResolver,
        reply,
        "Employee archive required",
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      try {
        return reply.send(
          await options.service.terminate({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            employeeId: params.data.employeeId,
            termination: body.data,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  permission: Permission,
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
  permissionMessage: string,
  options: { readonly allowIncompleteOnboarding?: boolean } = {},
) {
  const result = await resolveWorkspaceAuthorization({
    authorization,
    workspaceId,
    permission,
    resolver,
    allowIncompleteOnboarding: options.allowIncompleteOnboarding,
  });
  if (result.context) return result.context;
  if (result.denied === "workspace_not_found") {
    reply.status(404).send({ error: "Workspace not found" });
    return null;
  }
  reply.status(403).send({ error: permissionMessage });
  return null;
}

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Employee operation failed";
  if (
    message.includes("access required") ||
    message.includes("access denied") ||
    message.includes("denied") ||
    message.includes("not permitted")
  )
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (
    message.includes("revision conflict") ||
    message.includes("stale") ||
    message.includes("idempotency")
  )
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
