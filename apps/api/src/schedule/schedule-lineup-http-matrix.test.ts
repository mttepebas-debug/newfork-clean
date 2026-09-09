import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@newfork/shared";
import { registerScheduleLineupRoutes } from "./schedule-lineup-routes";
import type { ScheduleLineupService } from "./schedule-lineup-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const actor = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const locationId = "11000000-0000-4000-8000-000000000001";
const otherId = "11000000-0000-4000-8000-000000000002";
const headers = {
  authorization: "Bearer test-token",
  "x-newfork-workspace-id": workspaceId,
};
const context = {
  userId: actor,
  workspace: { id: workspaceId },
  membership: { role: "manager", status: "active" },
  permissions: [
    "schedule.lineup.read",
    "schedule.lineup.manage",
    "schedule.lineup.share",
  ],
} as ActiveWorkspaceContext;
const scope = { date: "2030-01-07", location_id: locationId };
const target = {
  ...scope,
  job_id: otherId,
  shift_type_id: otherId,
  start_time: "16:00",
  end_time: "22:00",
  section_id: null,
  station: "",
};
const operation = {
  kind: "release",
  source_entry_id: otherId,
  target_entry_id: null,
  employee_id: null,
  target,
  reason: "Remove assignment",
  travel_minutes: 0,
};
const reviewed = { fingerprint: "a".repeat(64), idempotency_key: otherId };
const entry = {
  source_shift_id: otherId,
  employee_id: null,
  job_id: otherId,
  shift_type_id: otherId,
  start_time: "16:00",
  end_time: "22:00",
  section_id: null,
  station: "",
  call_off: false,
  hidden: false,
  display_order: 0,
};
const placements = {
  ...scope,
  entries: [{ id: otherId, expected_revision: 1, entry }],
};
type Endpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  input: Record<string, unknown>;
  permission: string | null;
  service: string;
  action?: string;
  legacy?: boolean;
};
const read = "schedule.lineup.read",
  manage = "schedule.lineup.manage",
  share = "schedule.lineup.share";
const operationCases: Array<
  [Endpoint["method"], string, string, string | null, Record<string, unknown>]
> = [
  ["POST", "/placements/preview", "placements_preview", manage, placements],
  [
    "POST",
    "/placements",
    "placements_apply",
    manage,
    { ...placements, ...reviewed },
  ],
  ["GET", "/shared-export", "shared_export", share, scope],
  [
    "POST",
    "/section-plan",
    "section_plan",
    manage,
    {
      ...scope,
      shift_type_id: null,
      section_id: otherId,
      closed: false,
      lead_employee_id: null,
      stations: "",
      expected_revision: null,
    },
  ],
  ["POST", "/notifications/retry", "retry_notifications", share, scope],
  [
    "POST",
    "/notifications/remind",
    "remind_unacknowledged",
    share,
    { ...scope, snapshot_id: otherId },
  ],
  ["GET", "/destinations", "destinations", manage, {}],
  ["GET", "/proposals", "proposals", manage, scope],
  [
    "POST",
    "/proposals",
    "propose",
    manage,
    { operation, ...reviewed, kind: "transfer" },
  ],
  [
    "POST",
    "/proposals/action",
    "proposal_action",
    manage,
    { id: otherId, response: "cancel" },
  ],
  ["GET", "/offers", "offers", null, {}],
  [
    "POST",
    "/offers/respond",
    "respond",
    null,
    { id: otherId, response: "decline" },
  ],
  ["GET", "/operations", "state", read, scope],
  [
    "POST",
    "/candidates",
    "candidates",
    manage,
    { target, source_entry_id: otherId },
  ],
  ["POST", "/operations/preview", "preview", manage, { operation }],
  ["POST", "/operations", "apply", manage, { operation, ...reviewed }],
  [
    "POST",
    "/notes",
    "note",
    manage,
    {
      note_id: null,
      expected_revision: null,
      note: {
        ...scope,
        shift_type_id: null,
        section_id: null,
        category: "instruction",
        content: "Team note",
        visibility: "team",
        pinned: false,
        expires_at: null,
      },
    },
  ],
  [
    "GET",
    "/published",
    "published",
    null,
    { from: scope.date, to: scope.date },
  ],
  [
    "POST",
    "/receipt",
    "receipt",
    null,
    { snapshot_id: otherId, action: "acknowledge" },
  ],
];
const section = { name: "Patio", color: "#123456", sort_order: 0 };
const shareInput = { date: scope.date, location_ids: [locationId] };
const crudCases: Array<
  [Endpoint["method"], string, string, string, Record<string, unknown>]
