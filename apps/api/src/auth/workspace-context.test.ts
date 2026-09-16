import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveWorkspaceContext } from "@newfork/shared";

import {
  createSupabaseWorkspaceContextResolver,
  resolveWorkspaceAnyPermissionAuthorization,
  resolveWorkspaceAuthorization,
  resolveWorkspaceMembership,
} from "./workspace-context";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const serviceEq = vi.fn();
  const serviceFrom = vi.fn();
  const serviceRpc = vi.fn();
  const serviceSelect = vi.fn();
  const serviceStorageFrom = vi.fn();
  const serviceStorageGetPublicUrl = vi.fn();
  const requestRpc = vi.fn();
  const createClient = vi.fn(
    (
      _url: string,
      key: string,
      options?: { global?: { headers?: Record<string, string> } },
    ) => {
      if (key === "service-role") {
        return {
          from: serviceFrom,
          rpc: serviceRpc,
          storage: { from: serviceStorageFrom },
        };
      }
      if (options?.global?.headers) return { rpc: requestRpc };
      return { auth: { getUser: authGetUser } };
    },
  );
  return {
    authGetUser,
    createClient,
    requestRpc,
    serviceEq,
    serviceFrom,
    serviceRpc,
    serviceSelect,
    serviceStorageFrom,
    serviceStorageGetPublicUrl,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

const userId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const otherWorkspaceId = "20000000-0000-4000-8000-000000000002";
const membershipId = "30000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.authGetUser.mockReset();
  mocks.serviceEq.mockReset();
  mocks.serviceEq.mockResolvedValue({ data: [], error: null });
  mocks.serviceFrom.mockReset();
  mocks.serviceFrom.mockReturnValue({ select: mocks.serviceSelect });
  mocks.serviceRpc.mockReset();
  mocks.serviceRpc.mockResolvedValue({ data: { restricted: false }, error: null });
  mocks.serviceSelect.mockReset();
  mocks.serviceSelect.mockReturnValue({ eq: mocks.serviceEq });
  mocks.serviceStorageFrom.mockReset();
  mocks.serviceStorageFrom.mockReturnValue({
    getPublicUrl: mocks.serviceStorageGetPublicUrl,
  });
  mocks.serviceStorageGetPublicUrl.mockReset();
  mocks.serviceStorageGetPublicUrl.mockReturnValue({
    data: { publicUrl: "https://cdn.example.test/logo.png" },
  });
  mocks.requestRpc.mockReset();
  mocks.createClient.mockClear();
});

