import type { WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  readyWorkspaces,
  resolveLanding,
  unfinishedWorkspaces,
} from "../auth/resolveLanding";
import { clearTenantQueriesForOrganizationSwitch } from "../auth/tenant-query-cache";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { InvitationRow } from "../employees/InvitationRow";
import { UnfinishedSetupRow } from "../employees/UnfinishedSetupRow";
import {
  listAccountWorkspaces,
  loadAccountEverLinked,
  selectActiveWorkspace,
  supabaseClient,
} from "../lib/supabase";
import { CreateOrganizationButton } from "./CreateOrganizationButton";
import { endingFor } from "./WorkspaceStatusPage";
import {
  BusinessRow,
  PreBizFrame,
  Section,
  StatusBadge,
  roleLabel,
} from "./prebiz/PreBiz";

/**
 * Everything the account owns or owes, on one screen: the workspaces it can
 * work in, the invitations waiting for an answer, the setups it never finished,
 * and the way to start another one. Before this the same list lived on three
 * routes that each knew a third of it.
 */
export default function WorkspaceHubPage() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  // The empty hand has a second face: "ask your manager" after the account has
  // said it expects an invitation.
  const [expectingInvitation, setExpectingInvitation] = useState(false);

  const workspacesQuery = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });
  const invitationsQuery = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
  });
  const everLinkedQuery = useQuery({
    queryKey: ["account-ever-linked"],
    queryFn: () =>
      supabaseClient ? loadAccountEverLinked(supabaseClient) : false,
    staleTime: Infinity,
  });

  const workspaces = workspacesQuery.data ?? [];
  // A failed invitation load never hides the workspaces; it says so on its own.
  const invitations = invitationsQuery.data ?? [];
  const ready = readyWorkspaces(workspaces);
  const unfinished = unfinishedWorkspaces(workspaces).filter(
    (workspace) => workspace.status === "pending" || workspace.role === "owner",
  );
  // Three ways a workspace stops being somewhere to work, and the account is
  // owed a different sentence for each. They used to be filtered out of the
  // list entirely, which reads as the workspace having never existed.
  const ended = workspaces.filter((workspace) => endingFor(workspace) !== null);
  const openable = ready;
  const ownDraft =
    unfinished.find((workspace) => workspace.role === "owner") ?? null;

  const loading = workspacesQuery.isLoading || invitationsQuery.isLoading;

  // Arriving here because a sign-in had nowhere else to go, rather than because
  // somebody asked for the list. Only then may the hub forward on its own.
  const landing =
    (location.state as { landing?: boolean } | null)?.landing === true;
  // Nothing left to decide: there is no choice worth asking about, so the hub
  // hands the account to the workspace it used last (R4, R5). A cached empty
  // list must not do this before the refetch lands.
  const settled =
    (workspacesQuery.isSuccess || workspacesQuery.isError) &&
    (invitationsQuery.isSuccess || invitationsQuery.isError) &&
    !workspacesQuery.isFetching &&
    !invitationsQuery.isFetching;
  const onlyOne =
    settled &&
    landing &&
    ready.length >= 1 &&
    ended.length === 0 &&
    invitations.length === 0 &&
    unfinished.length === 0;
  useEffect(() => {
    if (!onlyOne) return;
    let live = true;
    void refresh().then((resolved) => {
      if (!live) return;
      navigate(resolveLanding({ workspaces: ready, context: resolved }).path, {
        replace: true,
      });
    });
    return () => {
      live = false;
    };
    // `ready` is derived from the query data this effect already depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyOne, navigate, refresh]);

  const open = async (workspace: WorkspaceSummary): Promise<void> => {
    setOpeningId(workspace.id);
    setFailedId(null);
    try {
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      if (supabaseClient)
        await selectActiveWorkspace(supabaseClient, workspace.id);
      const resolved = await refresh();
      await clearTenantQueriesForOrganizationSwitch(queryClient);
      navigate(
        resolveLanding({ workspaces: [workspace], context: resolved }).path,
        { replace: true },
      );
    } catch {
      // The server's own sentence is not for the screen; the row says it plainly.
      setFailedId(workspace.id);
    } finally {
      setOpeningId(null);
    }
  };

  if (loading || onlyOne)
    return <PreBizFrame titleId="hub-title" title="Checking your account" />;

  if (workspacesQuery.isError)
    return (
      <PreBizFrame titleId="hub-title" title="Your workspaces didn't load">
        <p className="form-error" role="alert">
          Your workspaces could not be loaded
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

  const nothingHere =
    openable.length === 0 &&
    ended.length === 0 &&
    unfinished.length === 0 &&
    invitations.length === 0;

  if (nothingHere && expectingInvitation)
    return (
      <PreBizFrame
        titleId="hub-title"
        // A failed check is not an answer: it must not read as "none".
        title={
          invitationsQuery.error ? "Invitations didn't load" : "No invitation yet"
        }
        description={
          invitationsQuery.error
            ? undefined
            : "Nothing has been sent to this address so far — ask your manager to invite this email."
        }
      >
        {invitationsQuery.error ? (
          <p className="form-error" role="alert">
            Invitations could not be loaded
          </p>
        ) : null}
        <div className="pb-footer">
          <Button
            className="pb-btn pb-btn-primary"
            disabled={invitationsQuery.isFetching}
            onClick={() => void invitationsQuery.refetch()}
          >
            {invitationsQuery.isFetching ? "Checking" : "Check again"}
          </Button>
          <Button
            className="pb-btn pb-btn-secondary"
            onClick={() => setExpectingInvitation(false)}
          >
            Back
          </Button>
        </div>
        <div className="pb-section">
          <h2>Your own workspace</h2>
          <CreateOrganizationButton className="pb-btn pb-btn-secondary pb-btn-block" />
        </div>
      </PreBizFrame>
    );

  if (nothingHere)
    return (
      <PreBizFrame
        titleId="hub-title"
        // Welcoming someone twice is the worse miss, so unknown history reads
        // as returning.
        title={
          everLinkedQuery.data === false ? "Welcome to Newfork" : "Welcome back"
        }
        description="Start your own workspace, or join one that invited you."
      >
        <div className="pb-stack">
          <CreateOrganizationButton className="pb-btn pb-btn-primary pb-btn-block" />
          <Button
            className="pb-btn pb-btn-secondary pb-btn-block"
            onClick={() => setExpectingInvitation(true)}
          >
            <MailCheck size={16} aria-hidden />
            {/* KARARLAR "Welcome back": someone welcomed before waits for another one. */}
            {everLinkedQuery.data === false
              ? "I am waiting for an invitation"
              : "I am waiting for another invitation"}
          </Button>
        </div>
      </PreBizFrame>
    );

  return (
    <PreBizFrame
      titleId="hub-title"
      title={
        invitations.length === 0
          ? "Your workspaces"
          : invitations.length === 1
            ? "You have an invitation"
            : `You have ${invitations.length} invitations`
      }
      description={
        invitations.length > 0
          ? "Declining can't be undone. Everything else keeps your progress."
          : undefined
      }
    >
      {invitationsQuery.error ? (
        <p className="form-error" role="alert">
          Invitations could not be loaded
        </p>
      ) : null}
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
      {openable.length > 0 ? (
        <Section title="Where you work">
          {openable.map((workspace) => {
            const opening = openingId === workspace.id;
            // The workspace this tab is in. `isActive` is the saved default,
            // which can be a different one.
            const current = context?.workspace.id === workspace.id;
            return (
              <BusinessRow
                key={workspace.id}
                name={workspace.name}
                role={roleLabel[workspace.role]}
                current={current}
                error={
                  failedId === workspace.id
                    ? "This workspace could not be opened"
                    : null
                }
              >
                <Button
                  className="pb-btn pb-btn-primary"
                  aria-label={`Open ${workspace.name}`}
                  disabled={opening}
                  onClick={() => void open(workspace)}
                >
                  {opening ? "Opening" : "Open"}
                </Button>
              </BusinessRow>
            );
          })}
        </Section>
      ) : null}
      {ended.length > 0 ? (
        <Section title="No longer open to you">
          {ended.map((workspace) => (
            <BusinessRow
              key={workspace.id}
              name={workspace.name}
              role={roleLabel[workspace.role]}
              badge={
                <StatusBadge tone="danger">
                  {endingLabel(endingFor(workspace))}
                </StatusBadge>
              }
            >
              <Button
                className="pb-btn pb-btn-secondary"
                aria-label={`Why ${workspace.name} is not open`}
                onClick={() => navigate(`/workspaces/status/${workspace.id}`)}
              >
                Why
              </Button>
            </BusinessRow>
          ))}
        </Section>
      ) : null}
      {/*
        An open invitation is the account's to answer before it owns a
        workspace, and an existing draft is already offered by its own row.
      */}
      {invitations.length === 0 && !ownDraft ? (
        <div className="pb-section">
          <h2>Your own workspace</h2>
          <CreateOrganizationButton className="pb-btn pb-btn-secondary pb-btn-block" />
        </div>
      ) : null}
    </PreBizFrame>
  );
}

function endingLabel(ending: ReturnType<typeof endingFor>): string {
  if (ending === "closed") return "Closed";
  if (ending === "access_removed") return "Access removed";
  return "On hold";
}
