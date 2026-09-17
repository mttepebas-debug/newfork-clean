import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { listPendingEmployeeInvitations } from "../employees/employee-data";
import { invitationsCheckedStorageKey } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import { WorkspaceSetupPending } from "./WorkspaceSetupPending";

type WorkspaceRequirement = "none" | "any" | "complete";

export function ProtectedRoute({
  children,
  workspace = "none",
}: {
  readonly children: ReactNode;
  readonly workspace?: WorkspaceRequirement;
}) {
  const { authenticated, context, error, ready, refresh, signOut } = useAuth();
  const location = useLocation();
  // Once per tab session after login: a member with a new invitation sees it
  // before landing. No polling, no recheck on focus.
  const checkInvitations =
    ready &&
    authenticated &&
    workspace !== "none" &&
    context !== null &&
    window.sessionStorage.getItem(invitationsCheckedStorageKey) === null;
  const invitations = useQuery({
    queryKey: ["account-pending-invitations"],
    queryFn: listPendingEmployeeInvitations,
    enabled: checkInvitations,
    retry: false,
  });
  const invitationsSettled = invitations.isSuccess || invitations.isError;
  useEffect(() => {
    // A failed check never blocks the app.
    if (checkInvitations && invitationsSettled)
      window.sessionStorage.setItem(invitationsCheckedStorageKey, "1");
  }, [checkInvitations, invitationsSettled]);

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
        <main className="auth-recovery" aria-labelledby="workspace-error-title">
          <section className="sign-in-panel">
            <p className="product-mark">NEWFORK</p>
            <h1 id="workspace-error-title">Workspace unavailable</h1>
            <p className="muted">
              Your account is signed in, but the workspace could not be loaded.
            </p>
            <p className="form-error" role="alert">
              {error}
            </p>
            <div className="auth-recovery-actions">
              <button
                className="nf-button"
                type="button"
                onClick={() => void refresh()}
              >
                Try again
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          </section>
        </main>
      );
    }
    return <Navigate to="/invitations/pending" replace />;
  }
  if (checkInvitations) {
    if (!invitationsSettled)
      return <main className="auth-loading" aria-label="Loading workspace" />;
    if (
      (invitations.data?.length ?? 0) > 0 &&
      location.pathname !== "/invitations/pending"
    )
      return <Navigate to="/invitations/pending" replace />;
  }
  if (
    workspace !== "none" &&
    context &&
    context.onboarding.status !== "complete"
  ) {
    // Setup belongs to the owner. Other members can be active before it is
    // finished (the owner invites the team in the last step) and wait here,
    // also when they open /onboarding directly.
    if (context.membership.role !== "owner") return <WorkspaceSetupPending />;
    if (workspace === "complete") return <Navigate to="/onboarding" replace />;
  }
  return children;
}
