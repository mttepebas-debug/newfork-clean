import { timeOffOpenedShiftCount } from "@newfork/shared";
import { Button, ConfirmButton, toast } from "@newfork/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { refreshExchangeSurfaces } from "../employee-hub/shift-exchanges/exchange-data";
import { getTimeOffQueue, isStaleTimeOff, useVoteOnTimeOff } from "../schedule/requests-data";
import { notificationKeys } from "./notifications-data";

type Verdict = "approve" | "deny";

/**
 * Approve or decline a time off request from its notice, through the endpoint
 * Requests uses (FB-6.3). The verdict names the impact the manager saw, so the
 * request is read first. Where Requests would ask first (an approval that
 * opens shifts, or an admin's or owner's decision alone), the row opens the
 * request there instead of deciding here.
 */
export function TimeOffDecision({
  workspaceId,
  requestId,
  onOpen,
}: {
  readonly workspaceId: string;
  readonly requestId: string;
  /** Opens the request in Requests (the row's own link). */
  readonly onOpen: () => void;
}) {
  const client = useQueryClient();
  const vote = useVoteOnTimeOff(workspaceId);
  const [busy, setBusy] = useState<Verdict | null>(null);

  async function decide(verdict: Verdict) {
    setBusy(verdict);
    try {
      const queue = await getTimeOffQueue(workspaceId, "needs_review", { locationId: "", search: "" });
      const request = queue.requests.find((candidate) => candidate.id === requestId);
      const progress = request?.progress;
      if (!request || request.status !== "pending") {
        toast.success("This request was already decided.");
        return;
      }
      const mayVote = Boolean(progress && (progress.can_vote || progress.can_decide_alone));
      const asks =
        !progress?.impact ||
        progress.can_decide_alone ||
        (verdict === "approve" && progress.my_approval_finalizes && timeOffOpenedShiftCount(progress) > 0);
      if (!mayVote || asks) {
        onOpen();
        return;
      }
      const result = await vote.mutateAsync({
        requestId,
        verdict: { verdict, note: "", expected_impact: progress.impact!.fingerprint },
      });
      const cancellation = request.request_type === "time_off_cancellation";
      toast.success(
        verdict === "deny"
          ? cancellation ? "Cancellation declined." : "Time off declined."
          : result.final
            ? cancellation ? "Cancellation approved." : "Time off approved."
            : `Approved. ${result.remaining} more ${result.remaining === 1 ? "approval" : "approvals"} needed.`,
      );
      await refreshExchangeSurfaces(client, workspaceId);
    } catch (error) {
      if (isStaleTimeOff(error)) toast.error("This request changed. Review it again.");
      else toast.error(error instanceof Error ? error.message : "Decision failed");
    } finally {
      setBusy(null);
      await client.invalidateQueries({ queryKey: notificationKeys.all(workspaceId) });
    }
  }

  return (
    <div className="ni-row-actions">
      <Button disabled={busy !== null} onClick={() => void decide("approve")}>
        {busy === "approve" ? "Approving..." : "Approve"}
      </Button>
      <ConfirmButton
        className="danger-button"
        confirmLabel="Confirm decline"
        disabled={busy !== null}
        onConfirm={() => void decide("deny")}
      >
        {busy === "deny" ? "Declining..." : "Decline"}
      </ConfirmButton>
    </div>
  );
}
