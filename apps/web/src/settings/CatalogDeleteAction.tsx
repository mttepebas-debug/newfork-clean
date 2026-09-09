import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { deleteJob } from "./jobs-management-data";
import { organizationRequest } from "./organization-data";

export type CatalogKind =
  "jobs" | "departments" | "locations" | "shift-types" | "shift-labels";
const nouns: Record<CatalogKind, string> = {
  jobs: "job",
  departments: "department",
  locations: "location",
  "shift-types": "shift type",
  "shift-labels": "shift label",
};
const effects: Record<CatalogKind, string> = {
  jobs: "Employee assignments will be removed. Existing shifts are kept.",
  departments:
    "Jobs will move to No department. Employee assignments are kept.",
  locations:
    "Employee location assignments will be removed. Existing shifts are kept.",
  "shift-types":
    "This type will no longer be available for new shifts. Existing shifts are kept.",
  "shift-labels":
    "This label will no longer be available for new shifts. Existing shifts are kept.",
};

export function CatalogDeleteAction({
  kind,
  id,
  name,
  workspaceId,
  disabled = false,
  onDeleted,
  onLockChange,
  note,
}: {
  kind: CatalogKind;
  id: string;
  name: string;
  workspaceId: string;
  disabled?: boolean;
  note?: string;
  onDeleted: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [departmentJobs, setDepartmentJobs] = useState<"keep" | "delete">(
    "keep",
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const client = useQueryClient();
  const deletion = useMutation({
    mutationFn: () =>
      kind === "jobs"
        ? deleteJob(workspaceId, id)
        : organizationRequest(workspaceId, `/organization/${kind}/${id}`, {
            method: "DELETE",
            ...(kind === "departments"
              ? { body: JSON.stringify({ jobs: departmentJobs }) }
              : {}),
          }),
    onSuccess: async () => {
      await client.invalidateQueries({
        predicate: (query) => query.queryKey.includes(workspaceId),
      });
      onLockChange(false);
      onDeleted();
    },
  });
  useEffect(() => {
    if (!confirming) return;
    cancel.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!deletion.isPending) {
        setConfirming(false);
        onLockChange(false);
        requestAnimationFrame(() => trigger.current?.focus());
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [confirming, deletion.isPending, onLockChange]);
  function dismiss() {
    setConfirming(false);
    onLockChange(false);
    deletion.reset();
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <div className="catalog-delete-action" data-confirming={confirming}>
      {!confirming ? (
        <button
          ref={trigger}
          type="button"
          className="catalog-delete-trigger"
          disabled={disabled}
          onClick={() => {
            setConfirming(true);
            onLockChange(true);
          }}
        >
          <Trash2 size={14} aria-hidden /> Delete {nouns[kind]}
        </button>
      ) : (
        <div
          className="catalog-delete-confirm"
          role="group"
          aria-label={`Delete ${name}?`}
        >
          <div className="catalog-delete-copy" aria-live="polite">
            <strong>Delete “{name}”?</strong>
            <span>
              {kind === "departments" && departmentJobs === "delete"
                ? "Jobs and their employee assignments will be removed. Existing shifts are kept."
                : effects[kind]}{" "}
              {note}
            </span>
            {kind === "departments" && (
              <fieldset className="catalog-delete-options">
                <legend>Jobs in this department</legend>
                <label>
                  <input
                    type="radio"
                    name={`department-delete-${id}`}
                    checked={departmentJobs === "keep"}
                    disabled={deletion.isPending}
                    onChange={() => setDepartmentJobs("keep")}
                  />
                  Keep jobs in No department
                </label>
                <label>
                  <input
                    type="radio"
                    name={`department-delete-${id}`}
                    checked={departmentJobs === "delete"}
                    disabled={deletion.isPending}
                    onChange={() => setDepartmentJobs("delete")}
                  />
                  Delete jobs too
                </label>
              </fieldset>
            )}
            {deletion.isError && (
              <span role="alert">{deletion.error.message}</span>
            )}
          </div>
          <div className="catalog-delete-buttons">
            <button
              ref={cancel}
              type="button"
              className="job-secondary-button"
              disabled={deletion.isPending}
              onClick={dismiss}
            >
              Keep {nouns[kind]}
            </button>
            <button
              type="button"
              className="catalog-delete-confirm-button"
              disabled={deletion.isPending}
              onClick={() => deletion.mutate()}
            >
              {deletion.isPending ? "Deleting…" : `Delete ${nouns[kind]}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
