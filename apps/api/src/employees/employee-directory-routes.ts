import {
  employeeInputSchema,
  employeeCreateCommandSchema,
  employeeRoleUpdateInputSchema,
  employeeAccessChangeInputSchema,
  employeeAccessPreviewInputSchema,
  usPhoneSchema,
  usText,
} from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  resolveActor,
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { EmployeeDirectoryService } from "./employee-directory-service";
import type { EmployeeCreateService } from "./employee-create-service";

// The US form rules (BL-503): names follow the letter rule, phones are a US
// number in E.164.
const ownEmploymentContactBody = z.object({
  name: usText(z.string().trim().min(1).max(120)),
  relationship: usText(z.string().trim().max(80)).optional(),
  phone: usPhoneSchema,
  email: z.string().trim().email().or(z.literal("")).optional(),
  // The person's own number, which onboarding takes once and nothing gives
  // back. Left out means leave what is on file.
  personalPhone: usPhoneSchema.or(z.literal("")).optional(),
});

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const employeeParams = workspaceParams.extend({
  employeeId: z.string().uuid(),
});
const employeeLocationParams = employeeParams.extend({
  locationId: z.string().uuid(),
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
    return reply.send(await options.service.getOwnAvatar({ actorUserId: context.userId, workspaceId: context.workspace.id }));
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
      // No gate here: the command asks the core in the database (employee.create
      // at the record's locations; can_invite_with_role for an invitation's
      // role), and its "no" reaches the drawer as 404 or 403 (FB-6.2 .7b).
      // The owner setting up a draft workspace is let through by the core.
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.createService)
        return reply
          .status(503)
          .send({ error: "Employee create service is not configured" });
      return reply
        .status(201)
        .send(
          await options.createService.create(
            context.userId,
            params.data.workspaceId,
            body.data,
          ),
        );
    },
  );
  // What the Employees drawer picks from (BL-231). No gate here: the service
  // asks the core, and its "no" reaches the screen as 404 or 403.
  app.get("/v1/workspaces/:workspaceId/employees/reference-data", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Valid workspace required" });
    const actor = await resolveActor(
      request.headers.authorization,
      params.data.workspaceId,
      options.contextResolver,
    );
    if (!options.service)
      return reply.status(503).send({ error: "Employee directory service is not configured" });
    return reply.send(
      await options.service.references({ actorUserId: actor.userId, workspaceId: actor.workspace.id }),
    );
  });

  app.get("/v1/workspaces/:workspaceId/employees", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    const query = listQuery.safeParse(request.query);
    if (!params.success || !query.success)
      return reply.status(400).send({ error: "Valid employee query required" });
    // No gate here: the service asks the core, and its "no" reaches the
    // screen as 404 or 403 with its reason (FB-6.2 .3).
    const context = await resolveActor(
      request.headers.authorization,
      params.data.workspaceId,
      options.contextResolver,
    );
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Employee directory service is not configured" });
    return reply.send(
      await options.service.list({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        ...query.data,
      }),
    );
  });

  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      // No gate here: the service asks the core (FB-6.2 .3).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send(
        await options.service.get({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
        }),
      );
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId/avatar",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      // No gate here: the service asks the core (FB-6.2 .3).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send(
        await options.service.getAvatar({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
        }),
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/employees/:employeeId/avatar",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      // No gate here: the service asks the core, and its "no" reaches the
      // drawer as 404 or 403 with its reason (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      await options.service.removeAvatar({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        employeeId: params.data.employeeId,
      });
      return reply.status(204).send();
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/employees/:employeeId/access",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      // No gate here: the service asks the core, and its "no" reaches the
      // drawer as 404 or 403 with its reason (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      await options.service.removeAccess({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        employeeId: params.data.employeeId,
      });
      return reply.status(204).send();
    },
  );

  // Taking somebody off one location they work at (FB-6.2 S1): the record
  // stays, with no location if it was the only one. No gate here: the service
  // asks the core (employee.remove_from_location at that location).
  app.delete(
    "/v1/workspaces/:workspaceId/employees/:employeeId/locations/:locationId",
    async (request, reply) => {
      const params = employeeLocationParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee and location required" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send(
        await options.service.removeFromLocation({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          locationId: params.data.locationId,
        }),
      );
    },
  );

  // The asking and answering of a preferred name; every one waits for who may
  // decide it (KARARLAR S-131).
  app.put(
    "/v1/workspaces/:workspaceId/employees/:employeeId/preferred-name",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = z
        .object({ preferredName: usText(z.string().trim().max(80)) })
        .safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "A preferred name is at most 80 characters" });
      // No gate here: the service asks the core (employee.request_preferred_name
      // on the person's own record; BL-443).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send({
        outcome: await options.service.requestPreferredName({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          preferredName: body.data.preferredName,
        }),
      });
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/preferred-names/pending",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      // No gate here: the service asks the core
      // (employee.decide_preferred_name; BL-443).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send(
        await options.service.listPendingPreferredNames({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
        }),
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/preferred-names/:requestId/decision",
    async (request, reply) => {
      const params = workspaceParams
        .extend({ requestId: z.string().uuid() })
        .safeParse(request.params);
      const body = z.object({ approve: z.boolean() }).safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid decision required" });
      // No gate here: the service asks the core
      // (employee.decide_preferred_name; BL-443).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      await options.service.decidePreferredName({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        requestId: params.data.requestId,
        approve: body.data.approve,
      });
      return reply.status(204).send();
    },
  );

  // A person's own emergency contact and personal phone. Onboarding asks once
  // and never comes back; the owner is never asked at all. No gate here: the
  // service asks the core (employee.save_own_contact on the caller's own
  // record; BL-443, BL-444).
  app.put(
    "/v1/workspaces/:workspaceId/employees/:employeeId/emergency-contact",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = ownEmploymentContactBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "An emergency contact needs a name and a phone number" });
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      await options.service.saveOwnEmploymentContact({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        employeeId: params.data.employeeId,
        name: body.data.name,
        relationship: body.data.relationship ?? "",
        phone: body.data.phone,
        email: body.data.email ?? "",
        personalPhone: body.data.personalPhone ?? null,
      });
      return reply.status(204).send();
    },
  );

  app.post("/v1/workspaces/:workspaceId/employees", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    const body = employeeInputSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid employee details required" });
    // No gate here: the service asks the core (FB-6.2 .7b).
    const context = await resolveActor(
      request.headers.authorization,
      params.data.workspaceId,
      options.contextResolver,
    );
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Employee directory service is not configured" });
    return reply.status(201).send({
      id: await options.service.save({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        employee: body.data,
      }),
    });
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
      // No gate here: the service asks the core, and its "no" reaches the
      // drawer as 404 or 403 with its reason (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send({
        id: await options.service.save({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          employee: body.data,
        }),
      });
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
      // No gate here: the service asks the core, and its "no" reaches the
      // drawer as 404 or 403 with its reason (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      await options.service.updateRole({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        employeeId: params.data.employeeId,
        role: body.data,
      });
      return reply.status(204).send();
    },
  );

  // ROL-CIFT 4.1 (design §4.8): what changing somebody's access does, then the
  // change itself, sent with the impact the reader was shown (409 when it moved).
  app.post(
    "/v1/workspaces/:workspaceId/employees/:employeeId/access/preview",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = employeeAccessPreviewInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid employee access required" });
      // No gate here: the service asks the core (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send(
        await options.service.previewAccessChange({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          access: body.data,
        }),
      );
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/employees/:employeeId/access",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = employeeAccessChangeInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid employee access required" });
      // No gate here: the service asks the core (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send(
        await options.service.changeAccess({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          access: body.data,
        }),
      );
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
      // No gate here: the service asks the core, and its "no" reaches the
      // drawer as 404 or 403 with its reason (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      await options.service.setArchived({
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
        employeeId: params.data.employeeId,
        archived: body.data.archived,
        restoreAccess: body.data.restoreAccess,
      });
      return reply.status(204).send();
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
      // No gate here: the service asks the core, and its "no" reaches the
      // drawer as 404 or 403 with its reason (FB-6.2 .4, KK-31).
      const context = await resolveActor(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee directory service is not configured" });
      return reply.send(
        await options.service.terminate({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          employeeId: params.data.employeeId,
          termination: body.data,
        }),
      );
    },
  );
}
