import type { EmployeeHubReadModel } from "@newfork/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { actOnEmployeeRequest } from "../employee-hub-data";
import { refreshExchangeSurfaces } from "./exchange-data";

/** Historical requests keep their original assignment outcome and audit trail. */
export function EarlierShiftRequests({
  model,
  refresh,
}: {
  model: EmployeeHubReadModel;
  refresh: () => void;
}) {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const requests = model.requests.filter(
    (request) => request.kind !== "time_off",
  );
  const action = useMutation({
    mutationFn: (request: EmployeeHubReadModel["requests"][number]) =>
      actOnEmployeeRequest(model.workspace_id, {
        kind: "shift_change",
        action: "cancel",
        request_id: request.id,
        expected_revision: request.revision,
      }),
    onSuccess: async () => {
      refresh();
      await refreshExchangeSurfaces(client, model.workspace_id);
    },
  });
  if (!requests.length) return null;
  return (
    <details
      className="sx-root sx-history"
      open={Boolean(params.get("request"))}
    >
      <summary>Earlier shift requests ({requests.length})</summary>
      <p>
        These requests were created in the earlier workflow. Check your current
        schedule for your assignment. Cancel a pending request before starting a
        new cover or swap search.
      </p>
      {requests.map((request) => (
        <article
          className="sx-card"
          key={request.id}
          id={`request-${request.id}`}
        >
          <strong>{request.title}</strong>
          <p>{request.detail}</p>
          <p>{request.status.replaceAll("_", " ")}</p>
          {request.can_cancel && (
            <button
              disabled={action.isPending}
              onClick={() => action.mutate(request)}
            >
              Cancel earlier request
            </button>
          )}
          {request.can_respond && (
            <p>
              This earlier invitation needs review by your manager before a new
              request can proceed.
            </p>
          )}
        </article>
      ))}
      {action.error && <p role="alert">{action.error.message}</p>}
      {action.isSuccess && (
        <p role="status">
          Earlier request cancelled. Your current assignment has not changed.
        </p>
      )}
    </details>
  );
}
