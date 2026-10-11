import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { ActiveWorkspaceContext, AuthzAction } from "@newfork/shared";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import { registerScheduleRoutes } from "./schedule-routes";
import type { ScheduleReadService } from "./schedule-service";

// Every Schedule route asks the one gate (resolveActor + authorize) for one
// action. This table is the contract: a route missing here, or asking another
// action, fails below.
const W = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const ID = "87000000-0000-4000-8000-000000000001";
const v1 = `/v1/workspaces/${W}/schedule`;

type Row = readonly [method: string, url: string, action: AuthzAction, input?: "none"];
const routes: readonly Row[] = [
  ["POST", `${v1}/edit-sessions/:id/default-hours-preview`, "schedule.edit"],
  ["POST", `${v1}/edit-sessions/:id/default-hours-apply`, "schedule.edit"],
  ["POST", `${v1}/export-v2/authorize`, "schedule.export"],
  ["GET", "/schedule/reference", "schedule.read"],
  ["GET", "/schedule/shifts", "schedule.read"],
  ["GET", "/schedule/drafts", "schedule.edit"],
  ["GET", "/schedule/publication-status", "schedule.read"],
  ["GET", "/schedule/pending-ops", "schedule.edit"],
  ["POST", "/schedule/pending-ops", "schedule.edit"],
  ["PATCH", "/schedule/pending-ops/:id", "schedule.edit"],
  ["DELETE", "/schedule/pending-ops/:id", "schedule.edit"],
  ["POST", "/schedule/edit-lock/acquire", "schedule.edit"],
  ["PATCH", "/schedule/edit-lock/heartbeat", "schedule.edit"],
  ["DELETE", "/schedule/edit-lock/release", "schedule.edit"],
  ["POST", "/schedule/edit-lock/autosave", "schedule.edit"],
  ["POST", "/schedule/drafts/save", "schedule.edit"],
  ["DELETE", "/schedule/drafts/:id", "schedule.edit"],
  ["POST", "/schedule/publish-preview", "schedule.publish"],
  ["POST", "/schedule/publish", "schedule.publish"],
  ["POST", "/schedule/unpublish", "schedule.publish"],
  ["POST", "/schedule/unpublish-preview", "schedule.publish"],
  ["POST", "/schedule/export/preview", "schedule.export"],
  ["POST", "/schedule/export/preview-html", "schedule.export"],
  ["POST", "/schedule/export", "schedule.export"],
  ["GET", "/schedule/templates", "schedule.templates.read", "none"],
  ["GET", "/schedule/templates/:id", "schedule.templates.read"],
  ["POST", "/schedule/templates", "schedule.templates"],
  ["PATCH", "/schedule/templates/:id", "schedule.templates"],
  ["DELETE", "/schedule/templates/:id", "schedule.templates"],
  ["POST", "/schedule/edit-sessions/:id/apply-template", "schedule.templates"],
  ["POST", "/schedule/edit-sessions/:id/template-apply-preview", "schedule.templates"],
  ["POST", "/schedule/edit-sessions/:id/undo", "schedule.edit"],
  ["POST", "/schedule/edit-sessions/:id/auto-fill-preview", "schedule.edit"],
  ["POST", "/schedule/edit-sessions/:id/auto-fill-apply", "schedule.edit"],
  ["GET", "/schedule/export-presets", "schedule.export", "none"],
  ["POST", "/schedule/export-presets", "schedule.export"],
  ["PATCH", "/schedule/export-presets/:id", "schedule.export"],
  ["DELETE", "/schedule/export-presets/:id", "schedule.export"],
  ["GET", "/schedule/export-schedules", "schedule.export", "none"],
  ["GET", "/schedule/exports/recent", "schedule.export", "none"],
  ["POST", "/schedule/export-schedules", "schedule.export"],
  ["PATCH", "/schedule/export-schedules/:id", "schedule.export"],
  ["DELETE", "/schedule/export-schedules/:id", "schedule.export"],
  ["POST", "/shifts", "schedule.edit"],
  ["POST", "/shifts/batch", "schedule.edit"],
  ["POST", "/shifts/bulk-delete", "schedule.edit"],
  ["PATCH", "/shifts/:id", "schedule.edit"],
  ["DELETE", "/shifts/:id", "schedule.edit"],
  ["PATCH", "/shifts/:id/restore", "schedule.edit"],
];

