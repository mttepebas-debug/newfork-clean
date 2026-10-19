import { Button } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { markInvitationPromptAnswered } from "../auth/invitation-prompt";
import {
  hubPath,
  readyWorkspaces,
  resolveLanding,
  unfinishedWorkspaces,
} from "../auth/resolveLanding";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { InvitationRow } from "../employees/InvitationRow";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import { PreBizFrame, Section } from "./prebiz/PreBiz";

/**
 * "Active invitation found": the first screen of an open of the app while an
 * invitation waits (KARARLAR "Girişten sonra yönlendirme", görünüm A, Mert
 * 2026-10-05; BL-624). One column, a row per invitation; "Not now" goes to the
 * one workspace, or to Workspaces where there are several to choose from, and
 * is not offered to somebody with no workspace: the invitation comes first.
 */
export default function InvitationPromptPage() {
  const { account, context } = useAuth();
  const answer = (): void => markInvitationPromptAnswered(account?.userId);
  const navigate = useNavigate();
  const location = useLocation();
  // The page a link opened, when it was one; a plain open of the app is not.
  const requested = (location.state as { from?: string } | null)?.from;
  const from =
    requested && requested !== "/app" && requested !== hubPath
      ? requested
      : null;

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
  // Somewhere of its own to go: a workspace to work in or a setup to finish.
  const hasSomewhere =
    ready.length > 0 || unfinishedWorkspaces(workspaces).length > 0;

  const landing = (): string =>
    from ??
    (ready.length > 1
      ? hubPath
      : resolveLanding({ workspaces, context }).path);

  // The last invitation answered: nothing is left to put first in this open.
  const allAnswered =
    invitationsQuery.isSuccess &&
    !invitationsQuery.isFetching &&
    workspacesQuery.isSuccess &&
    invitations.length === 0;
  useEffect(() => {
    if (!allAnswered) return;
    answer();
    navigate(landing(), { replace: true });
    // `landing` reads the query data this effect already waits for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAnswered, navigate]);

  if (workspacesQuery.isPending || invitationsQuery.isPending || allAnswered)
    return <PreBizFrame titleId="invitations-title" title="Checking your account" />;

  const notNow = (): void => {
    answer();
    navigate(landing(), { replace: true });
  };

  const goesTo = from
    ? "Takes you back to the page you opened. The invitation stays listed in Workspaces."
    : ready.length === 1
      ? `Takes you to ${ready[0]!.name}. The invitation stays listed in Workspaces.`
      : "Takes you to Workspaces, where the invitation stays listed.";

  return (
    <PreBizFrame
      titleId="invitations-title"
      title={
        invitations.length > 1
          ? "Active invitations found"
          : "Active invitation found"
      }
    >
      {invitationsQuery.error ? (
        <p className="form-error" role="alert">
          Invitations could not be loaded
        </p>
      ) : null}
      <Section title="Invitations">
        {invitations.map((invitation) => (
          <InvitationRow
            key={invitation.id}
            invitation={invitation}
            onAccepted={answer}
          />
        ))}
      </Section>
      {hasSomewhere ? (
        <div className="pb-stack">
          <Button className="pb-btn pb-btn-secondary" onClick={notNow}>
            Not now
          </Button>
          <p className="pb-description">{goesTo}</p>
        </div>
      ) : null}
    </PreBizFrame>
  );
}
