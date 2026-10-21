import { onboardingApprovalSettingsInputSchema, type AuthzAction } from "@newfork/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { authorize, resolveActor, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { OnboardingApprovalService } from "./onboarding-approval-service";

// Settings > General, "New people wait for approval" (KATILIM-ONAY, S-231). Anybody in the workspace
// reads it; the owner and admins change it (settings.organization.write, GA-2). The database asks the
// core again.
export function registerOnboardingApprovalRoutes(
  app: FastifyInstance,
  options: {
    service: OnboardingApprovalService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  async function gate(request: FastifyRequest, action: AuthzAction) {
    const { workspaceId } = request.params as { workspaceId?: string };
    const context = authorize(
      await resolveActor(request.headers.authorization, workspaceId ?? "", options.contextResolver),
      action,
    );
    return { actorUserId: context.userId, workspaceId: context.workspace.id };
  }

  const url = "/v1/workspaces/:workspaceId/settings/onboarding-approval";

  app.get(url, async (request, reply) => {
    const actor = await gate(request, "workspace.read");
    if (!options.service) return reply.status(503).send({ error: "Onboarding settings are not configured" });
    return reply.send(await options.service.read(actor));
  });

  app.put(url, async (request, reply) => {
    const actor = await gate(request, "settings.organization.write");
    const body = onboardingApprovalSettingsInputSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Choose whether new people wait for approval" });
    if (!options.service) return reply.status(503).send({ error: "Onboarding settings are not configured" });
    return reply.send(
      await options.service.save({ ...actor, finalApprovalRequired: body.data.final_approval_required }),
    );
  });
}
