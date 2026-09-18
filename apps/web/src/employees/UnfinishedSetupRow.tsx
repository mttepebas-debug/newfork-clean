import type { WorkspaceSummary } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  requestWorkspaceClosure,
  setTabWorkspaceId,
  supabaseClient,
} from "../lib/supabase";
import { getMyOnboarding, leaveMyOnboarding } from "./onboarding-data";

/**
 * A setup the account started and never finished. An employee case is left
 * behind; an employer draft is discarded with the workspace it created.
 */
export function UnfinishedSetupRow({
  workspace,
}: {
  readonly workspace: WorkspaceSummary;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const employer = workspace.status === "active";

  const discard = useMutation({
    mutationFn: async () => {
      if (!supabaseClient) throw new Error("Account storage is not configured");
      if (employer) {
        await requestWorkspaceClosure(supabaseClient, {
          workspaceId: workspace.id,
          mode: "immediate",
          typedWorkspaceName: workspace.name,
        });
        return;
      }
      // The leave command is revision guarded, so read the case first.
      const onboarding = await getMyOnboarding(workspace.id);
      await leaveMyOnboarding(workspace.id, onboarding.revision);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["account-workspaces"],
      });
      await refresh();
    },
  });

  const resume = (): void => {
    if (!employer) {
      navigate(`/welcome/${workspace.id}`);
      return;
    }
    setTabWorkspaceId(workspace.id);
    void refresh().then(() => navigate("/onboarding"));
  };

  return (
    <div className="workspace-row" role="listitem">
      <div>
        <strong>{workspace.name}</strong>
        <span>
          {employer ? "Setup in progress" : "Onboarding in progress"} ·{" "}
          {workspace.role}
        </span>
        {discard.error ? (
          <p className="form-error" role="alert">
            {discard.error instanceof Error
              ? discard.error.message
              : "Setup could not be updated"}
          </p>
        ) : null}
      </div>
      <div className="workspace-row-actions">
        <Button
          className="compact-button"
          type="button"
          aria-label={
            employer
              ? `Continue setup for ${workspace.name}`
              : `Continue onboarding for ${workspace.name}`
          }
          disabled={discard.isPending}
          onClick={resume}
        >
          {employer ? "Continue setup" : "Continue onboarding"}
        </Button>
        <Button
          className="secondary-button compact-button"
          type="button"
          aria-label={
            employer
              ? `Discard setup for ${workspace.name}`
              : `Decline onboarding for ${workspace.name}`
          }
          disabled={discard.isPending}
          onClick={() => {
            if (
              window.confirm(
                employer
                  ? `Discarding removes ${workspace.name} and everything entered during setup. This cannot be undone.`
                  : `Declining leaves this onboarding. You will need a new invitation to join ${workspace.name} later.`,
              )
            ) {
              discard.mutate();
            }
          }}
        >
          {employer ? "Discard" : "Decline"}
        </Button>
      </div>
    </div>
  );
}
