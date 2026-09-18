import { useQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
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
import {
  PreBizFrame,
  Section,
  useDevShellVariant,
} from "../shell/prebiz/PreBiz";
import { listPendingEmployeeInvitations } from "./employee-data";
import { InvitationRow } from "./InvitationRow";
import { UnfinishedSetupRow } from "./UnfinishedSetupRow";

/**
 * Where every sign-in lands. It shows the decisions the account still owes —
 * invitations and unfinished setups — and forwards on when there are none.
 */
export default function PendingInvitationsPage() {
  const { context, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const shell = useDevShellVariant();
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
      return <main className="auth-loading" aria-label="Loading workspace" />;
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

  if (shell) {
    const loading = invitations.isLoading || workspaces.isLoading;
    return (
      <PreBizFrame
        variant={shell}
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
              ? deferPath
                ? "Join now or decide later. Declining can't be undone."
                : "Declining can't be undone."
              : "Your progress is saved."
        }
      >
        {invitations.error ? (
          <p className="form-error" role="alert">
            {invitations.error instanceof Error
              ? invitations.error.message
              : "Invitations could not be loaded"}
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
        {!loading && pending.length === 0 && !employerDraft ? (
          <div className="pb-section">
            <h2>Your own business</h2>
            <CreateOrganizationButton
              className="pb-btn pb-btn-secondary pb-btn-block"
              label="Create your business"
            />
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

  return (
    <main className="sign-in-page">
      <section className="sign-in-panel" aria-labelledby="pending-invites-title">
        <p className="product-mark">NEWFORK</p>
        <KeyRound size={28} aria-hidden />
        <h1 id="pending-invites-title">
          {inviteOnly ? "Active invitation found" : "Continue where you left off"}
        </h1>
        <p className="muted">
          {inviteOnly
            ? deferPath
              ? "You have been invited to join another organization. Join now or decide later. Declining cannot be undone."
              : "Join the organization that invited you. Declining cannot be undone."
            : "Pick up an unfinished setup, answer an invitation, or start your own organization."}
        </p>

        {invitations.isLoading || workspaces.isLoading ? (
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
          {pending.map((invitation) => (
            <InvitationRow key={invitation.id} invitation={invitation} />
          ))}
          {unfinished.map((workspace) => (
            <UnfinishedSetupRow key={workspace.id} workspace={workspace} />
          ))}
        </div>

        {/*
          An open invitation is the account's to answer before it owns a
          workspace, and an existing draft is already offered by its own row.
        */}
        {pending.length === 0 && !employerDraft ? (
          <CreateOrganizationButton className="secondary" />
        ) : null}

        {deferPath ? (
          <Link
            className="text-button"
            to={deferPath}
            replace
            onClick={() =>
              window.sessionStorage.setItem(invitationsCheckedStorageKey, "1")
            }
          >
            Not now
          </Link>
        ) : null}
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
