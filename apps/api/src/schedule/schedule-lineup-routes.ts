import { lineupSectionPlanInputSchema } from "@newfork/shared";
import {
  scheduleLineupEntryInputSchema,
  scheduleLineupEntryMoveInputSchema,
  scheduleLineupSectionInputSchema,
} from "@newfork/shared/schedule";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  lineupTargetSchema,
  lineupOperationSchema,
  lineupNoteInputSchema,
} from "@newfork/shared";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { ScheduleLineupService } from "./schedule-lineup-service";

const params = z.object({ workspaceId: z.string().uuid() });
const entryParams = params.extend({ entryId: z.string().uuid() });
const briefParams = params.extend({ shiftTypeId: z.string().uuid() });
const sectionParams = params.extend({ sectionId: z.string().uuid() });
const activeEntryParams = z.object({ entryId: z.string().uuid() });
const activeBriefParams = z.object({ shiftTypeId: z.string().uuid() });
const activeSectionParams = z.object({ sectionId: z.string().uuid() });
const explicitWorkspaceHeaderSchema = z.string().uuid();
const query = z.object({
  date: z.string().date(),
  location_ids: z.string().optional(),
  shift_type_ids: z.string().optional(),
});
const entryBody = z.object({
  location_id: z.string().uuid(),
  date: z.string().date(),
  expected_revision: z.number().int().positive().nullable().default(null),
  entry: scheduleLineupEntryInputSchema,
});
const entryMoveBody = scheduleLineupEntryMoveInputSchema;
const deleteBody = z.object({ expected_revision: z.number().int().positive() });
const sectionBody = z.object({
  expected_revision: z.number().int().positive().nullable().default(null),
  section: scheduleLineupSectionInputSchema,
});
const briefBody = z.object({
  location_id: z.string().uuid(),
  date: z.string().date(),
  expected_revision: z.number().int().positive().nullable().default(null),
  out_of_stock: z.string().max(1000),
  specials: z.string().max(1000),
  pre_shift_notes: z.string().max(2000),
});
const shareBody = z.object({
  date: z.string().date(),
  location_ids: z.array(z.string().uuid()).min(1),
  shift_type_ids: z.array(z.string().uuid()).min(1).optional(),
});
const publishBody = shareBody.extend({ fingerprint: z.string().length(64) });

