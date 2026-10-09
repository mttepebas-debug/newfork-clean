import { employeeOnboardingProfileSchema } from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { EmployeeOnboardingService } from "./onboarding-service";

const revisionSchema = z.number().int().positive();
const profileBodySchema = z.object({
  profile: employeeOnboardingProfileSchema,
  revision: revisionSchema,
});
const submitBodySchema = z.object({ revision: revisionSchema });
const workspaceQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
});
const phoneQuerySchema = workspaceQuerySchema.extend({
  phone: z.string().trim().min(1).max(40),
});
const managerParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  employeeId: z.string().uuid(),
});
const reviewBodySchema = z.object({
  action: z.enum(["accept_requirement", "reject_requirement", "activate"]),
  requirementId: z.string().uuid().nullable(),
  reason: z.string().trim().max(500).default(""),
  revision: revisionSchema,
});

export function registerEmployeeOnboardingRoutes(
  app: FastifyInstance,
  options: {
    readonly service: EmployeeOnboardingService;
    readonly contextResolver: WorkspaceContextResolver | null;
  },
): void {
  app.get("/v1/me/onboarding", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const query = workspaceQuerySchema.safeParse(request.query);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    if (!query.success)
      return reply.status(400).send({ error: "Valid workspace required" });
    return serviceReply(reply, () =>
      options.service.get(token, query.data.workspaceId),
    );
  });

  // TEL-2: asked while the number is typed; the answer names nobody.
  app.get("/v1/me/onboarding/phone-in-use", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const query = phoneQuerySchema.safeParse(request.query);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    if (!query.success)
      return reply.status(400).send({ error: "Valid phone required" });
    return serviceReply(reply, async () => ({
      inUse: await options.service.phoneInUse(
        token,
        query.data.phone,
        query.data.workspaceId,
      ),
    }));
  });

  app.patch("/v1/me/onboarding/profile", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const body = profileBodySchema.safeParse(request.body);
    const query = workspaceQuerySchema.safeParse(request.query);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Complete private profile required" });
    if (!query.success)
      return reply.status(400).send({ error: "Valid workspace required" });
    return serviceReply(reply, async () => ({
      revision: await options.service.saveProfile(
        token,
        body.data.profile,
        body.data.revision,
        query.data.workspaceId,
      ),
    }));
  });

  app.put("/v1/me/onboarding/ssn", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    return reply.status(410).send({ error: "SSN is deferred from V1" });
  });

  app.post("/v1/me/onboarding/submit", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const body = submitBodySchema.safeParse(request.body);
    const query = workspaceQuerySchema.safeParse(request.query);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    if (!body.success || !query.success)
      return reply
        .status(400)
        .send({ error: "Current onboarding revision required" });
    return serviceReply(reply, async () => ({
      revision: await options.service.submit(
        token,
        body.data.revision,
        query.data.workspaceId,
      ),
    }));
  });

  app.post("/v1/me/onboarding/leave", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const body = submitBodySchema.safeParse(request.body);
    const query = workspaceQuerySchema.safeParse(request.query);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    if (!body.success || !query.success)
      return reply
        .status(400)
        .send({ error: "Current onboarding revision required" });
    return serviceReply(reply, () =>
      options.service.leave(token, body.data.revision, query.data.workspaceId),
    );
  });

  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId/onboarding",
    async (request, reply) => {
      const params = managerParamsSchema.safeParse(request.params);
      const context = await managerContext(
        request.headers.authorization,
        options.contextResolver,
      );
      if (!params.success)
        return reply.status(400).send({ error: "Valid employee required" });
      if (!context)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (context.workspace.id !== params.data.workspaceId)
        return reply.status(404).send({ error: "Workspace not found" });
      // The service asks the authorization core (onboarding.review); its no
      // is 42501 + authz.*, mapped by rpcFailure.
      return serviceReply(reply, () =>
        options.service.getReview(
          context.userId,
          params.data.workspaceId,
          params.data.employeeId,
        ),
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/employees/:employeeId/onboarding/review",
    async (request, reply) => {
      const params = managerParamsSchema.safeParse(request.params);
      const body = reviewBodySchema.safeParse(request.body);
      const context = await managerContext(
        request.headers.authorization,
        options.contextResolver,
      );
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid onboarding review required" });
      if (!context)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (context.workspace.id !== params.data.workspaceId)
        return reply.status(404).send({ error: "Workspace not found" });
      // The service asks the core (onboarding.review; a document step also
      // documents.review).
      return serviceReply(reply, async () => ({
        revision: await options.service.review(
          context.userId,
          params.data.workspaceId,
          params.data.employeeId,
          body.data,
        ),
      }));
    },
  );
}

async function managerContext(
  authorization: string | undefined,
  resolver: WorkspaceContextResolver | null,
) {
  const token = bearerToken(authorization);
  return token && resolver ? resolver.resolve(token) : null;
}

async function serviceReply(
  reply: FastifyReply,
  action: () => Promise<unknown>,
) {
  return reply.send(await action());
}

function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
