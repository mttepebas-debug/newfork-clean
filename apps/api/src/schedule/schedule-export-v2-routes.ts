import { storedLocationShortNameSchema, scheduleExportV2ScopeSchema } from "@newfork/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveAuthorizedWorkspaceContext, type WorkspaceContextResolver } from "../auth/workspace-context";
import type { ScheduleReadService } from "./schedule-service";

const paramsSchema = z.object({ workspaceId: z.string().uuid() });

/** Read-only, uncached authorization. Does not call the legacy export engine. */
export function registerScheduleExportV2Routes(app: FastifyInstance, options: {
  readonly service: ScheduleReadService | null;
  readonly contextResolver: WorkspaceContextResolver | null;
}) {
  app.post("/v1/workspaces/:workspaceId/schedule/export-v2/authorize", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const params = paramsSchema.safeParse(request.params);
    const body = scheduleExportV2ScopeSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Valid export preview scope required" });
    const workspaceId = params.data.workspaceId;
    const context = await resolveAuthorizedWorkspaceContext({ authorization: request.headers.authorization,
      workspaceId, permission: "schedule.export", resolver: options.contextResolver });
    if (!context || context.membership.role === "employee") return reply.code(403).send({ error: "Schedule export access required" });
    const service = options.service;
    if (!service) return reply.code(503).send({ error: "Schedule export authorization is unavailable" });
    const scope = body.data;
    try {
      const [model, drafts] = await Promise.all([
        service.getReadModel(context.userId, workspaceId, scope.week_start),
        scope.source.kind === "draft" ? service.listDrafts(context.userId, workspaceId, scope.week_start) : null,
      ]);
      if (model.workspace_id !== workspaceId || model.week_start !== scope.week_start) {
        return reply.code(409).send({ error: "The schedule week changed. Refresh the current preview." });
      }
      const allowedLocations = new Map(model.locations.map(location => [location.id, location]));
      const allowedEmployees = new Set(model.employees.map(employee => employee.id));
      if (scope.location_ids.some(id => !allowedLocations.has(id)) || scope.employee_ids.some(id => !allowedEmployees.has(id))) {
        return reply.code(403).send({ error: "The selected export scope is no longer accessible" });
      }
      if (scope.location_ids.some(id => !storedLocationShortNameSchema.safeParse(allowedLocations.get(id)?.short_name).success)) {
        return reply.code(409).send({ error: "Add location short names before exporting" });
      }
      if (scope.source.kind === "draft") {
        const source = scope.source;
        const draft = drafts?.drafts.find(item => item.id === source.id);
        if (!draft || draft.workspace_id !== workspaceId || draft.week_start !== scope.week_start) {
          return reply.code(403).send({ error: "The selected draft is no longer accessible" });
        }
        if (draft.revision !== source.revision) return reply.code(409).send({ error: "The draft changed. Refresh the current preview before exporting." });
      }
      const shifts = scope.source.kind === "draft"
        ? (await service.listWeeklyShifts({ actorUserId: context.userId, workspaceId, weekStart: scope.week_start,
          locationIds: scope.ghost_shift_ids?.length ? [...allowedLocations.keys()] : scope.location_ids, draftId: scope.source.id, includeLive: false })).shifts
        : model.shifts;
      const locations = new Set(scope.location_ids), dates = new Set(scope.dates), employees = new Set(scope.employee_ids);
      const allowedShifts = new Set(shifts.filter(shift => locations.has(shift.location_id) && dates.has(shift.scheduled_date) &&
        (shift.employee_id === null || employees.has(shift.employee_id))).map(shift => shift.id));
      if (scope.shift_ids.some(id => !allowedShifts.has(id))) return reply.code(409).send({ error: "The selected shifts changed. Refresh the current preview." });
      const allowedGhosts = new Set(shifts.filter(shift => allowedLocations.has(shift.location_id) && dates.has(shift.scheduled_date) &&
        shift.employee_id !== null && employees.has(shift.employee_id) && scope.location_ids.some(id => id !== shift.location_id)).map(shift => shift.id));
      if (scope.ghost_shift_ids?.some(id => !allowedGhosts.has(id))) return reply.code(403).send({ error: "A cross-location reference is no longer accessible" });
      return reply.send({ authorized: true });
    } catch {
      // No stale allow, empty-success fallback or privileged error detail leakage.
      return reply.code(503).send({ error: "Could not verify current schedule access. Refresh the preview and try again." });
    }
  });
}
