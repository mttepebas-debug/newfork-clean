import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useEffect } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { appLandingPath } from "../auth/routeDestinations";
import {
  invitationsCheckedStorageKey,
  listAccountWorkspaces,
  supabaseClient,
} from "../lib/supabase";
import { listPendingEmployeeInvitations } from "./employee-data";
import { InvitationRow } from "./InvitationRow";

export default function PendingInvitationsPage() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const invitations = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
  });
  const noInvitations = invitations.isSuccess && invitations.data.length === 0;
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
    enabled: noInvitations,
  });
  const activeCount =
    noInvitations && workspaces.isSuccess
      ? workspaces.data.filter((workspace) => workspace.status === "active")
          .length
      : null;

  // Nothing left to decide and exactly one organization: land in it.
  useEffect(() => {
    if (activeCount !== 1) return;
    let live = true;
    void refresh().then((resolved) => {
      if (live) navigate(appLandingPath(resolved), { replace: true });
    });
    return () => {
      live = false;
    };
  }, [activeCount, navigate, refresh]);

  if (noInvitations && (workspaces.isSuccess || workspaces.error)) {
    if (activeCount === 1)
      return <main className="auth-loading" aria-label="Loading workspace" />;
    if (
      activeCount === 0 &&
      workspaces.data?.some((workspace) => workspace.status === "pending")
    )
      return <Navigate to="/welcome" replace />;
    if (workspaces.data?.length === 0)
      return <Navigate to="/no-organization" replace />;
    return <Navigate to="/organization-switcher" replace />;
  }

  return (
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="pending-invites-title">
        <p className="product-mark">NEWFORK</p>
        <KeyRound size={28} aria-hidden />
        <h1 id="pending-invites-title">Active invitation found</h1>
        <p className="muted">
          {context
            ? "You have been invited to join another organization. Join now or decide later. Declining cannot be undone."
            : "Join the organization that invited you. Declining cannot be undone."}
        </p>

        {invitations.isLoading ? (
          <p className="settings-state" role="status">
            Loading invitations...
          </p>
        ) : null}
        {invitations.error ? (
          <p className="form-error" role="alert">
            {invitations.error instanceof Error
              ? invitations.error.message
              : "Pending invitations could not be loaded"}
          </p>
        ) : null}

        <div className="workspace-list" role="list" aria-label="Invitations">
          {(invitations.data ?? []).map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} />
          ))}
        </div>

        {context ? (
          <Link
            className="text-button"
            to={appLandingPath(context)}
            replace
            onClick={() =>
              window.sessionStorage.setItem(invitationsCheckedStorageKey, "1")
            }
          >
            Not now
          </Link>
        ) : null}
      </section>
    </main>
  );
}