// B-8: dead twins of live routes; the web never called them. They stay gone.
const retired: readonly (readonly [method: string, url: string])[] = [
  ["POST", "/schedule/edit-session/materialize-live-draft"],
  ["GET", `${v1}/drafts`],
  ["GET", `${v1}/shifts`],
  ["POST", `${v1}/edit-sessions`],
  ["GET", `${v1}/publication-history`],
  ["PATCH", `${v1}/edit-sessions/:id/heartbeat`],
  ["POST", `${v1}/edit-sessions/:id/shifts`],
  ["PATCH", `${v1}/edit-sessions/:id/shifts/:id`],
  ["DELETE", `${v1}/edit-sessions/:id/shifts/:id`],
  ["POST", `${v1}/edit-sessions/:id/shifts/:id/restore`],
  ["POST", `${v1}/edit-sessions/:id/save`],
  ["DELETE", `${v1}/edit-sessions/:id`],
  ["DELETE", `${v1}/drafts/:id`],
  ["POST", `${v1}/publication-preview`],
  ["POST", `${v1}/publications`],
  ["POST", `${v1}/unpublish-preview`],
  ["POST", `${v1}/unpublications`],
  ["GET", `${v1}/templates`],
  ["GET", `${v1}/templates/:id`],
  ["POST", `${v1}/templates`],
  ["PATCH", `${v1}/templates/:id`],
  ["DELETE", `${v1}/templates/:id`],
  ["POST", `${v1}/edit-sessions/:id/apply-template`],
  ["POST", `${v1}/edit-sessions/:id/auto-fill-preview`],
  ["POST", `${v1}/edit-sessions/:id/auto-fill-apply`],
  ["POST", `${v1}/export-preview`],
  ["POST", `${v1}/exports`],
  ["GET", `${v1}/export-presets`],
  ["GET", `${v1}/exports/recent`],
  ["POST", `${v1}/export-presets`],
  ["PATCH", `${v1}/export-presets/:id`],
  ["DELETE", `${v1}/export-presets/:id`],
  ["GET", `${v1}/export-schedules`],
  ["POST", `${v1}/export-schedules`],
  ["PATCH", `${v1}/export-schedules/:id`],
  ["DELETE", `${v1}/export-schedules/:id`],
  ["POST", "/schedule/drafts/:id/auto-fill/preview"],
  ["POST", "/schedule/drafts/:id/auto-fill/apply"],
  ["POST", "/schedule/edit-session/discard"],
  ["GET", "/shifts"],
  ["PATCH", "/shifts/publish"],
];

const cases = routes.map(([method, url, action, input]) => ({ method, url, action, input }));

const scheduleActions: AuthzAction[] = [
  "schedule.read",
  "schedule.templates.read",
  "schedule.edit",
  "schedule.publish",
  "schedule.templates",
  "schedule.export",
];

function context(actions: readonly string[]): ActiveWorkspaceContext {
  return {
    userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
    workspace: {
      id: W,
      name: "Meyhouse",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      workspaceId: W,
      // Owner with every Schedule permission: only the core's list decides.
      role: "owner",
      status: "active",
      allLocations: true,
    },
    actions: [...actions],
    permissions: [
      "schedule.read",
      "schedule.manage",
      "schedule.publish",
      "schedule.templates.read",
      "schedule.templates.manage",
      "schedule.export",
    ],
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  };
}

function ask(
  resolved: ActiveWorkspaceContext | null,
  method: string,
  url: string,
  ids = ID,
) {
  const app = buildApp({
    contextResolver: { resolve: async () => resolved },
    // Present but empty: no route reaches it in these cases, or fails loudly if one does.
    scheduleService: {} as ScheduleReadService,
  });
  return app.inject({
    method: method as "GET",
    url: url.replaceAll(":id", ids),
    headers: { authorization: "Bearer token", "x-newfork-workspace-id": W },
  });
}

