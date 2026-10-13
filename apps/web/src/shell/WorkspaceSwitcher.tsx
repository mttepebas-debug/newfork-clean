import type { WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  hubPath,
  readyWorkspaces,
  resolveLanding,
  unfinishedWorkspaces,
} from "../auth/resolveLanding";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import {
  listAccountWorkspaces,
  selectActiveWorkspace,
  supabaseClient,
} from "../lib/supabase";
import { requestAppNavigation } from "./leave-guard";
import { roleLabel } from "./prebiz/PreBiz";

/**
 * Where the account is, and where else it could be: the sidebar row above
 * Settings (Mert 2026-10-13). It is a control even with one workspace, so the
 * place to switch is always in the same spot; the menu opens upwards from the
 * row, or to the right of the collapsed rail. An invitation waiting for an
 * answer is listed here too; its count stays on the Account row below.
 */
export function WorkspaceSwitcher({
  workspaceName,
  collapsed,
}: {
  readonly workspaceName: string;
  readonly collapsed: boolean;
}) {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const workspacesQuery = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });
  const invitationsQuery = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
  });

  const workspaces = workspacesQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const ready = readyWorkspaces(workspaces);
  const unfinished = unfinishedWorkspaces(workspaces);
  const elsewhere = [...ready, ...unfinished].filter(
    (workspace) => workspace.id !== context?.workspace.id,
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent): void => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const switchTo = async (workspace: WorkspaceSummary): Promise<void> => {
    setSwitchingId(workspace.id);
    try {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      if (supabaseClient)
        await selectActiveWorkspace(supabaseClient, workspace.id);
      const resolved = await refresh();
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      setOpen(false);
      navigate(
        resolveLanding({ workspaces: [workspace], context: resolved }).path,
        { replace: true },
      );
    } catch {
      // The hub can say what went wrong and offer the rest of the list.
      setOpen(false);
      navigate(hubPath);
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="workspace-switcher" ref={container}>
      <button
        type="button"
        className={`nav-item workspace-switcher-trigger${
          collapsed ? " rail-peek-item" : ""
        }`}
        aria-label={`${workspaceName}, switch workspace`}
        aria-expanded={open}
        aria-haspopup="menu"
        data-rail-peek={collapsed ? "" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="nav-icon-frame">
          <span className="workspace-switcher-tile" aria-hidden>
            {workspaceName.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <span className={collapsed ? "rail-flyout" : "workspace-name"}>
          {workspaceName}
        </span>
        {collapsed ? null : <ChevronsUpDown size={15} aria-hidden />}
      </button>
      {open ? (
        <div className="workspace-switcher-menu" role="menu">
          <p className="workspace-switcher-label">You are in</p>
          <span className="workspace-switcher-item is-current">
            <span className="workspace-switcher-text">
              <strong>{workspaceName}</strong>
              <span>
                {context ? roleLabel[context.membership.role] : "Member"}
              </span>
            </span>
            <Check size={15} aria-hidden />
          </span>

          {elsewhere.length > 0 ? (
            <>
              <p className="workspace-switcher-label">Switch to</p>
              {elsewhere.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitem"
                  className="workspace-switcher-item"
                  disabled={switchingId !== null}
                  // Unsaved work on the page is asked about before anything switches.
                  onClick={() => requestAppNavigation(() => void switchTo(workspace))}
                >
                  <span className="workspace-switcher-text">
                    <strong>{workspace.name}</strong>
                    <span>
                      {roleLabel[workspace.role]}
                      {workspace.onboarding.status === "complete"
                        ? ""
                        : " · Setup unfinished"}
                    </span>
                  </span>
                </button>
              ))}
            </>
          ) : null}

          {invitations.length > 0 ? (
            <>
              <p className="workspace-switcher-label">
                {invitations.length === 1 ? "Invitation" : "Invitations"}
              </p>
              {invitations.map((invitation) => (
                <span
                  key={invitation.id}
                  className="workspace-switcher-item is-invitation"
                >
                  <span className="workspace-switcher-text">
                    <strong>{invitation.workspaceName}</strong>
                    <span>Waiting for your answer</span>
                  </span>
                  <Button
                    className="pb-btn pb-btn-primary workspace-switcher-answer"
                    onClick={() => {
                      setOpen(false);
                      requestAppNavigation(() => navigate(hubPath));
                    }}
                  >
                    Answer
                  </Button>
                </span>
              ))}
            </>
          ) : null}

          <Link
            className="workspace-switcher-all"
            to={hubPath}
            onClick={() => setOpen(false)}
          >
            All workspaces
          </Link>
        </div>
      ) : null}
    </div>
  );
}
