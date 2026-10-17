import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  previewPolicyDefinition,
  applyPolicyDefinition,
} from "../settings/signature-templates-data";
import { errorText } from "../settings/GeneralSettingsPage";
import { FieldNote } from "../shell/FieldNote";

export function DocumentDefinitionApply({
  workspaceId,
  id,
  disabled,
  onBusyChange,
}: {
  workspaceId: string;
  id: string;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const cache = useQueryClient();
  const preview = useMutation({
    mutationFn: () => previewPolicyDefinition(workspaceId, id),
  });
  const apply = useMutation({
    mutationFn: () =>
      applyPolicyDefinition(workspaceId, id, {
        revision: preview.data!.revision,
        preview_token: preview.data!.preview_token,
        reason: reason.trim(),
      }),
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onSuccess: async () => {
      preview.reset();
      setReason("");
      await cache.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "document-lifecycle" &&
          q.queryKey.includes(workspaceId),
      });
    },
  });
  const changed =
    preview.data?.employees.filter((item) => item.action !== "unchanged") ?? [];
  return (
    <section aria-label="Apply document definition">
      <h3>Apply to existing assignments</h3>
      <p>
        Review the effect on employees in your scope before changing their
        current requirements.
      </p>
      <button
        type="button"
        className="job-secondary-button"
        disabled={disabled || preview.isPending || apply.isPending}
        onClick={() => {
          apply.reset();
          preview.mutate();
        }}
      >
        Preview impact
      </button>
      {preview.data && !disabled && (
        <>
          <ul>
            {changed.map((item) => (
              <li key={item.employee_id}>
                {item.employee_name} ·{" "}
                {item.action === "exempt" ? "Exemption kept" : item.action} ·{" "}
                {item.deadline_action === "restart"
                  ? "Full configured period, unless an approved version is still valid"
                  : item.deadline_action === "clear"
                    ? "No delivery countdown"
                    : "Current deadline kept"}
              </li>
            ))}
          </ul>
          {!changed.length ? (
            <p>No changes to existing assignments.</p>
          ) : (
            <>
              <label className="job-field">
                <span>Reason for applying</span>
                <textarea
                  maxLength={500}
                  value={reason}
                  disabled={apply.isPending}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="job-primary-button"
                disabled={
                  apply.isPending ||
                  !reason.trim() ||
                  !changed.some((item) => item.action !== "exempt")
                }
                onClick={() => apply.mutate()}
              >
                Apply changes
              </button>
            </>
          )}
        </>
      )}
      {apply.isSuccess && <p role="status">Changes applied</p>}
      <FieldNote
        id={`document-apply-${id}`}
        lines={2}
        error={preview.error || apply.error ? errorText(preview.error || apply.error) : null}
      />
    </section>
  );
}
