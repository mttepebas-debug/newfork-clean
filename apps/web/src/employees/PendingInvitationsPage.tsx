import { Button } from "@newfork/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import {
  acceptPendingEmployeeInvitation,
  declinePendingEmployeeInvitation,
  listPendingEmployeeInvitations,
} from "./employee-data";

export default function PendingInvitationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
  });
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
    enabled: invitations.isSuccess && invitations.data.length === 0,
  });
  const accept = useMutation({
    mutationFn: acceptPendingEmployeeInvitation,
    onSuccess: () => navigate("/welcome", { replace: true }),
  });
  const decline = useMutation({
    mutationFn: declinePendingEmployeeInvitation,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["account-pending-invitations"],
      }),
  });

  if (
    invitations.isSuccess &&
    invitations.data.length === 0 &&
    workspaces.isSuccess &&
    workspaces.data.some((workspace) => workspace.status === "pending")
  ) {
    return <Navigate to="/welcome" replace />;
  }

  if (
    invitations.isSuccess &&
    invitations.data.length === 0 &&
    (workspaces.isSuccess || workspaces.error)
  ) {
    if (workspaces.isSuccess && workspaces.data.length === 0) {
      return <Navigate to="/no-organization" replace />;
    }
    return <Navigate to="/organization-switcher" replace />;
  }

  return (
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="pending-invites-title">
        <p className="product-mark">NEWFORK</p>
        <KeyRound size={28} aria-hidden />
        <h1 id="pending-invites-title">Active invitation found</h1>
        <p className="muted">
          Choose whether you want to join an invited organization or continue
          with business setup. Declining an invitation cannot be undone.
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
        {accept.error ? (
          <p className="form-error" role="alert">
            {accept.error instanceof Error
              ? accept.error.message
              : "Invitation acceptance failed"}
          </p>
        ) : null}
        {decline.error ? (
          <p className="form-error" role="alert">
            {decline.error instanceof Error
              ? decline.error.message
              : "Invitation decline failed"}
          </p>
        ) : null}

        <div className="workspace-list">
          {(invitations.data ?? []).map((invitation) => (
            <div className="workspace-row" key={invitation.id}>
              <div>
                <strong>{invitation.workspaceName}</strong>
                <span>
                  Invited at {invitation.emailHint}. Expires{" "}
                  {new Date(invitation.expiresAt).toLocaleDateString()}
                </span>
              </div>
              <div className="workspace-row-actions">
                <Button
                  type="button"
                  disabled={accept.isPending || decline.isPending}
                  onClick={() => accept.mutate(invitation.id)}
                >
                  Join
                </Button>
                <Button
                  className="secondary-button compact-button"
                  type="button"
                  disabled={accept.isPending || decline.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Declining this invitation cannot be undone. You will need a new invitation to join later.",
                      )
                    ) {
                      decline.mutate(invitation.id);
                    }
                  }}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Link className="text-button" to="/account/workspaces" state={{ openCreate: true }}>
          Start my own organization
        </Link>
      </section>
    </main>
  );
}
