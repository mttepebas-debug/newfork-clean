import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clearTenantQueriesForOrganizationSwitch,
  isTenantScopedQueryKey,
} from "./tenant-query-cache";

describe("tenant query cache", () => {
  it("classifies tenant scoped query keys", () => {
    expect(isTenantScopedQueryKey(["workspace-dashboard", "org-a"])).toBe(true);
    expect(isTenantScopedQueryKey(["schedule-read", "org-a"])).toBe(true);
    expect(isTenantScopedQueryKey(["employees", "org-a"])).toBe(true);
    expect(isTenantScopedQueryKey(["organization-locations", "org-a"])).toBe(
      true,
    );
    expect(isTenantScopedQueryKey(["document-types", "org-a"])).toBe(true);
    expect(isTenantScopedQueryKey(["my-onboarding-phone", "org-a", "+14155550100"])).toBe(true);
    // AVATAR-IKON: one's avatar belongs to a workspace.
    expect(isTenantScopedQueryKey(["own-avatar", "org-a"])).toBe(true);
    expect(isTenantScopedQueryKey(["last-avatar", "org-a"])).toBe(true);
    expect(isTenantScopedQueryKey(["account-profile"])).toBe(false);
    expect(isTenantScopedQueryKey(["account-workspaces"])).toBe(false);
    expect(isTenantScopedQueryKey(["account-pending-invitations"])).toBe(false);
    expect(isTenantScopedQueryKey(["invitation-preview", "token"])).toBe(false);
  });

  it("removes tenant scoped cache without clearing account-level data", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["workspace-dashboard", "org-a"], {
      name: "Org A",
    });
    queryClient.setQueryData(["schedule-read", "org-a", "2026-09-05"], []);
    queryClient.setQueryData(
      ["employee-personal-tasks", "org-a", "user-a"],
      [{ id: "private-task", title: "Personal reminder" }],
    );
    queryClient.setQueryData(
      ["organization-locations", "org-a"],
      [{ id: "location-a" }],
    );
    queryClient.setQueryData(
      ["document-types", "org-a"],
      [{ id: "document-type-a" }],
    );
    queryClient.setQueryData(["shift-exchanges", "org-a", "preview", "case", "candidate"], { private_note: "Manager only" });
    queryClient.setQueryData(["account-profile"], { email: "user@test.dev" });
    queryClient.setQueryData(["account-workspaces"], [{ id: "org-a" }]);
    queryClient.setQueryData(
      ["account-pending-invitations"],
      [{ id: "invite-a" }],
    );

    await clearTenantQueriesForOrganizationSwitch(queryClient);
    expect(queryClient.getQueryData(["shift-exchanges", "org-a", "preview", "case", "candidate"])).toBeUndefined();
    expect(
      queryClient.getQueryData(["employee-personal-tasks", "org-a", "user-a"]),
    ).toBeUndefined();

    expect(
      queryClient.getQueryData(["workspace-dashboard", "org-a"]),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(["schedule-read", "org-a", "2026-09-05"]),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(["organization-locations", "org-a"]),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(["document-types", "org-a"]),
    ).toBeUndefined();
    expect(queryClient.getQueryData(["account-profile"])).toEqual({
      email: "user@test.dev",
    });
    expect(queryClient.getQueryData(["account-workspaces"])).toEqual([
      { id: "org-a" },
    ]);
    expect(queryClient.getQueryData(["account-pending-invitations"])).toEqual([
      { id: "invite-a" },
    ]);
  });
});
