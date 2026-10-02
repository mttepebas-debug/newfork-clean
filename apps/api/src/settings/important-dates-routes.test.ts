import type { ActiveWorkspaceContext } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { HttpError } from "../http-error";
import type { ImportantDatesService } from "./important-dates-service";
import type { OrganizationSettingsService } from "./organization-settings-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const dateId = "71000000-0000-4000-8000-000000000001";
const kadikoy = "11000000-0000-4000-8000-000000000001";

// A manager whose role holds nothing: the database decides (FB-6.7), so the
// route must not refuse on its own.
const manager: ActiveWorkspaceContext = {
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
    role: "manager",
    status: "active",
    allLocations: false,
  },
  permissions: ["workspace.read"],
  actions: [],
  onboarding: { status: "complete", currentStep: 2 },
  documentAccess: { restricted: false },
  locationScope: { allLocations: false, locationIds: [kadikoy] },
};

const date = {
  location_id: kadikoy,
  location_ids: [kadikoy],
  title: "Inventory day",
  type: "event",
  starts_on: "2026-12-25",
  ends_on: "2026-12-25",
  recurrence: "none",
  note: "",
  affects_scheduling: true,
};

function appWith(service: ImportantDatesService, resolved: ActiveWorkspaceContext | null = manager) {
  const organizationSettingsService = {
    readSchedulingSettings: vi.fn(),
    updateSchedulingSettings: vi.fn(),
    reorderShiftTypes: vi.fn(),
    reorderShiftLabels: vi.fn(),
    importantDates: service,
  } satisfies OrganizationSettingsService;
  return buildApp({ organizationSettingsService, contextResolver: { resolve: async () => resolved } });
}

function serviceMock(): ImportantDatesService {
  return {
    save: vi.fn().mockResolvedValue({ important_date_id: dateId, status: "published", recipient_count: 4 }),
    setState: vi.fn().mockResolvedValue({ important_date_id: dateId, status: "unpublished", archived_at: null }),
    history: vi.fn().mockResolvedValue({ important_date_id: dateId, author_user_id: userId, author_name: "Ayse", changes: [] }),
    previewClosure: vi.fn().mockResolvedValue({ fingerprint: "f1", shifts: [] }),
  };
}

const base = `/v1/workspaces/${workspaceId}/settings/important-dates`;
const auth = { authorization: "Bearer manager-token" };

describe("important date routes", () => {
  it("saves a new date as the signed-in person, whatever the body claims", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({
      method: "POST", url: base, headers: auth,
      payload: { ...date, actorUserId: "11111111-1111-4111-8111-111111111111", workspace_id: otherWorkspaceId },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ important_date_id: dateId, status: "published" });
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: userId, workspaceId, importantDateId: null, date: expect.objectContaining({ title: "Inventory day" }) }),
    );
    await app.close();
  });

  it("changes a date by its id", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "PUT", url: `${base}/${dateId}`, headers: auth, payload: { ...date, expected_revision: 3 } });
    expect(response.statusCode).toBe(200);
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ importantDateId: dateId, expectedRevision: 3 }));
    await app.close();
  });

  it("refuses a change that does not name its revision (P11)", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "PUT", url: `${base}/${dateId}`, headers: auth, payload: date });
    expect(response.statusCode).toBe(400);
    expect(service.save).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuses a date that ends before it starts without asking the database", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: base, headers: auth, payload: { ...date, ends_on: "2026-12-24" } });
    expect(response.statusCode).toBe(400);
    expect(service.save).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(["unpublish", "republish", "archive", "restore"] as const)("passes %s through", async (action) => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: `${base}/${dateId}/${action}`, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(service.setState).toHaveBeenCalledWith(expect.objectContaining({ importantDateId: dateId, action }));
    await app.close();
  });

  it("refuses an action it does not know", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: `${base}/${dateId}/delete`, headers: auth });
    expect(response.statusCode).toBe(400);
    expect(service.setState).not.toHaveBeenCalled();
    await app.close();
  });

  it("reads a date's history", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "GET", url: `${base}/${dateId}/history`, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ author_name: "Ayse", changes: [] });
    await app.close();
  });

  it("answers the database's no with 403 and its reason (K2: the owner's date)", async () => {
    const service = serviceMock();
    vi.mocked(service.save).mockRejectedValue(
      new HttpError("Not allowed", 403, { reason: "authz.rank", detail: "important_date.write" }),
    );
    const app = appWith(service);
    const response = await app.inject({ method: "PUT", url: `${base}/${dateId}`, headers: auth, payload: { ...date, expected_revision: 3 } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.rank" });
    await app.close();
  });

  // K13: a closed day lists the published shifts it lands on before it is saved.
  it("previews what a closed day lands on, as the signed-in person", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({
      method: "POST", url: `${base}/closure-preview`, headers: auth,
      payload: { important_date_id: dateId, type: "closed_day", starts_on: "2026-12-25", ends_on: "2026-12-25", recurrence: "none", location_ids: [kadikoy] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ fingerprint: "f1", shifts: [] });
    expect(service.previewClosure).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: userId, workspaceId, importantDateId: dateId, type: "closed_day", startsOn: "2026-12-25", locationIds: [kadikoy],
    }));
    await app.close();
  });

  it("refuses a preview with no dates without asking the database", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: `${base}/closure-preview`, headers: auth, payload: { type: "closed_day" } });
    expect(response.statusCode).toBe(400);
    expect(service.previewClosure).not.toHaveBeenCalled();
    await app.close();
  });

  it("passes the shifts kept on a closed day and the list it was shown (K13)", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const kept = "81000000-0000-4000-8000-000000000001";
    const response = await app.inject({
      method: "POST", url: base, headers: auth,
      payload: { ...date, type: "closed_day", keep_shift_ids: [kept], expected_fingerprint: "f1" },
    });
    expect(response.statusCode).toBe(201);
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ closure: { keepShiftIds: [kept], expectedFingerprint: "f1" } }));
    await app.close();
  });

  it("passes them when a closed day is republished", async () => {
    const service = serviceMock();
    const app = appWith(service);
    const response = await app.inject({
      method: "POST", url: `${base}/${dateId}/republish`, headers: auth, payload: { keep_shift_ids: [], expected_fingerprint: "f1" },
    });
    expect(response.statusCode).toBe(200);
    expect(service.setState).toHaveBeenCalledWith(expect.objectContaining({ closure: { keepShiftIds: [], expectedFingerprint: "f1" } }));
    await app.close();
  });

  it("answers a closed day saved on a stale list with 409 and its reason", async () => {
    const service = serviceMock();
    vi.mocked(service.save).mockRejectedValue(
      new HttpError("Request conflicts with the current state", 409, { reason: "important_date.closure_changed" }),
    );
    const app = appWith(service);
    const response = await app.inject({ method: "POST", url: base, headers: auth, payload: { ...date, type: "closed_day" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ reason: "important_date.closure_changed" });
    await app.close();
  });

  it("answers somebody who is not a member with 404 authz.not_member", async () => {
    const service = serviceMock();
    const app = appWith(service, null);
    const response = await app.inject({ method: "POST", url: base, headers: auth, payload: date });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    expect(service.save).not.toHaveBeenCalled();
    await app.close();
  });
});
