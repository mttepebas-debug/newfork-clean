import type { ActiveWorkspaceContext } from "@newfork/shared";
import { HttpError, rpcFailure } from "../http-error";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import type { CommunicationService } from "./communication-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "16fe2550-8960-480c-9874-cbc76a8e56a9";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

const mismatchedContext = {
  userId,
  workspace: {
    id: otherWorkspaceId,
    name: "Other Workspace",
    logo_url: null,
    logo_file_name: null,
    logo_updated_at: null,
    schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
  },
  membership: {
    id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
    userId,
    workspaceId: otherWorkspaceId,
    access: { employee: false, management: "owner" },
    status: "active",
  },
  permissions: ["workspace.read", "announcements.read", "announcements.manage"],
  actions: [],
  onboarding: { status: "complete", currentStep: 2, revision: 1 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: true, locationIds: [] },
} satisfies ActiveWorkspaceContext;

const activeContext = {
  ...mismatchedContext,
  workspace: {
    ...mismatchedContext.workspace,
    id: workspaceId,
    name: "Meyhouse",
  },
  membership: {
    ...mismatchedContext.membership,
    workspaceId,
  },
  permissions: [
    ...mismatchedContext.permissions,
    "workspace.manage",
    "settings.general.read",
    "settings.general.manage",
  ],
} satisfies ActiveWorkspaceContext;

// The drawer as filled in (EKRAN-08).
const draft = {
  title: "Service briefing",
  body: "Doors open at four.",
  category: "staff_meeting",
  category_other: null,
  starts_on: null,
  ends_on: null,
  event_from: null,
  event_until: null,
  recurrence: "none",
  on_important_dates: false,
  on_calendar: false,
  on_schedule: false,
  ask_ack: false,
  publish_at: null,
  locations: [],
  people: [],
};

function communicationServiceMock(): CommunicationService {
  return {
    getAnnouncements: vi.fn(),
    getAnnouncement: vi.fn(),
    getImportantDates: vi.fn(),
    previewAnnouncement: vi.fn(),
    saveAnnouncement: vi.fn(),
    setAnnouncementState: vi.fn(),
    acknowledgeAnnouncement: vi.fn(),
    getWorkspace: vi.fn(),
    getManagerHome: vi.fn(),
    saveWorkspaceLayout: vi.fn(),
    createWorkspaceTodo: vi.fn(),
    resolveWorkspaceTodo: vi.fn(),
  };
}

