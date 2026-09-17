import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import { useAuth } from "./AuthContext";

/** Shown to a non-owner member while the owner has not finished workspace setup. */
export function WorkspaceSetupPending() {
  const { context, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () =>
      supabaseClient ? listAccountWorkspaces(supabaseClient) : [],
  });
  // With a single workspace the switcher would only lead back here.
  const canSwitchOrganization = (workspaces.data?.length ?? 0) > 1;

  return (
    <main className="sign-in-page" aria-labelledby="workspace-setup-title">
      <section className="sign-in-panel">
        <p className="product-mark">NEWFORK</p>
        <h1 id="workspace-setup-title">Workspace setup in progress</h1>
        <p className="muted">
          The owner has not finished setting up{" "}
          {context?.workspace.name ?? "this workspace"}. You will get access
          when setup is complete.
        </p>
        <div className="auth-recovery-actions">
          <button
            className="nf-button"
            type="button"
            onClick={() => void refresh()}
          >
            Check again
          </button>
          {canSwitchOrganization ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => navigate("/organization-switcher")}
            >
              Switch organization
            </button>
          ) : null}
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