describe("createSupabaseWorkspaceContextResolver", () => {
  it("records a restricted security audit when explicit workspace context is denied", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.serviceRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: "90000000-0000-4000-8000-000000000001",
        error: null,
      });

    const resolver = createSupabaseWorkspaceContextResolver({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
    });

    await expect(resolver.resolve("valid-token", workspaceId)).resolves.toBe(
      null,
    );

    expect(mocks.serviceRpc).toHaveBeenNthCalledWith(
      1,
      "resolve_workspace_context_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
      },
    );
    expect(mocks.serviceRpc).toHaveBeenNthCalledWith(
      2,
      "record_security_audit_event_service",
      {
        actor_user_id: userId,
        target_workspace_id: null,
        event_type: "tenant.workspace_context_denied",
        surface: "workspace_context.resolve",
        resource_type: "workspace",
        raw_resource_id: workspaceId,
        metadata: { reason: "workspace_context_not_resolved" },
      },
    );
  });

  it("does not write a security audit when default active context is absent", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.serviceRpc.mockResolvedValueOnce({ data: [], error: null });

    const resolver = createSupabaseWorkspaceContextResolver({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
    });

    await expect(resolver.resolve("valid-token")).resolves.toBe(null);

    expect(mocks.serviceRpc).toHaveBeenCalledTimes(1);
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      "resolve_active_workspace_service",
      { actor_user_id: userId },
    );
  });

  it("rejects an explicit workspace row that belongs to another account and records a restricted audit", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.serviceRpc
      .mockResolvedValueOnce({
        data: [
          {
            user_id: "10000000-0000-4000-8000-000000000099",
            workspace_id: workspaceId,
            workspace_name: "Scoped Bistro",
            membership_id: membershipId,
            workspace_role: "employee",
            permission_keys: ["workspace.read"],
            all_locations: true,
            onboarding_status: "complete",
            onboarding_current_step: 4,
            onboarding_revision: 1,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: "90000000-0000-4000-8000-000000000001",
        error: null,
      });

    const resolver = createSupabaseWorkspaceContextResolver({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
    });

    await expect(resolver.resolve("valid-token", workspaceId)).resolves.toBe(
      null,
    );

    expect(mocks.serviceRpc).toHaveBeenNthCalledWith(
      2,
      "record_security_audit_event_service",
      {
        actor_user_id: userId,
        target_workspace_id: null,
        event_type: "tenant.workspace_context_denied",
        surface: "workspace_context.resolve",
        resource_type: "workspace",
        raw_resource_id: workspaceId,
        metadata: { reason: "workspace_context_not_resolved" },
      },
    );
  });

  it("rejects a default workspace row that belongs to another account without writing explicit-context audit", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.serviceRpc.mockResolvedValueOnce({
      data: [
        {
          user_id: "10000000-0000-4000-8000-000000000099",
          workspace_id: workspaceId,
          workspace_name: "Scoped Bistro",
          membership_id: membershipId,
          workspace_role: "employee",
          permission_keys: ["workspace.read"],
          all_locations: true,
          onboarding_status: "complete",
          onboarding_current_step: 4,
          onboarding_revision: 1,
        },
      ],
      error: null,
    });

    const resolver = createSupabaseWorkspaceContextResolver({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
    });

    await expect(resolver.resolve("valid-token")).resolves.toBe(null);

    expect(mocks.serviceRpc).toHaveBeenCalledTimes(1);
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      "resolve_active_workspace_service",
      { actor_user_id: userId },
    );
  });

  it("loads explicit scoped location IDs through the service client", async () => {
    const locationIdA = "40000000-0000-4000-8000-000000000001";
    const locationIdB = "40000000-0000-4000-8000-000000000002";
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.serviceRpc.mockResolvedValueOnce({
      data: [
        {
          user_id: userId,
          workspace_id: workspaceId,
          workspace_name: "Scoped Bistro",
          membership_id: membershipId,
          workspace_role: "manager",
          permission_keys: ["workspace.read", "employees.read"],
          all_locations: false,
          onboarding_status: "complete",
          onboarding_current_step: 4,
          onboarding_revision: 1,
        },
      ],
      error: null,
    });
    mocks.serviceEq.mockResolvedValueOnce({
      data: [{ location_id: locationIdA }, { location_id: locationIdB }],
      error: null,
    });

    const resolver = createSupabaseWorkspaceContextResolver({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
    });

    const context = await resolver.resolve("valid-token", workspaceId);

    expect(context?.locationScope).toEqual({
      allLocations: false,
      locationIds: [locationIdA, locationIdB],
    });
    expect(mocks.serviceRpc).toHaveBeenCalledWith(
      "resolve_workspace_context_service",
      {
        actor_user_id: userId,
        target_workspace_id: workspaceId,
      },
    );
    expect(mocks.serviceFrom).toHaveBeenCalledWith(
      "membership_location_scopes",
    );
    expect(mocks.serviceSelect).toHaveBeenCalledWith("location_id");
    expect(mocks.serviceEq).toHaveBeenCalledWith("membership_id", membershipId);
  });

  it.each([
    { label: "pre-migration schema", rpcCode: "PGRST202", columnCode: "42703", allowed: true },
    { label: "stale RPC cache with lifecycle schema", rpcCode: "PGRST202", columnCode: null, allowed: false },
    { label: "access service failure", rpcCode: "XX000", columnCode: "42703", allowed: false },
    { label: "missing dependency inside an installed function", rpcCode: "42883", columnCode: "42703", allowed: false },
    { label: "schema probe failure", rpcCode: "PGRST202", columnCode: "42501", allowed: false },
  ])("handles $label without bypassing installed document restrictions", async ({ rpcCode, columnCode, allowed }) => {
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    mocks.serviceRpc.mockResolvedValueOnce({ data: [{ user_id: userId, workspace_id: workspaceId, workspace_name: "Bistro", membership_id: membershipId, workspace_role: "employee", permission_keys: ["workspace.read"], all_locations: true, onboarding_status: "complete", onboarding_current_step: 4, onboarding_revision: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: rpcCode, message: "Could not find the function public.get_employee_document_access_service(actor_user_id, target_workspace_id) in the schema cache" } });
    const limit = vi.fn().mockResolvedValue({ data: [], error: columnCode ? { code: columnCode, message: "column lifecycle_revision does not exist" } : null });
    mocks.serviceSelect.mockReturnValueOnce({ limit });
    const resolver = createSupabaseWorkspaceContextResolver({ url: "https://example.supabase.co", anonKey: "anon", serviceRoleKey: "service-role" });
    if (allowed) {
      const result = await resolver.resolve("valid-token", workspaceId);
      expect(result?.workspace.id).toBe(workspaceId);
      expect(result?.documentAccess).toBeUndefined();
      expect(mocks.serviceFrom).toHaveBeenCalledWith("employee_onboarding_requirements");
      expect(limit).toHaveBeenCalledWith(0);
    } else await expect(resolver.resolve("valid-token", workspaceId)).rejects.toThrow("Document access could not be checked");
  });

  it("fails closed instead of widening access when scoped locations cannot be resolved", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    mocks.serviceRpc.mockResolvedValueOnce({
      data: [
        {
          user_id: userId,
          workspace_id: workspaceId,
          workspace_name: "Scoped Bistro",
          membership_id: membershipId,
          workspace_role: "manager",
          permission_keys: ["workspace.read", "employees.read"],
          all_locations: false,
          onboarding_status: "complete",
          onboarding_current_step: 4,
          onboarding_revision: 1,
        },
      ],
      error: null,
    });
    mocks.serviceEq.mockResolvedValueOnce({
      data: null,
      error: {
        message: "permission denied for table membership_location_scopes",
      },
    });

    const resolver = createSupabaseWorkspaceContextResolver({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
    });

    await expect(resolver.resolve("valid-token", workspaceId)).rejects.toThrow(
      "Location scope resolution failed: permission denied for table membership_location_scopes",
    );
  });
});

