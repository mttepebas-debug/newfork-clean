import {
  scheduleLineupEntryInputSchema,
  scheduleLineupEntryMoveInputSchema,
  scheduleLineupSectionInputSchema,
} from "@newfork/shared/schedule";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { ScheduleLineupService } from "./schedule-lineup-service";

const params = z.object({ workspaceId: z.string().uuid() });
const entryParams = params.extend({ entryId: z.string().uuid() });
const briefParams = params.extend({ shiftTypeId: z.string().uuid() });
const sectionParams = params.extend({ sectionId: z.string().uuid() });
const activeEntryParams = z.object({ entryId: z.string().uuid() });
const activeBriefParams = z.object({ shiftTypeId: z.string().uuid() });
const activeSectionParams = z.object({ sectionId: z.string().uuid() });
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
});
const publishBody = shareBody.extend({ fingerprint: z.string().length(64) });

export function registerScheduleLineupRoutes(
  app: FastifyInstance,
  options: {
    service: ScheduleLineupService | null;
    contextResolver: WorkspaceContextResolver | null;
  },
) {
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
        return reply
          .status(400)
          .send({ error: "Valid Line-up move required" });
      const context = await authorize(
        request.headers.authorization,
        p.data.workspaceId,
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
      return reply
        .status(400)
        .send({ error: "Valid Line-up query required" });
    const context = await authorizeActive(
      request.headers.authorization,
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
  app.patch(
    "/schedule/lineups/sections/:sectionId",
    async (request, reply) => {
      const p = activeSectionParams.safeParse(request.params);
      if (!p.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up section required" });
      return saveActiveSection(request, reply, options, p.data.sectionId);
    },
  );
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
        request.headers.authorization,
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
  app.delete(
    "/schedule/lineups/entries/:entryId",
    async (request, reply) => {
      const p = activeEntryParams.safeParse(request.params),
        body = deleteBody.safeParse(request.body);
      if (!p.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid Line-up entry revision required" });
      const context = await authorizeActive(
        request.headers.authorization,
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
    },
  );
  app.post("/schedule/lineups/entries/move", async (request, reply) => {
    const body = entryMoveBody.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid Line-up move required" });
    const context = await authorizeActive(
      request.headers.authorization,
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
      request.headers.authorization,
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
    request.headers.authorization,
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
    request.headers.authorization,
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
    request.headers.authorization,
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
  token: string | undefined,
  permission:
    "schedule.lineup.read" | "schedule.lineup.manage" | "schedule.lineup.share",
  options: { contextResolver: WorkspaceContextResolver | null },
) {
  const bearer = token?.startsWith("Bearer ") ? token.slice(7).trim() : "";
  const context =
    bearer && options.contextResolver
      ? await options.contextResolver.resolve(bearer)
      : null;
  return context &&
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
  const bearer = token?.startsWith("Bearer ") ? token.slice(7).trim() : "";
  const context =
    bearer && options.contextResolver
      ? await options.contextResolver.resolve(bearer)
      : null;
  return context &&
    context.workspace.id === workspaceId &&
    context.membership.role !== "employee" &&
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
