import { settingsReadKinds } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { SettingsReadsService } from "./settings-reads-service";

const params = z.object({
  workspaceId: z.string().uuid(),
  kind: z.enum(settingsReadKinds as [string, ...string[]]),
});

/**
 * GET /v1/workspaces/:workspaceId/settings/:kind. No gate here: the service
 * asks the authorization core, and its "no" (42501 + authz.*) reaches the
 * screen through the global error handler as 404 (not a member) or 403.
 */
export function registerSettingsReadsRoutes(
  app: FastifyInstance,
  options: {
    service: SettingsReadsService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  app.get("/v1/workspaces/:workspaceId/settings/:kind", async (request, reply) => {
    const parsed = params.safeParse(request.params);
    if (!parsed.success)
      return reply.status(400).send({ error: "Valid workspace and settings page required" });
    const actor = await resolveActor(
      request.headers.authorization,
      parsed.data.workspaceId,
      options.contextResolver,
    );
    if (!options.service)
      return reply.status(503).send({ error: "Settings service is not configured" });
    return reply.send(
      await options.service.read(parsed.data.kind as (typeof settingsReadKinds)[number], {
        actorUserId: actor.userId,
        workspaceId: actor.workspace.id,
      }),
    );
  });
}
