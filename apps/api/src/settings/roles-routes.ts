import { workspaceRoleInputSchema, type Permission } from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { HttpError } from "../http-error.js";
import { z } from "zod";
import {
  resolveWorkspaceAuthorization,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { RolesService } from "./roles-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const roleParams = workspaceParams.extend({ roleId: z.string().uuid() });

export function registerRolesRoutes(
  app: FastifyInstance,
  options: {
    service: RolesService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.post("/v1/workspaces/:workspaceId/roles", async (request, reply) => {
    const params = workspaceParams.safeParse(request.params);
    const body = workspaceRoleInputSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.status(400).send({ error: "Valid role details required" });
    const context = await authorize(
      request.headers.authorization,
      params.data.workspaceId,
      "roles.manage",
      options.contextResolver,
      reply,
    );
    if (!context) return;
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Role service is not configured" });
    try {
      return reply.status(201).send({
        id: await options.service.save({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          role: body.data,
        }),
      });
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.put(
    "/v1/workspaces/:workspaceId/roles/:roleId",
    async (request, reply) => {
      const params = roleParams.safeParse(request.params);
      const body = workspaceRoleInputSchema.safeParse(request.body);
      if (!params.success || !body.success || !body.data.expected_updated_at)
        return reply
          .status(400)
          .send({ error: "Valid role details and current version required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "roles.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Role service is not configured" });
      try {
        return reply.send({
          id: await options.service.save({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            roleId: params.data.roleId,
            role: body.data,
          }),
        });
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/roles/:roleId",
    async (request, reply) => {
      const params = roleParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid role required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        "roles.manage",
        options.contextResolver,
        reply,
      );
      if (!context) return;
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Role service is not configured" });
      try {
        await options.service.delete({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          roleId: params.data.roleId,
        });
        return reply.status(204).send();
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
) {
  const result = await resolveWorkspaceAuthorization({
    authorization,
    workspaceId,
    permission,
    resolver,
  });
  if (result.context) return result.context;
  reply.status(result.denied === "workspace_not_found" ? 404 : 403).send({
    error:
      result.denied === "workspace_not_found"
        ? "Workspace not found"
        : "Role management required",
  });
  return null;
}

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Role operation failed";
  // A typed status wins: it comes from the SQLSTATE the RPC raised, not from
  // the wording of its message. The matching below stays for untyped throws.
  if (error instanceof HttpError)
    return reply.status(error.statusCode).send({ error: message });
  if (
    message.includes("not eligible") ||
    message.includes("limited to personal") ||
    message.includes("beyond your own") ||
    message.includes("access required") ||
    message.includes("access denied") ||
    message.includes("denied")
  )
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (
    message.includes("exists") ||
    message.includes("assigned") ||
    message.includes("changed") ||
    message.includes("references")
  )
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}
