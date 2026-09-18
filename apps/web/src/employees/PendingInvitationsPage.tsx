import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  appLandingPath,
  deferredLandingPath,
  organizationSwitcherPath,
  noOrganizationPath,
  readyWorkspaces,
  unfinishedWorkspaces,
} from "../auth/routeDestinations";
import {
  invitationsCheckedStorageKey,
  listAccountWorkspaces,
  supabaseClient,
} from "../lib/supabase";
import { CreateOrganizationButton } from "../shell/CreateOrganizationButton";
import { PreBizFrame, Section } from "../shell/prebiz/PreBiz";
import { listPendingEmployeeInvitations } from "./employee-data";
import { InvitationRow } from "./InvitationRow";
import { UnfinishedSetupRow } from "./UnfinishedSetupRow";

/**
 * Where every sign-in lands. It shows the decisions the account still owes —
 * invitations and unfinished setups — and forwards on when there are none.
 */
export default function PendingInvitationsPage() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const invitations = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
  });
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });

  const workspaceList = workspaces.data ?? [];
  const pending = invitations.data ?? [];
  const unfinished = unfinishedWorkspaces(workspaceList);
  const ready = readyWorkspaces(workspaceList);
  // A cached empty list must not forward the account before the refresh lands.
  const settled =
    (invitations.isSuccess || invitations.isError) &&
    (workspaces.isSuccess || workspaces.isError) &&
    !invitations.isFetching &&
    !workspaces.isFetching;
  const nothingOpen = settled && pending.length === 0 && unfinished.length === 0;
  // An account that can work elsewhere, or is mid-onboarding elsewhere, may
  // postpone the decision.
  const deferPath = deferredLandingPath(context, workspaceList);
  const employerDraft =
    unfinished.find((workspace) => workspace.status === "active") ?? null;
  const answeredInvitations = useRef(false);
  if (pending.length > 0) answeredInvitations.current = true;

  // Nothing left to decide and exactly one organization: land in it.
  const landInOnly = nothingOpen && ready.length === 1;
  useEffect(() => {
    if (!landInOnly) return;
    let live = true;
    void refresh().then((resolved) => {
      if (live) navigate(appLandingPath(resolved), { replace: true });
    });
    return () => {
      live = false;
    };
  }, [landInOnly, navigate, refresh]);

  if (nothingOpen) {
    if (ready.length === 1)
      // Still inside the frame while it lands, so the way out stays on screen.
      return (
        <PreBizFrame
          titleId="pending-invites-title"
          title="Checking your account"
        />
      );
    if (ready.length === 0)
      return (
        <Navigate
          to={noOrganizationPath}
          replace
          // Answering the last invitation is an answer: do not ask again.
          state={{ invitationsChecked: answeredInvitations.current }}
        />
      );
    return <Navigate to={organizationSwitcherPath} replace />;
  }

  const inviteOnly = unfinished.length === 0;

  // Past the redirects above, two empty lists mean a refetch is still in flight.
  const loading =
    invitations.isLoading ||
    workspaces.isLoading ||
    (pending.length === 0 && unfinished.length === 0);
  return (
    <PreBizFrame
      titleId="pending-invites-title"
      // The heading only claims what the lists below actually show.
      title={
        loading
          ? "Checking your account"
          : inviteOnly
            ? pending.length === 1
              ? "You have an invitation"
              : `You have ${pending.length} invitations`
            : "Pick up where you left off"
      }
      description={
        loading
          ? undefined
          : inviteOnly
            ? "Declining can't be undone."
            : "Your progress is saved."
      }
    >
      {invitations.error ? (
        <p className="form-error" role="alert">
          Invitations could not be loaded
        </p>
      ) : null}
      {pending.length > 0 ? (
        <Section title="Invitations">
          {pending.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} kit />
          ))}
        </Section>
      ) : null}
      {unfinished.length > 0 ? (
        <Section title="In progress">
          {unfinished.map((workspace) => (
            <UnfinishedSetupRow key={workspace.id} workspace={workspace} kit />
          ))}
        </Section>
      ) : null}
      {/*
        An open invitation is the account's to answer before it owns a
        business, and an existing draft is already offered by its own row.
      */}
      {!loading && pending.length === 0 && !employerDraft ? (
        <div className="pb-section">
          <h2>Your own business</h2>
          <CreateOrganizationButton className="pb-btn pb-btn-secondary pb-btn-block" />
        </div>
      ) : null}
      {deferPath ? (
        <div className="pb-footer">
          <Link
            className="pb-btn pb-btn-secondary"
            to={deferPath}
            replace
            onClick={() =>
              window.sessionStorage.setItem(invitationsCheckedStorageKey, "1")
            }
          >
            Not now
          </Link>
        </div>
      ) : null}
    </PreBizFrame>
  );
}
