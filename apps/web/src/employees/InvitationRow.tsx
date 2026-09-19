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

  // Floor, so the label errs toward urgency: three hours left reads "today".
  const days = Math.max(
    0,
    Math.floor((Date.parse(invitation.expiresAt) - Date.now()) / 86_400_000),
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
      error={failure ? "Invitation update failed" : null}
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
