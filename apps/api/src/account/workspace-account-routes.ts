import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ownerLegalNameSchema, usText, workspaceNameInputSchema } from "@newfork/shared";
import {
  bearerToken,
  resolveWorkspaceAuthorization,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { EmployeeInvitationService } from "../employees/invitation-service";
import type { WorkspaceAccountService } from "./workspace-account-service";

const createWorkspaceBody = z.object({
  name: workspaceNameInputSchema,
});
const workspaceParams = z.object({
  workspaceId: z.string().uuid(),
});
const workspaceClosureBody = z
  .object({
    mode: z.union([z.literal("scheduled_end_period"), z.literal("immediate")]),
    typedWorkspaceName: z.string().trim().min(1).max(120).nullable().optional(),
    acknowledged: z.boolean(),
    effectiveAt: z.string().datetime({ offset: true }).nullable().optional(),
    password: z.string().max(1024).optional(),
  })
  .superRefine((value, issue) => {
    if (!value.acknowledged) {
      issue.addIssue({
        code: "custom",
        path: ["acknowledged"],
        message: "Workspace closure acknowledgement is required",
      });
    }
    if (
      value.mode === "immediate" &&
      (!value.typedWorkspaceName ||
        value.typedWorkspaceName.trim().length === 0)
    ) {
      issue.addIssue({
        code: "custom",
        path: ["typedWorkspaceName"],
        message: "Workspace name confirmation is required",
      });
    }
  });
const ownershipTransferBody = z.object({
  targetUserId: z.string().uuid(),
  password: z.string().max(1024).optional(),
});
const ownershipTransferResponseBody = z.object({
  transferId: z.string().uuid(),
  action: z.union([z.literal("accept"), z.literal("reject")]),
  password: z.string().max(1024).optional(),
});
const ownerOnboardingBody = z.object({
  // The workspace and the owner's names follow the US letter rule (BL-503).
  workspaceName: workspaceNameInputSchema,
  nextStep: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  complete: z.boolean(),
  expectedRevision: z.number().int().positive().nullable().optional(),
  // The owner's own employee record: the name the workspace files them under,
  // and whether they take shifts themselves.
  ownerFirstName: usText(z.string().trim().min(1).max(80)).optional(),
  ownerMiddleName: usText(z.string().trim().max(80)).optional(),
  ownerLastName: usText(z.string().trim().min(1).max(80)).optional(),
});
const ownerOnboardingInvitationIntentBody = z.object({
  employeeId: z.string().uuid(),
  email: z.string().trim().email(),
});

export function registerWorkspaceAccountRoutes(
  app: FastifyInstance,
  options: {
    service: WorkspaceAccountService | null;
    contextResolver: WorkspaceContextResolver | null;
    invitationService?: EmployeeInvitationService | null;
  },
) {
  app.get("/v1/account/workspaces", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Workspace account service is not configured" });
    return reply.send(await options.service.listWorkspaces(accessToken));
  });

  app.get("/v1/account/attention", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Workspace account service is not configured" });
    return reply.send(await options.service.countAttention(accessToken));
  });

  // Your own employment record, one per workspace you are in. Nothing here is
  // anybody else's: the RPC answers for the caller and nobody else.
  app.get("/v1/account/employment-records", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Workspace account service is not configured" });
    return reply.send(await options.service.listEmploymentRecords(accessToken));
  });

  // The owner's legal name (BL-080). No gate here: the database core decides
  // (workspace.setup, owner only) and its refusal travels as its reason.
  app.get(
    "/v1/account/workspaces/:workspaceId/legal-name",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      return reply.send({
        legalName: await options.service.getOwnLegalName(
          accessToken,
          params.data.workspaceId,
        ),
      });
    },
  );

  app.put(
    "/v1/account/workspaces/:workspaceId/legal-name",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      const body = ownerLegalNameSchema.safeParse(request.body);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "A first and a last name are required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      await options.service.saveOwnLegalName(
        accessToken,
        params.data.workspaceId,
        body.data,
      );
      return reply.status(204).send();
    },
  );

  app.post("/v1/account/workspaces", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = createWorkspaceBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success)
      return reply.status(400).send({ error: "Valid workspace name required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Workspace account service is not configured" });
    return reply.status(201).send({
      id: await options.service.createWorkspace(accessToken, body.data.name),
    });
  });

  app.post(
    "/v1/account/workspaces/:workspaceId/active",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      await options.service.selectWorkspace(
        accessToken,
        params.data.workspaceId,
      );
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/account/workspaces/:workspaceId/closure",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      const body = workspaceClosureBody.safeParse(request.body);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid workspace closure details required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      // Both ways of closing a workspace ask for the password, checked here on
      // the server. Scheduling it used to be exempt, on the reading that a date
      // in the future is not destructive yet -- but the workspace is marked as
      // closing the moment it is asked for, everybody in it is told, and the
      // date arrives on its own. Somebody who walked away from an unlocked
      // laptop should not be able to lose a workspace that way either.
      //
      // The exemption that stays is the one about the workspace, not the mode:
      // a setup its owner never finished holds nothing worth a password.
      if (
        !(await isUnfinishedSetup(
          options.service,
          accessToken,
          params.data.workspaceId,
        ))
      ) {
        if (
          await refusedPassword(
            options.service,
            accessToken,
            body.data.password,
            reply,
          )
        )
          return reply;
      }
      return reply.send(
        await options.service.requestClosure(accessToken, {
          workspaceId: params.data.workspaceId,
          mode: body.data.mode,
          typedWorkspaceName: body.data.typedWorkspaceName ?? null,
          acknowledged: body.data.acknowledged,
          effectiveAt: body.data.effectiveAt ?? null,
        }),
      );
    },
  );

  app.post(
    "/v1/account/workspaces/:workspaceId/closure/cancel",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      return reply.send(
        await options.service.cancelClosure(
          accessToken,
          params.data.workspaceId,
        ),
      );
    },
  );

  app.post(
    "/v1/account/workspaces/:workspaceId/ownership-transfer",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      const body = ownershipTransferBody.safeParse(request.body);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid ownership transfer details required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      if (
        await refusedPassword(
          options.service,
          accessToken,
          body.data.password,
          reply,
        )
      )
        return reply;
      return reply.send(
        await options.service.initiateOwnershipTransfer(accessToken, {
          workspaceId: params.data.workspaceId,
          targetUserId: body.data.targetUserId,
        }),
      );
    },
  );

  app.post(
    "/v1/account/workspaces/:workspaceId/ownership-transfer/respond",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      const body = ownershipTransferResponseBody.safeParse(request.body);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid ownership transfer response required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      // Rejecting gives nothing away; accepting takes the workspace on.
      if (body.data.action === "accept") {
        if (
          await refusedPassword(
            options.service,
            accessToken,
            body.data.password,
            reply,
          )
        )
          return reply;
      }
      return reply.send(
        await options.service.respondOwnershipTransfer(accessToken, {
          workspaceId: params.data.workspaceId,
          transferId: body.data.transferId,
          action: body.data.action,
        }),
      );
    },
  );

  app.get("/v1/account/workspaces/:workspaceId/ownership-transfer/candidates", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const params = workspaceParams.safeParse(request.params);
    const query = z.object({ q: z.string().trim().min(2).max(80) }).safeParse(request.query);
    if (!accessToken) return reply.status(401).send({ error: "Bearer token required" });
    if (!params.success || !query.success) return reply.status(400).send({ error: "Enter 2 to 80 characters to search" });
    if (!options.service) return reply.status(503).send({ error: "Workspace account service is not configured" });
    reply.header("Cache-Control", "no-store");
    return reply.send(await options.service.searchOwnershipCandidates(accessToken, params.data.workspaceId, query.data.q));
  });

  app.post("/v1/account/workspaces/:workspaceId/ownership-transfer/cancel", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const params = workspaceParams.safeParse(request.params);
    const body = z.object({ transferId: z.string().uuid() }).safeParse(request.body);
    if (!accessToken) return reply.status(401).send({ error: "Bearer token required" });
    if (!params.success || !body.success) return reply.status(400).send({ error: "Valid ownership transfer required" });
    if (!options.service) return reply.status(503).send({ error: "Workspace account service is not configured" });
    return reply.send(await options.service.cancelOwnershipTransfer(accessToken, params.data.workspaceId, body.data.transferId));
  });

  // How each workspace has this account on file. Read-only, and only the
  // account's own rows.
  app.get("/v1/account/workspace-identities", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Authenticated account required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Workspace account service is not configured" });
    return reply.send(
      await options.service.listWorkspaceIdentities(accessToken),
    );
  });

  app.patch(
    "/v1/workspaces/:workspaceId/owner-onboarding",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      const body = ownerOnboardingBody.safeParse(request.body);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid onboarding details required" });
      const authorization = await resolveWorkspaceAuthorization({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        permission: "workspace.manage",
        resolver: options.contextResolver,
        allowIncompleteOnboarding: true,
      });
      if (!authorization.context) {
        return reply
          .status(
            authorization.denied === "workspace_not_found" ? 404 : 403,
          )
          .send({
            error:
              authorization.denied === "workspace_not_found"
                ? "Workspace not found"
                : "Workspace management required",
          });
      }
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      await options.service.saveOwnerOnboarding(accessToken, {
        workspaceId: params.data.workspaceId,
        workspaceName: body.data.workspaceName,
        nextStep: body.data.nextStep,
        complete: body.data.complete,
        expectedRevision: body.data.expectedRevision ?? null,
        ownerFirstName: body.data.ownerFirstName ?? null,
        ownerMiddleName: body.data.ownerMiddleName ?? null,
        ownerLastName: body.data.ownerLastName ?? null,
      });
      if (body.data.complete && options.invitationService) {
        const intents =
          await options.service.listOwnerOnboardingInvitationIntents(
            accessToken,
            params.data.workspaceId,
          );
        for (const intent of intents) {
          try {
            await options.invitationService.prepare({
              actorUserId: authorization.context.userId,
              workspaceId: params.data.workspaceId,
              employeeId: intent.employeeId,
              email: intent.email,
              access: {
                employee_role_id: intent.employeeRoleId,
                management_role_id: null,
                managed_location_ids: [],
              },
            });
            await options.service.markOwnerOnboardingInvitationIntentDispatched(
              accessToken,
              {
                workspaceId: params.data.workspaceId,
                employeeId: intent.employeeId,
              },
            );
          } catch (dispatchError) {
            request.log.error(dispatchError);
            await options.service
              .markOwnerOnboardingInvitationIntentDispatched(accessToken, {
                workspaceId: params.data.workspaceId,
                employeeId: intent.employeeId,
                error:
                  dispatchError instanceof Error
                    ? dispatchError.message
                    : "Owner onboarding invitation dispatch failed",
              })
              .catch((markError: unknown) => request.log.error(markError));
          }
        }
      }
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/owner-onboarding/invitation-intents",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      const body = ownerOnboardingInvitationIntentBody.safeParse(request.body);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid invitation intent details required" });
      const authorization = await resolveWorkspaceAuthorization({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        permission: "workspace.manage",
        resolver: options.contextResolver,
        allowIncompleteOnboarding: true,
      });
      if (!authorization.context) {
        return reply
          .status(
            authorization.denied === "workspace_not_found" ? 404 : 403,
          )
          .send({
            error:
              authorization.denied === "workspace_not_found"
                ? "Workspace not found"
                : "Workspace management required",
          });
      }
      if (!body.success)
        return reply
          .status(400)
          .send({ error: "Valid invitation intent details required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      await options.service.queueOwnerOnboardingInvitationIntent(accessToken, {
        workspaceId: params.data.workspaceId,
        employeeId: body.data.employeeId,
        email: body.data.email,
      });
      return reply.status(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/owner-onboarding/reset",
    async (request, reply) => {
      const accessToken = bearerToken(request.headers.authorization);
      const params = workspaceParams.safeParse(request.params);
      if (!accessToken)
        return reply.status(401).send({ error: "Bearer token required" });
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const authorization = await resolveWorkspaceAuthorization({
        authorization: request.headers.authorization,
        workspaceId: params.data.workspaceId,
        permission: "workspace.manage",
        resolver: options.contextResolver,
        allowIncompleteOnboarding: true,
      });
      if (!authorization.context) {
        return reply
          .status(
            authorization.denied === "workspace_not_found" ? 404 : 403,
          )
          .send({
            error:
              authorization.denied === "workspace_not_found"
                ? "Workspace not found"
                : "Workspace management required",
          });
      }
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      await options.service.resetOwnerOnboarding(
        accessToken,
        params.data.workspaceId,
      );
      return reply.status(204).send();
    },
  );
}

