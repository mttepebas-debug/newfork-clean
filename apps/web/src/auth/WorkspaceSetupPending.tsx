import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { listAccountWorkspaces, supabaseClient } from "../lib/supabase";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import { useAuth } from "./AuthContext";
import { hubPath } from "./resolveLanding";

/** Shown to a non-owner member while the owner has not finished business setup. */
export function WorkspaceSetupPending() {
  const { context, refresh } = useAuth();
  const navigate = useNavigate();
  const workspaces = useQuery({
    queryKey: ["account-workspaces"],
    queryFn: () => (supabaseClient ? listAccountWorkspaces(supabaseClient) : []),
  });
  // With a single business the switcher would only lead back here.
  const canSwitchOrganization = (workspaces.data?.length ?? 0) > 1;
  const name = context?.workspace.name;

  return (
    <PreBizFrame
      titleId="workspace-setup-title"
      title="Almost ready"
      description={`${name ?? "The workspace"} is still being set up. You'll get access the moment the owner finishes.`}
    >
      <div className="pb-footer">
        <button
          className="pb-btn pb-btn-primary"
          type="button"
          onClick={() => void refresh()}
        >
          Check again
        </button>
        {canSwitchOrganization ? (
          <button
            className="pb-btn pb-btn-secondary"
            type="button"
            onClick={() => navigate(hubPath)}
          >
            Choose a workspace
          </button>
        ) : null}
      </div>
    </PreBizFrame>
  );
}
