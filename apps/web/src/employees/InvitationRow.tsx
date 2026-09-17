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
  notice = false,
}: {
  readonly invitation: AccountPendingInvitation;
  /** Render as an `.account-notice` banner (account pages) instead of a list row. */
  readonly notice?: boolean;
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

  const actions = (
    <div className="workspace-row-actions">
      <Button
        className={notice ? "primary-button compact-button" : "compact-button"}
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
  );
  const error = failure ? (
    <p className="form-error" role="alert">
      {failure instanceof Error ? failure.message : "Invitation update failed"}
    </p>
  ) : null;

  if (notice) {
    return (
      <div
        className="account-notice workspace-transfer-banner"
        role="region"
        aria-label={`Invitation to ${invitation.workspaceName}`}
      >
        <strong>Invitation · {invitation.workspaceName}</strong>
        <p>
          You were invited to join this organization. Declining cannot be
          undone.
        </p>
        {error}
        {actions}
      </div>
    );
  }

  return (
      <div className="workspace-row" role="listitem">
        <div>
          <strong>{invitation.workspaceName}</strong>
          <span>
            Invitation · expires{" "}
            {new Date(invitation.expiresAt).toLocaleDateString()}
          </span>
          {error}
        </div>
        {actions}
      </div>
  );
}
