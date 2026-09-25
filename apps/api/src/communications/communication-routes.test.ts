import type { ActiveWorkspaceContext } from "@newfork/shared";
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
    role: "owner",
    status: "active",
    allLocations: true,
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

function communicationServiceMock(): CommunicationService {
  return {
    getAnnouncements: vi.fn(),
    saveAnnouncement: vi.fn(),
    publishAnnouncement: vi.fn(),
    cancelAnnouncement: vi.fn(),
    acknowledgeAnnouncement: vi.fn(),
    getNotifications: vi.fn(),
    actOnNotification: vi.fn(),
    getWorkspace: vi.fn(),
    saveWorkspaceLayout: vi.fn(),
    createWorkspaceTodo: vi.fn(),
    resolveWorkspaceTodo: vi.fn(),
    getOwnerSetupChecklistProgress: vi.fn(),
    markOwnerSetupChecklistItem: vi.fn(),
    setOwnerSetupChecklistClosed: vi.fn(),
  };
}

describe("communication routes", () => {
  it("returns generic not found without calling services when active workspace context mismatches the path", async () => {
    const service = communicationServiceMock();
    const app = buildApp({
      contextResolver: { resolve: async () => mismatchedContext },
      communicationService: service,
    });
    const announcementId = "a8200000-0000-4000-8000-000000000001";
    const notificationId = "a8300000-0000-4000-8000-000000000001";
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
          announcement: {
            title: "Service briefing",
            body: "Doors open at four.",
            category: "operations",
            audience_roles: ["employee"],
            location_ids: [],
            publish_at: null,
            expires_at: null,
            action_url: null,
          },
        },
        serviceMethod: "saveAnnouncement",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/publish`,
        payload: { expected_revision: 1 },
        serviceMethod: "publishAnnouncement",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/announcements/${announcementId}/cancel`,
        payload: { expected_revision: 1 },
        serviceMethod: "cancelAnnouncement",
      },
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/communications/notifications`,
        serviceMethod: "getNotifications",
      },
      {
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/communications/notifications/action`,
        payload: { notification_id: notificationId, action: "read" },
        serviceMethod: "actOnNotification",
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
            "open_shifts",
            "announcements",
            "todos",
            "notifications",
            "quick_actions",
          ],
          hidden_widget_ids: [],
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
      {
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/workspace/setup-checklist`,
        serviceMethod: "getOwnerSetupChecklistProgress",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/workspace/setup-checklist`,
        payload: { itemId: "schedule" },
        serviceMethod: "markOwnerSetupChecklistItem",
      },
      {
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/workspace/setup-checklist`,
        payload: { closed: true },
        serviceMethod: "setOwnerSetupChecklistClosed",
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
      expect(response.json()).toEqual({ error: "Workspace not found" });
      expect(service[route.serviceMethod]).not.toHaveBeenCalled();
    }
  });

  it("ignores spoofed actor and workspace fields in write bodies", async () => {
    const service = communicationServiceMock();
    vi.mocked(service.saveAnnouncement).mockResolvedValue({
      announcement_id: "a8200000-0000-4000-8000-000000000001",
      status: "draft",
      revision: 1,
      recipient_count: 0,
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
    vi.mocked(service.markOwnerSetupChecklistItem).mockResolvedValue({
      workspace_id: workspaceId,
      user_id: userId,
      completed_item_ids: ["schedule"],
      closed_at: null,
    });
    vi.mocked(service.setOwnerSetupChecklistClosed).mockResolvedValue({
      workspace_id: workspaceId,
      user_id: userId,
      completed_item_ids: [],
      closed_at: "2026-09-06T12:00:00.000Z",
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
        announcement: {
          title: "Service briefing",
          body: "Doors open at four.",
          category: "operations",
          audience_roles: ["employee"],
          location_ids: [],
          publish_at: null,
          expires_at: null,
          action_url: null,
        },
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
          "open_shifts",
          "announcements",
          "todos",
          "notifications",
          "quick_actions",
        ],
        hidden_widget_ids: [],
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

    await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/workspace/setup-checklist`,
      headers: { authorization: "Bearer owner-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        itemId: "schedule",
      },
    });
    expect(service.markOwnerSetupChecklistItem).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );

    await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/workspace/setup-checklist`,
      headers: { authorization: "Bearer owner-token" },
      payload: {
        actorUserId: spoofedActorUserId,
        workspaceId: otherWorkspaceId,
        closed: true,
      },
    });
    expect(service.setOwnerSetupChecklistClosed).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId }),
    );
  });
});
