import { employeeOnboardingProfileSchema } from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { EmployeeOnboardingService } from "./onboarding-service";
import { legacyAvailabilityGone } from "../availability/availability-retirement";

const revisionSchema = z.number().int().positive();
const profileBodySchema = z.object({
  profile: employeeOnboardingProfileSchema,
  revision: revisionSchema,
});
const requirementParamsSchema = z.object({ requirementId: z.string().uuid() });
const uploadBodySchema = z.object({
  filename: z.string().trim().min(1).max(240),
  sizeBytes: z.number().int().min(1).max(10_485_760),
});
const confirmBodySchema = uploadBodySchema.extend({
  path: z.string().trim().min(1).max(800),
  expiryDate: z.string().date().nullable(),
  revision: revisionSchema,
});
const acknowledgeBodySchema = z.object({
  typedName: z.string().trim().min(1).max(161),
  contentDigest: z.string().regex(/^[0-9a-f]{64}$/),
  idempotencyKey: z.string().uuid(),
  revision: revisionSchema,
});
const submitBodySchema = z.object({ revision: revisionSchema });
const workspaceQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
});
const managerParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  employeeId: z.string().uuid(),
});
const managerDocumentParamsSchema = managerParamsSchema.extend({
  requirementId: z.string().uuid(),
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

  app.put("/v1/me/onboarding/availability", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    return reply.status(410).send(legacyAvailabilityGone);
  });

  app.post(
    "/v1/me/onboarding/documents/:requirementId/upload-url",
    async (request, reply) => {
      const token = bearerToken(request.headers.authorization);
      const params = requirementParamsSchema.safeParse(request.params);
      const body = uploadBodySchema.safeParse(request.body);
      const query = workspaceQuerySchema.safeParse(request.query);
      if (!token)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (!params.success || !body.success || !query.success)
        return reply
          .status(400)
          .send({ error: "Valid private document required" });
      return serviceReply(reply, () =>
        options.service.prepareDocumentUpload(
          token,
          params.data.requirementId,
          body.data.filename,
          body.data.sizeBytes,
          query.data.workspaceId,
        ),
      );
    },
  );

  app.post(
    "/v1/me/onboarding/documents/:requirementId/confirm",
    async (request, reply) => {
      const token = bearerToken(request.headers.authorization);
      const params = requirementParamsSchema.safeParse(request.params);
      const body = confirmBodySchema.safeParse(request.body);
      if (!token)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid upload confirmation required" });
      return serviceReply(reply, async () => ({
        revision: await options.service.confirmDocument(token, {
          requirementId: params.data.requirementId,
          ...body.data,
        }),
      }));
    },
  );

  app.post(
    "/v1/me/onboarding/acknowledgements/:requirementId/sign",
    async (request, reply) => {
      const token = bearerToken(request.headers.authorization);
      const params = requirementParamsSchema.safeParse(request.params);
      const body = acknowledgeBodySchema.safeParse(request.body);
      if (!token)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid acknowledgement required" });
      return serviceReply(reply, async () => ({
        revision: await options.service.acknowledge(token, {
          requirementId: params.data.requirementId,
          ...body.data,
        }),
      }));
    },
  );

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

  app.post("/v1/me/onboarding/reset", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    const body = submitBodySchema.safeParse(request.body);
    if (!token)
      return reply.status(401).send({ error: "Valid bearer session required" });
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Current onboarding revision required" });
    return serviceReply(reply, async () => ({
      revision: await options.service.reset(token, body.data.revision),
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
      if (!context.permissions.includes("employees.read"))
        return reply
          .status(403)
          .send({ error: "Employee onboarding review required" });
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
      if (
        ![
          "employee_onboarding.review",
          "employee_documents.review",
          "employees.private.manage",
        ].some((permission) =>
          context.permissions.includes(
            permission as import("@newfork/shared").Permission,
          ),
        )
      )
        return reply
          .status(403)
          .send({ error: "Employee onboarding review required" });
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

  app.get(
    "/v1/workspaces/:workspaceId/employees/:employeeId/onboarding/documents/:requirementId/download",
    async (request, reply) => {
      const params = managerDocumentParamsSchema.safeParse(request.params);
      const context = await managerContext(
        request.headers.authorization,
        options.contextResolver,
      );
      if (!params.success)
        return reply
          .status(400)
          .send({ error: "Valid employee document required" });
      if (!context)
        return reply
          .status(401)
          .send({ error: "Valid bearer session required" });
      if (context.workspace.id !== params.data.workspaceId)
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context.permissions.includes("employee_documents.read"))
        return reply
          .status(403)
          .send({ error: "Employee document review required" });
      return serviceReply(reply, () =>
        options.service.getDocumentDownload(
          context.userId,
          params.data.workspaceId,
          params.data.employeeId,
          params.data.requirementId,
        ),
      );
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
  try {
    return reply.send(await action());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onboarding request failed";
    const status = /unavailable|configured|readiness|KMS|storage/i.test(message)
      ? 503
      : 409;
    return reply.status(status).send({ error: message });
  }
}

function bearerToken(authorization: string | undefined): string {
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}
