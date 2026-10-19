import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import { useAuth } from "./AuthContext";
import {
  invitationPromptAnswered,
  markInvitationPromptAnswered,
} from "./invitation-prompt";
import { hubPath, invitationsPath } from "./resolveLanding";
import { WorkspaceSetupPending } from "./WorkspaceSetupPending";
import { membershipClass } from "./access";

type WorkspaceRequirement = "none" | "any" | "complete";

export function ProtectedRoute({
  children,
  workspace = "none",
  askInvitations = true,
}: {
  readonly children: ReactNode;
  readonly workspace?: WorkspaceRequirement;
  /** False on the pages that are themselves the answer to an invitation. */
  readonly askInvitations?: boolean;
}) {
  const { account, authenticated, context, error, ready, refresh } = useAuth();
  const location = useLocation();
  // A waiting invitation is the first screen of every open of the app, also
  // for somebody with a workspace to land in (KARARLAR "Girişten sonra
  // yönlendirme", BL-624). Asked once per open; "Not now" there ends it.
  const answered = invitationPromptAnswered(account?.userId);
  // Only a page this route will show asks; one it hands on lets the next ask.
  const handsOn =
    workspace !== "none" &&
    (!context ||
      (context.onboarding.status !== "complete" &&
        (membershipClass(context.membership) !== "owner" ||
          workspace === "complete")));
  // Without the account's id the answer could not be kept, and "Not now" would
  // bring the screen straight back: such an open is not asked.
  const asking =
    ready &&
    authenticated &&
    Boolean(account?.userId) &&
    askInvitations &&
    !answered &&
    !handsOn;
  const invitations = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
    enabled: asking,
  });
  const nothingWaiting =
    asking && invitations.isSuccess && invitations.data.length === 0;
  useEffect(() => {
    if (nothingWaiting) markInvitationPromptAnswered(account?.userId);
  }, [nothingWaiting, account?.userId]);

  if (!ready)
    return <main className="auth-loading" aria-label="Loading workspace" />;

  if (!authenticated) {
    return (
      <Navigate
        to="/sign-in"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (workspace !== "none" && !context) {
    if (error) {
      return (
        // Sign out lives in the frame's account block, so this is not a dead end.
        <PreBizFrame
          titleId="workspace-error-title"
          title="That workspace didn't load"
          // The server's own sentence is not for the screen. It said things like
          // "invalid session or membership", which reads as an accusation and
          // tells nobody what to do next.
          description="Something went wrong on our side, not yours. Try again, or pick a different workspace."
        >
          <div className="pb-footer">
            <button
              className="pb-btn pb-btn-primary"
              type="button"
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </div>
        </PreBizFrame>
      );
    }
    // Landing, not a deliberate visit: the hub may hand the account straight
    // to a workspace instead of asking which one.
    return <Navigate to={hubPath} replace state={{ landing: true }} />;
  }
  if (
    workspace !== "none" &&
    context &&
    context.onboarding.status !== "complete"
  ) {
    // Setup belongs to the owner. Other members can be active before it is
    // finished (the owner invites the team in the last step) and wait here,
    // also when they open /onboarding directly.
    if (membershipClass(context.membership) !== "owner") return <WorkspaceSetupPending />;
    if (workspace === "complete") return <Navigate to={hubPath} replace />;
  }
  if (asking) {
    // A failed read never stands in the way of the page; the next one asks again.
    if (invitations.isPending)
      return <main className="auth-loading" aria-label="Loading workspace" />;
    if (invitations.isSuccess && invitations.data.length > 0)
      return (
        <Navigate
          to={invitationsPath}
          replace
          state={{ from: `${location.pathname}${location.search}` }}
        />
      );
  }
  return children;
}
