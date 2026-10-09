import type { OwnerLegalName, WorkspaceSummary } from "@newfork/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOwnLegalName,
  listAccountWorkspaces,
  saveOwnLegalName,
  supabaseClient,
} from "../lib/supabase";
import { RequestError } from "../lib/request-error";

/** Every workspace this account is in; the key the account area already shares. */
export const accountWorkspacesKey = ["account-workspaces"] as const;
export const ownLegalNameKey = (workspaceId: string) =>
  ["account-legal-name", workspaceId] as const;

export function useAccountWorkspaces() {
  return useQuery({
    queryKey: accountWorkspacesKey,
    queryFn: (): Promise<WorkspaceSummary[]> | WorkspaceSummary[] =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });
}

/**
 * Where this account is the owner. Only there does a legal name of theirs
 * belong in the account area; the database says no everywhere else anyway
 * (workspace.setup, owner only), this only decides what to show.
 */
export function ownedWorkspaces(
  workspaces: readonly WorkspaceSummary[] | undefined,
): WorkspaceSummary[] {
  return (workspaces ?? []).filter(
    (workspace) => workspace.role === "owner" && workspace.status === "active",
  );
}

/**
 * A record whose person has not finished onboarding has no private record yet,
 * so the database refuses a contact on it. "pending" is the one signal the
 * account area has for that.
 */
export function onboardingUnfinished(
  workspaces: readonly WorkspaceSummary[] | undefined,
  workspaceId: string,
): boolean {
  return (
    (workspaces ?? []).find((workspace) => workspace.id === workspaceId)
      ?.status === "pending"
  );
}

export function useOwnLegalName(workspaceId: string) {
  return useQuery({
    queryKey: ownLegalNameKey(workspaceId),
    queryFn: () =>
      supabaseClient ? getOwnLegalName(supabaseClient, workspaceId) : null,
  });
}

export function useSaveOwnLegalName(workspaceId: string) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (name: OwnerLegalName) => {
      if (!supabaseClient) throw new Error("Newfork is not configured");
      await saveOwnLegalName(supabaseClient, workspaceId, name);
    },
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ownLegalNameKey(workspaceId) }),
  });
}

/** The sentence a refused save shows. Keyed on the reason, never the wording. */
export function legalNameErrorMessage(error: unknown): string {
  if (error instanceof RequestError) {
    if (error.reason === "authz.owner_only")
      return "Only the owner can change this legal name.";
    if (error.reason === "authz.workspace_closed")
      return "This has been closed, so its records can no longer be changed.";
    // A 400 is the name itself: the database says what is wrong with it.
    if (error.status === 400 && error.message)
      return error.message.charAt(0).toUpperCase() + error.message.slice(1);
  }
  return "That could not be saved. Try again.";
}
