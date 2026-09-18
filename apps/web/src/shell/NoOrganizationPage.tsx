import { useQuery } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  accountLandingPath,
  organizationSwitcherPath,
  readyWorkspaces,
  unfinishedWorkspaces,
} from "../auth/routeDestinations";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import {
  listAccountWorkspaces,
  loadAccountEverLinked,
  supabaseClient,
} from "../lib/supabase";
import { CreateOrganizationButton } from "./CreateOrganizationButton";
import { PreBizFrame } from "./prebiz/PreBiz";

/**
 * The account has nothing open and belongs nowhere. A first visitor is welcomed
 * and asked what it came for; one that has lost its organizations is not
 * welcomed again.
 */
export default function NoOrganizationPage() {
  const { account } = useAuth();
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
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });

  // The guard answers once, on arrival. Create refetches this list on its way
  // to onboarding, and the draft it just made must not bounce to the landing.
  const arrived = useRef(false);

  if (!arrived.current) {
    // Never claim "belongs nowhere" before the list has answered.
    if (workspaces.isLoading)
      return (
        <PreBizFrame titleId="no-org-title" title="Checking your account" />
      );
    // Reached by URL or the back button with businesses: not told to create or
    // join one. A failed list reads as empty, so the page never traps anyone.
    const workspaceList = workspaces.data ?? [];
    if (unfinishedWorkspaces(workspaceList).length > 0)
      return <Navigate to={accountLandingPath} replace />;
    if (readyWorkspaces(workspaceList).length > 0)
      return <Navigate to={organizationSwitcherPath} replace />;
    arrived.current = true;
  }

  if (waiting && (invitations.data?.length ?? 0) > 0)
    return <Navigate to={accountLandingPath} replace />;

  // Never claim "no invitation" before the check has answered.
  if (waiting && invitations.isLoading)
    // The frame stays while it checks, so Sign out never disappears.
    return (
      <PreBizFrame titleId="no-org-title" title="Checking for invitations" />
    );

  // Unknown history reads as returning: welcoming someone twice is the worse miss.
  const returning = everLinked.data !== false;

  const ownBusiness = (primary: boolean) => (
    <CreateOrganizationButton
      className={`pb-btn pb-btn-block ${primary ? "pb-btn-primary" : "pb-btn-secondary"}`}
    />
  );
  if (waiting) {
    return (
      <PreBizFrame
        titleId="no-org-title"
        title="No invitation yet"
        description={`Nothing has been sent to ${account?.email ?? "this account"} so far — ask your manager to invite this address.`}
      >
        {invitations.error ? (
          <p className="form-error" role="alert">
            Invitations could not be loaded
          </p>
        ) : null}
        <div className="pb-footer">
          <button
            className="pb-btn pb-btn-primary"
            type="button"
            disabled={invitations.isFetching}
            onClick={() => void invitations.refetch()}
          >
            {invitations.isFetching ? "Checking" : "Check again"}
          </button>
          <button
            className="pb-btn pb-btn-secondary"
            type="button"
            onClick={() => setWaiting(false)}
          >
            Back
          </button>
        </div>
        <div className="pb-section">
          <h2>Your own business</h2>
          {ownBusiness(false)}
        </div>
      </PreBizFrame>
    );
  }
  return (
    <PreBizFrame
      titleId="no-org-title"
      title={returning ? "Welcome back" : "Welcome to Newfork"}
      description="Start your own business, or join one that invited you."
    >
      <div className="pb-stack">
        {ownBusiness(true)}
        <button
          className="pb-btn pb-btn-secondary pb-btn-block"
          type="button"
          onClick={() => setWaiting(true)}
        >
          <MailCheck size={16} aria-hidden /> I have an invitation
        </button>
      </div>
    </PreBizFrame>
  );
}
