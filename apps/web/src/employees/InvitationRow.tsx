import type { AccountPendingInvitation } from "@newfork/shared";
import { Button } from "@newfork/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  acceptPendingEmployeeInvitation,
  declinePendingEmployeeInvitation,
} from "./employee-data";

export function InvitationRow({
  invitation,
}: {
  readonly invitation: AccountPendingInvitation;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["account-pending-invitations"],
      }),
      queryClient.invalidateQueries({ queryKey: ["account-workspaces"] }),
    ]);
  const accept = useMutation({
    mutationFn: acceptPendingEmployeeInvitation,
    onSuccess: (workspaceId) => {
      void invalidate();
      navigate(`/welcome/${workspaceId}`, { replace: true });
    },
  });
  const decline = useMutation({
    mutationFn: declinePendingEmployeeInvitation,
    onSuccess: invalidate,
  });
  const busy = accept.isPending || decline.isPending;
  const failure = accept.error ?? decline.error;

  return (
    <div className="workspace-row" role="listitem">
      <div>
        <strong>{invitation.workspaceName}</strong>
        <span>
          Invitation · expires{" "}
          {new Date(invitation.expiresAt).toLocaleDateString()}
        </span>
        {failure ? (
          <p className="form-error" role="alert">
            {failure instanceof Error
              ? failure.message
              : "Invitation update failed"}
          </p>
        ) : null}
      </div>
      <div className="workspace-row-actions">
        <Button
          className="compact-button"
          type="button"
          aria-label={`Join ${invitation.workspaceName}`}
          disabled={busy}
          onClick={() => accept.mutate(invitation.id)}
        >
          Join
        </Button>
        <Button
          className="secondary-button compact-button"
          type="button"
          aria-label={`Decline invitation to ${invitation.workspaceName}`}
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Declining this invitation cannot be undone. You will need a new invitation to join later.",
              )
            ) {
              decline.mutate(invitation.id);
            }
          }}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
