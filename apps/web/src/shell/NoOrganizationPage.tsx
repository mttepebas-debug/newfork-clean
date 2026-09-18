import { useQuery } from "@tanstack/react-query";
import { Button } from "@newfork/ui";
import { Building2, MailCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { accountLandingPath } from "../auth/routeDestinations";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { loadAccountEverLinked, supabaseClient } from "../lib/supabase";
import { CreateOrganizationButton } from "./CreateOrganizationButton";

/**
 * The account has nothing open and belongs nowhere. A first visitor is welcomed
 * and asked what it came for; one that has lost its organizations is not
 * welcomed again.
 */
export default function NoOrganizationPage() {
  const { account, signOut } = useAuth();
  const location = useLocation();
  // Arriving straight from an answered invitation: the check already happened.
  const [waiting, setWaiting] = useState(
    () =>
      (location.state as { invitationsChecked?: boolean } | null)
        ?.invitationsChecked === true,
  );
  const everLinked = useQuery({
    queryKey: ["account-ever-linked"],
    queryFn: () =>
      supabaseClient ? loadAccountEverLinked(supabaseClient) : false,
    staleTime: Infinity,
  });
  const invitations = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
    enabled: waiting,
  });

  if (waiting && (invitations.data?.length ?? 0) > 0)
    return <Navigate to={accountLandingPath} replace />;

  // Never claim "no invitation" before the check has answered.
  if (waiting && invitations.isLoading)
    return <main className="auth-loading" aria-label="Checking invitations" />;

  // Unknown history reads as returning: welcoming someone twice is the worse miss.
  const returning = everLinked.data !== false;

  if (waiting) {
    return (
      <main className="sign-in-page">
        <section className="sign-in-panel" aria-labelledby="no-org-title">
          <p className="product-mark">NEWFORK</p>
          <MailCheck size={28} aria-hidden />
          <h1 id="no-org-title">No invitation found</h1>
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
          <CreateOrganizationButton />
          <div className="auth-recovery-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={invitations.isFetching}
              onClick={() => void invitations.refetch()}
            >
              {invitations.isFetching ? "Checking" : "Check again"}
            </button>
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
        <h1 id="no-org-title">
          {returning ? "Welcome back" : "Welcome to Newfork"}
        </h1>
        <p className="muted">
          {returning
            ? "This account is not connected to an active or pending organization. You can create a business organization or wait for a new invitation."
            : "Tell us what brings you here. Set up your own business organization, or join the one that invited you."}
        </p>
        <CreateOrganizationButton />
        <Button
          className="secondary"
          type="button"
          onClick={() => setWaiting(true)}
        >
          <MailCheck size={16} aria-hidden />
          {returning
            ? "I'm waiting for another invitation"
            : "I have an invite for a workspace"}
        </Button>
        <button
          className="text-button"
          type="button"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