export function registerScheduleLineupRoutes(
  app: FastifyInstance,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
  const operationsQuery = z.object({
    date: z.string().date(),
    location_id: z.string().uuid(),
  });
  const candidateBody = z.object({
    target: lineupTargetSchema,
    source_entry_id: z.string().uuid().nullable(),
  });
  const operationBody = z.object({ operation: lineupOperationSchema });
  const commitBody = operationBody.extend({
    confirm_availability: z.boolean().optional(),
    fingerprint: z.string().length(64),
    idempotency_key: z.string().uuid(),
  });
  const noteBody = z.object({
    note: lineupNoteInputSchema,
    note_id: z.string().uuid().nullable(),
    expected_revision: z.number().int().positive().nullable(),
  });
  const receiptBody = z.object({
    snapshot_id: z.string().uuid(),
    action: z.enum(["view", "acknowledge"]),
  });
  const publishedQuery = z.object({
    from: z.string().date(),
    to: z.string().date(),
  });
  const proposalBody = commitBody.extend({
    kind: z.enum(["offer", "transfer"]),
  });
  const proposalAction = z.object({
    id: z.string().uuid(),
    response: z.enum(["confirm", "cancel", "preview"]),
    confirm_availability: z.boolean().optional(),
    target_entry_id: z.string().uuid().optional(),
    fingerprint: z.string().length(64).optional(),
  });
  const offerResponse = z.object({
    id: z.string().uuid(),
    response: z.enum(["accept", "decline"]),
    availability_fingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  });
  const placementsBody = z.object({
    date: z.string().date(),
    location_id: z.string().uuid(),
    entries: z
      .array(
        z.object({
          id: z.string().uuid(),
          expected_revision: z.number().int().positive().nullable(),
          entry: scheduleLineupEntryInputSchema,
        }),
      )
      .min(1)
      .max(100),
  });
  for (const endpoint of [
    {
      method: "POST" as const,
      path: "/placements/preview",
      action: "placements_preview",
      schema: placementsBody,
      permission: "schedule.lineup.manage",
    },
    {
      method: "POST" as const,
      path: "/placements",
      action: "placements_apply",
      schema: placementsBody.extend({
        fingerprint: z.string().length(64),
        idempotency_key: z.string().uuid(),
      }),
      permission: "schedule.lineup.manage",
    },
    {
      method: "GET" as const,
      path: "/shared-export",
      action: "shared_export",
      schema: operationsQuery,
      permission: "schedule.lineup.share",
    },
    {
      method: "POST" as const,
      path: "/section-plan",
      action: "section_plan",
      schema: lineupSectionPlanInputSchema,
      permission: "schedule.lineup.manage",
    },
    {
      method: "POST" as const,
      path: "/notifications/retry",
      action: "retry_notifications",
      schema: operationsQuery,
      permission: "schedule.lineup.share",
    },
    {
      method: "POST" as const,
      path: "/notifications/remind",
      action: "remind_unacknowledged",
      schema: operationsQuery.extend({ snapshot_id: z.string().uuid() }),
      permission: "schedule.lineup.share",
    },
    {
      method: "GET" as const,
      path: "/destinations",
      action: "destinations",
      schema: z.object({}),
      permission: "schedule.lineup.manage",
    },
    {
      method: "GET" as const,
      path: "/proposals",
      action: "proposals",
      schema: operationsQuery,
      permission: "schedule.lineup.manage",
    },
    {
      method: "POST" as const,
      path: "/proposals",
      action: "propose",
      schema: proposalBody,
      permission: "schedule.lineup.manage",
    },
    {
      method: "POST" as const,
      path: "/proposals/action",
      action: "proposal_action",
      schema: proposalAction,
      permission: "schedule.lineup.manage",
    },
    {
      method: "GET" as const,
      path: "/offers",
      action: "offers",
      schema: z.object({}),
      permission: null,
    },
    {
      method: "POST" as const,
      path: "/offers/respond",
      action: "respond",
      schema: offerResponse,
      permission: null,
    },
    {
      method: "GET" as const,
      path: "/operations",
      action: "state",
      schema: operationsQuery,
      permission: "schedule.lineup.read",
    },
    {
      method: "POST" as const,
      path: "/candidates",
      action: "candidates",
      schema: candidateBody,
      permission: "schedule.lineup.manage",
    },
    {
      method: "POST" as const,
      path: "/operations/preview",
      action: "preview",
      schema: operationBody,
      permission: "schedule.lineup.manage",
    },
    {
      method: "POST" as const,
      path: "/operations",
      action: "apply",
      schema: commitBody,
      permission: "schedule.lineup.manage",
    },
    {
      method: "POST" as const,
      path: "/notes",
      action: "note",
      schema: noteBody,
      permission: "schedule.lineup.manage",
    },
    {
      method: "GET" as const,
      path: "/published",
      action: "published",
      schema: publishedQuery,
      permission: null,
    },
    {
      method: "POST" as const,
      path: "/receipt",
      action: "receipt",
      schema: receiptBody,
      permission: null,
    },
  ] as const) {
    app.route({
      method: endpoint.method,
      url: `/schedule/lineups${endpoint.path}`,
      handler: async (request, reply) => {
        const parsed = endpoint.schema.safeParse(
          endpoint.method === "GET" ? request.query : request.body,
        );
        if (!parsed.success)
          return reply
            .status(400)
            .send({ error: "Valid Line Up operation required" });
        const token = request.headers.authorization
          ?.match(/^Bearer\s+(.+)$/i)?.[1]
          ?.trim();
        const header = explicitWorkspaceHeaderSchema.safeParse(
          request.headers["x-newfork-workspace-id"],
        );
        if (!token || !header.success || !options.contextResolver)
          return reply
            .status(403)
            .send({ error: "Current workspace session required" });
        const context = await options.contextResolver.resolve(
          token,
          header.data,
        );
        if (
          !context ||
          context.workspace.id !== header.data ||
          context.membership.status !== "active" ||
          (endpoint.permission &&
            (context.membership.role === "employee" ||
              !context.permissions.includes(endpoint.permission)))
        )
          return reply.status(403).send({ error: "Line Up access denied" });
        if (!options.service?.operations)
          return reply
            .status(503)
            .send({ error: "Line Up operations are not configured" });
        try {
          return reply.send(
            await options.service.operations({
              actorUserId: context.userId,
              workspaceId: context.workspace.id,
              action: endpoint.action,
              payload: parsed.data,
            }),
          );
        } catch (error) {
          return lineupError(reply, error);
        }
      },
    });
  }
  app.get(
    "/v1/workspaces/:workspaceId/schedule/lineup",
    async (request, reply) => {
      const p = params.safeParse(request.params),
        q = query.safeParse(request.query);
      if (!p.success || !q.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up query required" });
      const context = await authorize(
        request.headers.authorization,
        p.data.workspaceId,
        "schedule.lineup.read",
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Line-up read access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Line-up service is not configured" });
      try {
        return reply.send(
          await options.service.get({
            actorUserId: context.userId,
            workspaceId: p.data.workspaceId,
            date: q.data.date,
            locationIds: csv(q.data.location_ids),
            shiftTypeIds: csv(q.data.shift_type_ids),
          }),
        );
      } catch (error) {
        return lineupError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/lineup/sections",
    async (request, reply) => saveSection(request, reply, options, null),
  );
  app.patch(
    "/v1/workspaces/:workspaceId/schedule/lineup/sections/:sectionId",
    async (request, reply) => {
      const p = sectionParams.safeParse(request.params);
      if (!p.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up section required" });
      return saveSection(request, reply, options, p.data.sectionId);
    },
  );
  app.delete(
    "/v1/workspaces/:workspaceId/schedule/lineup/sections/:sectionId",
    async (request, reply) => {
      const p = sectionParams.safeParse(request.params),
        body = deleteBody.safeParse(request.body);
      if (!p.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up section revision required" });
      const context = await authorize(
        request.headers.authorization,
        p.data.workspaceId,
        "schedule.lineup.manage",
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Line-up manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Line-up service is not configured" });
      try {
        await options.service.archiveSection({
          actorUserId: context.userId,
          workspaceId: p.data.workspaceId,
          sectionId: p.data.sectionId,
          expectedRevision: body.data.expected_revision,
        });
        return reply.status(204).send();
      } catch (error) {
        return lineupError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/lineup/entries",
    async (request, reply) => saveEntry(request, reply, options, null),
  );
  app.put(
    "/v1/workspaces/:workspaceId/schedule/lineup/entries/:entryId",
    async (request, reply) => {
      const p = entryParams.safeParse(request.params);
      if (!p.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up entry required" });
      return saveEntry(request, reply, options, p.data.entryId);
    },
  );
  app.delete(
    "/v1/workspaces/:workspaceId/schedule/lineup/entries/:entryId",
    async (request, reply) => {
      const p = entryParams.safeParse(request.params),
        body = deleteBody.safeParse(request.body);
      if (!p.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up entry revision required" });
      const context = await authorize(
        request.headers.authorization,
        p.data.workspaceId,
        "schedule.lineup.manage",
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Line-up manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Line-up service is not configured" });
      try {
        return reply.send(
          await options.service.deleteEntry({
            actorUserId: context.userId,
            workspaceId: p.data.workspaceId,
            entryId: p.data.entryId,
            expectedRevision: body.data.expected_revision,
          }),
        );
      } catch (error) {
        return lineupError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/lineup/entries/move",
    async (request, reply) => {
      const p = params.safeParse(request.params),
        body = entryMoveBody.safeParse(request.body);
      if (!p.success || !body.success)
        return reply.status(400).send({ error: "Valid Line-up move required" });
      const context = await authorize(
        request.headers.authorization,
        p.data.workspaceId,
        "schedule.lineup.manage",
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Line-up manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Line-up service is not configured" });
      try {
        return reply.send(
          await options.service.moveEntry({
            actorUserId: context.userId,
            workspaceId: p.data.workspaceId,
            move: body.data,
          }),
        );
      } catch (error) {
        return lineupError(reply, error);
      }
    },
  );
  app.put(
    "/v1/workspaces/:workspaceId/schedule/lineup/briefs/:shiftTypeId",
    async (request, reply) => {
      const p = briefParams.safeParse(request.params),
        body = briefBody.safeParse(request.body);
      if (!p.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid service brief required" });
      const context = await authorize(
        request.headers.authorization,
        p.data.workspaceId,
        "schedule.lineup.manage",
        options,
      );
      if (context === "workspace_mismatch")
        return reply.status(404).send({ error: "Workspace not found" });
      if (!context)
        return reply
          .status(403)
          .send({ error: "Line-up manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Line-up service is not configured" });
      try {
        return reply.send(
          await options.service.saveBrief({
            actorUserId: context.userId,
            workspaceId: p.data.workspaceId,
            locationId: body.data.location_id,
            date: body.data.date,
            shiftTypeId: p.data.shiftTypeId,
            expectedRevision: body.data.expected_revision,
            outOfStock: body.data.out_of_stock,
            specials: body.data.specials,
            preShiftNotes: body.data.pre_shift_notes,
          }),
        );
      } catch (error) {
        return lineupError(reply, error);
      }
    },
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/lineup/share-preview",
    async (request, reply) => share(request, reply, options, false),
  );
  app.post(
    "/v1/workspaces/:workspaceId/schedule/lineup/share",
    async (request, reply) => share(request, reply, options, true),
  );
  app.get("/schedule/lineups", async (request, reply) => {
    const q = query.safeParse(request.query);
    if (!q.success)
      return reply.status(400).send({ error: "Valid Line-up query required" });
    const context = await authorizeActive(
      request,
      "schedule.lineup.read",
      options,
    );
    if (!context)
      return reply.status(403).send({ error: "Line-up read access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Line-up service is not configured" });
    try {
      return reply.send(
        await options.service.get({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          date: q.data.date,
          locationIds: csv(q.data.location_ids),
          shiftTypeIds: csv(q.data.shift_type_ids),
        }),
      );
    } catch (error) {
      return lineupError(reply, error);
    }
  });
  app.post("/schedule/lineups/sections", async (request, reply) =>
    saveActiveSection(request, reply, options, null),
  );
  app.patch("/schedule/lineups/sections/:sectionId", async (request, reply) => {
    const p = activeSectionParams.safeParse(request.params);
    if (!p.success)
      return reply
        .status(400)
        .send({ error: "Valid Line-up section required" });
    return saveActiveSection(request, reply, options, p.data.sectionId);
  });
  app.delete(
    "/schedule/lineups/sections/:sectionId",
    async (request, reply) => {
      const p = activeSectionParams.safeParse(request.params),
        body = deleteBody.safeParse(request.body);
      if (!p.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up section revision required" });
      const context = await authorizeActive(
        request,
        "schedule.lineup.manage",
        options,
      );
      if (!context)
        return reply
          .status(403)
          .send({ error: "Line-up manage access required" });
      if (!options.service)
        return reply
          .status(503)
          .send({ error: "Line-up service is not configured" });
      try {
        await options.service.archiveSection({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          sectionId: p.data.sectionId,
          expectedRevision: body.data.expected_revision,
        });
        return reply.status(204).send();
      } catch (error) {
        return lineupError(reply, error);
      }
    },
  );
  app.post("/schedule/lineups/entries", async (request, reply) =>
    saveActiveEntry(request, reply, options, null),
  );
  app.put("/schedule/lineups/entries/:entryId", async (request, reply) => {
    const p = activeEntryParams.safeParse(request.params);
    if (!p.success)
      return reply.status(400).send({ error: "Valid Line-up entry required" });
    return saveActiveEntry(request, reply, options, p.data.entryId);
  });
  app.delete("/schedule/lineups/entries/:entryId", async (request, reply) => {
    const p = activeEntryParams.safeParse(request.params),
      body = deleteBody.safeParse(request.body);
    if (!p.success || !body.success)
      return reply
        .status(400)
        .send({ error: "Valid Line-up entry revision required" });
    const context = await authorizeActive(
      request,
      "schedule.lineup.manage",
      options,
    );
    if (!context)
      return reply
        .status(403)
        .send({ error: "Line-up manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Line-up service is not configured" });
    try {
      return reply.send(
        await options.service.deleteEntry({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          entryId: p.data.entryId,
          expectedRevision: body.data.expected_revision,
        }),
      );
    } catch (error) {
      return lineupError(reply, error);
    }
  });
  app.post("/schedule/lineups/entries/move", async (request, reply) => {
    const body = entryMoveBody.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid Line-up move required" });
    const context = await authorizeActive(
      request,
      "schedule.lineup.manage",
      options,
    );
    if (!context)
      return reply
        .status(403)
        .send({ error: "Line-up manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Line-up service is not configured" });
    try {
      return reply.send(
        await options.service.moveEntry({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          move: body.data,
        }),
      );
    } catch (error) {
      return lineupError(reply, error);
    }
  });
  app.put("/schedule/lineups/briefs/:shiftTypeId", async (request, reply) => {
    const p = activeBriefParams.safeParse(request.params),
      body = briefBody.safeParse(request.body);
    if (!p.success || !body.success)
      return reply.status(400).send({ error: "Valid service brief required" });
    const context = await authorizeActive(
      request,
      "schedule.lineup.manage",
      options,
    );
    if (!context)
      return reply
        .status(403)
        .send({ error: "Line-up manage access required" });
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Line-up service is not configured" });
    try {
      return reply.send(
        await options.service.saveBrief({
          actorUserId: context.userId,
          workspaceId: context.workspace.id,
          locationId: body.data.location_id,
          date: body.data.date,
          shiftTypeId: p.data.shiftTypeId,
          expectedRevision: body.data.expected_revision,
          outOfStock: body.data.out_of_stock,
          specials: body.data.specials,
          preShiftNotes: body.data.pre_shift_notes,
        }),
      );
    } catch (error) {
      return lineupError(reply, error);
    }
  });
  app.post("/schedule/lineups/share-preview", async (request, reply) =>
    shareActive(request, reply, options, false),
  );
  app.post("/schedule/lineups/share", async (request, reply) =>
    shareActive(request, reply, options, true),
  );
}

async function saveSection(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
  sectionId: string | null,
) {
  const p = params.safeParse(request.params),
    body = sectionBody.safeParse(request.body);
  if (!p.success || !body.success)
    return reply.status(400).send({ error: "Valid Line-up section required" });
  const context = await authorize(
    request.headers.authorization,
    p.data.workspaceId,
    "schedule.lineup.manage",
    options,
  );
  if (context === "workspace_mismatch")
    return reply.status(404).send({ error: "Workspace not found" });
  if (!context)
    return reply.status(403).send({ error: "Line-up manage access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Line-up service is not configured" });
  try {
    return reply.status(sectionId ? 200 : 201).send(
      await options.service.saveSection({
        actorUserId: context.userId,
        workspaceId: p.data.workspaceId,
        sectionId,
        expectedRevision: body.data.expected_revision,
        section: body.data.section,
      }),
    );
  } catch (error) {
    return lineupError(reply, error);
  }
}

async function saveEntry(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
  entryId: string | null,
) {
  const p = params.safeParse(request.params),
    body = entryBody.safeParse(request.body);
  if (!p.success || !body.success)
    return reply.status(400).send({ error: "Valid Line-up entry required" });
  const context = await authorize(
    request.headers.authorization,
    p.data.workspaceId,
    "schedule.lineup.manage",
    options,
  );
  if (context === "workspace_mismatch")
    return reply.status(404).send({ error: "Workspace not found" });
  if (!context)
    return reply.status(403).send({ error: "Line-up manage access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Line-up service is not configured" });
  try {
    return reply.status(entryId ? 200 : 201).send(
      await options.service.saveEntry({
        actorUserId: context.userId,
        workspaceId: p.data.workspaceId,
        locationId: body.data.location_id,
        date: body.data.date,
        entryId,
        expectedRevision: body.data.expected_revision,
        entry: body.data.entry,
      }),
    );
  } catch (error) {
    return lineupError(reply, error);
  }
}

async function saveActiveSection(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
  sectionId: string | null,
) {
  const body = sectionBody.safeParse(request.body);
  if (!body.success)
    return reply.status(400).send({ error: "Valid Line-up section required" });
  const context = await authorizeActive(
    request,
    "schedule.lineup.manage",
    options,
  );
  if (!context)
    return reply.status(403).send({ error: "Line-up manage access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Line-up service is not configured" });
  try {
    return reply.status(sectionId ? 200 : 201).send(
      await options.service.saveSection({
        actorUserId: context.userId,
        workspaceId: context.workspace.id,
        sectionId,
        expectedRevision: body.data.expected_revision,
        section: body.data.section,
      }),
    );
  } catch (error) {
    return lineupError(reply, error);
  }
}

async function saveActiveEntry(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
  entryId: string | null,
) {
  const body = entryBody.safeParse(request.body);
  if (!body.success)
    return reply.status(400).send({ error: "Valid Line-up entry required" });
  const context = await authorizeActive(
    request,
    "schedule.lineup.manage",
    options,
  );
  if (!context)
    return reply.status(403).send({ error: "Line-up manage access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Line-up service is not configured" });
  try {
    return reply.status(entryId ? 200 : 201).send(
      await options.service.saveEntry({
        actorUserId: context.userId,
        workspaceId: context.workspace.id,
        locationId: body.data.location_id,
        date: body.data.date,
        entryId,
        expectedRevision: body.data.expected_revision,
        entry: body.data.entry,
      }),
    );
  } catch (error) {
    return lineupError(reply, error);
  }
}

async function shareActive(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
  publish: boolean,
) {
  const body = (publish ? publishBody : shareBody).safeParse(request.body);
  if (!body.success)
    return reply
      .status(400)
      .send({ error: "Valid Line-up share request required" });
  const context = await authorizeActive(
    request,
    "schedule.lineup.share",
    options,
  );
  if (!context)
    return reply.status(403).send({ error: "Line-up share access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Line-up service is not configured" });
  try {
    const base = {
      actorUserId: context.userId,
      workspaceId: context.workspace.id,
      date: body.data.date,
      locationIds: body.data.location_ids,
      shiftTypeIds: body.data.shift_type_ids,
    };
    return reply.send(
      publish
        ? await options.service.share({
            ...base,
            fingerprint: (body.data as z.infer<typeof publishBody>).fingerprint,
          })
        : await options.service.previewShare(base),
    );
  } catch (error) {
    return lineupError(reply, error);
  }
}

async function share(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
  publish: boolean,
) {
  const p = params.safeParse(request.params),
    body = (publish ? publishBody : shareBody).safeParse(request.body);
  if (!p.success || !body.success)
    return reply
      .status(400)
      .send({ error: "Valid Line-up share request required" });
  const context = await authorize(
    request.headers.authorization,
    p.data.workspaceId,
    "schedule.lineup.share",
    options,
  );
  if (context === "workspace_mismatch")
    return reply.status(404).send({ error: "Workspace not found" });
  if (!context)
    return reply.status(403).send({ error: "Line-up share access required" });
  if (!options.service)
    return reply
      .status(503)
      .send({ error: "Line-up service is not configured" });
  try {
    const base = {
      actorUserId: context.userId,
      workspaceId: p.data.workspaceId,
      date: body.data.date,
      locationIds: body.data.location_ids,
      shiftTypeIds: body.data.shift_type_ids,
    };
    return reply.send(
      publish
        ? await options.service.share({
            ...base,
            fingerprint: (body.data as z.infer<typeof publishBody>).fingerprint,
          })
        : await options.service.previewShare(base),
    );
  } catch (error) {
    return lineupError(reply, error);
  }
}
async function authorizeActive(
  source: FastifyRequest,
  permission:
    "schedule.lineup.read" | "schedule.lineup.manage" | "schedule.lineup.share",
  options: { contextResolver: WorkspaceContextResolver | null },
) {
  const workspaceId = explicitWorkspaceHeaderSchema.safeParse(
    source.headers["x-newfork-workspace-id"],
  );
  const bearer = source.headers.authorization
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
  if (!workspaceId.success || !bearer || !options.contextResolver) return null;
  const context = await options.contextResolver.resolve(
    bearer,
    workspaceId.data,
  );
  return context &&
    context.workspace.id === workspaceId.data &&
    context.membership.status === "active" &&
    context.membership.role !== "employee" &&
    context.permissions.includes(permission)
    ? context
    : null;
}
async function authorize(
  token: string | undefined,
  workspaceId: string,
  permission:
    "schedule.lineup.read" | "schedule.lineup.manage" | "schedule.lineup.share",
  options: { contextResolver: WorkspaceContextResolver | null },
) {
  const bearer = token?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const context =
    bearer && options.contextResolver
      ? await options.contextResolver.resolve(bearer, workspaceId)
      : null;
  if (!context || context.membership.status !== "active") return null;
  if (context.workspace.id !== workspaceId) return "workspace_mismatch";
  return context.membership.role !== "employee" &&
    context.permissions.includes(permission)
    ? context
    : null;
}
function csv(value: string | undefined) {
  return value ? value.split(",").filter(Boolean) : null;
}
function lineupError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Line-up operation failed";
  return reply
    .status(
      message.includes("access denied") || message.includes("scope denied")
        ? 403
        : message.includes("not found")
          ? 404
          : message.includes("stale")
            ? 409
            : 400,
    )
    .send({ error: message });
}