> = [
  ["GET", "", "get", read, { date: scope.date, location_ids: locationId }],
  ["POST", "/sections", "saveSection", manage, { section }],
  [
    "PATCH",
    `/sections/${otherId}`,
    "saveSection",
    manage,
    { section, expected_revision: 1 },
  ],
  [
    "DELETE",
    `/sections/${otherId}`,
    "archiveSection",
    manage,
    { expected_revision: 1 },
  ],
  ["POST", "/entries", "saveEntry", manage, { ...scope, entry }],
  [
    "PUT",
    `/entries/${otherId}`,
    "saveEntry",
    manage,
    { ...scope, entry, expected_revision: 1 },
  ],
  [
    "DELETE",
    `/entries/${otherId}`,
    "deleteEntry",
    manage,
    { expected_revision: 1 },
  ],
  [
    "POST",
    "/entries/move",
    "moveEntry",
    manage,
    {
      source_entry_id: otherId,
      target_location_id: locationId,
      target_date: scope.date,
    },
  ],
  [
    "PUT",
    `/briefs/${otherId}`,
    "saveBrief",
    manage,
    { ...scope, out_of_stock: "", specials: "", pre_shift_notes: "" },
  ],
  ["POST", "/share-preview", "previewShare", share, shareInput],
  [
    "POST",
    "/share",
    "share",
    share,
    { ...shareInput, fingerprint: reviewed.fingerprint },
  ],
];
const endpoints: Endpoint[] = [
  ...operationCases.map(([method, path, action, permission, input]) => ({
    method,
    path: `/schedule/lineups${path}`,
    action,
    permission,
    input,
    service: "operations",
  })),
  ...[false, true].flatMap((legacy) =>
    crudCases.map(([method, path, service, permission, input]) => ({
      method,
      path: `${legacy ? `/v1/workspaces/${workspaceId}/schedule/lineup` : "/schedule/lineups"}${path}`,
      service,
      permission,
      input,
      legacy,
    })),
  ),
];

describe("Line Up HTTP authorization matrix", () => {
  it.each(endpoints)(
    "$method $path binds identity and rejects forbidden sessions",
    async (endpoint) => {
      const app = Fastify();
      const service = Object.fromEntries(
        [...new Set(endpoints.map((item) => item.service))].map((name) => [
          name,
          vi.fn().mockResolvedValue({ ok: true }),
        ]),
      );
      const resolve = vi.fn().mockResolvedValue(context);
      registerScheduleLineupRoutes(app, {
        service: service as unknown as ScheduleLineupService,
        contextResolver: { resolve },
      });
      const invoke = (sessionHeaders: Record<string, string> = headers) =>
        app.inject({
          method: endpoint.method,
          url: endpoint.path,
          headers: sessionHeaders,
          ...(endpoint.method === "GET"
            ? {
                query: Object.fromEntries(
                  Object.entries(endpoint.input).map(([key, value]) => [
                    key,
                    String(value),
                  ]),
                ),
              }
            : {
                payload: {
                  ...endpoint.input,
                  actor_user_id: otherId,
                  workspace_id: otherId,
                },
              }),
        });
      const deny = async (
        label: string,
        value: unknown,
        sessionHeaders = headers,
        status = 403,
      ) => {
        resolve.mockResolvedValue(value);
        Object.values(service).forEach((mock) => mock.mockClear());
        const response = await invoke(sessionHeaders);
        expect(response.statusCode, `${label}: ${response.body}`).toBe(status);
        Object.values(service).forEach((mock) =>
          expect(mock, label).not.toHaveBeenCalled(),
        );
      };
      try {
        const success = await invoke();
        expect(success.statusCode, success.body).toBeGreaterThanOrEqual(200);
        expect(success.statusCode, success.body).toBeLessThan(300);
        expect(resolve).toHaveBeenCalledWith("test-token", workspaceId);
        expect(service[endpoint.service]).toHaveBeenCalledWith(
          expect.objectContaining({ actorUserId: actor, workspaceId }),
        );
        if (endpoint.action)
          expect(service.operations).toHaveBeenCalledWith({
            actorUserId: actor,
            workspaceId,
            action: endpoint.action,
            payload: endpoint.input,
          });

        await deny("missing bearer", context, {
          "x-newfork-workspace-id": workspaceId,
        } as typeof headers);
        await deny("untyped token", context, {
          ...headers,
          authorization: "test-token",
        });
        await deny("unknown session", null);
        await deny("inactive member", {
          ...context,
          membership: { ...context.membership, status: "inactive" },
        });
        await deny(
          "workspace mismatch",
          { ...context, workspace: { id: otherId } },
          headers,
          endpoint.legacy ? 404 : 403,
        );
        if (!endpoint.legacy) {
          await deny("missing workspace", context, {
            authorization: headers.authorization,
          } as typeof headers);
          await deny("invalid workspace", context, {
            ...headers,
            "x-newfork-workspace-id": "invalid",
          });
        }
        if (endpoint.permission) {
          await deny("missing required permission", {
            ...context,
            permissions: context.permissions.filter(
              (permission) => permission !== endpoint.permission,
            ),
          });
          await deny("employee with elevated claims", {
            ...context,
            membership: { ...context.membership, role: "employee" },
          });
        } else {
          resolve.mockResolvedValue({
            ...context,
            membership: { ...context.membership, role: "employee" },
            permissions: [],
          });
          expect((await invoke()).statusCode).toBe(200);
        }
        // The database/service owns actual location membership, including both sides
        // of a move. Its denial must never become a successful HTTP response.
        resolve.mockResolvedValue(context);
        service[endpoint.service]!.mockRejectedValueOnce(
          new Error("Line Up location scope denied"),
        );
        expect((await invoke()).statusCode).toBe(403);
      } finally {
        await app.close();
      }
    },
  );
});