describe("Schedule routes ask one authorization gate", () => {
  it.each(cases)("$method $url: a non-member finds nothing there", async ({ method, url }) => {
    const response = await ask(null, method, url);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
  });

  it.each(cases)("$method $url: without its action, 403 naming it", async ({ method, url, action }) => {
    const others = scheduleActions.filter((other) => other !== action);
    const response = await ask(context(others), method, url);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      reason: "authz.out_of_scope",
      detail: action,
    });
  });

  it.each(cases.filter((row) => row.input !== "none"))(
    "$method $url: with its action alone, the gate lets it through to validation",
    async ({ method, url, action }) => {
      const response = await ask(context([action]), method, url, "not-a-uuid");
      expect(response.statusCode).toBe(400);
    },
  );
});

describe("Schedule route table is complete", () => {
  it("lists every route Schedule registers, so a new route cannot skip the gate", async () => {
    const app = Fastify();
    const registered: string[] = [];
    app.addHook("onRoute", (route) => {
      for (const method of [route.method].flat()) {
        if (method === "HEAD") continue;
        registered.push(`${method} ${route.url.replace(":workspaceId", W).replace(/:\w+/g, ":id")}`);
      }
    });
    registerScheduleRoutes(app, { service: null, contextResolver: null });
    await app.ready();
    expect(registered.sort()).toEqual(routes.map(([method, url]) => `${method} ${url}`).sort());
    await app.close();
  });
});

describe("Retired Schedule routes", () => {
  // Asked of the registration, not by URL: PATCH /shifts/publish would land on PATCH /shifts/:id.
  it("registers none of the retired twins", async () => {
    const app = Fastify();
    const registered: string[] = [];
    app.addHook("onRoute", (route) => {
      for (const method of [route.method].flat())
        registered.push(`${method} ${route.url.replace(":workspaceId", W).replace(/:\w+/g, ":id")}`);
    });
    registerScheduleRoutes(app, { service: null, contextResolver: null });
    await app.ready();
    for (const [method, url] of retired) expect(registered).not.toContain(`${method} ${url}`);
    expect(retired.length).toBe(41);
    await app.close();
  });
});

describe("Schedule refusals from the database", () => {
  const owner = context(scheduleActions);
  const draftsFailing = (error: unknown) =>
    buildApp({
      contextResolver: { resolve: async () => owner },
      scheduleService: {
        listDrafts: async () => {
          throw error;
        },
      } as unknown as ScheduleReadService,
    }).inject({
      method: "GET",
      url: "/schedule/drafts?week_start=2026-08-17",
      headers: { authorization: "Bearer token", "x-newfork-workspace-id": W },
    });

  it("keeps the core's no as 403 with its reason, and not_member as 404", async () => {
    const outOfScope = await draftsFailing(
      rpcFailure({ code: "42501", message: "Not allowed", hint: "authz.out_of_scope", details: "schedule.edit" }),
    );
    expect(outOfScope.statusCode).toBe(403);
    expect(outOfScope.json()).toMatchObject({ reason: "authz.out_of_scope", detail: "schedule.edit" });
    const notMember = await draftsFailing(
      rpcFailure({ code: "42501", message: "Not allowed", hint: "authz.not_member" }),
    );
    expect(notMember.statusCode).toBe(404);
    expect(notMember.json()).toMatchObject({ reason: "authz.not_member" });
  });

  it("does not pass on a JSON RAISE whose status is not a past-edit refusal", async () => {
    const app = buildApp({
      contextResolver: { resolve: async () => owner },
      scheduleService: {
        saveSession: async () => {
          throw rpcFailure({
            code: "P0001",
            message: JSON.stringify({ status: "something_else", internal: "relation schedule_drafts" }),
          });
        },
      } as unknown as ScheduleReadService,
    });
    const response = await app.inject({
      method: "POST",
      url: "/schedule/drafts/save",
      headers: { authorization: "Bearer token", "x-newfork-workspace-id": W },
      payload: { session_id: ID, expected_session_revision: 2, name: "Opening plan", draft_id: null, expected_draft_revision: null },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Request could not be completed" });
    expect(response.body).not.toContain("something_else");
    expect(response.body).not.toContain("schedule_drafts");
  });
});
