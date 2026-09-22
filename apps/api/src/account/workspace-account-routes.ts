import type { FastifyInstance, FastifyReply } from "fastify";
import { HttpError } from "../http-error.js";
import { z } from "zod";
import {
  bearerToken,
  resolveWorkspaceAuthorization,
  type WorkspaceContextResolver,
} from "../auth/workspace-context";
import type { EmployeeInvitationService } from "../employees/invitation-service";
import type { WorkspaceAccountService } from "./workspace-account-service";

const createWorkspaceBody = z.object({
  name: z.string().trim().min(1).max(120),
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
});
const ownershipTransferResponseBody = z.object({
  transferId: z.string().uuid(),
  action: z.union([z.literal("accept"), z.literal("reject")]),
});
const accountDeletionBody = z
  .object({
    typedEmail: z.string().trim().email(),
    acknowledged: z.boolean(),
  })
  .refine((value) => value.acknowledged, {
    path: ["acknowledged"],
    message: "Account deletion acknowledgement is required",
  });
const ownerOnboardingBody = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  nextStep: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  complete: z.boolean(),
  expectedRevision: z.number().int().positive().nullable().optional(),
  // The owner's own employee record: the name the workspace files them under,
  // and whether they take shifts themselves.
  ownerFirstName: z.string().trim().min(1).max(80).optional(),
  ownerMiddleName: z.string().trim().max(80).optional(),
  ownerLastName: z.string().trim().min(1).max(80).optional(),
});
const ownerOnboardingInvitationIntentBody = z.object({
  employeeId: z.string().uuid(),
  email: z.string().trim().email(),
});
const recentReauthenticationWindowMs = 10 * 60 * 1000;
const developmentBearerPattern =
  /^development-(owner|admin|manager|employee)-token$/;

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
    try {
      return reply.send(await options.service.listWorkspaces(accessToken));
    } catch (error) {
      return requestError(reply, error);
    }
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
    try {
      return reply.send(await options.service.listEmploymentRecords(accessToken));
    } catch (error) {
      return requestError(reply, error);
    }
  });

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
    try {
      return reply.status(201).send({
        id: await options.service.createWorkspace(accessToken, body.data.name),
      });
    } catch (error) {
      return requestError(reply, error);
    }
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
      try {
        await options.service.selectWorkspace(
          accessToken,
          params.data.workspaceId,
        );
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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
      if (
        body.data.mode === "immediate" &&
        !hasRecentReauthentication(accessToken) &&
        !(await isUnfinishedSetup(
          options.service,
          accessToken,
          params.data.workspaceId,
        ))
      ) {
        return reauthenticationRequired(reply);
      }
      try {
        return reply.send(
          await options.service.requestClosure(accessToken, {
            workspaceId: params.data.workspaceId,
            mode: body.data.mode,
            typedWorkspaceName: body.data.typedWorkspaceName ?? null,
            acknowledged: body.data.acknowledged,
            effectiveAt: body.data.effectiveAt ?? null,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
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
      try {
        return reply.send(
          await options.service.cancelClosure(
            accessToken,
            params.data.workspaceId,
          ),
        );
      } catch (error) {
        return requestError(reply, error);
      }
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
      if (!hasRecentReauthentication(accessToken)) {
        return reauthenticationRequired(reply);
      }
      try {
        return reply.send(
          await options.service.initiateOwnershipTransfer(accessToken, {
            workspaceId: params.data.workspaceId,
            targetUserId: body.data.targetUserId,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
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
      if (body.data.action === "accept" && !hasRecentReauthentication(accessToken)) {
        return reauthenticationRequired(reply);
      }
      try {
        return reply.send(
          await options.service.respondOwnershipTransfer(accessToken, {
            workspaceId: params.data.workspaceId,
            transferId: body.data.transferId,
            action: body.data.action,
          }),
        );
      } catch (error) {
        return requestError(reply, error);
      }
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
    try {
      return reply.send(await options.service.searchOwnershipCandidates(accessToken, params.data.workspaceId, query.data.q));
    } catch (error) { return requestError(reply, error); }
  });

  app.post("/v1/account/workspaces/:workspaceId/ownership-transfer/cancel", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const params = workspaceParams.safeParse(request.params);
    const body = z.object({ transferId: z.string().uuid() }).safeParse(request.body);
    if (!accessToken) return reply.status(401).send({ error: "Bearer token required" });
    if (!params.success || !body.success) return reply.status(400).send({ error: "Valid ownership transfer required" });
    if (!options.service) return reply.status(503).send({ error: "Workspace account service is not configured" });
    try {
      return reply.send(await options.service.cancelOwnershipTransfer(accessToken, params.data.workspaceId, body.data.transferId));
    } catch (error) { return requestError(reply, error); }
  });

  app.post("/v1/account/deletion", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    const body = accountDeletionBody.safeParse(request.body);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Valid account deletion details required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Workspace account service is not configured" });
    try {
      return reply.send(
        await options.service.requestAccountDeletion(accessToken, {
          typedEmail: body.data.typedEmail,
          acknowledged: body.data.acknowledged,
        }),
      );
    } catch (error) {
      return requestError(reply, error);
    }
  });

  app.post("/v1/account/deletion/restore", async (request, reply) => {
    const accessToken = bearerToken(request.headers.authorization);
    if (!accessToken)
      return reply.status(401).send({ error: "Bearer token required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Workspace account service is not configured" });
    try {
      return reply.send(
        await options.service.restoreAccountDeletion(accessToken),
      );
    } catch (error) {
      return requestError(reply, error);
    }
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
      try {
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
                roleId: null,
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
      } catch (error) {
        return requestError(reply, error);
      }
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
      if (!params.success || !body.success)
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
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Workspace account service is not configured" });
      try {
        await options.service.queueOwnerOnboardingInvitationIntent(accessToken, {
          workspaceId: params.data.workspaceId,
          employeeId: body.data.employeeId,
          email: body.data.email,
        });
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
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
      try {
        await options.service.resetOwnerOnboarding(
          accessToken,
          params.data.workspaceId,
        );
        return reply.status(204).send();
      } catch (error) {
        return requestError(reply, error);
      }
    },
  );
}

/**
 * The one refusal this module raises itself rather than passing on from the
 * database. It carries a key like the others do, so the screen answers it the
 * same way and the sentence stays free to change.
 */
function reauthenticationRequired(reply: FastifyReply) {
  return reply.status(403).send({
    error: "Recent reauthentication required",
    reason: "session.reauthentication_required",
  });
}

function requestError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Workspace operation failed";
  // A typed status wins: it comes from the SQLSTATE the RPC raised, not from
  // the wording of its message. The matching below stays for untyped throws.
  // The reason is a machine key from the RPC's `hint`. It travels with the
  // message so a screen can say its own sentence without reading ours.
  if (error instanceof HttpError)
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

    return reply
      .status(error.statusCode)
      .send(
        error.reason ? { error: message, reason: error.reason } : { error: message },
      );
  if (
    message.includes("access required") ||
    message.includes("not available") ||
    message.includes("session required") ||
    message.includes("authentication required") ||
    message.includes("must be resolved")
  )
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  if (message.includes("revision conflict"))
    return reply.status(409).send({ error: message });
  return reply.status(400).send({ error: message });
}

function hasRecentReauthentication(accessToken: string): boolean {
  if (
    process.env.NODE_ENV !== "production" &&
    developmentBearerPattern.test(accessToken)
  ) {
    return true;
  }

  const issuedAtSeconds = parseJwtIssuedAt(accessToken);
  if (!issuedAtSeconds) return false;
  const issuedAtMs = issuedAtSeconds * 1000;
  const nowMs = Date.now();
  return (
    issuedAtMs <= nowMs &&
    nowMs - issuedAtMs <= recentReauthenticationWindowMs
  );
}

function parseJwtIssuedAt(accessToken: string): number | null {
  const [, payload] = accessToken.split(".");
  if (!payload) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { iat?: unknown };
    return typeof decoded.iat === "number" && Number.isFinite(decoded.iat)
      ? decoded.iat
      : null;
  } catch {
    return null;
  }
}
