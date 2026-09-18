import type { AccountPendingInvitation } from "@newfork/shared";
import { Button, ConfirmButton } from "@newfork/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { BusinessRow, StatusBadge } from "../shell/prebiz/PreBiz";
import {
  acceptPendingEmployeeInvitation,
  declinePendingEmployeeInvitation,
} from "./employee-data";

export function InvitationRow({
  invitation,
  kit = false,
}: {
  readonly invitation: AccountPendingInvitation;
  /** UI-PRE-001 Faz 1: render with the shared kit instead of the legacy row. */
  readonly kit?: boolean;
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

  if (kit) {
    const days = Math.max(
      0,
      Math.ceil((Date.parse(invitation.expiresAt) - Date.now()) / 86_400_000),
    );
    return (
      <BusinessRow
        name={invitation.workspaceName}
        role="Invitation"
        badge={
          <StatusBadge tone={days <= 2 ? "progress" : "neutral"}>
            Expires{" "}
            {new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
              days,
              "day",
            )}
          </StatusBadge>
        }
        error={
          failure
            ? failure instanceof Error
              ? failure.message
              : "Invitation update failed"
            : null
        }
      >
        <ConfirmButton
          className="pb-btn pb-btn-danger"
          aria-label={`Decline invitation to ${invitation.workspaceName}`}
          confirmLabel="Click again to decline"
          disabled={busy}
          onConfirm={() => decline.mutate(invitation.id)}
        >
          Decline
        </ConfirmButton>
        <Button
          className="pb-btn pb-btn-primary"
          aria-label={`Join ${invitation.workspaceName}`}
          disabled={busy}
          onClick={() => accept.mutate(invitation.id)}
        >
          Join
        </Button>
      </BusinessRow>
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
