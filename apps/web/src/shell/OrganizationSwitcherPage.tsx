import type { ActiveWorkspaceContext, WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  appLandingPath,
  workspaceLandingPathForRole,
} from "../auth/routeDestinations";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import {
  listAccountWorkspaces,
  selectActiveWorkspace,
  supabaseClient,
} from "../lib/supabase";

export default function OrganizationSwitcherPage() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [activatingWorkspaceId, setActivatingWorkspaceId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseClient) {
      setWorkspaces(context ? [workspaceSummaryFromContext(context)] : []);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const items = await listAccountWorkspaces(supabaseClient);
        if (active) setWorkspaces(items);
      } catch (loadError: unknown) {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Organizations could not be loaded",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [context]);

  const openWorkspace = async (workspace: WorkspaceSummary): Promise<void> => {
    if (workspace.status === "pending") {
      navigate(`/organization-switcher/pending/${workspace.id}`, {
        replace: true,
      });
      return;
    }
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
    setError(null);
    try {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      await selectActiveWorkspace(supabaseClient, workspace.id);
      const resolvedContext = await refresh();
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      navigate(appLandingPath(resolvedContext), { replace: true });
    } catch (activationError: unknown) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Organization could not be opened",
      );
    } finally {
      setActivatingWorkspaceId(null);
    }
  };

  if (workspaces?.length === 0) {
    return <Navigate to="/no-organization" replace />;
  }

  return (
    <main className="sign-in-page">
      <section
        className="sign-in-panel"
        aria-busy={loading}
        aria-labelledby="organization-switcher-title"
      >
        <p className="product-mark">NEWFORK</p>
        <h1 id="organization-switcher-title">Choose organization</h1>
        <p className="muted">
          Select the organization you want to work in. Pending or suspended
          organizations open a limited status view.
        </p>

        {loading ? (
          <p className="settings-state" role="status">
            Loading organizations...
          </p>
        ) : null}

        <div
          className="workspace-list"
          role="list"
          aria-label="Organizations"
        >
          {(workspaces ?? []).map((workspace) => {
            const activating = activatingWorkspaceId === workspace.id;
            const status = workspace.status;
            const isOpenable = status === "active";
            return (
              <div
                className="workspace-row"
                key={workspace.id}
                data-active={isOpenable && workspace.isActive}
                role="listitem"
              >
                <div>
                  <strong>{workspace.name}</strong>
                  <span>{workspaceStatusLabel(workspace)}</span>
                </div>
                <Button
                  className={
                    isOpenable && workspace.isActive
                      ? "secondary-button compact-button active-workspace"
                      : "secondary-button compact-button"
                  }
                  type="button"
                  aria-label={
                    isOpenable
                      ? `Open ${workspace.name}`
                      : `View status for ${workspace.name}`
                  }
                  disabled={activating}
                  onClick={() => openWorkspace(workspace)}
                >
                  {isOpenable && workspace.isActive ? (
                    <Check size={15} aria-hidden />
                  ) : null}
                  {activating ? "Opening" : isOpenable ? "Open" : "View status"}
                </Button>
              </div>
            );
          })}
        </div>

        <Link className="text-button" to="/account/workspaces">
          Manage account workspaces
        </Link>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
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

function workspaceStatusLabel(workspace: WorkspaceSummary): string {
  if (workspace.status === "pending") return `${workspace.role} · pending`;
  if (workspace.status === "suspended") return `${workspace.role} · suspended`;
  return workspace.role;
}
