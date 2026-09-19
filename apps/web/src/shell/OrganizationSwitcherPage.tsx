import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  appLandingPath,
  unfinishedWorkspaces,
  workspaceLandingPathForRole,
} from "../auth/routeDestinations";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { InvitationRow } from "../employees/InvitationRow";
import { UnfinishedSetupRow } from "../employees/UnfinishedSetupRow";
import {
  listAccountWorkspaces,
  selectActiveWorkspace,
  supabaseClient,
} from "../lib/supabase";
import {
  BusinessRow,
  PreBizFrame,
  Section,
  StatusBadge,
  roleLabel,
} from "./prebiz/PreBiz";

export default function OrganizationSwitcherPage() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspacesQuery = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
    enabled: supabaseClient !== null,
  });
  const invitationsQuery = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
    enabled: supabaseClient !== null,
  });
  const workspaces: WorkspaceSummary[] | null = supabaseClient
    ? (workspacesQuery.data ?? null)
    : context
      ? [workspaceSummaryFromContext(context)]
      : [];
  // Invitations are an addition here; a failed load never blocks the list.
  const invitations = invitationsQuery.data ?? [];
  const loading = workspacesQuery.isLoading || invitationsQuery.isLoading;
  const loadError = workspaces === null && workspacesQuery.isError;
  const [activatingWorkspaceId, setActivatingWorkspaceId] = useState<
    string | null
  >(null);
  const [failedWorkspaceId, setFailedWorkspaceId] = useState<string | null>(
    null,
  );

  // Pending and draft businesses never get here: their own row continues them.
  const openWorkspace = async (workspace: WorkspaceSummary): Promise<void> => {
    if (workspace.status === "suspended") {
      navigate(`/organization-switcher/suspended/${workspace.id}`, {
        replace: true,
      });
      return;
    }
    if (!supabaseClient) {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      navigate(workspaceLandingPathForRole(workspace.role), { replace: true });
      return;
    }
    setActivatingWorkspaceId(workspace.id);
    setFailedWorkspaceId(null);
    try {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      await selectActiveWorkspace(supabaseClient, workspace.id);
      const resolvedContext = await refresh();
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      navigate(appLandingPath(resolvedContext), { replace: true });
    } catch {
      // The server's own message is not for the screen; the row says it plainly.
      setFailedWorkspaceId(workspace.id);
    } finally {
      setActivatingWorkspaceId(null);
    }
  };

  if (loadError) {
    return (
      <PreBizFrame
        titleId="organization-switcher-title"
        title="Your businesses didn't load"
      >
        <p className="form-error" role="alert">
          Your businesses could not be loaded
        </p>
        <div className="pb-footer">
          <Button
            className="pb-btn pb-btn-primary"
            onClick={() => void workspacesQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      </PreBizFrame>
    );
  }

  if (workspaces?.length === 0 && !loading && invitations.length === 0) {
    return <Navigate to="/no-organization" replace />;
  }

  // A setup somebody still has to finish is not a business to open yet. The
  // rest is what the account can work in, plus the suspended ones.
  const unfinished = unfinishedWorkspaces(workspaces ?? []);
  const businesses = (workspaces ?? []).filter(
    (workspace) => !unfinished.includes(workspace),
  );

  return (
    <PreBizFrame
      titleId="organization-switcher-title"
      title={loading ? "Loading your businesses" : "Choose a business"}
    >
      {invitations.length > 0 ? (
        <Section title="Invitations">
          {invitations.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} />
          ))}
        </Section>
      ) : null}
      {unfinished.length > 0 ? (
        <Section title="In progress">
          {unfinished.map((workspace) => (
            <UnfinishedSetupRow key={workspace.id} workspace={workspace} />
          ))}
        </Section>
      ) : null}
      {businesses.length > 0 ? (
        <Section title="Your businesses">
          {businesses.map((workspace) => {
            const suspended = workspace.status === "suspended";
            const activating = activatingWorkspaceId === workspace.id;
            // The business this tab works in. `isActive` is the saved default,
            // which can be a different one.
            const current =
              !suspended && context?.workspace.id === workspace.id;
            return (
              <BusinessRow
                key={workspace.id}
                name={workspace.name}
                role={roleLabel[workspace.role]}
                current={current}
                badge={
                  suspended ? (
                    <StatusBadge tone="danger">Suspended</StatusBadge>
                  ) : current ? (
                    <StatusBadge tone="success">Current</StatusBadge>
                  ) : undefined
                }
                error={
                  failedWorkspaceId === workspace.id
                    ? "This business could not be opened"
                    : null
                }
              >
                <Button
                  className={
                    suspended
                      ? "pb-btn pb-btn-secondary"
                      : "pb-btn pb-btn-primary"
                  }
                  aria-label={
                    suspended
                      ? `View status for ${workspace.name}`
                      : `Open ${workspace.name}`
                  }
                  disabled={activating}
                  onClick={() => openWorkspace(workspace)}
                >
                  {suspended ? "View status" : activating ? "Opening" : "Open"}
                </Button>
              </BusinessRow>
            );
          })}
        </Section>
      ) : null}
      <div className="pb-footer">
        <Link className="pb-btn pb-btn-secondary" to="/account/workspaces">
          Manage your businesses
        </Link>
      </div>
    </PreBizFrame>
  );
}

function workspaceSummaryFromContext(
  context: ActiveWorkspaceContext,
): WorkspaceSummary {
  return {
    id: context.workspace.id,
    name: context.workspace.name,
    role: context.membership.role,
    status: "active",
    isActive: true,
    onboarding: context.onboarding,
  };
}
