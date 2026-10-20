import { authzActionKeys, permissionSchema, type ActiveWorkspaceContext, type AuthzAction } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { acknowledgement, candidatesResult, editResult, lineupDay, myLineups, sectionsResult, shareResult } from "./lineup-fixtures";
import type { LineupService } from "./lineup-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const versionId = acknowledgement.version_id;
const lineup = {
  location_id: "b340777a-a901-40c5-a3c8-4727ceeb55c7",
  service_date: "2028-09-11",
  shift_type_id: null,
};

function memberWith(actions: readonly AuthzAction[]): ActiveWorkspaceContext {
  return {
    userId,
    workspace: {
      id: workspaceId,
      name: "Meyhouse",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
      userId,
      workspaceId,
      access: { employee: false, management: "manager" },
      status: "active",
    },
    permissions: [...permissionSchema.options],
    actions: [...actions],
    onboarding: { status: "complete", currentStep: 2, revision: 1 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: false, locationIds: [] },
  };
}

function serviceMock(): LineupService {
  return {
    command: vi.fn(async () => shareResult as never),
    edit: vi.fn(async () => editResult as never),
    sections: vi.fn(async () => sectionsResult as never),
    candidates: vi.fn(async () => candidatesResult as never),
    myLineups: vi.fn(async () => myLineups as never),
    acknowledge: vi.fn(async () => acknowledgement as never),
    day: vi.fn(async () => lineupDay as never),
  };
}

function appWith(service: LineupService, context: ActiveWorkspaceContext | null = memberWith(authzActionKeys)) {
  return buildApp({ contextResolver: { resolve: async () => context }, lineupService: service });
}

const w = `/v1/workspaces/${workspaceId}`;
const auth = { authorization: "Bearer token" };
const actor = { actorUserId: userId, workspaceId };
const share = { command_id: shareResult.command_id, kind: "share", lineups: [lineup], ask_ack: true };
const setRow = {
  command_id: editResult.command_id, action: "set_row", ...lineup,
  row: { source_shift_id: "be50320c-52d9-4f54-9684-372461ec9a95", starts: "15:30", ends: "22:00" },
};

const addSection = { action: "add", location_id: lineup.location_id, name: "Terrace" };
const kitchen = { ...lineup, department_id: "40000000-0000-4000-8000-000000000001" };

const routes = [
  ["publish", "POST", `${w}/lineups/commands`, share, "lineup.share"],
  ["edit", "POST", `${w}/lineups/edit`, setRow, "lineup.share"],
  ["sections", "POST", `${w}/lineups/sections`, addSection, "lineup.share"],
  ["candidates", "POST", `${w}/lineups/candidates`, kitchen, "lineup.share"],
  ["my lineups", "GET", `${w}/my-lineups/2028-09-11`, undefined, "employee_hub.read"],
  ["acknowledge", "POST", `${w}/lineups/versions/${versionId}/acknowledge`, undefined, "lineup.acknowledge"],
  ["day", "GET", `${w}/lineups/2028-09-11`, undefined, "lineup.read"],
] as const;