describe("communication routes", () => {
  // BILDIRIM-03: the old notification inbox is torn down; its endpoints are gone. Remind on an announcement
  // came back with the new notification system (BILDIRIM-U6, KARARLAR S-126).
  it.each([
    ["GET", `/v1/workspaces/${workspaceId}/communications/notifications`, undefined],
    [
      "POST",
      `/v1/workspaces/${workspaceId}/communications/notifications/action`,
      { notification_id: "a8300000-0000-4000-8000-000000000001", action: "read" },
    ],
  ] as const)("no longer serves the retired notification paths: %s %s", async (method, url, payload) => {
    const app = buildApp({
      contextResolver: { resolve: async () => activeContext },
      communicationService: communicationServiceMock(),
    });
    const response = await app.inject({
      method,
      url,
      headers: { authorization: "Bearer owner-token" },
      payload,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });

  // Mert 2026-10-21: the owner setup checklist is removed; its endpoints are gone.
  it.each([
    ["GET", `/v1/workspaces/${workspaceId}/workspace/setup-checklist`, undefined],
    ["PATCH", `/v1/workspaces/${workspaceId}/workspace/setup-checklist`, { itemId: "schedule" }],
    ["PATCH", `/v1/workspaces/${workspaceId}/workspace/setup-checklist`, { closed: true }],
  ] as const)("no longer serves the setup checklist: %s %s %j", async (method, url, payload) => {
    const app = buildApp({
      contextResolver: { resolve: async () => activeContext },
      communicationService: communicationServiceMock(),
    });
    const response = await app.inject({
      method,
      url,
      headers: { authorization: "Bearer owner-token" },
      payload,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });

  it("returns generic not found without calling services when active workspace context mismatches the path", async () => {
    const service = communicationServiceMock();
    const app = buildApp({
      contextResolver: { resolve: async () => mismatchedContext },
      communicationService: service,
    });
    const announcementId = "a8200000-0000-4000-8000-000000000001";
    const todoId = "a9700000-0000-4000-8000-000000000011";
    const routes = [
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/communications/announcements`,
        serviceMethod: "getAnnouncements",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/acknowledge`,
        serviceMethod: "acknowledgeAnnouncement",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/announcements`,
        payload: {
          announcement_id: null,
          expected_revision: null,
          intent: "draft",
          announcement: draft,
        },
        serviceMethod: "saveAnnouncement",
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}`,
        serviceMethod: "getAnnouncement",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/announcements/preview`,
        payload: { announcement_id: null, intent: "publish", announcement: draft },
        serviceMethod: "previewAnnouncement",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/archive`,
        payload: { expected_revision: 1 },
        serviceMethod: "setAnnouncementState",
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/workspace`,
        serviceMethod: "getWorkspace",
      },
      {
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/workspace/layout`,
        payload: {
          widget_order: [
            "operations",
            "pending_requests",
            "quick_actions",
            "updates",
            "open_shifts",
            "announcements",
            "coming_up",
            "todos",
          ],
          hidden_widget_ids: [],
          location_order: [],
        },
        serviceMethod: "saveWorkspaceLayout",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/workspace/todos`,
        payload: {
          title: "Follow up",
          body: "",
          employee_id: null,
          due_at: null,
        },
        serviceMethod: "createWorkspaceTodo",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/workspace/todos/${todoId}/resolve`,
        serviceMethod: "resolveWorkspaceTodo",
      },
    ] as const;

    for (const route of routes) {
      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: "Bearer owner-token" },
        payload: "payload" in route ? route.payload : undefined,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: "Workspace not found" });
      expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    }
  });

  it("ignores spoofed actor and workspace fields in write bodies", async () => {
    const service = communicationServiceMock();
    vi.mocked(service.saveAnnouncement).mockResolvedValue({
      announcement_id: "a8200000-0000-4000-8000-000000000001",
      status: "draft",
      display_status: "draft",
      revision: 1,
      recipient_count: 0,
      shift_changes: 0,
      brought_back: 0,
    });
    vi.mocked(service.saveWorkspaceLayout).mockResolvedValue({
      status: "saved",
    });
    vi.mocked(service.createWorkspaceTodo).mockResolvedValue({
      id: "a9700000-0000-4000-8000-000000000011",
      workspace_id: workspaceId,
      title: "Follow up",
      body: "",
      severity: "info",
      status: "open",
      system_generated: false,
      source_type: "manual",
      source_id: "a9700000-0000-4000-8000-000000000011",
      source_key: "manual:a9700000-0000-4000-8000-000000000011",
      employee_id: null,
      due_at: null,
      action_url: null,
      created_at: "2026-09-06T12:00:00.000Z",
    });
    const app = buildApp({
      contextResolver: { resolve: async () => activeContext },
      communicationService: service,
    });
    const spoofedActorUserId = "11111111-1111-4111-8111-111111111111";

    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/communications/announcements`,
      headers: { authorization: "Bearer owner-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        announcement_id: null,
        expected_revision: null,
        intent: "draft",
        announcement: draft,
      },
    });
    expect(service.saveAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );

    await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/workspace/layout`,
      headers: { authorization: "Bearer owner-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        widget_order: [
          "operations",
          "pending_requests",
          "quick_actions",
          "updates",
          "open_shifts",
          "announcements",
          "coming_up",
          "todos",
        ],
        hidden_widget_ids: [],
        location_order: [],
      },
    });
    expect(service.saveWorkspaceLayout).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );

    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/workspace/todos`,
      headers: { authorization: "Bearer owner-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        workspace_id: otherWorkspaceId,
        title: "Follow up",
        body: "",
        employee_id: null,
        due_at: null,
      },
    });
    expect(service.createWorkspaceTodo).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );
  });

  // BL-413: Workspace home, its to-dos and whether they may be written are the
  // core's (workspace.todos, KK-34); the routes keep no permission or role
  // gate of their own. Somebody the core refuses hears its reason.
  describe("Workspace home asks the core", () => {
    const employee = {
      ...activeContext,
      membership: { ...activeContext.membership, access: { employee: true, management: null },},
      permissions: ["workspace.read"] as ActiveWorkspaceContext["permissions"],
    } satisfies ActiveWorkspaceContext;
    const todoId = "a9700000-0000-4000-8000-000000000011";
    const routes = [
      ["home", "getWorkspace", "GET", `/v1/workspaces/${workspaceId}/workspace`, undefined],
      // The managers' Home, "Locations first" (YONETICI-HOME): the same gate, its own read.
      ["managers' Home", "getManagerHome", "GET", `/v1/workspaces/${workspaceId}/workspace/home`, undefined],
      ["layout", "saveWorkspaceLayout", "PUT", `/v1/workspaces/${workspaceId}/workspace/layout`, { widget_order: ["operations", "pending_requests", "quick_actions", "updates", "open_shifts", "announcements", "coming_up", "todos"], hidden_widget_ids: [], location_order: [] }],
      ["new to-do", "createWorkspaceTodo", "POST", `/v1/workspaces/${workspaceId}/workspace/todos`, { title: "Follow up", body: "", employee_id: null, due_at: null }],
      ["to-do resolution", "resolveWorkspaceTodo", "POST", `/v1/workspaces/${workspaceId}/workspace/todos/${todoId}/resolve`, undefined],
    ] as const;

    it.each(routes)("hands the %s to the database, whose refusal answers 403 with its reason", async (_name, method, verb, url, payload) => {
      const service = communicationServiceMock();
      vi.mocked(service[method]).mockRejectedValue(
        new HttpError("Not allowed", 403, { reason: "authz.missing_permission", detail: "workspace.todos" }),
      );
      const app = buildApp({ contextResolver: { resolve: async () => employee }, communicationService: service });
      const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer employee-token" }, payload });
      expect(service[method]).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: userId, workspaceId }));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.missing_permission", detail: "workspace.todos" });
      await app.close();
    });

    it.each(routes)("answers somebody who is not a member on the %s with 404 authz.not_member", async (_name, method, verb, url, payload) => {
      const service = communicationServiceMock();
      const app = buildApp({ contextResolver: { resolve: async () => null }, communicationService: service });
      const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer stranger-token" }, payload });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(service[method]).not.toHaveBeenCalled();
      await app.close();
    });
  });
  // FB-6.7: announcements are the core's (announcement.read / .write /
  // .write_wide / .acknowledge); the routes keep no permission gate.
  describe("Announcements ask the core", () => {
    const announcementId = "a8200000-0000-4000-8000-000000000001";
    const announcement = draft;
    const routes = [
      ["list", "getAnnouncements", "GET", `/v1/workspaces/${workspaceId}/communications/announcements`, undefined],
      ["drawer read", "getAnnouncement", "GET", `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}`, undefined],
      ["Important Dates read", "getImportantDates", "GET", `/v1/workspaces/${workspaceId}/communications/important-dates`, undefined],
      ["preview", "previewAnnouncement", "POST", `/v1/workspaces/${workspaceId}/communications/announcements/preview`, { announcement_id: announcementId, intent: "save", announcement }],
      ["save", "saveAnnouncement", "POST", `/v1/workspaces/${workspaceId}/communications/announcements`, { announcement_id: null, expected_revision: null, intent: "publish", announcement }],
      ["unschedule", "setAnnouncementState", "POST", `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/unschedule`, { expected_revision: 1 }],
      ["unpublish", "setAnnouncementState", "POST", `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/unpublish`, { expected_revision: 1 }],
      ["archive", "setAnnouncementState", "POST", `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/archive`, { expected_revision: 1 }],
      ["bring back", "setAnnouncementState", "POST", `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/bring-back`, { expected_revision: 1, bring_back: [announcementId] }],
      ["remind", "setAnnouncementState", "POST", `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/remind`, { expected_revision: 1 }],
      ["acknowledgement", "acknowledgeAnnouncement", "POST", `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/acknowledge`, undefined],
    ] as const;
    const manager = {
      ...activeContext,
      membership: { ...activeContext.membership, access: { employee: false, management: "manager" },},
      permissions: ["workspace.read"] as ActiveWorkspaceContext["permissions"],
    } satisfies ActiveWorkspaceContext;

    it.each(routes)("hands the %s to the database, whose refusal answers 403 with its reason", async (_name, method, verb, url, payload) => {
      const service = communicationServiceMock();
      vi.mocked(service[method]).mockRejectedValue(
        new HttpError("Not allowed", 403, { reason: "authz.out_of_scope", detail: "announcement.write" }),
      );
      const app = buildApp({ contextResolver: { resolve: async () => manager }, communicationService: service });
      const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer manager-token" }, payload });
      expect(service[method]).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: userId, workspaceId }));
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ reason: "authz.out_of_scope" });
      await app.close();
    });

    // BL-1047: a write over a newer revision says so with a key, so the editor
    // can tell "changed meanwhile" from "archived, cannot be edited".
    it.each(routes.filter(([name]) => ["save", "unschedule", "unpublish", "archive", "bring back", "remind"].includes(name)))(
      "passes the database's announcement.changed key on with the %s 409",
      async (_name, method, verb, url, payload) => {
        const service = communicationServiceMock();
        vi.mocked(service[method]).mockRejectedValue(
          rpcFailure({ message: "stale announcement revision", code: "PT409", hint: "announcement.changed" }),
        );
        const app = buildApp({ contextResolver: { resolve: async () => manager }, communicationService: service });
        const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer manager-token" }, payload });
        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ reason: "announcement.changed" });
        await app.close();
      },
    );

    it.each(routes)("answers somebody who is not a member on the %s with 404 authz.not_member", async (_name, method, verb, url, payload) => {
      const service = communicationServiceMock();
      const app = buildApp({ contextResolver: { resolve: async () => null }, communicationService: service });
      const response = await app.inject({ method: verb, url, headers: { authorization: "Bearer stranger-token" }, payload });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ reason: "authz.not_member" });
      expect(service[method]).not.toHaveBeenCalled();
      await app.close();
    });

    // S-126 (2): the third Remind in a day is the database's refusal, passed on with its key.
    it("passes the database's twice-a-day Remind limit on as a 409 with its key", async () => {
      const service = communicationServiceMock();
      vi.mocked(service.setAnnouncementState).mockRejectedValue(
        rpcFailure({ message: "twice a day", code: "PT409", hint: "announcement.remind_limit" }),
      );
      const app = buildApp({ contextResolver: { resolve: async () => manager }, communicationService: service });
      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/remind`,
        headers: { authorization: "Bearer manager-token" },
        payload: { expected_revision: 1 },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ reason: "announcement.remind_limit" });
      await app.close();
    });

    it("refuses a change to an announcement that names no revision, so a second save is not lost (KK-92 c)", async () => {
      const service = communicationServiceMock();
      vi.mocked(service.saveAnnouncement).mockResolvedValue({
        announcement_id: announcementId, status: "draft", display_status: "draft", revision: 4, recipient_count: 0,
        shift_changes: 0, brought_back: 0,
      });
      const app = buildApp({ contextResolver: { resolve: async () => manager }, communicationService: service });
      const url = `/v1/workspaces/${workspaceId}/communications/announcements`;
      const headers = { authorization: "Bearer manager-token" };
      const unnamed = await app.inject({ method: "POST", url, headers, payload: { announcement_id: announcementId, intent: "draft", announcement } });
      expect(unnamed.statusCode).toBe(400);
      expect(service.saveAnnouncement).not.toHaveBeenCalled();
      const named = await app.inject({ method: "POST", url, headers, payload: { announcement_id: announcementId, expected_revision: 3, intent: "draft", announcement } });
      expect(named.statusCode).toBe(200);
      expect(service.saveAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ announcementId, expectedRevision: 3, intent: "draft" }));
      await app.close();
    });

    it("passes the state action and the shifts to bring back through, and refuses an unknown one", async () => {
      const service = communicationServiceMock();
      vi.mocked(service.setAnnouncementState).mockResolvedValue({
        announcement_id: announcementId, status: "unpublished", display_status: "unpublished", revision: 3,
        archived_at: null, told: 0,
      });
      const app = buildApp({ contextResolver: { resolve: async () => manager }, communicationService: service });
      const headers = { authorization: "Bearer manager-token" };
      const base = `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}`;
      const ok = await app.inject({ method: "POST", url: `${base}/unpublish`, headers, payload: { expected_revision: 2 } });
      expect(ok.statusCode).toBe(200);
      expect(service.setAnnouncementState).toHaveBeenCalledWith(
        expect.objectContaining({ action: "unpublish", expectedRevision: 2, bringBack: [] }),
      );
      const back = await app.inject({ method: "POST", url: `${base}/bring-back`, headers, payload: { expected_revision: 3, bring_back: [announcementId] } });
      expect(back.statusCode).toBe(200);
      expect(service.setAnnouncementState).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "bring_back", bringBack: [announcementId] }),
      );
      const remind = await app.inject({ method: "POST", url: `${base}/remind`, headers, payload: { expected_revision: 4 } });
      expect(remind.statusCode).toBe(200);
      expect(service.setAnnouncementState).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "remind", expectedRevision: 4, bringBack: [] }),
      );
      // Restore and a bare Publish are gone: Publish is a save (EKRAN-08).
      for (const gone of ["cancel", "restore", "publish"]) {
        const unknown = await app.inject({ method: "POST", url: `${base}/${gone}`, headers, payload: { expected_revision: 2 } });
        expect(unknown.statusCode).toBe(404);
      }
      await app.close();
    });

    it("refuses a draft the database could not read: a shift choice without its hours, an unknown day", async () => {
      const service = communicationServiceMock();
      const app = buildApp({ contextResolver: { resolve: async () => manager }, communicationService: service });
      const url = `/v1/workspaces/${workspaceId}/communications/announcements/preview`;
      const headers = { authorization: "Bearer manager-token" };
      const shift = "a8200000-0000-4000-8000-000000000009";
      for (const bad of [
        { ...announcement, choices: { [shift]: { choice: "edit", from: "10:00" } } },
        { ...announcement, locations: [{ location_id: shift, day: "half", opens: null, closes: null }] },
        { ...announcement, category: "operations" },
      ]) {
        const response = await app.inject({ method: "POST", url, headers, payload: { announcement_id: null, intent: "publish", announcement: bad } });
        expect(response.statusCode).toBe(400);
      }
      expect(service.previewAnnouncement).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
