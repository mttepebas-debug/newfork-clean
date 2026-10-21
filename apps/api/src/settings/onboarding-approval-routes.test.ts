import { authzActionKeys, type ActiveWorkspaceContext, type AuthzAction } from "@newfork/shared";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../app";
import { rpcFailure } from "../http-error";
import type { OnboardingApprovalService } from "./onboarding-approval-service";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const otherWorkspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fe";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";
const spoofed = "11111111-1111-4111-8111-111111111111";

function contextWith(actions: readonly AuthzAction[]): ActiveWorkspaceContext {
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
    membership: { id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4", userId, workspaceId, access: { employee: false, management: "owner" }, status: "active" },
    permissions: [],
    actions: [...actions],
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: true, locationIds: [] },
  };
}

function serviceMock(): OnboardingApprovalService {
  return {
    read: vi.fn().mockResolvedValue({ final_approval_required: true }),
    save: vi.fn().mockResolvedValue({ final_approval_required: false }),
  };
}

const url = `/v1/workspaces/${workspaceId}/settings/onboarding-approval`;
const auth = { authorization: "Bearer valid-token" };
const body = { final_approval_required: false };

// Each route, the action the core must have listed for it, a valid body and the answer.
const routes = [
  ["GET", "workspace.read", undefined, { final_approval_required: true }],
  ["PUT", "settings.organization.write", body, { final_approval_required: false }],
] as const;

describe("onboarding approval routes", () => {
  it.each(routes)("%s answers with what the database answers", async (method, action, payload, answer) => {
    const service = serviceMock();
    const app = buildApp({ onboardingApprovalService: service, contextResolver: { resolve: async () => contextWith([action]) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(answer);
    await app.close();
  });

  it.each(routes)("%s is refused without its action", async (method, action, payload) => {
    const service = serviceMock();
    const others = authzActionKeys.filter((key) => key !== action);
    const app = buildApp({ onboardingApprovalService: service, contextResolver: { resolve: async () => contextWith(others) } });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.out_of_scope", detail: action });
    expect(service.read).not.toHaveBeenCalled();
    expect(service.save).not.toHaveBeenCalled();
    await app.close();
  });

  it.each(routes)("%s answers a non-member with 404", async (method, action, payload) => {
    const service = serviceMock();
    const app = buildApp({
      onboardingApprovalService: service,
      contextResolver: { resolve: async () => ({ ...contextWith([action]), workspace: { ...contextWith([]).workspace, id: otherWorkspaceId } }) },
    });
    const response = await app.inject({ method, url, headers: auth, ...(payload ? { payload } : {}) });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ reason: "authz.not_member" });
    await app.close();
  });

  it("asks for a session before anything else", async () => {
    const app = buildApp({ onboardingApprovalService: serviceMock(), contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("binds the person and the workspace from the token and the address, never the body", async () => {
    const service = serviceMock();
    const app = buildApp({ onboardingApprovalService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    await app.inject({ method: "GET", url, headers: auth });
    await app.inject({ method: "PUT", url, headers: auth, payload: body });
    const actor = { actorUserId: userId, workspaceId };
    expect(service.read).toHaveBeenCalledExactlyOnceWith(actor);
    expect(service.save).toHaveBeenCalledExactlyOnceWith({ ...actor, finalApprovalRequired: false });
    await app.close();
  });

  it.each([
    [{}],
    [{ final_approval_required: "no" }],
    [{ final_approval_required: null }],
    [{ ...body, actor_user_id: spoofed }],
  ])("refuses a body it cannot read: %j", async (payload) => {
    const service = serviceMock();
    const app = buildApp({ onboardingApprovalService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "PUT", url, headers: auth, payload });
    expect(response.statusCode).toBe(400);
    expect(service.save).not.toHaveBeenCalled();
    await app.close();
  });

  it("passes the database's refusal through with its reason", async () => {
    const service = serviceMock();
    vi.mocked(service.save).mockRejectedValue(
      rpcFailure({ message: "Not allowed", code: "42501", hint: "authz.missing_permission" }),
    );
    const app = buildApp({ onboardingApprovalService: service, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "PUT", url, headers: auth, payload: body });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reason: "authz.missing_permission" });
    await app.close();
  });

  it("says so when the database is not configured", async () => {
    const app = buildApp({ onboardingApprovalService: null, contextResolver: { resolve: async () => contextWith(authzActionKeys) } });
    const response = await app.inject({ method: "GET", url, headers: auth });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