describe("lineup routes", () => {
  it("publishes or takes back lineups", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: `${w}/lineups/commands`, headers: auth, payload: share });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(shareResult);
    expect(service.command).toHaveBeenCalledWith({ ...actor, command: share });
    const back = { command_id: shareResult.command_id, kind: "unpublish", lineups: [lineup] };
    expect((await app.inject({ method: "POST", url: `${w}/lineups/commands`, headers: auth, payload: back })).statusCode).toBe(200);
    expect(service.command).toHaveBeenLastCalledWith({ ...actor, command: back });
  });

  it("changes a draft lineup's row or its notes (LINEUP-EDIT L2a)", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: `${w}/lineups/edit`, headers: auth, payload: setRow });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(editResult);
    expect(service.edit).toHaveBeenCalledWith({ ...actor, edit: setRow });
    const notes = { command_id: editResult.command_id, action: "set_notes", ...lineup, notes: { n86: "Oysters" } };
    expect((await app.inject({ method: "POST", url: `${w}/lineups/edit`, headers: auth, payload: notes })).statusCode).toBe(200);
    expect(service.edit).toHaveBeenLastCalledWith({ ...actor, edit: notes });
  });

  it("takes a typed section name on a row (LINEUP-EDIT L2b)", async () => {
    const service = serviceMock();
    const other = { ...setRow, row: { source_shift_id: setRow.row.source_shift_id, section_name: " Window ", save_section: true } };
    const response = await appWith(service).inject({ method: "POST", url: `${w}/lineups/edit`, headers: auth, payload: other });
    expect(response.statusCode).toBe(200);
    expect(service.edit).toHaveBeenCalledWith({ ...actor, edit: { ...other, row: { ...other.row, section_name: "Window" } } });
  });

  it("changes a location's sections (LINEUP-EDIT L2b)", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: `${w}/lineups/sections`, headers: auth, payload: addSection });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(sectionsResult);
    expect(service.sections).toHaveBeenCalledWith({ ...actor, change: addSection });
    const ids = sectionsResult.sections.map((section) => section.id).reverse();
    const reorder = { action: "reorder", location_id: lineup.location_id, section_ids: ids };
    expect((await app.inject({ method: "POST", url: `${w}/lineups/sections`, headers: auth, payload: reorder })).statusCode).toBe(200);
    expect(service.sections).toHaveBeenLastCalledWith({ ...actor, change: reorder });
  });

  // LINEUP-EDIT L3a (S-178 madde 5-7).
  it("calls off, calls in, adds, replaces and takes a replace back", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const source = setRow.row.source_shift_id;
    const person = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
    const job = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
    const base = { command_id: editResult.command_id, ...lineup };
    for (const payload of [
      { ...base, action: "call_off", row: { source_shift_id: source } },
      { ...base, action: "call_in", row: { row_id: editResult.row_id } },
      { ...base, action: "add_person", person: { employee_id: person, job_id: job } },
      { ...base, action: "add_person", person: { employee_id: person, job_id: job, starts: "10:00", ends: "14:00" } },
      { ...base, action: "replace", row: { source_shift_id: source }, person: { employee_id: person } },
      { ...base, action: "undo_replace", row: { row_id: editResult.row_id } },
    ]) {
      const response = await app.inject({ method: "POST", url: `${w}/lineups/edit`, headers: auth, payload });
      expect(response.statusCode).toBe(200);
      expect(service.edit).toHaveBeenLastCalledWith({ ...actor, edit: payload });
    }
  });

  it("reads who may join a department, or take a person's place", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: `${w}/lineups/candidates`, headers: auth, payload: kitchen });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(candidatesResult);
    expect(service.candidates).toHaveBeenCalledWith({ ...actor, query: kitchen });
    const place = { ...lineup, row: { source_shift_id: setRow.row.source_shift_id } };
    expect((await app.inject({ method: "POST", url: `${w}/lineups/candidates`, headers: auth, payload: place })).statusCode).toBe(200);
    expect(service.candidates).toHaveBeenLastCalledWith({ ...actor, query: place });
  });

  it("reads the employee's published lineups of a day", async () => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method: "GET", url: `${w}/my-lineups/2028-09-11`, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(myLineups);
    expect(service.myLineups).toHaveBeenCalledWith({ ...actor, date: "2028-09-11" });
  });

  it("reads the manager's day, every location she reads", async () => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method: "GET", url: `${w}/lineups/2028-09-11`, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(lineupDay);
    expect(service.day).toHaveBeenCalledWith({ ...actor, date: "2028-09-11" });
  });

  it("reads the day at chosen locations and shift types", async () => {
    const service = serviceMock();
    const [a, b] = [lineup.location_id, "9f0c4e8e-4a0a-4d55-9d3f-8f3b2f7e1c11"];
    const type = "c31b6d2a-4a25-4404-8fb0-bd9903551d4c";
    const response = await appWith(service).inject({
      method: "GET", url: `${w}/lineups/2028-09-11?location_ids=${a},${b}&shift_type_ids=${type}`, headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(service.day).toHaveBeenCalledWith({ ...actor, date: "2028-09-11", locationIds: [a, b], shiftTypeIds: [type] });
  });

  it("acknowledges a version", async () => {
    const service = serviceMock();
    const response = await appWith(service).inject({
      method: "POST", url: `${w}/lineups/versions/${versionId}/acknowledge`, headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(acknowledgement);
    expect(service.acknowledge).toHaveBeenCalledWith({ ...actor, versionId });
  });

  it.each([
    ["POST", `${w}/lineups/commands`, { ...share, lineups: [] }],
    ["POST", `${w}/lineups/commands`, { ...share, ask_ack: undefined }],
    ["POST", `${w}/lineups/commands`, { ...share, kind: "rename" }],
    ["POST", `${w}/lineups/commands`, { ...share, command_id: "not-a-uuid" }],
    ["POST", `${w}/lineups/commands`, { ...share, lineups: [{ ...lineup, service_date: "tomorrow" }] }],
    ["POST", `${w}/lineups/edit`, { ...setRow, action: "call_off" }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { starts: "15:30", ends: "22:00" } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { ...setRow.row, row_id: editResult.row_id } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { source_shift_id: setRow.row.source_shift_id, starts: "15:30" } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { ...setRow.row, starts: "3:30 PM" } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { ...setRow.row, called_off: true } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, action: "set_notes", row: undefined, notes: { specials: "x".repeat(501) } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { ...setRow.row, section_id: lineup.location_id, section_name: "Window" } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { ...setRow.row, section_name: "x".repeat(41) } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, row: { ...setRow.row, section_name: "   " } }],
    ["POST", `${w}/lineups/sections`, { ...addSection, action: "archive" }],
    ["POST", `${w}/lineups/sections`, { ...addSection, name: "" }],
    ["POST", `${w}/lineups/sections`, { ...addSection, location_id: "not-a-uuid" }],
    ["POST", `${w}/lineups/sections`, { action: "rename", location_id: lineup.location_id, name: "Garden" }],
    ["POST", `${w}/lineups/sections`, { action: "reorder", location_id: lineup.location_id, section_ids: [] }],
    ["POST", `${w}/lineups/sections`, { action: "remove", location_id: lineup.location_id, section_id: "patio" }],
    ["POST", `${w}/lineups/edit`, { ...setRow, action: "call_off", row: { source_shift_id: setRow.row.source_shift_id, starts: "10:00" } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, action: "add_person", row: undefined, person: { employee_id: lineup.location_id } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, action: "add_person", row: undefined, person: { employee_id: lineup.location_id, job_id: lineup.location_id, starts: "10:00" } }],
    ["POST", `${w}/lineups/edit`, { ...setRow, action: "replace", person: undefined }],
    ["POST", `${w}/lineups/edit`, { ...setRow, action: "undo_replace", row: { source_shift_id: setRow.row.source_shift_id } }],
    ["POST", `${w}/lineups/candidates`, lineup],
    ["POST", `${w}/lineups/candidates`, { ...kitchen, row: { source_shift_id: setRow.row.source_shift_id } }],
    ["POST", `${w}/lineups/candidates`, { ...kitchen, department_id: "kitchen" }],
    ["GET", `${w}/my-lineups/yesterday`, undefined],
    ["POST", `${w}/lineups/versions/not-a-uuid/acknowledge`, undefined],
    ["GET", "/v1/workspaces/not-a-uuid/my-lineups/2028-09-11", undefined],
    ["GET", `${w}/lineups/tomorrow`, undefined],
    ["GET", `${w}/lineups/2028-09-11?location_ids=not-a-uuid`, undefined],
    ["GET", `${w}/lineups/2028-09-11?shift_type_ids=`, undefined],
  ] as const)("refuses %s %s with 400 and never asks the core", async (method, url, payload) => {
    const service = serviceMock();
    const response = await appWith(service).inject({ method, url, headers: auth, payload });
    expect(response.statusCode).toBe(400);
    expect(service.command).not.toHaveBeenCalled();
    expect(service.edit).not.toHaveBeenCalled();
    expect(service.sections).not.toHaveBeenCalled();
    expect(service.candidates).not.toHaveBeenCalled();
    expect(service.myLineups).not.toHaveBeenCalled();
    expect(service.acknowledge).not.toHaveBeenCalled();
    expect(service.day).not.toHaveBeenCalled();
  });

  it.each(routes)("%s: without its action, 403 before the body is read", async (_name, method, url, payload, action) => {
    const service = serviceMock();
    const response = await appWith(service, memberWith(authzActionKeys.filter((key) => key !== action)))
      .inject({ method, url, headers: auth, payload });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: action });
  });

  it.each(routes)("%s: a stranger gets 404", async (_name, method, url, payload) => {
    const response = await appWith(serviceMock(), null).inject({ method, url, headers: auth, payload });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
  });

  it.each(routes)("%s: no service, 503", async (_name, method, url, payload) => {
    const app = buildApp({ contextResolver: { resolve: async () => memberWith(authzActionKeys) }, lineupService: null });
    expect((await app.inject({ method, url, headers: auth, payload })).statusCode).toBe(503);
  });
});