describe("resolveWorkspaceAuthorization", () => {
  const context: ActiveWorkspaceContext = {
    userId,
    workspace: {
      id: workspaceId,
      name: "Draft Bistro",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: {
      id: "30000000-0000-4000-8000-000000000001",
      userId,
      workspaceId,
      role: "owner",
      status: "active",
      allLocations: true,
    },
    permissions: ["workspace.manage"],
    onboarding: { status: "incomplete", currentStep: 2, revision: 1 },
    locationScope: { allLocations: true, locationIds: [] },
  };

  it("blocks incomplete owner onboarding contexts unless the route opts in", async () => {
    const resolver = { resolve: vi.fn(async () => context) };

    await expect(
      resolveWorkspaceAuthorization({
        authorization: "Bearer valid-token",
        workspaceId,
        permission: "workspace.manage",
        resolver,
      }),
    ).resolves.toEqual({ context: null, denied: "workspace_not_found" });

    await expect(
      resolveWorkspaceAuthorization({
        authorization: "Bearer valid-token",
        workspaceId,
        permission: "workspace.manage",
        resolver,
        allowIncompleteOnboarding: true,
      }),
    ).resolves.toEqual({ context, denied: null });
  });

  it("fails closed when a resolver returns a different workspace than the route", async () => {
    const completeContext: ActiveWorkspaceContext = {
      ...context,
      workspace: { ...context.workspace, id: otherWorkspaceId },
      membership: { ...context.membership, workspaceId: otherWorkspaceId },
      onboarding: { status: "complete", currentStep: 4, revision: 1 },
    };
    const resolver = { resolve: vi.fn(async () => completeContext) };

    await expect(
      resolveWorkspaceAuthorization({
        authorization: "Bearer valid-token",
        workspaceId,
        permission: "workspace.manage",
        resolver,
      }),
    ).resolves.toEqual({ context: null, denied: "workspace_not_found" });
  });

  it("fails closed for any-permission and membership-only checks when the resolver returns another workspace", async () => {
    const completeContext: ActiveWorkspaceContext = {
      ...context,
      workspace: { ...context.workspace, id: otherWorkspaceId },
      membership: { ...context.membership, workspaceId: otherWorkspaceId },
      onboarding: { status: "complete", currentStep: 4, revision: 1 },
    };
    const resolver = { resolve: vi.fn(async () => completeContext) };

    await expect(
      resolveWorkspaceAnyPermissionAuthorization({
        authorization: "Bearer valid-token",
        workspaceId,
        anyOf: ["workspace.manage", "employees.read"],
        resolver,
      }),
    ).resolves.toEqual({ context: null, denied: "workspace_not_found" });

    await expect(
      resolveWorkspaceMembership({
        authorization: "Bearer valid-token",
        workspaceId,
        resolver,
      }),
    ).resolves.toEqual({ context: null, denied: "workspace_not_found" });
  });

  it("keeps pending and suspended memberships out of normal workspace routes", async () => {
    for (const status of ["pending_activation", "suspended"] as const) {
      const resolver = {
        resolve: vi.fn(
          async () =>
            ({
              ...context,
              membership: { ...context.membership, status },
              onboarding: { status: "complete", currentStep: 4, revision: 1 },
            }) as unknown as ActiveWorkspaceContext,
        ),
      };

      await expect(
        resolveWorkspaceAuthorization({
          authorization: "Bearer valid-token",
          workspaceId,
          permission: "workspace.manage",
          resolver,
        }),
      ).resolves.toEqual({ context: null, denied: "workspace_not_found" });
    }
  });
});

describe("concurrent workspace identity verification", () => {
  const resolver = () =>
    createSupabaseWorkspaceContextResolver({
      url: "https://example.supabase.co",
      anonKey: "anon",
      serviceRoleKey: "service-role",
    });
  it("shares only pending identity reads while checking every workspace independently", async () => {
    let release!: (value: unknown) => void;
    mocks.authGetUser.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    mocks.serviceRpc.mockResolvedValue({ data: [], error: null });
    const instance = resolver();
    const reads = Array.from({ length: 10 }, (_, i) =>
      instance.resolve("same-token", i % 2 ? workspaceId : otherWorkspaceId),
    );
    expect(mocks.authGetUser).toHaveBeenCalledTimes(1);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
    release({ data: { user: { id: userId } }, error: null });
    await expect(Promise.all(reads)).resolves.toEqual(Array(10).fill(null));
    const checks = mocks.serviceRpc.mock.calls.filter(
      ([name]) => name === "resolve_workspace_context_service",
    );
    expect(checks).toHaveLength(10);
    expect(
      checks.filter(([, args]) => args.target_workspace_id === workspaceId),
    ).toHaveLength(5);
    expect(
      checks.filter(
        ([, args]) => args.target_workspace_id === otherWorkspaceId,
      ),
    ).toHaveLength(5);
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401 },
    });
    await expect(
      instance.resolve("same-token", workspaceId),
    ).resolves.toBeNull();
    expect(mocks.authGetUser).toHaveBeenCalledTimes(2);
    expect(
      mocks.serviceRpc.mock.calls.filter(
        ([name]) => name === "resolve_workspace_context_service",
      ),
    ).toHaveLength(10);
  });
  it("never shares an identity request between different tokens", async () => {
    mocks.authGetUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401 },
    });
    const instance = resolver();
    await Promise.all([
      instance.resolve("token-a"),
      instance.resolve("token-b"),
    ]);
    expect(mocks.authGetUser.mock.calls).toEqual([["token-a"], ["token-b"]]);
  });
  it.each([
    { status: 500 },
    { status: 429 },
    { name: "AuthRetryableFetchError" },
  ])(
    "reports transient auth failure as unavailable, then verifies afresh: %j",
    async (error) => {
      mocks.authGetUser.mockResolvedValueOnce({ data: { user: null }, error });
      const instance = resolver();
      await expect(
        instance.resolve("same-token", workspaceId),
      ).rejects.toMatchObject({ statusCode: 503 });
      expect(mocks.serviceRpc).not.toHaveBeenCalled();
      mocks.authGetUser.mockResolvedValueOnce({
        data: { user: { id: userId } },
        error: null,
      });
      mocks.serviceRpc.mockResolvedValue({ data: [], error: null });
      await expect(instance.resolve("same-token")).resolves.toBeNull();
      expect(mocks.authGetUser).toHaveBeenCalledTimes(2);
      expect(mocks.serviceRpc).toHaveBeenCalledTimes(1);
    },
  );
  it("clears rejected network requests without caching the failure", async () => {
    mocks.authGetUser.mockRejectedValueOnce(new Error("network unavailable"));
    const instance = resolver();
    await expect(instance.resolve("same-token")).rejects.toThrow(
      "network unavailable",
    );
    mocks.authGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 401 },
    });
    await expect(instance.resolve("same-token")).resolves.toBeNull();
    expect(mocks.authGetUser).toHaveBeenCalledTimes(2);
  });
});