/**
 * A setup its owner never finished holds nothing: they are its only member, no
 * invitation has gone out yet, and there is no schedule to lose. Deleting one
 * undoes a false start, so it does not ask for the password that closing a
 * live workspace asks for. The answer comes from the server's own list, never
 * from the request; a lookup that fails leaves the password gate shut.
 */
async function isUnfinishedSetup(
  service: WorkspaceAccountService,
  accessToken: string,
  workspaceId: string,
): Promise<boolean> {
  try {
    const workspace = (await service.listWorkspaces(accessToken)).find(
      (candidate) => candidate.id === workspaceId,
    );
    return (
      workspace?.role === "owner" &&
      workspace.status === "active" &&
      workspace.onboarding.status !== "complete"
    );
  } catch {
    return false;
  }
}

/**
 * The password gate for closing a workspace and handing it over (SEC-003). The
 * server signs in with the password itself: an open session, however fresh its
 * token, does not prove who is at the keyboard. No password is 400
 * session.password_required; a wrong one is the service's 403
 * session.password_incorrect. Both carry a key, so the screen answers them
 * like any other refusal and the sentence stays free to change.
 */
async function refusedPassword(
  service: WorkspaceAccountService,
  accessToken: string,
  password: string | undefined,
  reply: FastifyReply,
): Promise<boolean> {
  // ponytail: a boolean, not the reply -- a FastifyReply is thenable, so an
  // async function returning one resolves to undefined.
  if (!password) {
    reply.status(400).send({
      error: "Current password required",
      reason: "session.password_required",
    });
    return true;
  }
  await service.verifyPassword(accessToken, password);
  return false;
}
