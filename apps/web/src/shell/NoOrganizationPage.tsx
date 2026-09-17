import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { Building2, MailCheck } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { listPendingEmployeeInvitations } from "../employees/employee-data";

export default function NoOrganizationPage() {
  const { account, signOut } = useAuth();
  const [waiting, setWaiting] = useState(false);
  const invitations = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
    enabled: waiting,
  });

  if (waiting && (invitations.data?.length ?? 0) > 0)
    return <Navigate to="/invitations/pending" replace />;

  if (waiting) {
    return (
      <main className="sign-in-page">
        <section className="sign-in-panel" aria-labelledby="no-org-title">
          <p className="product-mark">NEWFORK</p>
          <MailCheck size={28} aria-hidden />
          <h1 id="no-org-title">Waiting for an invitation</h1>
          <p className="muted">
            No pending invitation for {account?.email ?? "this account"}. Ask
            your manager to invite this address, or sign in with the email
            address the invitation was sent to.
          </p>
          {invitations.error ? (
            <p className="form-error" role="alert">
              {invitations.error instanceof Error
                ? invitations.error.message
                : "Pending invitations could not be loaded"}
            </p>
          ) : null}
          <div className="auth-recovery-actions">
            <Button
              type="button"
              disabled={invitations.isFetching}
              onClick={() => void invitations.refetch()}
            >
              {invitations.isFetching ? "Checking" : "Check again"}
            </Button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void signOut()}
            >
              Switch account
            </button>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => setWaiting(false)}
          >
            Back
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="no-org-title">
        <p className="product-mark">NEWFORK</p>
        <Building2 size={28} aria-hidden />
        <h1 id="no-org-title">No organization found</h1>
        <p className="muted">
          This account is not connected to an active or pending organization.
          You can create a business organization or wait for a new invitation.
        </p>
        <Link className="nf-button" to="/account/workspaces" state={{ openCreate: true }}>
          Create your business organization
        </Link>
        <Button
          className="secondary"
          type="button"
          onClick={() => setWaiting(true)}
        >
          <MailCheck size={16} aria-hidden />
          I'm waiting for another invitation
        </Button>
      </section>
    </main>
  );
}
