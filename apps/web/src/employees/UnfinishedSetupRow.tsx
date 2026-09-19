import type { WorkspaceSummary } from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import {
  requestWorkspaceClosure,
  setTabWorkspaceId,
  supabaseClient,
} from "../lib/supabase";
import { BusinessRow, StatusBadge, roleLabel } from "../shell/prebiz/PreBiz";
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
  // Only the owner can finish or delete a business's setup. Another member of
  // that business can only open it and wait, so it gets no Discard: the server
  // would refuse it every time.
  const ownSetup = !employer || workspace.role === "owner";

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
    <BusinessRow
      name={workspace.name}
      role={roleLabel[workspace.role]}
      badge={
        <StatusBadge tone="progress">
          {employer ? "Setup in progress" : "Onboarding in progress"}
        </StatusBadge>
      }
      error={
        discard.error
          ? // Deleting a business needs a sign-in from the last ten minutes. The
            // server's sentence only picks the state; the row says what to do.
            discard.error.message === "Recent reauthentication required"
            ? "Sign in again to discard this setup"
            : "Setup could not be updated"
          : null
      }
    >
      {ownSetup ? (
        <ConfirmButton
          className="pb-btn pb-btn-danger"
          aria-label={
            employer
              ? `Discard setup for ${workspace.name}`
              : `Decline onboarding for ${workspace.name}`
          }
          // Discarding deletes the draft business, so the armed label says so.
          confirmLabel={
            employer ? "Click again to delete" : "Click again to decline"
          }
          disabled={discard.isPending}
          onConfirm={() => discard.mutate()}
        >
          {employer ? "Discard" : "Decline"}
        </ConfirmButton>
      ) : null}
      <Button
        className="pb-btn pb-btn-primary"
        aria-label={
          !ownSetup
            ? `Open ${workspace.name}`
            : employer
              ? `Continue setup for ${workspace.name}`
              : `Continue onboarding for ${workspace.name}`
        }
        disabled={discard.isPending}
        onClick={resume}
      >
        {ownSetup ? "Continue" : "Open"}
      </Button>
    </BusinessRow>
  );
}
