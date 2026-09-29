import {
  employeePersonalTaskInputSchema,
  employeeRequestActionInputSchema,
  employeeTimeOffInputSchema,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  resolveWorkspaceMembership,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { EmployeeHubService } from "./employee-hub-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const rangeQuery = z.object({ from: z.string().date(), to: z.string().date() });
const scheduleBoardQuery = z.object({ date: z.string().date() });

export function registerEmployeeHubRoutes(
  app: FastifyInstance,
  options: {
    service: EmployeeHubService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.route({
    method: ["GET", "POST"],
    url: "/v1/workspaces/:workspaceId/employee-hub/personal-tasks",
    handler: async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const task =
        request.method === "POST"
          ? employeePersonalTaskInputSchema.safeParse(request.body)
          : null;
      if (!params.success || (task && !task.success))
        return reply
          .status(400)
          .send({ error: "Valid personal task required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee Hub service is not configured" });
      const input = {
        actorUserId: context.userId,
        workspaceId: params.data.workspaceId,
      };
      return reply.send(
        task?.success
          ? await options.service.changePersonalTask({
              ...input,
              task: task.data,
            })
          : await options.service.getPersonalTasks(input),
      );
    },
  });
  app.get(
    "/v1/workspaces/:workspaceId/employee-hub/schedule",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const query = scheduleBoardQuery.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid schedule date required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee Hub service is not configured" });
      return reply.send(
        await options.service.getScheduleBoard({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          targetDate: query.data.date,
        }),
      );
    },
  );
  app.get(
    "/v1/workspaces/:workspaceId/employee-hub",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const query = rangeQuery.safeParse(request.query);
      if (!params.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid employee hub range required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee Hub service is not configured" });
      return reply.send(
        await options.service.get({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          ...query.data,
        }),
      );
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/employee-hub/time-off",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = employeeTimeOffInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid time off request required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee Hub service is not configured" });
      return reply.send(
        await options.service.submitTimeOff({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          request: body.data,
        }),
      );
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/employee-hub/request-action",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = employeeRequestActionInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid request action required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Employee Hub service is not configured" });
      return reply.send(
        await options.service.actOnRequest({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          action: body.data,
        }),
      );
    },
  );
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  resolver: WorkspaceContextResolver | null,
  reply: FastifyReply,
) {
  const result = await resolveWorkspaceMembership({
    authorization,
    workspaceId,
    resolver,
  });
  if (result.context) return result.context;
  reply.status(404).send({ error: "Workspace not found" });
  return null;
}
